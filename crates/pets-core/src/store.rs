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
    /// czas odczytu każdego limitu (równoległe do `limits`): starszy odczyt nie nadpisuje nowszego
    limits_ts: Vec<i64>,
    /// Zegar rdzenia: najpóźniejszy z `tick(now)` i czasów zdarzeń. Zdarzenia z plików przychodzą z opóźnieniem,
    /// więc minimalny czas stanu liczymy od chwili, w której rdzeń go zobaczył, a nie od czasu w pliku.
    clock: i64,
    shown_at: BTreeMap<String, i64>,
    /// dzieci, które już odeszły: id → czas końca. Starsze zdarzenia (spóźnione linie pliku, ten sam wpis
    /// w status.json routera) ich nie ożywiają; nowsze (kolejna tura) tak.
    tombs: BTreeMap<String, i64>,
    /// sumy dnia agentów z własną bazą (opencode)
    agent_usage: Vec<AgentUsage>,
}

/// Sesja cicha dłużej niż próg zakończenia plus tyle to stary wątek (np. dotknięty przez aplikację Codex),
/// a nie sesja, która właśnie ucichła: znika od razu, bez stanu „zakończył” i machania.
const LONG_DEAD_MS: i64 = 60_000;

/// Subagent Claude bez nowych linii tyle czasu (a rodzic już nie deleguje) został przerwany, np. przez Esc.
pub const CHILD_QUIET_MS: i64 = 120_000;
/// Subagent w tle kończy się tylko przez `SubagentStop` albo po tak długiej ciszy.
pub const CHILD_BACKGROUND_QUIET_MS: i64 = 600_000;
/// Dziecko, które skończyło (albo ma błąd), znika po tym czasie.
pub const CHILD_DONE_MS: i64 = 10_000;
/// Jak długo pamiętamy koniec dziecka (router trzyma zakończone zadania 2 h).
const TOMB_MS: i64 = 3 * 3_600_000;

fn sub_kind(s: &Session) -> Option<SubKind> { s.sub.as_ref().map(|i| i.kind) }

/// Zadanie routera bez żywego rodzica jest zwykłą sesją z plakietką routera (jak w 0.7).
fn orphan(s: &mut Session) { s.parent = None; s.sub = None; }

