use std::collections::HashMap;
use std::path::PathBuf;
use serde_json::Value;
use crate::action::{action_text, question_text};
use crate::claude::{progress_from_tool_use, HookEnvelope};
use crate::i18n::Lang;
use crate::model::*;
use crate::tools::from_claude;

/// Narzędzia Agent Routera, których wynik wiąże zadanie z sesją, która je zleciła.
const ROUTER_LINKING: [&str; 3] = ["mcp__agent-router__codex_delegate", "mcp__agent-router__codex_continue", "mcp__agent-router__codex_review"];

/// `taskId` zadania routera w wyniku narzędzia MCP: w polach JSON, w tekście z JSON-em albo w zwykłym tekście.
pub fn find_task_id(v: &Value) -> Option<String> {
    match v {
        Value::Object(m) => {
            if let Some(Value::String(id)) = m.get("taskId") { if !id.is_empty() { return Some(id.clone()); } }
            m.values().find_map(find_task_id)
        }
        Value::Array(a) => a.iter().find_map(find_task_id),
        Value::String(t) => match serde_json::from_str::<Value>(t) {
            Ok(inner @ (Value::Object(_) | Value::Array(_))) => find_task_id(&inner),
            _ => task_id_in_text(t),
        },
        _ => None,
    }
}

fn task_id_in_text(t: &str) -> Option<String> {
    let i = t.find("\"taskId\"")?;
    let rest = t[i + "\"taskId\"".len()..].trim_start().strip_prefix(':')?.trim_start().strip_prefix('"')?;
    let id: String = rest.chars().take_while(|c| *c != '"').collect();
    if id.is_empty() { None } else { Some(id) }
}

pub fn transcript_path(env: &HookEnvelope) -> Option<PathBuf> {
    env.payload.get("transcript_path")?.as_str().map(PathBuf::from)
}

/// Zdarzenia z hooka. `last`: ostatnia akcja sesji (narzędzie, tekst) do pytania o zgodę.
/// Hooki narzędzi wewnątrz subagenta (`agent_id`) należą do dziecka `"{sesja}/{agent_id}"`.
/// Plik subagenta z `SubagentStop`: czytany przed końcem dziecka, żeby spóźnione linie go nie ożywiły.
pub fn subagent_transcript_path(env: &HookEnvelope) -> Option<PathBuf> {
    env.payload.get("agent_transcript_path")?.as_str().filter(|p| !p.is_empty()).map(PathBuf::from)
}

