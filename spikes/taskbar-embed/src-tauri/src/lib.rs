// Spike S1/S2: osadzenie przezroczystego okna Tauri w pasku zadań Windows 11.
// Kod wyrzucany; wyniki w docs/spikes/S1-S2-taskbar-embed.md.
use std::io::Write;
use std::time::{Duration, Instant};
use tauri::{Manager, RunEvent, WebviewUrl, WebviewWindowBuilder};
use windows::core::{w, PCWSTR};
use windows::Win32::Foundation::{HWND, POINT, RECT};
use windows::Win32::Graphics::Gdi::ScreenToClient;
use windows::Win32::UI::HiDpi::GetDpiForWindow;
use windows::Win32::UI::WindowsAndMessaging::*;

const STAGE_W: f64 = 400.0;

fn log(msg: &str) {
    let p = std::env::temp_dir().join("taskbar-embed.log");
    if let Ok(mut f) = std::fs::OpenOptions::new().create(true).append(true).open(p) {
        let t = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_millis();
        let _ = writeln!(f, "{t} {msg}");
    }
}

#[tauri::command]
fn js_log(msg: String) {
    log(&format!("js: {msg}"));
}

fn tray() -> Option<HWND> {
    unsafe { FindWindowW(w!("Shell_TrayWnd"), PCWSTR::null()).ok() }
}

/// Docelowy prostokąt sceny we współrzędnych klienta paska: (x, w, h).
fn target_rect(tray: HWND) -> windows::core::Result<(i32, i32, i32, f64)> {
    unsafe {
        let scale = GetDpiForWindow(tray) as f64 / 96.0;
        let mut tr = RECT::default();
        GetWindowRect(tray, &mut tr)?;
        let mut right = tr.right;
        if let Ok(n) = FindWindowExW(tray, HWND::default(), w!("TrayNotifyWnd"), PCWSTR::null()) {
            let mut nr = RECT::default();
            if GetWindowRect(n, &mut nr).is_ok() && nr.left > tr.left {
                right = nr.left;
            }
        }
        let w = (STAGE_W * scale) as i32;
        let h = tr.bottom - tr.top;
        let mut pt = POINT { x: right - w - (8.0 * scale) as i32, y: tr.top };
        let _ = ScreenToClient(tray, &mut pt);
        Ok((pt.x, w, h, scale))
    }
}

/// Dopasowanie pozycji i rozmiaru, gdy zmieni się DPI albo szerokość zasobnika.
fn place(hwnd: HWND, tray: HWND) {
    unsafe {
        let Ok((x, w, h, scale)) = target_rect(tray) else { return };
        let mut cur = RECT::default();
        if GetWindowRect(hwnd, &mut cur).is_err() { return; }
        let mut pt = POINT { x: cur.left, y: cur.top };
        let _ = ScreenToClient(tray, &mut pt);
        if pt.x != x || cur.right - cur.left != w || cur.bottom - cur.top != h {
            let _ = SetWindowPos(hwnd, HWND_TOP, x, 0, w, h, SWP_SHOWWINDOW | SWP_NOACTIVATE);
            log(&format!("relayout: x={x} {w}x{h} scale={scale}"));
        }
    }
}

fn embed(hwnd: HWND) -> windows::core::Result<HWND> {
    unsafe {
        let tray = FindWindowW(w!("Shell_TrayWnd"), PCWSTR::null())?;
        let scale = GetDpiForWindow(tray) as f64 / 96.0;
        let mut tr = RECT::default();
        GetWindowRect(tray, &mut tr)?;
        let mut right = tr.right;
        if let Ok(n) = FindWindowExW(tray, HWND::default(), w!("TrayNotifyWnd"), PCWSTR::null()) {
            let mut nr = RECT::default();
            if GetWindowRect(n, &mut nr).is_ok() && nr.left > tr.left {
                right = nr.left;
            }
        }
        let w = (STAGE_W * scale) as i32;
        let h = tr.bottom - tr.top;
        let mut pt = POINT { x: right - w - (8.0 * scale) as i32, y: tr.top };
        let _ = ScreenToClient(tray, &mut pt);
        let style = GetWindowLongW(hwnd, GWL_STYLE) as u32;
        let new_style = (style & !(WS_POPUP.0 | WS_CAPTION.0 | WS_THICKFRAME.0)) | WS_CHILD.0;
        SetWindowLongW(hwnd, GWL_STYLE, new_style as i32);
        SetParent(hwnd, tray)?;
        SetWindowPos(hwnd, HWND_TOP, pt.x, 0, w, h, SWP_SHOWWINDOW | SWP_FRAMECHANGED)?;
        log(&format!(
            "embed ok: tray={:?} dpi_scale={scale} taskbar_rect=({},{},{},{}) stage=({}, 0, {w}x{h})",
            tray.0, tr.left, tr.top, tr.right, tr.bottom, pt.x
        ));
        Ok(tray)
    }
}

