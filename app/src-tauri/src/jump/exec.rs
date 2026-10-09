//! Execute "Jump" steps. The first successful step ends the chain; the clipboard always ends it.
//! Windows: Win32 (ShellExecute, SetForegroundWindow, clipboard, Windows Terminal). Linux: xdg-open,
//! compositor dispatch (Hyprland/Sway/xdotool), terminal emulators, wl-copy/xclip.
use pets_core::i18n::{tr, Lang};
use super::{JumpResult, Step};
#[cfg(windows)]
use std::os::windows::process::CommandExt;
#[cfg(windows)]
use windows::core::{BOOL, HSTRING, PCWSTR};
#[cfg(windows)]
use windows::Win32::Foundation::{HANDLE, HWND, LPARAM};
#[cfg(windows)]
use windows::Win32::System::DataExchange::{CloseClipboard, EmptyClipboard, OpenClipboard, SetClipboardData};
#[cfg(windows)]
use windows::Win32::System::Memory::{GlobalAlloc, GlobalLock, GlobalUnlock, GMEM_MOVEABLE};
#[cfg(windows)]
use windows::Win32::UI::Input::KeyboardAndMouse::{keybd_event, KEYEVENTF_KEYUP, VK_MENU};
#[cfg(windows)]
use windows::Win32::UI::Shell::ShellExecuteW;
#[cfg(windows)]
use windows::Win32::UI::WindowsAndMessaging::*;

#[cfg(windows)]
const CF_UNICODETEXT: u32 = 13;

/// Open `url` with its registered handler (browser, `codex://`); false when Windows refused.
#[cfg(windows)]
pub fn open_url(url: &str) -> bool {
    let r = unsafe { ShellExecuteW(None, &HSTRING::from("open"), &HSTRING::from(url), PCWSTR::null(), PCWSTR::null(), SW_SHOWNORMAL) };
    r.0 as isize > 32
}

/// Open `url` with its registered handler (browser, `codex://`); false when `xdg-open` could not start.
#[cfg(not(windows))]
pub fn open_url(url: &str) -> bool {
    std::process::Command::new("xdg-open").arg(url).stdin(std::process::Stdio::null()).spawn().is_ok()
}

/// Visible titled top-level window belonging to `pid`.
#[cfg(windows)]
fn window_of(pid: u32) -> Option<HWND> {
    struct Find { pid: u32, found: Option<HWND> }
    unsafe extern "system" fn cb(h: HWND, l: LPARAM) -> BOOL {
        let f = &mut *(l.0 as *mut Find);
        let mut p = 0u32;
        GetWindowThreadProcessId(h, Some(&mut p));
        if p == f.pid && IsWindowVisible(h).as_bool() && GetWindowTextLengthW(h) > 0 && GetWindow(h, GW_OWNER).is_err() {
            f.found = Some(h);
            return BOOL(0);
        }
        BOOL(1)
    }
    let mut f = Find { pid, found: None };
    unsafe { let _ = EnumWindows(Some(cb), LPARAM(&mut f as *mut Find as isize)); }
    f.found
}

/// Session window: the process itself or the nearest ancestor with a window (claude.exe ← pwsh ← WindowsTerminal).
#[cfg(windows)]
pub fn session_window(pid: u32) -> Option<HWND> {
    owner_pid(pid, pets_core::pid::process_entry, |p| window_of(p).is_some()).and_then(window_of)
}

/// Linux: focusing another process's window is done through the compositor directly in `focus`.
#[cfg(not(windows))]
#[allow(dead_code)]
pub fn session_window(_pid: u32) -> Option<()> { None }

/// Nearest process with a window, walking up from `pid`. `entry(p)` returns (parent, executable of process `p`).
#[cfg_attr(not(windows), allow(dead_code))]
pub(crate) fn owner_pid(pid: u32, entry: impl Fn(u32) -> Option<(u32, String)>, has_window: impl Fn(u32) -> bool) -> Option<u32> {
    // System shell processes: their windows (Explorer, desktop) are not session windows, so stop climbing here.
    const STOP: [&str; 6] = ["explorer.exe", "sihost.exe", "svchost.exe", "services.exe", "wininit.exe", "winlogon.exe"];
    let mut p = pid;
    for _ in 0..6 {
        let (parent, exe) = entry(p)?;
        if STOP.contains(&exe.to_ascii_lowercase().as_str()) { return None; }
        if has_window(p) { return Some(p); }
        if parent == 0 { return None; }
        p = parent;
    }
    None
}

