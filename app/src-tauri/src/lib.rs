mod appstate;
mod bubbles;
mod core;
mod jump;
mod media;
mod notify;
mod panel;
mod settings;
mod shell;
mod stats;
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

/// Ostatni układ sceny (tryb, notka o ikonach po lewej) dla okna ustawień otwartego później.
#[tauri::command]
fn stage_layout(shell: tauri::State<shell::Shell>) -> Option<shell::Layout> { shell.layout() }

/// Monitory do wyboru w karcie „Pasek”.
#[tauri::command]
fn monitors_list() -> Vec<shell::placement::MonitorInfo> { shell::monitors() }

/// Okno pływające: kursor nad pustym miejscem przepuszcza kliknięcia do okien pod spodem.
#[tauri::command]
fn stage_passthrough(on: bool, shell: tauri::State<shell::Shell>) { shell.passthrough(on); }

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
    let tx = app.state::<core::Control>().0.lock().unwrap().clone();
    core::ask(&tx, make)
}

pub fn dismiss(app: &tauri::AppHandle, ids: Vec<String>) -> Vec<String> { ask_core(app, |tx| core::CoreMsg::Dismiss(ids, tx)) }
pub fn dismiss_inactive(app: &tauri::AppHandle) -> Vec<String> { ask_core(app, core::CoreMsg::DismissInactive) }

/// Ukrywa sesje (✕ w panelu, „Usuń z paska”); wracają przy nowej aktywności.
/// `async`: czeka na obrót rdzenia (do 250 ms), więc nie na wątku głównym.
#[tauri::command(async)]
fn session_dismiss(app: tauri::AppHandle, ids: Vec<String>) -> Vec<String> { dismiss(&app, ids) }

/// „Usuń nieaktywne”: ukrywa sesje bezczynne, gotowe, uśpione i zakończone.
#[tauri::command(async)]
fn sessions_dismiss_inactive(app: tauri::AppHandle) -> Vec<String> { dismiss_inactive(&app) }

/// Prawy klik na scenie: `target` to id zwierzaka albo nic (plakietka, limity, puste tło).
#[tauri::command]
fn stage_menu(app: tauri::AppHandle, target: Option<String>, x: f64, y: f64) {
    let t = target.map(shell::menu::Target::Pet).unwrap_or(shell::menu::Target::Other);
    if let Err(e) = shell::menu::show(&app, t, x, y) { eprintln!("agent-pets: menu sceny: {e}"); }
}

/// „Cofnij” po ukryciu.
#[tauri::command]
fn session_undismiss(app: tauri::AppHandle, ids: Vec<String>) {
    let _ = app.state::<core::Control>().0.lock().unwrap().send(core::CoreMsg::Undismiss(ids));
}

/// Skutki zmiany ustawień. Powiadomienia i zgoda na limity Anthropic są czytane na bieżąco w swoich wątkach.
pub fn apply_effects(app: &tauri::AppHandle, old: &pets_core::settings::Settings, new: &pets_core::settings::Settings) {
    if old.apps != new.apps { let _ = app.state::<core::Control>().0.lock().unwrap().send(core::CoreMsg::Apps(new.apps)); }
    // otwarta furtka: `hook.exe report` pod stałą ścieżką `~/.agent-pets/hook.exe` (spec 8)
    if new.apps.generic && !old.apps.generic {
        let st = app.state::<settings::SettingsState>();
        let _ = pets_core::integrations::place_hook(&st.home, settings::pick_hook(&settings::hook_candidates(app)).as_deref(), st.lang());
    }
    if old.autostart != new.autostart { sync_autostart(new.autostart); }
    if old.stage != new.stage { app.state::<shell::Shell>().settings_changed(); }
    if old.updates != new.updates { updater::mode_changed(app, new.updates); }
    if old.power_saving != new.power_saving { system::refresh_power(app); }
    if old.language != new.language {
        let lang = pets_core::i18n::current(new.language);
        let _ = app.state::<core::Control>().0.lock().unwrap().send(core::CoreMsg::Lang(lang));
        tray::relabel(app, lang);
        if let Some(w) = app.get_webview_window("settings") { let _ = w.set_title(settings::window_title(lang)); }
    }
}

/// Ponowne uruchomienie z menu Start otwiera ustawienia; uruchomienie przez autostart Windows (aplikacja już działa,
/// bo użytkownik włączył ją wcześniej ręcznie) nie otwiera niczego.
fn second_launch_opens_settings(args: &[String]) -> bool { !args.iter().any(|a| a == system::AUTOSTART_ARG) }

/// Wpis autostartu zgodny z ustawieniem (porównanie z rejestrem, nie z poprzednimi ustawieniami).
/// Build deweloperski nie rejestruje się (wskazywałby `target\debug`).
pub fn sync_autostart(on: bool) {
    if cfg!(debug_assertions) { return; }
    let Some(cmd) = system::current_autostart_command() else { return };
    if let Some(v) = system::autostart_action(on, system::autostart_value(system::RUN_KEY).as_deref(), &cmd) { let _ = system::set_autostart(v); }
}

