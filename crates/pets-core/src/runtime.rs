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
    /// Publiczny plik stanu zadań Agent Routera (`~/.agent-router/status.json`).
    pub router_status: Option<PathBuf>,
    /// Aplikacje, dla których są zwierzaki (ustawienia).
    pub apps: crate::settings::Apps,
}

impl RuntimeConfig {
    pub fn from_env() -> anyhow::Result<Self> {
        Ok(RuntimeConfig {
            home: dirs::home_dir().context("brak katalogu domowego")?,
            endpoint_path: Endpoint::default_path(),
            record: None,
            claude_usage_files: claude::desktop_usage::candidate_files(
                &dirs::data_local_dir().unwrap_or_default(), &dirs::config_dir().unwrap_or_default()),
            router_status: dirs::home_dir().map(|h| h.join(".agent-router").join(crate::router::FILE)),
            apps: crate::settings::Apps::default(),
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
    router: Option<crate::router::Poller>,
    apps: crate::settings::Apps,
    last_seen: std::collections::BTreeMap<&'static str, i64>,
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
            record: cfg.record, hooks, files: None, usage: claude::desktop_usage::Poller::new(cfg.claude_usage_files),
            router: cfg.router_status.map(crate::router::Poller::new), apps: cfg.apps, last_seen: Default::default(),
            _ingest: ingest, _watcher: None,
        };
        let roots = [cfg.home.join(".claude").join("projects"), cfg.home.join(".codex").join("sessions")];
        // Odtworzenie stanu: żywe sesje Claude'a z rejestru, potem ich transkrypty i rollouty Codexa.
        let live: Vec<_> = claude::registry::read_registry(&cfg.home.join(".claude").join("sessions"))
            .into_iter().filter(|s| pid::is_alive(s.pid)).collect();
        for s in &live { rt.apply(s.to_event()); }
        let live_ids = live.iter().map(|s| s.session_id.clone()).collect();
        let recent: Vec<PathBuf> = roots.iter().flat_map(|r| recent_files(r, Duration::from_secs(1800))).collect();
        for f in keep_for_rehydration(&recent, &live_ids) { rt.poll_file(&f); }
        if let Some(claude::desktop_usage::Usage::Limits(e)) = rt.usage.poll(crate::time::now_ms()) { rt.apply(e); }
        rt.poll_router(crate::time::now_ms());
        // jeden takt przed pierwszą migawką: stare wątki z niedawno dotkniętych plików znikają, zanim się pokażą
        rt.store.tick(crate::time::now_ms(), &pid::is_alive);
        let (ftx, files) = channel();
        rt._watcher = Some(watch(&roots, ftx)?);
        rt.files = Some(files);
        Ok(rt)
    }

    pub fn store(&self) -> &Store { &self.store }

    /// Zdarzenie z zewnątrz rdzenia (np. limity konta Claude pobrane przez aplikację). Zwraca, czy stan się zmienił.
    pub fn apply_external(&mut self, e: Event) -> bool { self.apply(e) }

    /// Włącza i wyłącza aplikacje w locie: sesje i limity wyłączonych znikają od razu. Zwraca, czy stan się zmienił.
    pub fn set_apps(&mut self, apps: crate::settings::Apps) -> bool {
        if apps == self.apps { return false; }
        if apps.agent_router && !self.apps.agent_router {
            if let Some(p) = self.router.as_mut() { p.reset(); }
        }
        self.apps = apps;
        let removed = self.store.retain_sessions(|s| session_on(apps, s));
        removed | self.store.retain_limits(|l| agent_on(apps, l.agent))
    }

    /// Czas ostatniego zdarzenia z każdego źródła (diagnostyka).
    pub fn last_seen(&self) -> std::collections::BTreeMap<&'static str, i64> { self.last_seen.clone() }

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
        changed |= self.poll_router(now);
        match self.usage.poll(now) {
            Some(claude::desktop_usage::Usage::Limits(e)) => changed |= self.apply(e),
            Some(claude::desktop_usage::Usage::Stale) => changed |= self.store.drop_limits_without_reset(crate::model::Agent::Claude),
            None => {}
        }
        changed |= !self.store.tick(now, &pid::is_alive).is_empty();
        changed
    }

    fn poll_router(&mut self, now: i64) -> bool {
        if !self.apps.agent_router { return false; }
        let events = self.router.as_mut().map(|p| p.poll(now)).unwrap_or_default();
        events.into_iter().fold(false, |c, e| self.apply(e) | c)
    }

