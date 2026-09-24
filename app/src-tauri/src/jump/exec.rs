//! Wykonanie kroków „Przejdź”. Pierwszy udany krok kończy łańcuch; schowek zawsze kończy łańcuch.
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
    let mut p = pid;
    for _ in 0..6 {
        if let Some(h) = window_of(p) { return Some(h); }
        p = pets_core::pid::process_entry(p)?.0;
        if p == 0 { return None; }
    }
    None
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

pub fn run(steps: &[Step]) -> JumpResult {
    for s in steps {
        let r = match s {
            Step::DeepLink(u) if deep_link(u) => Some(("deeplink", "Otworzono sesję w aplikacji".to_string())),
            Step::FocusProcess(p) if focus(*p) => Some(("focus", "Przełączono na okno sesji".to_string())),
            Step::OpenTerminal { cwd, program, args } if terminal(cwd, program, args) => Some(("terminal", "Otworzono nowy terminal".to_string())),
            Step::Clipboard(t) => Some(("clipboard", if clipboard(t) { format!("Skopiowano komendę: {t}") } else { format!("Wznów ręcznie: {t}") })),
            _ => None,
        };
        if let Some((m, d)) = r { return JumpResult { method: m.into(), detail: d }; }
    }
    JumpResult { method: "none".into(), detail: "Nie udało się przejść do sesji".into() }
}
