use std::path::PathBuf;
use crate::claude::{progress_from_tool_use, HookEnvelope};
use crate::model::*;
use crate::tools::from_claude;

pub fn transcript_path(env: &HookEnvelope) -> Option<PathBuf> {
    env.payload.get("transcript_path")?.as_str().map(PathBuf::from)
}

pub fn to_events(env: &HookEnvelope) -> Vec<Event> {
    let p = &env.payload;
    let Some(sid) = p.get("session_id").and_then(|v| v.as_str()) else { return vec![] };
    let name = p.get("hook_event_name").and_then(|v| v.as_str()).unwrap_or("");
    let tool_name = p.get("tool_name").and_then(|v| v.as_str()).unwrap_or("");
    let null = serde_json::Value::Null;
    let tool_input = p.get("tool_input").unwrap_or(&null);

    let mut e = Event::new(Source::Claude, sid, Kind::Meta, env.ts);
    e.data.cwd = p.get("cwd").and_then(|v| v.as_str()).map(String::from);
    e.data.pid = env.ppid;

    let task_tool = matches!(tool_name, "TaskCreate" | "TaskUpdate" | "TaskList" | "TaskGet");
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
            } else {
                e.kind = Kind::ToolStart;
                e.tool = Some(from_claude(tool_name));
            }
        }
        "PostToolUse" => {
            if tool_name == "TodoWrite" { return vec![]; }
            e.kind = Kind::ToolEnd;
        }
        "Notification" => e.kind = Kind::NeedsInput,
        "Stop" => e.kind = Kind::TurnEnd,
        "PreCompact" => e.kind = Kind::Compact,
        "SessionEnd" => e.kind = Kind::SessionEnd,
        _ => return vec![],
    }
    vec![e]
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

    fn env(v: serde_json::Value) -> HookEnvelope { HookEnvelope { ts: 1000, ppid: Some(77), payload: v } }

    #[test]
    fn pre_tool_use_becomes_tool_start_with_mapped_tool() {
        let e = to_events(&env(json!({"hook_event_name": "PreToolUse", "session_id": "s", "cwd": "C:\\p",
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
        let e = to_events(&env(json!({"hook_event_name": "PreToolUse", "session_id": "s", "tool_name": "TodoWrite",
            "tool_input": {"todos": [{"status": "completed"}, {"status": "pending"}]}})));
        assert_eq!(e[0].kind, Kind::Meta);
        assert_eq!(e[0].data.progress, Some(Progress { done: 1, total: 2 }));
        let post = to_events(&env(json!({"hook_event_name": "PostToolUse", "session_id": "s", "tool_name": "TodoWrite"})));
        assert!(post.is_empty());
    }

    #[test]
    fn lifecycle_events_map() {
        let k = |name: &str| to_events(&env(json!({"hook_event_name": name, "session_id": "s"}))).first().map(|e| e.kind);
        assert_eq!(k("SessionStart"), Some(Kind::SessionStart));
        assert_eq!(k("UserPromptSubmit"), Some(Kind::Prompt));
        assert_eq!(k("Notification"), Some(Kind::NeedsInput));
        assert_eq!(k("Stop"), Some(Kind::TurnEnd));
        assert_eq!(k("PreCompact"), Some(Kind::Compact));
        assert_eq!(k("SessionEnd"), Some(Kind::SessionEnd));
        assert_eq!(k("SubagentStop"), None);
        assert_eq!(k("Whatever"), None);
    }

    #[test]
    fn ask_user_question_needs_input() {
        let e = to_events(&env(json!({"hook_event_name": "PreToolUse", "session_id": "s", "tool_name": "AskUserQuestion"})));
        assert_eq!(e[0].kind, Kind::NeedsInput);
    }

    #[test]
    fn idle_prompt_notification_is_ignored_permission_is_not() {
        let n = |t: &str| to_events(&env(json!({"hook_event_name": "Notification", "session_id": "s", "notification_type": t})));
        assert!(n("idle_prompt").is_empty());
        assert_eq!(n("permission_prompt")[0].kind, Kind::NeedsInput);
    }

    #[test]
    fn task_list_tools_do_not_animate() {
        for ev in ["PreToolUse", "PostToolUse"] {
            for t in ["TaskCreate", "TaskUpdate", "TaskList", "TaskGet"] {
                assert!(to_events(&env(json!({"hook_event_name": ev, "session_id": "s", "tool_name": t}))).is_empty(), "{ev} {t}");
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
        assert!(to_events(&env(json!({"hook_event_name": "Stop"}))).is_empty());
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
            let ev = to_events(&e);
            if name != "SubagentStop" && name != "PostToolUse" && !tool.starts_with("Task") && !idle {
                assert!(!ev.is_empty(), "brak zdarzenia dla {:?}", f.path());
            }
        }
        assert!(progress_seen, "próbki TaskCreate/TaskUpdate powinny dać postęp");
    }
}
