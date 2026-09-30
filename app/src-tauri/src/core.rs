//! Core thread: events from `pets-core` → state snapshot for the UI (`pets://snapshot`).
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
    /// Daily totals for agents with their own database (opencode, spec 0.11 §4.2).
    pub agent_usage: Vec<pets_core::model::AgentUsage>,
    /// Core clock (ms); differs from wall clock in replay mode.
    pub now: i64,
}

pub type Shared = Arc<Mutex<Snapshot>>;

/// Snapshot without manually hidden sessions (those active since being hidden return).
/// A child (subagent) is visible only with a visible parent: hiding the parent hides its children.
pub fn snapshot_of(store: &Store, now: i64, hidden: &mut Dismissed) -> Snapshot {
    let sessions = with_parents(hidden.filter(store.sessions().into_iter().cloned().collect()));
    Snapshot { sessions, limits: store.limits().to_vec(), agent_usage: store.agent_usage().to_vec(), now }
}

fn with_parents(mut v: Vec<Session>) -> Vec<Session> {
    loop {
        let ids: std::collections::HashSet<String> = v.iter().map(|s| s.id.clone()).collect();
        let before = v.len();
        v.retain(|s| s.parent.as_ref().map(|p| ids.contains(p)).unwrap_or(true));
        if v.len() == before { return v; }
    }
}

/// "Remove inactive": hides visible sessions in idle states and returns their IDs (for "Undo").
/// A child is not hidden separately: it disappears with its parent or on its own when finished.
pub fn dismiss_inactive(store: &Store, hidden: &mut Dismissed, now: i64) -> Vec<String> {
    let ids: Vec<String> = hidden.filter(store.sessions().into_iter().cloned().collect())
        .into_iter().filter(|s| s.parent.is_none() && dismiss::inactive(s)).map(|s| s.id).collect();
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

/// Commands for the core thread: app list from settings and manual session hiding.
/// Hiding responds with a list of hidden IDs (for "Undo").
pub enum CoreMsg {
    Apps(pets_core::settings::Apps),
    Lang(Lang),
    Dismiss(Vec<String>, Sender<Vec<String>>),
    DismissInactive(Sender<Vec<String>>),
    Undismiss(Vec<String>),
}

pub struct Control(pub std::sync::Mutex<Sender<CoreMsg>>);

/// Command with a response (hidden IDs). A non-listening core (replay mode) responds immediately with an empty list.
pub fn ask(control: &Sender<CoreMsg>, make: impl FnOnce(Sender<Vec<String>>) -> CoreMsg) -> Vec<String> {
    let (tx, rx) = std::sync::mpsc::channel();
    if control.send(make(tx)).is_err() { return Vec::new(); }
    rx.recv_timeout(Duration::from_secs(2)).unwrap_or_default()
}

/// `snaps`: each published snapshot also goes to this channel (notifications).
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
            // replay does not handle commands: a closed channel responds immediately instead of waiting 2 s
            Mode::Replay { path, speed } => { drop(msgs); replay(&path, speed, &publish) }
        };
        if let Err(e) = result {
            pets_core::app_log!("data core stopped: {e:#}");
            // release builds have no console: otherwise the user would see only an empty taskbar area
            {
                use tauri::Manager;
                let lang = pets_core::i18n::current(app.state::<crate::settings::SettingsState>().get().language);
                crate::tray::set_status(&app, &failure_text(&e, lang));
            }
        }
    });
}

