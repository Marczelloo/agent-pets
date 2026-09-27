//! Aplikacje, dla których są zwierzaki: wykrycie, stan, włączenie, wyłączenie i pełne odinstalowanie.
//! Nowy program w przyszłości to nowy wariant `AppId` plus adapter w rdzeniu.
use crate::i18n::{tr, Lang};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum AppId { ClaudeCode, Codex, AgentRouter, Opencode, Copilot, Antigravity }

impl AppId {
    pub const ALL: [AppId; 6] = [AppId::ClaudeCode, AppId::Codex, AppId::AgentRouter, AppId::Opencode, AppId::Copilot, AppId::Antigravity];
}

#[derive(Serialize, Clone, Debug, PartialEq)]
pub struct Detected { pub found: bool, pub path: Option<String>, pub note: Option<String> }

#[derive(Serialize, Clone, Debug, PartialEq)]
pub struct Status { pub installed: bool, pub detail: String }

pub fn claude_settings(home: &Path) -> PathBuf { home.join(".claude").join("settings.json") }
pub fn pets_dir(home: &Path) -> PathBuf { home.join(".agent-pets") }
pub fn installed_hook(home: &Path) -> PathBuf { pets_dir(home).join("hook.exe") }
fn statusline_original(home: &Path) -> PathBuf { pets_dir(home).join("statusline-original.json") }

/// Pierwsza linia naszego pluginu: plik bez niej nie jest nasz i nie ruszamy go.
pub const PLUGIN_MARK: &str = "// agent-pets plugin v1";
pub const OPENCODE_PLUGIN: &str = include_str!("../assets/opencode-plugin.js");
fn opencode_dir(home: &Path) -> PathBuf { home.join(".config").join("opencode") }
/// opencode 1.18 wczytuje `{plugin,plugins}/*.{ts,js}` z katalogu konfiguracji (spike S1).
pub fn opencode_plugin(home: &Path) -> PathBuf { opencode_dir(home).join("plugins").join("agent-pets.js") }

enum PluginFile { Missing, Ours(String), Foreign }

fn plugin_file(home: &Path) -> PluginFile {
    match std::fs::read_to_string(opencode_plugin(home)) {
        Ok(t) if t.starts_with(PLUGIN_MARK) => PluginFile::Ours(t),
        Ok(_) => PluginFile::Foreign,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => PluginFile::Missing,
        // plik jest, ale nie da się go przeczytać (np. nie UTF-8): traktujemy jak cudzy
        Err(_) => PluginFile::Foreign,
    }
}

fn foreign_plugin(lang: Lang) -> String {
    tr(lang, "Plik agent-pets.js w plugins/ opencode nie jest nasz, nie nadpisuję.",
        "agent-pets.js in the opencode plugins/ folder is not ours; not overwriting it.").into()
}

fn enable_opencode(home: &Path, lang: Lang) -> Result<String, String> {
    if !opencode_dir(home).is_dir() { return Err(detect(AppId::Opencode, home, lang).note.unwrap_or_default()); }
    let f = opencode_plugin(home);
    match plugin_file(home) {
        PluginFile::Foreign => return Err(foreign_plugin(lang)),
        PluginFile::Ours(t) if t == OPENCODE_PLUGIN => {}
        _ => {
            let dir = f.parent().expect("plugins/");
            let err = |e: std::io::Error| format!("{} {}: {e}", tr(lang, "Nie mogę zapisać", "Cannot write"), f.display());
            std::fs::create_dir_all(dir).map_err(err)?;
            // zapis atomowy: opencode nigdy nie wczyta połowy pliku
            let tmp = dir.join(".agent-pets.js.tmp");
            std::fs::write(&tmp, OPENCODE_PLUGIN).map_err(err)?;
            std::fs::rename(&tmp, &f).map_err(|e| { let _ = std::fs::remove_file(&tmp); err(e) })?;
        }
    }
    Ok(tr(lang, "Plugin opencode zainstalowany. Uruchom ponownie otwarte sesje opencode.",
        "opencode plugin installed. Restart open opencode sessions.").into())
}

