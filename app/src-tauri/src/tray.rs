//! Tray icon: left click toggles the panel; right click shows the menu ("Statistics", "Settings", "Mute notifications", "Report a problem", "Quit").
//! Linux: StatusNotifier hosts give the app no clicks on the icon (any click opens the menu), so the menu leads with "Show panel".
use tauri::menu::{IsMenuItem, Menu, MenuItem, Submenu};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use pets_core::i18n::{tr, Lang};
use pets_core::mute::MuteChoice;
use tauri::{AppHandle, Manager, Wry};

#[cfg(target_os = "linux")]
const PANEL: (&str, &str) = ("Pokaż panel", "Show panel");
const STATS: (&str, &str) = ("Statystyki", "Statistics");
const SETTINGS: (&str, &str) = ("Ustawienia", "Settings");
const REPORT: (&str, &str) = ("Zgłoś problem", "Report a problem");
const QUIT: (&str, &str) = ("Zakończ Agent Pets", "Quit Agent Pets");
const MUTE: (&str, &str) = ("Wycisz powiadomienia", "Mute notifications");
const MUTE_HOUR: (&str, &str) = ("Na godzinę", "For 1 hour");
const MUTE_MORNING: (&str, &str) = ("Do 8:00", "Until 8:00");
const MUTE_FOREVER: (&str, &str) = ("Do odwołania", "Until I turn them on");
const UNMUTE: (&str, &str) = ("Włącz powiadomienia", "Turn notifications on");

/// Menu items in order: ID and text in `lang`.
pub fn tray_items(lang: Lang) -> Vec<(&'static str, &'static str)> {
    [("stats", STATS), ("settings", SETTINGS), ("report", REPORT), ("quit", QUIT)].iter().map(|(id, t)| (*id, tr(lang, t.0, t.1))).collect()
}

/// One row of the tray menu: an item, or a submenu with its items.
#[derive(Clone, Debug, PartialEq)]
pub enum Entry { Item(&'static str, &'static str), Sub(&'static str, &'static str, Vec<(&'static str, &'static str)>) }

/// The whole menu: the mute submenu above "Report a problem"; while muted it gives way to one "turn on" item.
pub fn menu_spec(lang: Lang, muted: bool) -> Vec<Entry> {
    let l = |t: (&'static str, &'static str)| tr(lang, t.0, t.1);
    let mute = if muted { Entry::Item("unmute", l(UNMUTE)) }
        else { Entry::Sub("mute", l(MUTE), vec![("mute_hour", l(MUTE_HOUR)), ("mute_morning", l(MUTE_MORNING)), ("mute_forever", l(MUTE_FOREVER))]) };
    let mut out = Vec::new();
    #[cfg(target_os = "linux")]
    out.push(Entry::Item("panel", l(PANEL)));
    for (id, label) in tray_items(lang) {
        if id == "report" { out.push(mute.clone()); }
        out.push(Entry::Item(id, label));
    }
    out
}

/// Tooltip of the icon: plain, or saying until when the toasts are silenced.
pub fn tooltip(lang: Lang, muted_until: Option<i64>, now: i64, local_midnight: impl Fn(i64) -> i64) -> String {
    match muted_until.filter(|u| now < *u) {
        None => "Agent Pets".into(),
        Some(i64::MAX) => format!("Agent Pets · {}", tr(lang, "powiadomienia wyciszone do odwołania", "notifications muted until turned on")),
        Some(u) => format!("Agent Pets · {} {}", tr(lang, "powiadomienia wyciszone do", "notifications muted until"), pets_core::mute::clock(u, local_midnight)),
    }
}

