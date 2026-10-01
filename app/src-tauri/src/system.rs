//! System integration: startup, notification registration cleanup, power state, taskbar brightness.
//! Windows: registry (`HKCU\...\Run`) and Win32 power status. Linux: XDG autostart `.desktop` entry
//! and `/sys/class/power_supply`.
#[cfg(windows)]
use windows::core::HSTRING;
#[cfg(windows)]
use windows::Win32::System::Registry::*;

pub const RUN_KEY: &str = r"Software\Microsoft\Windows\CurrentVersion\Run";
#[cfg_attr(not(windows), allow(dead_code))]
pub const RUN_VALUE: &str = "Agent Pets";

/// Startup entry: quoted path and `--autostart` so a second instance launched by the system
/// (when the app is already running) opens nothing.
pub fn autostart_command(exe: &str) -> String { format!("\"{exe}\" {AUTOSTART_ARG}") }

pub const AUTOSTART_ARG: &str = "--autostart";

#[cfg(windows)]
fn wide(s: &str) -> Vec<u16> { s.encode_utf16().chain(std::iter::once(0)).collect() }

/// Enable or disable Windows startup for `exe` under `key` (in HKCU).
#[cfg(windows)]
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

/// XDG autostart entry (`~/.config/autostart/AgentPets.desktop`).
#[cfg(not(windows))]
fn desktop_file() -> std::path::PathBuf {
    std::env::var_os("XDG_CONFIG_HOME").map(std::path::PathBuf::from)
        .unwrap_or_else(|| std::path::PathBuf::from(std::env::var_os("HOME").unwrap_or_default()).join(".config"))
        .join("autostart").join("AgentPets.desktop")
}

/// Write or remove the XDG autostart entry; `key`/`exe` keep the Windows signature.
#[cfg(not(windows))]
pub fn set_autostart_at(_key: &str, exe: &str, on: bool) -> std::io::Result<()> {
    let f = desktop_file();
    if !on {
        return match std::fs::remove_file(&f) {
            Ok(()) => Ok(()),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
            Err(e) => Err(e),
        };
    }
    let text = format!("[Desktop Entry]\nType=Application\nName=Agent Pets\nExec=\"{exe}\" {AUTOSTART_ARG}\nComment=Animated pets for your coding agents\n");
    if let Some(dir) = f.parent() { std::fs::create_dir_all(dir)?; }
    std::fs::write(&f, text)
}

/// Whether a startup entry exists under `key` (Linux ignores it: there is one autostart file).
pub fn autostart_at(key: &str) -> bool { autostart_value(key).is_some() }

/// Command from the startup entry under `key`, if present.
#[cfg(windows)]
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

/// `Exec` line of the XDG autostart entry, if present.
#[cfg(not(windows))]
pub fn autostart_value(_key: &str) -> Option<String> {
    std::fs::read_to_string(desktop_file()).ok()?
        .lines().find(|l| l.starts_with("Exec=")).map(|l| l[5..].to_string())
}

/// Light taskbar (Settings → Personalization → Colors → Windows mode). Missing value = dark.
#[cfg(windows)]
pub fn light_taskbar() -> bool {
    let mut v: u32 = 0;
    let mut size = std::mem::size_of::<u32>() as u32;
    unsafe {
        RegGetValueW(HKEY_CURRENT_USER, &HSTRING::from(r"Software\Microsoft\Windows\CurrentVersion\Themes\Personalize"),
            &HSTRING::from("SystemUsesLightTheme"), RRF_RT_REG_DWORD, None, Some(&mut v as *mut u32 as *mut core::ffi::c_void), Some(&mut size))
            .is_ok() && v == 1
    }
}

/// Light theme on Linux: the freedesktop color-scheme preference (`gsettings` on GNOME; `prefer-light`).
#[cfg(not(windows))]
pub fn light_taskbar() -> bool {
    static LIGHT: std::sync::OnceLock<bool> = std::sync::OnceLock::new();
    *LIGHT.get_or_init(|| {
        let out = std::process::Command::new("gsettings").args(["get", "org.gnome.desktop.interface", "color-scheme"])
            .output().ok();
        let text = out.map(|o| String::from_utf8_lossy(&o.stdout).into_owned()).unwrap_or_default();
        text.contains("light") && !text.contains("dark")
    })
}

