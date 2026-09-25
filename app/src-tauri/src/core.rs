//! Wątek rdzenia: zdarzenia z `pets-core` → migawka stanu dla UI (`pets://snapshot`).
use pets_core::model::{Limit, Session};
use pets_core::replay::Replay;
use pets_core::runtime::{Runtime, RuntimeConfig};
use pets_core::store::{Store, Timing};
use pets_core::time::now_ms;
use serde::Serialize;
use std::path::{Path, PathBuf};
use std::sync::mpsc::Sender;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter};

#[derive(Serialize, Clone, Default, Debug, PartialEq)]
pub struct Snapshot {
    pub sessions: Vec<Session>,
    pub limits: Vec<Limit>,
    /// zegar rdzenia (ms); w trybie odtwarzania różni się od zegara ściennego
    pub now: i64,
}

pub type Shared = Arc<Mutex<Snapshot>>;

pub fn snapshot_of(store: &Store, now: i64) -> Snapshot {
    Snapshot { sessions: store.sessions().into_iter().cloned().collect(), limits: store.limits().to_vec(), now }
}

pub enum Mode { Live, Replay { path: PathBuf, speed: f64 } }

impl Mode {
    pub fn from_env() -> Mode {
        match std::env::var_os("AGENT_PETS_REPLAY") {
            Some(p) => Mode::Replay {
                path: p.into(),
                speed: std::env::var("AGENT_PETS_REPLAY_SPEED").ok().and_then(|s| s.parse().ok()).unwrap_or(1.0),
            },
            None => Mode::Live,
        }
    }
}

/// `snaps`: każda publikowana migawka trafia też do tego kanału (powiadomienia).
/// Kanał zmian listy aplikacji z ustawień do rdzenia.
pub struct Control(pub std::sync::Mutex<Sender<pets_core::settings::Apps>>);

pub fn spawn(app: AppHandle, shared: Shared, mode: Mode, snaps: Option<Sender<Snapshot>>,
             apps: std::sync::mpsc::Receiver<pets_core::settings::Apps>) {
    std::thread::spawn(move || {
        let publish = |store: &Store, now: i64| {
            let s = snapshot_of(store, now);
            *shared.lock().unwrap() = s.clone();
            if let Some(tx) = &snaps { let _ = tx.send(s.clone()); }
            let _ = app.emit("pets://snapshot", s);
        };
        let result = match mode {
            Mode::Live => live(&app, apps, &publish),
            Mode::Replay { path, speed } => replay(&path, speed, &publish),
        };
        if let Err(e) = result {
            eprintln!("agent-pets: rdzeń danych zatrzymany: {e:#}");
            // wydanie nie ma konsoli: bez tego użytkownik widziałby tylko pusty pasek
            crate::tray::set_status(&app, &failure_text(&e));
        }
    });
}

/// Podpowiedź ikony w trayu przy awarii rdzenia; Windows ucina ją do 127 znaków.
pub fn failure_text(e: &anyhow::Error) -> String {
    const HEAD: &str = "Agent Pets: rdzeń danych nie działa (";
    let room = 127 - HEAD.chars().count() - 1;
    let msg = format!("{e:#}");
    let msg = if msg.chars().count() > room { format!("{}…", msg.chars().take(room - 1).collect::<String>()) } else { msg };
    format!("{HEAD}{msg})")
}