#[cfg(test)]
mod tests {
    use super::owner_pid;

    fn tree(p: u32) -> Option<(u32, String)> {
        let (parent, exe) = match p {
            10 => (20, "claude.exe"), 20 => (30, "pwsh.exe"), 30 => (1, "WindowsTerminal.exe"),
            11 => (21, "claude.exe"), 21 => (31, "pwsh.exe"), 31 => (1, "explorer.exe"),
            _ => return None,
        };
        Some((parent, exe.to_string()))
    }

    #[test]
    fn climbs_to_the_terminal_window() {
        assert_eq!(owner_pid(10, tree, |p| p == 30), Some(30));
    }

    #[test]
    fn never_settles_on_the_shell_or_the_desktop() {
        // shell launched from Explorer: its parent is explorer.exe, whose window is not the session window
        assert_eq!(owner_pid(11, tree, |p| p == 31), None);
    }
}

#[cfg(windows)]
fn focus(pid: u32) -> bool {
    let Some(h) = session_window(pid) else { return false };
    unsafe {
        if IsIconic(h).as_bool() { let _ = ShowWindow(h, SW_RESTORE); }
        if SetForegroundWindow(h).as_bool() { return true; }
        // Windows denies focus to background processes (e.g. after clicking a toast). Pressing Alt lifts the restriction.
        keybd_event(VK_MENU.0 as u8, 0, Default::default(), 0);
        keybd_event(VK_MENU.0 as u8, 0, KEYEVENTF_KEYUP, 0);
        SetForegroundWindow(h).as_bool()
    }
}

/// Program on `PATH`, if present.
#[cfg(not(windows))]
fn which(name: &str) -> Option<std::path::PathBuf> {
    let path = std::env::var_os("PATH")?;
    std::env::split_paths(&path).map(|d| d.join(name)).find(|p| p.is_file())
}

/// Focus the process's window through the compositor: Hyprland, then Sway, then X11 (`xdotool`).
#[cfg(not(windows))]
fn focus(pid: u32) -> bool {
    use std::process::{Command, Stdio};
    // Hyprland: answers "ok" (exit 0) or "Unknown..." when the pid has no window
    if let Some(hyprctl) = which("hyprctl") {
        if let Ok(o) = Command::new(hyprctl).args(["dispatch", "focuswindow", &format!("pid:{pid}")])
            .stdin(Stdio::null()).output() {
            if o.status.success() && !String::from_utf8_lossy(&o.stdout).to_lowercase().contains("unknown") { return true; }
        }
    }
    // Sway: the criteria fail with a nonzero exit when nothing matches
    if let Some(swaymsg) = which("swaymsg") {
        if let Ok(o) = Command::new(swaymsg).arg(format!("[pid={pid}] focus")).stdin(Stdio::null()).output() {
            if o.status.success() { return true; }
        }
    }
    // X11: search visible windows of the pid and activate one
    if let Some(x) = which("xdotool") {
        if let Ok(o) = Command::new(x).arg("search").arg("--onlyvisible").arg("--pid").arg(pid.to_string())
            .arg("windowactivate").stdin(Stdio::null()).output() {
            if o.status.success() { return true; }
        }
    }
    false
}

#[cfg(windows)]
fn terminal(cwd: &str, program: &str, args: &[String]) -> bool {
    use std::process::Command;
    // `wt` splits its command line on semicolons, so a directory containing one goes straight to the fallback path.
    if !cwd.contains(';') && Command::new("wt.exe").arg("-d").arg(cwd).arg(program).args(args).spawn().is_ok() {
        return true;
    }
    Command::new("powershell").args(["-NoExit", "-Command", program]).args(args).current_dir(cwd)
        .creation_flags(0x0000_0010) // CREATE_NEW_CONSOLE
        .spawn().is_ok()
}

