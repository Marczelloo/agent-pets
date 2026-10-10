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
pub fn set_autostart_at(_key: &str, exe: &str, on: bool) -> std::io::Result<()> { write_desktop_file(&desktop_file(), exe, on) }

#[cfg(not(windows))]
fn write_desktop_file(f: &std::path::Path, exe: &str, on: bool) -> std::io::Result<()> {
    if !on {
        return match std::fs::remove_file(f) {
            Ok(()) => Ok(()),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
            Err(e) => Err(e),
        };
    }
    let exe = exec_escape(exe);
    let text = format!("[Desktop Entry]\nType=Application\nName=Agent Pets\nExec=\"{exe}\" {AUTOSTART_ARG}\nComment=Animated pets for your coding agents\n");
    if let Some(dir) = f.parent() { std::fs::create_dir_all(dir)?; }
    std::fs::write(f, text)
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
pub fn autostart_value(_key: &str) -> Option<String> { desktop_exec(&desktop_file()) }

#[cfg(not(windows))]
fn desktop_exec(f: &std::path::Path) -> Option<String> {
    std::fs::read_to_string(f).ok()?
        .lines().find(|l| l.starts_with("Exec=")).map(|l| exec_unescape(&l[5..]))
}

/// A path inside the quoted `Exec` argument (desktop entry spec): `"`, `` ` ``, `$` and `\` take a backslash
/// for the argument and the string escaping doubles it (GLib rejects `\"` as an unknown escape); `%` is `%%`.
#[cfg(not(windows))]
fn exec_escape(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    for c in s.chars() {
        match c {
            '\\' => out.push_str(r"\\\\"),
            '"' | '`' | '$' => { out.push_str(r"\\"); out.push(c); }
            '%' => out.push_str("%%"),
            _ => out.push(c),
        }
    }
    out
}

/// Inverse of [`exec_escape`]: string escapes first, then argument escapes, then `%%`.
#[cfg(not(windows))]
fn exec_unescape(s: &str) -> String {
    // `\x` -> `x`; the string level also knows `\s` `\n` `\t` `\r`
    fn unbackslash(s: &str, string_level: bool) -> String {
        let mut out = String::with_capacity(s.len());
        let mut it = s.chars();
        while let Some(c) = it.next() {
            if c != '\\' { out.push(c); continue; }
            match it.next() {
                Some('s') if string_level => out.push(' '),
                Some('n') if string_level => out.push('\n'),
                Some('t') if string_level => out.push('\t'),
                Some('r') if string_level => out.push('\r'),
                Some(n) => out.push(n),
                None => out.push('\\'),
            }
        }
        out
    }
    unbackslash(&unbackslash(s, true), false).replace("%%", "%")
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

/// Light theme on Linux: the freedesktop color-scheme preference from the settings portal
/// (GNOME, KDE, Hyprland with a portal), else `gsettings` (GNOME without a portal). Read at most
/// every 5 s, so a theme switch shows up without a restart.
#[cfg(not(windows))]
pub fn light_taskbar() -> bool {
    static CACHE: std::sync::Mutex<Option<(std::time::Instant, bool)>> = std::sync::Mutex::new(None);
    let mut c = CACHE.lock().unwrap();
    if let Some((at, v)) = *c { if at.elapsed().as_secs() < 5 { return v; } }
    let v = portal_color_scheme().and_then(light_from_scheme).unwrap_or_else(gsettings_light);
    *c = Some((std::time::Instant::now(), v));
    v
}

/// Portal `color-scheme`: 0 no preference, 1 prefer dark, 2 prefer light.
#[cfg(not(windows))]
fn light_from_scheme(n: u32) -> Option<bool> {
    match n { 1 => Some(false), 2 => Some(true), _ => None }
}

#[cfg(not(windows))]
fn portal_color_scheme() -> Option<u32> {
    use zbus::zvariant::Value;
    static BUS: std::sync::Mutex<Option<zbus::blocking::Connection>> = std::sync::Mutex::new(None);
    let mut bus = BUS.lock().unwrap();
    // short timeout: this runs on the placement thread, and a stuck portal must not hold the layout for 25 s
    if bus.is_none() {
        *bus = zbus::blocking::connection::Builder::session().ok()
            .and_then(|b| b.method_timeout(std::time::Duration::from_millis(500)).build().ok());
    }
    let conn = bus.clone()?;
    drop(bus);
    let reply = conn.call_method(Some("org.freedesktop.portal.Desktop"), "/org/freedesktop/portal/desktop",
        Some("org.freedesktop.portal.Settings"), "ReadOne", &("org.freedesktop.appearance", "color-scheme")).ok()?;
    let v = reply.body().deserialize::<zbus::zvariant::OwnedValue>().ok()?;
    // older portals wrap the value in one more variant
    fn unwrap(v: &Value) -> Option<u32> {
        match v { Value::U32(n) => Some(*n), Value::Value(inner) => unwrap(inner), _ => None }
    }
    unwrap(&v)
}

#[cfg(not(windows))]
fn gsettings_light() -> bool {
    let out = std::process::Command::new("gsettings").args(["get", "org.gnome.desktop.interface", "color-scheme"])
        .output().ok();
    let text = out.map(|o| String::from_utf8_lossy(&o.stdout).into_owned()).unwrap_or_default();
    text.contains("light") && !text.contains("dark")
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

/// Executable to start at login. An AppImage runs from a temporary `/tmp/.mount_*` folder,
/// so the entry points at the `.AppImage` file itself (`$APPIMAGE`).
fn app_exe() -> std::io::Result<std::path::PathBuf> {
    #[cfg(target_os = "linux")]
    if let Some(p) = std::env::var_os("APPIMAGE").filter(|p| !p.is_empty()) { return Ok(p.into()); }
    std::env::current_exe()
}

pub fn set_autostart(on: bool) -> std::io::Result<()> {
    let exe = app_exe()?;
    set_autostart_at(RUN_KEY, &exe.to_string_lossy(), on)
}

/// Startup command for the current app executable.
pub fn current_autostart_command() -> Option<String> {
    app_exe().ok().map(|e| autostart_command(&e.to_string_lossy()))
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
        // a temp file instead of XDG_CONFIG_HOME: `set_var` races `getenv` in parallel tests
        let home = tempfile::tempdir().unwrap();
        let f = home.path().join("autostart").join("AgentPets.desktop");
        write_desktop_file(&f, "/opt/agent-pets/agent-pets", true).unwrap();
        assert_eq!(desktop_exec(&f).as_deref(), Some("\"/opt/agent-pets/agent-pets\" --autostart"));
        write_desktop_file(&f, "", false).unwrap();
        assert_eq!(desktop_exec(&f), None);
        write_desktop_file(&f, "", false).unwrap();
    }

    #[cfg(not(windows))]
    #[test]
    fn awkward_paths_survive_the_desktop_entry_escaping() {
        let dir = tempfile::tempdir().unwrap();
        let f = dir.path().join("AgentPets.desktop");
        let exe = r#"/home/a b/$HOME/"q"/`x`/back\slash/100%/agent-pets"#;
        write_desktop_file(&f, exe, true).unwrap();
        let text = std::fs::read_to_string(&f).unwrap();
        assert!(text.contains(r#"Exec="/home/a b/\\$HOME/\\"q\\"/\\`x\\`/back\\\\slash/100%%/agent-pets" --autostart"#), "{text}");
        assert_eq!(desktop_exec(&f), Some(autostart_command(exe)), "read back as the command it was written from");
        // entries without escapes (older versions) read back unchanged
        assert_eq!(exec_unescape(r#""/opt/agent-pets/agent-pets" --autostart"#), r#""/opt/agent-pets/agent-pets" --autostart"#);
    }

    #[cfg(not(windows))]
    #[test]
    fn portal_color_scheme_maps_to_light_or_dark() {
        assert_eq!(light_from_scheme(2), Some(true));
        assert_eq!(light_from_scheme(1), Some(false));
        assert_eq!(light_from_scheme(0), None, "no preference falls back to gsettings");
    }
}