fn hwnd_of(win: &tauri::WebviewWindow) -> HWND {
    HWND(win.hwnd().expect("hwnd").0 as _)
}

fn new_stage(app: &tauri::AppHandle, n: u32) -> tauri::Result<tauri::WebviewWindow> {
    WebviewWindowBuilder::new(app, format!("stage{n}"), WebviewUrl::default())
        .inner_size(400.0, 48.0)
        .decorations(false)
        .transparent(true)
        .skip_taskbar(true)
        .resizable(false)
        .shadow(false)
        .build()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            log("--- start");
            let win = app.get_webview_window("main").expect("main window");
            let hwnd = hwnd_of(&win);
            let first_tray = match embed(hwnd) {
                Ok(t) => t.0 as isize,
                Err(e) => { log(&format!("embed failed: {e}")); 0 }
            };
            let handle = app.handle().clone();
            let hwnd_raw = hwnd.0 as isize;
            // Natywne śledzenie myszy: WebView2 w oknie paska nie dostaje kliknięć,
            // więc czytamy stan przycisku i pozycję kursora sami (co 30 ms).
            let stage_for_mouse = std::sync::Arc::new(std::sync::atomic::AtomicIsize::new(hwnd_raw));
            let smouse = stage_for_mouse.clone();
            std::thread::spawn(move || {
                use windows::Win32::UI::Input::KeyboardAndMouse::{GetAsyncKeyState, VK_LBUTTON, VK_RBUTTON};
                let (mut was_l, mut was_r, mut was_in) = (false, false, false);
                loop {
                    std::thread::sleep(Duration::from_millis(30));
                    let h = HWND(smouse.load(std::sync::atomic::Ordering::Relaxed) as _);
                    let mut r = RECT::default();
                    let mut p = POINT::default();
                    unsafe {
                        if GetWindowRect(h, &mut r).is_err() || GetCursorPos(&mut p).is_err() { continue; }
                        let inside = p.x >= r.left && p.x < r.right && p.y >= r.top && p.y < r.bottom;
                        let l = (GetAsyncKeyState(VK_LBUTTON.0 as i32) as u16 & 0x8000) != 0;
                        let rb = (GetAsyncKeyState(VK_RBUTTON.0 as i32) as u16 & 0x8000) != 0;
                        if inside != was_in { log(&format!("native hover {}", if inside { "enter" } else { "leave" })); }
                        if inside && l && !was_l { log(&format!("native left click at {},{} (local {},{})", p.x, p.y, p.x - r.left, p.y - r.top)); }
                        if inside && rb && !was_r { log(&format!("native right click at {},{}", p.x, p.y)); }
                        was_l = l; was_r = rb; was_in = inside;
                    }
                }
            });
            // Watchdog: restart Explorera zmienia uchwyt Shell_TrayWnd; wtedy osadzamy ponownie
            // albo tworzymy nowe okno, jeśli stare zginęło razem z rodzicem.
            std::thread::spawn(move || {
                let mut last_tray = first_tray;
                let mut stage = hwnd_raw;
                let mut n = 1u32;
                loop {
                    std::thread::sleep(Duration::from_millis(1000));
                    let Some(t) = tray() else { continue };
                    if t.0 as isize == last_tray {
                        place(HWND(stage as _), t);
                        continue;
                    }
                    let started = Instant::now();
                    log(&format!("tray changed: {last_tray} -> {}", t.0 as isize));
                    last_tray = t.0 as isize;
                    let alive = unsafe { IsWindow(HWND(stage as _)).as_bool() };
                    log(&format!("old stage window alive: {alive}"));
                    if alive {
                        match embed(HWND(stage as _)) {
                            Ok(_) => log(&format!("re-embedded existing window in {:?}", started.elapsed())),
                            Err(e) => log(&format!("re-embed failed: {e}")),
                        }
                    } else {
                        let (tx, rx) = std::sync::mpsc::channel();
                        let h2 = handle.clone();
                        let _ = handle.run_on_main_thread(move || {
                            let r = new_stage(&h2, n).map(|w| hwnd_of(&w).0 as isize);
                            let _ = tx.send(r.map_err(|e| e.to_string()));
                        });
                        n += 1;
                        match rx.recv_timeout(Duration::from_secs(10)) {
                            Ok(Ok(h)) => {
                                stage = h;
                                stage_for_mouse.store(h, std::sync::atomic::Ordering::Relaxed);
                                match embed(HWND(h as _)) {
                                    Ok(_) => log(&format!("recreated + embedded new window in {:?}", started.elapsed())),
                                    Err(e) => log(&format!("embed of new window failed: {e}")),
                                }
                            }
                            other => log(&format!("recreate failed: {other:?}")),
                        }
                    }
                }
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![js_log])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|_app, event| {
            if let RunEvent::ExitRequested { api, code, .. } = event {
                if code.is_none() {
                    log("exit requested (last window closed) -> prevented");
                    api.prevent_exit();
                }
            }
        });
}
