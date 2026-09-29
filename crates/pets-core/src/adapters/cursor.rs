//! Cursor: hooki z `~/.cursor/hooks.json` przez `hook.exe --agent cursor --event <nazwa>` na `/v1/events/cursor`
//! (spec 0.12 §3). Czytamy tylko id, folder (`cwd`), model, nazwę narzędzia i jego argumenty z białej listy.
use super::{action_from, clean_text, safe_id, AgentEnvelope};
use crate::i18n::Lang;
use crate::model::*;
use crate::tools::from_cursor;

/// Argumenty narzędzi do tekstu akcji: (klucz Cursora, klucz Claude'a). Treść plików i diffy nigdy.
const KEYS: [(&str, &str); 6] = [("command", "command"), ("file_path", "file_path"), ("path", "file_path"), ("pattern", "pattern"),
    ("url", "url"), ("query", "pattern")];

/// Folder sesji z `workspace_roots[0]`, gdy `cwd` brak albo jest puste: Cursor 3.22 go nie wysyła, a korzenie
/// podaje jako `/C:/…` (sprawdzone na żywo). Wołane w hook.exe przed `slim`, który korzenie usuwa.
pub fn fill_cwd(payload: &mut serde_json::Value) {
    let Some(o) = payload.as_object_mut() else { return };
    if o.get("cwd").and_then(|v| v.as_str()).is_some_and(|s| !s.is_empty()) { return; }
    let Some(root) = o.get("workspace_roots").and_then(|r| r.get(0)).and_then(|v| v.as_str()) else { return };
    let b = root.as_bytes();
    let root = if b.len() >= 3 && b[0] == b'/' && b[1].is_ascii_alphabetic() && b[2] == b':' { &root[1..] } else { root };
    if root.is_empty() { return; }
    let root = serde_json::Value::String(root.to_string());
    o.insert("cwd".into(), root);
}

/// Narzędzie Claude'a o tym samym tekście akcji.
fn claude_name(tool: Tool) -> Option<&'static str> {
    Some(match tool {
        Tool::Bash => "Bash", Tool::Read => "Read", Tool::Edit => "Edit", Tool::Grep => "Grep", Tool::Agent => "Task",
        Tool::Web | Tool::Mcp | Tool::Other => return None,
    })
}

pub fn events(env: &AgentEnvelope, lang: Lang) -> Vec<Event> {
    let p = &env.payload;
    let s = |k: &str| p.get(k).and_then(|v| v.as_str());
    let text = |k: &str, max: usize| s(k).map(|x| clean_text(x, max)).filter(|x| !x.is_empty());
    // `draft-…`: szkic nowego czatu, który nigdy nie dostaje dalszych zdarzeń (sprawdzone na żywo)
    let Some(sid) = s("conversation_id").or_else(|| s("session_id")).filter(|x| safe_id(x) && !x.starts_with("draft-"))
        else { return vec![] };
    let top = format!("cursor:{sid}");
    let (kind, id, t) = match env.event.as_str() {
        "sessionStart" => (Kind::SessionStart, top.clone(), None),
        "beforeSubmitPrompt" => (Kind::Prompt, top.clone(), None),
        "preToolUse" => (Kind::ToolStart, top.clone(), Some(from_cursor(s("tool_name").unwrap_or("")))),
        "postToolUse" => (Kind::ToolEnd, top.clone(), None),
        "postToolUseFailure" if p.get("is_interrupt").and_then(|v| v.as_bool()) == Some(true) => (Kind::TurnEnd, top.clone(), None),
        "postToolUseFailure" => (Kind::ToolEnd, top.clone(), None),
        "stop" if s("status") == Some("error") => (Kind::Error, top.clone(), None),
        // `completed`, `aborted` (przerwana tura) i brak statusu: tura skończona
        "stop" => (Kind::TurnEnd, top.clone(), None),
        "preCompact" => (Kind::Compact, top.clone(), None),
        "sessionEnd" => (Kind::SessionEnd, top.clone(), None),
        "subagentStart" | "subagentStop" => {
            let Some(kid) = s("subagent_id").filter(|x| safe_id(x)) else { return vec![] };
            let kind = if env.event == "subagentStart" { Kind::Prompt } else { Kind::SessionEnd };
            (kind, format!("cursor:{kid}"), None)
        }
        _ => return vec![],
    };
    let ts = Some(env.ts).filter(|t| *t > 0).unwrap_or_else(crate::time::now_ms);
    let mut e = Event::new(Source::Cursor, id.clone(), kind, ts);
    e.tool = t;
    let d = &mut e.data;
    d.pid = env.ppid.filter(|p| *p > 0);
    d.cwd = text("cwd", 260);
    d.origin = Some(Origin::Cli);
    d.model = text("model", 64);
    if let Some(h) = &env.host {
        d.app = Some(h.app);
        d.app_name = h.name.clone();
        d.host_pid = Some(h.pid);
    }
    if id != top {
        let parent = s("parent_conversation_id").filter(|x| safe_id(x)).map(|x| format!("cursor:{x}"));
        d.parent = Some(parent.unwrap_or(top));
        d.sub = Some(SubInfo { kind: SubKind::Cursor, agent_type: text("subagent_type", 40), description: text("subagent_type", 80),
            background: false });
    }
    if let (Kind::ToolStart, Some(tl)) = (kind, t) {
        d.action = claude_name(tl).and_then(|n| action_from(n, p.get("tool_input"), &KEYS, lang));
    }
    vec![e]
}