fn live(app: &AppHandle, apps: std::sync::mpsc::Receiver<pets_core::settings::Apps>, publish: &dyn Fn(&Store, i64))
    -> anyhow::Result<()> {
    use tauri::Manager;
    let mut cfg = RuntimeConfig::from_env()?;
    cfg.apps = app.state::<crate::settings::SettingsState>().get().apps;
    let mut rt = Runtime::start(cfg)?;
    // limity konta Claude z serwera Anthropic (dokładne czasy resetu, bez sesji CLI), tylko za zgodą
    let (usage_tx, usage) = std::sync::mpsc::channel();
    let a = app.clone();
    let has_token = crate::usage::spawn(usage_tx, move || a.state::<crate::settings::SettingsState>().get().claude_plan_usage);
    // Pierwsza migawka czeka chwilę na limity z serwera: reguły powiadomień uznają wtedy zastany limit
    // powyżej 90% za stan sprzed startu, a nie za nowy.
    if has_token {
        if let Ok(e) = usage.recv_timeout(Duration::from_secs(3)) { rt.apply_external(e); }
    }
    publish(rt.store(), now_ms());
    loop {
        let now = now_ms();
        let mut changed = false;
        for a in apps.try_iter() { changed |= rt.set_apps(a); }
        changed |= rt.step(now);
        for e in usage.try_iter() { changed |= rt.apply_external(e); }
        if changed {
            publish(rt.store(), now);
            *app.state::<crate::settings::LastSeen>().0.lock().unwrap() =
                rt.last_seen().into_iter().map(|(k, v)| (k.to_string(), v)).collect();
        }
        std::thread::sleep(Duration::from_millis(250));
    }
}

fn replay(path: &Path, speed: f64, publish: &dyn Fn(&Store, i64)) -> anyhow::Result<()> {
    let mut rp = Replay::load(path, speed)?;
    let mut store = Store::new(Timing::default());
    while let Some(d) = rp.next_delay_ms() {
        std::thread::sleep(Duration::from_millis(d));
        if let Some(clock) = rp.apply_next(&mut store) { publish(&store, clock); }
    }
    // Po nagraniu zegar płynie dalej w czasie rzeczywistym, więc działają progi (done → idle itd.).
    let end = Instant::now();
    loop {
        std::thread::sleep(Duration::from_millis(250));
        let now = rp.clock() + end.elapsed().as_millis() as i64;
        if !store.tick(now, &|_| true).is_empty() { publish(&store, now); }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use pets_core::model::*;
    use pets_core::replay::Replay;
    use pets_core::store::{Store, Timing};
    use std::path::Path;

    #[test]
    fn snapshot_serializes_like_the_ts_types() {
        let mut store = Store::new(Timing::default());
        let mut e = Event::new(Source::Claude, "s1", Kind::ToolStart, 1_000);
        e.tool = Some(Tool::Edit);
        e.data.progress = Some(Progress { done: 1, total: 4 });
        store.apply(&e);
        let v = serde_json::to_value(snapshot_of(&store, 2_000)).unwrap();
        assert_eq!(v["now"], 2_000);
        let s = &v["sessions"][0];
        assert_eq!(s["state"], "working");
        assert_eq!(s["tool"], "edit");
        assert_eq!(s["progress"]["total"], 4);
        assert_eq!(s["started_at"], 1_000);
        assert!(s["context"].is_null());
        assert!(s["router_task"].is_null());
        assert!(v["limits"].as_array().unwrap().is_empty());
    }

    #[test]
    fn failure_text_names_the_problem_and_fits_the_tray_tooltip() {
        let short = failure_text(&anyhow::anyhow!("brak katalogu domowego"));
        assert_eq!(short, "Agent Pets: rdzeń danych nie działa (brak katalogu domowego)");
        let long = failure_text(&anyhow::anyhow!("{}", "ż".repeat(300)));
        assert!(long.chars().count() <= 127, "{}", long.chars().count());
        assert!(long.ends_with("…)"));
    }

    #[test]
    fn demo_recording_yields_seven_sessions_and_limits() {
        let path = concat!(env!("CARGO_MANIFEST_DIR"), "/../demo/many-sessions.jsonl");
        let mut rp = Replay::load(Path::new(path), 1000.0).unwrap();
        let mut store = Store::new(Timing::default());
        while rp.apply_next(&mut store).is_some() {}
        let snap = snapshot_of(&store, rp.clock());
        assert_eq!(snap.sessions.len(), 7);
        assert_eq!(snap.limits.len(), 4);
        let state = |id: &str| store.session(id).map(|s| s.state);
        assert_eq!(state("d5"), Some(State::NeedsYou));
        assert_eq!(state("d6"), Some(State::Error));
        assert_eq!(state("d7"), Some(State::Done));
    }
}