/// Tray icon tooltip on core failure; Windows truncates it to 127 characters.
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
    cfg.lang = pets_core::i18n::current(app.state::<crate::settings::SettingsState>().get().language);
    let mut rt = Runtime::start(cfg)?;
    // claude account limits from the Anthropic server (exact reset times, independent of CLI sessions), only with consent
    let (usage_tx, usage) = std::sync::mpsc::channel();
    let a = app.clone();
    let has_token = crate::usage::spawn(usage_tx, move || a.state::<crate::settings::SettingsState>().get().claude_plan_usage);
    // antigravity limits from its local server when Antigravity is enabled in settings
    let (ag_tx, ag_usage) = std::sync::mpsc::channel();
    let a = app.clone();
    crate::antigravity_usage::spawn(ag_tx, move || a.state::<crate::settings::SettingsState>().get().apps.antigravity);
    // The first snapshot briefly waits for server limits: notification rules then treat an existing limit
    // above 90% as preexisting at launch rather than new.
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
                CoreMsg::Lang(l) => rt.set_lang(l),
                CoreMsg::Dismiss(ids, reply) => { hidden.dismiss(&ids, now); let _ = reply.send(ids); changed = true; }
                CoreMsg::DismissInactive(reply) => { let _ = reply.send(dismiss_inactive(rt.store(), &mut hidden, now)); changed = true; }
                CoreMsg::Undismiss(ids) => { hidden.undismiss(&ids); changed = true; }
            }
        }
        changed |= rt.step(now);
        for e in usage.try_iter() { changed |= rt.apply_external(e); }
        for u in ag_usage.try_iter() { changed |= rt.antigravity_usage(u); }
        if changed {
            publish(rt.store(), now, &mut hidden);
            if let Err(e) = hidden.save_if_dirty(&hidden_path) { pets_core::app_log!("{}: {e}", hidden_path.display()); }
            *app.state::<crate::settings::LastSeen>().0.lock().unwrap() =
                rt.last_seen().into_iter().map(|(k, v)| (k.to_string(), v)).collect();
        }
        std::thread::sleep(Duration::from_millis(250));
    }
}

/// Demo recordings are for preview: nothing is hidden in them.
fn replay(path: &Path, speed: f64, publish: &dyn Fn(&Store, i64, &mut Dismissed)) -> anyhow::Result<()> {
    let mut none = Dismissed::default();
    let mut rp = Replay::load(path, speed)?;
    let mut store = Store::new(Timing::default());
    while let Some(d) = rp.next_delay_ms() {
        std::thread::sleep(Duration::from_millis(d));
        if let Some(clock) = rp.apply_next(&mut store) { publish(&store, clock, &mut none); }
    }
    // After the recording, the clock continues in real time so thresholds still work (done → idle, etc.).
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
        drop(rx); // replay mode does not read commands
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
        let short = failure_text(&anyhow::anyhow!("home directory missing"), Lang::Pl);
        assert_eq!(short, "Agent Pets: rdzeń danych nie działa (home directory missing)");
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

    fn child(store: &mut Store, id: &str, parent: &str, ts: i64) {
        let mut e = Event::new(Source::Claude, id, Kind::Prompt, ts);
        e.data.parent = Some(parent.into());
        e.data.sub = Some(SubInfo { kind: SubKind::Claude, agent_type: None, description: None, background: false });
        store.apply(&e);
    }

    #[test]
    fn hiding_a_parent_hides_its_children() {
        let mut store = Store::new(Timing::default());
        store.apply(&Event::new(Source::Claude, "p", Kind::Prompt, 1_000));
        store.apply(&Event::new(Source::Claude, "q", Kind::Prompt, 1_000));
        child(&mut store, "p/a", "p", 1_000);
        child(&mut store, "q/b", "q", 1_000);
        let mut hidden = Dismissed::default();
        hidden.dismiss(&["p".into()], 1_500);
        let ids: Vec<String> = snapshot_of(&store, 1_600, &mut hidden).sessions.into_iter().map(|s| s.id).collect();
        assert_eq!(ids, vec!["q".to_string(), "q/b".to_string()]);
    }

    #[test]
    fn remove_inactive_never_picks_a_child_on_its_own() {
        let mut store = Store::new(Timing::default());
        store.apply(&Event::new(Source::Claude, "p", Kind::Prompt, 1_000));
        child(&mut store, "p/a", "p", 1_000);
        store.apply(&{ let mut e = Event::new(Source::Claude, "p/a", Kind::TurnEnd, 2_000); e.data.parent = Some("p".into()); e });
        let gone = dismiss_inactive(&store, &mut Dismissed::default(), 3_000);
        assert!(gone.is_empty(), "{gone:?}");
    }
}
