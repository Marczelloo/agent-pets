//! Tray icon: left click toggles the panel; right click shows the menu ("Statistics", "Settings", "Quit").
use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use pets_core::i18n::{tr, Lang};
use tauri::{AppHandle, Manager, Wry};

/// Menu items, so changing language updates their text without rebuilding the icon.
pub struct TrayItems { items: Vec<MenuItem<Wry>> }

const STATS: (&str, &str) = ("Statystyki", "Statistics");
const SETTINGS: (&str, &str) = ("Ustawienia", "Settings");
const QUIT: (&str, &str) = ("Zakończ Agent Pets", "Quit Agent Pets");

/// Menu items in order: ID and text in `lang`.
pub fn tray_items(lang: Lang) -> Vec<(&'static str, &'static str)> {
    [("stats", STATS), ("settings", SETTINGS), ("quit", QUIT)].iter().map(|(id, t)| (*id, tr(lang, t.0, t.1))).collect()
}

pub fn build(app: &AppHandle, lang: Lang) -> tauri::Result<()> {
    let items = tray_items(lang).into_iter().map(|(id, label)| MenuItem::with_id(app, id, label, true, None::<&str>))
        .collect::<tauri::Result<Vec<_>>>()?;
    let refs: Vec<&dyn tauri::menu::IsMenuItem<Wry>> = items.iter().map(|i| i as &dyn tauri::menu::IsMenuItem<Wry>).collect();
    let menu = Menu::with_items(app, &refs)?;
    let mut b = TrayIconBuilder::with_id("main").tooltip("Agent Pets").menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, e| match e.id().as_ref() {
            "quit" => app.exit(0),
            "settings" => crate::settings::open(app),
            "stats" => crate::stats::open(app),
            _ => {}
        })
        .on_tray_icon_event(|tray, e| {
            if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = e {
                crate::panel::toggle(tray.app_handle(), None);
            }
        });
    if let Some(icon) = app.default_window_icon() { b = b.icon(icon.clone()); }
    b.build(app)?;
    app.manage(TrayItems { items });
    Ok(())
}

/// New menu language (changed in settings).
pub fn relabel(app: &AppHandle, lang: Lang) {
    if let Some(t) = app.try_state::<TrayItems>() {
        for (item, (_, label)) in t.items.iter().zip(tray_items(lang)) { let _ = item.set_text(label); }
    }
}

/// Change the icon tooltip (e.g. to describe a data-core failure).
pub fn set_status(app: &AppHandle, text: &str) {
    if let Some(t) = app.tray_by_id("main") { let _ = t.set_tooltip(Some(text)); }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn statistics_come_before_settings_in_both_languages() {
        let ids = |l| tray_items(l).iter().map(|x| x.0).collect::<Vec<_>>();
        assert_eq!(ids(Lang::Pl), ["stats", "settings", "quit"]);
        assert_eq!(tray_items(Lang::Pl)[0].1, "Statystyki");
        assert_eq!(tray_items(Lang::En)[0].1, "Statistics");
    }
}