    fn apply(&mut self, mut e: Event) -> bool {
        if !event_on(self.apps, &e) {
            // sesja wyłączonej aplikacji odpada, ale limity konta (np. Codexa z wątku routera) mogą zostać
            let limits: Vec<_> = e.data.limits.iter().filter(|l| agent_on(self.apps, l.agent)).copied().collect();
            if limits.is_empty() { return false; }
            let mut only = Event::new(e.source, e.session_id.clone(), crate::model::Kind::Limits, e.ts);
            only.data.limits = limits;
            e = only;
        }
        let key = source_key(&e);
        let seen = self.last_seen.entry(key).or_insert(e.ts);
        *seen = (*seen).max(e.ts);
        if let Some(f) = &mut self.record { let _ = writeln!(f, "{}", serde_json::to_string(&e).unwrap_or_default()); }
        !self.store.apply(&e).is_empty()
    }

    fn poll_file(&mut self, p: &Path) -> bool {
        use crate::watch::{kind_of, FileKind};
        match kind_of(p) {
            Some(FileKind::ClaudeTranscript) if !self.apps.claude_code => return false,
            // rollouty Codexa niosą też wątki routera
            Some(FileKind::CodexRollout) if !self.apps.codex && !self.apps.agent_router => return false,
            _ => {}
        }
        let mut changed = false;
        if self.sources.track(p, true) { for e in self.sources.poll(p) { changed |= self.apply(e); } }
        changed
    }

    fn on_hook(&mut self, env: HookEnvelope) -> bool {
        if !self.apps.claude_code { return false; }
        let mut changed = false;
        if let Some(tp) = claude::hook::transcript_path(&env) { changed |= self.poll_file(&tp); }
        for e in claude::hook::to_events(&env) { changed |= self.apply(e); }
        if let Some(e) = self.tasks.observe(&env) { changed |= self.apply(e); }
        changed
    }
}

fn agent_on(apps: crate::settings::Apps, agent: crate::model::Agent) -> bool {
    match agent {
        crate::model::Agent::Claude => apps.claude_code,
        // router zleca zadania na tym samym koncie Codexa
        crate::model::Agent::Codex => apps.codex || apps.agent_router,
    }
}

fn session_on(apps: crate::settings::Apps, s: &crate::model::Session) -> bool {
    match (s.origin, s.agent) {
        (crate::model::Origin::Router, _) => apps.agent_router,
        (_, crate::model::Agent::Claude) => apps.claude_code,
        (_, crate::model::Agent::Codex) => apps.codex,
    }
}

fn event_on(apps: crate::settings::Apps, e: &Event) -> bool {
    use crate::model::{Origin, Source};
    if e.source == Source::Router || e.data.origin == Some(Origin::Router) { return apps.agent_router; }
    match e.source { Source::Claude => apps.claude_code, Source::Codex => apps.codex, Source::Router => apps.agent_router }
}

