//! Przelotka statusline: `statusLine` w `~/.claude/settings.json` wskazuje `hook.exe --agent-pets-statusline`,
//! a dotychczasowa konfiguracja leży w `~/.agent-pets/statusline-original.json`.
use serde_json::{json, Value};
use std::path::{Path, PathBuf};

pub const MARK_ARG: &str = "--agent-pets-statusline";

/// `~/.agent-pets/statusline-original.json` (katalog domowy, nie `AppData`: patrz `Endpoint::default_path`).
/// `AGENT_PETS_STATUSLINE_ORIGINAL` podmienia ścieżkę w testach.
pub fn original_path() -> PathBuf {
    std::env::var_os("AGENT_PETS_STATUSLINE_ORIGINAL").map(PathBuf::from).unwrap_or_else(|| {
        dirs::home_dir().unwrap_or_else(std::env::temp_dir).join(".agent-pets").join("statusline-original.json")
    })
}

fn is_ours(v: &Value) -> bool {
    v["command"].as_str().map(|c| c.ends_with(MARK_ARG)).unwrap_or(false)
}

/// Ustawia przelotkę. Zwraca poprzedni `statusLine` (albo `Null`), gdy trzeba go zapamiętać.
pub fn install(settings: &mut Value, hook_exe: &str) -> Option<Value> {
    if !settings.is_object() { *settings = json!({}); }
    let prev = settings.get("statusLine").cloned().unwrap_or(Value::Null);
    let remember = if is_ours(&prev) { None } else { Some(prev) };
    settings["statusLine"] = json!({"type": "command", "command": format!("\"{hook_exe}\" {MARK_ARG}")});
    remember
}

/// Przywraca oryginał, jeśli obecny `statusLine` jest nasz.
pub fn uninstall(settings: &mut Value, original: Option<Value>) {
    if !settings.get("statusLine").map(is_ours).unwrap_or(false) { return; }
    match original {
        Some(v) if !v.is_null() => { settings["statusLine"] = v; }
        _ => { if let Some(o) = settings.as_object_mut() { o.remove("statusLine"); } }
    }
}

pub fn install_file(settings: &Path, hook_exe: &str) -> std::io::Result<()> {
    install_file_at(settings, hook_exe, &original_path())
}

pub fn uninstall_file(settings: &Path) -> std::io::Result<()> {
    uninstall_file_at(settings, &original_path())
}

/// Jak `install_file`, z jawną ścieżką zapamiętanego oryginału (instalator, testy).
pub fn install_file_at(settings: &Path, hook_exe: &str, original: &Path) -> std::io::Result<()> {
    let mut remembered = None;
    crate::hooks_install::edit_file(settings, |v| remembered = install(v, hook_exe))?;
    if let Some(orig) = remembered {
        if let Some(d) = original.parent() { std::fs::create_dir_all(d)?; }
        std::fs::write(original, serde_json::to_vec_pretty(&orig)?)?;
    }
    Ok(())
}

pub fn uninstall_file_at(settings: &Path, original: &Path) -> std::io::Result<()> {
    let original = std::fs::read(original).ok().and_then(|b| serde_json::from_slice(&b).ok());
    crate::hooks_install::edit_file(settings, |v| uninstall(v, original))
}

/// Czy `statusLine` w ustawieniach Claude Code to nasza przelotka.
pub fn is_installed(settings: &Value) -> bool { settings.get("statusLine").map(is_ours).unwrap_or(false) }

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn install_remembers_the_original_and_is_idempotent() {
        let mut s = json!({"statusLine": {"type": "command", "command": "my-line.exe"}, "theme": "dark"});
        let orig = install(&mut s, r"C:\h\hook.exe");
        assert_eq!(orig, Some(json!({"type": "command", "command": "my-line.exe"})));
        assert_eq!(s["statusLine"]["command"], r#""C:\h\hook.exe" --agent-pets-statusline"#);
        assert_eq!(install(&mut s, r"C:\h\hook.exe"), None, "drugi raz nie nadpisuje zapamiętanego oryginału");
        assert_eq!(s["theme"], "dark");
    }

    #[test]
    fn install_without_a_previous_statusline_remembers_null() {
        let mut s = json!({});
        assert_eq!(install(&mut s, "h.exe"), Some(Value::Null));
    }

    #[test]
    fn uninstall_restores_or_removes() {
        let mut s = json!({"statusLine": {"type": "command", "command": "\"h.exe\" --agent-pets-statusline"}});
        uninstall(&mut s, Some(json!({"type": "command", "command": "my-line.exe"})));
        assert_eq!(s["statusLine"]["command"], "my-line.exe");
        let mut s2 = json!({"statusLine": {"type": "command", "command": "\"h.exe\" --agent-pets-statusline"}});
        uninstall(&mut s2, Some(Value::Null));
        assert!(s2.get("statusLine").is_none());
    }

    #[test]
    fn uninstall_leaves_a_foreign_statusline_alone() {
        let mut s = json!({"statusLine": {"type": "command", "command": "someone-else.exe"}});
        uninstall(&mut s, Some(Value::Null));
        assert_eq!(s["statusLine"]["command"], "someone-else.exe");
    }
}
