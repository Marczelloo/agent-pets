//! Rdzeń danych na żywo: ingest hooków, obserwacja plików, odtworzenie stanu po starcie i zegar.
use crate::claude::{self, hook::{HookState, TaskTracker}, HookEnvelope};
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
    /// Język tekstów akcji i pytań.
    pub lang: crate::i18n::Lang,
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
            lang: crate::i18n::system(),
        })
    }
}

pub struct Runtime {
    store: Store,
    sources: Sources,
    tasks: TaskTracker,
    hook_state: HookState,
    lang: crate::i18n::Lang,
    /// zadania routera → sesje, które je zleciły (tylko id, `~/.agent-pets/links.json`)
    links: crate::links::Links,
    links_path: PathBuf,
    record: Option<File>,
    hooks: Receiver<Incoming>,
    files: Option<Receiver<PathBuf>>,
    usage: claude::desktop_usage::Poller,
    router: Option<crate::router::Poller>,
    apps: crate::settings::Apps,
    last_seen: std::collections::BTreeMap<&'static str, i64>,
    _ingest: Ingest,
    /// furtka otwarta (`apps.generic`), wspólna z wątkiem endpointu
    door: std::sync::Arc<std::sync::atomic::AtomicBool>,
    _watcher: Option<notify::RecommendedWatcher>,
}

impl Runtime {
    pub fn start(cfg: RuntimeConfig) -> anyhow::Result<Runtime> {
        let links_path = crate::links::path(&cfg.home);
        let mut links = crate::links::Links::load(&links_path);
        links.prune(crate::time::now_ms());
        let (tx, hooks) = channel();
        let door = std::sync::Arc::new(std::sync::atomic::AtomicBool::new(cfg.apps.generic));
        let ingest = Ingest::start(Endpoint::new_token(), tx, door.clone())?;
        ingest.endpoint().write(&cfg.endpoint_path).context("zapis endpoint.json")?;
        let mut rt = Runtime {
            store: Store::new(Timing::default()), sources: Sources::new(), tasks: TaskTracker::default(),
            hook_state: HookState::default(), lang: cfg.lang, links, links_path,
            record: cfg.record, hooks, files: None, usage: claude::desktop_usage::Poller::new(cfg.claude_usage_files),
            router: cfg.router_status.map(crate::router::Poller::new), apps: cfg.apps, last_seen: Default::default(),
            _ingest: ingest, door, _watcher: None,
        };
        rt.sources.lang = rt.lang;
        let roots = [cfg.home.join(".claude").join("projects"), cfg.home.join(".codex").join("sessions")];
        // Odtworzenie stanu: żywe sesje Claude'a z rejestru, potem ich transkrypty i rollouty Codexa.
        let live: Vec<_> = claude::registry::read_registry(&cfg.home.join(".claude").join("sessions"))
            .into_iter().filter(|s| pid::is_alive(s.pid)).collect();
        for s in &live { rt.apply(s.to_event()); }
        let live_ids = live.iter().map(|s| s.session_id.clone()).collect();
        let recent: Vec<PathBuf> = roots.iter().flat_map(|r| recent_files(r, Duration::from_secs(1800))).collect();
        for f in keep_for_rehydration(&recent, &live_ids) { rt.poll_file(&f); }
        rt.end_answered_subagents(crate::time::now_ms());
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
        self.door.store(apps.generic, std::sync::atomic::Ordering::Relaxed);
        let removed = self.store.retain_sessions(|s| session_on(apps, s));
        removed | self.store.retain_limits(|l| agent_on(apps, l.agent))
    }

    /// Język nowych tekstów akcji i pytań (zmiana w ustawieniach).
    pub fn set_lang(&mut self, lang: crate::i18n::Lang) { self.lang = lang; self.sources.lang = lang; }

    /// Czas ostatniego zdarzenia z każdego źródła (diagnostyka).
    pub fn last_seen(&self) -> std::collections::BTreeMap<&'static str, i64> { self.last_seen.clone() }

