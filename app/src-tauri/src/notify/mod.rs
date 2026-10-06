//! Windows notifications (spec 2.4): WinRT toasts with a "Jump" button. `rules` decides when to send them.
pub mod center;
pub mod rules;
pub mod shortcut;

use crate::core::Snapshot;
use pets_core::model::Session;
use std::sync::mpsc::{channel, Sender};
use tauri::{AppHandle, Manager};
use tauri_winrt_notification::{Sound, Toast};

/// A fresh id on purpose: Windows keeps the (blank) header icon it first saw for `dev.agentpets.app` forever.
pub const AUMID: &str = "dev.agentpets.desktop";

/// Toast identifier determined when the notification thread starts (AUMID or PowerShell fallback).
static APP_ID: std::sync::OnceLock<&'static str> = std::sync::OnceLock::new();

/// Toast outside session rules (updates), recorded in the center even while muted. `button`: label of the `install` action button.
pub fn show_update(app: &AppHandle, title: &str, body: &str, button: Option<&str>,
                   on: impl Fn(Option<String>) + Send + Sync + 'static) {
    center::record(app, center::Kind::Update, title, body, None);
    if pets_core::mute::muted(&app.state::<crate::settings::SettingsState>().get().notifications, pets_core::time::now_ms()) { return; }
    let id = APP_ID.get().copied().unwrap_or(AUMID);
    let mut toast = Toast::new(id).title(title);
    if !body.is_empty() { toast = toast.text1(body); }
    if let Some(b) = button { toast = toast.add_button(b, "install"); }
    let _ = toast.on_activated(move |action| { on(action); Ok(()) }).show();
}

/// Recap is recorded even while muted; its action opens the statistics window.
pub fn show_weekly(app: &AppHandle, title: &str, body: &str, button: &str) {
    center::record(app, center::Kind::Weekly, title, body, None);
    let n = app.state::<crate::settings::SettingsState>().get().notifications;
    if pets_core::mute::muted(&n, pets_core::time::now_ms()) { return; }
    let id = APP_ID.get().copied().unwrap_or(AUMID);
    let a = app.clone();
    let _ = Toast::new(id).title(title).text1(body).sound(sound_for(rules::ToastKind::Done, n.sound))
        .add_button(button, "statistics")
        .on_activated(move |_| { crate::stats::open(&a); Ok(()) }).show();
}