fn disable_opencode(home: &Path, lang: Lang) -> Result<String, String> {
    match plugin_file(home) {
        PluginFile::Ours(_) => {
            std::fs::remove_file(opencode_plugin(home)).map_err(|e| e.to_string())?;
            Ok(tr(lang, "Plugin opencode usunięty.", "opencode plugin removed.").into())
        }
        _ => Ok(tr(lang, "Nic do usunięcia", "Nothing to remove").into()),
    }
}

/// Komenda hooka dla cmd i bash: ukośniki (bash nie zjada `\`), cudzysłów przy każdym znaku spoza bezpiecznego
/// zestawu (spacja, apostrof, `&`, nawiasy…). Zwykła ścieżka zostaje bez cudzysłowu, więc działa też w PowerShellu.
pub fn hook_command(hook: &Path, agent: &str, event: &str) -> String {
    let p = hook.to_string_lossy().replace('\\', "/");
    let safe = p.chars().all(|c| c.is_ascii_alphanumeric() || matches!(c, '/' | '.' | ':' | '_' | '-'));
    let p = if safe { p } else { format!("\"{p}\"") };
    format!("{p} --agent {agent} --event {event}")
}

/// Komenda hooka dla PowerShella (klucz `powershell` Copilota): operator wywołania i apostrofy, `'` podwojony.
pub fn hook_command_ps(hook: &Path, agent: &str, event: &str) -> String {
    let p = hook.to_string_lossy().replace('\\', "/").replace('\'', "''");
    format!("& '{p}' --agent {agent} --event {event}")
}

/// Zdarzenia Copilota: PascalCase dla tych, które zna też VS Code, camelCase dla tych tylko z CLI (spec 0.11 §3.1).
pub const COPILOT_EVENTS: [&str; 11] = ["SessionStart", "UserPromptSubmit", "PreToolUse", "PostToolUse", "SubagentStart",
    "SubagentStop", "Stop", "sessionEnd", "notification", "errorOccurred", "postToolUseFailure"];
pub const ANTIGRAVITY_EVENTS: [&str; 4] = ["PreInvocation", "PreToolUse", "PostToolUse", "Stop"];
/// Klucz naszego hooka w `hooks.json` Antigravity.
const ANTIGRAVITY_KEY: &str = "agent-pets";

pub fn copilot_hooks(home: &Path) -> PathBuf { home.join(".copilot").join("hooks").join("agent-pets.json") }
pub fn antigravity_hooks(home: &Path) -> PathBuf { home.join(".gemini").join("config").join("hooks.json") }

/// Wszystkie komendy w drzewie JSON (pola `command` i `powershell`).
fn commands(v: &serde_json::Value, out: &mut Vec<String>) {
    match v {
        serde_json::Value::Object(o) => for (k, x) in o {
            match (k.as_str(), x.as_str()) {
                ("command" | "powershell", Some(c)) => out.push(c.to_string()),
                _ => commands(x, out),
            }
        },
        serde_json::Value::Array(a) => for x in a { commands(x, out) },
        _ => {}
    }
}

/// Czy to nasz wpis: ma komendy i każda to nasz `hook.exe` dla tego agenta.
fn ours(v: &serde_json::Value, agent: &str) -> bool {
    let mut c = Vec::new();
    commands(v, &mut c);
    let mark = format!("--agent {agent} --event ");
    !c.is_empty() && c.iter().all(|x| x.contains(&mark))
}

fn copilot_json(hook: &Path) -> serde_json::Value {
    let hooks: serde_json::Map<String, serde_json::Value> = COPILOT_EVENTS.iter().map(|ev| (ev.to_string(), serde_json::json!([{
        "type": "command", "command": hook_command(hook, "copilot", ev), "powershell": hook_command_ps(hook, "copilot", ev), "timeoutSec": 5,
    }]))).collect();
    serde_json::json!({ "version": 1, "hooks": hooks })
}

enum HookFile { Missing, Ours, Foreign }

fn copilot_file(home: &Path) -> HookFile {
    match std::fs::read(copilot_hooks(home)) {
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => HookFile::Missing,
        Ok(b) if serde_json::from_slice::<serde_json::Value>(&b).is_ok_and(|v| ours(&v, "copilot")) => HookFile::Ours,
        _ => HookFile::Foreign,
    }
}

fn foreign_copilot(lang: Lang) -> String {
    tr(lang, "Plik agent-pets.json w ~/.copilot/hooks nie jest nasz, nie nadpisuję.",
        "agent-pets.json in ~/.copilot/hooks is not ours; not overwriting it.").into()
}

