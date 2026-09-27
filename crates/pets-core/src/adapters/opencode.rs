//! opencode: koperty z naszego pluginu (`assets/opencode-plugin.js`) na `/v1/events/opencode`.
//! Kontrakt (plan 0.10, task 5): `{v, ts, pid, event, session, cwd, status, tool, title, model, question, input}`.
//! `input` to biała lista pól do tekstu akcji; wszystko spoza kontraktu jest pomijane.
use super::{clean_text, safe_id};
use crate::action::action_text;
use crate::i18n::Lang;
use crate::model::*;
use crate::tools::from_opencode;
use serde_json::{Map, Value};

/// Pola `input`, z których składamy tekst akcji (jak u Claude'a: nazwa pliku, komenda, wzorzec, host).
const INPUT_KEYS: [&str; 6] = ["file_path", "command", "pattern", "url", "query", "description"];

/// Nazwa narzędzia Claude'a o tym samym tekście akcji.
fn claude_name(tool: &str) -> Option<&'static str> {
    Some(match tool {
        "edit" | "write" | "patch" | "multiedit" => "Edit",
        "bash" => "Bash",
        "read" => "Read",
        "grep" | "glob" => "Grep",
        "webfetch" => "WebFetch",
        "websearch" => "WebSearch",
        "task" => "Task",
        _ => return None,
    })
}

fn action(tool: &str, input: Option<&Value>, lang: Lang) -> Option<String> {
    let name = claude_name(tool)?;
    let src = input?.as_object()?;
    let only: Map<String, Value> = INPUT_KEYS.iter()
        .filter_map(|k| src.get(*k).and_then(|v| v.as_str()).map(|v| (k.to_string(), Value::String(v.chars().take(500).collect()))))
        .collect();
    action_text(name, &Value::Object(only), lang).map(|a| clean_text(&a, 80)).filter(|a| !a.is_empty())
}