pub fn to_events(env: &HookEnvelope, lang: Lang, last: Option<(&str, &str)>) -> Vec<Event> {
    let p = &env.payload;
    let Some(sid) = p.get("session_id").and_then(|v| v.as_str()) else { return vec![] };
    let name = p.get("hook_event_name").and_then(|v| v.as_str()).unwrap_or("");
    let tool_name = p.get("tool_name").and_then(|v| v.as_str()).unwrap_or("");
    let null = serde_json::Value::Null;
    let tool_input = p.get("tool_input").unwrap_or(&null);
    let agent_id = p.get("agent_id").and_then(|v| v.as_str()).filter(|a| !a.is_empty());

    if name == "SubagentStop" {
        return vec![match agent_id {
            Some(a) => child(sid, a, p, Kind::SessionEnd, env.ts),
            None => { let mut e = Event::new(Source::Claude, sid, Kind::Meta, env.ts); e.data.sub_end = true; e }
        }];
    }
    // pytanie subagenta (`AskUserQuestion`) czeka u rodzica, jak jego prośby o zgodę
    let asks = name == "PreToolUse" && tool_name == "AskUserQuestion";
    let in_child = matches!(name, "PreToolUse" | "PostToolUse") && !asks;
    let mut e = match agent_id {
        Some(a) if in_child => child(sid, a, p, Kind::Meta, env.ts),
        _ => {
            let mut e = Event::new(Source::Claude, sid, Kind::Meta, env.ts);
            e.data.pid = env.ppid;
            e
        }
    };
    e.data.cwd = p.get("cwd").and_then(|v| v.as_str()).map(String::from);

    let task_tool = matches!(tool_name, "TaskCreate" | "TaskUpdate" | "TaskList" | "TaskGet");
    // program się nie zmienia, ale sesja mogła powstać przed włączeniem widżetu, więc też przy każdym prompcie
    if matches!(name, "SessionStart" | "UserPromptSubmit") {
        if let Some(h) = &env.host {
            e.data.app = Some(h.app);
            e.data.app_name = h.name.clone();
            e.data.host_pid = Some(h.pid);
        }
    }
    match name {
        "SessionStart" => e.kind = Kind::SessionStart,
        "UserPromptSubmit" => e.kind = Kind::Prompt,
        "PreToolUse" if task_tool => return vec![],
        "PostToolUse" if task_tool => return vec![],
        "Notification" if p.get("notification_type").and_then(|v| v.as_str()) == Some("idle_prompt") => return vec![],
        "PreToolUse" => {
            if let Some(pr) = progress_from_tool_use(tool_name, tool_input) {
                e.kind = Kind::Meta;
                e.data.progress = Some(pr);
            } else if tool_name == "AskUserQuestion" {
                e.kind = Kind::NeedsInput;
                e.data.question = question_text(None, None, Some(tool_input), lang);
                e.data.from_child = agent_id.is_some();
            } else {
                e.kind = Kind::ToolStart;
                e.tool = Some(from_claude(tool_name));
                e.data.action = action_text(tool_name, tool_input, lang);
            }
        }
        "PostToolUse" => {
            if tool_name == "TodoWrite" { return vec![]; }
            e.kind = Kind::ToolEnd;
            if ROUTER_LINKING.contains(&tool_name) {
                e.data.router_link = p.get("tool_response").and_then(find_task_id);
            }
        }
        "Notification" => {
            e.kind = Kind::NeedsInput;
            e.data.question = question_text(p.get("message").and_then(|v| v.as_str()), last, None, lang);
            e.data.from_child = agent_id.is_some();
        }
        "Stop" => e.kind = Kind::TurnEnd,
        "PreCompact" => e.kind = Kind::Compact,
        "SessionEnd" => e.kind = Kind::SessionEnd,
        _ => return vec![],
    }
    vec![e]
}

/// Zdarzenie dziecka (subagenta Claude Code) o id `"{rodzic}/{agent_id}"`.
fn child(parent: &str, agent_id: &str, p: &Value, kind: Kind, ts: i64) -> Event {
    let mut e = Event::new(Source::Claude, format!("{parent}/{agent_id}"), kind, ts);
    e.data.parent = Some(parent.to_string());
    e.data.sub = Some(SubInfo {
        kind: SubKind::Claude,
        agent_type: p.get("agent_type").and_then(|v| v.as_str()).map(String::from),
        description: None,
        background: false,
    });
    e
}

/// Stan hooków między wywołaniami: ostatnia akcja każdej sesji (tylko w pamięci), do pytania o zgodę.
#[derive(Default)]
pub struct HookState {
    last: HashMap<String, (String, String)>,
}

impl HookState {
    pub fn events(&mut self, env: &HookEnvelope, lang: Lang) -> Vec<Event> {
        let p = &env.payload;
        let Some(sid) = p.get("session_id").and_then(|v| v.as_str()) else { return vec![] };
        let last = self.last.get(sid).map(|(t, a)| (t.as_str(), a.as_str()));
        let events = to_events(env, lang, last);
        let tool = p.get("tool_name").and_then(|v| v.as_str()).unwrap_or("");
        for e in &events {
            match (e.kind, &e.data.action) {
                // akcja dziecka też: zgoda na jego narzędzie czeka u rodzica
                (Kind::ToolStart, Some(a)) => { self.last.insert(sid.to_string(), (tool.to_string(), a.clone())); }
                (Kind::SessionEnd, _) if e.session_id == sid => { self.last.remove(sid); }
                _ => {}
            }
        }
        events
    }

    pub fn is_empty_for(&self, sid: &str) -> bool { !self.last.contains_key(sid) }
}

/// Postęp z narzędzi listy zadań Claude Code 2.1+ (TaskCreate/TaskUpdate), śledzony per sesja.
#[derive(Default)]
pub struct TaskTracker {
    sessions: std::collections::HashMap<String, std::collections::BTreeMap<String, bool>>,
}

