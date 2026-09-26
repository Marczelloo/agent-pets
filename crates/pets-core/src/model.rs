use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq, Hash)]
#[serde(rename_all = "snake_case")]
pub enum Agent { Claude, Codex }

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum Origin { Cli, Desktop, Router }

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum App { Terminal, ClaudeDesktop, CodexApp, Vscode }

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum State { Thinking, Working, NeedsYou, Done, Error, Idle, Sleep, Compacting, Ended }

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum Tool { Edit, Bash, Read, Grep, Web, Agent, Mcp, Other }

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq)]
pub struct Progress { pub done: u32, pub total: u32 }

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq)]
pub struct Context { pub used: u64, pub max: u64 }

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Default)]
pub struct JumpTarget {
    pub pid: Option<u32>,
    pub session_id: String,
    pub cwd: String,
    pub app: Option<App>,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct Session {
    pub id: String,
    pub agent: Agent,
    pub origin: Origin,
    pub title: String,
    pub cwd: String,
    pub state: State,
    pub tool: Option<Tool>,
    pub progress: Option<Progress>,
    pub context: Option<Context>,
    pub started_at: i64,
    pub last_activity: i64,
    /// czas wejścia w bieżący stan (do minimalnego czasu stanu i progów)
    pub state_since: i64,
    pub turn_started_at: Option<i64>,
    pub jump: JumpTarget,
    #[serde(default)]
    pub router_task: Option<RouterTask>,
    /// id sesji rodzica; `None` = zwykła sesja
    #[serde(default)]
    pub parent: Option<String>,
    /// tylko u dzieci (subagentów)
    #[serde(default)]
    pub sub: Option<SubInfo>,
    /// bieżący tekst akcji (tylko w pamięci), pusty poza pracą narzędziem
    #[serde(default)]
    pub action: Option<String>,
    /// tekst pytania (tylko w pamięci), tylko w `needs_you`
    #[serde(default)]
    pub question: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum SubKind { Claude, Codex, Router }

/// Opis dziecka: kto je uruchomił i po co.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct SubInfo {
    pub kind: SubKind,
    #[serde(default)]
    pub agent_type: Option<String>,
    #[serde(default)]
    pub description: Option<String>,
    /// zadanie w tle (`requestShape: background`): kończy się tylko przez `SubagentStop` albo po 10 min ciszy
    #[serde(default)]
    pub background: bool,
}

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum Window { FiveHour, Weekly }

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq)]
pub struct Limit {
    pub agent: Agent,
    pub window: Window,
    pub used_pct: f32,
    pub resets_at: Option<i64>,
}

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum Source { Claude, Codex, Router }

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum Kind {
    SessionStart, Prompt, ToolStart, ToolEnd, NeedsInput, TurnEnd,
    Error, Compact, SessionEnd, Meta, Limits,
}

/// Dane opcjonalne niesione przez zdarzenie. Puste pola nie nadpisują stanu sesji.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Default)]
#[serde(default)]
pub struct EventData {
    pub title: Option<String>,
    pub cwd: Option<String>,
    pub origin: Option<Origin>,
    pub progress: Option<Progress>,
    pub context: Option<Context>,
    pub limits: Vec<Limit>,
    pub pid: Option<u32>,
    pub app: Option<App>,
    pub router_task: Option<RouterTask>,
    pub parent: Option<String>,
    pub sub: Option<SubInfo>,
    /// tekst akcji przy `ToolStart` (brak = narzędzie bez tekstu)
    pub action: Option<String>,
    /// tekst pytania przy `NeedsInput`
    pub question: Option<String>,
    /// `taskId` zadania Agent Routera zleconego przez tę sesję (wynik `codex_delegate`/`continue`/`review`)
    pub router_link: Option<String>,
    /// `SubagentStop` bez `agent_id`: koniec najnowszego żyjącego dziecka tej sesji
    pub sub_end: bool,
}

/// Zadanie Agent Routera powiązane z wątkiem Codexa (`~/.agent-router/status.json`).
/// „Zdrowie” (aktywne, cisza, utknęło, zablokowane) liczy UI z `last_activity_at` w chwili rysowania.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Default)]
pub struct RouterTask {
    pub task_id: String,
    /// `pending`, `running`, `completed`, `failed`, `interrupted`, `quota_exhausted`
    pub status: String,
    pub last_activity_at: Option<i64>,
    pub blocked: bool,
    pub stall_ms: i64,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct Event {
    pub source: Source,
    pub session_id: String,
    pub kind: Kind,
    pub tool: Option<Tool>,
    pub ts: i64,
    #[serde(default)]
    pub data: EventData,
}

impl Event {
    pub fn new(source: Source, session_id: impl Into<String>, kind: Kind, ts: i64) -> Self {
        Event { source, session_id: session_id.into(), kind, tool: None, ts, data: EventData::default() }
    }
    pub fn agent(&self) -> Agent {
        match self.source { Source::Claude => Agent::Claude, Source::Codex | Source::Router => Agent::Codex }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_0_7_session_loads_without_the_new_fields() {
        let v = serde_json::json!({"id": "s", "agent": "claude", "origin": "cli", "title": "", "cwd": "", "state": "thinking",
            "tool": null, "progress": null, "context": null, "started_at": 1, "last_activity": 2, "state_since": 2,
            "turn_started_at": null, "jump": {"pid": null, "session_id": "s", "cwd": "", "app": null}});
        let s: Session = serde_json::from_value(v).unwrap();
        assert_eq!((s.parent, s.sub, s.action, s.question), (None, None, None, None));
    }

    #[test]
    fn sub_info_is_snake_case() {
        let i = SubInfo { kind: SubKind::Router, agent_type: None, description: Some("Tytuł".into()), background: true };
        let v = serde_json::to_value(&i).unwrap();
        assert_eq!(v["kind"], "router");
        assert_eq!(serde_json::from_value::<SubInfo>(v).unwrap(), i);
    }
}
