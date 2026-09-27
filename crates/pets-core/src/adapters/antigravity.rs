//! Antigravity: hooki z `~/.gemini/config/hooks.json` przez `hook.exe --agent antigravity --event <nazwa>`
//! na `/v1/events/antigravity` (spec 0.11 §3.3–3.4). Hooki nie mają startu sesji, promptu ani prośby o zgodę:
//! zwierzak myśli, pracuje, kończy i zgłasza błąd, ale nie pokazuje „czeka na Ciebie”.
use super::{action_from, clean_text, safe_id, AgentEnvelope};
use crate::i18n::Lang;
use crate::model::*;
use crate::tools::from_antigravity;

/// Argumenty narzędzi do tekstu akcji: (klucz Antigravity, klucz Claude'a). Treść plików (`CodeContent`…) nigdy.
const KEYS: [(&str, &str); 9] = [("CommandLine", "command"), ("command", "command"), ("AbsolutePath", "file_path"),
    ("TargetFile", "file_path"), ("file_path", "file_path"), ("Query", "pattern"), ("Pattern", "pattern"), ("SearchPath", "pattern"), ("Url", "url")];

fn claude_name(tool: Tool) -> Option<&'static str> {
    Some(match tool {
        Tool::Bash => "Bash", Tool::Edit => "Edit", Tool::Read => "Read", Tool::Grep => "Grep", Tool::Web => "WebFetch", Tool::Agent => "Task",
        Tool::Mcp | Tool::Other => return None,
    })
}

pub fn events(env: &AgentEnvelope, lang: Lang) -> Vec<Event> {
    let p = &env.payload;
    let s = |k: &str| p.get(k).and_then(|v| v.as_str());
    let Some(conv) = s("conversationId").filter(|x| safe_id(x)) else { return vec![] };
    let call = p.get("toolCall");
    let tool = call.and_then(|c| c.get("name")).and_then(|v| v.as_str()).unwrap_or("");
    let failed = s("terminationReason") == Some("error") || s("error").is_some_and(|e| !e.trim().is_empty());
    let (kind, t) = match env.event.as_str() {
        "PreInvocation" => (Kind::Prompt, None),
        "PreToolUse" => (Kind::ToolStart, Some(from_antigravity(tool))),
        "PostToolUse" => (Kind::ToolEnd, None),
        "Stop" if failed => (Kind::Error, None),
        "Stop" if p.get("fullyIdle").and_then(|v| v.as_bool()) == Some(true) => (Kind::TurnEnd, None),
        // `Stop` bez `fullyIdle`: pracują jeszcze podagenci
        _ => return vec![],
    };
    let ts = Some(env.ts).filter(|t| *t > 0).unwrap_or_else(crate::time::now_ms);
    let mut e = Event::new(Source::Antigravity, format!("antigravity:{conv}"), kind, ts);
    e.tool = t;
    let d = &mut e.data;
    d.pid = env.ppid.filter(|p| *p > 0);
    d.cwd = p.get("workspacePaths").and_then(|w| w.get(0)).and_then(|v| v.as_str()).map(|c| clean_text(c, 260)).filter(|c| !c.is_empty());
    d.origin = Some(Origin::Cli);
    d.model = s("modelName").map(|m| clean_text(m, 64)).filter(|m| !m.is_empty());
    if let Some(h) = &env.host {
        d.app = Some(h.app);
        d.app_name = h.name.clone();
        d.host_pid = Some(h.pid);
    }
    if let Some(tl) = t {
        d.action = claude_name(tl).and_then(|n| action_from(n, call.and_then(|c| c.get("args")), &KEYS, lang));
    }
    vec![e]
}

