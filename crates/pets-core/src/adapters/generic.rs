//! Furtka: `POST /v1/events/generic` od dowolnego narzędzia (spec 8). Znani agenci mają własne trasy,
//! więc furtka nie może się pod nich podszyć.
use super::{clean_text, safe_id};
use crate::model::*;
use serde::Deserialize;

#[derive(Deserialize, Clone, Debug)]
pub struct GenericEvent {
    pub agent: String,
    #[serde(default)] pub name: Option<String>,
    pub session: String,
    pub state: State,
    #[serde(default)] pub tool: Option<Tool>,
    #[serde(default)] pub title: Option<String>,
    #[serde(default)] pub cwd: Option<String>,
    #[serde(default)] pub model: Option<String>,
    #[serde(default)] pub app: Option<App>,
    #[serde(default)] pub pid: Option<u32>,
    #[serde(default)] pub question: Option<String>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Reject { BadAgent, Reserved, BadSession }

/// Nazwy znanych agentów i źródeł: tylko ich własne trasy.
pub const RESERVED: [&str; 8] = ["claude", "codex", "router", "opencode", "antigravity", "copilot", "cursor", "grok"];

pub fn check_agent(a: &str) -> Result<(), Reject> {
    let ok = !a.is_empty() && a.len() <= 32 && a.chars().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-');
    if !ok { return Err(Reject::BadAgent); }
    if RESERVED.contains(&a) { return Err(Reject::Reserved); }
    Ok(())
}

fn text(s: &Option<String>, max: usize) -> Option<String> {
    s.as_deref().map(|s| clean_text(s, max)).filter(|s| !s.is_empty())
}

pub fn to_event(g: GenericEvent, ts: i64) -> Result<Event, Reject> {
    check_agent(&g.agent)?;
    if !safe_id(&g.session) { return Err(Reject::BadSession); }
    let kind = match g.state {
        State::Thinking => Kind::Prompt,
        State::Working => Kind::ToolStart,
        State::NeedsYou => Kind::NeedsInput,
        State::Done => Kind::TurnEnd,
        State::Error => Kind::Error,
        State::Idle | State::Sleep => Kind::Meta,
        State::Compacting => Kind::Compact,
        State::Ended => Kind::SessionEnd,
    };
    let mut e = Event::new(Source::Generic, format!("generic:{}:{}", g.agent, g.session), kind, ts);
    if kind == Kind::ToolStart { e.tool = Some(g.tool.unwrap_or(Tool::Other)); }
    let d = &mut e.data;
    d.agent_name = text(&g.name, 40).or_else(|| Some(g.agent.clone()));
    d.title = text(&g.title, 80);
    d.cwd = text(&g.cwd, 260);
    d.model = text(&g.model, 64);
    d.app = g.app;
    d.pid = g.pid;
    d.origin = Some(Origin::Cli);
    if kind == Kind::NeedsInput { d.question = text(&g.question, 300); }
    Ok(e)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn g(v: serde_json::Value) -> GenericEvent { serde_json::from_value(v).unwrap() }
    fn base(state: &str) -> serde_json::Value { json!({"agent": "kilo", "session": "abc", "state": state}) }

    #[test]
    fn a_door_event_becomes_an_other_agent_session() {
        let e = to_event(g(json!({"agent": "kilo", "name": "Kilo CLI", "session": "abc", "state": "working", "tool": "edit",
            "title": "Refaktor", "cwd": "C:\\work\\x", "model": "GLM-5.3", "app": "vscode", "pid": 1234, "question": null,
            "future_field": 1})), 5).unwrap();
        assert_eq!((e.source, e.agent(), e.session_id.as_str(), e.ts), (Source::Generic, Agent::Other, "generic:kilo:abc", 5));
        assert_eq!((e.kind, e.tool), (Kind::ToolStart, Some(Tool::Edit)));
        let d = &e.data;
        assert_eq!((d.agent_name.as_deref(), d.title.as_deref(), d.cwd.as_deref(), d.model.as_deref()),
                   (Some("Kilo CLI"), Some("Refaktor"), Some("C:\\work\\x"), Some("GLM-5.3")));
        assert_eq!((d.app, d.pid, d.origin), (Some(App::Vscode), Some(1234), Some(Origin::Cli)));
    }

    #[test]
    fn the_name_defaults_to_the_agent_id() {
        assert_eq!(to_event(g(base("done")), 1).unwrap().data.agent_name.as_deref(), Some("kilo"));
    }

    #[test]
    fn every_state_has_an_event() {
        for (st, kind) in [("thinking", Kind::Prompt), ("working", Kind::ToolStart), ("needs_you", Kind::NeedsInput),
                           ("done", Kind::TurnEnd), ("error", Kind::Error), ("idle", Kind::Meta), ("sleep", Kind::Meta),
                           ("compacting", Kind::Compact), ("ended", Kind::SessionEnd)] {
            assert_eq!(to_event(g(base(st)), 1).unwrap().kind, kind, "{st}");
        }
        assert_eq!(to_event(g(base("working")), 1).unwrap().tool, Some(Tool::Other));
        let mut q = base("needs_you");
        q["question"] = json!("Czy mogę usunąć plik?");
        assert_eq!(to_event(g(q), 1).unwrap().data.question.as_deref(), Some("Czy mogę usunąć plik?"));
    }

    #[test]
    fn known_agents_and_bad_ids_are_rejected() {
        for a in ["claude", "codex", "router", "opencode", "antigravity", "copilot", "cursor", "grok"] {
            let mut v = base("done");
            v["agent"] = json!(a);
            assert_eq!(to_event(g(v), 1).err(), Some(Reject::Reserved), "{a}");
        }
        for a in ["Kilo CLI", "", "kilo_cli", &"a".repeat(33)] {
            let mut v = base("done");
            v["agent"] = json!(a);
            assert_eq!(to_event(g(v), 1).err(), Some(Reject::BadAgent), "{a}");
        }
        let mut v = base("done");
        v["session"] = json!("../x");
        assert_eq!(to_event(g(v), 1).err(), Some(Reject::BadSession));
    }

    #[test]
    fn untrusted_text_is_cleaned_and_cut() {
        let mut v = base("needs_you");
        v["title"] = json!(format!("a\u{0007}{}", "x".repeat(200)));
        v["name"] = json!("<img src=x onerror=alert(1)>\n".repeat(5));
        v["question"] = json!("q".repeat(400));
        v["model"] = json!("m".repeat(100));
        v["cwd"] = json!("c".repeat(300));
        let d = to_event(g(v), 1).unwrap().data;
        let n = |s: &Option<String>| s.as_ref().map(|s| s.chars().count());
        assert_eq!((n(&d.title), n(&d.question), n(&d.model), n(&d.cwd)), (Some(80), Some(300), Some(64), Some(260)));
        assert!(n(&d.agent_name).unwrap() <= 40, "cięcie na 40, bez spacji na końcu");
        assert!(d.title.unwrap().starts_with("a x"));
        assert!(!d.agent_name.unwrap().contains('\n'));
    }
}
