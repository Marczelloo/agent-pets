//! Antigravity: hooks from `~/.gemini/config/hooks.json` via `hook.exe --agent antigravity --event <name>`
//! to `/v1/events/antigravity` (spec 0.11 §3.3–3.4). Hooks have no session start, prompt, or permission request:
//! the pet thinks, works, finishes, and reports errors, but never shows "waiting for you".
use super::{action_from, clean_text, safe_id, AgentEnvelope};
use crate::i18n::Lang;
use crate::model::*;
use crate::tools::from_antigravity;

/// Tool arguments for action text: (Antigravity key, Claude key). Never file contents (`CodeContent`…).
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
    let canceled = s("terminationReason").is_some_and(|r| r.to_ascii_lowercase().contains("cancel"));
    let (kind, t) = match env.event.as_str() {
        "PreInvocation" => (Kind::Prompt, None),
        // Do not register `PreToolUse` (permission gate, spec 0.12.1); retain it for older entries on startup
        "PreToolUse" => (Kind::ToolStart, Some(from_antigravity(tool))),
        // the tool has finished, but show it as work with action text: the model then calls `PreInvocation`
        // (thinking) or another tool. A start and end together would show nothing (the end clears the pending start).
        "PostToolUse" => (Kind::ToolStart, Some(from_antigravity(tool))),
        "Stop" if failed => (Kind::Error, None),
        // user interruption ends the turn even without `fullyIdle`
        "Stop" if canceled => (Kind::TurnEnd, None),
        "Stop" if p.get("fullyIdle").and_then(|v| v.as_bool()) == Some(true) => (Kind::TurnEnd, None),
        // `Stop` without `fullyIdle`: subagents are still working
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

/// Antigravity response: `Stop` requires a decision; anything other than `continue` lets it finish.
/// Never alter permission decisions, so return an empty object for other events.
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
        assert_eq!(kinds, vec![Kind::Prompt, Kind::ToolStart, Kind::ToolStart, Kind::Prompt, Kind::TurnEnd]);
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
        let run = one(f[2].clone());
        assert_eq!((run.tool, run.data.action.as_deref()), (Some(Tool::Bash), Some("npm test")));
        let edit = one(env("PreToolUse", json!({"conversationId": "c", "toolCall": {"name": "replace_file_content", "args": {"TargetFile": "C:/a/lib.rs"}}})));
        assert_eq!((edit.tool, edit.data.action.as_deref()), (Some(Tool::Edit), Some("Edytuje lib.rs")));
    }

    /// Without `PreToolUse` (Antigravity treats `{}` as denial and `ask` forces a prompt), the tool appears only after it ends:
    /// `PostToolUse` is work with action text until the model thinks again (`PreInvocation`) or ends the turn.
    #[test]
    fn a_finished_tool_shows_what_it_did() {
        let e = one(env("PostToolUse", json!({"conversationId": "c", "toolCall": {"name": "replace_file_content", "args": {"TargetFile": "C:/a/lib.rs"}}})));
        assert_eq!((e.kind, e.tool, e.data.action.as_deref()), (Kind::ToolStart, Some(Tool::Edit), Some("Edytuje lib.rs")));
    }

    /// A quick tool between model calls: the pet still works briefly (minimum state duration), then thinks.
    #[test]
    fn a_quick_tool_between_model_calls_still_shows_as_work() {
        use crate::store::{Store, Timing};
        let mut s = Store::new(Timing::default());
        let at = |ev: &str, ts: i64, p: Value| { let mut e = env(ev, p); e.ts = ts; events(&e, Lang::Pl) };
        let call = json!({"conversationId": "c", "toolCall": {"name": "view_file", "args": {"AbsolutePath": "C:/a/x.ts"}}});
        for (ev, ts, p) in [("PreInvocation", 1_000, json!({"conversationId": "c"})), ("PostToolUse", 2_000, call),
                            ("PreInvocation", 2_100, json!({"conversationId": "c"}))] {
            for e in at(ev, ts, p) { s.apply(&e); }
        }
        let x = s.session("antigravity:c").unwrap();
        assert_eq!((x.state, x.tool), (State::Working, Some(Tool::Read)));
        s.tick(2_700, &|_| true);
        assert_eq!(s.session("antigravity:c").unwrap().state, State::Thinking);
    }

    #[test]
    fn a_stop_with_an_error_is_an_error() {
        assert_eq!(one(env("Stop", json!({"conversationId": "c", "terminationReason": "error", "fullyIdle": true}))).kind, Kind::Error);
        assert_eq!(one(env("Stop", json!({"conversationId": "c", "error": "boom", "fullyIdle": false}))).kind, Kind::Error);
        assert!(events(&env("Stop", json!({"conversationId": "c", "error": "", "fullyIdle": false})), Lang::Pl).is_empty());
        assert!(events(&env("Stop", json!({"conversationId": "c"})), Lang::Pl).is_empty(), "without fullyIdle the agent is still working");
    }

    /// User cancellation (`TERMINATION_REASON_USER_CANCELED`) ends the turn even without `fullyIdle`.
    #[test]
    fn a_canceled_stop_ends_the_turn() {
        for r in ["user_canceled", "USER_CANCELED", "TERMINATION_REASON_USER_CANCELED"] {
            assert_eq!(one(env("Stop", json!({"conversationId": "c", "terminationReason": r, "fullyIdle": false}))).kind, Kind::TurnEnd, "{r}");
            assert_eq!(one(env("Stop", json!({"conversationId": "c", "terminationReason": r}))).kind, Kind::TurnEnd, "{r}");
        }
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
