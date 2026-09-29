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
pub const RESERVED: [&str; 9] = ["claude", "codex", "router", "opencode", "antigravity", "copilot", "cursor", "grok", "zcode"];

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
    // tylko zgłoszona nazwa; domyślną (id agenta) nadaje sklep przy tworzeniu sesji, żeby zdarzenie bez `name` jej nie zmieniało
    d.agent_name = text(&g.name, 40);
    d.title = text(&g.title, 80);
    d.cwd = text(&g.cwd, 260);
    d.model = text(&g.model, 64);
    d.app = g.app;
    d.pid = g.pid;
    d.origin = Some(Origin::Cli);
    if kind == Kind::NeedsInput { d.question = text(&g.question, 300); }
    Ok(e)
}

/// `hook.exe report --agent <id> --session <id> --state <stan> [--name --tool --title --cwd --model --question --app --pid]`:
/// ciało dla `/v1/events/generic`, sprawdzone tak jak sprawdzi je furtka (błąd zamiast odrzucenia po drugiej stronie).
pub fn report_body(args: &[String]) -> Result<serde_json::Value, String> {
    const TEXT: [&str; 9] = ["agent", "session", "state", "name", "tool", "title", "cwd", "model", "question"];
    let mut body = serde_json::Map::new();
    let mut it = args.iter();
    while let Some(flag) = it.next() {
        let key = flag.strip_prefix("--").ok_or_else(|| format!("unexpected argument: {flag}"))?;
        let val = it.next().ok_or_else(|| format!("--{key} needs a value"))?;
        let v = match key {
            k if TEXT.contains(&k) => serde_json::Value::String(val.clone()),
            "app" => serde_json::Value::String(val.clone()),
            "pid" => serde_json::Value::from(val.parse::<u32>().map_err(|_| format!("--pid must be a number: {val}"))?),
            _ => return Err(format!("unknown option: --{key}")),
        };
        body.insert(key.to_string(), v);
    }
    let body = serde_json::Value::Object(body);
    let g: GenericEvent = serde_json::from_value(body.clone()).map_err(|e| format!("invalid report: {e}"))?;
    match to_event(g, 0) {
        Ok(_) => Ok(body),
        Err(Reject::BadAgent) => Err("--agent must match [a-z0-9-]{1,32}".into()),
        Err(Reject::Reserved) => Err("--agent names an agent with its own integration; pick another id".into()),
        Err(Reject::BadSession) => Err("--session must match [A-Za-z0-9_.:-]{1,128} without \"..\"".into()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn g(v: serde_json::Value) -> GenericEvent { serde_json::from_value(v).unwrap() }
    fn base(state: &str) -> serde_json::Value { json!({"agent": "kilo", "session": "abc", "state": state}) }

    fn args(v: &[&str]) -> Vec<String> { v.iter().map(|s| s.to_string()).collect() }

    #[test]
    fn report_builds_the_body_from_the_spec_example() {
        let body = report_body(&args(&["--agent", "kilo", "--name", "Kilo CLI", "--session", "abc", "--state", "working",
            "--tool", "edit", "--title", "Refaktor", "--cwd", "C:\\work\\x", "--model", "GLM-5.3", "--app", "vscode", "--pid", "1234"])).unwrap();
        assert_eq!(body, json!({"agent": "kilo", "name": "Kilo CLI", "session": "abc", "state": "working", "tool": "edit",
            "title": "Refaktor", "cwd": "C:\\work\\x", "model": "GLM-5.3", "app": "vscode", "pid": 1234}));
        let q = report_body(&args(&["--agent", "kilo", "--session", "abc", "--state", "needs_you", "--question", "Usunąć?"])).unwrap();
        assert_eq!(q, json!({"agent": "kilo", "session": "abc", "state": "needs_you", "question": "Usunąć?"}));
    }

    #[test]
    fn report_refuses_what_the_door_would_refuse() {
        assert!(report_body(&args(&["--agent", "kilo", "--session", "abc"])).is_err(), "brak --state");
        assert!(report_body(&args(&["--agent", "claude", "--session", "abc", "--state", "done"])).is_err(), "Reserved");
        assert!(report_body(&args(&["--agent", "kilo", "--session", "../x", "--state", "done"])).is_err());
        assert!(report_body(&args(&["--agent", "kilo", "--session", "a", "--state", "nope"])).is_err());
        assert!(report_body(&args(&["--agent", "kilo", "--session", "a", "--state", "done", "--pid", "x"])).is_err());
        assert!(report_body(&args(&["--agent", "kilo", "--session", "a", "--state", "done", "--wat", "1"])).is_err());
        assert!(report_body(&args(&["--agent", "kilo", "--session", "a", "--state"])).is_err(), "flaga bez wartości");
    }

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
    fn a_name_is_sent_only_when_reported() {
        // brak `name` nie może nadpisać nazwy zgłoszonej wcześniej (id agenta jako domyślną nadaje sklep)
        assert_eq!(to_event(g(base("done")), 1).unwrap().data.agent_name, None);
    }

    #[test]
    fn a_door_pet_keeps_its_name_between_events() {
        let mut st = crate::store::Store::new(crate::store::Timing::default());
        st.apply(&to_event(g(base("working")), 1).unwrap());
        assert_eq!(st.session("generic:kilo:abc").unwrap().agent_name.as_deref(), Some("kilo"), "domyślnie id agenta");
        let mut named = base("working");
        named["name"] = json!("Kilo CLI");
        st.apply(&to_event(g(named), 2).unwrap());
        st.apply(&to_event(g(base("done")), 3).unwrap());
        assert_eq!(st.session("generic:kilo:abc").unwrap().agent_name.as_deref(), Some("Kilo CLI"));
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
        for a in ["claude", "codex", "router", "opencode", "antigravity", "copilot", "cursor", "grok", "zcode"] {
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