pub fn events(env: &Value, lang: Lang) -> Vec<Event> {
    let s = |k: &str| env.get(k).and_then(|v| v.as_str());
    let Some(session) = s("session").filter(|x| safe_id(x)) else { return vec![] };
    let ts = env.get("ts").and_then(|v| v.as_i64()).filter(|t| *t > 0).unwrap_or_else(crate::time::now_ms);
    let text = |k: &str, max: usize| s(k).map(|x| clean_text(x, max)).filter(|x| !x.is_empty());
    let tool = s("tool").unwrap_or("");
    let (kind, t) = match s("event").unwrap_or("") {
        "session.created" => (Kind::SessionStart, None),
        "session.updated" | "chat.message" => (Kind::Meta, None),
        "session.status" => match s("status").unwrap_or("") {
            "busy" => (Kind::Prompt, None),
            "retry" => (Kind::Meta, None),
            "idle" => (Kind::TurnEnd, None),
            _ => return vec![],
        },
        "tool.before" => (Kind::ToolStart, Some(from_opencode(tool))),
        "tool.after" => (Kind::ToolEnd, None),
        "permission.asked" | "question.asked" => (Kind::NeedsInput, None),
        "permission.replied" | "question.replied" | "question.rejected" => (Kind::Prompt, None),
        "session.error" => (Kind::Error, None),
        "session.deleted" => (Kind::SessionEnd, None),
        _ => return vec![],
    };
    let mut e = Event::new(Source::Opencode, format!("opencode:{session}"), kind, ts);
    e.tool = t;
    let d = &mut e.data;
    d.pid = env.get("pid").and_then(|v| v.as_u64()).and_then(|p| u32::try_from(p).ok()).filter(|p| *p > 0);
    d.cwd = text("cwd", 260);
    d.origin = Some(Origin::Cli);
    match s("event").unwrap_or("") {
        "tool.before" => d.action = action(tool, env.get("input"), lang),
        "permission.asked" | "question.asked" => d.question = text("question", 300),
        "session.updated" => d.title = text("title", 80),
        // `providerID/modelID`: do wyświetlenia tylko model
        "chat.message" => d.model = s("model").and_then(|m| m.rsplit('/').next()).map(|m| clean_text(m, 64)).filter(|m| !m.is_empty()),
        _ => {}
    }
    vec![e]
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn fixture() -> Vec<Value> {
        let p = concat!(env!("CARGO_MANIFEST_DIR"), "/tests/fixtures/opencode/session.jsonl");
        std::fs::read_to_string(p).unwrap().lines().map(|l| serde_json::from_str(l).unwrap()).collect()
    }

    fn one(v: Value) -> Event {
        let e = events(&v, Lang::Pl);
        assert_eq!(e.len(), 1, "{v}");
        e.into_iter().next().unwrap()
    }

    #[test]
    fn a_recorded_session_walks_through_every_state() {
        let kinds: Vec<Kind> = fixture().iter().flat_map(|v| events(v, Lang::Pl)).map(|e| e.kind).collect();
        assert_eq!(kinds, vec![Kind::SessionStart, Kind::Meta, Kind::Prompt, Kind::ToolStart, Kind::ToolEnd, Kind::NeedsInput,
            Kind::Prompt, Kind::Meta, Kind::Meta, Kind::TurnEnd, Kind::NeedsInput, Kind::Prompt, Kind::Error, Kind::SessionEnd]);
    }

    #[test]
    fn every_event_names_the_session_process_and_folder() {
        for e in fixture().iter().flat_map(|v| events(v, Lang::Pl)) {
            assert_eq!((e.source, e.agent(), e.session_id.as_str()), (Source::Opencode, Agent::Opencode, "opencode:ses_3f2a"));
            assert_eq!((e.data.pid, e.data.cwd.as_deref(), e.data.origin), (Some(4242), Some("C:/work/app"), Some(Origin::Cli)));
            assert!((1_790_000_000_000..1_790_000_002_000).contains(&e.ts), "czas z koperty");
        }
    }

    #[test]
    fn tools_questions_titles_and_models() {
        let f = fixture();
        let t = one(f[3].clone());
        assert_eq!((t.tool, t.data.action.as_deref()), (Some(Tool::Edit), Some("Edytuje main.ts")));
        assert_eq!(one(f[5].clone()).data.question.as_deref(), Some("Run rm -rf dist?"));
        assert_eq!(one(f[10].clone()).data.question.as_deref(), Some("Which port?"));
        assert_eq!(one(f[7].clone()).data.title.as_deref(), Some("Fix the build"));
        assert_eq!(one(f[1].clone()).data.model.as_deref(), Some("gpt-6-sol"));
        let long = one(json!({"event": "permission.asked", "session": "s", "question": "q".repeat(400)}));
        assert_eq!(long.data.question.map(|q| q.chars().count()), Some(300));
        let bash = one(json!({"event": "tool.before", "session": "s", "tool": "bash", "input": {"command": "cargo test"}}));
        assert_eq!((bash.tool, bash.data.action.as_deref()), (Some(Tool::Bash), Some("cargo test")));
    }

    #[test]
    fn opencode_tool_names() {
        for (n, t) in [("bash", Tool::Bash), ("edit", Tool::Edit), ("write", Tool::Edit), ("patch", Tool::Edit),
                       ("multiedit", Tool::Edit), ("read", Tool::Read), ("grep", Tool::Grep), ("glob", Tool::Grep),
                       ("list", Tool::Grep), ("webfetch", Tool::Web), ("websearch", Tool::Web), ("task", Tool::Agent),
                       ("github_create_issue", Tool::Mcp), ("todowrite", Tool::Other), ("", Tool::Other)] {
            assert_eq!(crate::tools::from_opencode(n), t, "{n}");
        }
    }

    #[test]
    fn unsafe_sessions_and_unknown_events_give_nothing() {
        assert!(events(&json!({"event": "session.status", "session": "a/b", "status": "busy"}), Lang::Pl).is_empty());
        assert!(events(&json!({"event": "session.status", "session": "../x", "status": "busy"}), Lang::Pl).is_empty());
        assert!(events(&json!({"event": "message.part.updated", "session": "s"}), Lang::Pl).is_empty());
        assert!(events(&json!({"event": "session.status", "session": "s", "status": "weird"}), Lang::Pl).is_empty());
        assert!(events(&json!({"session": "s"}), Lang::Pl).is_empty());
        assert!(events(&json!("nie obiekt"), Lang::Pl).is_empty());
    }

    #[test]
    fn nothing_outside_the_contract_reaches_an_event() {
        let v = json!({"v": 1, "ts": 1, "pid": 1, "event": "tool.before", "session": "s", "tool": "write",
            "args": {"content": "SEKRET-123"}, "input": {"file_path": "a.txt", "content": "SEKRET-123"}, "parts": ["SEKRET-123"]});
        let e = events(&v, Lang::Pl);
        assert!(!serde_json::to_string(&e).unwrap().contains("SEKRET-123"));
    }
}
