//! Grok Build: hooki z `~/.grok/hooks/agent-pets.json` (spec 0.12 §4). `hook.exe --agent grok --event <nazwa>`.
//! Zdarzenia jak w Claude Code (PascalCase); pola w dwóch zapisach, camelCase i snake_case, adapter czyta oba.
use super::{action_from, clean_text, safe_id, AgentEnvelope};
use crate::i18n::Lang;
use crate::model::*;
use crate::tools::from_keywords;
use serde_json::Value;

/// Argumenty narzędzi do tekstu akcji: (klucz Groka, klucz Claude'a). Treść plików i diffy nigdy.
const KEYS: [(&str, &str); 8] = [("command", "command"), ("cmd", "command"), ("file_path", "file_path"), ("filePath", "file_path"),
    ("path", "file_path"), ("pattern", "pattern"), ("query", "pattern"), ("url", "url")];

/// Narzędzie Claude'a o tym samym tekście akcji.
fn claude_name(tool: Tool) -> Option<&'static str> {
    Some(match tool {
        Tool::Bash => "Bash", Tool::Edit => "Edit", Tool::Read => "Read", Tool::Grep => "Grep", Tool::Web => "WebFetch", Tool::Agent => "Task",
        Tool::Mcp | Tool::Other => return None,
    })
}

pub fn events(env: &AgentEnvelope, lang: Lang) -> Vec<Event> {
    let p = &env.payload;
    let get = |a: &str, b: &str| p.get(a).filter(|v| !v.is_null()).or_else(|| p.get(b)).filter(|v| !v.is_null());
    let s = |a: &str, b: &str| get(a, b).and_then(|v| v.as_str());
    let text = |a: &str, b: &str, max: usize| s(a, b).map(|x| clean_text(x, max)).filter(|x| !x.is_empty());
    let Some(sid) = s("sessionId", "session_id").filter(|x| safe_id(x)) else { return vec![] };
    let (kind, t) = match env.event.as_str() {
        "SessionStart" => (Kind::SessionStart, None),
        "UserPromptSubmit" => (Kind::Prompt, None),
        "PreToolUse" => (Kind::ToolStart, Some(from_keywords(s("toolName", "tool_name").unwrap_or("")))),
        "PostToolUse" => (Kind::ToolEnd, None),
        "PostToolUseFailure" if get("isInterrupt", "is_interrupt").and_then(|v| v.as_bool()) == Some(true) => (Kind::TurnEnd, None),
        "PostToolUseFailure" => (Kind::ToolEnd, None),
        "Notification" => {
            let waits = match s("notificationType", "notification_type") {
                Some(ty) => matches!(ty, "permission_prompt" | "elicitation_dialog"),
                None => s("message", "message").is_some_and(|m| m.to_lowercase().contains("permission")),
            };
            if !waits { return vec![]; }
            (Kind::NeedsInput, None)
        }
        "Stop" | "StopCancelled" => (Kind::TurnEnd, None),
        "StopFailure" => (Kind::Error, None),
        "PreCompact" => (Kind::Compact, None),
        "SessionEnd" => (Kind::SessionEnd, None),
        _ => return vec![],
    };
    let ts = Some(env.ts).filter(|t| *t > 0).unwrap_or_else(crate::time::now_ms);
    let mut e = Event::new(Source::Grok, format!("grok:{sid}"), kind, ts);
    e.tool = t;
    let d = &mut e.data;
    d.pid = env.ppid.filter(|p| *p > 0);
    d.cwd = text("cwd", "cwd", 260);
    d.origin = Some(Origin::Cli);
    d.model = text("model", "model", 64);
    if let Some(h) = &env.host {
        d.app = Some(h.app);
        d.app_name = h.name.clone();
        d.host_pid = Some(h.pid);
    }
    match (kind, t) {
        (Kind::ToolStart, Some(tl)) => d.action = claude_name(tl).and_then(|n| action_from(n, get("toolInput", "tool_input"), &KEYS, lang)),
        (Kind::NeedsInput, _) => d.question = text("message", "message", 300),
        _ => {}
    }
    vec![e]
}

