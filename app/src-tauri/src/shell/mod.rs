//! Stage window in the taskbar: embedding, layout loop, recovery after Explorer restart, visibility.
pub mod memo;
pub mod menu;
pub mod placement;
pub mod pointer;
#[cfg(windows)]
mod taskbar_windows;
#[cfg(target_os = "linux")]
mod taskbar_linux;
#[cfg(windows)]
use taskbar_windows as taskbar;
#[cfg(target_os = "linux")]
use taskbar_linux as taskbar;
/// GTK reads (widget visibility, monitor queries) must run on the main thread on Linux.
#[cfg(target_os = "linux")]
pub use taskbar_linux::on_main;
/// Windows: window calls are thread-safe, run inline.
#[cfg(windows)]
pub fn on_main<T>(f: impl FnOnce() -> T) -> Option<T> { Some(f()) }

use pets_core::settings::{Align, Position, Stage};
use placement::{Anchor, Mode};
use pointer::Drag;
use serde::Serialize;
use std::sync::atomic::{AtomicIsize, AtomicU8, Ordering};
use std::sync::mpsc::{channel, Receiver, RecvTimeoutError, Sender};
use std::sync::Arc;
use std::time::Duration;
use tauri::{AppHandle, Emitter, WebviewUrl, WebviewWindow, WebviewWindowBuilder};

#[derive(Debug)]
pub enum Cmd {
    Width(f64),
    Hello,
    /// Stage settings changed: recalculate immediately.
    Settings,
    /// "Move": enter or leave move mode (`MoveDone`: confirm or cancel).
    Move(bool),
    MoveDone(bool),
    Drag(Drag),
}

/// Stage layout: free space, height, scale; since 0.7 also window mode, taskbar brightness,
/// and whether "left" mode had to fall back to the tray (note in the "Taskbar" tab).
#[derive(Serialize, Clone, Copy, PartialEq, Debug)]
pub struct Layout {
    pub max_css: f64,
    pub height_css: f64,
    pub scale: f64,
    pub mode: &'static str,
    pub light: bool,
    pub left_fallback: bool,
    /// Taskbar docked to the left or right edge: the stage floats beside it (note in the "Taskbar" tab).
    pub vertical_bar: bool,
}

/// `layout`: most recently sent layout (a later settings window also sees the note about left-side icons).
pub struct Shell { tx: Sender<Cmd>, pub stage: Arc<AtomicIsize>, mode: Arc<AtomicU8>, layout: Arc<std::sync::Mutex<Option<Layout>>> }

/// Window anchor according to alignment in settings.
pub fn anchor_of(a: Align) -> Anchor { match a { Align::Left => Anchor::Left, Align::Center => Anchor::Center, Align::Right => Anchor::Right } }
fn align_of(a: Anchor) -> Align { match a { Anchor::Left => Align::Left, Anchor::Center => Align::Center, Anchor::Right => Align::Right } }

/// Taskbar position mode from settings (a separate loop branch handles floating mode).
pub fn mode_of(st: &Stage) -> Mode {
    match (st.position, st.custom_at) {
        (Position::Left, _) => Mode::Left,
        (Position::Custom, Some(at)) => Mode::Custom { at, anchor: anchor_of(st.align), dock: st.dock },
        _ => Mode::Right,
    }
}

/// What to do with the stage window's parent. `parent`: `None` before the first cycle (unknown window state),
/// `Some(0)` top-level window, `Some(taskbar)` embedded.
#[derive(Debug, PartialEq)]
pub enum Attach { Embed(isize), Detach, Keep }

pub fn attach(parent: Option<isize>, bar: Option<isize>) -> Attach {
    match (parent, bar) {
        (p, Some(b)) if p != Some(b) => Attach::Embed(b),
        (Some(0), None) => Attach::Keep,
        (_, None) => Attach::Detach,
        _ => Attach::Keep,
    }
}

/// Interval for retrying taskbar embedding after `SetParent` fails (e.g. just after login while Explorer starts).
pub const EMBED_RETRY_MS: u64 = 2_000;

