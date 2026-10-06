//! Two system-wide shortcuts (settings, "General"): jump to the agent that needs you, and show or hide the panel.
use crate::{core, panel, settings};
use pets_core::model::{Session, State};
use pets_core::settings::Hotkeys;
use serde::Serialize;
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};

/// A finished session older than this is no longer "the one you want" when nothing is waiting.
const RECENT_DONE_MS: i64 = 30 * 60_000;

#[derive(Debug, PartialEq)]
pub enum Target { Session(String), Panel }

/// Where the jump shortcut goes: the session that has waited longest (waiting or failed, as the panel's urgent list),
/// else the latest one that finished within 30 minutes, else just the panel. Subagents are never the target.
pub fn pick_target(sessions: &[Session], now: i64) -> Target {
    let top = || sessions.iter().filter(|s| s.parent.is_none());
    if let Some(s) = top().filter(|s| matches!(s.state, State::NeedsYou | State::Error)).min_by_key(|s| s.state_since) {
        return Target::Session(s.id.clone());
    }
    match top().filter(|s| s.state == State::Done && now - s.state_since <= RECENT_DONE_MS).max_by_key(|s| s.state_since) {
        Some(s) => Target::Session(s.id.clone()),
        None => Target::Panel,
    }
}

/// Registration outcome per shortcut: `None` = fine (or off), otherwise why it failed.
#[derive(Serialize, Clone, Debug, Default, PartialEq)]
pub struct HotkeyStatus { pub jump: Option<String>, pub panel: Option<String> }

#[derive(Default)]
pub struct HotkeyState {
    status: Mutex<HotkeyStatus>,
    /// Registrations wait for the main thread, so they run on their own thread, one at a time.
    busy: Mutex<()>,
}

type Slot = Result<Option<Shortcut>, String>;

fn parse(s: &Option<String>) -> Slot {
    match s.as_deref().map(str::trim).filter(|s| !s.is_empty()) {
        None => Ok(None),
        Some(s) => s.parse::<Shortcut>().map(Some).map_err(|e| e.to_string()),
    }
}

/// Parses both; the same combo twice goes to the jump shortcut and the panel one reports the conflict.
fn plan(h: &Hotkeys) -> (Slot, Slot) {
    let (jump, panel) = (parse(&h.jump), parse(&h.panel));
    match (&jump, &panel) {
        (Ok(Some(a)), Ok(Some(b))) if a == b => (jump, Err("the same shortcut as the jump shortcut".into())),
        _ => (jump, panel),
    }
}

#[derive(Clone, Copy)]
enum Action { Jump, Panel }

fn run(app: &AppHandle, action: Action) {
    match action {
        Action::Panel => panel::toggle(app, None),
        Action::Jump => {
            let (sessions, now) = { let s = app.state::<core::Shared>(); let g = s.lock().unwrap(); (g.sessions.clone(), g.now) };
            match pick_target(&sessions, now) {
                // as the toast's "Open": a jump that needs attention (clipboard, failure) says so in the panel
                Target::Session(id) => {
                    let r = crate::jump_to(app, &id);
                    if r.needs_attention() { panel::open_with_status(app, Some(id), r.detail); }
                }
                Target::Panel => panel::open(app, None),
            }
        }
    }
}

fn attach(app: &AppHandle, name: &str, slot: Slot, action: Action) -> Option<String> {
    let fail = |e: String| { pets_core::app_log!("hotkey {name}: {e}"); Some(e) };
    match slot {
        Ok(None) => None,
        Err(e) => fail(e),
        Ok(Some(sc)) => app.global_shortcut().on_shortcut(sc, move |app, _, ev| {
            // key press only (the release comes too); the jump can take a while, so not on the event loop
            if ev.state == ShortcutState::Pressed { let app = app.clone(); std::thread::spawn(move || run(&app, action)); }
        }).err().and_then(|e| fail(e.to_string())),
    }
}

/// Drops ours and registers what the settings say now; the result goes to `hotkeys_status` and `pets://hotkeys`.
/// Called at startup and from `apply_effects` (a command thread is the main thread: never wait for it here).
pub fn apply(app: &AppHandle) {
    let app = app.clone();
    std::thread::spawn(move || {
        let state = app.state::<HotkeyState>();
        let _one_at_a_time = state.busy.lock().unwrap();
        // read the settings after taking the turn: the latest change wins whatever order the threads ran in
        let h = app.state::<settings::SettingsState>().get().hotkeys;
        if let Err(e) = app.global_shortcut().unregister_all() { pets_core::app_log!("hotkeys: could not release the old ones: {e}"); }
        let (jump, panel) = plan(&h);
        let status = HotkeyStatus { jump: attach(&app, "jump", jump, Action::Jump), panel: attach(&app, "panel", panel, Action::Panel) };
        *state.status.lock().unwrap() = status.clone();
        let _ = app.emit("pets://hotkeys", &status);
    });
}

