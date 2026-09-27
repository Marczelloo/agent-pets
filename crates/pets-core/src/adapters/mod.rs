//! Adaptery agentów bez własnych logów w rdzeniu: zdarzenia z pluginu (opencode) i z furtki (dowolny agent).
//! Tekst z zewnątrz jest niezaufany: bez znaków sterujących, przycięty.
pub mod antigravity;
pub mod generic;
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

/// Zdarzenia początku tury, przy których `hook.exe` liczy program (jeden zrzut procesów).
pub fn host_event(agent: &str, event: &str) -> bool {
    matches!((agent, event), ("copilot", "SessionStart" | "UserPromptSubmit") | ("antigravity", "PreInvocation"))
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
                             ("antigravity", "Stop", false), ("claude", "SessionStart", false)] {
            assert_eq!(host_event(a, e), want, "{a} {e}");
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
