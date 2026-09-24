//! Rdzeń danych na żywo: ingest hooków, obserwacja plików, odtworzenie stanu po starcie i zegar.
use crate::claude::{self, hook::TaskTracker, HookEnvelope};
use crate::endpoint::Endpoint;
use crate::ingest::{Incoming, Ingest};
use crate::model::Event;
use crate::pid;
use crate::rehydrate::{keep_for_rehydration, recent_files};
use crate::store::{Store, Timing};
use crate::watch::{watch, Sources};
use anyhow::Context as _;
use std::fs::File;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::mpsc::{channel, Receiver};
use std::time::Duration;

pub struct RuntimeConfig {
    pub home: PathBuf,
    pub endpoint_path: PathBuf,
    /// Opcjonalny zapis znormalizowanych zdarzeń (JSONL), jak `pets-cli run --record`.
    pub record: Option<File>,
    /// Pliki `plan-usage-history.json` aplikacji Claude (limity konta bez CLI).
    pub claude_usage_files: Vec<PathBuf>,
}

impl RuntimeConfig {
    pub fn from_env() -> anyhow::Result<Self> {
        Ok(RuntimeConfig {
            home: dirs::home_dir().context("brak katalogu domowego")?,
            endpoint_path: Endpoint::default_path(),
            record: None,
            claude_usage_files: claude::desktop_usage::candidate_files(
                &dirs::data_local_dir().unwrap_or_default(), &dirs::config_dir().unwrap_or_default()),
        })
    }
}

pub struct Runtime {
    store: Store,
    sources: Sources,
    tasks: TaskTracker,
    record: Option<File>,
    hooks: Receiver<Incoming>,
    files: Option<Receiver<PathBuf>>,
    usage: claude::desktop_usage::Poller,
    _ingest: Ingest,
    _watcher: Option<notify::RecommendedWatcher>,
}

impl Runtime {
    pub fn start(cfg: RuntimeConfig) -> anyhow::Result<Runtime> {
        let (tx, hooks) = channel();
        let ingest = Ingest::start(Endpoint::new_token(), tx)?;
        ingest.endpoint().write(&cfg.endpoint_path).context("zapis endpoint.json")?;
        let mut rt = Runtime {
            store: Store::new(Timing::default()), sources: Sources::new(), tasks: TaskTracker::default(),
            record: cfg.record, hooks, files: None, usage: claude::desktop_usage::Poller::new(cfg.claude_usage_files), _ingest: ingest, _watcher: None,
        };
        let roots = [cfg.home.join(".claude").join("projects"), cfg.home.join(".codex").join("sessions")];
        // Odtworzenie stanu: żywe sesje Claude'a z rejestru, potem ich transkrypty i rollouty Codexa.
        let live: Vec<_> = claude::registry::read_registry(&cfg.home.join(".claude").join("sessions"))
            .into_iter().filter(|s| pid::is_alive(s.pid)).collect();
        for s in &live { rt.apply(s.to_event()); }
        let live_ids = live.iter().map(|s| s.session_id.clone()).collect();
        let recent: Vec<PathBuf> = roots.iter().flat_map(|r| recent_files(r, Duration::from_secs(1800))).collect();
        for f in keep_for_rehydration(&recent, &live_ids) { rt.poll_file(&f); }
        if let Some(e) = rt.usage.poll(crate::time::now_ms()) { rt.apply(e); }
        let (ftx, files) = channel();
        rt._watcher = Some(watch(&roots, ftx)?);
        rt.files = Some(files);
        Ok(rt)
    }

    pub fn store(&self) -> &Store { &self.store }

    /// Przetwarza zaległe zdarzenia i przesuwa zegar. Zwraca `true`, gdy stan się zmienił.
    pub fn step(&mut self, now: i64) -> bool {
        let mut changed = false;
        while let Ok(msg) = self.hooks.try_recv() {
            changed |= match msg {
                Incoming::ClaudeHook(env) => self.on_hook(env),
                Incoming::ClaudeStatusline(s) => claude::statusline::to_events(&s).into_iter().fold(false, |c, e| self.apply(e) | c),
            };
        }
        let paths: Vec<PathBuf> = self.files.as_ref().map(|rx| rx.try_iter().collect()).unwrap_or_default();
        for p in paths { changed |= self.poll_file(&p); }
        if let Some(e) = self.usage.poll(now) { changed |= self.apply(e); }
        changed |= !self.store.tick(now, &pid::is_alive).is_empty();
        changed
    }