fn id_str(v: Option<&serde_json::Value>) -> Option<String> {
    match v? {
        serde_json::Value::String(s) => Some(s.clone()),
        serde_json::Value::Number(n) => Some(n.to_string()),
        _ => None,
    }
}

impl TaskTracker {
    pub fn observe(&mut self, env: &HookEnvelope) -> Option<Event> {
        let p = &env.payload;
        if p.get("hook_event_name").and_then(|v| v.as_str()) != Some("PostToolUse") { return None; }
        let sid = p.get("session_id")?.as_str()?;
        let tasks = self.sessions.entry(sid.to_string()).or_default();
        match p.get("tool_name").and_then(|v| v.as_str())? {
            "TaskCreate" => {
                let id = id_str(p.pointer("/tool_response/task/id"))?;
                tasks.insert(id, false);
            }
            "TaskUpdate" => {
                let id = id_str(p.pointer("/tool_input/taskId"))?;
                match p.pointer("/tool_input/status").and_then(|v| v.as_str())? {
                    "completed" => { tasks.insert(id, true); }
                    "pending" | "in_progress" => { tasks.insert(id, false); }
                    "deleted" => { tasks.remove(&id); }
                    _ => return None,
                }
            }
            _ => return None,
        }
        let done = tasks.values().filter(|d| **d).count() as u32;
        let mut e = Event::new(Source::Claude, sid, Kind::Meta, env.ts);
        e.data.progress = Some(Progress { done, total: tasks.len() as u32 });
        Some(e)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn env(v: serde_json::Value) -> HookEnvelope { HookEnvelope { ts: 1000, ppid: Some(77), payload: v, host: None } }
    fn te(e: &HookEnvelope) -> Vec<Event> { to_events(e, Lang::Pl, None) }
    fn fixture(name: &str) -> HookEnvelope {
        let p = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/claude/hooks").join(name);
        env(serde_json::from_str(&std::fs::read_to_string(p).unwrap()).unwrap())
    }

    #[test]
    fn the_host_program_rides_on_session_start_and_prompts() {
        let host = crate::host::Host { app: App::T3code, name: None, pid: 9 };
        for name in ["SessionStart", "UserPromptSubmit"] {
            let mut x = env(json!({"hook_event_name": name, "session_id": "s", "cwd": "C:\\p", "prompt": "a", "source": "startup"}));
            x.host = Some(host.clone());
            let e = te(&x);
            assert_eq!((e[0].data.app, e[0].data.host_pid), (Some(App::T3code), Some(9)), "{name}");
        }
        let mut x = env(json!({"hook_event_name": "PreToolUse", "session_id": "s", "tool_name": "Edit", "tool_input": {}}));
        x.host = Some(host);
        assert_eq!(te(&x)[0].data.app, None, "reszta zdarzeń bez programu");
    }

    #[test]
    fn pre_tool_use_becomes_tool_start_with_mapped_tool() {
        let e = te(&env(json!({"hook_event_name": "PreToolUse", "session_id": "s", "cwd": "C:\\p",
            "transcript_path": "C:\\t.jsonl", "tool_name": "Edit", "tool_input": {}})));
        assert_eq!(e.len(), 1);
        assert_eq!((e[0].kind, e[0].tool), (Kind::ToolStart, Some(Tool::Edit)));
        assert_eq!(e[0].session_id, "s");
        assert_eq!(e[0].data.pid, Some(77));
        assert_eq!(e[0].data.cwd.as_deref(), Some("C:\\p"));
        assert_eq!(e[0].ts, 1000);
    }

    #[test]
    fn todo_write_is_progress_not_tool() {
        let e = te(&env(json!({"hook_event_name": "PreToolUse", "session_id": "s", "tool_name": "TodoWrite",
            "tool_input": {"todos": [{"status": "completed"}, {"status": "pending"}]}})));
        assert_eq!(e[0].kind, Kind::Meta);
        assert_eq!(e[0].data.progress, Some(Progress { done: 1, total: 2 }));
        let post = te(&env(json!({"hook_event_name": "PostToolUse", "session_id": "s", "tool_name": "TodoWrite"})));
        assert!(post.is_empty());
    }

    #[test]
    fn lifecycle_events_map() {
        let k = |name: &str| te(&env(json!({"hook_event_name": name, "session_id": "s"}))).first().map(|e| e.kind);
        assert_eq!(k("SessionStart"), Some(Kind::SessionStart));
        assert_eq!(k("UserPromptSubmit"), Some(Kind::Prompt));
        assert_eq!(k("Notification"), Some(Kind::NeedsInput));
        assert_eq!(k("Stop"), Some(Kind::TurnEnd));
        assert_eq!(k("PreCompact"), Some(Kind::Compact));
        assert_eq!(k("SessionEnd"), Some(Kind::SessionEnd));
        assert_eq!(k("Whatever"), None);
    }

    #[test]
    fn ask_user_question_needs_input() {
        let e = te(&env(json!({"hook_event_name": "PreToolUse", "session_id": "s", "tool_name": "AskUserQuestion"})));
        assert_eq!(e[0].kind, Kind::NeedsInput);
    }

    #[test]
    fn idle_prompt_notification_is_ignored_permission_is_not() {
        let n = |t: &str| te(&env(json!({"hook_event_name": "Notification", "session_id": "s", "notification_type": t})));
        assert!(n("idle_prompt").is_empty());
        assert_eq!(n("permission_prompt")[0].kind, Kind::NeedsInput);
    }

    #[test]
    fn task_list_tools_do_not_animate() {
        for ev in ["PreToolUse", "PostToolUse"] {
            for t in ["TaskCreate", "TaskUpdate", "TaskList", "TaskGet"] {
                assert!(te(&env(json!({"hook_event_name": ev, "session_id": "s", "tool_name": t}))).is_empty(), "{ev} {t}");
            }
        }
    }

    #[test]
    fn task_tracker_counts_created_completed_and_deleted() {
        let mut tr = TaskTracker::default();
        let create = |id: &str| env(json!({"hook_event_name": "PostToolUse", "session_id": "s", "tool_name": "TaskCreate",
            "tool_input": {"subject": "x"}, "tool_response": {"task": {"id": id, "subject": "x"}}}));
        let update = |id: &str, st: &str| env(json!({"hook_event_name": "PostToolUse", "session_id": "s", "tool_name": "TaskUpdate",
            "tool_input": {"taskId": id, "status": st}}));
        tr.observe(&create("1"));
        let e = tr.observe(&create("2")).unwrap();
        assert_eq!((e.kind, e.data.progress), (Kind::Meta, Some(Progress { done: 0, total: 2 })));
        let e = tr.observe(&update("1", "completed")).unwrap();
        assert_eq!(e.data.progress, Some(Progress { done: 1, total: 2 }));
        let e = tr.observe(&update("2", "deleted")).unwrap();
        assert_eq!(e.data.progress, Some(Progress { done: 1, total: 1 }));
        assert!(tr.observe(&env(json!({"hook_event_name": "PostToolUse", "session_id": "s", "tool_name": "TaskUpdate",
            "tool_input": {"taskId": "1", "subject": "tylko zmiana nazwy"}}))).is_none());
        assert!(tr.observe(&env(json!({"hook_event_name": "PreToolUse", "session_id": "s", "tool_name": "TaskCreate"}))).is_none());
    }

    #[test]
    fn missing_session_id_yields_nothing() {
        assert!(te(&env(json!({"hook_event_name": "Stop"}))).is_empty());
    }

    #[test]
    fn extracts_transcript_path() {
        let p = transcript_path(&env(json!({"transcript_path": "C:\\t.jsonl"})));
        assert_eq!(p, Some(PathBuf::from("C:\\t.jsonl")));
    }

    #[test]
    fn real_hook_fixtures_parse() {
        let dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/claude/hooks");
        let Ok(rd) = std::fs::read_dir(&dir) else { return };
        let mut tr = TaskTracker::default();
        let mut progress_seen = false;
        for f in rd.flatten() {
            let v: serde_json::Value = serde_json::from_str(&std::fs::read_to_string(f.path()).unwrap()).unwrap();
            let name = v.get("hook_event_name").and_then(|x| x.as_str()).unwrap_or("").to_string();
            let tool = v.get("tool_name").and_then(|x| x.as_str()).unwrap_or("").to_string();
            let idle = v.get("notification_type").and_then(|x| x.as_str()) == Some("idle_prompt");
            let e = env(v);
            progress_seen |= tr.observe(&e).is_some();
            let ev = te(&e);
            if name != "PostToolUse" && !tool.starts_with("Task") && !idle {
                assert!(!ev.is_empty(), "brak zdarzenia dla {:?}", f.path());
            }
        }
        assert!(progress_seen, "próbki TaskCreate/TaskUpdate powinny dać postęp");
    }

    #[test]
    fn a_tool_start_carries_its_action_text() {
        let e = te(&env(json!({"hook_event_name": "PreToolUse", "session_id": "s", "tool_name": "Edit",
            "tool_input": {"file_path": "C:\\x\\App.tsx"}})));
        assert_eq!(e[0].data.action.as_deref(), Some("Edytuje App.tsx"));
        let e = to_events(&env(json!({"hook_event_name": "PreToolUse", "session_id": "s", "tool_name": "Bash",
            "tool_input": {"command": "npm test"}})), Lang::En, None);
        assert_eq!(e[0].data.action.as_deref(), Some("npm test"));
    }

    #[test]
    fn delegating_to_a_subagent_is_an_agent_action_on_the_parent() {
        let e = te(&fixture("PreToolUse-Agent.json"));
        assert_eq!((e[0].kind, e[0].tool, e[0].session_id.as_str()), (Kind::ToolStart, Some(Tool::Agent), "3746a003-5ba1-42b3-a085-009646ebcf00"));
        assert_eq!(e[0].data.action.as_deref(), Some("Zleca: List spike names"));
    }

    #[test]
    fn tools_used_inside_a_subagent_belong_to_the_child() {
        let e = te(&fixture("PreToolUse-Bash-in-subagent.json"));
        assert_eq!(e[0].session_id, "3746a003-5ba1-42b3-a085-009646ebcf00/a78e678e3f4a4da31");
        assert_eq!(e[0].data.parent.as_deref(), Some("3746a003-5ba1-42b3-a085-009646ebcf00"));
        let sub = e[0].data.sub.as_ref().unwrap();
        assert_eq!((sub.kind, sub.agent_type.as_deref()), (SubKind::Claude, Some("general-purpose")));
        assert_eq!((e[0].kind, e[0].tool, e[0].data.action.as_deref()), (Kind::ToolStart, Some(Tool::Bash), Some("echo spike-ok")));
        assert_eq!(e[0].data.pid, None, "pid procesu należy do rodzica, nie do dziecka");
    }

    #[test]
    fn subagent_stop_ends_that_child() {
        let e = te(&fixture("SubagentStop.json"));
        assert_eq!(e.len(), 1);
        assert_eq!((e[0].kind, e[0].session_id.as_str()), (Kind::SessionEnd, "3746a003-5ba1-42b3-a085-009646ebcf00/ac80bccb9e5a3f6e0"));
        assert_eq!(e[0].data.parent.as_deref(), Some("3746a003-5ba1-42b3-a085-009646ebcf00"));
    }

    #[test]
    fn subagent_stop_without_an_id_ends_the_newest_child() {
        let e = te(&env(json!({"hook_event_name": "SubagentStop", "session_id": "s"})));
        assert_eq!((e[0].kind, e[0].session_id.as_str(), e[0].data.sub_end), (Kind::Meta, "s", true));
    }

    #[test]
    fn permission_notification_names_the_last_command() {
        let n = env(json!({"hook_event_name": "Notification", "session_id": "s",
            "message": "Claude needs your permission to use Bash", "notification_type": "permission_prompt"}));
        let e = to_events(&n, Lang::Pl, Some(("Bash", "npm test")));
        assert_eq!((e[0].kind, e[0].data.question.as_deref()), (Kind::NeedsInput, Some("Zgoda na Bash? npm test")));
        let mut sub = n.clone();
        sub.payload["agent_id"] = json!("a1");
        assert_eq!(to_events(&sub, Lang::Pl, None)[0].session_id, "s", "zgoda dziecka czeka u rodzica");
    }

    #[test]
    fn ask_user_question_carries_the_question() {
        let e = te(&env(json!({"hook_event_name": "PreToolUse", "session_id": "s", "tool_name": "AskUserQuestion",
            "tool_input": {"questions": [{"question": "Który wariant?"}]}})));
        assert_eq!((e[0].kind, e[0].data.question.as_deref()), (Kind::NeedsInput, Some("Pytanie: Który wariant?")));
    }

    #[test]
    fn hook_state_remembers_the_last_action_per_session_for_the_question() {
        let mut h = HookState::default();
        h.events(&env(json!({"hook_event_name": "PreToolUse", "session_id": "s", "tool_name": "Bash", "tool_input": {"command": "cargo test"}})), Lang::Pl);
        h.events(&env(json!({"hook_event_name": "PreToolUse", "session_id": "t", "tool_name": "Bash", "tool_input": {"command": "ls"}})), Lang::Pl);
        let e = h.events(&env(json!({"hook_event_name": "Notification", "session_id": "s",
            "message": "Claude needs your permission to use Bash"})), Lang::Pl);
        assert_eq!(e[0].data.question.as_deref(), Some("Zgoda na Bash? cargo test"));
        h.events(&env(json!({"hook_event_name": "SessionEnd", "session_id": "s"})), Lang::Pl);
        assert!(h.is_empty_for("s"), "po końcu sesji nic o niej nie trzymamy");
    }

    #[test]
    fn a_router_delegation_links_its_task_to_the_caller() {
        let e = te(&fixture("PostToolUse-mcp-codex_delegate.json"));
        assert_eq!((e[0].kind, e[0].session_id.as_str()), (Kind::ToolEnd, "3746a003-5ba1-42b3-a085-009646ebcf00"));
        assert_eq!(e[0].data.router_link.as_deref(), Some("codex-20260926192354-00172e9"));
        let other = te(&env(json!({"hook_event_name": "PostToolUse", "session_id": "s", "tool_name": "mcp__agent-router__codex_task_status",
            "tool_response": [{"type": "text", "text": "{\"taskId\":\"x\"}"}]})));
        assert_eq!(other[0].data.router_link, None, "tylko zlecenie, kontynuacja i review wiążą zadanie");
    }

    #[test]
    fn task_id_is_found_in_json_in_text_and_nowhere() {
        assert_eq!(find_task_id(&json!({"taskId": "a"})).as_deref(), Some("a"));
        assert_eq!(find_task_id(&json!({"result": {"items": [{"x": 1}, {"taskId": "b"}]}})).as_deref(), Some("b"));
        assert_eq!(find_task_id(&json!([{"type": "text", "text": "{\n  \"status\": \"running\",\n  \"taskId\": \"c\"\n}"}])).as_deref(), Some("c"));
        assert_eq!(find_task_id(&json!("Started. \"taskId\": \"d-1\", waiting")).as_deref(), Some("d-1"));
        assert_eq!(find_task_id(&json!({"content": [{"text": "no id here"}], "taskId": 5})), None);
    }

    #[test]
    fn a_permission_request_inside_a_subagent_waits_at_the_parent_marked_as_the_child_s() {
        let n = env(json!({"hook_event_name": "Notification", "session_id": "s", "agent_id": "a1",
            "message": "Claude needs your permission to use Bash"}));
        let e = to_events(&n, Lang::Pl, None);
        assert_eq!((e[0].session_id.as_str(), e[0].kind, e[0].data.from_child), ("s", Kind::NeedsInput, true));
    }

    #[test]
    fn ask_user_question_inside_a_subagent_is_asked_at_the_parent() {
        let e = te(&env(json!({"hook_event_name": "PreToolUse", "session_id": "s", "agent_id": "a1", "tool_name": "AskUserQuestion",
            "tool_input": {"questions": [{"question": "Który?"}]}})));
        assert_eq!((e[0].session_id.as_str(), e[0].kind, e[0].data.question.as_deref(), e[0].data.from_child),
            ("s", Kind::NeedsInput, Some("Pytanie: Który?"), true));
    }

    #[test]
    fn subagent_stop_names_the_child_transcript() {
        let p = subagent_transcript_path(&fixture("SubagentStop.json")).unwrap();
        assert!(p.to_string_lossy().ends_with("agent-ac80bccb9e5a3f6e0.jsonl"));
        assert!(subagent_transcript_path(&env(json!({"hook_event_name": "Stop"}))).is_none());
    }
}
