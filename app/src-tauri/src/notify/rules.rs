//! Kiedy wysłać powiadomienie (spec 2.4). Czysta logika; dostarczanie jest w `notify/mod.rs`.
use crate::core::Snapshot;
use pets_core::model::{Agent, Limit, Session, State, Window};
use std::collections::{HashMap, HashSet};

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Settings { pub needs_you: bool, pub done: bool, pub limits: bool }

impl Default for Settings { fn default() -> Self { Settings { needs_you: true, done: true, limits: true } } }

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ToastKind { NeedsYou, Done, Limit }

#[derive(Clone, Debug, PartialEq)]
pub struct Toast { pub kind: ToastKind, pub session_id: Option<String>, pub title: String, pub body: String }

pub struct Rules {
    settings: Settings,
    primed: bool,
    /// zgłoszone epizody `needs_you` i tury `done`
    sent: HashSet<String>,
    /// okna limitów już zgłoszone: klucz (agent, okno) → `resets_at` zgłoszonego okna
    limits: HashMap<String, Option<i64>>,
}

const NEEDS_AFTER_MS: i64 = 15_000;
const LONG_TURN_MS: i64 = 120_000;
const LIMIT_PCT: f32 = 90.0;
/// Poniżej tego zużycia okno limitu uznajemy za nowe (dla limitów bez czasu resetu i przeciw wahaniom wokół 90%).
const LIMIT_REARM_PCT: f32 = 80.0;
/// Czas resetu tego samego okna drga między odczytami; nowe okno to reset przesunięty o więcej niż to.
const RESET_JITTER_MS: i64 = 60_000;

fn name(s: &Session) -> String {
    if !s.title.is_empty() { return s.title.chars().take(60).collect(); }
    s.cwd.rsplit(['\\', '/']).find(|p| !p.is_empty()).unwrap_or("Sesja").to_string()
}

fn limit_toast(l: &Limit) -> Toast {
    let who = match l.agent { Agent::Claude => "Claude", Agent::Codex => "Codex" };
    let win = match l.window { Window::FiveHour => "5h", Window::Weekly => "tygodniowy" };
    Toast { kind: ToastKind::Limit, session_id: None, title: format!("{who}: limit {win}"),
        body: format!("Zużyto {:.0}% limitu {win}", l.used_pct) }
}

impl Rules {
    pub fn new(settings: Settings) -> Rules {
        Rules { settings, primed: false, sent: HashSet::new(), limits: HashMap::new() }
    }

