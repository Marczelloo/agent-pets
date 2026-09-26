//! Wątek rdzenia: zdarzenia z `pets-core` → migawka stanu dla UI (`pets://snapshot`).
use pets_core::dismiss::{self, Dismissed};
use pets_core::i18n::{tr, Lang};
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

/// Migawka bez sesji ukrytych ręcznie (te, które od ukrycia coś zrobiły, wracają).
pub fn snapshot_of(store: &Store, now: i64, hidden: &mut Dismissed) -> Snapshot {
    let sessions = hidden.filter(store.sessions().into_iter().cloned().collect());
    Snapshot { sessions, limits: store.limits().to_vec(), now }
}

/// „Usuń nieaktywne”: ukrywa widoczne sesje w stanach bezczynnych i zwraca ich id (do „Cofnij”).
pub fn dismiss_inactive(store: &Store, hidden: &mut Dismissed, now: i64) -> Vec<String> {
    let ids: Vec<String> = hidden.filter(store.sessions().into_iter().cloned().collect())
        .into_iter().filter(dismiss::inactive).map(|s| s.id).collect();
    hidden.dismiss(&ids, now);
    ids
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

/// Polecenia dla wątku rdzenia: lista aplikacji z ustawień i ręczne ukrywanie sesji.
/// Ukrywanie odpowiada listą ukrytych id (do „Cofnij”).
pub enum CoreMsg {
    Apps(pets_core::settings::Apps),
    Dismiss(Vec<String>, Sender<Vec<String>>),
    DismissInactive(Sender<Vec<String>>),
    Undismiss(Vec<String>),
}

pub struct Control(pub std::sync::Mutex<Sender<CoreMsg>>);

/// Polecenie z odpowiedzią (ukryte id). Rdzeń, który nie słucha (tryb odtwarzania), odpowiada od razu pustą listą.
pub fn ask(control: &Sender<CoreMsg>, make: impl FnOnce(Sender<Vec<String>>) -> CoreMsg) -> Vec<String> {
    let (tx, rx) = std::sync::mpsc::channel();
    if control.send(make(tx)).is_err() { return Vec::new(); }
    rx.recv_timeout(Duration::from_secs(2)).unwrap_or_default()
}

/// `snaps`: każda publikowana migawka trafia też do tego kanału (powiadomienia).
pub fn spawn(app: AppHandle, shared: Shared, mode: Mode, snaps: Option<Sender<Snapshot>>,
             msgs: std::sync::mpsc::Receiver<CoreMsg>) {
    std::thread::spawn(move || {
        let publish = |store: &Store, now: i64, hidden: &mut Dismissed| {
            let s = snapshot_of(store, now, hidden);
            *shared.lock().unwrap() = s.clone();
            if let Some(tx) = &snaps { let _ = tx.send(s.clone()); }
            let _ = app.emit("pets://snapshot", s);
        };
        let result = match mode {
            Mode::Live => live(&app, msgs, &publish),
            // odtwarzanie nie obsługuje poleceń: zamknięty kanał daje natychmiastową odpowiedź zamiast czekania 2 s
            Mode::Replay { path, speed } => { drop(msgs); replay(&path, speed, &publish) }
        };
        if let Err(e) = result {
            eprintln!("agent-pets: rdzeń danych zatrzymany: {e:#}");
            // wydanie nie ma konsoli: bez tego użytkownik widziałby tylko pusty pasek
            {
                use tauri::Manager;
                let lang = pets_core::i18n::current(app.state::<crate::settings::SettingsState>().get().language);
                crate::tray::set_status(&app, &failure_text(&e, lang));
            }
        }
    });
}

/// Podpowiedź ikony w trayu przy awarii rdzenia; Windows ucina ją do 127 znaków.
pub fn failure_text(e: &anyhow::Error, lang: Lang) -> String {
    let head = tr(lang, "Agent Pets: rdzeń danych nie działa (", "Agent Pets: data core stopped (");
    let room = 127 - head.chars().count() - 1;
    let msg = format!("{e:#}");
    let msg = if msg.chars().count() > room { format!("{}…", msg.chars().take(room - 1).collect::<String>()) } else { msg };
    format!("{head}{msg})")
}

fn live(app: &AppHandle, msgs: std::sync::mpsc::Receiver<CoreMsg>, publish: &dyn Fn(&Store, i64, &mut Dismissed))
    -> anyhow::Result<()> {
    use tauri::Manager;
    let hidden_path = dismiss::path(&app.state::<crate::settings::SettingsState>().home);
    let mut hidden = Dismissed::load(&hidden_path);
    hidden.prune(now_ms());
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
    publish(rt.store(), now_ms(), &mut hidden);
    loop {
        let now = now_ms();
        let mut changed = false;
        for m in msgs.try_iter() {
            match m {
                CoreMsg::Apps(a) => changed |= rt.set_apps(a),
                CoreMsg::Dismiss(ids, reply) => { hidden.dismiss(&ids, now); let _ = reply.send(ids); changed = true; }
                CoreMsg::DismissInactive(reply) => { let _ = reply.send(dismiss_inactive(rt.store(), &mut hidden, now)); changed = true; }
                CoreMsg::Undismiss(ids) => { hidden.undismiss(&ids); changed = true; }
            }
        }
        changed |= rt.step(now);
        for e in usage.try_iter() { changed |= rt.apply_external(e); }
        if changed {
            publish(rt.store(), now, &mut hidden);
            if let Err(e) = hidden.save_if_dirty(&hidden_path) { eprintln!("agent-pets: {}: {e}", hidden_path.display()); }
            *app.state::<crate::settings::LastSeen>().0.lock().unwrap() =
                rt.last_seen().into_iter().map(|(k, v)| (k.to_string(), v)).collect();
        }
        std::thread::sleep(Duration::from_millis(250));
    }
}

/// Nagrania demo służą do podglądu: nic w nich nie jest ukrywane.
fn replay(path: &Path, speed: f64, publish: &dyn Fn(&Store, i64, &mut Dismissed)) -> anyhow::Result<()> {
    let mut none = Dismissed::default();
    let mut rp = Replay::load(path, speed)?;
    let mut store = Store::new(Timing::default());
    while let Some(d) = rp.next_delay_ms() {
        std::thread::sleep(Duration::from_millis(d));
        if let Some(clock) = rp.apply_next(&mut store) { publish(&store, clock, &mut none); }
    }
    // Po nagraniu zegar płynie dalej w czasie rzeczywistym, więc działają progi (done → idle itd.).
    let end = Instant::now();
    loop {
        std::thread::sleep(Duration::from_millis(250));
        let now = rp.clock() + end.elapsed().as_millis() as i64;
        if !store.tick(now, &|_| true).is_empty() { publish(&store, now, &mut none); }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use pets_core::model::*;
    use pets_core::replay::Replay;
    use pets_core::store::{Store, Timing};
    use pets_core::dismiss::Dismissed;
    use std::path::Path;

    #[test]
    fn snapshot_serializes_like_the_ts_types() {
        let mut store = Store::new(Timing::default());
        let mut e = Event::new(Source::Claude, "s1", Kind::ToolStart, 1_000);
        e.tool = Some(Tool::Edit);
        e.data.progress = Some(Progress { done: 1, total: 4 });
        store.apply(&e);
        let v = serde_json::to_value(snapshot_of(&store, 2_000, &mut Dismissed::default())).unwrap();
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
    fn a_dismissed_session_leaves_the_snapshot_and_returns_on_new_activity() {
        let mut store = Store::new(Timing::default());
        store.apply(&Event::new(Source::Claude, "s1", Kind::Prompt, 1_000));
        store.apply(&Event::new(Source::Claude, "s2", Kind::Prompt, 1_000));
        let mut hidden = Dismissed::default();
        hidden.dismiss(&["s1".into()], 1_500);
        let ids = |s: &Snapshot| s.sessions.iter().map(|x| x.id.clone()).collect::<Vec<_>>();
        assert_eq!(ids(&snapshot_of(&store, 1_600, &mut hidden)), vec!["s2"]);
        store.apply(&Event::new(Source::Claude, "s1", Kind::NeedsInput, 2_000));
        assert_eq!(ids(&snapshot_of(&store, 2_100, &mut hidden)).len(), 2);
    }

    #[test]
    fn remove_inactive_hides_idle_done_and_ended_but_keeps_asking_and_failing_sessions() {
        let path = concat!(env!("CARGO_MANIFEST_DIR"), "/../demo/many-sessions.jsonl");
        let mut rp = Replay::load(Path::new(path), 1000.0).unwrap();
        let mut store = Store::new(Timing::default());
        while rp.apply_next(&mut store).is_some() {}
        let mut hidden = Dismissed::default();
        let gone = dismiss_inactive(&store, &mut hidden, rp.clock());
        assert!(gone.contains(&"d7".to_string()), "{gone:?}");
        assert!(!gone.contains(&"d5".to_string()) && !gone.contains(&"d6".to_string()));
        let left: Vec<_> = snapshot_of(&store, rp.clock(), &mut hidden).sessions.into_iter().map(|s| s.id).collect();
        assert!(left.contains(&"d5".to_string()) && left.contains(&"d6".to_string()) && !left.contains(&"d7".to_string()));
    }

    #[test]
    fn asking_a_core_that_does_not_listen_answers_at_once() {
        let (tx, rx) = std::sync::mpsc::channel::<CoreMsg>();
        drop(rx); // tryb odtwarzania nie czyta poleceń
        let t = std::time::Instant::now();
        assert!(ask(&tx, |r| CoreMsg::Dismiss(vec!["a".into()], r)).is_empty());
        assert!(t.elapsed() < std::time::Duration::from_millis(100));
    }

    #[test]
    fn asking_the_core_returns_its_answer() {
        let (tx, rx) = std::sync::mpsc::channel::<CoreMsg>();
        std::thread::spawn(move || if let Ok(CoreMsg::Dismiss(ids, r)) = rx.recv() { let _ = r.send(ids); });
        assert_eq!(ask(&tx, |r| CoreMsg::Dismiss(vec!["a".into()], r)), vec!["a".to_string()]);
    }

    #[test]
    fn failure_text_names_the_problem_and_fits_the_tray_tooltip() {
        let short = failure_text(&anyhow::anyhow!("brak katalogu domowego"), Lang::Pl);
        assert_eq!(short, "Agent Pets: rdzeń danych nie działa (brak katalogu domowego)");
        let long = failure_text(&anyhow::anyhow!("{}", "ż".repeat(300)), Lang::Pl);
        assert!(long.chars().count() <= 127, "{}", long.chars().count());
        assert!(long.ends_with("…)"));
    }

    #[test]
    fn failure_text_in_english() {
        assert_eq!(failure_text(&anyhow::anyhow!("no home"), Lang::En), "Agent Pets: data core stopped (no home)");
    }

    #[test]
    fn demo_recording_yields_seven_sessions_and_limits() {
        let path = concat!(env!("CARGO_MANIFEST_DIR"), "/../demo/many-sessions.jsonl");
        let mut rp = Replay::load(Path::new(path), 1000.0).unwrap();
        let mut store = Store::new(Timing::default());
        while rp.apply_next(&mut store).is_some() {}
        let snap = snapshot_of(&store, rp.clock(), &mut Dismissed::default());
        assert_eq!(snap.sessions.len(), 7);
        assert_eq!(snap.limits.len(), 4);
        let state = |id: &str| store.session(id).map(|s| s.state);
        assert_eq!(state("d5"), Some(State::NeedsYou));
        assert_eq!(state("d6"), Some(State::Error));
        assert_eq!(state("d7"), Some(State::Done));
    }
}
