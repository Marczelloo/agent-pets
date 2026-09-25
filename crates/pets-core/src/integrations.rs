//! Aplikacje, dla których są zwierzaki: wykrycie, stan, włączenie, wyłączenie i pełne odinstalowanie.
//! Nowy program w przyszłości to nowy wariant `AppId` plus adapter w rdzeniu.
use crate::i18n::{tr, Lang};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum AppId { ClaudeCode, Codex, AgentRouter }

impl AppId {
    pub const ALL: [AppId; 3] = [AppId::ClaudeCode, AppId::Codex, AppId::AgentRouter];
}

#[derive(Serialize, Clone, Debug, PartialEq)]
pub struct Detected { pub found: bool, pub path: Option<String>, pub note: Option<String> }

#[derive(Serialize, Clone, Debug, PartialEq)]
pub struct Status { pub installed: bool, pub detail: String }

pub fn claude_settings(home: &Path) -> PathBuf { home.join(".claude").join("settings.json") }
pub fn pets_dir(home: &Path) -> PathBuf { home.join(".agent-pets") }
pub fn installed_hook(home: &Path) -> PathBuf { pets_dir(home).join("hook.exe") }
fn statusline_original(home: &Path) -> PathBuf { pets_dir(home).join("statusline-original.json") }

fn home_folder(id: AppId) -> &'static str {
    match id { AppId::ClaudeCode => ".claude", AppId::Codex => ".codex", AppId::AgentRouter => ".agent-router" }
}

/// Aplikację wykrywamy po jej katalogu w domu użytkownika: tworzy go przy pierwszym uruchomieniu.
pub fn detect(id: AppId, home: &Path, lang: Lang) -> Detected {
    let dir = home.join(home_folder(id));
    if dir.is_dir() {
        return Detected { found: true, path: Some(dir.to_string_lossy().into_owned()), note: None };
    }
    let note = match id {
        AppId::ClaudeCode => tr(lang, "Nie znaleziono ~/.claude. Uruchom Claude Code raz, potem włącz tutaj.",
            "~/.claude not found. Run Claude Code once, then turn it on here."),
        AppId::Codex => tr(lang, "Nie znaleziono ~/.codex. Uruchom Codex raz, potem włącz tutaj.",
            "~/.codex not found. Run Codex once, then turn it on here."),
        AppId::AgentRouter => tr(lang, "Nie znaleziono ~/.agent-router (serwer MCP Agent Router).",
            "~/.agent-router not found (Agent Router MCP server)."),
    };
    Detected { found: false, path: None, note: Some(note.into()) }
}