    fn apply(&mut self, e: Event) -> bool {
        if let Some(f) = &mut self.record { let _ = writeln!(f, "{}", serde_json::to_string(&e).unwrap_or_default()); }
        !self.store.apply(&e).is_empty()
    }

    fn poll_file(&mut self, p: &Path) -> bool {
        let mut changed = false;
        if self.sources.track(p, true) { for e in self.sources.poll(p) { changed |= self.apply(e); } }
        changed
    }

    fn on_hook(&mut self, env: HookEnvelope) -> bool {
        let mut changed = false;
        if let Some(tp) = claude::hook::transcript_path(&env) { changed |= self.poll_file(&tp); }
        for e in claude::hook::to_events(&env) { changed |= self.apply(e); }
        if let Some(e) = self.tasks.observe(&env) { changed |= self.apply(e); }
        changed
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::endpoint::Endpoint;
    use crate::model::{Agent, Origin};
    use std::time::{Duration, Instant};

    fn home() -> tempfile::TempDir {
        let d = tempfile::tempdir().unwrap();
        for p in [".claude/projects", ".claude/sessions", ".codex/sessions/2026/09/24"] {
            std::fs::create_dir_all(d.path().join(p)).unwrap();
        }
        d
    }

    fn cfg(h: &tempfile::TempDir) -> RuntimeConfig {
        RuntimeConfig { home: h.path().into(), endpoint_path: h.path().join("endpoint.json"), record: None,
            claude_usage_files: vec![h.path().join("Claude").join(claude::desktop_usage::FILE)] }
    }

    #[test]
    fn claude_desktop_usage_file_reaches_limits() {
        let h = home();
        let now = crate::time::now_ms();
        std::fs::create_dir_all(h.path().join("Claude")).unwrap();
        std::fs::write(h.path().join("Claude").join(claude::desktop_usage::FILE),
            serde_json::json!({"version": 2, "samples": [{"t": now, "org": "o", "u": {"fh": 42, "sd": 7}}]}).to_string()).unwrap();
        // już w pierwszej migawce po starcie: inaczej reguły powiadomień uznałyby zastany limit za nowy
        let rt = Runtime::start(cfg(&h)).unwrap();
        let five = rt.store().limits().iter().find(|l| l.agent == Agent::Claude && l.window == crate::model::Window::FiveHour).copied();
        assert_eq!(five.map(|l| l.used_pct), Some(42.0));
    }

    #[test]
    fn rehydrates_recent_codex_rollouts() {
        let h = home();
        let fixture = concat!(env!("CARGO_MANIFEST_DIR"), "/tests/fixtures/codex/router-task.jsonl");
        // zapis zamiast fs::copy: kopiowanie na Windows zachowuje starą datę modyfikacji,
        // a odtwarzamy tylko pliki zmienione w ostatnich 30 minutach
        std::fs::write(h.path().join(".codex/sessions/2026/09/24/rollout-test.jsonl"), std::fs::read(fixture).unwrap()).unwrap();
        let rt = Runtime::start(cfg(&h)).unwrap();
        assert!(rt.store().sessions().iter().any(|s| s.agent == Agent::Codex && s.origin == Origin::Router));
    }

    #[test]
    fn hook_posted_to_endpoint_reaches_store() {
        let h = home();
        let mut rt = Runtime::start(cfg(&h)).unwrap();
        let ep = Endpoint::read(&h.path().join("endpoint.json")).unwrap();
        let body = serde_json::json!({"ts": crate::time::now_ms(), "ppid": null, "payload": {
            "hook_event_name": "UserPromptSubmit", "session_id": "hook-s1", "cwd": "C:\\work\\demo", "prompt": "x"}});
        let status = ureq::post(&format!("http://127.0.0.1:{}/v1/events/claude", ep.port))
            .set("Authorization", &format!("Bearer {}", ep.token))
            .send_string(&body.to_string()).unwrap().status();
        assert_eq!(status, 204);
        let t0 = Instant::now();
        while rt.store().session("hook-s1").is_none() && t0.elapsed() < Duration::from_secs(3) {
            rt.step(crate::time::now_ms());
            std::thread::sleep(Duration::from_millis(20));
        }
        assert!(rt.store().session("hook-s1").is_some());
    }
}
