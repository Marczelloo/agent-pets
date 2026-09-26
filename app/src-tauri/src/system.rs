//! Integracja z Windows: autostart (`HKCU\...\Run`) i sprzątanie rejestracji powiadomień przy odinstalowaniu.
use windows::core::HSTRING;
use windows::Win32::System::Registry::*;

pub const RUN_KEY: &str = r"Software\Microsoft\Windows\CurrentVersion\Run";
pub const RUN_VALUE: &str = "Agent Pets";

fn wide(s: &str) -> Vec<u16> { s.encode_utf16().chain(std::iter::once(0)).collect() }

/// Włącza albo wyłącza uruchamianie z Windows dla `exe` pod kluczem `key` (w HKCU).
pub fn set_autostart_at(key: &str, exe: &str, on: bool) -> std::io::Result<()> {
    unsafe {
        let mut h = HKEY::default();
        RegCreateKeyW(HKEY_CURRENT_USER, &HSTRING::from(key), &mut h).ok().map_err(std::io::Error::other)?;
        let r = if on {
            let data = wide(&format!("\"{exe}\""));
            let bytes = std::slice::from_raw_parts(data.as_ptr() as *const u8, data.len() * 2);
            RegSetValueExW(h, &HSTRING::from(RUN_VALUE), None, REG_SZ, Some(bytes)).ok()
        } else {
            match RegDeleteValueW(h, &HSTRING::from(RUN_VALUE)) {
                e if e == windows::Win32::Foundation::ERROR_FILE_NOT_FOUND => Ok(()),
                e => e.ok(),
            }
        };
        let _ = RegCloseKey(h);
        r.map_err(std::io::Error::other)
    }
}

/// Czy pod `key` jest wpis autostartu.
pub fn autostart_at(key: &str) -> bool {
    unsafe {
        let mut h = HKEY::default();
        if RegOpenKeyExW(HKEY_CURRENT_USER, &HSTRING::from(key), None, KEY_READ, &mut h).is_err() { return false; }
        let found = RegQueryValueExW(h, &HSTRING::from(RUN_VALUE), None, None, None, None).is_ok();
        let _ = RegCloseKey(h);
        found
    }
}

/// Jasny pasek zadań (Ustawienia → Personalizacja → Kolory → tryb Windows). Brak wartości = ciemny.
pub fn light_taskbar() -> bool {
    let mut v: u32 = 0;
    let mut size = std::mem::size_of::<u32>() as u32;
    unsafe {
        RegGetValueW(HKEY_CURRENT_USER, &HSTRING::from(r"Software\Microsoft\Windows\CurrentVersion\Themes\Personalize"),
            &HSTRING::from("SystemUsesLightTheme"), RRF_RT_REG_DWORD, None, Some(&mut v as *mut u32 as *mut core::ffi::c_void), Some(&mut size))
            .is_ok() && v == 1
    }
}

/// Co zrobić z wpisem autostartu: porównujemy z rejestrem, nie z poprzednimi ustawieniami
/// (kreator zapisuje domyślne `true`, a wpisu jeszcze nie ma).
pub fn autostart_action(desired: bool, registered: bool) -> Option<bool> { (desired != registered).then_some(desired) }

pub fn set_autostart(on: bool) -> std::io::Result<()> {
    let exe = std::env::current_exe()?;
    set_autostart_at(RUN_KEY, &exe.to_string_lossy(), on)
}

/// Usuwa klucz rejestracji powiadomień (AUMID) aplikacji.
pub fn remove_aumid() {
    let key = format!(r"Software\Classes\AppUserModelId\{}", crate::notify::AUMID);
    unsafe { let _ = RegDeleteTreeW(HKEY_CURRENT_USER, &HSTRING::from(key)); }
}

/// Czy włączyć tryb oszczędny: `auto` na baterii albo przy oszczędzaniu energii Windows.
pub fn decide_power_saving(mode: pets_core::settings::PowerSaving, on_battery: bool, saver_on: bool) -> bool {
    use pets_core::settings::PowerSaving::*;
    match mode { Always => true, Never => false, Auto => on_battery || saver_on }
}

/// (na baterii, oszczędzanie energii Windows włączone).
pub fn power_status() -> (bool, bool) {
    use windows::Win32::System::Power::{GetSystemPowerStatus, SYSTEM_POWER_STATUS};
    let mut s = SYSTEM_POWER_STATUS::default();
    if unsafe { GetSystemPowerStatus(&mut s) }.is_err() { return (false, false); }
    (s.ACLineStatus == 0, s.SystemStatusFlag == 1)
}

#[derive(Default)]
pub struct Power(pub std::sync::atomic::AtomicBool);

/// Liczy tryb oszczędny i rozsyła `pets://power { saving }`, gdy się zmienia.
pub fn refresh_power(app: &tauri::AppHandle) {
    use tauri::{Emitter, Manager};
    let mode = app.state::<crate::settings::SettingsState>().get().power_saving;
    let (bat, saver) = power_status();
    let saving = decide_power_saving(mode, bat, saver);
    let prev = app.state::<Power>().0.swap(saving, std::sync::atomic::Ordering::Relaxed);
    if prev != saving { let _ = app.emit("pets://power", saving); }
}

/// Stan zasilania co 30 s.
pub fn watch_power(app: tauri::AppHandle) {
    std::thread::spawn(move || loop {
        refresh_power(&app);
        std::thread::sleep(std::time::Duration::from_secs(30));
    });
}

#[tauri::command]
pub fn power_get(state: tauri::State<Power>) -> bool { state.0.load(std::sync::atomic::Ordering::Relaxed) }

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn power_saving_follows_the_mode_and_the_power_source() {
        use pets_core::settings::PowerSaving::*;
        for (bat, saver) in [(false, false), (true, false), (false, true), (true, true)] {
            assert!(decide_power_saving(Always, bat, saver));
            assert!(!decide_power_saving(Never, bat, saver));
            assert_eq!(decide_power_saving(Auto, bat, saver), bat || saver, "{bat} {saver}");
        }
    }

    #[test]
    fn autostart_is_written_only_when_the_registry_disagrees() {
        assert_eq!(autostart_action(true, false), Some(true));
        assert_eq!(autostart_action(false, true), Some(false));
        assert_eq!(autostart_action(true, true), None);
        assert_eq!(autostart_action(false, false), None);
    }

    #[test]
    fn autostart_entry_can_be_set_and_removed() {
        let key = r"Software\AgentPetsTest\Run";
        set_autostart_at(key, r"C:\x\agent-pets.exe", true).unwrap();
        assert!(autostart_at(key));
        set_autostart_at(key, "", false).unwrap();
        assert!(!autostart_at(key));
        set_autostart_at(key, "", false).unwrap();
        unsafe { let _ = RegDeleteTreeW(HKEY_CURRENT_USER, &HSTRING::from(r"Software\AgentPetsTest")); }
    }
}