/// `attach`, and after failed embedding (fallback window above the taskbar), retry on that taskbar after `EMBED_RETRY_MS`.
pub fn attach_or_retry(parent: Option<isize>, bar: Option<isize>, failed: bool, since_ms: u64) -> Attach {
    match (attach(parent, bar), bar) {
        (Attach::Keep, Some(b)) if failed && since_ms >= EMBED_RETRY_MS => Attach::Embed(b),
        (a, _) => a,
    }
}

/// Reposition the floating window when the target changes or Windows changes it (e.g. `WM_DPICHANGED`
/// scaled it from its old size after moving to a monitor with a different scale).
pub fn needs_apply(target: Option<placement::Rect>, last: Option<placement::Rect>, actual: Option<placement::Rect>) -> bool {
    target != last || (target.is_some() && actual != target)
}

/// Always handle width and "welcome" immediately (they must survive a temporary missing taskbar);
/// queue the rest. Return whether the page requests another layout send.
pub fn take_basic(pending: &mut Vec<Cmd>, want: &mut f64) -> bool {
    let mut hello = false;
    pending.retain(|c| match c {
        Cmd::Width(w) => { *want = *w; false }
        Cmd::Hello => { hello = true; false }
        _ => true,
    });
    hello
}

/// Whether to remeasure taskbar and monitors. Dragging alone (up to ~33 times per second) uses measurements
/// at most one second old: enumerating monitors and traversing UI Automation are costly.
pub fn remeasure(pending: &[Cmd], age: Option<Duration>) -> bool {
    let only_drags = !pending.is_empty() && pending.iter().all(|c| matches!(c, Cmd::Drag(_)));
    !only_drags || age.is_none_or(|a| a >= Duration::from_secs(1))
}

/// Active "Move": anchor at grab time (screen pixels) and current position.
struct Moving { anchor: Anchor, at: f64, grab: Option<i32> }

pub fn build_stage(app: &AppHandle, label: &str) -> tauri::Result<WebviewWindow> {
    let win = WebviewWindowBuilder::new(app, label, WebviewUrl::App("index.html".into()))
        .title("agent-pets-stage").inner_size(400.0, 48.0).decorations(false).transparent(true)
        .always_on_top(true).skip_taskbar(true)
        // Linux: `resizable(false)` freezes GTK size hints (min=max) at the natural webview size
        // and later `set_size` is ignored; the undecorated strip is not user-resizable in practice anyway.
        .resizable(cfg!(target_os = "linux")).shadow(false).focused(false).visible(false)
        .build()?;
    #[cfg(target_os = "linux")]
    taskbar::register(app.clone(), &win);
    Ok(win)
}

/// Window id for the platform backend (HWND number on Windows, registry id on Linux).
#[cfg(windows)]
fn raw(w: &WebviewWindow) -> isize { w.hwnd().map(|h| h.0 as isize).unwrap_or(0) }
#[cfg(not(windows))]
fn raw(w: &WebviewWindow) -> isize { taskbar::id_of(w) }

/// Stage handle for the platform backend.
#[cfg(windows)]
fn handle_of(s: &AtomicIsize) -> taskbar::Handle { taskbar::hwnd(s.load(Ordering::Relaxed)) }
#[cfg(not(windows))]
fn handle_of(s: &AtomicIsize) -> taskbar::Handle { taskbar::hwnd(s.load(Ordering::Relaxed)) }

impl Shell {
    pub fn start(app: &AppHandle) -> tauri::Result<Shell> {
        let win = build_stage(app, "stage0")?;
        let stage = Arc::new(AtomicIsize::new(raw(&win)));
        let (tx, rx) = channel();
        let (a, s) = (app.clone(), stage.clone());
        let mode = Arc::new(AtomicU8::new(pointer::NORMAL));
        let layout = Arc::new(std::sync::Mutex::new(None));
        let (m, l) = (mode.clone(), layout.clone());
        std::thread::spawn(move || run(a, rx, s, m, l));
        pointer::spawn(app.clone(), stage.clone(), mode.clone(), tx.clone());
        Ok(Shell { tx, stage, mode, layout })
    }

