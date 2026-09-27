//! Antigravity: hooki z `~/.gemini/config/hooks.json` przez `hook.exe --agent antigravity --event <nazwa>`
//! na `/v1/events/antigravity` (spec 0.11 §3.3–3.4).

/// Odpowiedź dla Antigravity: `Stop` wymaga decyzji; cokolwiek innego niż `continue` pozwala skończyć.
/// Nigdy nie zmieniamy decyzji o zgodzie, więc przy pozostałych zdarzeniach pusty obiekt.
pub fn reply(event: &str) -> &'static str { if event == "Stop" { r#"{"decision":"stop"}"# } else { "{}" } }

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_stop_gets_a_decision_and_it_never_continues() {
        assert_eq!(reply("Stop"), r#"{"decision":"stop"}"#);
        for e in ["PreInvocation", "PostInvocation", "PreToolUse", "PostToolUse", ""] { assert_eq!(reply(e), "{}", "{e}"); }
        assert!(!reply("Stop").contains("continue"));
    }
}
