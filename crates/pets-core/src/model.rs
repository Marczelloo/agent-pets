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
