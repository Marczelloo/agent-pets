//! GitHub Copilot: hooks from `~/.copilot/hooks/agent-pets.json` via `hook.exe --agent copilot --event <name>`
//! to `/v1/events/copilot` (spec 0.11 §3.1–3.2). VS Code events use PascalCase with snake_case fields,
//! CLI-only events use camelCase with camelCase fields; the adapter reads both.
use super::{action_from, clean_text, safe_id, AgentEnvelope};
use crate::i18n::Lang;
use crate::model::*;
use crate::tools::from_copilot;

/// Tool arguments for action text: (Copilot key, Claude key). Never file contents or diffs.
const KEYS: [(&str, &str); 8] = [("command", "command"), ("path", "file_path"), ("file_path", "file_path"), ("filePath", "file_path"),
    ("pattern", "pattern"), ("query", "pattern"), ("url", "url"), ("description", "description")];

/// Claude tool with the same action text.
fn claude_name(tool: Tool) -> Option<&'static str> {
    Some(match tool {
        Tool::Bash => "Bash", Tool::Edit => "Edit", Tool::Read => "Read", Tool::Grep => "Grep", Tool::Web => "WebFetch", Tool::Agent => "Task",
        Tool::Mcp | Tool::Other => return None,
    })
}

pub fn events(env: &AgentEnvelope, lang: Lang) -> Vec<Event> {
    let p = &env.payload;
    // same meaning in two forms: PascalCase (snake_case) and camelCase
    let get = |a: &str, b: &str| p.get(a).filter(|v| !v.is_null()).or_else(|| p.get(b)).filter(|v| !v.is_null());
    let s = |a: &str, b: &str| get(a, b).and_then(|v| v.as_str());
    let text = |a: &str, b: &str, max: usize| s(a, b).map(|x| clean_text(x, max)).filter(|x| !x.is_empty());
    let Some(sid) = s("session_id", "sessionId").filter(|x| safe_id(x)) else { return vec![] };
    let top = format!("copilot:{sid}");
    let tool = s("tool_name", "toolName").unwrap_or("");
    let (kind, id, t) = match env.event.as_str() {
        "SessionStart" => (Kind::SessionStart, top.clone(), None),
        "UserPromptSubmit" => (Kind::Prompt, top.clone(), None),
        "PreToolUse" => (Kind::ToolStart, top.clone(), Some(from_copilot(tool))),
        "PostToolUse" | "postToolUseFailure" => (Kind::ToolEnd, top.clone(), None),
        "notification" => match s("notification_type", "notificationType").unwrap_or("") {
            // Copilot sends `permission_prompt` for every tool, including auto-approved ones, so it does not mean "waiting"
            "elicitation_dialog" => (Kind::NeedsInput, top.clone(), None),
            _ => return vec![],
        },
        "Stop" => (Kind::TurnEnd, top.clone(), None),
        "errorOccurred" if get("recoverable", "recoverable").and_then(|v| v.as_bool()) != Some(true) => (Kind::Error, top.clone(), None),
        // JetBrains ends every turn this way (after `Stop`, or without it if interrupted) while the conversation continues;
        // the pet remains "ready" and disappears with the Copilot process or after the usual quiet period
        "sessionEnd" if s("reason", "reason") == Some("complete") => (Kind::TurnEnd, top.clone(), None),
        "sessionEnd" => (Kind::SessionEnd, top.clone(), None),
        // subagents: one mini pet per name (the start hook provides no ID)
        "SubagentStart" | "SubagentStop" => {
            let name = s("agent_name", "agentName").filter(|n| safe_id(n)).unwrap_or("sub");
            let kind = if env.event == "SubagentStart" { Kind::Prompt } else { Kind::SessionEnd };
            (kind, format!("{top}:{name}"), None)
        }
        _ => return vec![],
    };
    let ts = Some(env.ts).filter(|t| *t > 0).unwrap_or_else(crate::time::now_ms);
    let mut e = Event::new(Source::Copilot, id.clone(), kind, ts);
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
    if id != top {
        d.parent = Some(top);
        d.sub = Some(SubInfo { kind: SubKind::Copilot, agent_type: s("agent_name", "agentName").map(|n| clean_text(n, 40)),
            description: text("agent_display_name", "agentDisplayName", 80), background: false });
    }
    match (kind, t) {
        (Kind::ToolStart, Some(tl)) => d.action = claude_name(tl).and_then(|n| action_from(n, get("tool_input", "toolArgs"), &KEYS, lang)),
        (Kind::NeedsInput, _) => d.question = text("message", "message", 300).or_else(|| text("title", "title", 300)),
        _ => {}
    }
    vec![e]
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::{json, Value};

    fn fixture() -> Vec<AgentEnvelope> {
        let p = concat!(env!("CARGO_MANIFEST_DIR"), "/tests/fixtures/copilot/session.jsonl");
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
        let kinds: Vec<(Kind, String)> = fixture().iter().flat_map(|e| events(e, Lang::Pl)).map(|e| (e.kind, e.session_id)).collect();
        let top = "copilot:cop_1".to_string();
        let kid = "copilot:cop_1:explore".to_string();
        assert_eq!(kinds, vec![(Kind::SessionStart, top.clone()), (Kind::Prompt, top.clone()), (Kind::ToolStart, top.clone()),
            (Kind::ToolEnd, top.clone()), (Kind::NeedsInput, top.clone()), (Kind::ToolStart, top.clone()), (Kind::ToolEnd, top.clone()),
            (Kind::Prompt, kid.clone()), (Kind::SessionEnd, kid), (Kind::TurnEnd, top.clone()), (Kind::Error, top.clone()),
            (Kind::SessionEnd, top)]);
    }

    /// CLion capture (Copilot 1.6): each turn has `Stop` followed immediately by `sessionEnd` with `reason: complete`,
    /// although the IDE conversation continues. The pet remains "ready".
    #[test]
    fn a_jetbrains_turn_ends_done_and_the_pet_stays() {
        let p = concat!(env!("CARGO_MANIFEST_DIR"), "/tests/fixtures/copilot/live-jetbrains.jsonl");
        let live: Vec<AgentEnvelope> = std::fs::read_to_string(p).unwrap().lines().map(|l| serde_json::from_str(l).unwrap()).collect();
        let v: Vec<Event> = live.iter().flat_map(|e| events(e, Lang::Pl)).collect();
        assert_eq!(v.last().map(|e| e.kind), Some(Kind::TurnEnd));
        assert!(!v.iter().any(|e| e.kind == Kind::SessionEnd));
        // `permission_prompt` arrives for every tool, including auto-approved ones (git status ran 1 s later),
        // so it does not mean Copilot is waiting for a person
        assert!(!v.iter().any(|e| e.kind == Kind::NeedsInput));
        assert!(v.iter().all(|e| e.session_id == "copilot:cop_live" && e.data.pid == Some(4242)));
        // patch text (`apply_patch`) does not enter the action
        assert!(v.iter().all(|e| !e.data.action.as_deref().unwrap_or("").contains("Begin Patch")));
    }

    #[test]
    fn only_a_real_exit_ends_the_session() {
        for (reason, ends) in [("complete", false), ("user_exit", true), ("abort", true), ("error", true)] {
            let v = events(&env("sessionEnd", json!({"sessionId": "s1", "reason": reason})), Lang::Pl);
            assert_eq!(v.iter().any(|e| e.kind == Kind::SessionEnd), ends, "{reason}");
        }
    }

    #[test]
    fn every_event_names_the_agent_process_and_folder() {
        for e in fixture().iter().flat_map(|e| events(e, Lang::Pl)) {
            assert_eq!((e.source, e.agent()), (Source::Copilot, Agent::Copilot));
            assert_eq!((e.data.pid, e.data.cwd.as_deref(), e.data.origin), (Some(4242), Some("C:/work/app"), Some(Origin::Cli)));
            assert!((1_790_000_000_000..1_790_000_002_000).contains(&e.ts), "time from envelope");
        }
    }

    #[test]
    fn the_program_comes_from_the_envelope() {
        let f = fixture();
        let s = one(f[0].clone());
        assert_eq!((s.data.app, s.data.host_pid), (Some(App::Jetbrains), Some(900)));
        assert_eq!(one(f[2].clone()).data.app, None, "missing host in envelope overwrites nothing");
    }

    /// JetBrains uses Claude-style tool names (`Bash`, `Edit`, `Read`, `Glob`): editing is editing, not "another tool".
    #[test]
    fn jetbrains_tool_names_pick_the_right_tool() {
        let p = concat!(env!("CARGO_MANIFEST_DIR"), "/tests/fixtures/copilot/live-jetbrains.jsonl");
        let live: Vec<AgentEnvelope> = std::fs::read_to_string(p).unwrap().lines().map(|l| serde_json::from_str(l).unwrap()).collect();
        let tools: Vec<Option<Tool>> = live.iter().flat_map(|e| events(e, Lang::Pl)).filter(|e| e.kind == Kind::ToolStart).map(|e| e.tool).collect();
        assert_eq!(&tools[..3], &[Some(Tool::Bash), Some(Tool::Edit), Some(Tool::Bash)]);
        for (name, tool) in [("Read", Tool::Read), ("Glob", Tool::Grep), ("Edit", Tool::Edit)] {
            assert_eq!(one(env("PreToolUse", json!({"session_id": "s", "tool_name": name, "tool_input": {}}))).tool, Some(tool), "{name}");
        }
        let bash = one(live[2].clone());
        assert_eq!(bash.data.action.as_deref(), Some("git status --short"));
    }

    /// An interrupted turn has no `Stop`: JetBrains sends only `sessionEnd` with `complete`. The pet then ends its animation.
    #[test]
    fn an_interrupted_jetbrains_turn_ends_done() {
        let v: Vec<Event> = [env("PreToolUse", json!({"session_id": "s", "tool_name": "Bash", "tool_input": {"command": "sleep 65"}})),
            env("sessionEnd", json!({"sessionId": "s", "reason": "complete"}))].iter().flat_map(|e| events(e, Lang::Pl)).collect();
        assert_eq!(v.iter().map(|e| e.kind).collect::<Vec<_>>(), vec![Kind::ToolStart, Kind::TurnEnd]);
    }

    #[test]
    fn tools_questions_and_children() {
        let f = fixture();
        let edit = one(f[2].clone());
        assert_eq!((edit.tool, edit.data.action.as_deref()), (Some(Tool::Edit), Some("Edytuje main.ts")));
        let bash = one(f[5].clone());
        assert_eq!((bash.tool, bash.data.action.as_deref()), (Some(Tool::Bash), Some("npm test")));
        assert_eq!(one(f[4].clone()).data.question.as_deref(), Some("Run npm test or npm run e2e?"));
        let kid = one(f[7].clone());
        assert_eq!(kid.data.parent.as_deref(), Some("copilot:cop_1"));
        let sub = kid.data.sub.expect("child");
        assert_eq!((sub.kind, sub.agent_type.as_deref(), sub.description.as_deref()),
            (SubKind::Copilot, Some("explore"), Some("Explore the codebase")));
        let long = one(env("notification", json!({"sessionId": "s", "notification_type": "elicitation_dialog", "message": "q".repeat(400)})));
        assert_eq!((long.kind, long.data.question.map(|q| q.chars().count())), (Kind::NeedsInput, Some(300)));
        let titled = one(env("notification", json!({"sessionId": "s", "notification_type": "elicitation_dialog", "title": "Allow?"})));
        assert_eq!(titled.data.question.as_deref(), Some("Allow?"));
    }

    #[test]
    fn quiet_notifications_and_recoverable_errors_change_nothing() {
        for t in ["agent_idle", "agent_completed", "shell_completed", "permission_prompt", ""] {
            assert!(events(&env("notification", json!({"sessionId": "s", "notification_type": t})), Lang::Pl).is_empty(), "{t}");
        }
        assert!(events(&env("errorOccurred", json!({"sessionId": "s", "recoverable": true})), Lang::Pl).is_empty());
        assert_eq!(one(env("errorOccurred", json!({"sessionId": "s"}))).kind, Kind::Error);
        assert!(events(&env("preCompact", json!({"sessionId": "s"})), Lang::Pl).is_empty());
    }

    #[test]
    fn both_field_spellings_mean_the_same() {
        let snake = one(env("PreToolUse", json!({"session_id": "s", "tool_name": "view", "tool_input": {"path": "a/b.rs"}})));
        let camel = one(env("PreToolUse", json!({"sessionId": "s", "toolName": "view", "toolArgs": {"path": "a/b.rs"}})));
        assert_eq!((snake.session_id.as_str(), snake.tool, snake.data.action.as_deref()), ("copilot:s", Some(Tool::Read), Some("Czyta b.rs")));
        assert_eq!((camel.session_id, camel.tool, camel.data.action), (snake.session_id, snake.tool, snake.data.action));
    }

    #[test]
    fn unsafe_or_missing_ids_bring_nothing() {
        for p in [json!({"sessionId": "../x"}), json!({"session_id": "a/b"}), json!({})] {
            assert!(events(&env("UserPromptSubmit", p.clone()), Lang::Pl).is_empty(), "{p}");
        }
        let bad_kid = one(env("SubagentStart", json!({"sessionId": "s", "agentName": "../x"})));
        assert_eq!(bad_kid.session_id, "copilot:s:sub");
    }

    #[test]
    fn a_model_in_the_payload_is_shown() {
        assert_eq!(one(env("UserPromptSubmit", json!({"sessionId": "s", "model": "gpt-6-sol"}))).data.model.as_deref(), Some("gpt-6-sol"));
        assert_eq!(one(env("UserPromptSubmit", json!({"sessionId": "s"}))).data.model, None);
    }

    #[test]
    fn prompts_results_and_file_contents_never_reach_events() {
        let leaks = [
            env("UserPromptSubmit", json!({"sessionId": "s", "prompt": "SEKRET-123"})),
            env("PostToolUse", json!({"sessionId": "s", "toolName": "bash", "toolResult": {"textResultForLlm": "SEKRET-123"}})),
            env("PreToolUse", json!({"sessionId": "s", "toolName": "create", "toolArgs": {"path": "x.rs", "content": "SEKRET-123"}})),
            env("SubagentStop", json!({"sessionId": "s", "agentName": "e", "response": "SEKRET-123", "last_assistant_message": "SEKRET-123"})),
            env("Stop", json!({"sessionId": "s", "transcriptPath": "C:/SEKRET-123/t.jsonl"})),
        ];
        for e in leaks {
            let v = events(&e, Lang::Pl);
            assert!(!v.is_empty(), "{e:?}");
            assert!(!format!("{v:?}").contains("SEKRET"), "{v:?}");
        }
    }

    #[test]
    fn copilot_tool_names() {
        use crate::tools::from_copilot;
        for (n, t) in [("bash", Tool::Bash), ("powershell", Tool::Bash), ("run_in_terminal", Tool::Bash), ("shell", Tool::Bash),
                       ("edit", Tool::Edit), ("create", Tool::Edit), ("str_replace", Tool::Edit), ("write", Tool::Edit),
                       ("replace_string_in_file", Tool::Edit), ("create_file", Tool::Edit), ("insert_edit_into_file", Tool::Edit),
                       ("view", Tool::Read), ("read", Tool::Read), ("read_file", Tool::Read),
                       ("grep", Tool::Grep), ("glob", Tool::Grep), ("grep_search", Tool::Grep), ("file_search", Tool::Grep), ("list_dir", Tool::Grep),
                       ("web_fetch", Tool::Web), ("fetch_webpage", Tool::Web), ("web_search", Tool::Web),
                       ("task", Tool::Agent), ("runSubagent", Tool::Agent),
                       ("github/create_issue", Tool::Mcp), ("mcp_github_create_issue", Tool::Mcp), ("report_intent", Tool::Other), ("", Tool::Other)] {
            assert_eq!(from_copilot(n), t, "{n}");
        }
    }
}