    /// Pierwsze wywołanie tylko zapamiętuje stan: nic zastanego przy starcie aplikacji nie jest zgłaszane.
    pub fn observe(&mut self, snap: &Snapshot, now: i64, focused: &dyn Fn(&Session) -> bool) -> Vec<Toast> {
        let mut out = Vec::new();
        let priming = !self.primed;
        self.primed = true;
        for s in &snap.sessions {
            match s.state {
                State::NeedsYou => {
                    let key = format!("needs:{}:{}", s.id, s.state_since);
                    if priming { self.sent.insert(key); continue; }
                    if self.settings.needs_you && now - s.state_since > NEEDS_AFTER_MS && !self.sent.contains(&key) && !focused(s) {
                        self.sent.insert(key);
                        out.push(Toast { kind: ToastKind::NeedsYou, session_id: Some(s.id.clone()),
                            title: "Agent czeka na Ciebie".into(), body: format!("{} czeka na Ciebie", name(s)) });
                    }
                }
                State::Done => if let Some(t) = s.turn_started_at {
                    let key = format!("done:{}:{t}", s.id);
                    if priming { self.sent.insert(key); continue; }
                    if self.settings.done && s.state_since - t > LONG_TURN_MS && self.sent.insert(key) {
                        out.push(Toast { kind: ToastKind::Done, session_id: Some(s.id.clone()), title: "Agent skończył".into(),
                            body: format!("{} skończył ({} min)", name(s), (s.state_since - t) / 60_000) });
                    }
                },
                _ => {}
            }
        }
        for l in &snap.limits {
            let key = format!("{:?}:{:?}", l.agent, l.window);
            if l.used_pct < LIMIT_REARM_PCT { self.limits.remove(&key); continue; }
            if l.used_pct <= LIMIT_PCT { continue; }
            let new_window = match (self.limits.get(&key), l.resets_at) {
                (None, _) => true,
                (Some(Some(known)), Some(r)) => (r - known).abs() > RESET_JITTER_MS,
                // pierwszy odczyt z czasem resetu po odczycie bez niego (aplikacja Claude → statusline): to samo okno
                (Some(None), Some(r)) => { self.limits.insert(key.clone(), Some(r)); false }
                (Some(_), None) => false,
            };
            if !new_window { continue; }
            self.limits.insert(key, l.resets_at);
            if !priming && self.settings.limits { out.push(limit_toast(l)); }
        }
        out
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use pets_core::model::*;

    fn sess(id: &str, state: State, since: i64, turn: Option<i64>) -> Session {
        Session { id: id.into(), agent: Agent::Claude, origin: Origin::Cli, title: format!("T-{id}"), cwd: String::new(),
            state, tool: None, progress: None, context: None, started_at: 0, last_activity: since, state_since: since,
            turn_started_at: turn, jump: JumpTarget::default(), router_task: None }
    }
    fn snap(sessions: Vec<Session>, limits: Vec<Limit>) -> Snapshot { Snapshot { sessions, limits, now: 0 } }
    const ALL: Settings = Settings { needs_you: true, done: true, limits: true };

    #[test]
    fn nothing_on_startup_even_if_everything_qualifies() {
        let mut r = Rules::new(ALL);
        let s = snap(vec![sess("a", State::NeedsYou, 0, None), sess("b", State::Done, 200_000, Some(0))],
            vec![Limit { agent: Agent::Codex, window: Window::Weekly, used_pct: 95.0, resets_at: Some(9) }]);
        assert!(r.observe(&s, 300_000, &|_| false).is_empty());
        assert!(r.observe(&s, 301_000, &|_| false).is_empty(), "zastane epizody nie wyskakują później");
    }

    #[test]
    fn needs_you_after_15_s_unless_focused_and_only_once() {
        let mut r = Rules::new(ALL);
        r.observe(&snap(vec![], vec![]), 0, &|_| false);
        let s = snap(vec![sess("a", State::NeedsYou, 1_000, None)], vec![]);
        assert!(r.observe(&s, 10_000, &|_| false).is_empty());
        assert!(r.observe(&s, 20_000, &|_| true).is_empty(), "okno sesji ma fokus");
        let t = r.observe(&s, 20_000, &|_| false);
        assert_eq!(t.len(), 1);
        assert_eq!((t[0].kind, t[0].session_id.as_deref()), (ToastKind::NeedsYou, Some("a")));
        assert!(r.observe(&s, 30_000, &|_| false).is_empty());
        let again = snap(vec![sess("a", State::NeedsYou, 50_000, None)], vec![]);
        assert_eq!(r.observe(&again, 70_000, &|_| false).len(), 1, "nowy epizod");
    }

    #[test]
    fn done_only_after_long_turns() {
        let mut r = Rules::new(ALL);
        r.observe(&snap(vec![], vec![]), 0, &|_| false);
        assert!(r.observe(&snap(vec![sess("a", State::Done, 60_000, Some(0))], vec![]), 61_000, &|_| false).is_empty());
        let t = r.observe(&snap(vec![sess("b", State::Done, 200_000, Some(0))], vec![]), 201_000, &|_| false);
        assert_eq!((t.len(), t[0].kind), (1, ToastKind::Done));
        assert_eq!(t[0].body, "T-b skończył (3 min)");
    }

    #[test]
    fn limit_once_per_window_until_reset() {
        let mut r = Rules::new(ALL);
        r.observe(&snap(vec![], vec![]), 0, &|_| false);
        let l = |pct: f32, reset: i64| Limit { agent: Agent::Claude, window: Window::FiveHour, used_pct: pct, resets_at: Some(reset) };
        const R1: i64 = 18_000_000;
        const R2: i64 = 36_000_000;
        assert!(r.observe(&snap(vec![], vec![l(80.0, R1)]), 1, &|_| false).is_empty());
        assert_eq!(r.observe(&snap(vec![], vec![l(91.0, R1)]), 2, &|_| false).len(), 1);
        assert!(r.observe(&snap(vec![], vec![l(95.0, R1)]), 3, &|_| false).is_empty());
        assert_eq!(r.observe(&snap(vec![], vec![l(92.0, R2)]), 4, &|_| false).len(), 1, "nowe okno po resecie");
    }

    #[test]
    fn limit_without_reset_time_rearms_after_usage_drops() {
        // Limity z aplikacji Claude nie mają czasu resetu: nowe okno poznajemy po spadku zużycia.
        let mut r = Rules::new(ALL);
        r.observe(&snap(vec![], vec![]), 0, &|_| false);
        let l = |pct: f32| Limit { agent: Agent::Claude, window: Window::FiveHour, used_pct: pct, resets_at: None };
        assert_eq!(r.observe(&snap(vec![], vec![l(91.0)]), 1, &|_| false).len(), 1);
        assert!(r.observe(&snap(vec![], vec![l(89.0)]), 2, &|_| false).is_empty());
        assert!(r.observe(&snap(vec![], vec![l(92.0)]), 3, &|_| false).is_empty(), "wahanie wokół 90% to wciąż to samo okno");
        assert!(r.observe(&snap(vec![], vec![l(3.0)]), 4, &|_| false).is_empty());
        assert_eq!(r.observe(&snap(vec![], vec![l(93.0)]), 5, &|_| false).len(), 1, "po resecie znowu");
    }

    #[test]
    fn learning_the_reset_time_of_the_same_window_does_not_toast_again() {
        // aplikacja Claude zgłasza 91% bez resetu, chwilę później statusline 92% z resetem: to wciąż to samo okno
        let mut r = Rules::new(ALL);
        r.observe(&snap(vec![], vec![]), 0, &|_| false);
        let l = |pct: f32, reset: Option<i64>| Limit { agent: Agent::Claude, window: Window::FiveHour, used_pct: pct, resets_at: reset };
        assert_eq!(r.observe(&snap(vec![], vec![l(91.0, None)]), 1, &|_| false).len(), 1);
        assert!(r.observe(&snap(vec![], vec![l(92.0, Some(18_000_000))]), 2, &|_| false).is_empty());
        assert!(r.observe(&snap(vec![], vec![l(93.0, Some(18_030_000))]), 3, &|_| false).is_empty(), "reset drga o sekundy");
        assert_eq!(r.observe(&snap(vec![], vec![l(95.0, Some(36_000_000))]), 4, &|_| false).len(), 1, "następne okno");
    }

    #[test]
    fn disabled_kinds_stay_silent() {
        let mut r = Rules::new(Settings { needs_you: false, done: true, limits: true });
        r.observe(&snap(vec![], vec![]), 0, &|_| false);
        assert!(r.observe(&snap(vec![sess("a", State::NeedsYou, 0, None)], vec![]), 60_000, &|_| false).is_empty());
    }
}