    /// Przetwarza zaległe zdarzenia i przesuwa zegar. Zwraca `true`, gdy stan się zmienił.
    pub fn step(&mut self, now: i64) -> bool {
        let mut changed = false;
        while let Ok(msg) = self.hooks.try_recv() {
            changed |= match msg {
                Incoming::ClaudeHook(env) => self.on_hook(env),
                Incoming::ClaudeStatusline(s) => claude::statusline::to_events(&s).into_iter().fold(false, |c, e| self.apply(e) | c),
                Incoming::Generic(e) => self.apply(e),
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
        self.as_child_of_caller(&mut e);
        if let Some(f) = &mut self.record {
            // teksty akcji i pytań (nazwy plików, komendy) nigdy nie trafiają na dysk
            let mut clean = e.clone();
            clean.data.action = None;
            clean.data.question = None;
            let _ = writeln!(f, "{}", serde_json::to_string(&clean).unwrap_or_default());
        }
        let mut changed = !self.store.apply(&e).is_empty();
        if let Some(task) = e.data.router_link.clone() {
            // zlecone z subagenta (albo wątku-dziecka Codexa): dzieckiem sesji głównej, bo wnuków nikt nie rysuje
            let owner = e.data.parent.clone().or_else(|| self.store.session(&e.session_id).and_then(|s| s.parent.clone()))
                .unwrap_or_else(|| e.session_id.clone());
            changed |= self.link(&task, &owner, e.ts);
        }
        changed
    }

    /// Zadanie routera zlecone przez śledzoną sesję jest jej dzieckiem (sklep robi z niego sierotę, gdy rodzica nie ma).
    fn as_child_of_caller(&self, e: &mut Event) {
        let Some(task) = e.data.router_task.as_ref() else { return };
        let Some(parent) = self.links.parent_of(&task.task_id) else { return };
        e.data.parent = Some(parent.to_string());
        e.data.sub = Some(crate::model::SubInfo {
            kind: crate::model::SubKind::Router, agent_type: None, description: e.data.title.clone(), background: false,
        });
    }

    /// Zapisuje powiązanie i od razu dołącza do rodzica zadanie, które już jest na scenie.
    fn link(&mut self, task: &str, parent: &str, ts: i64) -> bool {
        self.links.link(task, parent, ts);
        let _ = self.links.save_if_dirty(&self.links_path);
        let known: Vec<(String, String, i64)> = self.store.sessions().iter()
            .filter(|s| s.router_task.as_ref().map(|r| r.task_id.as_str()) == Some(task) && s.parent.as_deref() != Some(parent))
            .map(|s| (s.id.clone(), s.title.clone(), s.last_activity)).collect();
        let mut changed = false;
        for (id, title, last) in known {
            // czas sprzed ostatniej aktywności: dołączenie zmienia tylko dane, nie stan ani aktywność
            let mut m = Event::new(crate::model::Source::Router, id, crate::model::Kind::Meta, last - 1);
            m.data.parent = Some(parent.to_string());
            m.data.sub = Some(crate::model::SubInfo {
                kind: crate::model::SubKind::Router, agent_type: None, description: Some(title).filter(|t| !t.is_empty()), background: false,
            });
            changed |= !self.store.apply(&m).is_empty();
        }
        changed
    }

    fn poll_file(&mut self, p: &Path) -> bool {
        use crate::watch::{kind_of, FileKind};
        match kind_of(p) {
            Some(FileKind::ClaudeTranscript | FileKind::ClaudeSubagent) if !self.apps.claude_code => return false,
            // rollouty Codexa niosą też wątki routera
            Some(FileKind::CodexRollout) if !self.apps.codex && !self.apps.agent_router => return false,
            _ => {}
        }
        let mut changed = false;
        if self.sources.track(p, true) { for e in self.sources.poll(p) { changed |= self.apply(e); } }
        changed
    }

    /// Po odtworzeniu: subagent, którego plik kończy się odpowiedzią sprzed chwili, już skończył (hooków nie odtwarzamy).
    fn end_answered_subagents(&mut self, now: i64) {
        for (id, ts) in self.sources.finished_subagents() {
            if now - ts < 30_000 || self.store.session(&id).map(|s| s.state == crate::model::State::Ended).unwrap_or(true) { continue; }
            let mut e = Event::new(crate::model::Source::Claude, id.clone(), crate::model::Kind::SessionEnd, ts);
            e.data.parent = id.split('/').next().map(String::from);
            self.apply(e);
        }
    }

    fn on_hook(&mut self, env: HookEnvelope) -> bool {
        if !self.apps.claude_code { return false; }
        let mut changed = false;
        if let Some(tp) = claude::hook::transcript_path(&env) { changed |= self.poll_file(&tp); }
        // linie subagenta przed jego `SubagentStop`: spóźnione nie ożywią zakończonego dziecka
        if let Some(sp) = claude::hook::subagent_transcript_path(&env) { changed |= self.poll_file(&sp); }
        for e in self.hook_state.events(&env, self.lang) { changed |= self.apply(e); }
        if let Some(e) = self.tasks.observe(&env) { changed |= self.apply(e); }
        changed
    }
}

fn agent_on(apps: crate::settings::Apps, agent: crate::model::Agent) -> bool {
    match agent {
        crate::model::Agent::Claude => apps.claude_code,
        // router zleca zadania na tym samym koncie Codexa
        crate::model::Agent::Codex => apps.codex || apps.agent_router,
        crate::model::Agent::Opencode => apps.opencode,
        crate::model::Agent::Other => apps.generic,
        // własne adaptery w 0.11 i 0.12
        crate::model::Agent::Antigravity | crate::model::Agent::Copilot | crate::model::Agent::Cursor | crate::model::Agent::Grok => false,
    }
}

fn session_on(apps: crate::settings::Apps, s: &crate::model::Session) -> bool {
    match (s.origin, s.agent) {
        (crate::model::Origin::Router, _) => apps.agent_router,
        (_, crate::model::Agent::Claude) => apps.claude_code,
        (_, crate::model::Agent::Codex) => apps.codex,
        (_, a) => agent_on(apps, a),
    }
}

fn event_on(apps: crate::settings::Apps, e: &Event) -> bool {
    use crate::model::{Origin, Source};
    if e.source == Source::Router || e.data.origin == Some(Origin::Router) { return apps.agent_router; }
    match e.source {
        Source::Claude => apps.claude_code,
        Source::Codex => apps.codex,
        Source::Router => apps.agent_router,
        Source::Opencode => apps.opencode,
        Source::Generic => apps.generic,
    }
}

fn source_key(e: &Event) -> &'static str {
    use crate::model::Source;
    if e.session_id == claude::desktop_usage::SESSION_ID || e.session_id == claude::account_usage::SESSION_ID {
        return "claude_usage";
    }
    match e.source {
        Source::Claude => "claude_code",
        Source::Codex => "codex",
        Source::Router => "agent_router",
        Source::Opencode => "opencode",
        Source::Generic => "generic",
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
            claude_usage_files: vec![h.path().join("Claude").join(claude::desktop_usage::FILE)],
            router_status: Some(h.path().join(".agent-router").join(crate::router::FILE)),
            apps: crate::settings::Apps::default(), lang: crate::i18n::Lang::Pl }
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
    fn opencode_and_the_door_follow_their_switches() {
        use crate::model::{Kind, Source};
        let h = home();
        let mut rt = Runtime::start(cfg(&h)).unwrap();
        rt.apply_external(event(Source::Claude, "c1", Kind::Prompt));
        rt.apply_external(event(Source::Opencode, "opencode:a", Kind::Prompt));
        rt.apply_external(event(Source::Generic, "generic:kilo:a", Kind::Prompt));
        let apps = crate::settings::Apps { opencode: false, generic: false, ..Default::default() };
        assert!(rt.set_apps(apps));
        let ids: Vec<&str> = rt.store().sessions().iter().map(|s| s.id.as_str()).collect();
        assert_eq!(ids, vec!["c1"]);
        assert!(!rt.apply_external(event(Source::Generic, "generic:kilo:b", Kind::Prompt)));
        assert!(!rt.apply_external(event(Source::Opencode, "opencode:b", Kind::Prompt)));
    }

    #[test]
    fn a_door_session_starts_working_and_the_switch_closes_the_route() {
        let h = home();
        let mut rt = Runtime::start(cfg(&h)).unwrap();
        let ep = Endpoint::read(&h.path().join("endpoint.json")).unwrap();
        let send = |ep: &Endpoint| ureq::post(&format!("http://127.0.0.1:{}/v1/events/generic", ep.port))
            .set("Authorization", &format!("Bearer {}", ep.token))
            .send_string(r#"{"agent":"kilo","session":"a","state":"working","tool":"bash"}"#)
            .map(|r| r.status()).unwrap_or_else(|e| match e { ureq::Error::Status(c, _) => c, _ => 0 });
        assert_eq!(send(&ep), 204);
        let deadline = Instant::now() + Duration::from_secs(2);
        while rt.store().session("generic:kilo:a").is_none() && Instant::now() < deadline { rt.step(crate::time::now_ms()); }
        let s = rt.store().session("generic:kilo:a").expect("sesja z furtki");
        assert_eq!((s.agent, s.state, s.tool), (Agent::Other, crate::model::State::Working, Some(crate::model::Tool::Bash)));
        rt.set_apps(crate::settings::Apps { generic: false, ..Default::default() });
        assert_eq!(send(&ep), 404);
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
        let apps = crate::settings::Apps { claude_code: true, codex: false, agent_router: false, ..Default::default() };
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

    fn delegated(rt: &mut Runtime, parent: &str, task: &str, ts: i64) {
        use crate::model::{Kind, Source};
        rt.apply_external(crate::model::Event::new(Source::Claude, parent, Kind::Prompt, ts));
        let mut post = crate::model::Event::new(Source::Claude, parent, Kind::ToolEnd, ts);
        post.data.router_link = Some(task.into());
        rt.apply_external(post);
    }

    #[test]
    fn a_router_task_delegated_by_a_session_is_its_child() {
        let h = home();
        let mut rt = Runtime::start(cfg(&h)).unwrap();
        let now = crate::time::now_ms();
        delegated(&mut rt, "p1", "t1", now);
        router_status(&h, "th1", "running", now);
        rt.step(now + 2_000);
        let s = rt.store().session("th1").expect("zadanie routera");
        assert_eq!(s.parent.as_deref(), Some("p1"));
        let sub = s.sub.clone().unwrap();
        assert_eq!((sub.kind, sub.description.as_deref()), (crate::model::SubKind::Router, Some("Policz pliki")));
        let saved = std::fs::read_to_string(crate::links::path(h.path())).unwrap();
        assert!(saved.contains("t1") && saved.contains("p1") && !saved.contains("Policz"), "tylko id: {saved}");
    }

    #[test]
    fn a_link_arriving_after_the_task_attaches_it_at_once() {
        let h = home();
        let now = crate::time::now_ms();
        router_status(&h, "th1", "running", now);
        let mut rt = Runtime::start(cfg(&h)).unwrap();
        assert_eq!(rt.store().session("th1").map(|s| s.parent.clone()), Some(None), "bez powiązania: zwykły zwierzak jak w 0.7");
        delegated(&mut rt, "p1", "t1", now);
        assert_eq!(rt.store().session("th1").and_then(|s| s.parent.clone()).as_deref(), Some("p1"));
    }

    #[test]
    fn links_come_back_after_a_restart() {
        let h = home();
        let now = crate::time::now_ms();
        {
            let mut rt = Runtime::start(cfg(&h)).unwrap();
            delegated(&mut rt, "p1", "t1", now);
        }
        let mut rt = Runtime::start(cfg(&h)).unwrap();
        rt.apply_external(crate::model::Event::new(crate::model::Source::Claude, "p1", crate::model::Kind::Prompt, now));
        router_status(&h, "th1", "running", now);
        rt.step(now + 2_000);
        assert_eq!(rt.store().session("th1").and_then(|s| s.parent.clone()).as_deref(), Some("p1"));
    }

    #[test]
    fn the_recording_never_holds_action_or_question_text() {
        use crate::model::{Kind, Source};
        let h = home();
        let rec = h.path().join("rec.jsonl");
        let mut c = cfg(&h);
        c.record = Some(File::create(&rec).unwrap());
        let mut rt = Runtime::start(c).unwrap();
        let now = crate::time::now_ms();
        let mut t = crate::model::Event::new(Source::Claude, "s1", Kind::ToolStart, now);
        t.data.action = Some("curl -H \"Authorization: Bearer sekret-XYZ\"".into());
        rt.apply_external(t);
        let mut n = crate::model::Event::new(Source::Claude, "s1", Kind::NeedsInput, now + 1);
        n.data.question = Some("Pytanie: sekret-QQ?".into());
        rt.apply_external(n);
        drop(rt);
        let text = std::fs::read_to_string(&rec).unwrap();
        assert_eq!(text.lines().count(), 2, "zdarzenia są nagrane");
        assert!(!text.contains("sekret"), "{text}");
        assert!(rt_store_kept_text(&h), "w pamięci tekst zostaje");
    }

    fn rt_store_kept_text(h: &tempfile::TempDir) -> bool {
        use crate::model::{Kind, Source};
        let mut rt = Runtime::start(cfg(h)).unwrap();
        let mut t = crate::model::Event::new(Source::Claude, "s2", Kind::ToolStart, crate::time::now_ms());
        t.data.action = Some("npm test".into());
        rt.apply_external(t);
        rt.store().session("s2").and_then(|s| s.action.clone()).as_deref() == Some("npm test")
    }

    #[test]
    fn a_router_task_delegated_inside_a_subagent_belongs_to_the_top_session() {
        use crate::model::{Event, Kind, Source, SubInfo, SubKind};
        let h = home();
        let mut rt = Runtime::start(cfg(&h)).unwrap();
        let now = crate::time::now_ms();
        rt.apply_external(Event::new(Source::Claude, "p1", Kind::Prompt, now));
        let mut post = Event::new(Source::Claude, "p1/a", Kind::ToolEnd, now);
        post.data.parent = Some("p1".into());
        post.data.sub = Some(SubInfo { kind: SubKind::Claude, agent_type: None, description: None, background: false });
        post.data.router_link = Some("t1".into());
        rt.apply_external(post);
        router_status(&h, "th1", "running", now);
        rt.step(now + 2_000);
        assert_eq!(rt.store().session("th1").and_then(|s| s.parent.clone()).as_deref(), Some("p1"),
            "wnuków nikt nie rysuje: zadanie trafia do sesji głównej");
    }

    #[test]
    fn a_subagent_that_already_answered_does_not_come_back_after_a_restart() {
        let h = home();
        let now = crate::time::now_ms();
        std::fs::write(h.path().join(".claude/sessions/1.json"), serde_json::json!({"pid": std::process::id(), "sessionId": "p1",
            "cwd": "C:\\w", "startedAt": now - 300_000, "entrypoint": "cli"}).to_string()).unwrap();
        let dir = h.path().join(".claude/projects/proj/p1/subagents");
        std::fs::create_dir_all(&dir).unwrap();
        let line = |agent: &str, ty: &str, content: serde_json::Value, ago: i64| serde_json::json!({"isSidechain": true, "agentId": agent,
            "sessionId": "p1", "type": ty, "timestamp": crate::time::rfc3339(now - ago), "message": {"content": content}}).to_string();
        let running = |agent: &str, ago: i64| line(agent, "assistant", serde_json::json!([{"type": "tool_use", "name": "Bash", "input": {"command": "ls"}}]), ago);
        std::fs::write(dir.join("agent-a.jsonl"), [line("a", "user", serde_json::json!("x"), 200_000), running("a", 150_000),
            line("a", "assistant", serde_json::json!([{"type": "text", "text": "gotowe"}]), 120_000)].join("\n") + "\n").unwrap();
        std::fs::write(dir.join("agent-a.meta.json"), r#"{"agentType":"general-purpose","requestShape":"background"}"#).unwrap();
        std::fs::write(dir.join("agent-b.jsonl"), [line("b", "user", serde_json::json!("y"), 60_000), running("b", 5_000)].join("\n") + "\n").unwrap();
        let rt = Runtime::start(cfg(&h)).unwrap();
        assert!(rt.store().session("p1/a").map(|s| s.state == crate::model::State::Ended).unwrap_or(true), "skończony subagent w tle: {:?}", rt.store().session("p1/a").map(|s| (s.state, s.last_activity, s.parent.clone())));
        assert_eq!(rt.store().session("p1/b").map(|s| s.state), Some(crate::model::State::Working), "pracujący zostaje");
    }
}