/// Uzupełnia `sessionId` ze zmiennej `GROK_SESSION_ID`, gdy JSON go nie ma (ani `session_id`).
pub fn fill_session(payload: &mut Value, sid: Option<String>) {
    let (Some(o), Some(sid)) = (payload.as_object_mut(), sid) else { return };
    if !o.contains_key("sessionId") && !o.contains_key("session_id") { o.insert("sessionId".into(), Value::String(sid)); }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn fixture() -> Vec<AgentEnvelope> {
        let p = concat!(env!("CARGO_MANIFEST_DIR"), "/tests/fixtures/grok/session.jsonl");
        std::fs::read_to_string(p).unwrap().lines().map(|l| serde_json::from_str(l).unwrap()).collect()
    }

    fn env(event: &str, payload: Value) -> AgentEnvelope {
        AgentEnvelope { ts: 1_790_000_000_000, ppid: Some(7), event: event.into(), payload, host: None }
    }

    fn one(e: AgentEnvelope) -> Event {
        let v = events(&e, Lang::Pl);
        assert_eq!(v.len(), 1, "{e:?}");
        v.into_iter().next().unwrap()
    }

    #[test]
    fn a_recorded_session_walks_through_every_state() {
        let v: Vec<Event> = fixture().iter().flat_map(|e| events(e, Lang::Pl)).collect();
        let kinds: Vec<Kind> = v.iter().map(|e| e.kind).collect();
        assert_eq!(kinds, [Kind::SessionStart, Kind::Prompt, Kind::ToolStart, Kind::ToolEnd, Kind::NeedsInput, Kind::ToolStart,
            Kind::TurnEnd, Kind::Compact, Kind::TurnEnd, Kind::Error, Kind::SessionEnd]);
        for e in &v {
            assert_eq!((e.session_id.as_str(), e.agent(), e.data.pid, e.data.cwd.as_deref(), e.data.origin),
                ("grok:grok_1", Agent::Grok, Some(4242), Some("C:/work/app"), Some(Origin::Cli)), "{e:?}");
        }
        assert_eq!((v[0].data.app, v[0].data.host_pid, v[2].data.app), (Some(App::Terminal), Some(900), None));
        assert_eq!(v[0].data.model.as_deref(), Some("grok-code-fast-1"));
        assert_eq!((v[2].tool, v[5].tool, v[5].data.action.as_deref()), (Some(Tool::Read), Some(Tool::Bash), Some("npm test")));
        assert!(v[2].data.action.as_deref().unwrap_or("").contains("main.ts"), "{:?}", v[2]);
        assert_eq!(v[4].data.question.as_deref(), Some("Allow bash: npm test?"));
    }

    #[test]
    fn both_spellings_of_the_fields_mean_the_same() {
        let camel = one(env("PreToolUse", json!({"sessionId": "g1", "toolName": "bash", "toolInput": {"command": "ls"}})));
        let snake = one(env("PreToolUse", json!({"session_id": "g1", "tool_name": "bash", "tool_input": {"command": "ls"}})));
        assert_eq!(camel, snake);
        assert_eq!(one(env("PostToolUseFailure", json!({"session_id": "g1", "is_interrupt": true}))).kind, Kind::TurnEnd);
        assert_eq!(one(env("PostToolUseFailure", json!({"sessionId": "g1"}))).kind, Kind::ToolEnd);
        let n = one(env("Notification", json!({"session_id": "g1", "notification_type": "elicitation_dialog", "message": "Pick one"})));
        assert_eq!((n.kind, n.data.question.as_deref()), (Kind::NeedsInput, Some("Pick one")));
    }

    #[test]
    fn only_notifications_that_wait_for_the_person_count() {
        assert!(events(&env("Notification", json!({"sessionId": "g1", "notificationType": "idle_prompt", "message": "permission"})), Lang::Pl)
            .is_empty());
        let e = one(env("Notification", json!({"sessionId": "g1", "message": "Permission needed"})));
        assert_eq!((e.kind, e.data.question.as_deref()), (Kind::NeedsInput, Some("Permission needed")));
        assert!(events(&env("Notification", json!({"sessionId": "g1", "message": "Done"})), Lang::Pl).is_empty());
    }

    #[test]
    fn a_bad_session_or_an_unknown_event_gives_nothing() {
        for bad in [json!({"sessionId": "../x"}), json!({}), json!({"sessionId": 5})] {
            assert!(events(&env("Stop", bad.clone()), Lang::Pl).is_empty(), "{bad}");
        }
        assert!(events(&env("SubagentStart", json!({"sessionId": "g1"})), Lang::Pl).is_empty());
    }

    /// przerwana tura (Ctrl+C, odrzucona zgoda, limit tur) wysyła `StopCancelled` zamiast `Stop` (dokumentacja Groka)
    #[test]
    fn a_cancelled_turn_ends_the_turn() {
        let v = events(&env("StopCancelled", json!({"sessionId": "g1", "reason": "user_interrupt"})), Lang::Pl);
        assert_eq!(v.iter().map(|e| e.kind).collect::<Vec<_>>(), [Kind::TurnEnd]);
    }

    #[test]
    fn prompts_answers_and_tool_results_never_reach_an_event() {
        for ev in ["SessionStart", "UserPromptSubmit", "PreToolUse", "PostToolUse", "Stop", "Notification"] {
            let p = json!({"sessionId": "g1", "prompt": "SEKRET-123", "last_assistant_message": "SEKRET-123",
                "tool_response": "SEKRET-123", "toolName": "write_file", "toolInput": {"path": "a.ts", "content": "SEKRET-123"},
                "message": "permission"});
            for e in events(&env(ev, p), Lang::Pl) { assert!(!format!("{e:?}").contains("SEKRET"), "{ev}: {e:?}"); }
        }
    }

    #[test]
    fn the_session_id_comes_from_the_environment_when_the_json_has_none() {
        let mut p = json!({"hookEventName": "Stop"});
        fill_session(&mut p, Some("g1".into()));
        assert_eq!(p["sessionId"], "g1");
        let mut own = json!({"sessionId": "g2"});
        fill_session(&mut own, Some("g1".into()));
        assert_eq!(own["sessionId"], "g2");
        let mut snake = json!({"session_id": "g3"});
        fill_session(&mut snake, Some("g1".into()));
        assert!(snake.get("sessionId").is_none());
        let mut none = json!({});
        fill_session(&mut none, None);
        assert!(none.get("sessionId").is_none());
        let mut arr = json!([1]);
        fill_session(&mut arr, Some("g1".into()));
        assert_eq!(arr, json!([1]));
    }
}