/// Odpowiedź dla Antigravity: `Stop` wymaga decyzji; cokolwiek innego niż `continue` pozwala skończyć.
/// Nigdy nie zmieniamy decyzji o zgodzie, więc przy pozostałych zdarzeniach pusty obiekt.
pub fn reply(event: &str) -> &'static str { if event == "Stop" { r#"{"decision":"stop"}"# } else { "{}" } }

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::{json, Value};

    fn fixture() -> Vec<AgentEnvelope> {
        let p = concat!(env!("CARGO_MANIFEST_DIR"), "/tests/fixtures/antigravity/session.jsonl");
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
    fn a_recorded_conversation_walks_through_its_states() {
        let kinds: Vec<Kind> = fixture().iter().flat_map(|e| events(e, Lang::Pl)).map(|e| e.kind).collect();
        assert_eq!(kinds, vec![Kind::Prompt, Kind::ToolStart, Kind::ToolEnd, Kind::ToolStart, Kind::ToolEnd, Kind::Prompt, Kind::TurnEnd]);
    }

    #[test]
    fn every_event_names_the_conversation_process_folder_and_model() {
        for e in fixture().iter().flat_map(|e| events(e, Lang::Pl)) {
            assert_eq!((e.source, e.agent(), e.session_id.as_str()), (Source::Antigravity, Agent::Antigravity, "antigravity:d5f1"));
            assert_eq!((e.data.pid, e.data.cwd.as_deref(), e.data.origin), (Some(4242), Some("C:/work/app"), Some(Origin::Cli)));
            assert_eq!(e.data.model.as_deref(), Some("gemini-3.5-pro"));
        }
        let first = one(fixture()[0].clone());
        assert_eq!((first.data.app, first.data.host_pid), (Some(App::Antigravity), Some(900)));
    }

    #[test]
    fn tools_have_actions() {
        let f = fixture();
        let view = one(f[1].clone());
        assert_eq!((view.tool, view.data.action.as_deref()), (Some(Tool::Read), Some("Czyta main.ts")));
        let run = one(f[3].clone());
        assert_eq!((run.tool, run.data.action.as_deref()), (Some(Tool::Bash), Some("npm test")));
        let edit = one(env("PreToolUse", json!({"conversationId": "c", "toolCall": {"name": "replace_file_content", "args": {"TargetFile": "C:/a/lib.rs"}}})));
        assert_eq!((edit.tool, edit.data.action.as_deref()), (Some(Tool::Edit), Some("Edytuje lib.rs")));
    }

    #[test]
    fn a_stop_with_an_error_is_an_error() {
        assert_eq!(one(env("Stop", json!({"conversationId": "c", "terminationReason": "error", "fullyIdle": true}))).kind, Kind::Error);
        assert_eq!(one(env("Stop", json!({"conversationId": "c", "error": "boom", "fullyIdle": false}))).kind, Kind::Error);
        assert!(events(&env("Stop", json!({"conversationId": "c", "error": "", "fullyIdle": false})), Lang::Pl).is_empty());
        assert!(events(&env("Stop", json!({"conversationId": "c"})), Lang::Pl).is_empty(), "bez fullyIdle agent jeszcze pracuje");
    }

    #[test]
    fn unsafe_ids_and_unknown_events_bring_nothing() {
        for p in [json!({"conversationId": "a/b"}), json!({"conversationId": "../x"}), json!({})] {
            assert!(events(&env("PreInvocation", p.clone()), Lang::Pl).is_empty(), "{p}");
        }
        assert!(events(&env("SessionStart", json!({"conversationId": "c"})), Lang::Pl).is_empty());
    }

    #[test]
    fn file_contents_and_paths_to_transcripts_never_reach_events() {
        let leaks = [
            env("PreToolUse", json!({"conversationId": "c", "toolCall": {"name": "write_to_file", "args": {"TargetFile": "x.rs", "CodeContent": "SEKRET-123"}},
                "transcriptPath": "C:/SEKRET-123/t", "artifactDirectoryPath": "C:/SEKRET-123/a"})),
            env("PostToolUse", json!({"conversationId": "c", "toolCall": {"name": "run_command", "args": {"CommandLine": "x"}}, "output": "SEKRET-123"})),
        ];
        for e in leaks {
            let v = events(&e, Lang::Pl);
            assert!(!v.is_empty());
            assert!(!format!("{v:?}").contains("SEKRET"), "{v:?}");
        }
    }

    #[test]
    fn antigravity_tool_names() {
        use crate::tools::from_antigravity;
        for (n, t) in [("run_command", Tool::Bash), ("view_file", Tool::Read), ("view_file_outline", Tool::Read), ("view_code_item", Tool::Read),
                       ("list_dir", Tool::Read), ("write_to_file", Tool::Edit), ("replace_file_content", Tool::Edit),
                       ("multi_replace_file_content", Tool::Edit), ("grep_search", Tool::Grep), ("find_by_name", Tool::Grep),
                       ("codebase_search", Tool::Grep), ("read_url_content", Tool::Web), ("search_web", Tool::Web), ("browser_click", Tool::Web),
                       ("invoke_subagent", Tool::Agent), ("mcp_github_list", Tool::Mcp), ("task_boundary", Tool::Other), ("", Tool::Other)] {
            assert_eq!(from_antigravity(n), t, "{n}");
        }
    }

    #[test]
    fn only_stop_gets_a_decision_and_it_never_continues() {
        assert_eq!(reply("Stop"), r#"{"decision":"stop"}"#);
        for e in ["PreInvocation", "PostInvocation", "PreToolUse", "PostToolUse", ""] { assert_eq!(reply(e), "{}", "{e}"); }
        assert!(!reply("Stop").contains("continue"));
    }
}
