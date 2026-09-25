//! Wykonanie kroków „Przejdź”. Pierwszy udany krok kończy łańcuch; schowek zawsze kończy łańcuch.
use pets_core::i18n::{tr, Lang};
use super::{JumpResult, Step};
use std::os::windows::process::CommandExt;
use windows::core::{BOOL, HSTRING, PCWSTR};
use windows::Win32::Foundation::{HANDLE, HWND, LPARAM};
use windows::Win32::System::DataExchange::{CloseClipboard, EmptyClipboard, OpenClipboard, SetClipboardData};
use windows::Win32::System::Memory::{GlobalAlloc, GlobalLock, GlobalUnlock, GMEM_MOVEABLE};
use windows::Win32::UI::Input::KeyboardAndMouse::{keybd_event, KEYEVENTF_KEYUP, VK_MENU};
use windows::Win32::UI::Shell::ShellExecuteW;
use windows::Win32::UI::WindowsAndMessaging::*;

const CF_UNICODETEXT: u32 = 13;

fn deep_link(url: &str) -> bool {
    let r = unsafe { ShellExecuteW(None, &HSTRING::from("open"), &HSTRING::from(url), PCWSTR::null(), PCWSTR::null(), SW_SHOWNORMAL) };
    r.0 as isize > 32
}

/// Widoczne okno najwyższego poziomu z tytułem, należące do `pid`.
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

/// Okno sesji: sam proces albo najbliższy przodek z oknem (claude.exe ← pwsh ← WindowsTerminal).
pub fn session_window(pid: u32) -> Option<HWND> {
    owner_pid(pid, pets_core::pid::process_entry, |p| window_of(p).is_some()).and_then(window_of)
}

/// Najbliższy proces z oknem, idąc w górę drzewa od `pid`. `entry(p)` zwraca (rodzic, plik exe procesu `p`).
pub(crate) fn owner_pid(pid: u32, entry: impl Fn(u32) -> Option<(u32, String)>, has_window: impl Fn(u32) -> bool) -> Option<u32> {
    // Procesy powłoki systemu: ich okna (Eksplorator, pulpit) nie są oknem sesji, więc tu wspinaczka się kończy.
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
        // powłoka uruchomiona z Eksploratora: rodzicem jest explorer.exe, którego okno to nie okno sesji
        assert_eq!(owner_pid(11, tree, |p| p == 31), None);
    }
}

fn focus(pid: u32) -> bool {
    let Some(h) = session_window(pid) else { return false };
    unsafe {
        if IsIconic(h).as_bool() { let _ = ShowWindow(h, SW_RESTORE); }
        if SetForegroundWindow(h).as_bool() { return true; }
        // Windows odmawia fokusu procesowi w tle (np. po kliknięciu toastu). Naciśnięcie Alt zdejmuje tę blokadę.
        keybd_event(VK_MENU.0 as u8, 0, Default::default(), 0);
        keybd_event(VK_MENU.0 as u8, 0, KEYEVENTF_KEYUP, 0);
        SetForegroundWindow(h).as_bool()
    }
}

fn terminal(cwd: &str, program: &str, args: &[String]) -> bool {
    use std::process::Command;
    // `wt` dzieli swój wiersz poleceń na średnikach, więc katalog ze średnikiem idzie od razu do zapasowej ścieżki.
    if !cwd.contains(';') && Command::new("wt.exe").arg("-d").arg(cwd).arg(program).args(args).spawn().is_ok() {
        return true;
    }
    Command::new("powershell").args(["-NoExit", "-Command", program]).args(args).current_dir(cwd)
        .creation_flags(0x0000_0010) // CREATE_NEW_CONSOLE
        .spawn().is_ok()
}

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

pub fn run(steps: &[Step], lang: Lang) -> JumpResult {
    for s in steps {
        let r = match s {
            Step::DeepLink(u) if deep_link(u) => Some(("deeplink", tr(lang, "Otworzono sesję w aplikacji", "Opened the session in the app").to_string())),
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
