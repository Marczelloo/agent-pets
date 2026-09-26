mod appstate;
mod core;
mod jump;
mod notify;
mod panel;
mod settings;
mod shell;
mod system;
mod tooltip;
mod tray;
mod updater;
mod usage;
mod version;

use tauri::{Manager, RunEvent};

#[tauri::command]
fn snapshot(state: tauri::State<core::Shared>) -> core::Snapshot {
    state.lock().unwrap().clone()
}

#[tauri::command]
fn stage_hello(app: tauri::AppHandle, shell: tauri::State<shell::Shell>, tip: tauri::State<tooltip::Tooltip>) {
    tip.hide(&app);
    shell.hello();
}

#[tauri::command]
fn stage_set_width(width: f64, shell: tauri::State<shell::Shell>) { shell.set_width(width); }

/// „Przesuń” (menu sceny, karta „Pasek”): scena w pasku da się przeciągnąć; Enter albo klik obok zapisuje, Esc cofa.
#[tauri::command]
fn stage_move(shell: tauri::State<shell::Shell>) { shell.start_move(); }

/// „Przejdź” do sesji. Rejestr Claude'a czytamy teraz, bo `hostSessionId` sesji desktopowej nie ma w migawce.
#[tauri::command]
fn jump(app: tauri::AppHandle, session_id: String) -> jump::JumpResult {
    let r = jump_to(&app, &session_id);
    if !r.needs_attention() { panel::hide(&app); }
    r
}

/// Wspólne dla komendy panelu i przycisku „Przejdź” w toaście.
pub fn jump_to(app: &tauri::AppHandle, session_id: &str) -> jump::JumpResult {
    let snap = app.state::<core::Shared>().lock().unwrap().clone();
    let lang = app.state::<settings::SettingsState>().lang();
    let Some(s) = snap.sessions.iter().find(|s| s.id == session_id) else {
        return jump::JumpResult { method: "none".into(), detail: pets_core::i18n::tr(lang, "Sesja już nie istnieje", "The session no longer exists").into() };
    };
    let reg = std::env::var_os("USERPROFILE").and_then(|h| jump::registry::find(std::path::Path::new(&h), session_id));
    jump::exec::run(&jump::plan(&jump::Target::from(s, reg.as_ref())), lang)
}

/// Wysyła polecenie ukrywania do wątku rdzenia i czeka (do 2 s) na listę ukrytych id.
fn ask_core(app: &tauri::AppHandle, make: impl FnOnce(std::sync::mpsc::Sender<Vec<String>>) -> core::CoreMsg) -> Vec<String> {
    let (tx, rx) = std::sync::mpsc::channel();
    if app.state::<core::Control>().0.lock().unwrap().send(make(tx)).is_err() { return Vec::new(); }
    rx.recv_timeout(std::time::Duration::from_secs(2)).unwrap_or_default()
}

/// Ukrywa sesje (✕ w panelu, „Usuń z paska”); wracają przy nowej aktywności.
#[tauri::command]
fn session_dismiss(app: tauri::AppHandle, ids: Vec<String>) -> Vec<String> { ask_core(&app, |tx| core::CoreMsg::Dismiss(ids, tx)) }

/// „Usuń nieaktywne”: ukrywa sesje bezczynne, gotowe, uśpione i zakończone.
#[tauri::command]
fn sessions_dismiss_inactive(app: tauri::AppHandle) -> Vec<String> { ask_core(&app, core::CoreMsg::DismissInactive) }

/// „Cofnij” po ukryciu.
#[tauri::command]
fn session_undismiss(app: tauri::AppHandle, ids: Vec<String>) {
    let _ = app.state::<core::Control>().0.lock().unwrap().send(core::CoreMsg::Undismiss(ids));
}

/// Skutki zmiany ustawień. Powiadomienia i zgoda na limity Anthropic są czytane na bieżąco w swoich wątkach.
pub fn apply_effects(app: &tauri::AppHandle, old: &pets_core::settings::Settings, new: &pets_core::settings::Settings) {
    if old.apps != new.apps { let _ = app.state::<core::Control>().0.lock().unwrap().send(core::CoreMsg::Apps(new.apps)); }
    if old.autostart != new.autostart { sync_autostart(new.autostart); }
    if old.stage != new.stage { app.state::<shell::Shell>().settings_changed(); }
    if old.power_saving != new.power_saving { system::refresh_power(app); }
    if old.language != new.language {
        let lang = pets_core::i18n::current(new.language);
        tray::relabel(app, lang);
        if let Some(w) = app.get_webview_window("settings") { let _ = w.set_title(settings::window_title(lang)); }
    }
}

