//! Windows 11 taskbar: handles, measurements (Win32 + UI Automation), stage-window embedding.
use super::memo::KeyedCache;
use super::placement::{Metrics, MonitorInfo, Placement, Rect};
use std::cell::RefCell;
use windows::core::{w, BOOL, PCWSTR};
use windows::Win32::Foundation::{HWND, LPARAM, RECT};
use windows::Win32::Graphics::Gdi::{EnumDisplayMonitors, GetMonitorInfoW, MonitorFromWindow, HDC, HMONITOR, MONITORINFO, MONITORINFOEXW, MONITOR_DEFAULTTONEAREST};
use windows::Win32::System::Com::{CoCreateInstance, CoInitializeEx, CLSCTX_INPROC_SERVER, COINIT_MULTITHREADED};
use windows::Win32::UI::Accessibility::{CUIAutomation, IUIAutomation, IUIAutomationElement, IUIAutomationTreeWalker};
use windows::Win32::UI::HiDpi::{GetDpiForMonitor, GetDpiForWindow, MDT_EFFECTIVE_DPI};
use windows::Win32::UI::Shell::{SHQueryUserNotificationState, QUNS_BUSY, QUNS_PRESENTATION_MODE, QUNS_RUNNING_D3D_FULL_SCREEN};
use windows::Win32::UI::WindowsAndMessaging::*;

pub type Handle = HWND;

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

/// Fullscreen app (game, movie, presentation): do not render then.
pub fn fullscreen_app() -> bool {
    matches!(unsafe { SHQueryUserNotificationState() }, Ok(s) if s == QUNS_BUSY || s == QUNS_RUNNING_D3D_FULL_SCREEN || s == QUNS_PRESENTATION_MODE)
}

/// Win11 taskbar elements use XAML and have no HWNDs, so UI Automation measures the end of the icons.
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
            if unsafe { ch.CurrentAutomationId() }.map(|b| b == id).unwrap_or(false) { return Some(ch); }
            if let Some(f) = self.find(&ch, id, depth + 1) { return Some(f); }
            c = unsafe { self.walker.GetNextSiblingElement(&ch) }.ok();
        }
        None
    }

    /// Icon-group edges from `TaskbarFrame` children (spikes S1/S2): right edge of the last item,
    /// left edge of Start (or the first item), and right edge of items before Start (Widgets).
    pub fn edges(&self, tray: HWND) -> Option<Edges> {
        let frame = self.frame.borrow_mut().get(tray.0 as isize, || {
            let root = unsafe { self.auto.ElementFromHandle(tray) }.ok()?;
            self.find(&root, "TaskbarFrame", 0)
        })?;
        let mut boxes: Vec<(i32, i32, bool)> = Vec::new();
        let mut c = unsafe { self.walker.GetFirstChildElement(&frame) }.ok();
        while let Some(ch) = c {
            if let Ok(r) = unsafe { ch.CurrentBoundingRectangle() } {
                let start = unsafe { ch.CurrentAutomationId() }.map(|b| b == "StartButton").unwrap_or(false);
                if r.right > r.left { boxes.push((r.left, r.right, start)); }
            }
            c = unsafe { self.walker.GetNextSiblingElement(&ch) }.ok();
        }
        // stale element (e.g. rebuilt taskbar): search again next time
        if boxes.is_empty() { self.frame.borrow_mut().invalidate(); return None; }
        Some(edges_of(&boxes))
    }
}

impl Uia {
    /// Left edge of the clock and tray icons on a secondary taskbar (no `TrayNotifyWnd` there): `SystemTray.*` items.
    pub fn tray_left(&self, bar: HWND) -> Option<i32> {
        let root = unsafe { self.auto.ElementFromHandle(bar) }.ok()?;
        let mut best: Option<i32> = None;
        let mut stack = vec![(root, 0u32)];
        while let Some((el, depth)) = stack.pop() {
            let mut c = unsafe { self.walker.GetFirstChildElement(&el) }.ok();
            while let Some(ch) = c {
                let cls = unsafe { ch.CurrentClassName() }.map(|b| b.to_string()).unwrap_or_default();
                if cls.starts_with("SystemTray.") {
                    if let Ok(r) = unsafe { ch.CurrentBoundingRectangle() } { if r.right > r.left { best = Some(best.map_or(r.left, |b| b.min(r.left))); } }
                } else if depth < 1 {
                    stack.push((ch.clone(), depth + 1));
                }
                c = unsafe { self.walker.GetNextSiblingElement(&ch) }.ok();
            }
        }
        best
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Default)]
pub struct Edges { pub icons_right: Option<i32>, pub first_left: Option<i32>, pub widgets_right: Option<i32> }

/// `(left, right, is Start)` for `TaskbarFrame` children → icon-group edges.
pub fn edges_of(boxes: &[(i32, i32, bool)]) -> Edges {
    let icons_right = boxes.iter().map(|b| b.1).max();
    let first_left = boxes.iter().find(|b| b.2).map(|b| b.0).or_else(|| boxes.iter().map(|b| b.0).min());
    let widgets_right = first_left.and_then(|f| boxes.iter().filter(|b| b.1 <= f).map(|b| b.1).max());
    Edges { icons_right, first_left, widgets_right }
}