fn enable_copilot(home: &Path, hook_src: Option<&Path>, lang: Lang) -> Result<String, String> {
    if !home.join(".copilot").is_dir() { return Err(detect(AppId::Copilot, home, lang).note.unwrap_or_default()); }
    if let HookFile::Foreign = copilot_file(home) { return Err(foreign_copilot(lang)); }
    let hook = place_hook(home, hook_src, lang)?;
    let f = copilot_hooks(home);
    let text = serde_json::to_string_pretty(&copilot_json(&hook)).map_err(|e| e.to_string())?;
    if std::fs::read_to_string(&f).ok().as_deref() != Some(text.as_str()) {
        let dir = f.parent().expect("hooks/");
        let err = |e: std::io::Error| format!("{} {}: {e}", tr(lang, "Nie mogę zapisać", "Cannot write"), f.display());
        std::fs::create_dir_all(dir).map_err(err)?;
        // zapis atomowy: Copilot nigdy nie wczyta połowy pliku
        let tmp = dir.join(".agent-pets.json.tmp");
        std::fs::write(&tmp, &text).map_err(err)?;
        std::fs::rename(&tmp, &f).map_err(|e| { let _ = std::fs::remove_file(&tmp); err(e) })?;
    }
    Ok(tr(lang, "Hooki Copilota zapisane. Uruchom ponownie otwarte sesje Copilota.",
        "Copilot hooks written. Restart open Copilot sessions.").into())
}

fn disable_copilot(home: &Path, lang: Lang) -> Result<String, String> {
    match copilot_file(home) {
        HookFile::Ours => {
            std::fs::remove_file(copilot_hooks(home)).map_err(|e| e.to_string())?;
            Ok(tr(lang, "Hooki Copilota usunięte.", "Copilot hooks removed.").into())
        }
        _ => Ok(tr(lang, "Nic do usunięcia", "Nothing to remove").into()),
    }
}

fn antigravity_entry(hook: &Path) -> serde_json::Value {
    let cmd = |ev: &str| serde_json::json!({"type": "command", "command": hook_command(hook, "antigravity", ev), "timeout": 5});
    let groups: serde_json::Map<String, serde_json::Value> = ANTIGRAVITY_EVENTS.iter().map(|ev| {
        let g = if ev.ends_with("ToolUse") { serde_json::json!({"matcher": "*", "hooks": [cmd(ev)]}) } else { serde_json::json!({"hooks": [cmd(ev)]}) };
        (ev.to_string(), serde_json::json!([g]))
    }).collect();
    serde_json::Value::Object(groups)
}

/// Plik hooków Antigravity: `None` = brak pliku; błąd = zły JSON, główny element nie jest obiektem albo nasz klucz jest cudzy.
fn read_antigravity(home: &Path, lang: Lang) -> Result<Option<serde_json::Value>, String> {
    let f = antigravity_hooks(home);
    let v: serde_json::Value = match std::fs::read(&f) {
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(e) => return Err(e.to_string()),
        Ok(b) => serde_json::from_slice(&b).map_err(|e| format!("{} {} ({e})", f.display(), tr(lang, "jest uszkodzony", "is damaged")))?,
    };
    if !v.is_object() {
        return Err(format!("{} {}", f.display(), tr(lang, "ma nieoczekiwany format, nie zmieniam go.", "has an unexpected format; not changing it.")));
    }
    if v.get(ANTIGRAVITY_KEY).is_some_and(|k| !ours(k, "antigravity")) {
        return Err(tr(lang, "Klucz agent-pets w ~/.gemini/config/hooks.json nie jest nasz, nie zmieniam go.",
            "The agent-pets key in ~/.gemini/config/hooks.json is not ours; not changing it.").into());
    }
    Ok(Some(v))
}