/// Path for the `IconUri` value: the toast shell does not load an image through the `\\?\` verbatim prefix
/// that `resource_dir()` returns, so the notifications showed no app icon.
fn toast_icon_path(p: &std::path::Path) -> String {
    let s = p.to_string_lossy();
    match s.strip_prefix(r"\\?\") {
        Some(rest) if !rest.starts_with(r"UNC\") => rest.to_string(),
        _ => s.to_string(),
    }
}

/// Register AUMID for an uninstalled app (HKCU), so toasts are labeled "Agent Pets".
fn register_aumid(icon: Option<&std::path::Path>) -> bool {
    use windows::core::HSTRING;
    use windows::Win32::System::Registry::*;
    let key = HSTRING::from(format!("Software\\Classes\\AppUserModelId\\{AUMID}"));
    unsafe {
        let mut h = HKEY::default();
        if RegCreateKeyW(HKEY_CURRENT_USER, &key, &mut h).is_err() {
            return false;
        }
        let name: Vec<u16> = "Agent Pets".encode_utf16().chain(std::iter::once(0)).collect();
        let bytes = std::slice::from_raw_parts(name.as_ptr() as *const u8, name.len() * 2);
        let mut ok = RegSetValueExW(h, &HSTRING::from("DisplayName"), None, REG_SZ, Some(bytes)).is_ok();
        // toast icon (file from installed resources; absent in development builds)
        if let Some(icon) = icon {
            let v: Vec<u16> = toast_icon_path(icon).encode_utf16().chain(std::iter::once(0)).collect();
            let b = std::slice::from_raw_parts(v.as_ptr() as *const u8, v.len() * 2);
            ok &= RegSetValueExW(h, &HSTRING::from("IconUri"), None, REG_SZ, Some(b)).is_ok();
        }
        let _ = RegCloseKey(h);
        ok
    }
}

/// Whether the session window is currently in the foreground (then "waiting for you" is unnecessary).
fn focused(s: &Session) -> bool {
    use windows::Win32::UI::WindowsAndMessaging::{GetAncestor, GetForegroundWindow, GA_ROOTOWNER};
    let Some(pid) = s.jump.pid else { return false };
    let Some(win) = crate::jump::exec::session_window(pid) else { return false };
    unsafe { GetAncestor(GetForegroundWindow(), GA_ROOTOWNER) == win }
}

/// "Needs you" stands out by ear; `on: false` mutes every toast of ours.
fn sound_for(kind: rules::ToastKind, on: bool) -> Option<Sound> {
    match (on, kind) {
        (false, _) => None,
        (true, rules::ToastKind::NeedsYou) => Some(Sound::Reminder),
        (true, _) => Some(Sound::Default),
    }
}

pub fn start(app: AppHandle) -> Sender<Snapshot> {
    let (tx, rx) = channel::<Snapshot>();
    std::thread::spawn(move || {
        let icon = app.path().resource_dir().ok().map(|r| r.join("icons").join("128x128.png")).filter(|p| p.is_file());
        // installed build: the Start Menu shortcut carries the AUMID, which is what gives the toast its header icon;
        // otherwise (development build, or the shortcut cannot be written) the registry key labels the toasts
        let stamped = icon.is_some() && std::env::current_exe().ok().zip(shortcut::start_menu_link())
            .is_some_and(|(exe, lnk)| shortcut::ensure_at(&lnk, &exe, AUMID).is_ok());
        let app_id = if stamped || register_aumid(icon.as_deref()) { AUMID } else { Toast::POWERSHELL_APP_ID };
        let _ = APP_ID.set(app_id);
        let mut rules = rules::Rules::new(rules::Settings::default());
        let mut last = Snapshot::default();
        let mut seen_first = false;
        let mut was_muted = false;
        loop {
            // new snapshot or once per second: the 15 s threshold for `needs_you` passes without new events
            match rx.recv_timeout(std::time::Duration::from_secs(1)) {
                Ok(s) => { last = s; seen_first = true; }
                Err(std::sync::mpsc::RecvTimeoutError::Disconnected) => return,
                Err(_) => {}
            }
            // first observation (without notifications) only on a real core snapshot, not an empty one
            if !seen_first { continue; }
            let cur = app.state::<crate::settings::SettingsState>().get();
            let (n, lang) = (cur.notifications, pets_core::i18n::current(cur.language));
            rules.set_settings(rules::Settings { needs_you: n.needs_you, done: n.done, limits: n.limits });
            rules.set_lang(lang);
            let now = last.now.max(pets_core::time::now_ms());
            // muted: the rules and the center go on (nothing piles up for later), only the Windows toast is skipped
            let muted = pets_core::mute::muted(&n, now);
            // the mute ran out on its own: the tray menu and tooltip follow
            if muted != was_muted { was_muted = muted; crate::tray::refresh(&app); }
            // session window in foreground or visible question bubble: no toast needed (send later if the bubble disappears)
            let bubbles = app.state::<crate::bubbles::Bubbles>();
            for t in rules.observe(&last, now, &|s| focused(s) || bubbles.asking(&s.id)) {
                center::record(&app, match t.kind {
                    rules::ToastKind::NeedsYou => center::Kind::NeedsYou,
                    rules::ToastKind::Done => center::Kind::Done,
                    rules::ToastKind::Limit => center::Kind::Limit,
                }, &t.title, &t.body, t.session_id.clone());
                if muted { continue; }
                let a = app.clone();
                let sid = t.session_id.clone();
                let mut toast = Toast::new(app_id).title(&t.title).text1(&t.body).sound(sound_for(t.kind, n.sound));
                if sid.is_some() { toast = toast.add_button(pets_core::i18n::tr(lang, "Przejdź", "Open"), "jump"); }
                let _ = toast.on_activated(move |action| {
                    match (action.as_deref(), &sid) {
                        (Some("jump"), Some(id)) => {
                            // nothing can fail silently: the panel shows clipboard use or failure
                            let r = crate::jump_to(&a, id);
                            if r.needs_attention() { crate::panel::open_with_status(&a, Some(id.clone()), r.detail); }
                        }
                        _ => crate::panel::open(&a, sid.clone()),
                    }
                    Ok(())
                }).show();
            }
        }
    });
    tx
}

#[cfg(test)]
mod tests {
    use super::{rules::ToastKind, sound_for, toast_icon_path};
    use tauri_winrt_notification::Sound;

    #[test]
    fn needs_you_sounds_different_and_the_switch_mutes_all() {
        assert_eq!(sound_for(ToastKind::NeedsYou, true), Some(Sound::Reminder));
        assert_eq!(sound_for(ToastKind::Done, true), Some(Sound::Default));
        assert_eq!(sound_for(ToastKind::NeedsYou, false), None);
    }
    use std::path::Path;

    #[test]
    fn strips_the_verbatim_prefix_that_hides_the_toast_icon() {
        assert_eq!(toast_icon_path(Path::new(r"\\?\C:\Users\a\Agent Pets\icons\128x128.png")), r"C:\Users\a\Agent Pets\icons\128x128.png");
    }

    #[test]
    fn leaves_plain_and_unc_paths_alone() {
        assert_eq!(toast_icon_path(Path::new(r"C:\x\i.png")), r"C:\x\i.png");
        assert_eq!(toast_icon_path(Path::new(r"\\?\UNC\srv\x\i.png")), r"\\?\UNC\srv\x\i.png");
    }
}
