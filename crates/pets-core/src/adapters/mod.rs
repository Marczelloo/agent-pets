//! Adapters for agents without their own core logs: events from the plugin (opencode) and the door (any agent).
//! External text is untrusted: control characters removed and length capped.
pub mod antigravity;
pub mod antigravity_usage;
pub mod copilot;
pub mod cursor;
pub mod generic;
pub mod grok;
pub mod zcode;
pub mod opencode;

use serde::{Deserialize, Serialize};

/// `hook.exe --agent <id> --event <name>` envelope (Copilot, Antigravity): unchanged hook input plus hook metadata.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct AgentEnvelope {
    pub ts: i64,
    pub ppid: Option<u32>,
    /// Event name from `--event` (Antigravity does not include it in JSON).
    pub event: String,
    pub payload: serde_json::Value,
    #[serde(default)]
    pub host: Option<crate::host::Host>,
}

/// Action text from allowlisted tool arguments: `keys` = (agent key, Claude key), and `claude_name` is
/// the Claude tool with the same text. Other arguments (file contents, diffs) are never read.
pub fn action_from(claude_name: &str, args: Option<&serde_json::Value>, keys: &[(&str, &str)], lang: crate::i18n::Lang) -> Option<String> {
    // Copilot CLI sends `toolArgs` as a JSON string, the others as an object
    let parsed;
    let src = match args? {
        serde_json::Value::String(s) if s.len() <= 256 * 1024 => { parsed = serde_json::from_str::<serde_json::Value>(s).ok()?; parsed.as_object()? }
        v => v.as_object()?,
    };
    let mut only = serde_json::Map::new();
    for (from, to) in keys {
        if only.contains_key(*to) { continue; }
        if let Some(v) = src.get(*from).and_then(|v| v.as_str()) {
            only.insert(to.to_string(), serde_json::Value::String(v.chars().take(500).collect()));
        }
    }
    crate::action::action_text(claude_name, &serde_json::Value::Object(only), lang).map(|a| clean_text(&a, 80)).filter(|a| !a.is_empty())
}

/// Turn-start events for which `hook.exe` resolves the host (one process snapshot).
pub fn host_event(agent: &str, event: &str) -> bool {
    matches!((agent, event), ("copilot" | "grok" | "zcode", "SessionStart" | "UserPromptSubmit") | ("antigravity", "PreInvocation")
        | ("cursor", "sessionStart" | "beforeSubmitPrompt"))
}

/// Agent that runs other agents' hooks (Cursor and Grok read Claude hooks; Grok also reads Cursor hooks).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Caller { Cursor, Grok, Zcode }

impl Caller {
    pub fn id(self) -> &'static str {
        match self { Caller::Cursor => "cursor", Caller::Grok => "grok", Caller::Zcode => "zcode" }
    }
}

/// Who actually ran the hook (spec 0.12 §2.2); first matching row wins. Empty variable means absent.
pub fn caller(payload: &serde_json::Value, env: &dyn Fn(&str) -> Option<String>) -> Option<Caller> {
    let set = |k: &str| env(k).is_some_and(|v| !v.is_empty());
    if set("GROK_HOOK_EVENT") { return Some(Caller::Grok); }
    if payload.get("cursor_version").is_some() { return Some(Caller::Cursor); }
    if set("ZCODE_SESSION_ID") && payload.get("hookEventName").is_some() { return Some(Caller::Zcode); }
    None
}

/// Top-level payload fields no adapter reads: prompt text, tool results, account data.
pub const SLIM: [&str; 12] = ["prompt", "attachments", "user_email", "transcript_path", "transcriptPath",
    "workspace_roots", "tool_output", "tool_response", "toolResponse", "toolResult", "response", "output"];

/// Remove `SLIM` fields from the payload root (privacy and 1 MB route limit); leave other values unchanged.
pub fn slim(payload: &mut serde_json::Value) {
    if let Some(o) = payload.as_object_mut() { for k in SLIM { o.remove(k); } }
}

/// External text: remove display-direction controls, collapse whitespace, and cap by characters.
pub fn clean_text(s: &str, max: usize) -> String {
    let t: String = s.chars().filter(|c| !matches!(*c, '\u{061c}' | '\u{200e}' | '\u{200f}' | '\u{202a}'..='\u{202e}' | '\u{2066}'..='\u{2069}'))
        .map(|c| if c.is_control() { ' ' } else { c }).collect();
    t.split_whitespace().collect::<Vec<_>>().join(" ").chars().take(max).collect::<String>().trim_end().to_string()
}

