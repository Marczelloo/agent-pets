use std::collections::BTreeMap;
use crate::model::*;

#[derive(Clone, Copy, Debug)]
pub struct Timing {
    pub dwell_ms: i64,
    pub done_to_idle_ms: i64,
    pub stale_to_idle_ms: i64,
    pub idle_to_sleep_ms: i64,
    pub to_ended_ms: i64,
    pub exit_ms: i64,
}

impl Default for Timing {
    fn default() -> Self {
        Timing { dwell_ms: 600, done_to_idle_ms: 120_000, stale_to_idle_ms: 600_000,
                 idle_to_sleep_ms: 600_000, to_ended_ms: 1_800_000, exit_ms: 1_500 }
    }
}

#[derive(Clone, Debug, PartialEq)]
pub enum Change { Upsert(Session), Removed(String), Limits(Vec<Limit>) }

pub struct Store {
    pub timing: Timing,
    sessions: BTreeMap<String, Session>,
    pending: BTreeMap<String, (State, Option<Tool>)>,
    ended_at: BTreeMap<String, i64>,
    limits: Vec<Limit>,
}

fn new_session(e: &Event) -> Session {
    let origin = e.data.origin.unwrap_or(match e.source {
        Source::Claude => Origin::Cli,
        Source::Codex => Origin::Desktop,
        Source::Router => Origin::Router,
    });
    Session {
        id: e.session_id.clone(),
        agent: e.agent(),
        origin,
        title: String::new(),
        cwd: String::new(),
        state: State::Idle,
        tool: None,
        progress: None,
        context: None,
        started_at: e.ts,
        last_activity: e.ts,
        state_since: e.ts,
        turn_started_at: None,
        jump: JumpTarget { session_id: e.session_id.clone(), ..Default::default() },
    }
}

fn merge(s: &mut Session, d: &EventData) {
    if let Some(t) = &d.title { if !t.is_empty() { s.title = t.clone(); } }
    if let Some(c) = &d.cwd { s.cwd = c.clone(); s.jump.cwd = c.clone(); }
    if let Some(o) = d.origin { s.origin = o; }
    if let Some(p) = d.progress { s.progress = Some(p); }
    if let Some(c) = d.context { s.context = Some(c); }
    if let Some(p) = d.pid { s.jump.pid = Some(p); }
    if let Some(a) = d.app { s.jump.app = Some(a); }
}

fn set(s: &mut Session, st: State, tool: Option<Tool>, now: i64) {
    s.state = st;
    s.tool = if st == State::Working { tool } else { None };
    s.state_since = now;
}

impl Store {
    pub fn new(timing: Timing) -> Self {
        Store { timing, sessions: BTreeMap::new(), pending: BTreeMap::new(),
                ended_at: BTreeMap::new(), limits: Vec::new() }
    }

    pub fn session(&self, id: &str) -> Option<&Session> { self.sessions.get(id) }

    pub fn sessions(&self) -> Vec<&Session> {
        let mut v: Vec<&Session> = self.sessions.values().collect();
        v.sort_by_key(|s| (s.started_at, s.id.clone()));
        v
    }

    pub fn limits(&self) -> &[Limit] { &self.limits }

    fn merge_limits(&mut self, new: &[Limit]) {
        for l in new {
            match self.limits.iter_mut().find(|x| x.agent == l.agent && x.window == l.window) {
                Some(x) => *x = *l,
                None => self.limits.push(*l),
            }
        }
    }

    pub fn apply(&mut self, e: &Event) -> Vec<Change> {
        let mut out = Vec::new();
        if !e.data.limits.is_empty() {
            self.merge_limits(&e.data.limits);
            out.push(Change::Limits(self.limits.clone()));
        }
        if e.kind == Kind::Limits { return out; }

        let dwell = self.timing.dwell_ms;
        // nowa sesja przyjmuje pierwszy stan od razu, bez czekania na minimalny czas
        let is_new = !self.sessions.contains_key(&e.session_id);
        let s = self.sessions.entry(e.session_id.clone()).or_insert_with(|| new_session(e));
        merge(s, &e.data);
        if e.ts < s.last_activity {
            out.push(Change::Upsert(s.clone()));
            return out;
        }
        s.last_activity = e.ts;

        let target: Option<(State, Option<Tool>)> = match e.kind {
            Kind::Prompt => { s.turn_started_at = Some(e.ts); Some((State::Thinking, None)) }
            Kind::ToolStart => Some((State::Working, e.tool.or(Some(Tool::Other)))),
            Kind::ToolEnd => Some((State::Thinking, None)),
            Kind::NeedsInput => Some((State::NeedsYou, None)),
            Kind::TurnEnd => Some((State::Done, None)),
            Kind::Error => Some((State::Error, None)),
            Kind::Compact => Some((State::Compacting, None)),
            Kind::SessionStart => if s.state == State::Ended { Some((State::Idle, None)) } else { None },
            Kind::Meta => match (s.state, s.context) {
                (State::Thinking, Some(c)) if c.max > 0 && c.used as f64 / c.max as f64 > 0.9 =>
                    Some((State::Compacting, None)),
                _ => None,
            },
            Kind::SessionEnd | Kind::Limits => None,
        };

        if e.kind == Kind::SessionEnd {
            set(s, State::Ended, None, e.ts);
            self.pending.remove(&e.session_id);
            self.ended_at.insert(e.session_id.clone(), e.ts);
        } else if let Some((st, tool)) = target {
            if s.state == State::Ended { self.ended_at.remove(&e.session_id); }
            if (s.state, s.tool) == (st, if st == State::Working { tool } else { None }) {
                self.pending.remove(&e.session_id);
            } else if is_new || e.ts - s.state_since >= dwell || s.state == State::Ended {
                set(s, st, tool, e.ts);
                self.pending.remove(&e.session_id);
            } else {
                self.pending.insert(e.session_id.clone(), (st, tool));
            }
        }
        out.push(Change::Upsert(s.clone()));
        out
    }