fn menu(app: &AppHandle, lang: Lang, muted: bool) -> tauri::Result<Menu<Wry>> {
    let mut items: Vec<Box<dyn IsMenuItem<Wry>>> = Vec::new();
    for e in menu_spec(lang, muted) {
        match e {
            Entry::Item(id, label) => items.push(Box::new(MenuItem::with_id(app, id, label, true, None::<&str>)?)),
            Entry::Sub(id, label, subs) => {
                let subs = subs.into_iter().map(|(id, label)| MenuItem::with_id(app, id, label, true, None::<&str>)).collect::<tauri::Result<Vec<_>>>()?;
                let refs: Vec<&dyn IsMenuItem<Wry>> = subs.iter().map(|i| i as &dyn IsMenuItem<Wry>).collect();
                items.push(Box::new(Submenu::with_id_and_items(app, id, label, true, &refs)?));
            }
        }
    }
    Menu::with_items(app, &items.iter().map(|b| b.as_ref()).collect::<Vec<_>>())
}

/// Language, mute deadline and the time, as the settings hold them now.
fn state(app: &AppHandle) -> (Lang, Option<i64>, i64) {
    let st = app.state::<crate::settings::SettingsState>();
    (st.lang(), st.get().notifications.muted_until, pets_core::time::now_ms())
}

pub fn build(app: &AppHandle) -> tauri::Result<()> {
    let (lang, until, now) = state(app);
    let menu = menu(app, lang, until.is_some_and(|u| now < u))?;
    let mut b = TrayIconBuilder::with_id("main").tooltip(tooltip(lang, until, now, pets_core::time::local_midnight)).menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, e| match e.id().as_ref() {
            "quit" => app.exit(0),
            "panel" => crate::panel::toggle(app, None),
            "settings" => crate::settings::open(app),
            "stats" => crate::stats::open(app),
            "report" => crate::settings::report_problem(app),
            // off the menu callback: saving swaps the tray menu, which must not happen while this one is still closing
            id @ ("mute_hour" | "mute_morning" | "mute_forever" | "unmute") => {
                let choice = match id { "mute_hour" => MuteChoice::Hour, "mute_morning" => MuteChoice::Morning, "mute_forever" => MuteChoice::Forever, _ => MuteChoice::Off };
                let app = app.clone();
                std::thread::spawn(move || crate::settings::set_mute(&app, choice));
            }
            _ => {}
        })
        .on_tray_icon_event(|tray, e| {
            if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = e {
                crate::panel::toggle(tray.app_handle(), None);
            }
        });
    if let Some(icon) = app.default_window_icon() { b = b.icon(icon.clone()); }
    b.build(app)?;
    Ok(())
}

/// Rebuild the menu and tooltip: the language or the mute changed, or the mute ran out.
/// (Resets a data-core failure shown by `set_status`; that one is set again on the next failure.)
pub fn refresh(app: &AppHandle) {
    let (lang, until, now) = state(app);
    let Some(t) = app.tray_by_id("main") else { return };
    if let Ok(m) = menu(app, lang, until.is_some_and(|u| now < u)) { let _ = t.set_menu(Some(m)); }
    let _ = t.set_tooltip(Some(tooltip(lang, until, now, pets_core::time::local_midnight)));
}

/// Linux: the icon shows only where a StatusNotifier host runs (KDE, Cinnamon, XFCE; stock GNOME needs the
/// AppIndicator extension). Without one, a single toast says how to reach the settings: launch the app again.
/// Checked a moment after start, since at login the panel may come up after us; shown once (marker file).
#[cfg(target_os = "linux")]
pub fn hint_if_hidden(app: &AppHandle) {
    let app = app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(std::time::Duration::from_secs(8));
        let marker = crate::settings::home().join("tray-hint-shown");
        if marker.exists() || has_tray_host() != Some(false) { return; }
        pets_core::app_log!("tray icon: no StatusNotifier host on the session bus");
        let lang = app.state::<crate::settings::SettingsState>().lang();
        crate::notify::show_hint(&app, tr(lang, "Ikona w zasobniku jest niewidoczna", "The tray icon is hidden"),
            tr(lang, "Ten pulpit nie pokazuje ikon aplikacji (w GNOME włącz rozszerzenie AppIndicator). Ustawienia otworzysz, uruchamiając Agent Pets ponownie.",
                "This desktop shows no app icons (on GNOME, enable the AppIndicator extension). Launch Agent Pets again to open the settings."));
        let _ = std::fs::write(marker, b"");
    });
}

