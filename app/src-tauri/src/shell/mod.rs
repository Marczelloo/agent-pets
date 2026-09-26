//! Okno sceny w pasku zadań: osadzenie, pętla układu, odtwarzanie po restarcie Explorera, widoczność.
pub mod memo;
pub mod placement;
pub mod pointer;
mod taskbar;

use pets_core::settings::{Align, Position, Stage};
use placement::{Anchor, Mode};
use pointer::Drag;
use serde::Serialize;
use std::sync::atomic::{AtomicIsize, AtomicU8, Ordering};
use std::sync::mpsc::{channel, Receiver, RecvTimeoutError, Sender};
use std::sync::Arc;
use std::time::Duration;
use tauri::{AppHandle, Emitter, WebviewUrl, WebviewWindow, WebviewWindowBuilder};

pub enum Cmd {
    Width(f64),
    Hello,
    /// zmieniły się ustawienia sceny: przelicz od razu
    Settings,
    /// „Przesuń”: wejście w tryb przesuwania albo wyjście (`MoveDone`: zatwierdź albo cofnij)
    Move(bool),
    MoveDone(bool),
    Drag(Drag),
}

/// Układ dla sceny: wolne miejsce, wysokość, skala; od 0.7 też tryb okna, jasność paska
/// i to, czy tryb „lewa” musiał wrócić do zasobnika (notka w karcie „Pasek”).
#[derive(Serialize, Clone, Copy, PartialEq, Debug)]
pub struct Layout {
    pub max_css: f64,
    pub height_css: f64,
    pub scale: f64,
    pub mode: &'static str,
    pub light: bool,
    pub left_fallback: bool,
}

pub struct Shell { tx: Sender<Cmd>, pub stage: Arc<AtomicIsize> }

/// Kotwica okna według wyrównania z ustawień.
pub fn anchor_of(a: Align) -> Anchor { match a { Align::Left => Anchor::Left, Align::Center => Anchor::Center, Align::Right => Anchor::Right } }
fn align_of(a: Anchor) -> Align { match a { Anchor::Left => Align::Left, Anchor::Center => Align::Center, Anchor::Right => Align::Right } }

/// Tryb pozycji w pasku z ustawień (pływające obsługuje osobna gałąź pętli).
pub fn mode_of(st: &Stage) -> Mode {
    match (st.position, st.custom_at) {
        (Position::Left, _) => Mode::Left,
        (Position::Custom, Some(at)) => Mode::Custom { at, anchor: anchor_of(st.align) },
        _ => Mode::Right,
    }
}

/// Trwające „Przesuń”: kotwica w chwili chwycenia (px ekranu) i bieżąca pozycja.
struct Moving { anchor: Anchor, at: f64, grab: Option<i32> }

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
        let mode = Arc::new(AtomicU8::new(pointer::NORMAL));
        let m = mode.clone();
        std::thread::spawn(move || run(a, rx, s, m));
        pointer::spawn(app.clone(), stage.clone(), mode, tx.clone());
        Ok(Shell { tx, stage })
    }

    pub fn set_width(&self, css: f64) { let _ = self.tx.send(Cmd::Width(css)); }
    /// Nowo załadowana strona prosi o ponowne wysłanie układu i widoczności.
    pub fn hello(&self) { let _ = self.tx.send(Cmd::Hello); }
    pub fn settings_changed(&self) { let _ = self.tx.send(Cmd::Settings); }
    pub fn start_move(&self) { let _ = self.tx.send(Cmd::Move(true)); }

    pub fn stage_origin(&self) -> Option<(i32, i32, f64)> {
        let h = taskbar::hwnd(self.stage.load(Ordering::Relaxed));
        let r = taskbar::rect_of(h)?;
        Some((r.left, r.top, taskbar::scale_of(h)))
    }
}

/// Gra, film albo prezentacja na pełnym ekranie.
pub fn fullscreen_app() -> bool { taskbar::fullscreen_app() }

pub fn screen_size() -> (i32, i32) { let r = taskbar::screen_rect(); (r.right, r.bottom) }

/// Prostokąt paska zadań, ekran i skala DPI paska (do ustawienia panelu nad paskiem).
pub fn taskbar_geometry() -> Option<(placement::Rect, placement::Rect, f64)> {
    let t = taskbar::tray()?;
    Some((taskbar::rect_of(t)?, taskbar::screen_rect(), taskbar::scale_of(t)))
}

pub fn show_no_activate(w: &WebviewWindow) { if let Ok(h) = w.hwnd() { taskbar::show_no_activate(h); } }

