//! Windows notifications (spec 2.4): WinRT toasts with a "Jump" button. `rules` decides when to send them.
pub mod rules;

use crate::core::Snapshot;
use pets_core::model::Session;
use std::sync::mpsc::{channel, Sender};
use tauri::{AppHandle, Manager};
use tauri_winrt_notification::Toast;

pub const AUMID: &str = "dev.agentpets.app";

/// Toast identifier determined when the notification thread starts (AUMID or PowerShell fallback).
static APP_ID: std::sync::OnceLock<&'static str> = std::sync::OnceLock::new();

/// Toast outside session rules (updates). `button`: label of the `install` action button.
pub fn show_update(_app: &AppHandle, title: &str, body: &str, button: Option<&str>,
                   on: impl Fn(Option<String>) + Send + Sync + 'static) {
    let id = APP_ID.get().copied().unwrap_or(AUMID);
    let mut toast = Toast::new(id).title(title);
    if !body.is_empty() { toast = toast.text1(body); }
    if let Some(b) = button { toast = toast.add_button(b, "install"); }
    let _ = toast.on_activated(move |action| { on(action); Ok(()) }).show();
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
            let v: Vec<u16> = icon.to_string_lossy().encode_utf16().chain(std::iter::once(0)).collect();
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

pub fn start(app: AppHandle) -> Sender<Snapshot> {
    let (tx, rx) = channel::<Snapshot>();
    std::thread::spawn(move || {
        let icon = app.path().resource_dir().ok().map(|r| r.join("icons").join("128x128.png")).filter(|p| p.is_file());
        let app_id = if register_aumid(icon.as_deref()) { AUMID } else { Toast::POWERSHELL_APP_ID };
        let _ = APP_ID.set(app_id);
        let mut rules = rules::Rules::new(rules::Settings::default());
        let mut last = Snapshot::default();
        let mut seen_first = false;
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
            // session window in foreground or visible question bubble: no toast needed (send later if the bubble disappears)
            let bubbles = app.state::<crate::bubbles::Bubbles>();
            for t in rules.observe(&last, now, &|s| focused(s) || bubbles.asking(&s.id)) {
                let a = app.clone();
                let sid = t.session_id.clone();
                let mut toast = Toast::new(app_id).title(&t.title).text1(&t.body);
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