fn new_session(e: &Event) -> Session {
    let origin = e.data.origin.unwrap_or(match e.source {
        Source::Claude => Origin::Cli,
        Source::Codex => Origin::Desktop,
        Source::Router => Origin::Router,
        Source::Opencode | Source::Generic | Source::Copilot | Source::Antigravity
        | Source::Cursor | Source::Grok | Source::Zcode => Origin::Cli,
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
        router_task: None,
        parent: None,
        sub: None,
        action: None,
        question: None,
        waits_on_child: false,
        model: None,
        // sesja z furtki (`generic:<agent>:<sesja>`): do czasu zgłoszenia nazwy pokazujemy id agenta
        agent_name: (e.source == Source::Generic).then(|| e.session_id.split(':').nth(1).map(String::from)).flatten(),
        usage: None,
    }
}

fn merge(s: &mut Session, d: &EventData) {
    if let Some(t) = &d.title { if !t.is_empty() { s.title = t.clone(); } }
    if let Some(c) = &d.cwd { s.cwd = c.clone(); s.jump.cwd = c.clone(); }
    if let Some(o) = d.origin { s.origin = o; }
    if let Some(p) = d.progress { s.progress = Some(p); }
    if let Some(c) = d.context { s.context = Some(c); }
    if let Some(p) = d.pid { s.jump.pid = Some(p); }
    if let Some(a) = d.app {
        // aplikacja agenta (rejestr, `originator`) wygrywa z programem z drzewa procesów, który tylko uzupełnia;
        // samo „terminal” (transkrypt, rejestr) nie zastępuje konkretnego programu (terminal w VS Code to VS Code)
        let agent_app = |x: App| matches!(x, App::ClaudeDesktop | App::CodexApp);
        let keep = match s.jump.app {
            Some(cur) if agent_app(cur) => !agent_app(a),
            Some(cur) => a == App::Terminal && cur != App::Terminal,
            None => false,
        };
        if !keep {
            s.jump.app = Some(a);
            s.jump.app_name = d.app_name.clone().filter(|n| !n.is_empty());
        }
    }
    if let Some(p) = d.host_pid { s.jump.host_pid = Some(p); }
    if let Some(m) = d.model.as_ref().filter(|m| !m.is_empty()) { s.model = Some(m.clone()); }
    if let Some(n) = d.agent_name.as_ref().filter(|n| !n.is_empty()) { s.agent_name = Some(n.clone()); }
    if let Some(r) = &d.router_task { s.router_task = Some(r.clone()); }
    // sesja nigdy nie jest własnym rodzicem (zniknęłaby ze sceny i z panelu)
    if let Some(p) = d.parent.as_ref().filter(|p| **p != s.id) { s.parent = Some(p.clone()); }
    if let Some(i) = &d.sub {
        // hook zna tylko typ dziecka, plik meta także opis i pracę w tle: brak nie kasuje tego, co już wiemy
        s.sub = Some(match s.sub.take() {
            Some(old) => SubInfo {
                kind: i.kind,
                agent_type: i.agent_type.clone().or(old.agent_type),
                description: i.description.clone().or(old.description),
                background: i.background || old.background,
            },
            None => i.clone(),
        });
    }
}

/// Tekst akcji żyje od początku do końca narzędzia; pytanie, dopóki sesja czeka (meta go nie kończy).
fn texts(s: &mut Session, e: &Event) {
    match e.kind {
        Kind::ToolStart => s.action = e.data.action.clone(),
        Kind::Meta | Kind::Limits | Kind::NeedsInput => {}
        _ => s.action = None,
    }
    match e.kind {
        Kind::NeedsInput => s.question = e.data.question.clone(),
        Kind::Meta | Kind::Limits => {}
        _ => s.question = None,
    }
}

fn set(s: &mut Session, st: State, tool: Option<Tool>, now: i64) {
    s.state = st;
    s.tool = if st == State::Working { tool } else { None };
    s.state_since = now;
}

impl Store {
    pub fn new(timing: Timing) -> Self {
        Store { timing, sessions: BTreeMap::new(), pending: BTreeMap::new(),
                ended_at: BTreeMap::new(), limits: Vec::new(), limits_ts: Vec::new(),
                clock: i64::MIN, shown_at: BTreeMap::new(), tombs: BTreeMap::new(), agent_usage: Vec::new() }
    }

    pub fn session(&self, id: &str) -> Option<&Session> { self.sessions.get(id) }

    pub fn sessions(&self) -> Vec<&Session> {
        let mut v: Vec<&Session> = self.sessions.values().collect();
        v.sort_by_key(|s| (s.started_at, s.id.clone()));
        v
    }

    pub fn limits(&self) -> &[Limit] { &self.limits }

    pub fn agent_usage(&self) -> &[AgentUsage] { &self.agent_usage }

    /// Zużycie sesji z bazy agenta. Zwraca, czy coś się zmieniło (brak sesji albo ta sama wartość: nie).
    pub fn set_usage(&mut self, id: &str, u: Option<Usage>) -> bool {
        match self.sessions.get_mut(id) {
            Some(s) if s.usage != u => { s.usage = u; true }
            _ => false,
        }
    }

    pub fn set_agent_usage(&mut self, v: Vec<AgentUsage>) -> bool {
        if self.agent_usage == v { return false; }
        self.agent_usage = v;
        true
    }

    /// Zostawia sesje spełniające `keep` (np. po wyłączeniu aplikacji w ustawieniach). Zwraca, czy coś usunięto.
    pub fn retain_sessions(&mut self, keep: impl Fn(&Session) -> bool) -> bool {
        let gone: Vec<String> = self.sessions.values().filter(|s| !keep(s)).map(|s| s.id.clone()).collect();
        for id in &gone {
            self.sessions.remove(id);
            self.pending.remove(id);
            self.ended_at.remove(id);
            self.shown_at.remove(id);
        }
        !gone.is_empty()
    }

    /// Zdejmuje limity agenta bez czasu resetu (nieaktualne dane z aplikacji Claude). Zwraca, czy coś zdjęto.
    pub fn drop_limits_without_reset(&mut self, agent: Agent) -> bool {
        self.retain_limits(|l| l.agent != agent || l.resets_at.is_some())
    }

    /// Zostawia limity spełniające `keep` (razem z ich czasami odczytu). Zwraca, czy coś usunięto.
    pub fn retain_limits(&mut self, keep: impl Fn(&Limit) -> bool) -> bool {
        let before = self.limits.len();
        let (limits, ts): (Vec<Limit>, Vec<i64>) = self.limits.iter().copied().zip(self.limits_ts.iter().copied())
            .filter(|(l, _)| keep(l)).unzip();
        self.limits = limits;
        self.limits_ts = ts;
        self.limits.len() != before
    }

    /// Limit bez czasu resetu (np. z aplikacji Claude) zachowuje znany reset, dopóki ten nie minął: to wciąż to samo okno.
    fn merge_limits(&mut self, new: &[Limit], ts: i64) {
        for l in new {
            match self.limits.iter().position(|x| x.agent == l.agent && x.window == l.window) {
                Some(i) if self.limits_ts[i] > ts => {}
                Some(i) => {
                    let x = &mut self.limits[i];
                    let kept = x.resets_at.filter(|r| l.resets_at.is_none() && *r > ts);
                    *x = Limit { resets_at: l.resets_at.or(kept), ..*l };
                    self.limits_ts[i] = ts;
                }
                None => { self.limits.push(*l); self.limits_ts.push(ts); }
            }
        }
    }

    pub fn apply(&mut self, e: &Event) -> Vec<Change> {
        let mut out = Vec::new();
        if !e.data.limits.is_empty() {
            self.merge_limits(&e.data.limits, e.ts);
            out.push(Change::Limits(self.limits.clone()));
        }
        if e.kind == Kind::Limits { return out; }
        if !self.sessions.contains_key(&e.session_id) {
            // koniec dziecka, którego nie znamy (np. `SubagentStop` przed pierwszą linią pliku), nie tworzy zwierzaka
            if e.kind == Kind::SessionEnd && e.data.parent.is_some() {
                let end = self.tombs.entry(e.session_id.clone()).or_insert(e.ts);
                *end = (*end).max(e.ts);
                return out;
            }
            match self.tombs.get(&e.session_id) {
                Some(end) if e.ts <= *end => return out,
                Some(_) => { self.tombs.remove(&e.session_id); }
                None => {}
            }
        }
        // wnuk (subagent w zadaniu routera, subagent subagenta) stoi przy sesji głównej: wnuków nikt nie rysuje
        let top = e.data.parent.as_ref().map(|p| self.top_of(p));
        let lifted;
        let data = match &top {
            Some(t) if Some(t) != e.data.parent.as_ref() => { lifted = EventData { parent: Some(t.clone()), ..e.data.clone() }; &lifted }
            _ => &e.data,
        };
        let parent_gone = top.as_ref()
            .map(|p| self.sessions.get(p).map(|x| x.state == State::Ended).unwrap_or(true)).unwrap_or(false);

        let dwell = self.timing.dwell_ms;
        let arrival = self.clock.max(e.ts);
        self.clock = arrival;
        // nowa sesja przyjmuje pierwszy stan od razu, bez czekania na minimalny czas
        let is_new = !self.sessions.contains_key(&e.session_id);
        let s = self.sessions.entry(e.session_id.clone()).or_insert_with(|| new_session(e));
        merge(s, data);
        if parent_gone && sub_kind(s) == Some(SubKind::Router) { orphan(s); }
        if e.ts < s.last_activity {
            out.push(Change::Upsert(s.clone()));
            return out;
        }
        s.last_activity = e.ts;
        texts(s, e);
        let child = s.parent.is_some();
        if !child && !matches!(e.kind, Kind::Meta | Kind::Limits) {
            // czekanie w trakcie delegowania (albo zgłoszone przez dziecko) to prośba subagenta
            let delegating = (s.state, s.tool) == (State::Working, Some(Tool::Agent))
                || self.pending.get(&e.session_id) == Some(&(State::Working, Some(Tool::Agent)));
            s.waits_on_child = e.kind == Kind::NeedsInput && (e.data.from_child || delegating);
        }
        // zgody dziecka czekają u rodzica: dziecko nigdy nie jest „czeka na Ciebie”
        if child { s.question = None; }

        let target: Option<(State, Option<Tool>)> = match e.kind {
            Kind::Prompt => {
                // prompt w trakcie tury (Antigravity woła `PreInvocation` przy każdym wywołaniu modelu) jej nie zaczyna od nowa
                let now = self.pending.get(&e.session_id).map(|p| p.0).unwrap_or(s.state);
                if s.turn_started_at.is_none() || !matches!(now, State::Thinking | State::Working | State::Compacting) {
                    s.turn_started_at = Some(e.ts);
                }
                Some((State::Thinking, None))
            }
            Kind::ToolStart => Some((State::Working, e.tool.or(Some(Tool::Other)))),
            Kind::ToolEnd => {
                // spóźniony koniec narzędzia (Cursor po przerwanej turze) nie wznawia skończonej tury; Idle i Sleep tu nie
                // należą: w nie przechodzi też tura z narzędziem dłuższym niż próg bezczynności i koniec narzędzia ją budzi
                let now = self.pending.get(&e.session_id).map(|p| p.0).unwrap_or(s.state);
                if matches!(now, State::Done | State::Error | State::Ended) { None }
                else { Some((State::Thinking, None)) }
            }
            Kind::NeedsInput => Some((if child { State::Thinking } else { State::NeedsYou }, None)),
            Kind::TurnEnd => Some((State::Done, None)),
            Kind::Error => Some((State::Error, None)),
            Kind::Compact => Some((State::Compacting, None)),
            Kind::SessionStart => if s.state == State::Ended { Some((State::Idle, None)) } else { None },
            Kind::Meta => match (s.state, s.context) {
                (State::Thinking, Some(c)) if c.max > 0 && c.used as f64 / c.max as f64 > 0.9 =>
                    Some((State::Compacting, None)),
                // rosnący transkrypt to aktywność: budzi śpiącą sesję
                (State::Sleep, _) => Some((State::Idle, None)),
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
            } else if is_new || arrival - self.shown_at.get(&e.session_id).copied().unwrap_or(s.state_since) >= dwell
                || s.state == State::Ended {
                set(s, st, tool, e.ts);
                self.shown_at.insert(e.session_id.clone(), arrival);
                self.pending.remove(&e.session_id);
            } else {
                self.pending.insert(e.session_id.clone(), (st, tool));
            }
        }
        out.push(Change::Upsert(s.clone()));
        if child && !matches!(e.kind, Kind::Meta | Kind::Limits | Kind::SessionEnd) { self.answered_for_child(e, &mut out); }
        if e.kind == Kind::SessionEnd { self.release_children(&e.session_id, e.ts, &mut out); }
        if e.data.sub_end { self.end_newest_child(&e.session_id, e.ts, &mut out); }
        out
    }

    /// Sesja główna nad `id` (idąc w górę po rodzicach; najwyżej kilka poziomów).
    fn top_of(&self, id: &str) -> String {
        let mut cur = id.to_string();
        for _ in 0..8 {
            match self.sessions.get(&cur).and_then(|s| s.parent.clone()) {
                Some(p) if p != cur => cur = p,
                _ => break,
            }
        }
        cur
    }

    /// Dzieci sesji `id` (subagenci i zadania routera), od najstarszego.
    pub fn children_of(&self, id: &str) -> Vec<&Session> {
        let mut v: Vec<&Session> = self.sessions.values().filter(|s| s.parent.as_deref() == Some(id)).collect();
        v.sort_by_key(|s| (s.started_at, s.id.clone()));
        v
    }

    fn end(&mut self, id: &str, now: i64) {
        if let Some(s) = self.sessions.get_mut(id) {
            set(s, State::Ended, None, now);
            self.pending.remove(id);
            self.ended_at.insert(id.to_string(), now);
        }
    }

    /// Dziecko pracuje dalej po prośbie, na którą czekał rodzic: odpowiedziano, rodzic znów deleguje.
    fn answered_for_child(&mut self, e: &Event, out: &mut Vec<Change>) {
        let Some(pid) = self.sessions.get(&e.session_id).and_then(|c| c.parent.clone()) else { return };
        let Some(p) = self.sessions.get_mut(&pid) else { return };
        if p.state != State::NeedsYou || !p.waits_on_child || e.ts <= p.state_since { return; }
        set(p, State::Working, Some(Tool::Agent), e.ts);
        p.question = None;
        p.waits_on_child = false;
        self.pending.remove(&pid);
        self.shown_at.insert(pid, self.clock);
        out.push(Change::Upsert(p.clone()));
    }

    /// Koniec rodzica kończy jego subagentów; zadania routera zostają jako zwykłe sesje.
    fn release_children(&mut self, parent: &str, now: i64, out: &mut Vec<Change>) {
        let ids: Vec<String> = self.children_of(parent).iter().map(|c| c.id.clone()).collect();
        for id in ids {
            let router = self.sessions.get(&id).and_then(sub_kind) == Some(SubKind::Router);
            if router { if let Some(s) = self.sessions.get_mut(&id) { orphan(s); } }
            else if self.sessions.get(&id).map(|s| s.state) != Some(State::Ended) { self.end(&id, now); }
            if let Some(s) = self.sessions.get(&id) { out.push(Change::Upsert(s.clone())); }
        }
    }

    /// `SubagentStop` bez `agent_id`: kończy najmłodszego żyjącego subagenta Claude tej sesji.
    fn end_newest_child(&mut self, parent: &str, now: i64, out: &mut Vec<Change>) {
        let newest = self.children_of(parent).into_iter()
            .filter(|c| c.state != State::Ended && sub_kind(c) == Some(SubKind::Claude)).last().map(|c| c.id.clone());
        if let Some(id) = newest {
            self.end(&id, now);
            if let Some(s) = self.sessions.get(&id) { out.push(Change::Upsert(s.clone())); }
        }
    }

    pub fn tick(&mut self, now: i64, alive: &dyn Fn(u32) -> bool) -> Vec<Change> {
        let t = self.timing;
        self.clock = self.clock.max(now);
        let mut out = Vec::new();
        // po resecie stare zużycie nic nie znaczy: „brak danych” aż do nowego odczytu
        if self.retain_limits(|l| l.resets_at.map(|r| r > now).unwrap_or(true)) {
            out.push(Change::Limits(self.limits.clone()));
        }
        let mut removed = Vec::new();
        // rodzice, którzy wciąż czekają na subagenta (także w minimalnym czasie stanu), i rodzice, których już nie ma
        let agent = (State::Working, Some(Tool::Agent));
        // rodzic czekający na Ciebie też: dziecko może czekać na zgodę, a nie być przerwane
        let delegating: std::collections::HashSet<String> = self.sessions.values()
            .filter(|s| (s.state, s.tool) == agent || s.state == State::NeedsYou || self.pending.get(&s.id) == Some(&agent))
            .map(|s| s.id.clone()).collect();
        let gone: std::collections::HashSet<String> = self.sessions.values().filter_map(|s| s.parent.clone())
            .filter(|p| self.sessions.get(p).map(|x| x.state == State::Ended).unwrap_or(true)).collect();
        for (id, s) in self.sessions.iter_mut() {
            if s.state == State::Ended {
                let at = *self.ended_at.get(id).unwrap_or(&s.state_since);
                if now - at >= t.exit_ms { removed.push(id.clone()); }
                continue;
            }
            let before = (s.state, s.tool, s.parent.is_some());
            if let Some((st, tool)) = self.pending.get(id).copied() {
                if now - self.shown_at.get(id).copied().unwrap_or(s.state_since) >= t.dwell_ms {
                    set(s, st, tool, now);
                    self.shown_at.insert(id.clone(), now);
                    self.pending.remove(id);
                }
            }
            let quiet = now - s.last_activity;
            if let Some(parent) = s.parent.clone() {
                let kind = sub_kind(s);
                let background = s.sub.as_ref().map(|i| i.background).unwrap_or(false);
                let end = if gone.contains(&parent) {
                    if kind == Some(SubKind::Router) { orphan(s); false } else { true }
                } else if kind == Some(SubKind::Claude) && (background || !delegating.contains(&parent)) {
                    let limit = if background { CHILD_BACKGROUND_QUIET_MS } else { CHILD_QUIET_MS };
                    if quiet >= limit + LONG_DEAD_MS { removed.push(id.clone()); continue; }
                    quiet >= limit
                } else { false };
                let finished = matches!(s.state, State::Done | State::Error) && now - s.state_since >= CHILD_DONE_MS;
                if (end || finished) && s.parent.is_some() {
                    set(s, State::Ended, None, now);
                    self.ended_at.insert(id.clone(), now);
                    out.push(Change::Upsert(s.clone()));
                    continue;
                }
            }
            let dead = s.jump.pid.map(|p| !alive(p)).unwrap_or(false);
            if quiet >= t.to_ended_ms + LONG_DEAD_MS {
                removed.push(id.clone());
                continue;
            }
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
            if (s.state, s.tool, s.parent.is_some()) != before { out.push(Change::Upsert(s.clone())); }
        }
        self.tombs.retain(|_, end| now - *end < TOMB_MS);
        for id in removed {
            if let Some(s) = self.sessions.get(&id).filter(|s| s.parent.is_some()) {
                let end = self.ended_at.get(&id).copied().unwrap_or(s.last_activity).max(s.last_activity);
                self.tombs.insert(id.clone(), end);
            }
            self.sessions.remove(&id);
            self.ended_at.remove(&id);
            self.pending.remove(&id);
            self.shown_at.remove(&id);
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
    fn usage_is_set_only_on_its_session_and_reports_real_changes() {
        let mut s = Store::new(Timing::default());
        s.apply(&ev(Kind::Prompt, 1));
        s.apply(&Event::new(Source::Opencode, "opencode:a", Kind::Prompt, 1));
        let u = Usage { tokens: 10, cost: 0.0, account: Some(Agent::Codex) };
        assert!(s.set_usage("opencode:a", Some(u)));
        assert!(!s.set_usage("opencode:a", Some(u)), "ta sama wartość");
        assert!(!s.set_usage("nope", Some(u)), "brak sesji");
        assert_eq!((s.session("opencode:a").unwrap().usage, s.session("s1").unwrap().usage), (Some(u), None));
        s.apply(&Event::new(Source::Opencode, "opencode:a", Kind::TurnEnd, 2));
        assert_eq!(s.session("opencode:a").unwrap().usage, Some(u), "kolejne zdarzenia nie zerują zużycia");
        let day = vec![AgentUsage { agent: Agent::Opencode, tokens_today: 5, cost_today: 0.5 }];
        assert!(s.set_agent_usage(day.clone()));
        assert!(!s.set_agent_usage(day.clone()));
        assert_eq!(s.agent_usage(), day.as_slice());
    }

    #[test]
    fn empty_model_or_name_does_not_erase_what_we_know() {
        let mut s = Store::new(Timing::default());
        let mut e = Event::new(Source::Generic, "generic:kilo:a", Kind::Prompt, 0);
        e.data.model = Some("GLM-5.3".into());
        e.data.agent_name = Some("Kilo CLI".into());
        s.apply(&e);
        let mut e2 = Event::new(Source::Generic, "generic:kilo:a", Kind::Meta, 10);
        e2.data.model = Some(String::new());
        e2.data.agent_name = Some(String::new());
        s.apply(&e2);
        let x = s.session("generic:kilo:a").unwrap();
        assert_eq!((x.agent, x.model.as_deref(), x.agent_name.as_deref()), (Agent::Other, Some("GLM-5.3"), Some("Kilo CLI")));
    }

    #[test]
    fn a_plain_terminal_does_not_replace_a_known_program() {
        // Claude CLI w terminalu VS Code: hook zna VS Code, a transkrypt i rejestr mówią tylko „terminal”
        let mut s = Store::new(Timing::default());
        let mut e = ev(Kind::Prompt, 0);
        e.data.app = Some(App::Vscode);
        e.data.host_pid = Some(7);
        s.apply(&e);
        let mut t = ev(Kind::Meta, 10);
        t.data.app = Some(App::Terminal);
        s.apply(&t);
        let j = &s.session("s1").unwrap().jump;
        assert_eq!((j.app, j.host_pid), (Some(App::Vscode), Some(7)));
    }

    #[test]
    fn a_host_from_the_process_tree_does_not_override_the_agent_app() {
        let mut s = Store::new(Timing::default());
        let mut e = ev(Kind::Prompt, 0);
        e.data.app = Some(App::ClaudeDesktop);
        s.apply(&e);
        let mut e2 = ev(Kind::Meta, 10);
        e2.data.app = Some(App::Terminal);
        e2.data.host_pid = Some(7);
        s.apply(&e2);
        let j = &s.session("s1").unwrap().jump;
        assert_eq!((j.app, j.host_pid), (Some(App::ClaudeDesktop), Some(7)));
        // terminal bez programu wyżej zostaje uzupełniony programem
        let mut e3 = Event::new(Source::Claude, "s2", Kind::Prompt, 0);
        e3.data.app = Some(App::Terminal);
        s.apply(&e3);
        let mut e4 = Event::new(Source::Claude, "s2", Kind::Meta, 10);
        e4.data.app = Some(App::Other);
        e4.data.app_name = Some("Warp".into());
        s.apply(&e4);
        let j = &s.session("s2").unwrap().jump;
        assert_eq!((j.app, j.app_name.as_deref()), (Some(App::Other), Some("Warp")));
    }

    #[test]
    fn new_session_starts_idle_then_thinks_on_prompt() {
        let mut s = Store::new(Timing::default());
        s.apply(&ev(Kind::SessionStart, 0));
        assert_eq!(st(&s).0, State::Idle);
        s.apply(&ev(Kind::Prompt, 1000));
        assert_eq!(st(&s).0, State::Thinking);
        assert_eq!(s.session("s1").unwrap().turn_started_at, Some(1000));
    }

    /// Antigravity wysyła `PreInvocation` przy każdym wywołaniu modelu (także po narzędziu): to ta sama tura.
    #[test]
    fn a_prompt_during_a_turn_keeps_the_turn_start() {
        let mut s = Store::new(Timing::default());
        s.apply(&ev(Kind::Prompt, 1000));
        s.apply(&ev(Kind::ToolStart, 3000));
        s.apply(&ev(Kind::ToolEnd, 5000));
        s.apply(&ev(Kind::Prompt, 5100));
        assert_eq!(s.session("s1").unwrap().turn_started_at, Some(1000));
        s.apply(&ev(Kind::TurnEnd, 8000));
        s.apply(&ev(Kind::Prompt, 20_000));
        assert_eq!(s.session("s1").unwrap().turn_started_at, Some(20_000), "nowa tura po zakończonej");
    }

    /// Cursor po przerwanej turze (`stop` z `aborted`) dosyła `postToolUseFailure` narzędzi w locie (sprawdzone na żywo).
    #[test]
    fn a_late_tool_end_does_not_reopen_a_finished_turn() {
        let mut s = Store::new(Timing::default());
        s.apply(&ev(Kind::Prompt, 0));
        s.apply(&tool(Tool::Read, 1000));
        s.apply(&ev(Kind::TurnEnd, 5000));
        s.tick(6000, &alive);
        assert_eq!(st(&s).0, State::Done);
        s.apply(&ev(Kind::ToolEnd, 7000));
        s.tick(8000, &alive);
        assert_eq!(st(&s).0, State::Done);
        // także gdy koniec tury jeszcze czeka na swoją kolej
        s.apply(&ev(Kind::Prompt, 10_000));
        s.tick(11_000, &alive);
        s.apply(&ev(Kind::TurnEnd, 12_000));
        s.apply(&ev(Kind::ToolEnd, 12_100));
        s.tick(13_000, &alive);
        assert_eq!(st(&s).0, State::Done);
    }

    /// narzędzie dłuższe niż próg bezczynności (długi build): zwierzak zasnął w trakcie tury, koniec narzędzia ją wznawia
    #[test]
    fn a_tool_end_after_a_long_tool_wakes_the_turn_again() {
        let mut s = Store::new(Timing::default());
        s.apply(&ev(Kind::Prompt, 0));
        s.apply(&tool(Tool::Bash, 1000));
        s.tick(2000, &alive);
        s.tick(1000 + 11 * 60_000, &alive);
        assert_ne!(st(&s).0, State::Working, "próg bezczynności minął");
        s.apply(&ev(Kind::ToolEnd, 1000 + 12 * 60_000));
        s.tick(1000 + 12 * 60_000 + 1000, &alive);
        assert_eq!(st(&s).0, State::Thinking);
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
    fn transcript_activity_wakes_sleeping_session() {
        let mut s = Store::new(Timing::default());
        s.apply(&ev(Kind::SessionStart, 0));
        s.tick(700_000, &alive);
        assert_eq!(st(&s).0, State::Sleep);
        s.apply(&ev(Kind::Meta, 800_000));
        assert_eq!(st(&s).0, State::Idle);
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

    #[test]
    fn a_tool_read_late_from_a_file_is_still_shown_for_the_minimum_time() {
        // Rollout Codexa: początek i koniec narzędzia (0,8 s) docierają razem, długo po zapisie w pliku.
        let mut s = Store::new(Timing::default());
        s.apply(&ev(Kind::Prompt, 0));
        s.tick(60_000, &alive);
        s.apply(&tool(Tool::Bash, 59_000));
        s.apply(&ev(Kind::ToolEnd, 59_800));
        assert_eq!(st(&s), (State::Working, Some(Tool::Bash)), "widać narzędzie, choć jego koniec już przyszedł");
        s.tick(60_250, &alive);
        assert_eq!(st(&s), (State::Working, Some(Tool::Bash)));
        s.tick(60_600, &alive);
        assert_eq!(st(&s), (State::Thinking, None));
    }

    #[test]
    fn a_long_dead_thread_disappears_without_waving() {
        // Aplikacja Codex dotyka starych wątków: ich ostatnia aktywność jest sprzed dni.
        let mut s = Store::new(Timing::default());
        s.apply(&ev(Kind::Prompt, 0));
        let ch = s.tick(3 * 86_400_000, &alive);
        assert!(s.session("s1").is_none());
        assert_eq!(ch, vec![Change::Removed("s1".into())], "bez stanu „zakończył” i machania");
    }

    #[test]
    fn a_session_going_quiet_now_still_says_goodbye() {
        let mut s = Store::new(Timing::default());
        s.apply(&ev(Kind::Prompt, 0));
        s.tick(Timing::default().to_ended_ms, &alive);
        assert_eq!(st(&s).0, State::Ended);
    }

    #[test]
    fn router_task_sticks_until_the_next_router_update() {
        let mut s = Store::new(Timing::default());
        let rt = RouterTask { task_id: "t1".into(), status: "running".into(), last_activity_at: Some(5), blocked: false, stall_ms: 180_000 };
        let mut m = ev(Kind::Meta, 10);
        m.data.router_task = Some(rt.clone());
        s.apply(&m);
        s.apply(&ev(Kind::Meta, 20));
        assert_eq!(s.session("s1").unwrap().router_task, Some(rt));
    }

    #[test]
    fn an_older_reading_never_overrides_a_newer_one() {
        // Aplikacja Codex dotyka starych wątków: ich rollouty z sierpniowym limitem czytamy po wrześniowym.
        let mut s = Store::new(Timing::default());
        let week = |p: f32, r: i64| Limit { agent: Agent::Codex, window: Window::Weekly, used_pct: p, resets_at: Some(r) };
        let at = |ts: i64, l: Limit| { let mut e = Event::new(Source::Codex, "c", Kind::Limits, ts); e.data.limits = vec![l]; e };
        s.apply(&at(2_000_000, week(18.0, 9_000_000)));
        s.apply(&at(1_000_000, week(61.0, 1_500_000)));
        assert_eq!(s.limits(), &[week(18.0, 9_000_000)]);
    }

    #[test]
    fn a_limit_whose_reset_passed_is_no_longer_shown() {
        let mut s = Store::new(Timing::default());
        let mut e = Event::new(Source::Codex, "c", Kind::Limits, 0);
        e.data.limits = vec![Limit { agent: Agent::Codex, window: Window::Weekly, used_pct: 61.0, resets_at: Some(5_000) }];
        s.apply(&e);
        assert!(s.tick(4_000, &|_| true).is_empty());
        assert!(matches!(s.tick(5_000, &|_| true).as_slice(), [Change::Limits(l)] if l.is_empty()));
        assert!(s.limits().is_empty(), "po resecie stare zużycie nic nie znaczy: brak danych");
    }

    #[test]
    fn dropping_stale_limits_keeps_the_ones_with_a_reset_time() {
        let mut s = Store::new(Timing::default());
        let mut e = Event::new(Source::Claude, "x", Kind::Limits, 0);
        e.data.limits = vec![
            Limit { agent: Agent::Claude, window: Window::FiveHour, used_pct: 50.0, resets_at: None },
            Limit { agent: Agent::Claude, window: Window::Weekly, used_pct: 60.0, resets_at: Some(9) },
            Limit { agent: Agent::Codex, window: Window::FiveHour, used_pct: 70.0, resets_at: None },
        ];
        s.apply(&e);
        assert!(s.drop_limits_without_reset(Agent::Claude));
        assert_eq!(s.limits().iter().map(|l| (l.agent, l.window)).collect::<Vec<_>>(),
            vec![(Agent::Claude, Window::Weekly), (Agent::Codex, Window::FiveHour)]);
        assert!(!s.drop_limits_without_reset(Agent::Claude), "nic do zdjęcia");
    }

    #[test]
    fn limit_without_reset_keeps_a_future_reset_of_the_same_window() {
        let mut s = Store::new(Timing::default());
        let lim = |p: f32, r: Option<i64>| Limit { agent: Agent::Claude, window: Window::FiveHour, used_pct: p, resets_at: r };
        let at = |ts: i64, l: Limit| { let mut e = Event::new(Source::Claude, "x", Kind::Limits, ts); e.data.limits = vec![l]; e };
        s.apply(&at(1_000, lim(30.0, Some(10_000))));
        s.apply(&at(2_000, lim(40.0, None)));
        assert_eq!(s.limits(), &[lim(40.0, Some(10_000))], "to samo okno: reset ze statusline zostaje");
        s.apply(&at(20_000, lim(5.0, None)));
        assert_eq!(s.limits(), &[lim(5.0, None)], "reset minął: nie wiemy, kiedy następny");
    }

    fn action(s: &Store) -> Option<String> { s.session("s1").unwrap().action.clone() }
    fn question(s: &Store) -> Option<String> { s.session("s1").unwrap().question.clone() }

    #[test]
    fn action_text_lives_from_tool_start_to_tool_end() {
        let mut s = Store::new(Timing::default());
        s.apply(&ev(Kind::Prompt, 0));
        let mut t = tool(Tool::Bash, 1000);
        t.data.action = Some("npm test".into());
        s.apply(&t);
        assert_eq!(action(&s).as_deref(), Some("npm test"));
        s.apply(&ev(Kind::Meta, 1500));
        assert_eq!(action(&s).as_deref(), Some("npm test"), "meta nie czyści akcji");
        s.apply(&ev(Kind::ToolEnd, 2000));
        assert_eq!(action(&s), None);
        s.apply(&t.clone());
        s.apply(&tool(Tool::Other, 3000));
        assert_eq!(action(&s), None, "nowe narzędzie bez tekstu czyści stary tekst");
        let mut t2 = tool(Tool::Edit, 4000);
        t2.data.action = Some("Edytuje a.ts".into());
        s.apply(&t2);
        s.apply(&ev(Kind::TurnEnd, 5000));
        assert_eq!(action(&s), None);
    }

    #[test]
    fn question_lives_while_the_session_waits() {
        let mut s = Store::new(Timing::default());
        s.apply(&ev(Kind::Prompt, 0));
        let mut n = ev(Kind::NeedsInput, 1000);
        n.data.question = Some("Zgoda na Bash? npm test".into());
        s.apply(&n);
        assert_eq!(question(&s).as_deref(), Some("Zgoda na Bash? npm test"));
        s.apply(&ev(Kind::Meta, 1500));
        assert!(question(&s).is_some(), "meta (np. kontekst) nie kończy czekania");
        s.apply(&ev(Kind::ToolEnd, 2000));
        assert_eq!(question(&s), None);
        s.apply(&n.clone());
        let mut n2 = n.clone();
        n2.ts = 3000;
        s.apply(&n2);
        s.apply(&ev(Kind::Prompt, 4000));
        assert_eq!(question(&s), None);
    }

    #[test]
    fn an_old_event_does_not_touch_action_or_question() {
        let mut s = Store::new(Timing::default());
        let mut t = tool(Tool::Bash, 5000);
        t.data.action = Some("ls".into());
        s.apply(&t);
        s.apply(&ev(Kind::ToolEnd, 1000));
        assert_eq!(action(&s).as_deref(), Some("ls"));
    }

    #[test]
    fn parent_and_sub_info_are_kept() {
        let mut s = Store::new(Timing::default());
        let mut e = ev(Kind::SessionStart, 0);
        e.data.parent = Some("p".into());
        e.data.sub = Some(SubInfo { kind: SubKind::Claude, agent_type: Some("Explore".into()), description: None, background: false });
        s.apply(&e);
        s.apply(&ev(Kind::Prompt, 100));
        let x = s.session("s1").unwrap();
        assert_eq!(x.parent.as_deref(), Some("p"));
        assert_eq!(x.sub.as_ref().unwrap().agent_type.as_deref(), Some("Explore"));
    }

    #[test]
    fn partial_sub_info_from_a_hook_keeps_what_the_file_said() {
        let mut s = Store::new(Timing::default());
        let mut f = ev(Kind::SessionStart, 0);
        f.data.sub = Some(SubInfo { kind: SubKind::Claude, agent_type: Some("Explore".into()), description: Some("Znajdź".into()), background: true });
        s.apply(&f);
        let mut h = tool(Tool::Bash, 100);
        h.data.sub = Some(SubInfo { kind: SubKind::Claude, agent_type: None, description: None, background: false });
        s.apply(&h);
        let sub = s.session("s1").unwrap().sub.clone().unwrap();
        assert_eq!((sub.agent_type.as_deref(), sub.description.as_deref(), sub.background), (Some("Explore"), Some("Znajdź"), true));
    }

    fn sub(kind: SubKind, background: bool) -> SubInfo { SubInfo { kind, agent_type: None, description: None, background } }
    fn kid(id: &str, parent: &str, kind: Kind, ts: i64, info: SubInfo) -> Event {
        let src = match info.kind { SubKind::Claude => Source::Claude, SubKind::Codex => Source::Codex, SubKind::Router => Source::Router, SubKind::Opencode => Source::Opencode, SubKind::Copilot => Source::Copilot, SubKind::Cursor => Source::Cursor };
        let mut e = Event::new(src, id, kind, ts);
        e.data.parent = Some(parent.into());
        e.data.sub = Some(info);
        e
    }
    fn state_of(s: &Store, id: &str) -> Option<State> { s.session(id).map(|x| x.state) }
    fn parent_working(s: &mut Store, ts: i64) {
        let mut p = Event::new(Source::Claude, "p", Kind::ToolStart, ts);
        p.tool = Some(Tool::Agent);
        s.apply(&p);
    }

    #[test]
    fn a_child_never_waits_for_the_user() {
        let mut s = Store::new(Timing::default());
        s.apply(&Event::new(Source::Claude, "p", Kind::Prompt, 0));
        s.apply(&kid("p/a", "p", Kind::Prompt, 0, sub(SubKind::Claude, false)));
        let mut n = kid("p/a", "p", Kind::NeedsInput, 1_000, sub(SubKind::Claude, false));
        n.data.question = Some("Zgoda na Bash?".into());
        s.apply(&n);
        s.tick(2_000, &alive);
        let c = s.session("p/a").unwrap();
        assert_eq!((c.state, c.question.clone()), (State::Thinking, None), "zgody dziecka czekają u rodzica");
    }

    #[test]
    fn a_quiet_foreground_child_ends_after_120_s_unless_the_parent_still_delegates() {
        let mut s = Store::new(Timing::default());
        s.apply(&Event::new(Source::Claude, "p", Kind::Prompt, 0));
        s.apply(&kid("p/a", "p", Kind::Prompt, 0, sub(SubKind::Claude, false)));
        parent_working(&mut s, 0);
        s.tick(130_000, &alive);
        assert_eq!(state_of(&s, "p/a"), Some(State::Thinking), "rodzic wciąż czeka na subagenta");
        s.apply(&Event::new(Source::Claude, "p", Kind::ToolEnd, 131_000));
        s.tick(132_000, &alive);
        assert_eq!(state_of(&s, "p/a"), Some(State::Ended), "przerwany subagent (Esc) nie wisi");
    }

    #[test]
    fn a_background_child_lives_10_min_without_news() {
        let mut s = Store::new(Timing::default());
        s.apply(&Event::new(Source::Claude, "p", Kind::Prompt, 0));
        s.apply(&kid("p/a", "p", Kind::Prompt, 0, sub(SubKind::Claude, true)));
        s.tick(300_000, &alive);
        assert_eq!(state_of(&s, "p/a"), Some(State::Thinking));
        s.tick(600_000, &alive);
        assert_eq!(state_of(&s, "p/a"), Some(State::Ended));
    }

    #[test]
    fn subagent_stop_without_an_id_ends_the_newest_live_child() {
        let mut s = Store::new(Timing::default());
        s.apply(&Event::new(Source::Claude, "p", Kind::Prompt, 0));
        s.apply(&kid("p/a", "p", Kind::Prompt, 0, sub(SubKind::Claude, false)));
        s.apply(&kid("p/b", "p", Kind::Prompt, 100, sub(SubKind::Claude, false)));
        let mut stop = Event::new(Source::Claude, "p", Kind::Meta, 200);
        stop.data.sub_end = true;
        s.apply(&stop);
        assert_eq!((state_of(&s, "p/a"), state_of(&s, "p/b")), (Some(State::Thinking), Some(State::Ended)));
    }

    #[test]
    fn an_unknown_child_ended_by_subagent_stop_leaves_no_trace() {
        let mut s = Store::new(Timing::default());
        s.apply(&Event::new(Source::Claude, "p", Kind::Prompt, 0));
        assert!(s.apply(&kid("p/x", "p", Kind::SessionEnd, 10, sub(SubKind::Claude, false))).is_empty());
        assert!(s.session("p/x").is_none(), "koniec dziecka, którego nie znamy, nie tworzy zwierzaka");
    }

    #[test]
    fn a_finished_child_goes_away_after_10_s() {
        let mut s = Store::new(Timing::default());
        s.apply(&Event::new(Source::Codex, "p", Kind::Prompt, 0));
        s.apply(&kid("c1", "p", Kind::Prompt, 0, sub(SubKind::Codex, false)));
        s.apply(&kid("c1", "p", Kind::TurnEnd, 1_000, sub(SubKind::Codex, false)));
        s.tick(10_000, &alive);
        assert_eq!(state_of(&s, "c1"), Some(State::Done));
        s.tick(11_000, &alive);
        assert_eq!(state_of(&s, "c1"), Some(State::Ended));
        s.tick(12_600, &alive);
        assert!(s.session("c1").is_none());
    }

    #[test]
    fn the_parent_ending_ends_its_children_and_frees_router_tasks() {
        let mut s = Store::new(Timing::default());
        s.apply(&Event::new(Source::Claude, "p", Kind::Prompt, 0));
        s.apply(&kid("p/a", "p", Kind::Prompt, 0, sub(SubKind::Claude, false)));
        let mut r = kid("th", "p", Kind::Prompt, 0, sub(SubKind::Router, false));
        r.data.origin = Some(Origin::Router);
        s.apply(&r);
        assert_eq!(s.children_of("p").iter().map(|c| c.id.as_str()).collect::<Vec<_>>(), vec!["p/a", "th"]);
        s.apply(&Event::new(Source::Claude, "p", Kind::SessionEnd, 1_000));
        assert_eq!(state_of(&s, "p/a"), Some(State::Ended));
        let t = s.session("th").unwrap();
        assert_eq!((t.state, t.parent.clone(), t.sub.clone()), (State::Thinking, None, None), "zadanie routera zostaje jako zwykły zwierzak");
    }

    #[test]
    fn a_router_task_of_a_gone_parent_is_standalone_at_once() {
        let mut s = Store::new(Timing::default());
        s.apply(&kid("th", "nie-ma", Kind::Prompt, 0, sub(SubKind::Router, false)));
        let t = s.session("th").unwrap();
        assert_eq!((t.parent.clone(), t.sub.clone()), (None, None));
        s.apply(&Event::new(Source::Claude, "p", Kind::SessionEnd, 0));
        s.apply(&kid("th2", "p", Kind::Prompt, 10, sub(SubKind::Router, false)));
        assert_eq!(s.session("th2").unwrap().parent, None, "rodzic zakończony: też sierota");
    }

    #[test]
    fn a_long_dead_child_at_startup_disappears_without_waving() {
        let mut s = Store::new(Timing::default());
        s.apply(&Event::new(Source::Claude, "p", Kind::Prompt, 10_000_000));
        s.apply(&kid("p/a", "p", Kind::Prompt, 0, sub(SubKind::Claude, false)));
        let ch = s.tick(10_000_000, &alive);
        assert!(ch.contains(&Change::Removed("p/a".into())));
        assert!(s.session("p/a").is_none());
    }

    fn parent_asks(s: &mut Store, ts: i64, from_child: bool) {
        let mut n = Event::new(Source::Claude, "p", Kind::NeedsInput, ts);
        n.data.question = Some("Zgoda na Bash? ls".into());
        n.data.from_child = from_child;
        s.apply(&n);
    }

    #[test]
    fn approving_a_subagent_request_takes_the_parent_back_to_delegating() {
        let mut s = Store::new(Timing::default());
        s.apply(&Event::new(Source::Claude, "p", Kind::Prompt, 0));
        parent_working(&mut s, 1_000);
        s.apply(&kid("p/a", "p", Kind::Prompt, 1_000, sub(SubKind::Claude, false)));
        parent_asks(&mut s, 5_000, true);
        assert_eq!(state_of(&s, "p"), Some(State::NeedsYou));
        s.apply(&kid("p/a", "p", Kind::ToolStart, 9_000, sub(SubKind::Claude, false)));
        let p = s.session("p").unwrap();
        assert_eq!((p.state, p.tool, p.question.clone()), (State::Working, Some(Tool::Agent), None));
    }

    #[test]
    fn a_wait_while_delegating_counts_as_the_subagent_s_request() {
        // hook bez agent_id: rodzic pracował narzędziem Agent, więc prośba należy do dziecka
        let mut s = Store::new(Timing::default());
        s.apply(&Event::new(Source::Claude, "p", Kind::Prompt, 0));
        parent_working(&mut s, 1_000);
        s.apply(&kid("p/a", "p", Kind::Prompt, 1_000, sub(SubKind::Claude, false)));
        parent_asks(&mut s, 5_000, false);
        s.apply(&kid("p/a", "p", Kind::ToolEnd, 9_000, sub(SubKind::Claude, false)));
        assert_eq!(state_of(&s, "p"), Some(State::Working));
    }

    #[test]
    fn the_parent_s_own_question_is_not_cleared_by_a_background_child() {
        let mut s = Store::new(Timing::default());
        s.apply(&Event::new(Source::Claude, "p", Kind::Prompt, 0));
        s.apply(&kid("p/b", "p", Kind::Prompt, 500, sub(SubKind::Claude, true)));
        s.apply(&{ let mut e = Event::new(Source::Claude, "p", Kind::ToolStart, 1_000); e.tool = Some(Tool::Bash); e });
        parent_asks(&mut s, 5_000, false);
        s.apply(&kid("p/b", "p", Kind::ToolStart, 9_000, sub(SubKind::Claude, true)));
        assert_eq!(state_of(&s, "p"), Some(State::NeedsYou));
    }

    #[test]
    fn a_child_waiting_for_approval_is_not_ended_as_quiet() {
        let mut s = Store::new(Timing::default());
        s.apply(&Event::new(Source::Claude, "p", Kind::Prompt, 0));
        parent_working(&mut s, 1_000);
        s.apply(&kid("p/a", "p", Kind::ToolStart, 1_000, sub(SubKind::Claude, false)));
        parent_asks(&mut s, 2_000, true);
        s.tick(200_000, &alive);
        assert_eq!(state_of(&s, "p/a"), Some(State::Working), "czeka na Twoją zgodę, nie jest przerwany");
    }

    fn router_meta(ts: i64, status: &str) -> Event {
        let mut m = kid("th", "p", Kind::Meta, ts, sub(SubKind::Router, false));
        m.data.router_task = Some(RouterTask { task_id: "t1".into(), status: status.into(), last_activity_at: Some(ts), blocked: false, stall_ms: 180_000 });
        m
    }

    #[test]
    fn a_finished_router_task_does_not_come_back_on_the_next_status_rewrite() {
        let mut s = Store::new(Timing::default());
        s.apply(&Event::new(Source::Claude, "p", Kind::Prompt, 0));
        s.apply(&router_meta(1_000, "running"));
        s.apply(&kid("th", "p", Kind::TurnEnd, 5_000, sub(SubKind::Router, false)));
        s.tick(15_000, &alive);
        s.tick(17_000, &alive);
        assert!(s.session("th").is_none());
        s.apply(&router_meta(5_000, "completed"));
        assert!(s.session("th").is_none(), "ten sam, zakończony wpis w status.json");
        s.apply(&kid("th", "p", Kind::Prompt, 20_000, sub(SubKind::Router, false)));
        assert_eq!(state_of(&s, "th"), Some(State::Thinking), "codex_continue: nowa tura wraca");
    }

    #[test]
    fn late_lines_of_an_ended_subagent_do_not_bring_it_back() {
        let mut s = Store::new(Timing::default());
        s.apply(&Event::new(Source::Claude, "p", Kind::Prompt, 0));
        // SubagentStop przed pierwszą linią pliku: dziecka jeszcze nie ma
        s.apply(&kid("p/a", "p", Kind::SessionEnd, 9_000, sub(SubKind::Claude, false)));
        s.apply(&kid("p/a", "p", Kind::SessionStart, 1_000, sub(SubKind::Claude, false)));
        s.apply(&kid("p/a", "p", Kind::ToolStart, 8_000, sub(SubKind::Claude, false)));
        assert!(s.session("p/a").is_none());
        s.apply(&kid("p/b", "p", Kind::Prompt, 1_000, sub(SubKind::Claude, false)));
        s.apply(&kid("p/b", "p", Kind::SessionEnd, 9_000, sub(SubKind::Claude, false)));
        s.tick(11_000, &alive);
        assert!(s.session("p/b").is_none());
        s.apply(&kid("p/b", "p", Kind::ToolEnd, 8_500, sub(SubKind::Claude, false)));
        assert!(s.session("p/b").is_none(), "linia z pliku po zniknięciu dziecka");
    }

    #[test]
    fn a_session_is_never_its_own_parent() {
        let mut s = Store::new(Timing::default());
        let mut e = ev(Kind::Prompt, 0);
        e.data.parent = Some("s1".into());
        s.apply(&e);
        assert_eq!(s.session("s1").unwrap().parent, None);
    }

    #[test]
    fn a_grandchild_stands_with_the_top_session() {
        // subagent Codexa w zadaniu routera, które zlecił Claude: wnuków nikt nie rysuje, więc stoi przy sesji głównej
        let mut s = Store::new(Timing::default());
        s.apply(&Event::new(Source::Claude, "p", Kind::Prompt, 0));
        s.apply(&kid("th", "p", Kind::Prompt, 10, sub(SubKind::Router, false)));
        let mut g = kid("c1", "th", Kind::Prompt, 20, sub(SubKind::Codex, false));
        g.data.parent = Some("th".into());
        s.apply(&g);
        assert_eq!(s.session("c1").unwrap().parent.as_deref(), Some("p"));
    }
}