fn enable_antigravity(home: &Path, hook_src: Option<&Path>, lang: Lang) -> Result<String, String> {
    if !home.join(".gemini").is_dir() { return Err(detect(AppId::Antigravity, home, lang).note.unwrap_or_default()); }
    let current = read_antigravity(home, lang)?;
    let hook = place_hook(home, hook_src, lang)?;
    let entry = antigravity_entry(&hook);
    let ours_now = current.as_ref().and_then(|v| v.get(ANTIGRAVITY_KEY));
    let done = tr(lang, "Hooki Antigravity zapisane (kopia: hooks.json.agent-pets.bak). Potrzebna wersja Antigravity z hookami.",
        "Antigravity hooks written (backup: hooks.json.agent-pets.bak). Needs an Antigravity version with hooks.");
    // naprawa przy każdym starcie: bez zmian nic nie zapisujemy (plik użytkownika i kopia zostają nietknięte)
    if ours_now == Some(&entry) { return Ok(done.into()); }
    // kopia tylko pliku sprzed naszej pierwszej zmiany; zmiana naszego wpisu (np. nowa ścieżka) jej nie nadpisuje
    crate::hooks_install::edit_file_opts(&antigravity_hooks(home), ours_now.is_none(), |v| { v[ANTIGRAVITY_KEY] = entry; })
        .map_err(|e| format!("{} {}: {e}", tr(lang, "Nie udało się zapisać hooków w", "Could not write the hooks to"), antigravity_hooks(home).display()))?;
    Ok(done.into())
}

fn disable_antigravity(home: &Path, lang: Lang) -> Result<String, String> {
    let nothing = || Ok(tr(lang, "Nic do usunięcia", "Nothing to remove").into());
    let Some(v) = read_antigravity(home, lang)? else { return nothing() };
    if v.get(ANTIGRAVITY_KEY).is_none() { return nothing(); }
    let f = antigravity_hooks(home);
    let mut empty = false;
    // bez nowej kopii: kopia zostaje plikiem sprzed naszej pierwszej zmiany
    crate::hooks_install::edit_file_opts(&f, false, |v| {
        if let Some(o) = v.as_object_mut() { o.remove(ANTIGRAVITY_KEY); empty = o.is_empty(); }
    }).map_err(|e| e.to_string())?;
    // plik tylko z naszym kluczem: po wyłączeniu nic w nim nie zostało
    if empty { std::fs::remove_file(&f).map_err(|e| e.to_string())?; }
    Ok(tr(lang, "Hooki Antigravity usunięte.", "Antigravity hooks removed.").into())
}

fn home_folder(id: AppId) -> &'static str {
    match id {
        AppId::ClaudeCode => ".claude", AppId::Codex => ".codex", AppId::AgentRouter => ".agent-router",
        AppId::Opencode => ".config/opencode", AppId::Copilot => ".copilot", AppId::Antigravity => ".gemini",
    }
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
        AppId::Opencode => tr(lang, "Nie znaleziono ~/.config/opencode. Uruchom opencode raz, potem włącz tutaj.",
            "~/.config/opencode not found. Run opencode once, then turn it on here."),
        AppId::Copilot => tr(lang, "Nie znaleziono ~/.copilot. Uruchom Copilot raz, potem włącz tutaj.",
            "~/.copilot not found. Run Copilot once, then turn it on here."),
        AppId::Antigravity => tr(lang, "Nie znaleziono ~/.gemini. Uruchom Antigravity raz, potem włącz tutaj.",
            "~/.gemini not found. Run Antigravity once, then turn it on here."),
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
    let hooks = |installed: bool| Status { installed, detail: if installed { tr(lang, "Hooki: zainstalowane", "Hooks: installed") }
        else { tr(lang, "Hooki: brak", "Hooks: missing") }.into() };
    if id == AppId::Copilot {
        return match copilot_file(home) {
            HookFile::Ours => hooks(true),
            HookFile::Missing => hooks(false),
            HookFile::Foreign => Status { installed: false, detail: foreign_copilot(lang) },
        };
    }
    if id == AppId::Antigravity {
        return match read_antigravity(home, lang) {
            Ok(v) => hooks(v.is_some_and(|v| v.get(ANTIGRAVITY_KEY).is_some())),
            Err(e) => Status { installed: false, detail: e },
        };
    }
    if id == AppId::Opencode {
        return match plugin_file(home) {
            PluginFile::Ours(_) => Status { installed: true, detail: tr(lang, "Plugin: zainstalowany", "Plugin: installed").into() },
            PluginFile::Missing => Status { installed: false, detail: tr(lang, "Plugin: brak", "Plugin: missing").into() },
            PluginFile::Foreign => Status { installed: false, detail: foreign_plugin(lang) },
        };
    }
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
/// Też dla furtki: `hook.exe report` ma stałą ścieżkę `~/.agent-pets/hook.exe` (spec 8).
pub fn place_hook(home: &Path, src: Option<&Path>, lang: Lang) -> Result<PathBuf, String> {
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
    if id == AppId::Opencode { return enable_opencode(home, lang); }
    if id == AppId::Copilot { return enable_copilot(home, hook_src, lang); }
    if id == AppId::Antigravity { return enable_antigravity(home, hook_src, lang); }
    if id != AppId::ClaudeCode { return Ok(tr(lang, "Nic do instalowania", "Nothing to install").into()); }
    read_claude_settings(home, lang)?;
    let hook = place_hook(home, hook_src, lang)?;
    crate::hooks_install::install_file(&claude_settings(home), &hook.to_string_lossy())
        .map_err(|e| format!("{} {}: {e}", tr(lang, "Nie udało się zapisać hooków w", "Could not write the hooks to"), claude_settings(home).display()))?;
    Ok(tr(lang, "Hooki zainstalowane. Uruchom ponownie otwarte sesje Claude Code.", "Hooks installed. Restart open Claude Code sessions.").into())
}