/// Decide what to do with the startup entry: compare with the registry, not previous settings
/// (the wizard saves default `true` before the entry exists). An entry differing from `cmd` (0.8.0 without flag,
/// old path) is rewritten.
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

/// Startup command for the current app executable.
pub fn current_autostart_command() -> Option<String> {
    std::env::current_exe().ok().map(|e| autostart_command(&e.to_string_lossy()))
}

/// Remove the app's notification registration key (AUMID). Windows only.
#[cfg(windows)]
pub fn remove_aumid() {
    let key = format!(r"Software\Classes\AppUserModelId\{}", crate::notify::AUMID);
    unsafe { let _ = RegDeleteTreeW(HKEY_CURRENT_USER, &HSTRING::from(key)); }
}

#[cfg(not(windows))]
pub fn remove_aumid() {}

/// Whether to enable power-saving mode: `auto` on battery or with Windows battery saver.
pub fn decide_power_saving(mode: pets_core::settings::PowerSaving, on_battery: bool, saver_on: bool) -> bool {
    use pets_core::settings::PowerSaving::*;
    match mode { Always => true, Never => false, Auto => on_battery || saver_on }
}

/// (on battery, Windows battery saver enabled).
#[cfg(windows)]
pub fn power_status() -> (bool, bool) {
    use windows::Win32::System::Power::{GetSystemPowerStatus, SYSTEM_POWER_STATUS};
    let mut s = SYSTEM_POWER_STATUS::default();
    if unsafe { GetSystemPowerStatus(&mut s) }.is_err() { return (false, false); }
    (s.ACLineStatus == 0, s.SystemStatusFlag == 1)
}

/// (on battery, saver on). Linux: on battery when no mains supply is online but a battery exists.
#[cfg(not(windows))]
pub fn power_status() -> (bool, bool) {
    let base = std::path::Path::new("/sys/class/power_supply");
    let read = |p: std::path::PathBuf| std::fs::read_to_string(p).map(|s| s.trim().to_string()).ok();
    let mut has_battery = false;
    let mut ac_online = false;
    if let Ok(dir) = std::fs::read_dir(base) {
        for e in dir.flatten() {
            match read(e.path().join("type")).as_deref() {
                Some("Mains") => ac_online |= read(e.path().join("online")).as_deref() == Some("1"),
                Some("Battery") => has_battery = true,
                _ => {}
            }
        }
    }
    (has_battery && !ac_online, false)
}

#[derive(Default)]
pub struct Power(pub std::sync::atomic::AtomicBool);

/// Compute power-saving mode and emit `pets://power { saving }` when it changes.
pub fn refresh_power(app: &tauri::AppHandle) {
    use tauri::{Emitter, Manager};
    let mode = app.state::<crate::settings::SettingsState>().get().power_saving;
    let (bat, saver) = power_status();
    let saving = decide_power_saving(mode, bat, saver);
    let prev = app.state::<Power>().0.swap(saving, std::sync::atomic::Ordering::Relaxed);
    if prev != saving { let _ = app.emit("pets://power", saving); }
}

/// Power state every 30 s.
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
        // rewrite an entry from 0.8.0 (without flag) or an old path
        assert_eq!(autostart_action(true, Some("\"C:/x/agent-pets.exe\""), &cmd), Some(true));
        assert_eq!(autostart_action(true, Some("\"C:/old/agent-pets.exe\" --autostart"), &cmd), Some(true));
    }

    #[cfg(windows)]
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

    #[cfg(not(windows))]
    #[test]
    fn autostart_entry_can_be_set_and_removed() {
        let home = tempfile::tempdir().unwrap();
        std::env::set_var("XDG_CONFIG_HOME", home.path());
        set_autostart_at(RUN_KEY, "/opt/agent-pets/agent-pets", true).unwrap();
        assert!(autostart_at(RUN_KEY));
        assert_eq!(autostart_value(RUN_KEY).as_deref(), Some("\"/opt/agent-pets/agent-pets\" --autostart"));
        set_autostart_at(RUN_KEY, "", false).unwrap();
        assert!(!autostart_at(RUN_KEY));
        set_autostart_at(RUN_KEY, "", false).unwrap();
        std::env::remove_var("XDG_CONFIG_HOME");
    }
}