    pub fn set_width(&self, css: f64) { let _ = self.tx.send(Cmd::Width(css)); }
    /// Newly loaded page requests another layout and visibility send.
    pub fn hello(&self) { let _ = self.tx.send(Cmd::Hello); }
    pub fn settings_changed(&self) { let _ = self.tx.send(Cmd::Settings); }
    pub fn start_move(&self) { let _ = self.tx.send(Cmd::Move(true)); }
    fn hwnd(&self) -> taskbar::Handle { handle_of(&self.stage) }
    pub fn floating(&self) -> bool { self.mode.load(Ordering::Relaxed) == pointer::FLOATING }
    pub fn layout(&self) -> Option<Layout> { *self.layout.lock().unwrap() }

    /// Pass clicks through transparent parts of the floating window (does nothing in taskbar mode).
    pub fn passthrough(&self, on: bool) {
        let on = on && self.floating();
        pointer::PASSTHROUGH.store(on, Ordering::Relaxed);
        taskbar::passthrough(self.hwnd(), on);
    }

    /// Stage window is shown (not hidden due to a hidden taskbar, fullscreen app, or lack of space).
    pub fn stage_shown(&self) -> bool { taskbar::is_visible(self.hwnd()) }

    /// Stage, its monitor and scale: for positioning the tooltip.
    pub fn stage_geom(&self) -> Option<(placement::Rect, placement::Rect, f64)> {
        let h = self.hwnd();
        let (monitor, _) = taskbar::monitor_of(h)?;
        Some((taskbar::rect_of(h)?, monitor, taskbar::scale_of(h)))
    }

    /// Where to open the panel: at the stage monitor's taskbar or beside the floating stage.
    pub fn panel_at(&self) -> Option<PanelAt> {
        let h = self.hwnd();
        let (monitor, work) = taskbar::monitor_of(h)?;
        let scale = taskbar::scale_of(h);
        if self.floating() { return Some(PanelAt::Near { stage: taskbar::rect_of(h)?, work, scale }); }
        Some(PanelAt::Taskbar { bar: taskbar::parent_rect(h), monitor, scale })
    }
}

pub enum PanelAt {
    Taskbar { bar: Option<placement::Rect>, monitor: placement::Rect, scale: f64 },
    Near { stage: placement::Rect, work: placement::Rect, scale: f64 },
}

/// Monitors for the "Taskbar" tab.
pub fn monitors() -> Vec<placement::MonitorInfo> { taskbar::monitors().into_iter().map(|m| m.info).collect() }

/// Fullscreen game, movie, or presentation.
pub fn fullscreen_app() -> bool { taskbar::fullscreen_app() }

/// Resolve the Hyprland IPC socket path once, while single-threaded (startup).
#[cfg(not(windows))]
pub fn init_hyprland_socket() { taskbar::init_hyprland_socket() }

/// Pid of the compositor's active window (Linux): "is the session window in the foreground".
#[cfg(not(windows))]
pub fn active_window_pid() -> Option<u32> { taskbar::active_window_pid() }

pub fn screen_size() -> (i32, i32) { let r = taskbar::screen_rect(); (r.right, r.bottom) }

/// Taskbar rectangle, screen, and taskbar DPI scale (for placing the panel above it).
/// Linux: the strip stands in for the taskbar.
#[cfg(windows)]
pub fn taskbar_geometry() -> Option<(placement::Rect, placement::Rect, f64)> {
    let t = taskbar::tray()?;
    Some((taskbar::rect_of(t)?, taskbar::screen_rect(), taskbar::scale_of(t)))
}
#[cfg(not(windows))]
pub fn taskbar_geometry() -> Option<(placement::Rect, placement::Rect, f64)> { taskbar::taskbar_geometry() }

/// Window id for the platform backend (HWND number on Windows, registry id on Linux).
#[cfg(windows)]
fn win_id(w: &WebviewWindow) -> isize { w.hwnd().map(|h| h.0 as isize).unwrap_or(0) }
#[cfg(not(windows))]
fn win_id(w: &WebviewWindow) -> isize { taskbar::id_of(w) }

pub fn show_no_activate(w: &WebviewWindow) { let h = win_id(w); if h != 0 { taskbar::show_no_activate(taskbar::hwnd(h)); } }

/// Hide a window shown by `show_no_activate`. On Windows it must use Win32: Tauri does not know it was shown
/// by `ShowWindow`, considers it hidden, and its `hide()` does nothing. On Linux Tauri did the showing.
#[cfg(windows)]
pub fn hide(w: &WebviewWindow) { if let Ok(h) = w.hwnd() { taskbar::hide(h); } }
#[cfg(not(windows))]
pub fn hide(w: &WebviewWindow) { let h = win_id(w); if h != 0 { taskbar::hide(taskbar::hwnd(h)); } }