/// Chowa okno pokazane przez `show_no_activate`. Musi iść przez Win32: Tauri nie wie o pokazaniu
/// przez `ShowWindow`, uważa okno za ukryte i jego `hide()` nic nie robi.
pub fn hide(w: &WebviewWindow) { if let Ok(h) = w.hwnd() { taskbar::hide(h); } }

/// Tworzy nowe okno sceny na wątku głównym (stare zginęło razem z paskiem).
fn recreate(app: &AppHandle, n: u32) -> Option<isize> {
    let (tx, rx) = channel();
    let h = app.clone();
    app.run_on_main_thread(move || { let _ = tx.send(build_stage(&h, &format!("stage{n}")).map(|w| raw(&w))); }).ok()?;
    rx.recv_timeout(Duration::from_secs(10)).ok()?.ok()
}

fn run(app: AppHandle, rx: Receiver<Cmd>, stage: Arc<AtomicIsize>, pmode: Arc<AtomicU8>) {
    use tauri::Manager;
    let uia = taskbar::Uia::new().ok();
    if uia.is_none() { eprintln!("agent-pets: UI Automation niedostępne, scena zostanie mała przy zasobniku"); }
    let (mut want, mut last_tray, mut floating, mut n) = (0.0f64, 0isize, false, 1u32);
    let mut last_layout: Option<Layout> = None;
    let mut last_visible: Option<bool> = None;
    let mut moving: Option<Moving> = None;
    let set_moving = |on: bool| {
        pmode.store(if on { pointer::MOVING } else { pointer::NORMAL }, Ordering::Relaxed);
        let _ = app.emit("pets://moving", on);
    };
    loop {
        let mut msgs = Vec::new();
        match rx.recv_timeout(Duration::from_millis(1000)) {
            Ok(c) => { msgs.push(c); msgs.extend(rx.try_iter()); }
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
        let st = app.state::<crate::settings::SettingsState>().get().stage;
        let width = (m.tray.right - m.tray.left).max(1) as f64;
        let px_of = |at: f64| m.tray.left + (at * width).round() as i32;
        for c in msgs {
            match c {
                Cmd::Width(w) => want = w,
                Cmd::Hello => { last_layout = None; last_visible = None; }
                Cmd::Settings => {}
                Cmd::Move(true) if moving.is_none() && st.position != Position::Floating => {
                    let mode = mode_of(&st);
                    let anchor = match mode { Mode::Left => Anchor::Left, Mode::Custom { anchor, .. } => anchor, Mode::Right => Anchor::Right };
                    let Some(p) = placement::place_mode(&m, want, mode) else { continue };
                    let x = m.tray.left + p.x + match anchor { Anchor::Left => 0, Anchor::Center => p.w / 2, Anchor::Right => p.w };
                    moving = Some(Moving { anchor, at: placement::custom_at(&m, x), grab: None });
                    set_moving(true);
                }
                Cmd::Move(_) => {}
                Cmd::Drag(d) => if let Some(mv) = moving.as_mut() {
                    match d {
                        Drag::Start => mv.grab = Some(px_of(mv.at)),
                        Drag::Move { dx, .. } => if let Some(g) = mv.grab { mv.at = placement::custom_at(&m, g + dx) },
                        Drag::End | Drag::Click { .. } => mv.grab = None,
                    }
                },
                Cmd::MoveDone(commit) => if let Some(mv) = moving.take() {
                    set_moving(false);
                    if commit {
                        let (at, align) = (mv.at, align_of(mv.anchor));
                        if let Err(e) = crate::settings::update(&app, |s| { s.stage.position = Position::Custom; s.stage.custom_at = Some(at); s.stage.align = align; }) {
                            eprintln!("agent-pets: {e}");
                        }
                    }
                },
            }
        }
        // ustawienia sprzed zapisu: w tym obrocie pozycja z przesuwania
        let mode = match &moving { Some(mv) => Mode::Custom { at: mv.at, anchor: mv.anchor }, None => mode_of(&st) };
        let p = placement::place_mode(&m, want, mode);
        if let Some(p) = p {
            let l = Layout { max_css: p.max_css.floor(), height_css: p.height_css, scale: m.scale, mode: "taskbar",
                light: crate::system::light_taskbar(), left_fallback: p.left_fallback && st.position == Position::Left };
            if last_layout != Some(l) { let _ = app.emit("pets://layout", l); last_layout = Some(l); }
        }
        if floating { taskbar::apply_floating(taskbar::hwnd(h), &m, p) } else { taskbar::apply(taskbar::hwnd(h), p) }
        let vis = placement::taskbar_visible(m.tray, taskbar::screen_rect()) && !taskbar::fullscreen_app();
        if last_visible != Some(vis) { let _ = app.emit("pets://visibility", vis); last_visible = Some(vis); }
    }
}
