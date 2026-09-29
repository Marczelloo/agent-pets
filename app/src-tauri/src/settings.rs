//! App settings: state loaded from `~/.agent-pets/settings.json`, commands for the settings window
//! and wizard, a single settings window, and `hook.exe` selection for Claude Code hook installation.
use pets_core::i18n::{self, Lang};
use pets_core::integrations::{self, AppId, Detected, Status};
use pets_core::settings::{self as core_settings, Settings};
use serde::Serialize;
use std::collections::BTreeMap;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, RwLock};
use tauri::{AppHandle, Emitter, Manager, WebviewUrl, WebviewWindowBuilder};

pub struct SettingsState {
    pub home: PathBuf,
    pub path: PathBuf,
    pub current: RwLock<Settings>,
    pub first_run: Mutex<bool>,
    pub load_error: Mutex<Option<String>>,
}

impl SettingsState {
    pub fn load(home: PathBuf) -> SettingsState {
        let path = core_settings::path(&home);
        let l = core_settings::load(&path);
        SettingsState { home, path, current: RwLock::new(l.settings), first_run: Mutex::new(l.first_run), load_error: Mutex::new(l.error) }
    }
    pub fn get(&self) -> Settings { self.current.read().unwrap().clone() }
    /// Language of Rust-provided text: the setting or Windows language.
    pub fn lang(&self) -> Lang { i18n::current(self.get().language) }
    /// View for the UI; `system` is the Windows language (UI uses it to resolve `auto` after later changes).
    pub fn view(&self, system: Lang) -> SettingsView {
        let settings = self.get();
        let lang = i18n::resolve(settings.language, system == Lang::Pl);
        SettingsView { settings, first_run: *self.first_run.lock().unwrap(), load_error: self.load_error.lock().unwrap().clone(), lang, system_lang: system }
    }
}

pub fn home() -> PathBuf { std::env::var_os("USERPROFILE").map(PathBuf::from).unwrap_or_else(std::env::temp_dir) }

#[derive(Serialize, Clone, Debug)]
pub struct SettingsView { pub settings: Settings, pub first_run: bool, pub load_error: Option<String>, pub lang: Lang, pub system_lang: Lang }

#[derive(Serialize, Clone, Debug)]
pub struct AppRow { pub id: AppId, pub detected: Detected, pub status: Status, pub enabled: bool }

/// Report for the Diagnostics tab. No tokens, content, or session titles.
#[derive(Serialize, Clone, Debug, Default)]
pub struct Diagnostics {
    pub version: String,
    pub endpoint_port: Option<u16>,
    pub settings_path: String,
    pub settings_error: Option<String>,
    pub hook_exe: Option<String>,
    /// Whether the startup entry is actually in the registry.
    pub autostart_registered: bool,
    pub last_seen: BTreeMap<String, i64>,
    pub apps: Vec<(AppId, bool, String)>,
    /// Statistics scan state (without project names or paths).
    pub stats_files: usize,
    pub stats_scanned_bytes: u64,
    pub stats_total_bytes: u64,
}

/// Time of the latest event from each source, updated by the core (`core::live`).
#[derive(Default)]
pub struct LastSeen(pub Mutex<BTreeMap<String, i64>>);

fn app_on(s: &Settings, id: AppId) -> bool {
    match id {
        AppId::ClaudeCode => s.apps.claude_code,
        AppId::Codex => s.apps.codex,
        AppId::AgentRouter => s.apps.agent_router,
        AppId::Opencode => s.apps.opencode,
        AppId::Copilot => s.apps.copilot,
        AppId::Antigravity => s.apps.antigravity,
        AppId::Cursor => s.apps.cursor,
        AppId::Grok => s.apps.grok,
        AppId::Zcode => s.apps.zcode,
    }
}

fn set_app(s: &mut Settings, id: AppId, on: bool) {
    match id {
        AppId::ClaudeCode => s.apps.claude_code = on,
        AppId::Codex => s.apps.codex = on,
        AppId::AgentRouter => s.apps.agent_router = on,
        AppId::Opencode => s.apps.opencode = on,
        AppId::Copilot => s.apps.copilot = on,
        AppId::Antigravity => s.apps.antigravity = on,
        AppId::Cursor => s.apps.cursor = on,
        AppId::Grok => s.apps.grok = on,
        AppId::Zcode => s.apps.zcode = on,
    }
}

