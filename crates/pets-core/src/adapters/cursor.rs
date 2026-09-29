//! Cursor: hooki z `~/.cursor/hooks.json` (spec 0.12 §3). `hook.exe --agent cursor --event <nazwa>`.

/// Odpowiedź dla Cursora na wyjściu hooka: `beforeSubmitPrompt` musi przepuścić prompt, reszta nic nie zmienia.
pub fn reply(event: &str) -> &'static str { if event == "beforeSubmitPrompt" { r#"{"continue":true}"# } else { "{}" } }

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn cursor_always_gets_an_answer_that_lets_it_go_on() {
        assert_eq!(reply("beforeSubmitPrompt"), r#"{"continue":true}"#);
        for e in ["sessionStart", "preToolUse", "postToolUse", "stop", "afterAgentResponse", ""] { assert_eq!(reply(e), "{}", "{e}"); }
    }
}
