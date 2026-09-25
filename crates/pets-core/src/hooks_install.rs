use serde_json::{json, Value};
use std::path::Path;

pub const EVENTS: [&str; 9] = ["SessionStart", "UserPromptSubmit", "PreToolUse", "PostToolUse", "Notification",
                              "Stop", "SubagentStop", "PreCompact", "SessionEnd"];
/// Wpisy widżetu rozpoznajemy po tym sufiksie komendy; hook.exe ignoruje argumenty.
const MARK: &str = " --agent-pets";

fn is_ours(h: &Value) -> bool { h["command"].as_str().map(|c| c.ends_with(MARK)).unwrap_or(false) }

pub fn uninstall(settings: &mut Value) {
    let Some(hooks) = settings.get_mut("hooks").and_then(|h| h.as_object_mut()) else { return };
    for groups in hooks.values_mut() {
        if let Some(arr) = groups.as_array_mut() {
            for g in arr.iter_mut() {
                if let Some(inner) = g.get_mut("hooks").and_then(|h| h.as_array_mut()) { inner.retain(|h| !is_ours(h)); }
            }
            arr.retain(|g| g.get("hooks").and_then(|h| h.as_array()).map(|a| !a.is_empty()).unwrap_or(true));
        }
    }
    hooks.retain(|_, g| g.as_array().map(|a| !a.is_empty()).unwrap_or(true));
    if hooks.is_empty() { settings.as_object_mut().unwrap().remove("hooks"); }
}

/// Ile z dziewięciu zdarzeń ma nasz hook (9 = komplet).
pub fn installed_count(settings: &Value) -> usize {
    let Some(hooks) = settings.get("hooks").and_then(|h| h.as_object()) else { return 0 };
    EVENTS.iter().filter(|ev| hooks.get(**ev).and_then(|g| g.as_array()).map(|arr| arr.iter()
        .flat_map(|g| g.get("hooks").and_then(|h| h.as_array()).into_iter().flatten())
        .any(is_ours)).unwrap_or(false)).count()
}

pub fn install(settings: &mut Value, hook_exe: &str) {
    uninstall(settings);
    if !settings.is_object() { *settings = json!({}); }
    let obj = settings.as_object_mut().unwrap();
    let hooks = obj.entry("hooks").or_insert_with(|| json!({}));
    for ev in EVENTS {
        let entry = json!({"type": "command", "command": format!("\"{hook_exe}\"{MARK}"), "timeout": 2});
        let group = if ev == "PreToolUse" || ev == "PostToolUse" {
            json!({"matcher": "*", "hooks": [entry]})
        } else {
            json!({"hooks": [entry]})
        };
        let arr = hooks.as_object_mut().unwrap().entry(ev).or_insert_with(|| json!([]));
        arr.as_array_mut().unwrap().push(group);
    }
}

/// Zmiana pliku z kopią `<nazwa>.agent-pets.bak` i zapisem atomowym. Zepsuty JSON kończy się błędem bez zapisu.
pub(crate) fn edit_file(path: &Path, f: impl FnOnce(&mut Value)) -> std::io::Result<()> {
    let mut v: Value = match std::fs::read_to_string(path) {
        Ok(s) => {
            let v = serde_json::from_str(&s).map_err(|e| std::io::Error::new(std::io::ErrorKind::InvalidData, e))?;
            std::fs::write(path.with_file_name(format!(
                "{}.agent-pets.bak", path.file_name().unwrap().to_string_lossy())), &s)?;
            v
        }
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => json!({}),
        Err(e) => return Err(e),
    };
    f(&mut v);
    if let Some(dir) = path.parent() { std::fs::create_dir_all(dir)?; }
    let tmp = path.with_extension("json.agent-pets.tmp");
    std::fs::write(&tmp, serde_json::to_string_pretty(&v)?)?;
    std::fs::rename(&tmp, path)
}

pub fn install_file(path: &Path, hook_exe: &str) -> std::io::Result<()> { edit_file(path, |v| install(v, hook_exe)) }
pub fn uninstall_file(path: &Path) -> std::io::Result<()> { edit_file(path, uninstall) }

#[cfg(test)]
mod tests {
    use super::*;

    fn ours(v: &Value, ev: &str) -> usize {
        v["hooks"][ev].as_array().map(|groups| groups.iter()
            .flat_map(|g| g["hooks"].as_array().cloned().unwrap_or_default())
            .filter(|h| h["command"].as_str().unwrap_or("").ends_with(MARK)).count()).unwrap_or(0)
    }

    #[test]
    fn install_into_empty_settings() {
        let mut v = json!({});
        install(&mut v, r"C:\a\hook.exe");
        for ev in EVENTS { assert_eq!(ours(&v, ev), 1, "{ev}"); }
        assert_eq!(v["hooks"]["PreToolUse"][0]["matcher"], "*");
        assert!(v["hooks"]["Stop"][0].get("matcher").is_none());
        assert_eq!(v["hooks"]["Stop"][0]["hooks"][0]["command"], "\"C:\\a\\hook.exe\" --agent-pets");
    }

    #[test]
    fn install_is_idempotent_and_keeps_user_hooks() {
        let mut v = json!({"model": "opus", "hooks": {"Stop": [{"hooks": [{"type": "command", "command": "notify.exe"}]}]}});
        install(&mut v, "h.exe");
        install(&mut v, "h.exe");
        assert_eq!(ours(&v, "Stop"), 1);
        assert_eq!(v["model"], "opus");
        let all: Vec<String> = v["hooks"]["Stop"].as_array().unwrap().iter()
            .flat_map(|g| g["hooks"].as_array().unwrap().iter().map(|h| h["command"].as_str().unwrap().to_string())).collect();
        assert!(all.contains(&"notify.exe".to_string()));
    }

    #[test]
    fn uninstall_removes_only_ours_and_empty_containers() {
        let mut v = json!({"hooks": {"Stop": [{"hooks": [{"type": "command", "command": "notify.exe"}]}]}});
        install(&mut v, "h.exe");
        uninstall(&mut v);
        assert_eq!(v, json!({"hooks": {"Stop": [{"hooks": [{"type": "command", "command": "notify.exe"}]}]}}));
        let mut e = json!({});
        install(&mut e, "h.exe");
        uninstall(&mut e);
        assert_eq!(e, json!({}));
    }

    #[test]
    fn file_roundtrip_makes_backup() {
        let dir = tempfile::tempdir().unwrap();
        let p = dir.path().join("settings.json");
        std::fs::write(&p, r#"{"model":"opus"}"#).unwrap();
        install_file(&p, "h.exe").unwrap();
        assert!(dir.path().join("settings.json.agent-pets.bak").exists());
        let v: Value = serde_json::from_str(&std::fs::read_to_string(&p).unwrap()).unwrap();
        assert_eq!(ours(&v, "PreToolUse"), 1);
        uninstall_file(&p).unwrap();
        let v: Value = serde_json::from_str(&std::fs::read_to_string(&p).unwrap()).unwrap();
        assert_eq!(v, json!({"model": "opus"}));
        let missing = dir.path().join("none.json");
        install_file(&missing, "h.exe").unwrap();
        assert!(missing.exists());
    }

    #[test]
    fn broken_settings_file_is_left_untouched() {
        let dir = tempfile::tempdir().unwrap();
        let p = dir.path().join("settings.json");
        std::fs::write(&p, "{broken").unwrap();
        assert!(install_file(&p, "h.exe").is_err());
        assert_eq!(std::fs::read_to_string(&p).unwrap(), "{broken");
    }
}
