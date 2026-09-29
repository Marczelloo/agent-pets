//! Adaptery agentów bez własnych logów w rdzeniu: zdarzenia z pluginu (opencode) i z furtki (dowolny agent).
//! Tekst z zewnątrz jest niezaufany: bez znaków sterujących, przycięty.
pub mod antigravity;
pub mod copilot;
pub mod cursor;
pub mod generic;
pub mod grok;
pub mod zcode;
pub mod opencode;

use serde::{Deserialize, Serialize};

/// Koperta `hook.exe --agent <id> --event <nazwa>` (Copilot, Antigravity): wejście hooka bez zmian plus to, co wie hook.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct AgentEnvelope {
    pub ts: i64,
    pub ppid: Option<u32>,
    /// nazwa zdarzenia z argumentu `--event` (Antigravity nie przysyła jej w JSON-ie)
    pub event: String,
    pub payload: serde_json::Value,
    #[serde(default)]
    pub host: Option<crate::host::Host>,
}

/// Tekst akcji z białej listy argumentów narzędzia: `keys` = (klucz u agenta, klucz Claude'a), a `claude_name` to
/// narzędzie Claude'a o tym samym tekście. Reszta argumentów (treść plików, diffy) nigdy nie jest czytana.
pub fn action_from(claude_name: &str, args: Option<&serde_json::Value>, keys: &[(&str, &str)], lang: crate::i18n::Lang) -> Option<String> {
    let src = args?.as_object()?;
    let mut only = serde_json::Map::new();
    for (from, to) in keys {
        if only.contains_key(*to) { continue; }
        if let Some(v) = src.get(*from).and_then(|v| v.as_str()) {
            only.insert(to.to_string(), serde_json::Value::String(v.chars().take(500).collect()));
        }
    }
    crate::action::action_text(claude_name, &serde_json::Value::Object(only), lang).map(|a| clean_text(&a, 80)).filter(|a| !a.is_empty())
}

/// Zdarzenia początku tury, przy których `hook.exe` liczy program (jeden zrzut procesów).
pub fn host_event(agent: &str, event: &str) -> bool {
    matches!((agent, event), ("copilot" | "grok" | "zcode", "SessionStart" | "UserPromptSubmit") | ("antigravity", "PreInvocation")
        | ("cursor", "sessionStart" | "beforeSubmitPrompt"))
}

/// Agent, który uruchamia cudze hooki (Cursor i Grok czytają hooki Claude'a, Grok także Cursora).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Caller { Cursor, Grok, Zcode }

impl Caller {
    pub fn id(self) -> &'static str {
        match self { Caller::Cursor => "cursor", Caller::Grok => "grok", Caller::Zcode => "zcode" }
    }
}

/// Kto naprawdę uruchomił hook (spec 0.12 §2.2); pierwszy pasujący wiersz wygrywa. Pusta zmienna = brak zmiennej.
pub fn caller(payload: &serde_json::Value, env: &dyn Fn(&str) -> Option<String>) -> Option<Caller> {
    let set = |k: &str| env(k).is_some_and(|v| !v.is_empty());
    if set("GROK_HOOK_EVENT") { return Some(Caller::Grok); }
    if payload.get("cursor_version").is_some() { return Some(Caller::Cursor); }
    if set("ZCODE_SESSION_ID") && payload.get("hookEventName").is_some() { return Some(Caller::Zcode); }
    None
}

/// Pola korzenia payloadu, których żaden adapter nie czyta: treść promptów, wyniki narzędzi, dane konta.
pub const SLIM: [&str; 12] = ["prompt", "attachments", "user_email", "transcript_path", "transcriptPath",
    "workspace_roots", "tool_output", "tool_response", "toolResponse", "toolResult", "response", "output"];

/// Usuwa z korzenia payloadu pola z `SLIM` (prywatność i limit 1 MB trasy); inne wartości zostają bez zmian.
pub fn slim(payload: &mut serde_json::Value) {
    if let Some(o) = payload.as_object_mut() { for k in SLIM { o.remove(k); } }
}

/// Tekst z zewnątrz: znaki sterujące zamienione na spacje, obcięte brzegi, najwyżej `max` znaków.
pub fn clean_text(s: &str, max: usize) -> String {
    let t: String = s.chars().map(|c| if c.is_control() { ' ' } else { c }).collect();
    t.trim().chars().take(max).collect::<String>().trim_end().to_string()
}

/// Id sesji z zewnątrz: `^[A-Za-z0-9_.:-]{1,128}$`, bez `..` (trafia do id sesji i komend wznowienia).
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
        assert_eq!(caller(&claude, &vars(&[("ZCODE_SESSION_ID", "zc_1")])), None, "Claude uruchomiony z ZCode to dalej Claude");
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
    }

    #[test]
    fn safe_ids() {
        for ok in ["abc", "ses_3f2a", "a.b:c-d", &"x".repeat(128)] { assert!(safe_id(ok), "{ok}"); }
        for bad in ["", "../x", "a/b", "a\\b", "a..b", "a b", &"x".repeat(129), "ż"] { assert!(!safe_id(bad), "{bad}"); }
    }
}