/// First existing `hook.exe` candidate: installed resources, program directory, release build next to debug.
pub fn pick_hook(candidates: &[PathBuf]) -> Option<PathBuf> { candidates.iter().find(|p| p.is_file()).cloned() }

pub fn hook_candidates(app: &AppHandle) -> Vec<PathBuf> {
    let mut out = Vec::new();
    if let Ok(r) = app.path().resource_dir() { out.push(r.join("resources").join("hook.exe")); out.push(r.join("hook.exe")); }
    if let Some(dir) = std::env::current_exe().ok().and_then(|e| e.parent().map(Path::to_path_buf)) {
        out.push(dir.join("hook.exe"));
        // `target/debug/agent-pets.exe` in development builds; hook built in release mode
        if let Some(target) = dir.parent() { out.push(target.join("release").join("hook.exe")); }
    }
    out
}

/// Save and broadcast settings; `apply_effects` attaches effects (core, notifications, startup).
fn store(app: &AppHandle, new: Settings) -> Result<(), String> {
    let st = app.state::<SettingsState>();
    core_settings::save(&st.path, &new).map_err(|e| format!("{} {}: {e}", i18n::tr(st.lang(), "Nie udało się zapisać", "Could not save"), st.path.display()))?;
    let old = std::mem::replace(&mut *st.current.write().unwrap(), new.clone());
    *st.load_error.lock().unwrap() = None;
    crate::apply_effects(app, &old, &new);
    let _ = app.emit("pets://settings", &new);
    Ok(())
}

/// Settings change from Rust (e.g. position after moving the stage): save, broadcast, and apply effects as from the window.
pub fn update(app: &AppHandle, f: impl FnOnce(&mut Settings)) -> Result<(), String> {
    let mut s = app.state::<SettingsState>().get();
    f(&mut s);
    store(app, s)
}

/// Settings from the window, excluding the app list (only integrations change it, to preserve installed hooks).
/// Exception: the open gate has no installation, so its toggle comes from the window.
pub fn merge_user_settings(current: &Settings, incoming: Settings) -> Settings {
    let apps = core_settings::Apps { generic: incoming.apps.generic, ..current.apps };
    Settings { apps, ..incoming }
}

#[tauri::command]
pub fn settings_get(state: tauri::State<SettingsState>) -> SettingsView {
    state.view(i18n::system())
}

#[tauri::command]
pub fn settings_set(app: AppHandle, settings: Settings) -> Result<(), String> {
    let merged = merge_user_settings(&app.state::<SettingsState>().get(), settings);
    store(&app, merged)
}

#[tauri::command]
pub fn integrations_list(state: tauri::State<SettingsState>) -> Vec<AppRow> {
    let (s, lang) = (state.get(), state.lang());
    AppId::ALL.iter().map(|id| AppRow {
        id: *id, detected: integrations::detect(*id, &state.home, lang), status: integrations::status(*id, &state.home, lang), enabled: app_on(&s, *id),
    }).collect()
}

fn switch(app: &AppHandle, s: &mut Settings, id: AppId, on: bool) -> Result<String, String> {
    let home = app.state::<SettingsState>().home.clone();
    let lang = i18n::current(s.language);
    let msg = if on { integrations::enable(id, &home, pick_hook(&hook_candidates(app)).as_deref(), lang)? } else { integrations::disable(id, &home, lang)? };
    set_app(s, id, on);
    Ok(msg)
}

#[tauri::command]
pub fn integration_set(app: AppHandle, id: AppId, on: bool) -> Result<String, String> {
    let mut s = app.state::<SettingsState>().get();
    let msg = switch(&app, &mut s, id, on)?;
    store(&app, s)?;
    Ok(msg)
}

