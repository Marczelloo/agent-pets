//! Pasek zadań Windows 11: uchwyty, pomiary (Win32 + UI Automation), osadzenie okna sceny.
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

impl Uia {
    /// Lewa krawędź zegara i ikon zasobnika drugiego paska (tam nie ma `TrayNotifyWnd`): elementy `SystemTray.*`.
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

/// Monitor z obszarem roboczym, skalą i paskiem zadań (jeśli Windows go tam pokazuje).
pub struct Mon { pub info: MonitorInfo, pub monitor: Rect, pub work: Rect, pub scale: f64, pub bar: Option<HWND> }

fn rect_from(r: &RECT) -> Rect { Rect { left: r.left, top: r.top, right: r.right, bottom: r.bottom } }

fn monitor_info(h: HMONITOR) -> Option<(String, Rect, Rect, bool)> {
    let mut mi = MONITORINFOEXW::default();
    mi.monitorInfo.cbSize = std::mem::size_of::<MONITORINFOEXW>() as u32;
    unsafe { GetMonitorInfoW(h, &mut mi as *mut _ as *mut MONITORINFO).ok().ok()?; }
    let dev = String::from_utf16_lossy(&mi.szDevice).trim_end_matches('\0').to_string();
    Some((dev, rect_from(&mi.monitorInfo.rcMonitor), rect_from(&mi.monitorInfo.rcWork), mi.monitorInfo.dwFlags & MONITORINFOF_PRIMARY != 0))
}

/// Paski zadań wszystkich monitorów: główny `Shell_TrayWnd` i `Shell_SecondaryTrayWnd` (spike S1).
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

/// Monitor, na którym jest okno (prostokąt monitora i obszaru roboczego).
pub fn monitor_of(h: HWND) -> Option<(Rect, Rect)> {
    let m = unsafe { MonitorFromWindow(h, MONITOR_DEFAULTTONEAREST) };
    monitor_info(m).map(|(_, mon, work, _)| (mon, work))
}

/// Okno pływające: z powrotem zwykłe okno najwyższego poziomu (bez rodzica), zawsze na wierzchu, bez fokusu.
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

/// Przezroczystość dla myszy (jak `set_ignore_cursor_events` w Tauri): kliknięcia trafiają do okna pod spodem.
pub fn passthrough(stage: HWND, on: bool) {
    unsafe {
        let ex = GetWindowLongW(stage, GWL_EXSTYLE) as u32;
        let bits = WS_EX_TRANSPARENT.0 | WS_EX_LAYERED.0;
        let new = if on { ex | bits } else { ex & !WS_EX_TRANSPARENT.0 };
        if new != ex { SetWindowLongW(stage, GWL_EXSTYLE, new as i32); }
    }
}

/// Prostokąt rodzica okna (paska, w którym scena jest osadzona).
pub fn parent_rect(h: HWND) -> Option<Rect> { unsafe { GetParent(h) }.ok().and_then(rect_of) }

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