pub fn metrics(tray: HWND, uia: Option<&Uia>) -> Option<Metrics> {
    let r = rect_of(tray)?;
    let notify = unsafe { FindWindowExW(Some(tray), None, w!("TrayNotifyWnd"), PCWSTR::null()) }.ok()
        .and_then(rect_of).map(|n| n.left)
        .or_else(|| uia.and_then(|u| u.tray_left(tray)));
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

/// Embedded window: taskbar client coordinates. Width 0 → hidden window (no content or space).
pub fn apply(stage: HWND, p: Option<Placement>) {
    unsafe {
        match p {
            Some(p) if p.w > 0 => { let _ = SetWindowPos(stage, Some(HWND_TOP), p.x, 0, p.w, p.h, SWP_SHOWWINDOW | SWP_NOACTIVATE | SWP_FRAMECHANGED); }
            _ => { let _ = ShowWindow(stage, SW_HIDE); }
        }
    }
}

/// Fallback when `SetParent` fails: ordinary window just above the taskbar, at the same position.
pub fn apply_floating(stage: HWND, m: &Metrics, p: Option<Placement>) {
    unsafe {
        match p {
            Some(p) if p.w > 0 => { let _ = SetWindowPos(stage, Some(HWND_TOPMOST), m.tray.left + p.x, m.tray.top - p.h, p.w, p.h, SWP_SHOWWINDOW | SWP_NOACTIVATE); }
            _ => { let _ = ShowWindow(stage, SW_HIDE); }
        }
    }
}

/// Monitor with work area, scale, and taskbar (if Windows shows one there).
pub struct Mon { pub info: MonitorInfo, pub monitor: Rect, pub work: Rect, pub scale: f64, pub bar: Option<Handle> }

/// Platform handle as a plain number (the stage-loop bookkeeping stores `isize`).
pub fn handle_raw(h: Handle) -> isize { h.0 as isize }

fn rect_from(r: &RECT) -> Rect { Rect { left: r.left, top: r.top, right: r.right, bottom: r.bottom } }

fn monitor_info(h: HMONITOR) -> Option<(String, Rect, Rect, bool)> {
    let mut mi = MONITORINFOEXW::default();
    mi.monitorInfo.cbSize = std::mem::size_of::<MONITORINFOEXW>() as u32;
    unsafe { GetMonitorInfoW(h, &mut mi as *mut _ as *mut MONITORINFO).ok().ok()?; }
    let dev = String::from_utf16_lossy(&mi.szDevice).trim_end_matches('\0').to_string();
    Some((dev, rect_from(&mi.monitorInfo.rcMonitor), rect_from(&mi.monitorInfo.rcWork), mi.monitorInfo.dwFlags & MONITORINFOF_PRIMARY != 0))
}

/// Taskbars on all monitors: primary `Shell_TrayWnd` and `Shell_SecondaryTrayWnd` (spike S1).
fn bars() -> Vec<HWND> {
    unsafe extern "system" fn collect(h: HWND, l: LPARAM) -> BOOL {
        let out = &mut *(l.0 as *mut Vec<HWND>);
        let mut buf = [0u16; 64];
        let n = GetClassNameW(h, &mut buf);
        let cls = String::from_utf16_lossy(&buf[..n.max(0) as usize]);
        if cls == "Shell_TrayWnd" || cls == "Shell_SecondaryTrayWnd" { out.push(h); }
        BOOL(1)
    }
    let mut out: Vec<HWND> = Vec::new();
    unsafe { let _ = EnumWindows(Some(collect), LPARAM(&mut out as *mut _ as isize)); }
    out
}

pub fn monitors() -> Vec<Mon> {
    unsafe extern "system" fn collect(h: HMONITOR, _: HDC, _: *mut RECT, l: LPARAM) -> BOOL {
        (&mut *(l.0 as *mut Vec<HMONITOR>)).push(h);
        BOOL(1)
    }
    let mut hs: Vec<HMONITOR> = Vec::new();
    unsafe { let _ = EnumDisplayMonitors(None, None, Some(collect), LPARAM(&mut hs as *mut _ as isize)); }
    let bars: Vec<(HWND, isize)> = bars().into_iter().map(|b| (b, unsafe { MonitorFromWindow(b, MONITOR_DEFAULTTONEAREST) }.0 as isize)).collect();
    hs.iter().enumerate().filter_map(|(i, h)| {
        let (id, monitor, work, primary) = monitor_info(*h)?;
        let (mut dx, mut dy) = (0u32, 0u32);
        let scale = unsafe { GetDpiForMonitor(*h, MDT_EFFECTIVE_DPI, &mut dx, &mut dy) }.ok().map(|_| dx as f64 / 96.0).filter(|s| *s > 0.0).unwrap_or(1.0);
        let bar = bars.iter().find(|(_, m)| *m == h.0 as isize).map(|(b, _)| *b);
        Some(Mon { info: MonitorInfo { id, primary, width: monitor.right - monitor.left, height: monitor.bottom - monitor.top, index: i as u32 + 1, has_bar: bar.is_some() },
            monitor, work, scale, bar })
    }).collect()
}

/// Monitor containing the window (monitor and work-area rectangles).
pub fn monitor_of(h: HWND) -> Option<(Rect, Rect)> {
    let m = unsafe { MonitorFromWindow(h, MONITOR_DEFAULTTONEAREST) };
    monitor_info(m).map(|(_, mon, work, _)| (mon, work))
}

/// Floating window: restore an ordinary top-level window (no parent), always on top and without focus.
pub fn detach(stage: HWND) {
    unsafe {
        let _ = SetParent(stage, None);
        let style = GetWindowLongW(stage, GWL_STYLE) as u32;
        SetWindowLongW(stage, GWL_STYLE, ((style & !WS_CHILD.0) | WS_POPUP.0) as i32);
        let ex = GetWindowLongW(stage, GWL_EXSTYLE) as u32;
        SetWindowLongW(stage, GWL_EXSTYLE, (ex | WS_EX_TOOLWINDOW.0 | WS_EX_NOACTIVATE.0) as i32);
    }
}

pub fn apply_rect(stage: HWND, r: Option<Rect>) {
    unsafe {
        match r {
            Some(r) if r.right > r.left => { let _ = SetWindowPos(stage, Some(HWND_TOPMOST), r.left, r.top, r.right - r.left, r.bottom - r.top, SWP_SHOWWINDOW | SWP_NOACTIVATE | SWP_FRAMECHANGED); }
            _ => { let _ = ShowWindow(stage, SW_HIDE); }
        }
    }
}

/// Pointer transparency (like Tauri's `set_ignore_cursor_events`): clicks go to the window beneath.
pub fn passthrough(stage: HWND, on: bool) {
    unsafe {
        let ex = GetWindowLongW(stage, GWL_EXSTYLE) as u32;
        let bits = WS_EX_TRANSPARENT.0 | WS_EX_LAYERED.0;
        let new = if on { ex | bits } else { ex & !WS_EX_TRANSPARENT.0 };
        if new != ex { SetWindowLongW(stage, GWL_EXSTYLE, new as i32); }
    }
}

/// Parent-window rectangle (the taskbar embedding the stage).
pub fn parent_rect(h: HWND) -> Option<Rect> { unsafe { GetParent(h) }.ok().and_then(rect_of) }

pub fn hide(h: HWND) { unsafe { let _ = ShowWindow(h, SW_HIDE); } }

pub fn is_visible(h: HWND) -> bool { unsafe { windows::Win32::UI::WindowsAndMessaging::IsWindowVisible(h).as_bool() } }

pub fn no_activate(h: HWND) {
    unsafe {
        let ex = GetWindowLongW(h, GWL_EXSTYLE) as u32;
        SetWindowLongW(h, GWL_EXSTYLE, (ex | WS_EX_TOOLWINDOW.0 | WS_EX_NOACTIVATE.0) as i32);
    }
}

/// Cursor relative to window (CSS pixels at window DPI) and left button.
pub fn cursor_rel(h: HWND) -> Option<(f64, f64, bool)> {
    use windows::Win32::Foundation::{POINT, RECT};
    use windows::Win32::UI::HiDpi::GetDpiForWindow;
    use windows::Win32::UI::Input::KeyboardAndMouse::{GetAsyncKeyState, VK_LBUTTON};
    use windows::Win32::UI::WindowsAndMessaging::{GetCursorPos, GetWindowRect};
    unsafe {
        let mut r = RECT::default();
        GetWindowRect(h, &mut r).ok()?;
        let mut p = POINT::default();
        GetCursorPos(&mut p).ok()?;
        let dpi = GetDpiForWindow(h);
        let scale = if dpi == 0 { 1.0 } else { dpi as f64 / 96.0 };
        let left = (GetAsyncKeyState(VK_LBUTTON.0 as i32) as u16 & 0x8000) != 0;
        Some(((p.x - r.left) as f64 / scale, (p.y - r.top) as f64 / scale, left))
    }
}

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
        // spike S2: Start 882–927, search, icons through 1679
        let e = edges_of(&[(882, 927, true), (929, 1149, false), (1151, 1195, false), (1635, 1679, false)]);
        assert_eq!(e, Edges { icons_right: Some(1679), first_left: Some(882), widgets_right: None });
        let w = edges_of(&[(0, 160, false), (882, 927, true), (1635, 1679, false)]);
        assert_eq!(w.widgets_right, Some(160));
        let no_start = edges_of(&[(900, 950, false), (1000, 1044, false)]);
        assert_eq!((no_start.first_left, no_start.icons_right), (Some(900), Some(1044)));
    }

    #[test]
    fn hide_undoes_show_no_activate() {
        // Regression: a tooltip shown through Win32 did not disappear when hidden through Tauri (`hide()`),
        // which did not know it was shown and did nothing.
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