fn source_key(e: &Event) -> &'static str {
    use crate::model::Source;
    if e.session_id == claude::desktop_usage::SESSION_ID || e.session_id == claude::account_usage::SESSION_ID {
        return "claude_usage";
    }
    match e.source { Source::Claude => "claude_code", Source::Codex => "codex", Source::Router => "agent_router" }
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
            claude_usage_files: vec![h.path().join("Claude").join(claude::desktop_usage::FILE)],
            router_status: Some(h.path().join(".agent-router").join(crate::router::FILE)),
            apps: crate::settings::Apps::default() }
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

    /// Nagranie z czasami przesuniętymi tak, że ostatnie zdarzenie było przed chwilą.
    fn fresh(path: &str) -> String {
        let lines: Vec<serde_json::Value> = std::fs::read_to_string(path).unwrap().lines()
            .map(|l| serde_json::from_str(l).unwrap()).collect();
        let ts = |v: &serde_json::Value| v["timestamp"].as_str().and_then(crate::time::rfc3339_ms);
        let shift = crate::time::now_ms() - 60_000 - lines.iter().filter_map(ts).max().unwrap();
        lines.into_iter().map(|mut v| {
            if let Some(t) = ts(&v) { v["timestamp"] = crate::time::rfc3339(t + shift).into(); }
            v.to_string() + "\n"
        }).collect()
    }

    #[test]
    fn rehydrates_recent_codex_rollouts() {
        let h = home();
        let fixture = concat!(env!("CARGO_MANIFEST_DIR"), "/tests/fixtures/codex/router-task.jsonl");
        // zapis zamiast fs::copy: kopiowanie na Windows zachowuje starą datę modyfikacji,
        // a odtwarzamy tylko pliki zmienione w ostatnich 30 minutach
        std::fs::write(h.path().join(".codex/sessions/2026/09/24/rollout-test.jsonl"), fresh(fixture)).unwrap();
        let rt = Runtime::start(cfg(&h)).unwrap();
        assert!(rt.store().sessions().iter().any(|s| s.agent == Agent::Codex && s.origin == Origin::Router));
    }

    fn router_status(h: &tempfile::TempDir, thread: &str, status: &str, updated: i64) {
        let dir = h.path().join(".agent-router");
        std::fs::create_dir_all(&dir).unwrap();
        let t = crate::time::rfc3339(updated);
        std::fs::write(dir.join(crate::router::FILE), serde_json::json!({"version": 1, "updatedAt": t, "stallSeconds": 180,
            "tasks": [{"taskId": "t1", "threadId": thread, "title": "Policz pliki", "status": status,
                       "workingDirectory": "C:/work", "updatedAt": t, "lastActivityAt": t, "blocked": false}]}).to_string()).unwrap();
    }

    #[test]
    fn router_task_joins_its_codex_pet_at_startup() {
        let h = home();
        let fixture = concat!(env!("CARGO_MANIFEST_DIR"), "/tests/fixtures/codex/router-task.jsonl");
        std::fs::write(h.path().join(".codex/sessions/2026/09/24/rollout-test.jsonl"), fresh(fixture)).unwrap();
        let thread = "01a04e96-7474-79a1-a173-8c3cc2919eeb";
        router_status(&h, thread, "running", crate::time::now_ms());
        let rt = Runtime::start(cfg(&h)).unwrap();
        let s = rt.store().session(thread).expect("jedna sesja na wątek");
        assert_eq!((s.origin, s.title.as_str()), (Origin::Router, "Policz pliki"));
        assert_eq!(s.router_task.as_ref().map(|r| r.task_id.as_str()), Some("t1"));
        assert_eq!(rt.store().sessions().len(), 1, "bez drugiego zwierzaka dla tego samego zadania");
    }

    #[test]
    fn an_old_failed_router_task_does_not_appear_at_startup() {
        let h = home();
        router_status(&h, "stary-watek", "failed", crate::time::now_ms() - 2 * 3_600_000);
        let rt = Runtime::start(cfg(&h)).unwrap();
        assert!(rt.store().sessions().is_empty());
    }

    fn event(src: crate::model::Source, id: &str, kind: crate::model::Kind) -> crate::model::Event {
        crate::model::Event::new(src, id, kind, crate::time::now_ms())
    }

    #[test]
    fn a_disabled_app_brings_no_pets() {
        use crate::model::{Kind, Source};
        let h = home();
        let mut c = cfg(&h);
        c.apps.claude_code = false;
        let mut rt = Runtime::start(c).unwrap();
        assert!(!rt.apply_external(event(Source::Claude, "c1", Kind::Prompt)));
        assert!(rt.store().session("c1").is_none());
        assert!(rt.apply_external(event(Source::Codex, "x1", Kind::Prompt)));
    }

    #[test]
    fn turning_an_app_off_removes_its_pets_and_limits_at_once() {
        use crate::model::{Agent, Kind, Limit, Source, Window};
        let h = home();
        let mut rt = Runtime::start(cfg(&h)).unwrap();
        rt.apply_external(event(Source::Claude, "c1", Kind::Prompt));
        rt.apply_external(event(Source::Codex, "x1", Kind::Prompt));
        rt.apply_external(event(Source::Router, "r1", Kind::Prompt));
        let mut l = event(Source::Codex, "x1", Kind::Limits);
        l.data.limits = vec![Limit { agent: Agent::Codex, window: Window::Weekly, used_pct: 10.0, resets_at: None }];
        rt.apply_external(l);
        let apps = crate::settings::Apps { claude_code: true, codex: false, agent_router: false };
        assert!(rt.set_apps(apps));
        let ids: Vec<&str> = rt.store().sessions().iter().map(|s| s.id.as_str()).collect();
        assert_eq!(ids, vec!["c1"], "sesja routera znika z routerem, choć to wątek Codexa");
        assert!(rt.store().limits().is_empty());
        assert!(!rt.set_apps(apps), "druga taka sama zmiana niczego nie zmienia");
        assert!(!rt.apply_external(event(Source::Codex, "x2", Kind::Prompt)));
    }

    #[test]
    fn last_event_per_source_for_diagnostics() {
        use crate::model::{Kind, Source};
        let h = home();
        let mut rt = Runtime::start(cfg(&h)).unwrap();
        assert!(rt.last_seen().get("codex").is_none());
        rt.apply_external(event(Source::Codex, "x1", Kind::Prompt));
        assert!(rt.last_seen().get("codex").is_some());
    }

    #[test]
    fn long_dead_rollouts_touched_recently_do_not_appear_at_startup() {
        // aplikacja Codex zmienia daty starych rolloutów; ich zdarzenia są sprzed dni, więc zwierzak nie ma się pojawiać
        let h = home();
        let fixture = concat!(env!("CARGO_MANIFEST_DIR"), "/tests/fixtures/codex/router-task.jsonl");
        std::fs::write(h.path().join(".codex/sessions/2026/09/24/rollout-old.jsonl"), std::fs::read(fixture).unwrap()).unwrap();
        let rt = Runtime::start(cfg(&h)).unwrap();
        assert!(rt.store().sessions().is_empty());
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
