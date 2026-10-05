//! When to send a notification (spec 2.4). Pure logic; delivery is in `notify/mod.rs`.
use crate::core::Snapshot;
use pets_core::i18n::{tr, Lang};
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
    lang: Lang,
    primed: bool,
    /// Reported `needs_you` episodes and `done` turns.
    sent: HashSet<String>,
    /// Limit windows over 90% (reported, or already over at startup) → that window's `resets_at`.
    limits: HashMap<(Agent, Window), Option<i64>>,
}

const NEEDS_AFTER_MS: i64 = 15_000;
const LONG_TURN_MS: i64 = 120_000;
const LIMIT_PCT: f32 = 90.0;
/// Below this usage, treat the limit window as new (for limits without reset times and fluctuations around 90%).
const LIMIT_REARM_PCT: f32 = 80.0;
/// The same window's reset time fluctuates between readings; a larger shift indicates a new window.
const RESET_JITTER_MS: i64 = 60_000;

fn name(s: &Session, lang: Lang) -> String {
    if !s.title.is_empty() { return s.title.chars().take(60).collect(); }
    s.cwd.rsplit(['\\', '/']).find(|p| !p.is_empty()).unwrap_or(tr(lang, "Sesja", "Session")).to_string()
}

fn who(agent: Agent) -> &'static str {
    match agent {
        Agent::Claude => "Claude",
        Agent::Codex => "Codex",
        Agent::Opencode => "opencode",
        Agent::Antigravity => "Antigravity",
        Agent::Copilot => "Copilot",
        Agent::Cursor => "Cursor",
        Agent::Grok => "Grok",
        Agent::Zcode => "ZCode",
        Agent::Other => "Agent",
    }
}

fn limit_toast(l: &Limit, lang: Lang) -> Toast {
    let who = who(l.agent);
    let five = l.window == Window::FiveHour;
    let (title, body) = match lang {
        Lang::Pl => { let w = if five { "5h" } else { "tygodniowy" }; (format!("{who}: limit {w}"), format!("Zużyto {:.0}% limitu {w}", l.used_pct)) }
        Lang::En => { let w = if five { "5h" } else { "weekly" }; (format!("{who}: {w} limit"), format!("{:.0}% of the {w} limit used", l.used_pct)) }
    };
    Toast { kind: ToastKind::Limit, session_id: None, title, body }
}

/// The window that was nearly used up has reset.
fn limit_back_toast(agent: Agent, window: Window, lang: Lang) -> Toast {
    let who = who(agent);
    let five = window == Window::FiveHour;
    let (title, body) = match lang {
        Lang::Pl => { let w = if five { "5h" } else { "tygodniowy" }; (format!("{who}: limit {w} odnowiony"), format!("Limit {w} znów jest dostępny")) }
        Lang::En => { let w = if five { "5h" } else { "weekly" }; (format!("{who}: {w} limit reset"), format!("The {w} limit is available again")) }
    };
    Toast { kind: ToastKind::Limit, session_id: None, title, body }
}

impl Rules {
    pub fn set_settings(&mut self, settings: Settings) { self.settings = settings; }
    pub fn set_lang(&mut self, lang: Lang) { self.lang = lang; }

    pub fn new(settings: Settings) -> Rules {
        Rules { settings, lang: Lang::Pl, primed: false, sent: HashSet::new(), limits: HashMap::new() }
    }

