//! Okno sceny w pasku zadań: osadzenie, pętla układu, odtwarzanie po restarcie Explorera, widoczność.
pub mod memo;
pub mod placement;
pub mod pointer;
mod taskbar;

use serde::Serialize;
use std::sync::atomic::{AtomicIsize, Ordering};
use std::sync::mpsc::{channel, Receiver, RecvTimeoutError, Sender};
use std::sync::Arc;
use std::time::Duration;
use tauri::{AppHandle, Emitter, WebviewUrl, WebviewWindow, WebviewWindowBuilder};

pub enum Cmd { Width(f64), Hello }

#[derive(Serialize, Clone, Copy, PartialEq, Debug)]
pub struct Layout { pub max_css: f64, pub height_css: f64, pub scale: f64 }

pub struct Shell { tx: Sender<Cmd>, pub stage: Arc<AtomicIsize> }

pub fn build_stage(app: &AppHandle, label: &str) -> tauri::Result<WebviewWindow> {
    WebviewWindowBuilder::new(app, label, WebviewUrl::App("index.html".into()))
        .title("agent-pets-stage").inner_size(400.0, 48.0).decorations(false).transparent(true)
        .always_on_top(true).skip_taskbar(true).resizable(false).shadow(false).focused(false).visible(false)
        .build()
}

fn raw(w: &WebviewWindow) -> isize { w.hwnd().map(|h| h.0 as isize).unwrap_or(0) }

impl Shell {
    pub fn start(app: &AppHandle) -> tauri::Result<Shell> {
        let win = build_stage(app, "stage0")?;
        let stage = Arc::new(AtomicIsize::new(raw(&win)));
        let (tx, rx) = channel();
        let (a, s) = (app.clone(), stage.clone());
        std::thread::spawn(move || run(a, rx, s));
        pointer::spawn(app.clone(), stage.clone());
        Ok(Shell { tx, stage })
    }

    pub fn set_width(&self, css: f64) { let _ = self.tx.send(Cmd::Width(css)); }
    /// Nowo załadowana strona prosi o ponowne wysłanie układu i widoczności.
    pub fn hello(&self) { let _ = self.tx.send(Cmd::Hello); }

    pub fn stage_origin(&self) -> Option<(i32, i32, f64)> {
        let h = taskbar::hwnd(self.stage.load(Ordering::Relaxed));
        let r = taskbar::rect_of(h)?;
        Some((r.left, r.top, taskbar::scale_of(h)))
    }
}

pub fn screen_size() -> (i32, i32) { let r = taskbar::screen_rect(); (r.right, r.bottom) }

pub fn show_no_activate(w: &WebviewWindow) { if let Ok(h) = w.hwnd() { taskbar::show_no_activate(h); } }

/// Tworzy nowe okno sceny na wątku głównym (stare zginęło razem z paskiem).
fn recreate(app: &AppHandle, n: u32) -> Option<isize> {
    let (tx, rx) = channel();
    let h = app.clone();
    app.run_on_main_thread(move || { let _ = tx.send(build_stage(&h, &format!("stage{n}")).map(|w| raw(&w))); }).ok()?;
    rx.recv_timeout(Duration::from_secs(10)).ok()?.ok()
}

fn run(app: AppHandle, rx: Receiver<Cmd>, stage: Arc<AtomicIsize>) {
    let uia = taskbar::Uia::new().ok();
    if uia.is_none() { eprintln!("agent-pets: UI Automation niedostępne, scena zostanie mała przy zasobniku"); }
    let (mut want, mut last_tray, mut floating, mut n) = (0.0f64, 0isize, false, 1u32);
    let mut last_layout: Option<Layout> = None;
    let mut last_visible: Option<bool> = None;
    loop {
        match rx.recv_timeout(Duration::from_millis(1000)) {
            Ok(Cmd::Width(w)) => want = w,
            Ok(Cmd::Hello) => { last_layout = None; last_visible = None; }
            Err(RecvTimeoutError::Timeout) => {}
            Err(RecvTimeoutError::Disconnected) => return,
        }
        let Some(tray) = taskbar::tray() else { continue };
        let mut h = stage.load(Ordering::Relaxed);
        if tray.0 as isize != last_tray {
            // pierwszy start albo restart Explorera (nowy uchwyt paska)
            if !taskbar::is_window(h) {
                let Some(nh) = recreate(&app, n) else { continue };
                n += 1;
                h = nh;
                stage.store(nh, Ordering::Relaxed);
                last_layout = None;
                last_visible = None;
            }
            floating = taskbar::embed(taskbar::hwnd(h), tray).is_err();
            if floating { eprintln!("agent-pets: osadzenie w pasku nie powiodło się, okno pływające"); }
            last_tray = tray.0 as isize;
        }
        let Some(m) = taskbar::metrics(tray, uia.as_ref()) else { continue };
        let p = placement::place(&m, want);
        if let Some(p) = p {
            let l = Layout { max_css: p.max_css.floor(), height_css: p.height_css, scale: m.scale };
            if last_layout != Some(l) { let _ = app.emit("pets://layout", l); last_layout = Some(l); }
        }
        if floating { taskbar::apply_floating(taskbar::hwnd(h), &m, p) } else { taskbar::apply(taskbar::hwnd(h), p) }
        let vis = placement::taskbar_visible(m.tray, taskbar::screen_rect()) && !taskbar::fullscreen_app();
        if last_visible != Some(vis) { let _ = app.emit("pets://visibility", vis); last_visible = Some(vis); }
    }
}
