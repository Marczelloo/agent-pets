//! Ikona w zasobniku. Faza 2: tylko „Zakończ”; panel z kliknięcia ikony to faza 3.
use tauri::menu::{Menu, MenuItem};
use tauri::tray::TrayIconBuilder;
use tauri::AppHandle;

pub fn build(app: &AppHandle) -> tauri::Result<()> {
    let quit = MenuItem::with_id(app, "quit", "Zakończ Agent Pets", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&quit])?;
    let mut b = TrayIconBuilder::with_id("main").tooltip("Agent Pets").menu(&menu)
        .on_menu_event(|app, e| if e.id() == "quit" { app.exit(0) });
    if let Some(icon) = app.default_window_icon() { b = b.icon(icon.clone()); }
    b.build(app)?;
    Ok(())
}

/// Zmienia podpowiedź ikony (np. na opis awarii rdzenia danych).
pub fn set_status(app: &AppHandle, text: &str) {
    if let Some(t) = app.tray_by_id("main") { let _ = t.set_tooltip(Some(text)); }
}