    /// First call only remembers state: nothing already present at app startup is reported.
    pub fn observe(&mut self, snap: &Snapshot, now: i64, focused: &dyn Fn(&Session) -> bool) -> Vec<Toast> {
        let mut out = Vec::new();
        let priming = !self.primed;
        self.primed = true;
        // children (subagents, router tasks) send no notifications: approvals still wait with the parent
        for s in snap.sessions.iter().filter(|s| s.parent.is_none()) {
            match s.state {
                State::NeedsYou => {
                    let key = format!("needs:{}:{}", s.id, s.state_since);
                    if priming { self.sent.insert(key); continue; }
                    if self.settings.needs_you && now - s.state_since > NEEDS_AFTER_MS && !self.sent.contains(&key) && !focused(s) {
                        self.sent.insert(key);
                        out.push(Toast { kind: ToastKind::NeedsYou, session_id: Some(s.id.clone()),
                            title: tr(self.lang, "Agent czeka na Ciebie", "Agent needs you").into(),
                            body: format!("{} {}", name(s, self.lang), tr(self.lang, "czeka na Ciebie", "is waiting for you")) });
                    }
                }
                State::Done => if let Some(t) = s.turn_started_at {
                    let key = format!("done:{}:{t}", s.id);
                    if priming { self.sent.insert(key); continue; }
                    if self.settings.done && s.state_since - t > LONG_TURN_MS && self.sent.insert(key) {
                        out.push(Toast { kind: ToastKind::Done, session_id: Some(s.id.clone()), title: tr(self.lang, "Agent skończył", "Agent finished").into(),
                            body: format!("{} {} ({} min)", name(s, self.lang), tr(self.lang, "skończył", "finished"), (s.state_since - t) / 60_000) });
                    }
                },
                _ => {}
            }
        }
        // a window over 90% whose reset time has passed is back, even with no fresh reading (the agent may be closed)
        let mut passed: Vec<(Agent, Window)> = self.limits.iter().filter(|(_, r)| r.is_some_and(|r| now >= r)).map(|(k, _)| *k).collect();
        passed.sort_by_key(|(a, w)| (*a as u8, *w as u8));
        for key in passed { self.limit_back(key, priming, &mut out); }
        for l in snap.limits.iter().filter(|l| l.stale_since.is_none()) {
            let key = (l.agent, l.window);
            // usage dropping well below 90% is a new window too (limits without reset times)
            if l.used_pct < LIMIT_REARM_PCT { self.limit_back(key, priming, &mut out); continue; }
            // a reading of a window that has already reset says nothing about the new one
            if l.used_pct <= LIMIT_PCT || l.resets_at.is_some_and(|r| now >= r) { continue; }
            let new_window = match (self.limits.get(&key), l.resets_at) {
                (None, _) => true,
                (Some(Some(known)), Some(r)) => (r - known).abs() > RESET_JITTER_MS,
                // first reading with a reset time after one without it (Claude app → Claude Code mod): same window
                (Some(None), Some(r)) => { self.limits.insert(key, Some(r)); false }
                (Some(_), None) => false,
            };
            if !new_window { continue; }
            self.limits.insert(key, l.resets_at);
            if !priming && self.settings.limits { out.push(limit_toast(l, self.lang)); }
        }
        out
    }

