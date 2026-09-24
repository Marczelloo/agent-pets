//! Pasek zadań Windows 11: uchwyty, pomiary (Win32 + UI Automation), osadzenie okna sceny.
use super::placement::{Metrics, Placement, Rect};
use windows::core::{w, PCWSTR};
use windows::Win32::Foundation::{HWND, RECT};
use windows::Win32::System::Com::{CoCreateInstance, CoInitializeEx, CLSCTX_INPROC_SERVER, COINIT_MULTITHREADED};
use windows::Win32::UI::Accessibility::{CUIAutomation, IUIAutomation, IUIAutomationElement, IUIAutomationTreeWalker};
use windows::Win32::UI::HiDpi::GetDpiForWindow;
use windows::Win32::UI::Shell::{SHQueryUserNotificationState, QUNS_BUSY, QUNS_PRESENTATION_MODE, QUNS_RUNNING_D3D_FULL_SCREEN};
use windows::Win32::UI::WindowsAndMessaging::*;

pub fn hwnd(raw: isize) -> HWND { HWND(raw as *mut core::ffi::c_void) }

pub fn tray() -> Option<HWND> { unsafe { FindWindowW(w!("Shell_TrayWnd"), PCWSTR::null()).ok() } }

pub fn rect_of(h: HWND) -> Option<Rect> {
    let mut r = RECT::default();
    unsafe { GetWindowRect(h, &mut r).ok()?; }
    Some(Rect { left: r.left, top: r.top, right: r.right, bottom: r.bottom })
}

pub fn scale_of(h: HWND) -> f64 {
    let d = unsafe { GetDpiForWindow(h) };
    if d == 0 { 1.0 } else { d as f64 / 96.0 }
}

pub fn is_window(raw: isize) -> bool { raw != 0 && unsafe { IsWindow(Some(hwnd(raw))).as_bool() } }

pub fn screen_rect() -> Rect {
    unsafe { Rect { left: 0, top: 0, right: GetSystemMetrics(SM_CXSCREEN), bottom: GetSystemMetrics(SM_CYSCREEN) } }
}

/// Aplikacja pełnoekranowa (gra, film, prezentacja): wtedy nie rysujemy.
pub fn fullscreen_app() -> bool {
    matches!(unsafe { SHQueryUserNotificationState() }, Ok(s) if s == QUNS_BUSY || s == QUNS_RUNNING_D3D_FULL_SCREEN || s == QUNS_PRESENTATION_MODE)
}

/// Elementy paska Win11 są w XAML i nie mają własnych HWND, więc koniec ikon mierzy UI Automation.
pub struct Uia { auto: IUIAutomation, walker: IUIAutomationTreeWalker }

impl Uia {
    pub fn new() -> windows::core::Result<Uia> {
        unsafe {
            let _ = CoInitializeEx(None, COINIT_MULTITHREADED);
            let auto: IUIAutomation = CoCreateInstance(&CUIAutomation, None, CLSCTX_INPROC_SERVER)?;
            let walker = auto.ControlViewWalker()?;
            Ok(Uia { auto, walker })
        }
    }

    fn find(&self, el: &IUIAutomationElement, id: &str, depth: u32) -> Option<IUIAutomationElement> {
        if depth > 3 { return None; }
        let mut c = unsafe { self.walker.GetFirstChildElement(el) }.ok();
        while let Some(ch) = c {
            if unsafe { ch.CurrentAutomationId() }.map(|b| b.to_string() == id).unwrap_or(false) { return Some(ch); }
            if let Some(f) = self.find(&ch, id, depth + 1) { return Some(f); }
            c = unsafe { self.walker.GetNextSiblingElement(&ch) }.ok();
        }
        None
    }

    /// Prawa krawędź ostatniego dziecka `TaskbarFrame` (Start, wyszukiwanie, przyciski aplikacji).
    pub fn icons_right(&self, tray: HWND) -> Option<i32> {
        let root = unsafe { self.auto.ElementFromHandle(tray) }.ok()?;
        let frame = self.find(&root, "TaskbarFrame", 0)?;
        let mut right: Option<i32> = None;
        let mut c = unsafe { self.walker.GetFirstChildElement(&frame) }.ok();
        while let Some(ch) = c {
            if let Ok(r) = unsafe { ch.CurrentBoundingRectangle() } {
                if r.right > r.left { right = Some(right.map_or(r.right, |x| x.max(r.right))); }
            }
            c = unsafe { self.walker.GetNextSiblingElement(&ch) }.ok();
        }
        right
    }
}

pub fn metrics(tray: HWND, uia: Option<&Uia>) -> Option<Metrics> {
    let r = rect_of(tray)?;
    let notify = unsafe { FindWindowExW(Some(tray), None, w!("TrayNotifyWnd"), PCWSTR::null()) }.ok()
        .and_then(rect_of).map(|n| n.left);
    Some(Metrics { tray: r, notify_left: notify, icons_right: uia.and_then(|u| u.icons_right(tray)), scale: scale_of(tray) })
}

pub fn embed(stage: HWND, tray: HWND) -> windows::core::Result<()> {
    unsafe {
        let style = GetWindowLongW(stage, GWL_STYLE) as u32;
        SetWindowLongW(stage, GWL_STYLE, ((style & !(WS_POPUP.0 | WS_CAPTION.0 | WS_THICKFRAME.0)) | WS_CHILD.0) as i32);
        SetParent(stage, Some(tray))?;
    }
    Ok(())
}

/// Osadzone okno: współrzędne klienta paska. Szerokość 0 → okno ukryte (brak treści albo miejsca).
pub fn apply(stage: HWND, p: Option<Placement>) {
    unsafe {
        match p {
            Some(p) if p.w > 0 => { let _ = SetWindowPos(stage, Some(HWND_TOP), p.x, 0, p.w, p.h, SWP_SHOWWINDOW | SWP_NOACTIVATE | SWP_FRAMECHANGED); }
            _ => { let _ = ShowWindow(stage, SW_HIDE); }
        }
    }
}

/// Plan awaryjny, gdy `SetParent` zawiedzie: zwykłe okno tuż nad paskiem, na tej samej pozycji.
pub fn apply_floating(stage: HWND, m: &Metrics, p: Option<Placement>) {
    unsafe {
        match p {
            Some(p) if p.w > 0 => { let _ = SetWindowPos(stage, Some(HWND_TOPMOST), m.tray.left + p.x, m.tray.top - p.h, p.w, p.h, SWP_SHOWWINDOW | SWP_NOACTIVATE); }
            _ => { let _ = ShowWindow(stage, SW_HIDE); }
        }
    }
}

pub fn show_no_activate(h: HWND) {
    unsafe {
        let _ = ShowWindow(h, SW_SHOWNOACTIVATE);
        let _ = SetWindowPos(h, Some(HWND_TOPMOST), 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE | SWP_SHOWWINDOW);
    }
}