/// Finish the wizard: save settings and enable or disable integrations. Return messages for the result screen.
#[tauri::command]
pub fn wizard_finish(app: AppHandle, settings: Settings) -> Vec<String> {
    let mut s = settings;
    let mut out = Vec::new();
    for id in AppId::ALL {
        let on = app_on(&s, id);
        match switch(&app, &mut s, id, on) {
            Ok(m) => out.push(m),
            Err(e) => { set_app(&mut s, id, false); out.push(e); }
        }
    }
    let autostart = s.autostart;
    match store(&app, s) {
        Ok(()) => { *app.state::<SettingsState>().first_run.lock().unwrap() = false; }
        Err(e) => out.push(e),
    }
    crate::sync_autostart(autostart);
    out
}

#[tauri::command]
pub fn diagnostics(app: AppHandle) -> Diagnostics {
    let st = app.state::<SettingsState>();
    let (s, lang) = (st.get(), st.lang());
    let settings_error = st.load_error.lock().unwrap().clone();
    let last_seen = app.state::<LastSeen>().0.lock().unwrap().clone();
    Diagnostics {
        version: app.package_info().version.to_string(),
        endpoint_port: pets_core::endpoint::Endpoint::read(&pets_core::endpoint::Endpoint::default_path()).ok().map(|e| e.port),
        settings_path: st.path.to_string_lossy().into_owned(),
        settings_error,
        hook_exe: Some(integrations::installed_hook(&st.home)).filter(|p| p.is_file()).map(|p| p.to_string_lossy().into_owned()),
        last_seen,
        autostart_registered: crate::system::autostart_at(crate::system::RUN_KEY),
        apps: AppId::ALL.iter().map(|id| (*id, app_on(&s, *id), integrations::status(*id, &st.home, lang).detail)).collect(),
        stats_files: app.try_state::<crate::stats::StatsState>().and_then(|x| x.scanner.try_lock().ok().map(|s| s.book.files.len())).unwrap_or(0),
        stats_scanned_bytes: app.try_state::<crate::stats::StatsState>().map(|x| x.progress.lock().unwrap().scanned).unwrap_or(0),
        stats_total_bytes: app.try_state::<crate::stats::StatsState>().map(|x| x.progress.lock().unwrap().total).unwrap_or(0),
    }
}

/// Settings window title (title bar, taskbar button, Alt+Tab).
pub fn window_title(lang: Lang) -> &'static str { i18n::tr(lang, "Agent Pets: ustawienia", "Agent Pets: settings") }

/// Window size: natural (all content without scrolling), but no larger than the screen work area minus a margin.
pub fn fit_size(desired: (f64, f64), work: Option<(f64, f64)>) -> (f64, f64) {
    const MARGIN: f64 = 32.0;
    match work {
        Some((w, h)) => (desired.0.min(w - MARGIN), desired.1.min(h - MARGIN)),
        None => desired,
    }
}

/// Primary monitor work area in logical pixels (excluding the taskbar).
pub fn work_area(app: &AppHandle) -> Option<(f64, f64)> {
    let m = app.primary_monitor().ok().flatten()?;
    let (s, a) = (m.scale_factor(), m.work_area());
    Some((a.size.width as f64 / s, a.size.height as f64 / s))
}

/// Settings window: 1100×920 fits "Appearance" (7 styles in a row, music toggle) and most tabs without scrolling.
pub const WINDOW: (f64, f64) = (1100.0, 920.0);

/// Open the settings window (or wizard on first launch); subsequent calls only show it.
pub fn open(app: &AppHandle) { open_at(app, None) }

/// Settings window on a specified tab (e.g. "stage" from the stage menu).
pub fn open_tab(app: &AppHandle, tab: &str) { open_at(app, Some(tab)) }