    /// Forgets a window that was over 90% and says it is back; nothing for a window that never got there.
    fn limit_back(&mut self, key: (Agent, Window), priming: bool, out: &mut Vec<Toast>) {
        if self.limits.remove(&key).is_some() && !priming && self.settings.limits { out.push(limit_back_toast(key.0, key.1, self.lang)); }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use pets_core::model::*;

    fn sess(id: &str, state: State, since: i64, turn: Option<i64>) -> Session {
        Session { id: id.into(), agent: Agent::Claude, origin: Origin::Cli, title: format!("T-{id}"), cwd: String::new(),
            state, tool: None, progress: None, context: None, started_at: 0, last_activity: since, state_since: since,
            turn_started_at: turn, jump: JumpTarget::default(), router_task: None,
            parent: None, sub: None, action: None, question: None, waits_on_child: false, model: None, agent_name: None, usage: None }
    }
    fn snap(sessions: Vec<Session>, limits: Vec<Limit>) -> Snapshot { Snapshot { sessions, limits, agent_usage: vec![], now: 0 } }
    const ALL: Settings = Settings { needs_you: true, done: true, limits: true };

    #[test]
    fn nothing_on_startup_even_if_everything_qualifies() {
        let mut r = Rules::new(ALL);
        let s = snap(vec![sess("a", State::NeedsYou, 0, None), sess("b", State::Done, 200_000, Some(0))],
            vec![Limit { agent: Agent::Codex, window: Window::Weekly, used_pct: 95.0, resets_at: Some(9), stale_since: None }]);
        assert!(r.observe(&s, 300_000, &|_| false).is_empty());
        assert!(r.observe(&s, 301_000, &|_| false).is_empty(), "preexisting episodes do not appear later");
    }

    #[test]
    fn needs_you_after_15_s_unless_focused_and_only_once() {
        let mut r = Rules::new(ALL);
        r.observe(&snap(vec![], vec![]), 0, &|_| false);
        let s = snap(vec![sess("a", State::NeedsYou, 1_000, None)], vec![]);
        assert!(r.observe(&s, 10_000, &|_| false).is_empty());
        assert!(r.observe(&s, 20_000, &|_| true).is_empty(), "session window has focus");
        let t = r.observe(&s, 20_000, &|_| false);
        assert_eq!(t.len(), 1);
        assert_eq!((t[0].kind, t[0].session_id.as_deref()), (ToastKind::NeedsYou, Some("a")));
        assert!(r.observe(&s, 30_000, &|_| false).is_empty());
        let again = snap(vec![sess("a", State::NeedsYou, 50_000, None)], vec![]);
        assert_eq!(r.observe(&again, 70_000, &|_| false).len(), 1, "new episode");
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
    fn toasts_speak_english_when_asked() {
        let mut r = Rules::new(ALL);
        r.set_lang(Lang::En);
        r.observe(&snap(vec![], vec![]), 0, &|_| false);
        let t = r.observe(&snap(vec![sess("b", State::Done, 200_000, Some(0))], vec![]), 201_000, &|_| false);
        assert_eq!((t[0].title.as_str(), t[0].body.as_str()), ("Agent finished", "T-b finished (3 min)"));
        let l = r.observe(&snap(vec![], vec![Limit { agent: Agent::Codex, window: Window::Weekly, used_pct: 95.0, resets_at: Some(9_000_000), stale_since: None }]), 202_000, &|_| false);
        assert_eq!((l[0].title.as_str(), l[0].body.as_str()), ("Codex: weekly limit", "95% of the weekly limit used"));
    }

    #[test]
    fn limit_once_per_window_until_reset() {
        let mut r = Rules::new(ALL);
        r.observe(&snap(vec![], vec![]), 0, &|_| false);
        let l = |pct: f32, reset: i64| Limit { agent: Agent::Claude, window: Window::FiveHour, used_pct: pct, resets_at: Some(reset), stale_since: None };
        const R1: i64 = 18_000_000;
        const R2: i64 = 36_000_000;
        assert!(r.observe(&snap(vec![], vec![l(80.0, R1)]), 1, &|_| false).is_empty());
        assert_eq!(r.observe(&snap(vec![], vec![l(91.0, R1)]), 2, &|_| false).len(), 1);
        assert!(r.observe(&snap(vec![], vec![l(95.0, R1)]), 3, &|_| false).is_empty());
        assert_eq!(r.observe(&snap(vec![], vec![l(92.0, R2)]), 4, &|_| false).len(), 1, "new window after reset");
    }

    #[test]
    fn an_old_reading_never_warns() {
        let mut r = Rules::new(ALL);
        r.observe(&snap(vec![], vec![]), 0, &|_| false);
        let old = Limit { agent: Agent::Claude, window: Window::Weekly, used_pct: 97.0, resets_at: None, stale_since: Some(1) };
        assert!(r.observe(&snap(vec![], vec![old]), 1, &|_| false).is_empty());
    }

    #[test]
    fn limit_without_reset_time_rearms_after_usage_drops() {
        // Claude app limits have no reset time: detect a new window when usage drops.
        let mut r = Rules::new(ALL);
        r.observe(&snap(vec![], vec![]), 0, &|_| false);
        let l = |pct: f32| Limit { agent: Agent::Claude, window: Window::FiveHour, used_pct: pct, resets_at: None, stale_since: None };
        assert_eq!(r.observe(&snap(vec![], vec![l(91.0)]), 1, &|_| false).len(), 1);
        assert!(r.observe(&snap(vec![], vec![l(89.0)]), 2, &|_| false).is_empty());
        assert!(r.observe(&snap(vec![], vec![l(92.0)]), 3, &|_| false).is_empty(), "fluctuation around 90% is still the same window");
        let back = r.observe(&snap(vec![], vec![l(3.0)]), 4, &|_| false);
        assert_eq!(back.iter().map(|t| t.title.as_str()).collect::<Vec<_>>(), ["Claude: limit 5h odnowiony"], "usage dropped: the window reset");
        assert!(r.observe(&snap(vec![], vec![l(2.0)]), 5, &|_| false).is_empty(), "said once");
        assert_eq!(r.observe(&snap(vec![], vec![l(93.0)]), 6, &|_| false).len(), 1, "again after reset");
    }

    #[test]
    fn learning_the_reset_time_of_the_same_window_does_not_toast_again() {
        // claude app reports 91% without reset, then the Claude Code mod reports 92% with reset: still the same window
        let mut r = Rules::new(ALL);
        r.observe(&snap(vec![], vec![]), 0, &|_| false);
        let l = |pct: f32, reset: Option<i64>| Limit { agent: Agent::Claude, window: Window::FiveHour, used_pct: pct, resets_at: reset, stale_since: None };
        assert_eq!(r.observe(&snap(vec![], vec![l(91.0, None)]), 1, &|_| false).len(), 1);
        assert!(r.observe(&snap(vec![], vec![l(92.0, Some(18_000_000))]), 2, &|_| false).is_empty());
        assert!(r.observe(&snap(vec![], vec![l(93.0, Some(18_030_000))]), 3, &|_| false).is_empty(), "reset time fluctuates by seconds");
        assert_eq!(r.observe(&snap(vec![], vec![l(95.0, Some(36_000_000))]), 4, &|_| false).len(), 1, "next window");
    }

    #[test]
    fn a_nearly_used_limit_says_when_its_window_resets() {
        let mut r = Rules::new(ALL);
        r.set_lang(Lang::En);
        r.observe(&snap(vec![], vec![]), 0, &|_| false);
        const R1: i64 = 18_000_000;
        let l = |pct: f32, reset: i64| Limit { agent: Agent::Claude, window: Window::FiveHour, used_pct: pct, resets_at: Some(reset), stale_since: None };
        assert_eq!(r.observe(&snap(vec![], vec![l(95.0, R1)]), 1, &|_| false).len(), 1);
        assert!(r.observe(&snap(vec![], vec![l(95.0, R1)]), R1 - 1, &|_| false).is_empty());
        // the reset time passes before any new reading: the old reading must not warn again
        let back = r.observe(&snap(vec![], vec![l(95.0, R1)]), R1, &|_| false);
        assert_eq!(back.len(), 1);
        assert_eq!((back[0].kind, back[0].title.as_str(), back[0].body.as_str()),
            (ToastKind::Limit, "Claude: 5h limit reset", "The 5h limit is available again"));
        assert!(r.observe(&snap(vec![], vec![l(95.0, R1)]), R1 + 1_000, &|_| false).is_empty(), "the old window stays quiet");
        assert!(r.observe(&snap(vec![], vec![l(4.0, 2 * R1)]), R1 + 2_000, &|_| false).is_empty(), "the new window starts low");
    }

    #[test]
    fn a_reset_is_said_even_when_the_reading_has_gone_stale() {
        // the agent was closed: its limit stops updating, but the reset time still comes
        let mut r = Rules::new(ALL);
        r.observe(&snap(vec![], vec![]), 0, &|_| false);
        let fresh = Limit { agent: Agent::Codex, window: Window::Weekly, used_pct: 96.0, resets_at: Some(50_000), stale_since: None };
        assert_eq!(r.observe(&snap(vec![], vec![fresh]), 1, &|_| false).len(), 1);
        let stale = Limit { stale_since: Some(2), ..fresh };
        assert_eq!(r.observe(&snap(vec![], vec![stale]), 50_000, &|_| false)[0].title, "Codex: limit tygodniowy odnowiony");
    }

    #[test]
    fn no_reset_toast_for_a_limit_that_never_got_near() {
        let mut r = Rules::new(ALL);
        r.observe(&snap(vec![], vec![]), 0, &|_| false);
        let l = |pct: f32| Limit { agent: Agent::Claude, window: Window::FiveHour, used_pct: pct, resets_at: Some(10), stale_since: None };
        assert!(r.observe(&snap(vec![], vec![l(85.0)]), 1, &|_| false).is_empty());
        assert!(r.observe(&snap(vec![], vec![l(1.0)]), 20, &|_| false).is_empty());
    }

    #[test]
    fn a_limit_over_90_at_startup_still_says_when_it_resets_but_not_with_limits_off() {
        let mut r = Rules::new(ALL);
        let l = Limit { agent: Agent::Claude, window: Window::Weekly, used_pct: 99.0, resets_at: Some(1_000), stale_since: None };
        assert!(r.observe(&snap(vec![], vec![l]), 0, &|_| false).is_empty(), "startup is quiet");
        assert_eq!(r.observe(&snap(vec![], vec![]), 1_000, &|_| false).len(), 1);
        let mut off = Rules::new(Settings { needs_you: true, done: true, limits: false });
        off.observe(&snap(vec![], vec![l]), 0, &|_| false);
        assert!(off.observe(&snap(vec![], vec![]), 1_000, &|_| false).is_empty());
    }

    #[test]
    fn settings_changed_later_take_effect() {
        let mut r = Rules::new(ALL);
        r.observe(&snap(vec![], vec![]), 0, &|_| false);
        r.set_settings(Settings { needs_you: false, done: true, limits: true });
        assert!(r.observe(&snap(vec![sess("a", State::NeedsYou, 0, None)], vec![]), 60_000, &|_| false).is_empty());
        r.set_settings(ALL);
        assert_eq!(r.observe(&snap(vec![sess("b", State::NeedsYou, 0, None)], vec![]), 60_000, &|_| false).len(), 1);
    }

    #[test]
    fn disabled_kinds_stay_silent() {
        let mut r = Rules::new(Settings { needs_you: false, done: true, limits: true });
        r.observe(&snap(vec![], vec![]), 0, &|_| false);
        assert!(r.observe(&snap(vec![sess("a", State::NeedsYou, 0, None)], vec![]), 60_000, &|_| false).is_empty());
    }

    #[test]
    fn children_never_toast() {
        let mut r = Rules::new(ALL);
        r.observe(&snap(vec![], vec![]), 0, &|_| false);
        let mut c = sess("c", State::Done, 200_000, Some(0));
        c.parent = Some("p".into());
        let mut n = sess("n", State::NeedsYou, 0, None);
        n.parent = Some("p".into());
        assert!(r.observe(&snap(vec![c, n], vec![]), 300_000, &|_| false).is_empty());
    }
}
