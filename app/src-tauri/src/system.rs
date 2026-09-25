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

pub fn set_autostart(on: bool) -> std::io::Result<()> {
    let exe = std::env::current_exe()?;
    set_autostart_at(RUN_KEY, &exe.to_string_lossy(), on)
}

/// Usuwa klucz rejestracji powiadomień (AUMID) aplikacji.
pub fn remove_aumid() {
    let key = format!(r"Software\Classes\AppUserModelId\{}", crate::notify::AUMID);
    unsafe { let _ = RegDeleteTreeW(HKEY_CURRENT_USER, &HSTRING::from(key)); }
}

#[cfg(test)]
mod tests {
    use super::*;

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