/// Show without activation: clicking it does not take focus from the active window (bubble window).
pub fn no_activate(w: &WebviewWindow) { let h = win_id(w); if h != 0 { taskbar::no_activate(taskbar::hwnd(h)); } }

/// Pass pointer events through the entire window (bubbles: yes outside bubbles, no over a bubble).
pub fn set_passthrough(w: &WebviewWindow, on: bool) { let h = win_id(w); if h != 0 { taskbar::passthrough(taskbar::hwnd(h), on); } }

/// Size and position a window in physical pixels. On Linux the taskbar backend goes through GTK
/// (`gtk_window`, type hints), so the call is routed to the main thread when it arrives from
/// a background thread (bubble clicks run on their own thread); tao setters are channel-based.
pub fn place_window(w: &WebviewWindow, r: placement::Rect, dock: bool) {
    #[cfg(windows)]
    {
        let _ = w.set_size(tauri::PhysicalSize::new((r.right - r.left).max(1) as u32, (r.bottom - r.top).max(1) as u32));
        let _ = w.set_position(tauri::PhysicalPosition::new(r.left, r.top));
    }
    #[cfg(not(windows))]
    {
        let w = w.clone();
        let _ = taskbar::on_main(move || taskbar::place(&w, r, dock));
    }
}

/// Cursor relative to the window in CSS pixels and left-button state.
pub struct Cursor { pub x: f64, pub y: f64, pub left: bool }

pub fn cursor_in(w: &WebviewWindow) -> Option<Cursor> {
    let h = win_id(w);
    let (x, y, left) = taskbar::cursor_rel(taskbar::hwnd(h))?;
    Some(Cursor { x, y, left })
}

/// Create a new stage window on the main thread (the old one died with the taskbar).
fn recreate(app: &AppHandle, n: u32) -> Option<isize> {
    let (tx, rx) = channel();
    let h = app.clone();
    app.run_on_main_thread(move || { let _ = tx.send(build_stage(&h, &format!("stage{n}")).map(|w| raw(&w))); }).ok()?;
    rx.recv_timeout(Duration::from_secs(10)).ok()?.ok()
}

/// Dragging a floating window: rectangle at grab time and current anchor.
struct FloatDrag { from: placement::Rect, at: (f64, f64) }

