//! Current action and agent question text for bubbles, tooltips, and the panel.
//! In memory only: never written to disk, logs, or the diagnostic report.
use serde_json::Value;
use regex::{Captures, Regex};
use std::sync::LazyLock;
use crate::i18n::{tr, Lang};

static BEARER: LazyLock<Regex> = LazyLock::new(|| Regex::new(r#"(?i)(\bBearer\s+)([^\s\"'`;?&]+)"#).unwrap());
static ASSIGNMENT: LazyLock<Regex> = LazyLock::new(|| Regex::new(r#"(?i)(\b[A-Za-z0-9_]*(?:token|key|password|secret)\s*=\s*[\"']?)([^\s\"'`;?&]+)"#).unwrap());
static FLAG: LazyLock<Regex> = LazyLock::new(|| Regex::new(r#"(?i)(--(?:token|api-key|password|secret)(?:\s+|=)\s*[\"']?)([^\s\"'`;?&]+)"#).unwrap());
static PREFIX: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"(?i)\b(?:sk-ant-|sk-|ghp_|gho_|github_pat_|xoxb-|xoxp-|xoxa-|AKIA|AIza)[A-Za-z0-9_-]+").unwrap());

/// Redact secrets before clipping, so even a short visible tail cannot escape.
pub fn redact(s: &str) -> String {
    let mut out = s.to_string();
    for pattern in [&*BEARER, &*ASSIGNMENT, &*FLAG] {
        out = pattern.replace_all(&out, |c: &Captures<'_>| format!("{}•••", &c[1])).into_owned();
    }
    PREFIX.replace_all(&out, "•••").into_owned()
}

/// Maximum bubble text length in characters, including "…".
pub const CLIP: usize = 40;

/// First nonempty line, at most `CLIP` characters (longer text ends in "…"). Clips characters, not bytes.
pub fn clip(s: &str) -> String {
    let safe = redact(s);
    let line = safe.lines().map(str::trim).find(|l| !l.is_empty()).unwrap_or("");
    if line.chars().count() <= CLIP { return line.to_string(); }
    let mut out: String = line.chars().take(CLIP - 1).collect();
    out.push('…');
    out
}

fn nonempty(s: String) -> Option<String> { let c = clip(&s); if c.is_empty() { None } else { Some(c) } }

fn file_name(path: &str) -> &str {
    path.trim().rsplit(['\\', '/']).find(|p| !p.is_empty()).unwrap_or("")
}

fn str_at<'a>(v: &'a Value, key: &str) -> Option<&'a str> { v.get(key)?.as_str() }

/// Shell command: text or an argument array (then the actual command is last, e.g. `pwsh -Command …`).
fn command(v: &Value) -> Option<String> {
    let c = v.get("command").or_else(|| v.get("cmd"))?;
    match c {
        Value::String(s) => Some(s.clone()),
        Value::Array(a) => a.last()?.as_str().map(String::from),
        _ => None,
    }
}

/// Files from Codex patch headers (`*** Update File: …`, `*** Add File: …`, `*** Delete File: …`).
fn patch_files(patch: &str) -> Vec<&str> {
    patch.lines().filter_map(|l| {
        ["*** Update File:", "*** Add File:", "*** Delete File:"].iter()
            .find_map(|h| l.strip_prefix(h)).map(file_name)
    }).filter(|f| !f.is_empty()).collect()
}

fn host(url: &str) -> Option<&str> {
    let rest = url.split_once("://").map(|(_, r)| r).unwrap_or(url);
    let h = rest.split(['/', '?', '#']).next()?;
    let h = h.rsplit('@').next()?;
    if h.is_empty() { None } else { Some(h) }
}

/// Action text from the tool name and input (spec table 2.1). `None` when the tool has no bubble.
pub fn action_text(tool: &str, input: &Value, lang: Lang) -> Option<String> {
    let editing = tr(lang, "Edytuje", "Editing");
    let text = match tool {
        "Edit" | "Write" | "MultiEdit" | "NotebookEdit" => {
            let f = file_name(str_at(input, "file_path").or_else(|| str_at(input, "notebook_path"))?);
            if f.is_empty() { return None; }
            format!("{editing} {f}")
        }
        "apply_patch" => {
            let patch = input.as_str().or_else(|| str_at(input, "input")).or_else(|| str_at(input, "patch"))?;
            let files = patch_files(patch);
            match files.len() {
                0 => return None,
                1 => format!("{editing} {}", files[0]),
                n => format!("{editing} {} +{}", files[0], n - 1),
            }
        }
        "Read" => {
            let f = file_name(str_at(input, "file_path")?);
            if f.is_empty() { return None; }
            format!("{} {f}", tr(lang, "Czyta", "Reading"))
        }
        "Bash" | "PowerShell" | "shell" | "shell_command" | "exec_command" | "local_shell" => command(input)?,
        "Grep" | "Glob" => format!("{} {}", tr(lang, "Szuka:", "Searching:"), str_at(input, "pattern")?),
        "WebFetch" => format!("{} {}", tr(lang, "Przegląda", "Browsing"), host(str_at(input, "url")?)?),
        "WebSearch" => format!("{} {}", tr(lang, "Szuka w sieci:", "Web search:"), str_at(input, "query")?),
        "Task" | "Agent" => format!("{} {}", tr(lang, "Zleca:", "Delegating:"), str_at(input, "description")?),
        t if t.starts_with("mcp__") => {
            let (server, name) = t["mcp__".len()..].split_once("__")?;
            format!("{server}: {name}")
        }
        _ => return None,
    };
    nonempty(text)
}

/// Question text for a session waiting for the user.
/// - `ask`: `AskUserQuestion` (Claude) or `request_user_input` (Codex) input: first question;
/// - `notification`: a `Notification` message; a permission request ("… permission to use Bash") gets the text of the last
///   action by the same tool (`last_action` = tool name and its text).
pub fn question_text(notification: Option<&str>, last_action: Option<(&str, &str)>, ask: Option<&Value>, lang: Lang) -> Option<String> {
    if let Some(q) = ask.and_then(|a| a.pointer("/questions/0"))
        .and_then(|q| q.get("question").or_else(|| q.get("title"))).and_then(|v| v.as_str()) {
        return nonempty(format!("{} {}", tr(lang, "Pytanie:", "Question:"), q.trim()));
    }
    let msg = notification?.trim();
    if msg.is_empty() { return None; }
    if let Some(i) = msg.find("permission to use ") {
        let tool = msg[i + "permission to use ".len()..].split_whitespace().next().unwrap_or("");
        // Claude also asks permission to show its own question: the question is the text, "Allow AskUserQuestion?" says nothing
        if tool == "AskUserQuestion" {
            return match last_action {
                Some((t, text)) if t == tool => nonempty(text.to_string()),
                _ => None,
            };
        }
        let ask = format!("{} {tool}?", tr(lang, "Zgoda na", "Allow"));
        return nonempty(match last_action {
            Some((t, text)) if t == tool && !text.is_empty() => format!("{ask} {text}"),
            _ => ask,
        });
    }
    nonempty(msg.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::i18n::Lang;
    use serde_json::json;

    fn pl(tool: &str, input: serde_json::Value) -> Option<String> { action_text(tool, &input, Lang::Pl) }
    fn en(tool: &str, input: serde_json::Value) -> Option<String> { action_text(tool, &input, Lang::En) }

    #[test]
    fn edits_show_the_file_name_only() {
        assert_eq!(pl("Edit", json!({"file_path": "C:\\x\\App.tsx"})).as_deref(), Some("Edytuje App.tsx"));
        assert_eq!(en("Write", json!({"file_path": "/home/u/src/main.rs"})).as_deref(), Some("Editing main.rs"));
        assert_eq!(pl("MultiEdit", json!({"file_path": "a/b.ts"})).as_deref(), Some("Edytuje b.ts"));
        assert_eq!(pl("NotebookEdit", json!({"notebook_path": "C:\\n\\x.ipynb"})).as_deref(), Some("Edytuje x.ipynb"));
    }

    #[test]
    fn codex_patch_names_the_first_file_and_counts_the_rest() {
        let patch = "*** Begin Patch\n*** Update File: C:\\p\\src\\a.ts\n@@\n-x\n+y\n*** Add File: b.ts\n+z\n*** End Patch";
        assert_eq!(pl("apply_patch", json!(patch)).as_deref(), Some("Edytuje a.ts +1"));
        assert_eq!(en("apply_patch", json!("*** Delete File: old.rs\n")).as_deref(), Some("Editing old.rs"));
        assert_eq!(pl("apply_patch", json!("no headers")), None);
    }

    #[test]
    fn read_search_web_and_delegation() {
        assert_eq!(pl("Read", json!({"file_path": "C:\\x\\README.md"})).as_deref(), Some("Czyta README.md"));
        assert_eq!(en("Read", json!({"file_path": "C:\\x\\README.md"})).as_deref(), Some("Reading README.md"));
        assert_eq!(pl("Grep", json!({"pattern": "dismiss"})).as_deref(), Some("Szuka: dismiss"));
        assert_eq!(en("Glob", json!({"pattern": "**/*.ts"})).as_deref(), Some("Searching: **/*.ts"));
        assert_eq!(pl("WebFetch", json!({"url": "https://docs.rs/serde/latest"})).as_deref(), Some("Przegląda docs.rs"));
        assert_eq!(en("WebFetch", json!({"url": "http://127.0.0.1:1430/x"})).as_deref(), Some("Browsing 127.0.0.1:1430"));
        assert_eq!(pl("WebSearch", json!({"query": "tauri updater"})).as_deref(), Some("Szuka w sieci: tauri updater"));
        assert_eq!(en("WebSearch", json!({"query": "tauri updater"})).as_deref(), Some("Web search: tauri updater"));
        assert_eq!(pl("Agent", json!({"description": "Count files"})).as_deref(), Some("Zleca: Count files"));
        assert_eq!(en("Task", json!({"description": "Count files"})).as_deref(), Some("Delegating: Count files"));
    }

    #[test]
    fn shell_commands_show_their_first_line() {
        assert_eq!(pl("Bash", json!({"command": "npm test\necho done"})).as_deref(), Some("npm test"));
        assert_eq!(en("PowerShell", json!({"command": "  Get-ChildItem  "})).as_deref(), Some("Get-ChildItem"));
        assert_eq!(pl("shell", json!({"command": ["pwsh", "-Command", "cargo test"]})).as_deref(), Some("cargo test"));
        assert_eq!(pl("exec_command", json!({"cmd": "git status"})).as_deref(), Some("git status"));
        assert_eq!(pl("shell_command", json!({"command": "ls -la"})).as_deref(), Some("ls -la"));
        assert_eq!(pl("Bash", json!({"command": ""})), None);
    }

    #[test]
    fn mcp_tools_show_server_and_tool() {
        assert_eq!(pl("mcp__agent-router__codex_delegate", json!({})).as_deref(), Some("agent-router: codex_delegate"));
        assert_eq!(en("mcp__Claude_Browser__navigate", json!({})).as_deref(), Some("Claude_Browser: navigate"));
    }

    #[test]
    fn unknown_tools_and_missing_fields_give_no_text() {
        assert_eq!(pl("TodoWrite", json!({})), None);
        assert_eq!(pl("Edit", json!({})), None);
        assert_eq!(pl("WebFetch", json!({"url": 5})), None);
    }

    #[test]
    fn long_text_is_clipped_to_40_chars_with_an_ellipsis() {
        let s41 = "a".repeat(41);
        let c = clip(&s41);
        assert_eq!(c.chars().count(), CLIP);
        assert!(c.ends_with('…'));
        assert_eq!(clip(&"b".repeat(40)), "b".repeat(40), "40 characters remain unchanged");
        let tok = pl("Bash", json!({"command": "curl -H \"Authorization: Bearer sk-abcdefghijklmnopqrstuvwxyz0123456789\" https://x"})).unwrap();
        assert_eq!(tok.chars().count(), CLIP);
        assert!(!tok.contains("0123456789"));
    }

    #[test]
    fn secrets_are_redacted_before_action_and_question_text_is_clipped() {
        for input in [
            "curl -H 'Authorization: Bearer sk-ant-supersecret'",
            "export GITHUB_TOKEN=ghp_supersecret",
            "token=abc123 key=def456 password=hunter2 secret=qwerty",
            "--token abc123 --api-key=def456 --password 'hunter2' --secret=qwerty",
            "sk-supersecret gho_supersecret github_pat_supersecret xoxb-supersecret xoxp-supersecret xoxa-supersecret AKIA1234567890 AIza1234567890",
        ] {
            let action = en("Bash", json!({"command": input})).unwrap();
            assert!(action.contains("•••"), "{action}");
            for secret in ["supersecret", "abc123", "def456", "hunter2", "qwerty", "1234567890"] {
                assert!(!action.contains(secret), "{action}");
            }
            let question = question_text(Some(input), None, None, Lang::En).unwrap();
            assert!(question.contains("•••"), "{question}");
        }
        assert_eq!(redact("curl https://example.com/token=abc?x=1"), "curl https://example.com/token=•••?x=1");
        assert_eq!(redact("Bearer ABC token=xyz API_KEY='123' --api-key qwe"), "Bearer ••• token=••• API_KEY='•••' --api-key •••");
        for prefix in ["sk-ant-", "sk-", "ghp_", "gho_", "github_pat_", "xoxb-", "xoxp-", "xoxa-", "AKIA", "AIza"] {
            assert_eq!(redact(&format!("value {prefix}123456789")), "value •••");
        }
        assert_eq!(clip("cargo test --workspace"), "cargo test --workspace");
        assert_eq!(redact("ordinary token usage, keyboard shortcut, and secret garden"), "ordinary token usage, keyboard shortcut, and secret garden");
    }

    #[test]
    fn clipping_never_splits_a_multibyte_char() {
        let s = "ż".repeat(50);
        let c = clip(&s);
        assert_eq!(c.chars().count(), CLIP);
        assert!(c.starts_with("żż") && c.ends_with('…'));
        assert_eq!(clip("🐱".repeat(45).as_str()).chars().count(), CLIP);
        assert_eq!(clip("  jedna\ndruga"), "jedna");
    }

    #[test]
    fn permission_question_names_the_tool_and_its_last_command() {
        let q = question_text(Some("Claude needs your permission to use Bash"), Some(("Bash", "npm test")), None, Lang::Pl);
        assert_eq!(q.as_deref(), Some("Zgoda na Bash? npm test"));
        let q = question_text(Some("Claude needs your permission to use Bash"), Some(("Edit", "Edytuje a.ts")), None, Lang::En);
        assert_eq!(q.as_deref(), Some("Allow Bash?"), "another tool's last action does not match");
    }

    #[test]
    fn ask_user_question_shows_the_first_question() {
        let ask = json!({"questions": [{"question": "Który wariant wybierasz?", "header": "Wariant"}]});
        assert_eq!(question_text(None, None, Some(&ask), Lang::Pl).as_deref(), Some("Pytanie: Który wariant wybierasz?"));
        assert_eq!(question_text(None, None, Some(&ask), Lang::En).as_deref(), Some("Question: Który wariant wybierasz?"));
        let codex = json!({"questions": [{"title": "Tak czy nie?"}]});
        assert_eq!(question_text(None, None, Some(&codex), Lang::Pl).as_deref(), Some("Pytanie: Tak czy nie?"));
    }

    #[test]
    fn other_notifications_show_their_message() {
        assert_eq!(question_text(Some("Claude is waiting for your input"), None, None, Lang::Pl).as_deref(),
            Some("Claude is waiting for your input"));
        assert_eq!(question_text(None, None, None, Lang::Pl), None);
        assert_eq!(question_text(Some("  "), None, None, Lang::Pl), None);
    }
}