#[tauri::command]
pub fn hotkeys_status(state: tauri::State<HotkeyState>) -> HotkeyStatus { state.status.lock().unwrap().clone() }

#[cfg(test)]
mod tests {
    use super::*;
    use pets_core::model::*;

    const MIN: i64 = 60_000;
    const NOW: i64 = 10_000 * MIN;

    fn sess(id: &str, state: State, since: i64) -> Session {
        Session { id: id.into(), agent: Agent::Claude, origin: Origin::Cli, title: id.into(), cwd: String::new(),
            state, tool: None, progress: None, context: None, started_at: 0, last_activity: since, state_since: since,
            turn_started_at: None, jump: JumpTarget::default(), router_task: None,
            parent: None, sub: None, action: None, question: None, waits_on_child: false, model: None, agent_name: None, usage: None, pinned: false, renamed: false }
    }
    fn child(mut s: Session) -> Session { s.parent = Some("p".into()); s }
    fn sid(id: &str) -> Target { Target::Session(id.into()) }

    #[test]
    fn the_session_that_waited_longest_wins() {
        let v = [sess("new", State::NeedsYou, NOW - MIN), sess("old", State::NeedsYou, NOW - 20 * MIN), sess("mid", State::NeedsYou, NOW - 5 * MIN)];
        assert_eq!(pick_target(&v, NOW), sid("old"));
    }

    #[test]
    fn a_failed_session_is_as_urgent_as_a_waiting_one() {
        let v = [sess("w", State::NeedsYou, NOW - MIN), sess("e", State::Error, NOW - 9 * MIN)];
        assert_eq!(pick_target(&v, NOW), sid("e"));
        let v = [sess("e", State::Error, NOW - MIN), sess("w", State::NeedsYou, NOW - 9 * MIN)];
        assert_eq!(pick_target(&v, NOW), sid("w"));
    }

    #[test]
    fn waiting_beats_a_fresh_done() {
        let v = [sess("d", State::Done, NOW - MIN), sess("w", State::NeedsYou, NOW - 25 * MIN)];
        assert_eq!(pick_target(&v, NOW), sid("w"));
    }

    #[test]
    fn subagents_are_never_the_target() {
        let v = [child(sess("c", State::NeedsYou, NOW - 30 * MIN)), child(sess("cd", State::Done, NOW - MIN))];
        assert_eq!(pick_target(&v, NOW), Target::Panel);
        let v = [child(sess("c", State::NeedsYou, NOW - 30 * MIN)), sess("p", State::NeedsYou, NOW - MIN)];
        assert_eq!(pick_target(&v, NOW), sid("p"));
    }

    #[test]
    fn with_nothing_waiting_the_latest_recent_done_wins() {
        let v = [sess("a", State::Done, NOW - 10 * MIN), sess("b", State::Done, NOW - 2 * MIN), sess("w", State::Working, NOW - 40 * MIN)];
        assert_eq!(pick_target(&v, NOW), sid("b"));
    }

    #[test]
    fn a_done_older_than_half_an_hour_is_ignored() {
        assert_eq!(pick_target(&[sess("a", State::Done, NOW - 31 * MIN)], NOW), Target::Panel);
        assert_eq!(pick_target(&[sess("a", State::Done, NOW - 30 * MIN)], NOW), sid("a"));
    }

    #[test]
    fn nothing_to_go_to_opens_the_panel() {
        assert_eq!(pick_target(&[], NOW), Target::Panel);
        assert_eq!(pick_target(&[sess("i", State::Idle, NOW - MIN), sess("t", State::Thinking, NOW - MIN), sess("e", State::Ended, NOW - MIN)], NOW), Target::Panel);
    }

    fn keys(jump: Option<&str>, panel: Option<&str>) -> Hotkeys { Hotkeys { jump: jump.map(Into::into), panel: panel.map(Into::into) } }

    #[test]
    fn the_defaults_parse() {
        let (j, p) = plan(&Hotkeys::default());
        assert!(matches!(j, Ok(Some(_))) && matches!(p, Ok(Some(_))));
    }

    #[test]
    fn off_and_blank_register_nothing_and_garbage_is_an_error() {
        let (j, p) = plan(&keys(None, Some("  ")));
        assert_eq!((j, p), (Ok(None), Ok(None)));
        let (j, p) = plan(&keys(Some("Super+Shift+Nope"), Some("Ctrl+Shift+F2")));
        assert!(j.is_err() && matches!(p, Ok(Some(_))));
    }

    #[test]
    fn the_same_combo_twice_keeps_jump_and_flags_the_panel() {
        // spelling does not matter: the parsed combos are compared
        let (j, p) = plan(&keys(Some("Super+Shift+J"), Some("shift+super+j")));
        assert!(matches!(j, Ok(Some(_))) && p.is_err());
        let (j, p) = plan(&keys(Some("Super+Shift+J"), Some("Super+Shift+K")));
        assert!(matches!(j, Ok(Some(_))) && matches!(p, Ok(Some(_))));
    }
}