fn run(app: AppHandle, rx: Receiver<Cmd>, stage: Arc<AtomicIsize>, pmode: Arc<AtomicU8>, shared: Arc<std::sync::Mutex<Option<Layout>>>) {
    use tauri::Manager;
    let uia = taskbar::Uia::new().ok();
    if uia.is_none() { pets_core::app_log!("UI Automation unavailable; stage will stay small near the tray"); }
    let (mut want, mut n) = (0.0f64, 1u32);
    // stage window parent: taskbar handle (0 = top-level window, None = not yet determined)
    let (mut parent, mut embed_failed): (Option<isize>, bool) = (None, false);
    let mut embed_failed_at: Option<std::time::Instant> = None;
    let mut pending: Vec<Cmd> = Vec::new();
    // latest monitor and taskbar measurement (dragging uses it for up to one second)
    let mut measured: Option<(std::time::Instant, Vec<taskbar::Mon>)> = None;
    let mut bar_metrics: Option<(isize, placement::Metrics)> = None;
    let mut last_layout: Option<Layout> = None;
    let mut last_visible: Option<bool> = None;
    let mut moving: Option<Moving> = None;
    let mut dragging: Option<FloatDrag> = None;
    let mut last_rect: Option<placement::Rect> = None;
    let set_pmode = |m: u8| {
        let old = pmode.swap(m, Ordering::Relaxed);
        if (old == pointer::MOVING) != (m == pointer::MOVING) { let _ = app.emit("pets://moving", m == pointer::MOVING); }
    };
    loop {
        match rx.recv_timeout(Duration::from_millis(1000)) {
            Ok(c) => { pending.push(c); pending.extend(rx.try_iter()); }
            Err(RecvTimeoutError::Timeout) => {}
            Err(RecvTimeoutError::Disconnected) => return,
        }
        if take_basic(&mut pending, &mut want) { last_layout = None; last_visible = None; }
        let st = app.state::<crate::settings::SettingsState>().get().stage;
        let fresh = remeasure(&pending, measured.as_ref().map(|(t, _)| t.elapsed()));
        if fresh || measured.is_none() { measured = Some((std::time::Instant::now(), taskbar::monitors())); }
        let Some((_, mons)) = measured.as_ref() else { continue };
        let float_mode = st.position == Position::Floating;
        let chosen = placement::pick(&mons.iter().map(|m| (m.info.clone(), m.bar.is_some())).collect::<Vec<_>>(), &st.monitor, float_mode);
        let Some(mon) = mons.get(chosen) else { continue };
        // A taskbar docked to the left or right edge: the embedded layout assumes a horizontal bar,
        // so the stage floats in the work area beside it.
        let bar_rect = if float_mode { None } else { mon.bar.or_else(taskbar::tray).and_then(taskbar::rect_of) };
        let vertical = bar_rect.map(|r| placement::bar_side(r, mon.monitor)).filter(|s| s.vertical());
        let bar_hidden = bar_rect.is_some_and(|r| !placement::taskbar_visible(r, mon.monitor));
        let float = float_mode || vertical.is_some();
        let bar = if float { None } else { mon.bar.or_else(taskbar::tray) };
        if !float && bar.is_none() { continue; }
        let mut h = stage.load(Ordering::Relaxed);
        if !taskbar::is_window(h) {
            // window died with the taskbar when Explorer restarted
            let Some(nh) = recreate(&app, n) else { continue };
            n += 1;
            h = nh;
            stage.store(nh, Ordering::Relaxed);
            parent = None;
            last_layout = None;
            last_visible = None;
            last_rect = None;
        }
        let hw = taskbar::hwnd(h);
        let since = embed_failed_at.map(|t| t.elapsed().as_millis() as u64).unwrap_or(0);
        match attach_or_retry(parent, bar.map(|b| b.raw()), embed_failed, since) {
            Attach::Embed(b) => {
                // from the floating window: in the taskbar, clicks are always ours
                pointer::PASSTHROUGH.store(false, Ordering::Relaxed);
                taskbar::passthrough(hw, false);
                embed_failed = taskbar::embed(hw, taskbar::hwnd(b)).is_err();
                embed_failed_at = embed_failed.then(std::time::Instant::now);
                if embed_failed { pets_core::app_log!("taskbar embedding failed; window remains above taskbar until retry"); }
                parent = Some(b);
                last_layout = None;
            }
            Attach::Detach => {
                taskbar::detach(hw);
                parent = Some(0);
                embed_failed = false;
                embed_failed_at = None;
                last_layout = None;
                last_rect = None;
            }
            Attach::Keep => {}
        }
        if float {
            moving = None;
            set_pmode(pointer::FLOATING);
            let size = st.size.clamp(pets_core::settings::SIZE.0, pets_core::settings::SIZE.1) as f64;
            let h_css = 48.0 * size / 100.0;
            let anchor = anchor_of(st.align);
            let saved = st.floating_at.map(|p| (p.x, p.y));
            for c in std::mem::take(&mut pending) {
                match c {
                    Cmd::Drag(Drag::Start) => if let Some(r) = last_rect {
                        dragging = Some(FloatDrag { from: r, at: placement::float_anchor(mon.work, r, anchor, mon.scale) });
                    },
                    Cmd::Drag(Drag::Move { dx, dy }) => if let Some(d) = dragging.as_mut() {
                        let r = placement::Rect { left: d.from.left + dx, top: d.from.top + dy, right: d.from.right + dx, bottom: d.from.bottom + dy };
                        d.at = placement::float_anchor(mon.work, r, anchor, mon.scale);
                    },
                    Cmd::Drag(Drag::End) => if let Some(d) = dragging.take() {
                        let r = placement::float_rect(mon.work, Some(d.at), anchor, want, h_css, mon.scale);
                        let (x, y) = placement::float_anchor(mon.work, r, anchor, mon.scale);
                        let beside = vertical.is_some();
                        let corner = if beside { placement::snap_corner(mon.work, r, mon.scale) } else { None };
                        if let Err(e) = crate::settings::update(&app, |s| {
                            s.stage.floating_at = Some(pets_core::settings::Point { x, y });
                            if beside { s.stage.dock = corner; }
                        }) {
                            pets_core::app_log!("{e}");
                        }
                    },
                    Cmd::Width(_) | Cmd::Hello | Cmd::Settings | Cmd::Move(_) | Cmd::MoveDone(_) | Cmd::Drag(_) => {}
                }
            }
            let at = dragging.as_ref().map(|d| d.at).or(saved);
            let l = Layout { max_css: ((mon.work.right - mon.work.left) as f64 / mon.scale - 16.0).floor(), height_css: h_css,
                scale: mon.scale, mode: "floating", light: crate::system::light_taskbar(), left_fallback: false, vertical_bar: vertical.is_some() };
            if last_layout != Some(l) { let _ = app.emit("pets://layout", l); last_layout = Some(l); *shared.lock().unwrap() = Some(l); }
            // beside an auto-hidden vertical bar the stage goes away with it, like an embedded one
            let vis = !taskbar::fullscreen_app() && !bar_hidden;
            if last_visible != Some(vis) { let _ = app.emit("pets://visibility", vis); last_visible = Some(vis); }
            // glued to a corner beside a vertical bar: the position follows the work area, not saved pixels
            let corner = vertical.and(st.dock).filter(|d| matches!(d, placement::Dock::Top | placement::Dock::Bottom));
            let r = (want > 0.0 && vis).then(|| match (vertical, dragging.is_some(), corner, at) {
                (Some(side), false, Some(d), _) => placement::beside_vertical_bar(mon.work, side, d == placement::Dock::Top, want, h_css, mon.scale),
                (Some(side), _, _, None) => placement::beside_vertical_bar(mon.work, side, false, want, h_css, mon.scale),
                _ => placement::float_rect(mon.work, at, anchor, want, h_css, mon.scale),
            });
            if needs_apply(r, last_rect, taskbar::rect_of(hw)) { taskbar::apply_rect(hw, r); last_rect = r; }
            continue;
        }
        dragging = None;
        last_rect = None;
        if moving.is_none() { set_pmode(pointer::NORMAL); }
        let Some(b) = bar else { continue };
        let cached = bar_metrics.filter(|(h, _)| !fresh && *h == b.raw()).map(|(_, m)| m);
        let Some(m) = cached.or_else(|| taskbar::metrics(b, uia.as_ref())) else { continue };
        bar_metrics = Some((b.raw(), m));
        let width = (m.tray.right - m.tray.left).max(1) as f64;
        let px_of = |at: f64| m.tray.left + (at * width).round() as i32;
        for c in std::mem::take(&mut pending) {
            match c {
                Cmd::Width(_) | Cmd::Hello | Cmd::Settings => {}
                Cmd::Move(true) if moving.is_none() => {
                    let mode = mode_of(&st);
                    let anchor = mode.anchor();
                    let Some(p) = placement::place_mode(&m, want, mode) else { continue };
                    let x = m.tray.left + p.x + match anchor { Anchor::Left => 0, Anchor::Center => p.w / 2, Anchor::Right => p.w };
                    moving = Some(Moving { anchor, at: placement::custom_at(&m, x), grab: None });
                    set_pmode(pointer::MOVING);
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
                    set_pmode(pointer::NORMAL);
                    if commit {
                        // dropped against a zone edge: glue to it, so the stage follows the edge when the icons move
                        let dock = placement::snap_dock(&m, want, mv.at, mv.anchor);
                        let align = match dock {
                            Some(placement::Dock::LeftStart | placement::Dock::RightStart) => Align::Left,
                            Some(_) => Align::Right,
                            None => align_of(mv.anchor),
                        };
                        let at = mv.at;
                        if let Err(e) = crate::settings::update(&app, |s| { s.stage.position = Position::Custom; s.stage.custom_at = Some(at); s.stage.align = align; s.stage.dock = dock; }) {
                            pets_core::app_log!("{e}");
                        }
                    }
                },
            }
        }
        // during a move, use the dragged position; otherwise use settings
        let mode = match &moving { Some(mv) => Mode::Custom { at: mv.at, anchor: mv.anchor, dock: None }, None => mode_of(&st) };
        let p = placement::place_mode(&m, want, mode);
        if let Some(p) = p {
            let l = Layout { max_css: p.max_css.floor(), height_css: p.height_css, scale: m.scale, mode: "taskbar",
                light: crate::system::light_taskbar(), left_fallback: p.left_fallback && st.position == Position::Left, vertical_bar: false };
            if last_layout != Some(l) { let _ = app.emit("pets://layout", l); last_layout = Some(l); *shared.lock().unwrap() = Some(l); }
        }
        if embed_failed { taskbar::apply_floating(hw, &m, p) } else { taskbar::apply(hw, p) }
        let vis = placement::taskbar_visible(m.tray, mon.monitor) && !taskbar::fullscreen_app();
        if last_visible != Some(vis) { let _ = app.emit("pets://visibility", vis); last_visible = Some(vis); }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use placement::Rect;

    #[test]
    fn the_first_pass_always_normalizes_the_window() {
        assert_eq!(attach(None, None), Attach::Detach, "floating at startup is detached (toolwindow, no focus)");
        assert_eq!(attach(None, Some(7)), Attach::Embed(7));
        assert_eq!(attach(Some(0), None), Attach::Keep);
        assert_eq!(attach(Some(5), None), Attach::Detach);
        assert_eq!(attach(Some(7), Some(7)), Attach::Keep);
        assert_eq!(attach(Some(0), Some(7)), Attach::Embed(7));
    }

    #[test]
    fn a_failed_embed_is_retried_on_the_same_taskbar() {
        // `SetParent` to the taskbar can fail just after login; the window must not stay above the taskbar forever
        assert_eq!(attach_or_retry(Some(7), Some(7), false, 60_000), Attach::Keep);
        assert_eq!(attach_or_retry(Some(7), Some(7), true, EMBED_RETRY_MS - 1), Attach::Keep);
        assert_eq!(attach_or_retry(Some(7), Some(7), true, EMBED_RETRY_MS), Attach::Embed(7));
        assert_eq!(attach_or_retry(Some(7), None, true, EMBED_RETRY_MS), Attach::Detach, "floating mode wins");
        assert_eq!(attach_or_retry(None, Some(7), false, 0), Attach::Embed(7));
    }

    #[test]
    fn the_floating_rect_is_reapplied_when_windows_resized_the_window() {
        let r = Rect { left: 0, top: 0, right: 200, bottom: 48 };
        let dpi = Rect { left: 0, top: 0, right: 300, bottom: 72 };
        assert!(!needs_apply(Some(r), Some(r), Some(r)));
        assert!(needs_apply(Some(r), Some(r), Some(dpi)), "WM_DPICHANGED resized it behind our back");
        assert!(needs_apply(Some(r), None, None));
        assert!(needs_apply(None, Some(r), Some(r)));
        assert!(!needs_apply(None, None, Some(r)));
    }

    #[test]
    fn dragging_reuses_the_last_measurement_for_up_to_a_second() {
        let drags = [Cmd::Drag(Drag::Move { dx: 1, dy: 0 }), Cmd::Drag(Drag::Move { dx: 2, dy: 0 })];
        assert!(!remeasure(&drags, Some(Duration::from_millis(300))));
        assert!(remeasure(&drags, Some(Duration::from_millis(1000))));
        assert!(remeasure(&drags, None), "nothing measured yet");
        assert!(remeasure(&[Cmd::Settings], Some(Duration::from_millis(10))));
        assert!(remeasure(&[], Some(Duration::from_millis(10))), "the regular 1 s tick always measures");
    }

    #[test]
    fn width_and_hello_are_never_lost_and_other_commands_wait() {
        let mut pending = vec![Cmd::Width(5.0), Cmd::MoveDone(true), Cmd::Hello, Cmd::Width(9.0)];
        let mut want = 0.0;
        assert!(take_basic(&mut pending, &mut want));
        assert_eq!(want, 9.0);
        assert_eq!(pending.len(), 1);
        assert!(matches!(pending[0], Cmd::MoveDone(true)));
        assert!(!take_basic(&mut pending, &mut want));
    }
}