fn read_claude_settings(home: &Path, lang: Lang) -> Result<Option<serde_json::Value>, String> {
    match std::fs::read(claude_settings(home)) {
        Ok(b) => serde_json::from_slice(&b).map(Some)
            .map_err(|e| match lang {
                Lang::Pl => format!("{} jest uszkodzony ({e})", claude_settings(home).display()),
                Lang::En => format!("{} is damaged ({e})", claude_settings(home).display()),
            }),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

pub fn status(id: AppId, home: &Path, lang: Lang) -> Status {
    if id != AppId::ClaudeCode { return Status { installed: true, detail: tr(lang, "Nic do instalowania", "Nothing to install").into() }; }
    match read_claude_settings(home, lang) {
        Err(e) => Status { installed: false, detail: e },
        Ok(v) => match v.as_ref().map(crate::hooks_install::installed_count).unwrap_or(0) {
            9 => Status { installed: true, detail: tr(lang, "Hooki: zainstalowane", "Hooks: installed").into() },
            0 => Status { installed: false, detail: tr(lang, "Hooki: brak", "Hooks: missing").into() },
            n => Status { installed: false, detail: format!("{} ({n}/9)", tr(lang, "Hooki: niekompletne", "Hooks: incomplete")) },
        },
    }
}

/// Kopiuje `hook.exe` do `~/.agent-pets` tylko wtedy, gdy go brak albo zawartość się różni (np. nowa wersja).
fn place_hook(home: &Path, src: Option<&Path>, lang: Lang) -> Result<PathBuf, String> {
    let dst = installed_hook(home);
    if let Some(src) = src.filter(|s| s.is_file()) {
        let new = std::fs::read(src).map_err(|e| format!("{} {}: {e}", tr(lang, "Nie mogę odczytać", "Cannot read"), src.display()))?;
        if std::fs::read(&dst).ok().as_deref() != Some(new.as_slice()) {
            std::fs::create_dir_all(pets_dir(home)).map_err(|e| e.to_string())?;
            std::fs::write(&dst, new).map_err(|e| format!("{} {}: {e}", tr(lang, "Nie mogę zapisać", "Cannot write"), dst.display()))?;
        }
    }
    if dst.is_file() { Ok(dst) } else { Err(tr(lang, "Brak hook.exe w instalacji Agent Pets; zainstaluj aplikację ponownie.", "hook.exe is missing from the Agent Pets install; reinstall the app.").into()) }
}

pub fn enable(id: AppId, home: &Path, hook_src: Option<&Path>, lang: Lang) -> Result<String, String> {
    if id != AppId::ClaudeCode { return Ok(tr(lang, "Nic do instalowania", "Nothing to install").into()); }
    read_claude_settings(home, lang)?;
    let hook = place_hook(home, hook_src, lang)?;
    crate::hooks_install::install_file(&claude_settings(home), &hook.to_string_lossy())
        .map_err(|e| format!("{} {}: {e}", tr(lang, "Nie udało się zapisać hooków w", "Could not write the hooks to"), claude_settings(home).display()))?;
    Ok(tr(lang, "Hooki zainstalowane. Uruchom ponownie otwarte sesje Claude Code.", "Hooks installed. Restart open Claude Code sessions.").into())
}

pub fn disable(id: AppId, home: &Path, lang: Lang) -> Result<String, String> {
    let nothing = || Ok(tr(lang, "Nic do usunięcia", "Nothing to remove").into());
    if id != AppId::ClaudeCode { return nothing(); }
    let Some(v) = read_claude_settings(home, lang)? else { return nothing() };
    let settings = claude_settings(home);
    if crate::statusline_install::is_installed(&v) {
        crate::statusline_install::uninstall_file_at(&settings, &statusline_original(home)).map_err(|e| e.to_string())?;
        let _ = std::fs::remove_file(statusline_original(home));
    }
    crate::hooks_install::uninstall_file(&settings).map_err(|e| e.to_string())?;
    Ok(tr(lang, "Hooki usunięte z ustawień Claude Code (kopia: settings.json.agent-pets.bak).",
        "Hooks removed from Claude Code settings (backup: settings.json.agent-pets.bak).").into())
}

/// Czy trzeba ponownie włączyć Claude Code: hooki zniknęły (np. aktualizacja przez „odinstaluj, potem zainstaluj”)
/// albo `hook.exe` w `~/.agent-pets` różni się od tego z instalacji.
pub fn claude_needs_repair(home: &Path, hook_src: Option<&Path>) -> bool {
    if !status(AppId::ClaudeCode, home, Lang::En).installed { return true; }
    let Some(src) = hook_src.and_then(|p| std::fs::read(p).ok()) else { return false };
    std::fs::read(installed_hook(home)).ok().as_deref() != Some(src.as_slice())
}

/// Odinstalowanie: wyłącza wszystkie integracje i usuwa pliki widżetu; `settings.json` zostaje, chyba że `remove_data`.
pub fn uninstall_all(home: &Path, remove_data: bool, lang: Lang) -> Vec<String> {
    let mut steps: Vec<String> = AppId::ALL.iter().map(|id| match disable(*id, home, lang) {
        Ok(m) => format!("{id:?}: {m}"),
        Err(e) => format!("{id:?}: {}: {e}", tr(lang, "błąd", "error")),
    }).collect();
    for f in [installed_hook(home), pets_dir(home).join("endpoint.json")] {
        if std::fs::remove_file(&f).is_ok() { steps.push(format!("{} {}", tr(lang, "Usunięto", "Removed"), f.display())); }
    }
    if remove_data && std::fs::remove_dir_all(pets_dir(home)).is_ok() {
        steps.push(format!("{} {}", tr(lang, "Usunięto", "Removed"), pets_dir(home).display()));
    }
    steps
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::{json, Value};

    fn home() -> tempfile::TempDir { tempfile::tempdir().unwrap() }
    fn hook_src(dir: &Path) -> PathBuf {
        let p = dir.join("res").join("hook.exe");
        std::fs::create_dir_all(p.parent().unwrap()).unwrap();
        std::fs::write(&p, b"hook-binary-v1").unwrap();
        p
    }
    fn claude_json(h: &Path) -> Value { serde_json::from_slice(&std::fs::read(claude_settings(h)).unwrap()).unwrap() }
    fn our_hooks(v: &Value) -> usize {
        v["hooks"].as_object().map(|o| o.values().flat_map(|g| g.as_array().unwrap().iter())
            .flat_map(|g| g["hooks"].as_array().unwrap().iter())
            .filter(|h| h["command"].as_str().unwrap_or("").ends_with(" --agent-pets")).count()).unwrap_or(0)
    }

    #[test]
    fn detects_apps_by_their_home_folders() {
        let h = home();
        assert!(!detect(AppId::Codex, h.path(), Lang::Pl).found);
        std::fs::create_dir_all(h.path().join(".codex")).unwrap();
        std::fs::create_dir_all(h.path().join(".agent-router")).unwrap();
        let d = detect(AppId::Codex, h.path(), Lang::Pl);
        assert!(d.found && d.path.unwrap().ends_with(".codex"));
        assert!(detect(AppId::AgentRouter, h.path(), Lang::Pl).found);
        assert!(!detect(AppId::ClaudeCode, h.path(), Lang::Pl).found);
    }

    #[test]
    fn enabling_claude_twice_installs_one_set_of_hooks() {
        let h = home();
        std::fs::create_dir_all(h.path().join(".claude")).unwrap();
        let src = hook_src(h.path());
        assert!(!status(AppId::ClaudeCode, h.path(), Lang::Pl).installed);
        enable(AppId::ClaudeCode, h.path(), Some(&src), Lang::Pl).unwrap();
        let first = std::fs::metadata(installed_hook(h.path())).unwrap().modified().unwrap();
        std::thread::sleep(std::time::Duration::from_millis(20));
        enable(AppId::ClaudeCode, h.path(), Some(&src), Lang::Pl).unwrap();
        assert_eq!(our_hooks(&claude_json(h.path())), 9);
        assert_eq!(std::fs::metadata(installed_hook(h.path())).unwrap().modified().unwrap(), first, "ten sam hook.exe nie jest kopiowany ponownie");
        assert!(status(AppId::ClaudeCode, h.path(), Lang::Pl).installed);
    }

    #[test]
    fn enabling_claude_without_any_hook_binary_is_an_error() {
        let h = home();
        assert!(enable(AppId::ClaudeCode, h.path(), None, Lang::Pl).is_err());
        assert!(!claude_settings(h.path()).exists());
    }

    #[test]
    fn claude_needs_repair_when_hooks_vanished_or_the_hook_is_outdated() {
        // aktualizacja przez „odinstaluj, potem zainstaluj” zdejmuje hooki starym deinstalatorem
        let h = home();
        std::fs::create_dir_all(h.path().join(".claude")).unwrap();
        let src = hook_src(h.path());
        assert!(claude_needs_repair(h.path(), Some(&src)), "brak hooków");
        enable(AppId::ClaudeCode, h.path(), Some(&src), Lang::Pl).unwrap();
        assert!(!claude_needs_repair(h.path(), Some(&src)));
        assert!(!claude_needs_repair(h.path(), None), "bez zasobu nie ma z czym porównać");
        std::fs::write(&src, b"hook-binary-v2").unwrap();
        assert!(claude_needs_repair(h.path(), Some(&src)), "nowszy hook.exe w instalacji");
    }

    #[test]
    fn disabling_keeps_someone_elses_hooks() {
        let h = home();
        std::fs::create_dir_all(h.path().join(".claude")).unwrap();
        std::fs::write(claude_settings(h.path()), json!({"hooks": {"Stop": [{"hooks": [{"type": "command", "command": "other.exe"}]}]}}).to_string()).unwrap();
        enable(AppId::ClaudeCode, h.path(), Some(&hook_src(h.path())), Lang::Pl).unwrap();
        disable(AppId::ClaudeCode, h.path(), Lang::Pl).unwrap();
        let v = claude_json(h.path());
        assert_eq!(our_hooks(&v), 0);
        assert_eq!(v["hooks"]["Stop"][0]["hooks"][0]["command"], "other.exe");
    }

    #[test]
    fn a_broken_claude_settings_file_is_left_untouched() {
        let h = home();
        std::fs::create_dir_all(h.path().join(".claude")).unwrap();
        std::fs::write(claude_settings(h.path()), "{bad").unwrap();
        assert!(enable(AppId::ClaudeCode, h.path(), Some(&hook_src(h.path())), Lang::Pl).is_err());
        assert_eq!(std::fs::read_to_string(claude_settings(h.path())).unwrap(), "{bad");
    }

    #[test]
    fn uninstall_restores_the_statusline_and_removes_our_files() {
        let h = home();
        std::fs::create_dir_all(h.path().join(".claude")).unwrap();
        std::fs::write(claude_settings(h.path()), json!({"statusLine": {"type": "command", "command": "mine.exe"}}).to_string()).unwrap();
        enable(AppId::ClaudeCode, h.path(), Some(&hook_src(h.path())), Lang::Pl).unwrap();
        crate::statusline_install::install_file_at(&claude_settings(h.path()), "h.exe", &statusline_original(h.path())).unwrap();
        std::fs::write(pets_dir(h.path()).join("endpoint.json"), "{}").unwrap();
        std::fs::write(crate::settings::path(h.path()), "{}").unwrap();
        let steps = uninstall_all(h.path(), false, Lang::Pl);
        assert!(!steps.is_empty());
        let v = claude_json(h.path());
        assert_eq!((our_hooks(&v), v["statusLine"]["command"].as_str()), (0, Some("mine.exe")));
        assert!(!installed_hook(h.path()).exists() && !pets_dir(h.path()).join("endpoint.json").exists());
        assert!(crate::settings::path(h.path()).exists(), "ustawienia zostają bez usuwania danych");
        uninstall_all(h.path(), true, Lang::Pl);
        assert!(!pets_dir(h.path()).exists());
    }
    #[test]
    fn texts_follow_the_language() {
        let h = home();
        assert!(detect(AppId::Codex, h.path(), Lang::En).note.unwrap().starts_with("~/.codex not found"));
        assert_eq!(status(AppId::Codex, h.path(), Lang::En).detail, "Nothing to install");
        assert_eq!(status(AppId::ClaudeCode, h.path(), Lang::Pl).detail, "Hooki: brak");
        assert_eq!(disable(AppId::Codex, h.path(), Lang::En).unwrap(), "Nothing to remove");
    }
}