/// Wpis autostartu zgodny z ustawieniem (porównanie z rejestrem, nie z poprzednimi ustawieniami).
/// Build deweloperski nie rejestruje się (wskazywałby `target\debug`).
pub fn sync_autostart(on: bool) {
    if cfg!(debug_assertions) { return; }
    if let Some(v) = system::autostart_action(on, system::autostart_at(system::RUN_KEY)) { let _ = system::set_autostart(v); }
}

/// Przy starcie: włączony Claude Code bez hooków albo ze starym `hook.exe` (aktualizacja) dostaje je ponownie.
fn repair_integrations(app: &tauri::AppHandle) {
    let st = app.state::<settings::SettingsState>();
    if !st.get().apps.claude_code { return; }
    let src = settings::pick_hook(&settings::hook_candidates(app));
    if pets_core::integrations::claude_needs_repair(&st.home, src.as_deref()) {
        let _ = pets_core::integrations::enable(pets_core::integrations::AppId::ClaudeCode, &st.home, src.as_deref(), st.lang());
    }
}

/// `agent-pets.exe --uninstall-integrations [--remove-data]` (deinstalator NSIS): sprząta i kończy bez okien.
pub fn uninstall_cli(args: &[String]) -> Option<i32> {
    if !args.iter().any(|a| a == "--uninstall-integrations") { return None; }
    let remove_data = args.iter().any(|a| a == "--remove-data");
    let home = settings::home();
    let lang = pets_core::i18n::current(pets_core::settings::load(&pets_core::settings::path(&home)).settings.language);
    for step in pets_core::integrations::uninstall_all(&home, remove_data, lang) { println!("{step}"); }
    let _ = system::set_autostart(false);
    system::remove_aumid();
    Some(0)
}

pub fn run() {
    tauri::Builder::default()
        // musi być pierwszą wtyczką: drugie uruchomienie nie startuje drugiego rdzenia, tylko otwiera ustawienia
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| settings::open(app)))
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(|app| {
            let prefs = settings::SettingsState::load(settings::home());
            let first_run = *prefs.first_run.lock().unwrap();
            app.manage(prefs);
            app.manage(settings::LastSeen::default());
            let shared: core::Shared = Default::default();
            app.manage(shared.clone());
            app.manage(shell::Shell::start(app.handle())?);
            app.manage(tooltip::Tooltip::default());
            tooltip::build(app.handle())?;
            app.manage(panel::Panel::default());
            panel::build(app.handle())?;
            tray::build(app.handle(), app.state::<settings::SettingsState>().lang())?;
            let snaps = notify::start(app.handle().clone());
            let (core_tx, core_rx) = std::sync::mpsc::channel();
            app.manage(core::Control(std::sync::Mutex::new(core_tx)));
            core::spawn(app.handle().clone(), shared, core::Mode::from_env(), Some(snaps), core_rx);
            app.manage(system::Power::default());
            system::watch_power(app.handle().clone());
            app.manage(updater::Updater::default());
            updater::start(app.handle().clone());
            if !first_run {
                sync_autostart(app.state::<settings::SettingsState>().get().autostart);
                repair_integrations(app.handle());
            }
            if first_run { settings::open(app.handle()); }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            snapshot, stage_hello, stage_set_width, stage_move, jump, panel::panel_open, panel::panel_hide,
            tooltip::tooltip_show, tooltip::tooltip_size, tooltip::tooltip_hide,
            settings::settings_get, settings::settings_set, settings::integrations_list, settings::integration_set,
            settings::wizard_finish, settings::diagnostics, settings::settings_open, system::power_get,
            updater::update_status, updater::update_check, updater::update_install,
            session_dismiss, sessions_dismiss_inactive, session_undismiss
        ])
        .build(tauri::generate_context!())
        .expect("nie udało się zbudować aplikacji Tauri")
        .run(|_app, event| {
            // Okno sceny ginie razem z paskiem przy restarcie Explorera; aplikacja ma wtedy żyć dalej.
            if let RunEvent::ExitRequested { api, code, .. } = event {
                if code.is_none() { api.prevent_exit(); }
            }
        });
}