fn open_at(app: &AppHandle, tab: Option<&str>) {
    if let Some(w) = app.get_webview_window("settings") {
        if let Some(t) = tab { let _ = app.emit_to("settings", "settings://tab", t); }
        let _ = w.unminimize();
        let _ = w.show();
        let _ = w.set_focus();
        return;
    }
    // Building the window in a synchronous command or event handler (tray, second instance) deadlocks
    // on Windows (WebviewWindowBuilder documentation), so build it on a separate thread.
    let app = app.clone();
    let tab = tab.map(str::to_string);
    std::thread::spawn(move || {
        let url = tab.map(|t| format!("settings.html#{t}")).unwrap_or_else(|| "settings.html".into());
        let (w, h) = fit_size(WINDOW, work_area(&app));
        let _ = WebviewWindowBuilder::new(&app, "settings", WebviewUrl::App(url.into()))
            .title(window_title(app.state::<SettingsState>().lang())).inner_size(w, h).min_inner_size(620.0, 460.0).center().build();
    });
}

#[tauri::command]
pub fn settings_open(app: AppHandle) { crate::panel::hide(&app); open(&app); }

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_view_reports_the_windows_language_not_the_resolved_one() {
        let d = tempfile::tempdir().unwrap();
        let p = core_settings::path(d.path());
        let mut s = Settings::default();
        s.language = pets_core::settings::Language::En;
        core_settings::save(&p, &s).unwrap();
        let v = SettingsState::load(d.path().to_path_buf()).view(Lang::Pl);
        assert_eq!((v.lang, v.system_lang), (Lang::En, Lang::Pl));
    }

    #[test]
    fn the_window_title_follows_the_language() {
        assert_eq!(window_title(Lang::En), "Agent Pets: settings");
        assert_eq!(window_title(Lang::Pl), "Agent Pets: ustawienia");
    }

    #[test]
    fn settings_from_the_window_never_change_the_apps() {
        // only integration_set / wizard_finish change apps; the UI may have a stale list
        let mut current = Settings::default();
        current.apps.claude_code = false;
        let mut incoming = Settings::default();
        incoming.autostart = false;
        let merged = merge_user_settings(&current, incoming);
        assert!(!merged.apps.claude_code);
        assert!(!merged.autostart);
    }

    #[test]
    fn the_door_switch_from_the_window_is_kept() {
        // the open gate has no installation: its window toggle is the only way to close it
        let mut current = Settings::default();
        current.apps.claude_code = false;
        let mut incoming = Settings::default();
        incoming.apps.generic = false;
        let merged = merge_user_settings(&current, incoming);
        assert!(!merged.apps.generic, "gate closed");
        assert!(!merged.apps.claude_code, "other apps unchanged");
    }

    #[test]
    fn hook_comes_from_the_first_place_that_has_it() {
        let d = tempfile::tempdir().unwrap();
        let (a, b, c) = (d.path().join("a").join("hook.exe"), d.path().join("b.exe"), d.path().join("c.exe"));
        std::fs::write(&b, b"x").unwrap();
        std::fs::write(&c, b"y").unwrap();
        assert_eq!(pick_hook(&[a.clone(), b.clone(), c]), Some(b));
        assert_eq!(pick_hook(&[a]), None);
    }

    #[test]
    fn windows_open_at_their_natural_size_but_never_larger_than_the_screen() {
        assert_eq!(fit_size((1100.0, 860.0), Some((2560.0, 1392.0))), (1100.0, 860.0));
        assert_eq!(fit_size((1100.0, 860.0), Some((1366.0, 728.0))), (1100.0, 696.0));
        assert_eq!(fit_size((1100.0, 860.0), Some((1024.0, 600.0))), (992.0, 568.0));
        assert_eq!(fit_size((800.0, 720.0), None), (800.0, 720.0));
    }

    #[test]
    fn diagnostics_carry_no_tokens_or_session_titles() {
        let v = serde_json::to_value(Diagnostics::default()).unwrap();
        let keys: Vec<&str> = v.as_object().unwrap().keys().map(String::as_str).collect();
        assert!(keys.iter().all(|k| !k.contains("token") && !k.contains("title")), "{keys:?}");
        assert!(keys.iter().all(|k| !k.contains("action") && !k.contains("question") && !k.contains("session")), "0.8: no action text {keys:?}");
        for k in ["stats_files", "stats_scanned_bytes", "stats_total_bytes"] { assert!(keys.contains(&k), "0.9: statistics scan state {keys:?}"); }
    }
}