/// External session ID: `^[A-Za-z0-9_.:-]{1,128}$`, without `..` (used in session IDs and resume commands).
pub fn safe_id(s: &str) -> bool {
    !s.is_empty() && s.len() <= 128 && !s.contains("..")
        && s.chars().all(|c| c.is_ascii_alphanumeric() || matches!(c, '_' | '.' | ':' | '-'))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_program_is_looked_up_only_at_the_start_of_a_turn() {
        for (a, e, want) in [("copilot", "SessionStart", true), ("copilot", "UserPromptSubmit", true), ("copilot", "PreToolUse", false),
                             ("copilot", "Stop", false), ("antigravity", "PreInvocation", true), ("antigravity", "PreToolUse", false),
                             ("antigravity", "Stop", false), ("claude", "SessionStart", false),
                             ("cursor", "sessionStart", true), ("cursor", "beforeSubmitPrompt", true), ("cursor", "preToolUse", false),
                             ("cursor", "SessionStart", false), ("grok", "SessionStart", true), ("grok", "UserPromptSubmit", true),
                             ("grok", "PreToolUse", false), ("zcode", "SessionStart", true), ("zcode", "UserPromptSubmit", true),
                             ("zcode", "Stop", false)] {
            assert_eq!(host_event(a, e), want, "{a} {e}");
        }
    }

    fn vars(pairs: &'static [(&'static str, &'static str)]) -> impl Fn(&str) -> Option<String> {
        move |k| pairs.iter().find(|(n, _)| *n == k).map(|(_, v)| v.to_string())
    }

    #[test]
    fn the_real_caller_of_a_hook_is_recognised() {
        use serde_json::json;
        let cursor = json!({"cursor_version": "1.7.2", "hook_event_name": "stop"});
        let claude = json!({"hook_event_name": "Stop", "session_id": "c1"});
        let zcode = json!({"hookEventName": "Stop", "sessionId": "zc_1"});
        assert_eq!(caller(&cursor, &vars(&[("GROK_HOOK_EVENT", "PreToolUse")])), Some(Caller::Grok), "Grok wygrywa");
        assert_eq!(caller(&cursor, &vars(&[])), Some(Caller::Cursor));
        assert_eq!(caller(&zcode, &vars(&[("ZCODE_SESSION_ID", "zc_1")])), Some(Caller::Zcode));
        assert_eq!(caller(&claude, &vars(&[("ZCODE_SESSION_ID", "zc_1")])), None, "Claude launched from ZCode remains Claude");
        assert_eq!(caller(&claude, &vars(&[("GROK_SESSION_ID", "g1")])), None);
        assert_eq!(caller(&claude, &vars(&[("GROK_HOOK_EVENT", "")])), None);
        assert_eq!(caller(&zcode, &vars(&[("ZCODE_SESSION_ID", "")])), None);
        assert_eq!(caller(&claude, &vars(&[])), None);
        assert_eq!([Caller::Cursor.id(), Caller::Grok.id(), Caller::Zcode.id()], ["cursor", "grok", "zcode"]);
    }

    #[test]
    fn slim_drops_only_the_fields_no_adapter_reads() {
        use serde_json::json;
        let mut p = json!({"tool_input": {"command": "ls"}, "tool_name": "Shell", "conversation_id": "c", "model": "m", "cwd": "C:/x"});
        for k in SLIM { p[k] = json!("x"); }
        slim(&mut p);
        let mut keys: Vec<&str> = p.as_object().unwrap().keys().map(String::as_str).collect();
        keys.sort();
        assert_eq!(keys, ["conversation_id", "cwd", "model", "tool_input", "tool_name"]);
        let mut not_obj = json!([1, 2]);
        slim(&mut not_obj);
        assert_eq!(not_obj, json!([1, 2]));
    }

    #[test]
    fn slim_envelopes_give_the_same_copilot_and_antigravity_events() {
        type Events = fn(&AgentEnvelope, crate::i18n::Lang) -> Vec<crate::model::Event>;
        for (name, events) in [("copilot", copilot::events as Events), ("antigravity", antigravity::events as Events)] {
            let p = format!("{}/tests/fixtures/{name}/session.jsonl", env!("CARGO_MANIFEST_DIR"));
            for line in std::fs::read_to_string(p).unwrap().lines() {
                let e: AgentEnvelope = serde_json::from_str(line).unwrap();
                let mut s = e.clone();
                slim(&mut s.payload);
                assert_eq!(events(&s, crate::i18n::Lang::Pl), events(&e, crate::i18n::Lang::Pl), "{name}: {}", e.event);
            }
        }
    }

    #[test]
    fn an_envelope_without_a_program_reads_back() {
        let e: AgentEnvelope = serde_json::from_str(r#"{"ts":1,"ppid":null,"event":"Stop","payload":{"a":1}}"#).unwrap();
        assert_eq!((e.event.as_str(), e.host.is_none(), e.payload["a"].as_i64()), ("Stop", true, Some(1)));
        let back: AgentEnvelope = serde_json::from_value(serde_json::to_value(&e).unwrap()).unwrap();
        assert_eq!(back, e);
    }

    #[test]
    fn clean_text_drops_control_characters_and_cuts_by_chars() {
        assert_eq!(clean_text("  a\u{0007}b\nc\t ", 80), "a b c");
        assert_eq!(clean_text(&"ż".repeat(200), 80).chars().count(), 80);
        assert_eq!(clean_text("\u{001b}[31m", 10), "[31m");
        assert_eq!(clean_text("a\u{202e}\u{2066}\u{200e}\u{061c}b\u{0085}\u{0000} c", 80), "ab c");
    }

    #[test]
    fn safe_ids() {
        for ok in ["abc", "ses_3f2a", "a.b:c-d", &"x".repeat(128)] { assert!(safe_id(ok), "{ok}"); }
        for bad in ["", "../x", "a/b", "a\\b", "a..b", "a b", &"x".repeat(129), "ż"] { assert!(!safe_id(bad), "{bad}"); }
    }
}
