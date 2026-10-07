//! Spike S1/S2 (0.7): paski wszystkich monitorów, monitory, dzieci paska z UIA, próba osadzenia na drugim pasku.
//! Wypisuje tylko AutomationId, ClassName i prostokąty (bez nazw, które mogą zawierać tytuły okien).
use windows::core::{w, BOOL, PCWSTR};
use windows::Win32::Foundation::{HWND, LPARAM, RECT};
use windows::Win32::Graphics::Gdi::{GetMonitorInfoW, MonitorFromWindow, MONITORINFOEXW, MONITOR_DEFAULTTONEAREST};
use windows::Win32::System::Com::{CoCreateInstance, CoInitializeEx, CLSCTX_INPROC_SERVER, COINIT_MULTITHREADED};
use windows::Win32::UI::Accessibility::{CUIAutomation, IUIAutomation, IUIAutomationElement, IUIAutomationTreeWalker};
use windows::Win32::UI::WindowsAndMessaging::*;

unsafe extern "system" fn collect(h: HWND, l: LPARAM) -> BOOL {
    let out = &mut *(l.0 as *mut Vec<(HWND, String)>);
    let mut buf = [0u16; 64];
    let n = GetClassNameW(h, &mut buf);
    let cls = String::from_utf16_lossy(&buf[..n as usize]);
    if cls == "Shell_TrayWnd" || cls == "Shell_SecondaryTrayWnd" { out.push((h, cls)); }
    BOOL(1)
}

fn rect(h: HWND) -> RECT { let mut r = RECT::default(); unsafe { let _ = GetWindowRect(h, &mut r); } r }
fn fmt(r: &RECT) -> String { format!("[{},{} → {},{}] {}×{}", r.left, r.top, r.right, r.bottom, r.right - r.left, r.bottom - r.top) }

fn dump(auto: &IUIAutomation, walker: &IUIAutomationTreeWalker, el: &IUIAutomationElement, depth: usize) {
    if depth > 4 { return; }
    let mut c = unsafe { walker.GetFirstChildElement(el) }.ok();
    while let Some(ch) = c {
        let id = unsafe { ch.CurrentAutomationId() }.map(|b| b.to_string()).unwrap_or_default();
        let cls = unsafe { ch.CurrentClassName() }.map(|b| b.to_string()).unwrap_or_default();
        let r = unsafe { ch.CurrentBoundingRectangle() }.unwrap_or_default();
        println!("{}- id={:?} class={:?} {}", "  ".repeat(depth), id, cls, fmt(&r));
        dump(auto, walker, &ch, depth + 1);
        c = unsafe { walker.GetNextSiblingElement(&ch) }.ok();
    }
}

fn main() {
    let embed = std::env::args().any(|a| a == "--embed");
    unsafe {
        let _ = CoInitializeEx(None, COINIT_MULTITHREADED);
        let mut bars: Vec<(HWND, String)> = Vec::new();
        let _ = EnumWindows(Some(collect), LPARAM(&mut bars as *mut _ as isize));
        println!("paski: {}", bars.len());
        let auto: IUIAutomation = CoCreateInstance(&CUIAutomation, None, CLSCTX_INPROC_SERVER).unwrap();
        let walker = auto.ControlViewWalker().unwrap();
        for (h, cls) in &bars {
            let mon = MonitorFromWindow(*h, MONITOR_DEFAULTTONEAREST);
            let mut mi = MONITORINFOEXW::default();
            mi.monitorInfo.cbSize = std::mem::size_of::<MONITORINFOEXW>() as u32;
            let _ = GetMonitorInfoW(mon, &mut mi as *mut _ as *mut _);
            let dev = String::from_utf16_lossy(&mi.szDevice).trim_end_matches('\0').to_string();
            println!("\n== {cls} {} | monitor {dev} primary={} mon={} work={}", fmt(&rect(*h)),
                mi.monitorInfo.dwFlags & 1 == 1, fmt(&mi.monitorInfo.rcMonitor), fmt(&mi.monitorInfo.rcWork));
            let notify = FindWindowExW(Some(*h), None, w!("TrayNotifyWnd"), PCWSTR::null()).ok();
            println!("TrayNotifyWnd: {}", notify.map(|n| fmt(&rect(n))).unwrap_or("brak".into()));
            if let Ok(root) = auto.ElementFromHandle(*h) { dump(&auto, &walker, &root, 0); }
            if embed && cls == "Shell_SecondaryTrayWnd" {
                let s = CreateWindowExW(WINDOW_EX_STYLE(0), w!("STATIC"), w!("s07"), WS_POPUP, 0, 0, 120, 30, None, None, None, None).unwrap();
                let style = GetWindowLongW(s, GWL_STYLE) as u32;
                SetWindowLongW(s, GWL_STYLE, ((style & !WS_POPUP.0) | WS_CHILD.0) as i32);
                let ok = SetParent(s, Some(*h)).is_ok();
                let _ = SetWindowPos(s, Some(HWND_TOP), 400, 0, 120, 30, SWP_SHOWWINDOW | SWP_NOACTIVATE);
                println!("embed: SetParent ok={ok} visible={} parent_is_bar={}", IsWindowVisible(s).as_bool(),
                    GetParent(s).map(|p| p == *h).unwrap_or(false));
                std::thread::sleep(std::time::Duration::from_secs(4));
                let _ = DestroyWindow(s);
            }
        }
    }
}