    pub fn tick(&mut self, now: i64, alive: &dyn Fn(u32) -> bool) -> Vec<Change> {
        let t = self.timing;
        let mut out = Vec::new();
        let mut removed = Vec::new();
        for (id, s) in self.sessions.iter_mut() {
            if s.state == State::Ended {
                let at = *self.ended_at.get(id).unwrap_or(&s.state_since);
                if now - at >= t.exit_ms { removed.push(id.clone()); }
                continue;
            }
            let before = (s.state, s.tool);
            if let Some((st, tool)) = self.pending.get(id).copied() {
                if now - s.state_since >= t.dwell_ms {
                    set(s, st, tool, now);
                    self.pending.remove(id);
                }
            }
            let quiet = now - s.last_activity;
            let dead = s.jump.pid.map(|p| !alive(p)).unwrap_or(false);
            if quiet >= t.to_ended_ms || dead {
                set(s, State::Ended, None, now);
                self.ended_at.insert(id.clone(), now);
            } else {
                // progi „bez zdarzeń” liczymy od późniejszego z: wejścia w stan, ostatniej aktywności
                let calm = now - s.state_since.max(s.last_activity);
                match s.state {
                    State::Done if calm >= t.done_to_idle_ms => set(s, State::Idle, None, now),
                    State::Thinking | State::Working | State::Compacting if quiet >= t.stale_to_idle_ms =>
                        set(s, State::Idle, None, now),
                    State::Idle if calm >= t.idle_to_sleep_ms => set(s, State::Sleep, None, now),
                    _ => {}
                }
            }
            if (s.state, s.tool) != before { out.push(Change::Upsert(s.clone())); }
        }
        for id in removed {
            self.sessions.remove(&id);
            self.ended_at.remove(&id);
            self.pending.remove(&id);
            out.push(Change::Removed(id));
        }
        out
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn ev(kind: Kind, ts: i64) -> Event { Event::new(Source::Claude, "s1", kind, ts) }
    fn tool(t: Tool, ts: i64) -> Event { let mut e = ev(Kind::ToolStart, ts); e.tool = Some(t); e }
    fn alive(_: u32) -> bool { true }
    fn st(s: &Store) -> (State, Option<Tool>) { let x = s.session("s1").unwrap(); (x.state, x.tool) }

    #[test]
    fn new_session_starts_idle_then_thinks_on_prompt() {
        let mut s = Store::new(Timing::default());
        s.apply(&ev(Kind::SessionStart, 0));
        assert_eq!(st(&s).0, State::Idle);
        s.apply(&ev(Kind::Prompt, 1000));
        assert_eq!(st(&s).0, State::Thinking);
        assert_eq!(s.session("s1").unwrap().turn_started_at, Some(1000));
    }

    #[test]
    fn dwell_defers_fast_changes_and_last_wins() {
        let mut s = Store::new(Timing::default());
        s.apply(&ev(Kind::Prompt, 0));
        s.apply(&tool(Tool::Bash, 100));
        assert_eq!(st(&s), (State::Thinking, None));
        s.tick(700, &alive);
        assert_eq!(st(&s), (State::Working, Some(Tool::Bash)));
    }

    #[test]
    fn pending_equal_to_current_is_dropped() {
        let mut s = Store::new(Timing::default());
        s.apply(&ev(Kind::Prompt, 0));
        s.apply(&tool(Tool::Read, 100));
        s.apply(&ev(Kind::ToolEnd, 200));
        s.tick(700, &alive);
        assert_eq!(st(&s), (State::Thinking, None));
    }

    #[test]
    fn done_goes_idle_after_2_min_then_sleep_after_10() {
        let mut s = Store::new(Timing::default());
        s.apply(&ev(Kind::TurnEnd, 0));
        s.tick(119_000, &alive);
        assert_eq!(st(&s).0, State::Done);
        s.tick(120_000, &alive);
        assert_eq!(st(&s).0, State::Idle);
        s.tick(720_000, &alive);
        assert_eq!(st(&s).0, State::Sleep);
    }

    #[test]
    fn idle_and_done_timeouts_count_from_last_activity() {
        let mut s = Store::new(Timing::default());
        s.apply(&ev(Kind::SessionStart, 0));
        s.apply(&ev(Kind::Meta, 590_000));
        s.tick(700_000, &alive);
        assert_eq!(st(&s).0, State::Idle, "aktywność 110 s temu to jeszcze nie sen");
        s.tick(1_190_000, &alive);
        assert_eq!(st(&s).0, State::Sleep);

        let mut d = Store::new(Timing::default());
        d.apply(&ev(Kind::TurnEnd, 0));
        d.apply(&ev(Kind::Meta, 100_000));
        d.tick(150_000, &alive);
        assert_eq!(st(&d).0, State::Done, "2 min liczone od ostatniego zdarzenia");
        d.tick(220_000, &alive);
        assert_eq!(st(&d).0, State::Idle);
    }

    #[test]
    fn stale_working_goes_idle_after_10_min() {
        let mut s = Store::new(Timing::default());
        s.apply(&tool(Tool::Edit, 0));
        s.tick(600_000, &alive);
        assert_eq!(st(&s).0, State::Idle);
    }

    #[test]
    fn silence_30_min_ends_and_removes_after_exit_animation() {
        let mut s = Store::new(Timing::default());
        s.apply(&ev(Kind::Prompt, 0));
        s.tick(1_800_000, &alive);
        assert_eq!(st(&s).0, State::Ended);
        let ch = s.tick(1_801_500, &alive);
        assert!(ch.contains(&Change::Removed("s1".into())));
        assert!(s.session("s1").is_none());
    }

    #[test]
    fn dead_pid_ends_session() {
        let mut s = Store::new(Timing::default());
        let mut e = ev(Kind::SessionStart, 0);
        e.data.pid = Some(42);
        s.apply(&e);
        s.tick(1000, &|_| false);
        assert_eq!(st(&s).0, State::Ended);
    }

    #[test]
    fn session_end_is_immediate() {
        let mut s = Store::new(Timing::default());
        s.apply(&ev(Kind::Prompt, 0));
        s.apply(&ev(Kind::SessionEnd, 10));
        assert_eq!(st(&s).0, State::Ended);
    }

    #[test]
    fn out_of_order_event_merges_data_but_not_state() {
        let mut s = Store::new(Timing::default());
        s.apply(&ev(Kind::TurnEnd, 5000));
        let mut old = ev(Kind::Prompt, 1000);
        old.data.title = Some("Tytuł".into());
        s.apply(&old);
        assert_eq!(st(&s).0, State::Done);
        assert_eq!(s.session("s1").unwrap().title, "Tytuł");
    }

    #[test]
    fn none_fields_do_not_overwrite() {
        let mut s = Store::new(Timing::default());
        let mut a = ev(Kind::SessionStart, 0);
        a.data.title = Some("A".into());
        a.data.cwd = Some("C:\\p".into());
        s.apply(&a);
        s.apply(&ev(Kind::Prompt, 1000));
        let x = s.session("s1").unwrap();
        assert_eq!((x.title.as_str(), x.cwd.as_str()), ("A", "C:\\p"));
    }

    #[test]
    fn high_context_while_thinking_means_compacting() {
        let mut s = Store::new(Timing::default());
        s.apply(&ev(Kind::Prompt, 0));
        let mut m = ev(Kind::Meta, 1000);
        m.data.context = Some(Context { used: 190_000, max: 200_000 });
        s.apply(&m);
        assert_eq!(st(&s).0, State::Compacting);
    }

    #[test]
    fn limits_merge_by_agent_and_window() {
        let mut s = Store::new(Timing::default());
        let lim = |p: f32| Limit { agent: Agent::Codex, window: Window::FiveHour, used_pct: p, resets_at: None };
        let mut e = Event::new(Source::Codex, "c1", Kind::Limits, 0);
        e.data.limits = vec![lim(10.0)];
        s.apply(&e);
        e.data.limits = vec![lim(20.0)];
        let ch = s.apply(&e);
        assert_eq!(s.limits(), &[lim(20.0)]);
        assert!(matches!(ch.as_slice(), [Change::Limits(_)]));
        assert!(s.session("c1").is_none(), "samo zdarzenie limitów nie tworzy sesji");
    }
}
