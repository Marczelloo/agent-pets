//! ZCode (Z.ai): hooki z ustawień ZCode przez `hook.exe --agent zcode --event <nazwa>` na `/v1/events/zcode`
//! (spec 0.12 §5). Zdarzenia jak w Claude Code; pola w dwóch zapisach, camelCase i snake_case, adapter czyta oba.
use super::{action_from, clean_text, safe_id, AgentEnvelope};
use crate::i18n::Lang;
use crate::model::*;
use crate::tools::from_keywords;

/// Argumenty narzędzi do tekstu akcji: (klucz ZCode, klucz Claude'a). Treść plików i diffy nigdy.
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
    let tool = s("toolName", "tool_name").unwrap_or("");
    let action = || claude_name(from_keywords(tool)).and_then(|n| action_from(n, get("toolInput", "tool_input"), &KEYS, lang));
    let kind = match env.event.as_str() {
        "SessionStart" => Kind::SessionStart,
        "UserPromptSubmit" => Kind::Prompt,
        "PreToolUse" => Kind::ToolStart,
        // `reason` pisze model i może cytować cokolwiek z rozmowy, więc pytanie to tylko akcja albo nazwa narzędzia
        "PermissionRequest" => Kind::NeedsInput,
        "PostToolUse" => Kind::ToolEnd,
        "PostToolUseFailure" if get("isInterrupt", "is_interrupt").and_then(|v| v.as_bool()) == Some(true) => Kind::TurnEnd,
        "PostToolUseFailure" => Kind::ToolEnd,
        "Stop" => Kind::TurnEnd,
        _ => return vec![],
    };
    let ts = Some(env.ts).filter(|t| *t > 0).unwrap_or_else(crate::time::now_ms);
    let mut e = Event::new(Source::Zcode, format!("zcode:{sid}"), kind, ts);
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
    match kind {
        Kind::ToolStart => {
            e.tool = Some(from_keywords(tool));
            e.data.action = action();
        }
        Kind::NeedsInput => e.data.question = action().or_else(|| Some(clean_text(tool, 80)).filter(|x| !x.is_empty())),
        _ => {}
    }
    vec![e]
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::{json, Value};

    fn fixture() -> Vec<AgentEnvelope> {
        let p = concat!(env!("CARGO_MANIFEST_DIR"), "/tests/fixtures/zcode/session.jsonl");
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
            Kind::TurnEnd, Kind::TurnEnd]);
        for e in &v {
            assert_eq!((e.session_id.as_str(), e.agent(), e.data.pid, e.data.cwd.as_deref(), e.data.origin),
                ("zcode:zc_1", Agent::Zcode, Some(4242), Some("C:/work/app"), Some(Origin::Cli)), "{e:?}");
        }
        assert_eq!((v[0].data.model.as_deref(), v[1].data.model.as_deref()), (Some("glm-5"), None));
        assert_eq!((v[0].data.app, v[0].data.host_pid, v[1].data.app), (Some(App::Zcode), Some(900), None));
        assert_eq!(v[2].tool, Some(Tool::Read));
        assert!(v[2].data.action.as_deref().unwrap_or("").contains("main.ts"), "{:?}", v[2]);
        assert_eq!((v[5].tool, v[5].data.action.as_deref()), (Some(Tool::Bash), Some("npm test")));
    }

    #[test]
    fn a_permission_request_asks_about_the_action_and_never_shows_the_reason() {
        let v: Vec<Event> = fixture().iter().flat_map(|e| events(e, Lang::Pl)).collect();
        assert_eq!(v[4].data.question.as_deref(), Some("npm test"));
        assert!(!format!("{:?}", v[4]).contains("SEKRET"));
        let bare = one(env("PermissionRequest", json!({"sessionId": "zc_1", "toolName": "mcp__db__query", "reason": "SEKRET-123"})));
        assert_eq!((bare.kind, bare.data.question.as_deref()), (Kind::NeedsInput, Some("mcp__db__query")));
        let nothing = one(env("PermissionRequest", json!({"sessionId": "zc_1"})));
        assert_eq!(nothing.data.question, None);
    }

    #[test]
    fn both_spellings_of_the_fields_mean_the_same() {
        let camel = one(env("PreToolUse", json!({"sessionId": "z1", "toolName": "Bash", "toolInput": {"command": "ls"}})));
        let snake = one(env("PreToolUse", json!({"session_id": "z1", "tool_name": "Bash", "tool_input": {"command": "ls"}})));
        assert_eq!(camel, snake);
        assert_eq!(one(env("PostToolUseFailure", json!({"session_id": "z1", "is_interrupt": true}))).kind, Kind::TurnEnd);
        assert_eq!(one(env("PostToolUseFailure", json!({"sessionId": "z1"}))).kind, Kind::ToolEnd);
    }

    #[test]
    fn a_bad_session_or_an_unknown_event_gives_nothing() {
        for bad in [json!({"sessionId": "../x"}), json!({}), json!({"sessionId": 5})] {
            assert!(events(&env("Stop", bad.clone()), Lang::Pl).is_empty(), "{bad}");
        }
        for ev in ["SessionEnd", "Notification", "PreCompact", "Other"] {
            assert!(events(&env(ev, json!({"sessionId": "z1"})), Lang::Pl).is_empty(), "{ev}");
        }
    }

    #[test]
    fn prompts_and_tool_results_never_reach_an_event() {
        for ev in ["SessionStart", "UserPromptSubmit", "PreToolUse", "PermissionRequest", "PostToolUse", "Stop"] {
            let p = json!({"sessionId": "z1", "prompt": "SEKRET-123", "toolResponse": "SEKRET-123", "reason": "SEKRET-123",
                "toolName": "Write", "toolInput": {"file_path": "a.ts", "content": "SEKRET-123"}});
            for e in events(&env(ev, p), Lang::Pl) { assert!(!format!("{e:?}").contains("SEKRET"), "{ev}: {e:?}"); }
        }
    }
}
