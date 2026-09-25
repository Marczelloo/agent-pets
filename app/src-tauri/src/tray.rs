//! Ikona w zasobniku: lewy klik przełącza panel, prawy pokazuje menu („Ustawienia”, „Zakończ”).
use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use pets_core::i18n::{tr, Lang};
use tauri::{AppHandle, Manager, Wry};

/// Pozycje menu, żeby zmiana języka przepisała ich tekst bez przebudowy ikony.
pub struct TrayItems { settings: MenuItem<Wry>, quit: MenuItem<Wry> }

const SETTINGS: (&str, &str) = ("Ustawienia", "Settings");
const QUIT: (&str, &str) = ("Zakończ Agent Pets", "Quit Agent Pets");

pub fn build(app: &AppHandle, lang: Lang) -> tauri::Result<()> {
    let prefs = MenuItem::with_id(app, "settings", tr(lang, SETTINGS.0, SETTINGS.1), true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", tr(lang, QUIT.0, QUIT.1), true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&prefs, &quit])?;
    let mut b = TrayIconBuilder::with_id("main").tooltip("Agent Pets").menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, e| match e.id().as_ref() {
            "quit" => app.exit(0),
            "settings" => crate::settings::open(app),
            _ => {}
        })
        .on_tray_icon_event(|tray, e| {
            if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = e {
                crate::panel::toggle(tray.app_handle(), None);
            }
        });
    if let Some(icon) = app.default_window_icon() { b = b.icon(icon.clone()); }
    b.build(app)?;
    app.manage(TrayItems { settings: prefs, quit });
    Ok(())
}

/// Nowy język menu (zmiana w ustawieniach).
pub fn relabel(app: &AppHandle, lang: Lang) {
    if let Some(t) = app.try_state::<TrayItems>() {
        let _ = t.settings.set_text(tr(lang, SETTINGS.0, SETTINGS.1));
        let _ = t.quit.set_text(tr(lang, QUIT.0, QUIT.1));
    }
}

/// Zmienia podpowiedź ikony (np. na opis awarii rdzenia danych).
pub fn set_status(app: &AppHandle, text: &str) {
    if let Some(t) = app.tray_by_id("main") { let _ = t.set_tooltip(Some(text)); }
}