/// Odpowiedź dla Cursora na wyjściu hooka: `beforeSubmitPrompt` musi przepuścić prompt, reszta nic nie zmienia.
pub fn reply(event: &str) -> &'static str { if event == "beforeSubmitPrompt" { r#"{"continue":true}"# } else { "{}" } }

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::{json, Value};

    fn fixture() -> Vec<AgentEnvelope> {
        let p = concat!(env!("CARGO_MANIFEST_DIR"), "/tests/fixtures/cursor/session.jsonl");
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
        let top = "cursor:conv_1".to_string();
        let kid = "cursor:sub_1".to_string();
        assert_eq!(kinds, vec![(Kind::SessionStart, top.clone()), (Kind::Prompt, top.clone()), (Kind::ToolStart, top.clone()),
            (Kind::ToolEnd, top.clone()), (Kind::ToolStart, top.clone()), (Kind::ToolEnd, top.clone()), (Kind::Prompt, kid.clone()),
            (Kind::SessionEnd, kid), (Kind::Compact, top.clone()), (Kind::TurnEnd, top.clone()), (Kind::Error, top.clone()),
            (Kind::SessionEnd, top)]);
    }

    #[test]
    fn every_event_names_the_agent_process_folder_and_model() {
        let v: Vec<Event> = fixture().iter().flat_map(|e| events(e, Lang::Pl)).collect();
        for e in v.iter().filter(|e| e.session_id == "cursor:conv_1") {
            assert_eq!((e.agent(), e.data.pid, e.data.cwd.as_deref(), e.data.model.as_deref(), e.data.origin),
                (Agent::Cursor, Some(4242), Some("C:/work/app"), Some("claude-4.5-sonnet"), Some(Origin::Cli)), "{e:?}");
        }
        assert_eq!((v[0].data.app, v[0].data.host_pid), (Some(App::Cursor), Some(900)));
        assert_eq!(v[2].data.app, None, "program tylko z koperty");
    }

    #[test]
    fn the_session_id_comes_from_conversation_or_session_and_must_be_safe() {
        assert_eq!(one(env("stop", json!({"session_id": "s_9"}))).session_id, "cursor:s_9");
        assert_eq!(one(env("stop", json!({"conversation_id": "c_1", "session_id": "s_9"}))).session_id, "cursor:c_1");
        for bad in [json!({"conversation_id": "../x"}), json!({}), json!({"conversation_id": 5})] {
            assert!(events(&env("stop", bad.clone()), Lang::Pl).is_empty(), "{bad}");
        }
        assert!(events(&env("afterAgentThought", json!({"conversation_id": "c_1"})), Lang::Pl).is_empty());
    }

    #[test]
    fn interrupted_aborted_and_failed_turns() {
        let c = |extra: Value| { let mut p = json!({"conversation_id": "c_1"}); p.as_object_mut().unwrap().extend(extra.as_object().unwrap().clone()); p };
        assert_eq!(one(env("postToolUseFailure", c(json!({"is_interrupt": true})))).kind, Kind::TurnEnd);
        assert_eq!(one(env("postToolUseFailure", c(json!({})))).kind, Kind::ToolEnd);
        assert_eq!(one(env("stop", c(json!({"status": "aborted"})))).kind, Kind::TurnEnd);
        assert_eq!(one(env("stop", c(json!({"status": "error"})))).kind, Kind::Error);
        assert_eq!(one(env("stop", c(json!({})))).kind, Kind::TurnEnd);
    }

    #[test]
    fn a_subagent_is_a_child_of_its_conversation() {
        let e = one(env("subagentStart", json!({"conversation_id": "c_1", "subagent_id": "sub_1", "subagent_type": "explore",
            "parent_conversation_id": "c_0"})));
        assert_eq!((e.session_id.as_str(), e.data.parent.as_deref(), e.kind), ("cursor:sub_1", Some("cursor:c_0"), Kind::Prompt));
        let sub = e.data.sub.unwrap();
        assert_eq!((sub.kind, sub.agent_type.as_deref(), sub.description.as_deref(), sub.background),
            (SubKind::Cursor, Some("explore"), Some("explore"), false));
        let no_parent = one(env("subagentStop", json!({"conversation_id": "c_1", "subagent_id": "sub_1"})));
        assert_eq!((no_parent.data.parent.as_deref(), no_parent.kind), (Some("cursor:c_1"), Kind::SessionEnd));
        assert!(events(&env("subagentStart", json!({"conversation_id": "c_1", "subagent_id": "a/b"})), Lang::Pl).is_empty());
        assert!(events(&env("subagentStart", json!({"conversation_id": "c_1"})), Lang::Pl).is_empty());
    }

    #[test]
    fn tools_and_their_actions() {
        let e = one(env("preToolUse", json!({"conversation_id": "c_1", "tool_name": "Shell", "tool_input": {"command": "npm test"}})));
        assert_eq!((e.tool, e.data.action.as_deref()), (Some(Tool::Bash), Some("npm test")));
        let r = one(env("preToolUse", json!({"conversation_id": "c_1", "tool_name": "Read", "tool_input": {"path": "C:/w/a.ts"}})));
        assert_eq!(r.tool, Some(Tool::Read));
        assert!(r.data.action.as_deref().unwrap_or("").contains("a.ts"), "{r:?}");
        let m = one(env("preToolUse", json!({"conversation_id": "c_1", "tool_name": "MCP:github", "tool_input": {"command": "x"}})));
        assert_eq!((m.tool, m.data.action), (Some(Tool::Mcp), None));
    }

    #[test]
    fn prompts_mail_attachments_and_file_contents_never_reach_an_event() {
        let secret = "SEKRET-123";
        for ev in ["sessionStart", "beforeSubmitPrompt", "preToolUse", "postToolUse", "stop", "subagentStart"] {
            let p = json!({"conversation_id": "c_1", "prompt": secret, "user_email": secret, "attachments": [{"file_path": secret}],
                "tool_output": secret, "tool_name": "Write", "tool_input": {"file_path": "C:/w/a.ts", "content": secret},
                "subagent_id": "sub_1", "subagent_type": "explore"});
            for e in events(&env(ev, p), Lang::Pl) { assert!(!format!("{e:?}").contains("SEKRET"), "{ev}: {e:?}"); }
        }
    }

    /// Nagranie z Cursora 3.22 (zanonimizowane): przerwana tura z Shell, szkic nowego czatu, druga tura z narzędziami
    /// równolegle, przerwana, po której przychodzą spóźnione `postToolUseFailure`. Koperty idą tą samą drogą co w hook.exe.
    #[test]
    fn a_live_cursor_recording_leaves_two_finished_pets_with_their_folder() {
        let p = concat!(env!("CARGO_MANIFEST_DIR"), "/tests/fixtures/cursor/live-3.22.jsonl");
        let mut store = crate::store::Store::new(crate::store::Timing::default());
        let (mut last, mut tools) = (0, vec![]);
        for l in std::fs::read_to_string(p).unwrap().lines() {
            let mut e: AgentEnvelope = serde_json::from_str(l).unwrap();
            fill_cwd(&mut e.payload);
            super::super::slim(&mut e.payload);
            for ev in events(&e, Lang::Pl) {
                if ev.kind == Kind::ToolStart { tools.push(ev.tool); }
                store.apply(&ev);
            }
            last = e.ts;
        }
        store.tick(last + 1000, &|_| true);
        let mut ids: Vec<&str> = store.sessions().iter().map(|s| s.id.as_str()).collect();
        ids.sort();
        assert_eq!(ids, ["cursor:conv_live_1", "cursor:conv_live_2"]);
        for id in ids { assert_eq!(store.session(id).unwrap().state, State::Done, "{id}"); }
        assert_eq!(store.session("cursor:conv_live_2").unwrap().cwd, "C:/w/app");
        for t in [Tool::Bash, Tool::Grep, Tool::Read] { assert!(tools.contains(&Some(t)), "{t:?}"); }
    }

    /// nowy czat zaczyna się od `sessionStart` z id `draft-…`, a prompt idzie już pod prawdziwym id (sprawdzone na żywo)
    #[test]
    fn a_draft_conversation_makes_no_pet() {
        for ev in ["sessionStart", "beforeSubmitPrompt", "stop"] {
            let p = json!({"conversation_id": "draft-f9a1", "session_id": "draft-f9a1"});
            assert!(events(&env(ev, p), Lang::Pl).is_empty(), "{ev}");
        }
        assert!(!events(&env("sessionStart", json!({"conversation_id": "bb89"})), Lang::Pl).is_empty());
    }

    #[test]
    fn the_folder_comes_from_the_first_workspace_root_when_cwd_is_empty() {
        // sprawdzone na żywo (Cursor 3.22): `cwd` brak albo puste, korzenie jako `/C:/…`
        let mut p = json!({"workspace_roots": ["/C:/w/app", "/D:/b"]});
        fill_cwd(&mut p);
        assert_eq!(p["cwd"], "C:/w/app");
        let mut empty = json!({"cwd": "", "workspace_roots": ["/home/u/app"]});
        fill_cwd(&mut empty);
        assert_eq!(empty["cwd"], "/home/u/app");
        let mut own = json!({"cwd": "C:/own", "workspace_roots": ["/C:/w/app"]});
        fill_cwd(&mut own);
        assert_eq!(own["cwd"], "C:/own");
        let mut none = json!({"workspace_roots": []});
        fill_cwd(&mut none);
        assert!(none.get("cwd").is_none());
        let mut arr = json!([1]);
        fill_cwd(&mut arr);
        assert_eq!(arr, json!([1]));
    }

    #[test]
    fn cursor_always_gets_an_answer_that_lets_it_go_on() {
        assert_eq!(reply("beforeSubmitPrompt"), r#"{"continue":true}"#);
        for e in ["sessionStart", "preToolUse", "postToolUse", "stop", "afterAgentResponse", ""] { assert_eq!(reply(e), "{}", "{e}"); }
    }
}
