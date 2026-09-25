//! Ustawienia w aplikacji: stan wczytany z `~/.agent-pets/settings.json`, komendy dla okna ustawień
//! i kreatora, okno ustawień (jedno) oraz wybór `hook.exe` do instalacji hooków Claude Code.
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
    /// Język tekstów z Rusta: ustawienie albo język Windows.
    pub fn lang(&self) -> Lang { i18n::current(self.get().language) }
    /// Widok dla UI; `system` to język Windows (UI rozstrzyga nim `auto` po późniejszej zmianie ustawienia).
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

/// Raport dla zakładki Diagnostyka. Bez tokenów, treści i tytułów sesji.
#[derive(Serialize, Clone, Debug, Default)]
pub struct Diagnostics {
    pub version: String,
    pub endpoint_port: Option<u16>,
    pub settings_path: String,
    pub settings_error: Option<String>,
    pub hook_exe: Option<String>,
    /// czy wpis autostartu naprawdę jest w rejestrze
    pub autostart_registered: bool,
    pub last_seen: BTreeMap<String, i64>,
    pub apps: Vec<(AppId, bool, String)>,
}

/// Czas ostatniego zdarzenia z każdego źródła, uzupełniany przez rdzeń (`core::live`).
#[derive(Default)]
pub struct LastSeen(pub Mutex<BTreeMap<String, i64>>);

fn app_on(s: &Settings, id: AppId) -> bool {
    match id { AppId::ClaudeCode => s.apps.claude_code, AppId::Codex => s.apps.codex, AppId::AgentRouter => s.apps.agent_router }
}

fn set_app(s: &mut Settings, id: AppId, on: bool) {
    match id {
        AppId::ClaudeCode => s.apps.claude_code = on,
        AppId::Codex => s.apps.codex = on,
        AppId::AgentRouter => s.apps.agent_router = on,
    }
}

/// Pierwszy istniejący kandydat na `hook.exe`: zasoby instalacji, katalog programu, build release obok debug.
pub fn pick_hook(candidates: &[PathBuf]) -> Option<PathBuf> { candidates.iter().find(|p| p.is_file()).cloned() }

pub fn hook_candidates(app: &AppHandle) -> Vec<PathBuf> {
    let mut out = Vec::new();
    if let Ok(r) = app.path().resource_dir() { out.push(r.join("resources").join("hook.exe")); out.push(r.join("hook.exe")); }
    if let Some(dir) = std::env::current_exe().ok().and_then(|e| e.parent().map(Path::to_path_buf)) {
        out.push(dir.join("hook.exe"));
        // `target/debug/agent-pets.exe` w buildzie deweloperskim; hook budowany w release
        if let Some(target) = dir.parent() { out.push(target.join("release").join("hook.exe")); }
    }
    out
}

/// Zapisuje i rozsyła ustawienia; skutki (rdzeń, powiadomienia, autostart) podłącza `apply_effects`.
fn store(app: &AppHandle, new: Settings) -> Result<(), String> {
    let st = app.state::<SettingsState>();
    core_settings::save(&st.path, &new).map_err(|e| format!("{} {}: {e}", i18n::tr(st.lang(), "Nie udało się zapisać", "Could not save"), st.path.display()))?;
    let old = std::mem::replace(&mut *st.current.write().unwrap(), new.clone());
    *st.load_error.lock().unwrap() = None;
    crate::apply_effects(app, &old, &new);
    let _ = app.emit("pets://settings", &new);
    Ok(())
}

/// Ustawienia z okna, bez listy aplikacji (tę zmieniają tylko integracje, żeby nie cofnąć instalacji hooków).
pub fn merge_user_settings(current: &Settings, incoming: Settings) -> Settings { Settings { apps: current.apps, ..incoming } }

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

/// Koniec kreatora: zapis ustawień i włączenie albo wyłączenie integracji. Zwraca komunikaty dla ekranu wyniku.
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
    }
}

/// Tytuł okna ustawień (pasek tytułu, przycisk w pasku zadań, Alt+Tab).
pub fn window_title(lang: Lang) -> &'static str { i18n::tr(lang, "Agent Pets: ustawienia", "Agent Pets: settings") }

/// Otwiera okno ustawień (albo kreator przy pierwszym uruchomieniu); drugie wywołanie tylko je pokazuje.
pub fn open(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("settings") {
        let _ = w.unminimize();
        let _ = w.show();
        let _ = w.set_focus();
        return;
    }
    // Budowanie okna w synchronicznej komendzie albo w obsłudze zdarzenia (tray, druga instancja) zakleszcza się
    // na Windows (dokumentacja WebviewWindowBuilder), więc budujemy je w osobnym wątku.
    let app = app.clone();
    std::thread::spawn(move || {
        let _ = WebviewWindowBuilder::new(&app, "settings", WebviewUrl::App("settings.html".into()))
            .title(window_title(app.state::<SettingsState>().lang())).inner_size(760.0, 560.0).min_inner_size(620.0, 460.0).center().build();
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
        // aplikacje zmienia tylko integration_set / wizard_finish; UI mogło mieć nieaktualną listę
        let mut current = Settings::default();
        current.apps.claude_code = false;
        let mut incoming = Settings::default();
        incoming.autostart = false;
        let merged = merge_user_settings(&current, incoming);
        assert!(!merged.apps.claude_code);
        assert!(!merged.autostart);
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
    fn diagnostics_carry_no_tokens_or_session_titles() {
        let v = serde_json::to_value(Diagnostics::default()).unwrap();
        let keys: Vec<&str> = v.as_object().unwrap().keys().map(String::as_str).collect();
        assert!(keys.iter().all(|k| !k.contains("token") && !k.contains("title")), "{keys:?}");
    }
}
