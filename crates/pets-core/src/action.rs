//! Tekst bieżącej akcji i pytania agenta do dymków, tooltipa i panelu.
//! Tylko w pamięci: nigdy nie trafia na dysk, do logów ani do raportu diagnostycznego.
use serde_json::Value;
use crate::i18n::{tr, Lang};

/// Najdłuższy tekst dymka w znakach, razem z „…”.
pub const CLIP: usize = 40;

/// Pierwsza niepusta linia, najwyżej `CLIP` znaków (dłuższa kończy się „…”). Tnie po znakach, nie bajtach.
pub fn clip(s: &str) -> String {
    let line = s.lines().map(str::trim).find(|l| !l.is_empty()).unwrap_or("");
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

/// Komenda powłoki: tekst albo tablica argumentów (wtedy właściwa komenda jest ostatnia, np. `pwsh -Command …`).
fn command(v: &Value) -> Option<String> {
    let c = v.get("command").or_else(|| v.get("cmd"))?;
    match c {
        Value::String(s) => Some(s.clone()),
        Value::Array(a) => a.last()?.as_str().map(String::from),
        _ => None,
    }
}

/// Pliki z nagłówków łatki Codexa (`*** Update File: …`, `*** Add File: …`, `*** Delete File: …`).
fn patch_files(patch: &str) -> Vec<&str> {
    patch.lines().filter_map(|l| {
        ["*** Update File:", "*** Add File:", "*** Delete File:"].iter()
            .find_map(|h| l.strip_prefix(h)).map(|p| file_name(p))
    }).filter(|f| !f.is_empty()).collect()
}

fn host(url: &str) -> Option<&str> {
    let rest = url.split_once("://").map(|(_, r)| r).unwrap_or(url);
    let h = rest.split(['/', '?', '#']).next()?;
    let h = h.rsplit('@').next()?;
    if h.is_empty() { None } else { Some(h) }
}

/// Tekst akcji z nazwy i wejścia narzędzia (tabela 2.1 specyfikacji). `None`, gdy narzędzie nie ma dymka.
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

/// Tekst pytania sesji, która czeka na użytkownika.
/// - `ask`: wejście `AskUserQuestion` (Claude) albo `request_user_input` (Codex): pierwsze pytanie;
/// - `notification`: wiadomość `Notification`; prośba o zgodę („… permission to use Bash”) dostaje tekst ostatniej
///   akcji tego samego narzędzia (`last_action` = nazwa narzędzia i jej tekst).
pub fn question_text(notification: Option<&str>, last_action: Option<(&str, &str)>, ask: Option<&Value>, lang: Lang) -> Option<String> {
    if let Some(q) = ask.and_then(|a| a.pointer("/questions/0"))
        .and_then(|q| q.get("question").or_else(|| q.get("title"))).and_then(|v| v.as_str()) {
        return nonempty(format!("{} {}", tr(lang, "Pytanie:", "Question:"), q.trim()));
    }
    let msg = notification?.trim();
    if msg.is_empty() { return None; }
    if let Some(i) = msg.find("permission to use ") {
        let tool = msg[i + "permission to use ".len()..].split_whitespace().next().unwrap_or("");
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
        assert_eq!(clip(&"b".repeat(40)), "b".repeat(40), "40 znaków zostaje bez zmian");
        let tok = pl("Bash", json!({"command": "curl -H \"Authorization: Bearer sk-abcdefghijklmnopqrstuvwxyz0123456789\" https://x"})).unwrap();
        assert_eq!(tok.chars().count(), CLIP);
        assert!(!tok.contains("0123456789"));
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
        assert_eq!(q.as_deref(), Some("Allow Bash?"), "ostatnia akcja innego narzędzia nie pasuje");
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
