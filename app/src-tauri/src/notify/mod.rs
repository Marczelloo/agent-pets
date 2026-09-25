//! Powiadomienia Windows (spec 2.4): toasty WinRT z przyciskiem „Przejdź”. Kiedy wysłać, mówią `rules`.
pub mod rules;

use crate::core::Snapshot;
use pets_core::model::Session;
use std::sync::mpsc::{channel, Sender};
use tauri::AppHandle;
use tauri_winrt_notification::Toast;

pub const AUMID: &str = "dev.agentpets.app";

/// Rejestracja AUMID niezainstalowanej aplikacji (HKCU), żeby toasty były podpisane „Agent Pets”.
fn register_aumid() -> bool {
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
        let ok = RegSetValueExW(h, &HSTRING::from("DisplayName"), None, REG_SZ, Some(bytes)).is_ok();
        let _ = RegCloseKey(h);
        ok
    }
}

/// Czy okno sesji jest teraz na pierwszym planie (wtedy „czeka na Ciebie” nie jest potrzebne).
fn focused(s: &Session) -> bool {
    use windows::Win32::UI::WindowsAndMessaging::{GetAncestor, GetForegroundWindow, GA_ROOTOWNER};
    let Some(pid) = s.jump.pid else { return false };
    let Some(win) = crate::jump::exec::session_window(pid) else { return false };
    unsafe { GetAncestor(GetForegroundWindow(), GA_ROOTOWNER) == win }
}

pub fn start(app: AppHandle) -> Sender<Snapshot> {
    let (tx, rx) = channel::<Snapshot>();
    std::thread::spawn(move || {
        let app_id = if register_aumid() { AUMID } else { Toast::POWERSHELL_APP_ID };
        let mut rules = rules::Rules::new(rules::Settings::default());
        let mut last = Snapshot::default();
        let mut seen_first = false;
        loop {
            // nowa migawka albo co sekundę: próg 15 s dla `needs_you` mija bez nowych zdarzeń
            match rx.recv_timeout(std::time::Duration::from_secs(1)) {
                Ok(s) => { last = s; seen_first = true; }
                Err(std::sync::mpsc::RecvTimeoutError::Disconnected) => return,
                Err(_) => {}
            }
            // pierwsza obserwacja (bez powiadomień) dopiero na prawdziwej migawce rdzenia, nie na pustej
            if !seen_first { continue; }
            let now = last.now.max(pets_core::time::now_ms());
            for t in rules.observe(&last, now, &focused) {
                let a = app.clone();
                let sid = t.session_id.clone();
                let mut toast = Toast::new(app_id).title(&t.title).text1(&t.body);
                if sid.is_some() { toast = toast.add_button("Przejdź", "jump"); }
                let _ = toast.on_activated(move |action| {
                    match (action.as_deref(), &sid) {
                        (Some("jump"), Some(id)) => {
                            // nic nie może zginąć po cichu: schowek albo porażkę pokazuje panel
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