/// Open a terminal in `cwd` running `program args`: try the common emulators in turn.
#[cfg(not(windows))]
fn terminal(cwd: &str, program: &str, args: &[String]) -> bool {
    use std::process::Command;
    for name in ["kitty", "alacritty", "wezterm", "foot", "konsole", "gnome-terminal", "xterm"] {
        let Some(exe) = which(name) else { continue };
        let mut c = Command::new(&exe);
        match name {
            "kitty" => { c.arg("--").arg(program).args(args); }
            "alacritty" => { c.arg("--working-directory").arg(cwd).arg("-e").arg(program).args(args); }
            "wezterm" => { c.arg("start").arg("--cwd").arg(cwd).arg("--").arg(program).args(args); }
            "foot" => { c.arg("-D").arg(cwd).arg("--").arg(program).args(args); }
            "konsole" => { c.arg("--workdir").arg(cwd).arg("-e").arg(program).args(args); }
            "gnome-terminal" => { c.arg("--").arg(program).args(args); }
            _ => { c.arg("-e").arg(program).args(args); } // xterm
        }
        if c.current_dir(cwd).spawn().is_ok() { return true; }
    }
    false
}

#[cfg(windows)]
fn clipboard(text: &str) -> bool {
    let wide: Vec<u16> = text.encode_utf16().chain(std::iter::once(0)).collect();
    unsafe {
        if OpenClipboard(None).is_err() { return false; }
        let _ = EmptyClipboard();
        let ok = (|| -> Option<()> {
            let mem = GlobalAlloc(GMEM_MOVEABLE, wide.len() * 2).ok()?;
            let dst = GlobalLock(mem) as *mut u16;
            if dst.is_null() { return None; }
            std::ptr::copy_nonoverlapping(wide.as_ptr(), dst, wide.len());
            let _ = GlobalUnlock(mem);
            SetClipboardData(CF_UNICODETEXT, Some(HANDLE(mem.0))).ok()?;
            Some(())
        })().is_some();
        let _ = CloseClipboard();
        ok
    }
}

/// Clipboard through the session tools: `wl-copy` (Wayland), then `xclip`/`xsel` (X11).
#[cfg(not(windows))]
fn clipboard(text: &str) -> bool {
    use std::io::Write;
    use std::process::{Command, Stdio};
    let mut candidates: Vec<Vec<String>> = vec![
        vec!["wl-copy".into()],
        vec!["xclip".into(), "-selection".into(), "clipboard".into()],
        vec!["xsel".into(), "--clipboard".into(), "--input".into()],
    ];
    if std::env::var_os("WAYLAND_DISPLAY").is_none() {
        candidates.remove(0); // no Wayland session: try the X11 tools first
    }
    for cmd in candidates {
        let Some(exe) = which(&cmd[0]) else { continue };
        let mut c = Command::new(&exe);
        c.args(&cmd[1..]).stdin(Stdio::piped()).stdout(Stdio::null()).stderr(Stdio::null());
        let Ok(mut child) = c.spawn() else { continue };
        if let Some(si) = child.stdin.as_mut() { let _ = si.write_all(text.as_bytes()); }
        if child.wait().map(|s| s.success()).unwrap_or(false) { return true; }
    }
    false
}

pub fn run(steps: &[Step], lang: Lang) -> JumpResult {
    for s in steps {
        let r = match s {
            Step::DeepLink(u) if open_url(u) => Some(("deeplink", tr(lang, "Otworzono sesję w aplikacji", "Opened the session in the app").to_string())),
            Step::FocusProcess(p) if focus(*p) => Some(("focus", tr(lang, "Przełączono na okno sesji", "Switched to the session window").to_string())),
            Step::OpenTerminal { cwd, program, args } if terminal(cwd, program, args) => Some(("terminal", tr(lang, "Otworzono nowy terminal", "Opened a new terminal").to_string())),
            Step::Clipboard(t) => Some(("clipboard", if clipboard(t) { format!("{} {t}", tr(lang, "Skopiowano komendę:", "Copied the command:")) } else { format!("{} {t}", tr(lang, "Wznów ręcznie:", "Resume manually:")) })),
            _ => None,
        };
        if let Some((m, d)) = r { return JumpResult { method: m.into(), detail: d }; }
    }
    JumpResult { method: "none".into(), detail: tr(lang, "Nie udało się przejść do sesji", "Could not jump to the session").into() }
}

#[cfg(test)]
mod text_tests {
    use super::run;
    use pets_core::i18n::Lang;

    #[test]
    fn failure_text_is_translated() {
        assert_eq!(run(&[], Lang::En).detail, "Could not jump to the session");
        assert_eq!(run(&[], Lang::Pl).detail, "Nie udało się przejść do sesji");
    }
}
