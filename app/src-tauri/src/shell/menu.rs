//! Menu pod prawym klikiem na scenie: na zwierzaku „Przejdź”, „Pokaż w panelu”, „Usuń z paska”,
//! gdzie indziej „Usuń nieaktywne”; zawsze „Przesuń” (tylko w pasku) i „Ustawienia paska…”.
use pets_core::i18n::{tr, Lang};
use std::sync::Mutex;
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::{AppHandle, LogicalPosition, Manager, Position};

#[derive(Clone, Debug, PartialEq)]
pub enum Target { Pet(String), Other }

/// Pozycje menu (`-` to separator) w kolejności wyświetlania.
pub fn items(t: &Target, floating: bool, lang: Lang) -> Vec<(&'static str, String)> {
    let mut v: Vec<(&'static str, String)> = match t {
        Target::Pet(_) => vec![
            ("jump", tr(lang, "Przejdź", "Open").into()),
            ("panel", tr(lang, "Pokaż w panelu", "Show in panel").into()),
            ("dismiss", tr(lang, "Usuń z paska", "Remove from taskbar").into()),
        ],
        Target::Other => vec![("dismiss_inactive", tr(lang, "Usuń nieaktywne", "Remove inactive").into())],
    };
    v.push(("-", String::new()));
    if !floating { v.push(("move", tr(lang, "Przesuń", "Move").into())); }
    v.push(("settings", tr(lang, "Ustawienia paska…", "Taskbar settings…").into()));
    v
}

/// Zwierzak, na którym otwarto menu (zdarzenie menu przychodzi później, osobno).
#[derive(Default)]
pub struct MenuTarget(pub Mutex<Option<Target>>);

const PREFIX: &str = "stage:";

/// Pokazuje menu przy kursorze (`x`, `y`: piksele CSS względem okna sceny).
pub fn show(app: &AppHandle, target: Target, x: f64, y: f64) -> tauri::Result<()> {
    let shell = app.state::<super::Shell>();
    let lang = app.state::<crate::settings::SettingsState>().lang();
    let mut built: Vec<Box<dyn tauri::menu::IsMenuItem<tauri::Wry>>> = Vec::new();
    for (id, label) in items(&target, shell.floating(), lang) {
        if id == "-" { built.push(Box::new(PredefinedMenuItem::separator(app)?)); }
        else { built.push(Box::new(MenuItem::with_id(app, format!("{PREFIX}{id}"), label, true, None::<&str>)?)); }
    }
    let refs: Vec<&dyn tauri::menu::IsMenuItem<tauri::Wry>> = built.iter().map(|b| b.as_ref()).collect();
    let menu = Menu::with_items(app, &refs)?;
    *app.state::<MenuTarget>().0.lock().unwrap() = Some(target);
    let raw = shell.stage.load(std::sync::atomic::Ordering::Relaxed);
    let Some(win) = app.webview_windows().into_values().find(|w| w.hwnd().map(|h| h.0 as isize == raw).unwrap_or(false)) else { return Ok(()) };
    win.as_ref().window().popup_menu_at(&menu, Position::Logical(LogicalPosition::new(x, y)))
}

/// Obsługa wybranej pozycji; zdarzenia innych menu (tray) są pomijane.
pub fn on_event(app: &AppHandle, id: &str) {
    let Some(action) = id.strip_prefix(PREFIX) else { return };
    let target = app.state::<MenuTarget>().0.lock().unwrap().take();
    let pet = match &target { Some(Target::Pet(s)) => Some(s.clone()), _ => None };
    match (action, pet) {
        ("jump", Some(s)) => {
            let r = crate::jump_to(app, &s);
            if r.needs_attention() { crate::panel::open_with_status(app, Some(s), r.detail); }
        }
        ("panel", s) => crate::panel::open(app, s),
        // czeka na obrót rdzenia: poza wątkiem głównym, na którym przychodzą zdarzenia menu
        ("dismiss", Some(s)) => { let a = app.clone(); std::thread::spawn(move || crate::dismiss(&a, vec![s])); }
        ("dismiss_inactive", _) => { let a = app.clone(); std::thread::spawn(move || crate::dismiss_inactive(&a)); }
        ("move", _) => app.state::<super::Shell>().start_move(),
        ("settings", _) => crate::settings::open_tab(app, "stage"),
        _ => {}
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn ids(v: &[(&str, String)]) -> Vec<String> { v.iter().map(|(id, _)| id.to_string()).collect() }

    #[test]
    fn a_pet_in_the_taskbar_offers_open_panel_remove_move_and_settings() {
        let v = items(&Target::Pet("s1".into()), false, Lang::Pl);
        assert_eq!(ids(&v), ["jump", "panel", "dismiss", "-", "move", "settings"]);
        assert_eq!(v[0].1, "Przejdź");
        assert_eq!(v[2].1, "Usuń z paska");
        assert_eq!(v[5].1, "Ustawienia paska…");
    }

    #[test]
    fn the_floating_window_has_no_move_item_since_it_is_dragged_directly() {
        assert_eq!(ids(&items(&Target::Pet("s1".into()), true, Lang::Pl)), ["jump", "panel", "dismiss", "-", "settings"]);
        assert_eq!(ids(&items(&Target::Other, true, Lang::Pl)), ["dismiss_inactive", "-", "settings"]);
    }

    #[test]
    fn elsewhere_remove_inactive_and_english_labels() {
        let v = items(&Target::Other, false, Lang::En);
        assert_eq!(ids(&v), ["dismiss_inactive", "-", "move", "settings"]);
        assert_eq!((v[0].1.as_str(), v[2].1.as_str(), v[3].1.as_str()), ("Remove inactive", "Move", "Taskbar settings…"));
    }
}