/// `Some(false)` only when the bus answers and nobody owns the watcher name; unknown counts as present.
#[cfg(target_os = "linux")]
fn has_tray_host() -> Option<bool> {
    let conn = zbus::blocking::connection::Builder::session().ok()?.method_timeout(std::time::Duration::from_secs(2)).build().ok()?;
    let reply = conn.call_method(Some("org.freedesktop.DBus"), "/org/freedesktop/DBus", Some("org.freedesktop.DBus"),
        "NameHasOwner", &("org.kde.StatusNotifierWatcher",)).ok()?;
    reply.body().deserialize::<bool>().ok()
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
        assert_eq!(ids(Lang::Pl), ["stats", "settings", "report", "quit"]);
        assert_eq!(tray_items(Lang::En)[2].1, "Report a problem");
        assert_eq!(tray_items(Lang::Pl)[0].1, "Statystyki");
        assert_eq!(tray_items(Lang::En)[0].1, "Statistics");
    }

    /// The menu without the Linux-only "Show panel" lead, which the tests below do not cover.
    fn menu_spec(lang: Lang, muted: bool) -> Vec<Entry> {
        let mut v = super::menu_spec(lang, muted);
        if cfg!(target_os = "linux") { assert_eq!(v.remove(0), Entry::Item("panel", tr(lang, "Pokaż panel", "Show panel"))); }
        v
    }

    #[test]
    fn the_mute_submenu_sits_above_report_a_problem() {
        let spec = menu_spec(Lang::En, false);
        let ids: Vec<_> = spec.iter().map(|e| match e { Entry::Item(i, _) | Entry::Sub(i, _, _) => *i }).collect();
        assert_eq!(ids, ["stats", "settings", "mute", "report", "quit"]);
        assert_eq!(spec[2], Entry::Sub("mute", "Mute notifications", vec![("mute_hour", "For 1 hour"), ("mute_morning", "Until 8:00"), ("mute_forever", "Until I turn them on")]));
        assert_eq!(menu_spec(Lang::Pl, false)[2], Entry::Sub("mute", "Wycisz powiadomienia", vec![("mute_hour", "Na godzinę"), ("mute_morning", "Do 8:00"), ("mute_forever", "Do odwołania")]));
    }

    #[test]
    fn while_muted_one_item_turns_notifications_back_on() {
        assert_eq!(menu_spec(Lang::En, true)[2], Entry::Item("unmute", "Turn notifications on"));
        assert_eq!(menu_spec(Lang::Pl, true)[2], Entry::Item("unmute", "Włącz powiadomienia"));
        assert_eq!(menu_spec(Lang::En, true).len(), 5);
    }

    #[test]
    fn the_tooltip_says_until_when() {
        const DAY: i64 = 86_400_000;
        let mid = |ts: i64| ts - ts.rem_euclid(DAY);
        let now = 20_730 * DAY + 14 * 3_600_000;
        let until = now + 100 * 60_000;
        assert_eq!(tooltip(Lang::En, None, now, mid), "Agent Pets");
        assert_eq!(tooltip(Lang::En, Some(now - 1), now, mid), "Agent Pets", "an expired mute is no mute");
        assert_eq!(tooltip(Lang::En, Some(until), now, mid), "Agent Pets · notifications muted until 15:40");
        assert_eq!(tooltip(Lang::Pl, Some(until), now, mid), "Agent Pets · powiadomienia wyciszone do 15:40");
        assert_eq!(tooltip(Lang::Pl, Some(i64::MAX), now, mid), "Agent Pets · powiadomienia wyciszone do odwołania");
        assert_eq!(tooltip(Lang::En, Some(i64::MAX), now, mid), "Agent Pets · notifications muted until turned on");
    }
}
