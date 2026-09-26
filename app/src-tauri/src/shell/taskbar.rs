//! Pasek zadań Windows 11: uchwyty, pomiary (Win32 + UI Automation), osadzenie okna sceny.
use super::memo::KeyedCache;
use super::placement::{Metrics, Placement, Rect};
use std::cell::RefCell;
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
pub struct Uia { auto: IUIAutomation, walker: IUIAutomationTreeWalker, frame: RefCell<KeyedCache<isize, IUIAutomationElement>> }

impl Uia {
    pub fn new() -> windows::core::Result<Uia> {
        unsafe {
            let _ = CoInitializeEx(None, COINIT_MULTITHREADED);
            let auto: IUIAutomation = CoCreateInstance(&CUIAutomation, None, CLSCTX_INPROC_SERVER)?;
            let walker = auto.ControlViewWalker()?;
            Ok(Uia { auto, walker, frame: RefCell::new(KeyedCache::new()) })
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

    /// Krawędzie grupy ikon z dzieci `TaskbarFrame` (spike S1/S2): prawa krawędź ostatniego elementu,
    /// lewa krawędź Startu (albo pierwszego elementu) i prawa krawędź tego, co stoi przed Startem (Widżety).
    pub fn edges(&self, tray: HWND) -> Option<Edges> {
        let frame = self.frame.borrow_mut().get(tray.0 as isize, || {
            let root = unsafe { self.auto.ElementFromHandle(tray) }.ok()?;
            self.find(&root, "TaskbarFrame", 0)
        })?;
        let mut boxes: Vec<(i32, i32, bool)> = Vec::new();
        let mut c = unsafe { self.walker.GetFirstChildElement(&frame) }.ok();
        while let Some(ch) = c {
            if let Ok(r) = unsafe { ch.CurrentBoundingRectangle() } {
                let start = unsafe { ch.CurrentAutomationId() }.map(|b| b.to_string() == "StartButton").unwrap_or(false);
                if r.right > r.left { boxes.push((r.left, r.right, start)); }
            }
            c = unsafe { self.walker.GetNextSiblingElement(&ch) }.ok();
        }
        // element nieaktualny (np. przebudowany pasek): następnym razem szukamy od nowa
        if boxes.is_empty() { self.frame.borrow_mut().invalidate(); return None; }
        Some(edges_of(&boxes))
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Default)]
pub struct Edges { pub icons_right: Option<i32>, pub first_left: Option<i32>, pub widgets_right: Option<i32> }

/// `(left, right, czy to Start)` dzieci `TaskbarFrame` → krawędzie grupy ikon.
pub fn edges_of(boxes: &[(i32, i32, bool)]) -> Edges {
    let icons_right = boxes.iter().map(|b| b.1).max();
    let first_left = boxes.iter().find(|b| b.2).map(|b| b.0).or_else(|| boxes.iter().map(|b| b.0).min());
    let widgets_right = first_left.and_then(|f| boxes.iter().filter(|b| b.1 <= f).map(|b| b.1).max());
    Edges { icons_right, first_left, widgets_right }
}

pub fn metrics(tray: HWND, uia: Option<&Uia>) -> Option<Metrics> {
    let r = rect_of(tray)?;
    let notify = unsafe { FindWindowExW(Some(tray), None, w!("TrayNotifyWnd"), PCWSTR::null()) }.ok()
        .and_then(rect_of).map(|n| n.left);
    let e = uia.and_then(|u| u.edges(tray)).unwrap_or_default();
    Some(Metrics { tray: r, notify_left: notify, icons_right: e.icons_right, first_left: e.first_left, widgets_right: e.widgets_right, scale: scale_of(tray) })
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

pub fn hide(h: HWND) { unsafe { let _ = ShowWindow(h, SW_HIDE); } }

pub fn show_no_activate(h: HWND) {
    unsafe {
        let _ = ShowWindow(h, SW_SHOWNOACTIVATE);
        let _ = SetWindowPos(h, Some(HWND_TOPMOST), 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE | SWP_SHOWWINDOW);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn edges_from_the_taskbar_children() {
        // spike S2: Start 882–927, wyszukiwanie, ikony do 1679
        let e = edges_of(&[(882, 927, true), (929, 1149, false), (1151, 1195, false), (1635, 1679, false)]);
        assert_eq!(e, Edges { icons_right: Some(1679), first_left: Some(882), widgets_right: None });
        let w = edges_of(&[(0, 160, false), (882, 927, true), (1635, 1679, false)]);
        assert_eq!(w.widgets_right, Some(160));
        let no_start = edges_of(&[(900, 950, false), (1000, 1044, false)]);
        assert_eq!((no_start.first_left, no_start.icons_right), (Some(900), Some(1044)));
    }

    #[test]
    fn hide_undoes_show_no_activate() {
        // Regresja: tooltip pokazany przez Win32 nie znikał, bo chowaliśmy go przez Tauri (`hide()`),
        // które nie wiedziało o pokazaniu i nic nie robiło.
        unsafe {
            let h = CreateWindowExW(WS_EX_TOOLWINDOW, w!("STATIC"), w!("agent-pets-test"), WS_POPUP,
                0, 0, 50, 20, None, None, None, None).unwrap();
            show_no_activate(h);
            assert!(IsWindowVisible(h).as_bool());
            hide(h);
            assert!(!IsWindowVisible(h).as_bool());
            let _ = DestroyWindow(h);
        }
    }
}