/// Przy starcie: włączony Claude Code bez hooków albo ze starym `hook.exe` (aktualizacja) dostaje je ponownie;
/// włączony opencode dostaje plugin z tej wersji; otwarta furtka ma `hook.exe report` w stałym miejscu.
fn repair_integrations(app: &tauri::AppHandle) {
    use pets_core::integrations::{self, AppId};
    let st = app.state::<settings::SettingsState>();
    let apps = st.get().apps;
    let src = settings::pick_hook(&settings::hook_candidates(app));
    if apps.claude_code && integrations::claude_needs_repair(&st.home, src.as_deref()) {
        let _ = integrations::enable(AppId::ClaudeCode, &st.home, src.as_deref(), st.lang());
    }
    // tylko nasz plik: cudzy `agent-pets.js` zostaje, a enable zwraca błąd bez zmian
    if apps.opencode { let _ = integrations::enable(AppId::Opencode, &st.home, None, st.lang()); }
    // odświeża komendy i `hook.exe` po aktualizacji; cudzy plik albo klucz zostaje (enable zwraca błąd bez zmian)
    if apps.copilot { let _ = integrations::enable(AppId::Copilot, &st.home, src.as_deref(), st.lang()); }
    if apps.antigravity { let _ = integrations::enable(AppId::Antigravity, &st.home, src.as_deref(), st.lang()); }
    if apps.generic { let _ = integrations::place_hook(&st.home, src.as_deref(), st.lang()); }
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
        .plugin(tauri_plugin_single_instance::init(|app, args, _cwd| if second_launch_opens_settings(&args) { settings::open(app) }))
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
            app.manage(bubbles::Bubbles::default());
            bubbles::build(app.handle())?;
            app.manage(panel::Panel::default());
            panel::build(app.handle())?;
            tray::build(app.handle(), app.state::<settings::SettingsState>().lang())?;
            let snaps = notify::start(app.handle().clone());
            let (core_tx, core_rx) = std::sync::mpsc::channel();
            app.manage(core::Control(std::sync::Mutex::new(core_tx)));
            core::spawn(app.handle().clone(), shared, core::Mode::from_env(), Some(snaps), core_rx);
            app.manage(stats::StatsState::load(&settings::home()));
            stats::spawn(app.handle().clone());
            app.manage(system::Power::default());
            system::watch_power(app.handle().clone());
            app.manage(media::MediaState::default());
            media::watch_media(app.handle().clone());
            app.manage(updater::Updater::default());
            app.manage(shell::menu::MenuTarget::default());
            app.on_menu_event(|app, e| shell::menu::on_event(app, e.id().as_ref()));
            updater::start(app.handle().clone());
            if !first_run {
                sync_autostart(app.state::<settings::SettingsState>().get().autostart);
                repair_integrations(app.handle());
            }
            if first_run { settings::open(app.handle()); }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            snapshot, stage_hello, stage_set_width, stage_move, stage_menu, stage_passthrough, monitors_list, stage_layout, jump, panel::panel_open, panel::panel_hide,
            tooltip::tooltip_show, tooltip::tooltip_size, tooltip::tooltip_hide,
            bubbles::stage_pets, bubbles::bubbles_place, bubbles::bubbles_hide, bubbles::bubbles_hits,
            settings::settings_get, settings::settings_set, settings::integrations_list, settings::integration_set,
            settings::wizard_finish, settings::diagnostics, settings::settings_open, system::power_get, media::media_get,
            updater::update_status, updater::update_check, updater::update_install,
            session_dismiss, sessions_dismiss_inactive, session_undismiss,
            stats::stats_open, stats::stats_view, stats::stats_progress
        ])
        .build(tauri::generate_context!())
        .expect("nie udało się zbudować aplikacji Tauri")
        .run(|app, event| {
            if let RunEvent::Exit = event { stats::save_now(app); }
            // Okno sceny ginie razem z paskiem przy restarcie Explorera; aplikacja ma wtedy żyć dalej.
            if let RunEvent::ExitRequested { api, code, .. } = event {
                if code.is_none() { api.prevent_exit(); }
            }
        });
}

#[cfg(test)]
mod launch_tests {
    use super::second_launch_opens_settings;

    #[test]
    fn a_second_launch_from_autostart_opens_nothing() {
        let a = |v: &[&str]| v.iter().map(|s| s.to_string()).collect::<Vec<_>>();
        assert!(second_launch_opens_settings(&a(&["agent-pets.exe"])), "Start menu opens settings, as before");
        assert!(!second_launch_opens_settings(&a(&["agent-pets.exe", "--autostart"])));
    }
}
