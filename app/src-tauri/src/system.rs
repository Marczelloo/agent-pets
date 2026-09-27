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
            let data = wide(&autostart_command(exe));
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
pub fn autostart_at(key: &str) -> bool { autostart_value(key).is_some() }

/// Polecenie z wpisu autostartu pod `key`, jeśli jest.
pub fn autostart_value(key: &str) -> Option<String> {
    let mut size: u32 = 0;
    unsafe {
        RegGetValueW(HKEY_CURRENT_USER, &HSTRING::from(key), &HSTRING::from(RUN_VALUE), RRF_RT_REG_SZ, None, None, Some(&mut size)).ok().ok()?;
        let mut buf = vec![0u16; (size as usize).div_ceil(2)];
        RegGetValueW(HKEY_CURRENT_USER, &HSTRING::from(key), &HSTRING::from(RUN_VALUE), RRF_RT_REG_SZ, None,
            Some(buf.as_mut_ptr() as *mut core::ffi::c_void), Some(&mut size)).ok().ok()?;
        let len = buf.iter().position(|&c| c == 0).unwrap_or(buf.len());
        Some(String::from_utf16_lossy(&buf[..len]))
    }
}

/// Wpis autostartu: ścieżka w cudzysłowie i `--autostart`, żeby druga instancja uruchomiona przez Windows
/// (gdy aplikacja już działa) niczego nie otwierała.
pub fn autostart_command(exe: &str) -> String { format!("\"{exe}\" {AUTOSTART_ARG}") }

pub const AUTOSTART_ARG: &str = "--autostart";

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
/// (kreator zapisuje domyślne `true`, a wpisu jeszcze nie ma). Wpis inny niż `cmd` (0.8.0 bez flagi,
/// stara ścieżka) jest przepisywany.
pub fn autostart_action(desired: bool, registered: Option<&str>, cmd: &str) -> Option<bool> {
    match (desired, registered) {
        (true, Some(r)) if r == cmd => None,
        (true, _) => Some(true),
        (false, Some(_)) => Some(false),
        (false, None) => None,
    }
}

pub fn set_autostart(on: bool) -> std::io::Result<()> {
    let exe = std::env::current_exe()?;
    set_autostart_at(RUN_KEY, &exe.to_string_lossy(), on)
}

/// Polecenie autostartu dla bieżącego pliku aplikacji.
pub fn current_autostart_command() -> Option<String> {
    std::env::current_exe().ok().map(|e| autostart_command(&e.to_string_lossy()))
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
        let cmd = autostart_command("C:/x/agent-pets.exe");
        assert_eq!(cmd, "\"C:/x/agent-pets.exe\" --autostart");
        assert_eq!(autostart_action(true, None, &cmd), Some(true));
        assert_eq!(autostart_action(false, Some(&cmd), &cmd), Some(false));
        assert_eq!(autostart_action(true, Some(&cmd), &cmd), None);
        assert_eq!(autostart_action(false, None, &cmd), None);
        // wpis z 0.8.0 (bez flagi) albo ze starej ścieżki jest przepisywany
        assert_eq!(autostart_action(true, Some("\"C:/x/agent-pets.exe\""), &cmd), Some(true));
        assert_eq!(autostart_action(true, Some("\"C:/old/agent-pets.exe\" --autostart"), &cmd), Some(true));
    }

    #[test]
    fn autostart_entry_can_be_set_and_removed() {
        let key = r"Software\AgentPetsTest\Run";
        set_autostart_at(key, r"C:\x\agent-pets.exe", true).unwrap();
        assert!(autostart_at(key));
        assert_eq!(autostart_value(key).as_deref(), Some(r#""C:\x\agent-pets.exe" --autostart"#));
        set_autostart_at(key, "", false).unwrap();
        assert!(!autostart_at(key));
        set_autostart_at(key, "", false).unwrap();
        unsafe { let _ = RegDeleteTreeW(HKEY_CURRENT_USER, &HSTRING::from(r"Software\AgentPetsTest")); }
    }
}