pub fn disable(id: AppId, home: &Path, lang: Lang) -> Result<String, String> {
    let nothing = || Ok(tr(lang, "Nic do usunięcia", "Nothing to remove").into());
    if id == AppId::Opencode { return disable_opencode(home, lang); }
    if id == AppId::Copilot { return disable_copilot(home, lang); }
    if id == AppId::Antigravity { return disable_antigravity(home, lang); }
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

    fn oc(h: &Path) -> PathBuf { h.join(".config").join("opencode") }

    #[test]
    fn copilot_and_antigravity_are_detected_by_their_home_folders() {
        let h = home();
        for id in [AppId::Copilot, AppId::Antigravity] { assert!(!detect(id, h.path(), Lang::Pl).found); }
        assert!(detect(AppId::Copilot, h.path(), Lang::Pl).note.unwrap().contains("~/.copilot"));
        assert!(detect(AppId::Antigravity, h.path(), Lang::En).note.unwrap().contains("~/.gemini"));
        std::fs::create_dir_all(h.path().join(".copilot")).unwrap();
        std::fs::create_dir_all(h.path().join(".gemini")).unwrap();
        assert!(detect(AppId::Copilot, h.path(), Lang::Pl).found);
        assert!(detect(AppId::Antigravity, h.path(), Lang::Pl).found);
        assert_eq!(AppId::ALL.len(), 6);
    }

    #[test]
    fn opencode_is_detected_by_its_config_folder() {
        let h = home();
        let d = detect(AppId::Opencode, h.path(), Lang::Pl);
        assert!(!d.found && d.note.unwrap().contains("opencode"));
        std::fs::create_dir_all(oc(h.path())).unwrap();
        assert!(detect(AppId::Opencode, h.path(), Lang::Pl).found);
    }

    #[test]
    fn the_opencode_plugin_installs_once_and_uninstalls() {
        let h = home();
        std::fs::create_dir_all(oc(h.path())).unwrap();
        assert!(!status(AppId::Opencode, h.path(), Lang::Pl).installed);
        enable(AppId::Opencode, h.path(), None, Lang::Pl).unwrap();
        enable(AppId::Opencode, h.path(), None, Lang::Pl).unwrap();
        let f = opencode_plugin(h.path());
        assert_eq!(f, oc(h.path()).join("plugins").join("agent-pets.js"));
        assert!(std::fs::read_to_string(&f).unwrap().starts_with(PLUGIN_MARK));
        assert_eq!(std::fs::read_dir(f.parent().unwrap()).unwrap().count(), 1, "bez plików tymczasowych");
        assert!(status(AppId::Opencode, h.path(), Lang::Pl).installed);
        disable(AppId::Opencode, h.path(), Lang::Pl).unwrap();
        assert!(!f.exists());
        assert!(!status(AppId::Opencode, h.path(), Lang::Pl).installed);
    }

    #[test]
    fn hook_commands_work_in_cmd_bash_and_powershell_even_with_spaces_and_apostrophes() {
        let p = Path::new(r"C:\Users\ja\.agent-pets\hook.exe");
        assert_eq!(hook_command(p, "copilot", "Stop"), "C:/Users/ja/.agent-pets/hook.exe --agent copilot --event Stop");
        let sp = Path::new(r"C:\Users\Jan Kowalski\.agent-pets\hook.exe");
        assert_eq!(hook_command(sp, "antigravity", "PreToolUse"),
            r#""C:/Users/Jan Kowalski/.agent-pets/hook.exe" --agent antigravity --event PreToolUse"#);
        let ap = Path::new(r"C:\Users\O'Neil\.agent-pets\hook.exe");
        assert_eq!(hook_command(ap, "antigravity", "Stop"), r#""C:/Users/O'Neil/.agent-pets/hook.exe" --agent antigravity --event Stop"#);
        assert!(hook_command(Path::new(r"C:\Users\R&D\hook.exe"), "copilot", "Stop").starts_with('"'));
        assert_eq!(hook_command_ps(ap, "copilot", "Stop"), "& 'C:/Users/O''Neil/.agent-pets/hook.exe' --agent copilot --event Stop");
        assert_eq!(hook_command_ps(sp, "copilot", "Stop"), "& 'C:/Users/Jan Kowalski/.agent-pets/hook.exe' --agent copilot --event Stop");
    }

    fn copilot_json(h: &Path) -> Value { serde_json::from_slice(&std::fs::read(copilot_hooks(h)).unwrap()).unwrap() }

    #[test]
    fn the_copilot_hooks_file_installs_once_and_uninstalls() {
        let h = home();
        let src = hook_src(h.path());
        assert!(enable(AppId::Copilot, h.path(), Some(&src), Lang::Pl).is_err(), "bez ~/.copilot");
        std::fs::create_dir_all(h.path().join(".copilot")).unwrap();
        assert!(!status(AppId::Copilot, h.path(), Lang::Pl).installed);
        enable(AppId::Copilot, h.path(), Some(&src), Lang::Pl).unwrap();
        let first = std::fs::read(copilot_hooks(h.path())).unwrap();
        enable(AppId::Copilot, h.path(), Some(&src), Lang::Pl).unwrap();
        assert_eq!(std::fs::read(copilot_hooks(h.path())).unwrap(), first, "powtórne włączenie nic nie zmienia");
        assert_eq!(copilot_hooks(h.path()), h.path().join(".copilot").join("hooks").join("agent-pets.json"));
        let v = copilot_json(h.path());
        assert_eq!(v["version"], 1);
        let hooks = v["hooks"].as_object().unwrap();
        assert_eq!(hooks.len(), COPILOT_EVENTS.len());
        for ev in COPILOT_EVENTS {
            let entry = &hooks[ev][0];
            assert_eq!(entry["type"], "command");
            assert!(entry["command"].as_str().unwrap().ends_with(&format!("hook.exe --agent copilot --event {ev}")), "{entry}");
            assert!(entry["powershell"].as_str().unwrap().starts_with("& '"), "{entry}");
            assert_eq!(entry["timeoutSec"], 5);
        }
        assert!(installed_hook(h.path()).is_file(), "hook.exe na stałej ścieżce");
        assert_eq!(std::fs::read_dir(copilot_hooks(h.path()).parent().unwrap()).unwrap().count(), 1, "bez plików tymczasowych");
        assert!(status(AppId::Copilot, h.path(), Lang::Pl).installed);
        disable(AppId::Copilot, h.path(), Lang::Pl).unwrap();
        assert!(!copilot_hooks(h.path()).exists());
        assert!(!status(AppId::Copilot, h.path(), Lang::Pl).installed);
    }

    #[test]
    fn someone_elses_copilot_agent_pets_json_is_never_touched() {
        let h = home();
        let f = copilot_hooks(h.path());
        std::fs::create_dir_all(f.parent().unwrap()).unwrap();
        let theirs = r#"{"version":1,"hooks":{"Stop":[{"type":"command","command":"my-script.ps1"}]}}"#;
        std::fs::write(&f, theirs).unwrap();
        std::fs::write(f.with_file_name("audit.json"), "{}").unwrap();
        assert!(enable(AppId::Copilot, h.path(), Some(&hook_src(h.path())), Lang::Pl).is_err());
        disable(AppId::Copilot, h.path(), Lang::Pl).unwrap();
        uninstall_all(h.path(), false, Lang::Pl);
        assert_eq!(std::fs::read_to_string(&f).unwrap(), theirs);
        assert!(f.with_file_name("audit.json").exists(), "cudze pliki w hooks/ zostają");
        let st = status(AppId::Copilot, h.path(), Lang::Pl);
        assert!(!st.installed && st.detail.contains("nie jest nasz"), "{st:?}");
    }

    fn ag_json(h: &Path) -> Value { serde_json::from_slice(&std::fs::read(antigravity_hooks(h)).unwrap()).unwrap() }

    #[test]
    fn antigravity_hooks_join_someone_elses_hooks_and_leave_them_alone() {
        let h = home();
        let src = hook_src(h.path());
        assert!(enable(AppId::Antigravity, h.path(), Some(&src), Lang::Pl).is_err(), "bez ~/.gemini");
        let f = antigravity_hooks(h.path());
        std::fs::create_dir_all(f.parent().unwrap()).unwrap();
        let mine = json!({"PostToolUse": [{"matcher": "run_command", "hooks": [{"type": "command", "command": "./lint.sh", "timeout": 10}]}]});
        std::fs::write(&f, serde_json::to_string(&json!({"my-linter": mine})).unwrap()).unwrap();
        enable(AppId::Antigravity, h.path(), Some(&src), Lang::Pl).unwrap();
        let v = ag_json(h.path());
        assert_eq!(v["my-linter"], mine, "cudzy hook bez zmian");
        let ours = v["agent-pets"].as_object().unwrap();
        assert_eq!(ours.len(), ANTIGRAVITY_EVENTS.len());
        for ev in ANTIGRAVITY_EVENTS {
            let group = &ours[ev][0];
            let cmd = group["hooks"][0]["command"].as_str().unwrap();
            assert!(cmd.ends_with(&format!("hook.exe --agent antigravity --event {ev}")), "{cmd}");
            assert_eq!(group["hooks"][0]["timeout"], 5);
            assert_eq!(group.get("matcher").and_then(|m| m.as_str()), if ev.ends_with("ToolUse") { Some("*") } else { None }, "{ev}");
        }
        assert!(f.with_file_name("hooks.json.agent-pets.bak").exists(), "kopia przed zmianą");
        assert!(status(AppId::Antigravity, h.path(), Lang::Pl).installed);
        disable(AppId::Antigravity, h.path(), Lang::Pl).unwrap();
        assert_eq!(ag_json(h.path()), json!({"my-linter": mine}));
        assert!(!status(AppId::Antigravity, h.path(), Lang::Pl).installed);
    }

    #[test]
    fn a_repeated_antigravity_enable_leaves_the_file_and_the_first_backup_alone() {
        let h = home();
        let f = antigravity_hooks(h.path());
        std::fs::create_dir_all(f.parent().unwrap()).unwrap();
        let original = "{\n  \"zeta\": {},\n  \"my-linter\": {\"Stop\": [{\"hooks\": [{\"type\": \"command\", \"command\": \"./x.sh\"}]}]}\n}";
        std::fs::write(&f, original).unwrap();
        let bak = f.with_file_name("hooks.json.agent-pets.bak");
        enable(AppId::Antigravity, h.path(), Some(&hook_src(h.path())), Lang::Pl).unwrap();
        let (file, backup) = (std::fs::read(&f).unwrap(), std::fs::read(&bak).unwrap());
        assert_eq!(backup, original.as_bytes(), "kopia to plik sprzed naszej zmiany");
        // naprawa przy starcie aplikacji: nic się nie zmieniło, więc nic nie zapisujemy
        enable(AppId::Antigravity, h.path(), Some(&hook_src(h.path())), Lang::Pl).unwrap();
        assert_eq!((std::fs::read(&f).unwrap(), std::fs::read(&bak).unwrap()), (file.clone(), backup.clone()));
        // nowa ścieżka hook.exe (np. po aktualizacji): wpis się zmienia, ale kopia zostaje pierwotna
        let mut v: Value = serde_json::from_slice(&file).unwrap();
        v["agent-pets"]["Stop"][0]["hooks"][0]["command"] = json!("C:/old/hook.exe --agent antigravity --event Stop");
        std::fs::write(&f, serde_json::to_string(&v).unwrap()).unwrap();
        enable(AppId::Antigravity, h.path(), Some(&hook_src(h.path())), Lang::Pl).unwrap();
        assert_eq!(std::fs::read(&bak).unwrap(), original.as_bytes());
        assert!(ag_json(h.path())["agent-pets"]["Stop"][0]["hooks"][0]["command"].as_str().unwrap().contains(".agent-pets"));
    }

    #[test]
    fn antigravity_creates_its_config_folder_and_removes_a_file_left_empty() {
        let h = home();
        std::fs::create_dir_all(h.path().join(".gemini")).unwrap();
        enable(AppId::Antigravity, h.path(), Some(&hook_src(h.path())), Lang::Pl).unwrap();
        assert!(ag_json(h.path())["agent-pets"].is_object());
        disable(AppId::Antigravity, h.path(), Lang::Pl).unwrap();
        assert!(!antigravity_hooks(h.path()).exists(), "pusty plik po naszym kluczu znika");
        assert!(disable(AppId::Antigravity, h.path(), Lang::Pl).is_ok(), "brak pliku to nic do usunięcia");
    }

    #[test]
    fn a_broken_or_foreign_antigravity_file_is_left_as_it_is() {
        let h = home();
        let f = antigravity_hooks(h.path());
        std::fs::create_dir_all(f.parent().unwrap()).unwrap();
        let foreign = r#"{"agent-pets":{"Stop":[{"hooks":[{"type":"command","command":"their.sh"}]}]}}"#;
        for text in ["{nie json", "[]", foreign] {
            std::fs::write(&f, text).unwrap();
            assert!(enable(AppId::Antigravity, h.path(), Some(&hook_src(h.path())), Lang::Pl).is_err(), "{text}");
            let _ = disable(AppId::Antigravity, h.path(), Lang::Pl);
            uninstall_all(h.path(), false, Lang::Pl);
            assert_eq!(std::fs::read_to_string(&f).unwrap(), text, "{text}");
            assert!(!status(AppId::Antigravity, h.path(), Lang::Pl).installed, "{text}");
        }
    }

    #[test]
    fn uninstall_removes_copilot_and_antigravity_hooks() {
        let h = home();
        let src = hook_src(h.path());
        std::fs::create_dir_all(h.path().join(".copilot")).unwrap();
        std::fs::create_dir_all(h.path().join(".gemini")).unwrap();
        enable(AppId::Copilot, h.path(), Some(&src), Lang::Pl).unwrap();
        enable(AppId::Antigravity, h.path(), Some(&src), Lang::Pl).unwrap();
        uninstall_all(h.path(), false, Lang::Pl);
        assert!(!copilot_hooks(h.path()).exists() && !antigravity_hooks(h.path()).exists());
    }

    #[test]
    fn someone_elses_agent_pets_js_is_never_touched() {
        let h = home();
        let f = opencode_plugin(h.path());
        std::fs::create_dir_all(f.parent().unwrap()).unwrap();
        std::fs::write(&f, "export const Mine = 1").unwrap();
        assert!(enable(AppId::Opencode, h.path(), None, Lang::Pl).is_err());
        disable(AppId::Opencode, h.path(), Lang::Pl).unwrap();
        uninstall_all(h.path(), false, Lang::Pl);
        assert_eq!(std::fs::read_to_string(&f).unwrap(), "export const Mine = 1");
        assert!(!status(AppId::Opencode, h.path(), Lang::Pl).installed);
    }

    #[test]
    fn uninstall_removes_the_opencode_plugin() {
        let h = home();
        assert!(enable(AppId::Opencode, h.path(), None, Lang::Pl).is_err(), "bez opencode nie tworzymy jego konfiguracji");
        assert!(!oc(h.path()).exists());
        std::fs::create_dir_all(oc(h.path())).unwrap();
        enable(AppId::Opencode, h.path(), None, Lang::Pl).unwrap();
        uninstall_all(h.path(), false, Lang::Pl);
        assert!(!opencode_plugin(h.path()).exists());
    }

    #[test]
    fn the_plugin_times_out_and_sends_no_message_content() {
        assert!(OPENCODE_PLUGIN.starts_with(PLUGIN_MARK));
        assert!(OPENCODE_PLUGIN.contains("AbortSignal.timeout(300)"));
        assert!(!OPENCODE_PLUGIN.contains("parts"), "treść wiadomości nie trafia do koperty");
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
