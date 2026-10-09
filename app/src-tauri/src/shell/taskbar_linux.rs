//! Linux "taskbar" backend. There is no taskbar to embed into (neither X11 nor Wayland allows it),
//! so the stage is an always-on-top strip flush against the edge of the work area where the panel
//! (taskbar/dock) sits: bottom by default, top when the panel is there. Everything else (zones,
//! anchors, move mode) reuses the pure geometry from `placement`.
//!
//! Windows are placed through Tauri (GTK/X11); the pointer (cursor, buttons, Enter/Esc) is read
//! from X11 directly, dlopened at runtime so the binary also starts without libX11.
use super::placement::{Metrics, MonitorInfo, Placement, Rect};
use std::sync::atomic::{AtomicI64, Ordering};
use std::sync::{Mutex, OnceLock};
use tauri::{AppHandle, PhysicalPosition, WebviewWindow};

/// Pseudo taskbar handle: `1 + monitor index`; `handle_raw` keeps the stage loop's numeric bookkeeping.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub struct Handle(pub isize);

/// Platform handle as a plain number (the stage-loop bookkeeping stores `isize`).
pub fn handle_raw(h: Handle) -> isize { h.0 }

/// Stage-window registry: the loop addresses windows by the id handed out in `build_stage`,
/// because Tauri windows are not plain numbers here.
static STAGE: Mutex<Vec<(isize, WebviewWindow)>> = Mutex::new(Vec::new());
/// The stage window itself (the registry also holds tooltip/bubbles windows).
static STAGE_MAIN: Mutex<Option<isize>> = Mutex::new(None);
static NEXT_ID: AtomicI64 = AtomicI64::new(1);
static APP: OnceLock<AppHandle> = OnceLock::new();
/// Strip (the pseudo taskbar) of the monitor chosen in the settings, as long as metrics were measured.
static LAST_STRIP: Mutex<Option<Rect>> = Mutex::new(None);
/// GTK main thread: widget queries (`is_visible`, monitor enumeration) must run there - tao reads them
/// through GTK, which is not thread-safe, and unsynchronized calls corrupted the heap (glibc abort).
static MAIN_THREAD: OnceLock<std::thread::ThreadId> = OnceLock::new();

/// Queue `f` on the GTK main thread without waiting (directly when already there); same glib path as `on_main`.
fn on_main_async(f: impl FnOnce() + Send + 'static) {
    if MAIN_THREAD.get() == Some(&std::thread::current().id()) { return f(); }
    gtk::glib::MainContext::default().invoke(f);
}

/// Run `f` on the GTK main thread and wait for its result; directly when already there.
/// Routed through a glib idle source (not Tauri's proxy): the task must also WAKE the loop -
/// with the proxy, tasks queued while the webview was idle (no animations, loop asleep in poll)
/// were never executed and timed out (broke e.g. opening the panel after an idle period).
pub fn on_main<T: Send + 'static>(f: impl FnOnce() -> T + Send + 'static) -> Option<T> {
    if MAIN_THREAD.get() == Some(&std::thread::current().id()) { return Some(f()); }
    let (tx, rx) = std::sync::mpsc::channel();
    gtk::glib::MainContext::default().invoke(move || { let _ = tx.send(f()); });
    match rx.recv_timeout(std::time::Duration::from_millis(500)) {
        Ok(v) => Some(v),
        Err(_) => { pets_core::app_log!("on_main: TIMEOUT (main loop stuck)"); None }
    }
}

/// No UI Automation on Linux: a stub keeps the stage loop's signature.
pub struct Uia;

impl Uia {
    pub fn new() -> Result<Uia, ()> { Ok(Uia) }
}

/// Remember the app handle (for monitor enumeration) and the stage window; returns its id.
pub fn register(app: AppHandle, win: &WebviewWindow) -> isize {
    let _ = APP.set(app);
    let _ = MAIN_THREAD.set(std::thread::current().id());
    let id = NEXT_ID.fetch_add(1, Ordering::Relaxed) as isize;
    let mut v = STAGE.lock().unwrap();
    v.retain(|(_, w)| w.label() != win.label());
    v.push((id, win.clone()));
    drop(v);
    *STAGE_MAIN.lock().unwrap() = Some(id);
    id
}

fn window(h: Handle) -> Option<WebviewWindow> {
    STAGE.lock().unwrap().iter().find(|(i, _)| *i == h.0).map(|(_, w)| w.clone())
}

/// Registry id of a window by its label; windows other than the stage (tooltip, bubbles)
/// register themselves here on first use.
pub fn id_of(win: &WebviewWindow) -> isize {
    let mut v = STAGE.lock().unwrap();
    if let Some((i, _)) = v.iter().find(|(_, w)| w.label() == win.label()) { return *i; }
    let id = NEXT_ID.fetch_add(1, Ordering::Relaxed) as isize;
    v.push((id, win.clone()));
    id
}

fn current_stage_id() -> Option<isize> { *STAGE_MAIN.lock().unwrap() }

pub fn hwnd(raw: isize) -> Handle { Handle(raw) }

pub fn is_window(raw: isize) -> bool { raw != 0 && window(Handle(raw)).is_some() }

/// Strip height inside the work area (physical px): the pets' 48 CSS px at monitor scale,
/// but never more than a third of the work area.
fn strip_h(scale: f64, work: &Rect) -> i32 {
    ((48.0 * scale).round() as i32).min((work.height() / 3).max(24)).max(24)
}

fn rect(pos: tauri::PhysicalPosition<i32>, size: tauri::PhysicalSize<u32>) -> Rect {
    Rect { left: pos.x, top: pos.y, right: pos.x + size.width as i32, bottom: pos.y + size.height as i32 }
}

fn work_rect(w: &tauri::PhysicalRect<i32, u32>) -> Rect { rect(w.position, w.size) }

/// The "taskbar" rectangle for a monitor: a strip at the panel edge of the work area.
/// Panel side comes from the work-area insets (GNOME: top, KDE/default: bottom).
pub fn strip_of(monitor: &Rect, work: &Rect, scale: f64) -> Rect {
    let h = strip_h(scale, work);
    let (top, bottom) = if work.top - monitor.top > monitor.bottom - work.bottom {
        // panel at the top: strip flush under the top edge of the work area
        (work.top, work.top + h)
    } else {
        (work.bottom - h, work.bottom)
    };
    Rect { left: work.left, top, right: work.right, bottom }
}

/// Pseudo taskbar handle: `1 + monitor index` (0 = use the stage window's own monitor).
/// Every monitor gets one, because the strip can sit on any of them.
fn bar_index(b: Handle) -> Option<usize> { usize::try_from(b.0 - 1).ok().filter(|i| *i < monitors().len()) }

/// No real taskbar handle exists: identify the monitor of the current stage window.
pub fn tray() -> Option<Handle> {
    let win = window(Handle(current_stage_id()?))?;
    let target = on_main({ let win = win.clone(); move || win.current_monitor().ok().flatten() })??;
    let idx = monitors().iter().position(|m| m.monitor.left <= target.position().x && m.monitor.right > target.position().x
        && m.monitor.top <= target.position().y && m.monitor.bottom > target.position().y)?;
    Some(Handle(1 + idx as isize))
}

/// Nothing to embed into on Linux; report success so the loop settles after one call.
pub fn embed(_stage: Handle, _tray: Handle) -> Result<(), ()> { Ok(()) }

/// Nothing was embedded, so there is nothing to detach.
pub fn detach(_stage: Handle) {}

/// Place the stage window on the main thread: a DOCK-type X11 window (the compositor does not tile
/// or focus it) sized in logical pixels. `p` is in strip physical coordinates.
pub fn apply(stage: Handle, p: Option<Placement>) {
    let Some(win) = window(stage) else { return };
    let strip = LAST_STRIP.lock().unwrap().or_else(|| own_strip(&win));
    on_main_async(move || {
        use gtk::prelude::*;
        let Ok(gw) = win.gtk_window() else { return };
        match (p, strip) {
            (Some(p), Some(strip)) if p.w > 0 => {
                let s = win.scale_factor().unwrap_or(1.0);
                gw.resize((p.w as f64 / s).max(1.0) as i32, (p.h as f64 / s).max(1.0) as i32);
                gw.set_type_hint(gtk::gdk::WindowTypeHint::Dock);
                let _ = win.set_position(PhysicalPosition::new(strip.left + p.x, strip.top));
                let _ = win.show();
                set_visible(stage, true);
                drain_pending(&win);
            }
            _ => { let _ = win.hide(); set_visible(stage, false); }
        }
    });
}

/// Same position as `apply`; on Linux embedding never fails, so this is equivalent.
pub fn apply_floating(stage: Handle, _m: &Metrics, p: Option<Placement>) { apply(stage, p) }

/// Floating-mode window rectangle (screen coordinates), placed like the taskbar stage.
pub fn apply_rect(raw: Handle, r: Option<Rect>) {
    let Some(win) = window(raw) else { return };
    on_main_async(move || {
        use gtk::prelude::*;
        let Ok(gw) = win.gtk_window() else { return };
        match r {
            Some(r) if r.right > r.left => {
                let s = win.scale_factor().unwrap_or(1.0);
                gw.resize(((r.right - r.left) as f64 / s).max(1.0) as i32, ((r.bottom - r.top) as f64 / s).max(1.0) as i32);
                gw.set_type_hint(gtk::gdk::WindowTypeHint::Dock);
                let _ = win.set_position(PhysicalPosition::new(r.left, r.top));
                let _ = win.show();
                set_visible(raw, true);
                drain_pending(&win);
            }
            _ => { let _ = win.hide(); set_visible(raw, false); }
        }
    });
}

/// Size and place an overlay window (tooltip, bubbles) in physical pixels, from a command handler
/// (main thread). `dock`: an unfocusable overlay instead of a regular window (the panel passes false).
pub fn place(win: &WebviewWindow, r: Rect, dock: bool) {
    use gtk::prelude::*;
    let Ok(gw) = win.gtk_window() else { return };
    let s = win.scale_factor().unwrap_or(1.0);
    gw.resize(((r.right - r.left) as f64 / s).max(1.0) as i32, ((r.bottom - r.top) as f64 / s).max(1.0) as i32);
    if dock { gw.set_type_hint(gtk::gdk::WindowTypeHint::Dock); }
    let _ = win.set_position(PhysicalPosition::new(r.left, r.top));
}

/// Taskbar metrics for the strip of monitor `bar` (1-based; 0 = the stage window's monitor):
/// the whole strip is free space (no app icons in it), so the free zone runs from its left edge.
pub fn metrics(bar: Handle, _uia: Option<&Uia>) -> Option<Metrics> {
    let mons = monitors();
    let (monitor, work, scale) = match bar_index(bar) {
        Some(i) => { let m = &mons[i]; (m.monitor, m.work, m.scale) }
        None => {
            let win = window(Handle(current_stage_id()?))?;
            let (m, w, s) = own(&win)?;
            (m, w, s)
        }
    };
    let strip = strip_of(&monitor, &work, scale);
    *LAST_STRIP.lock().unwrap() = Some(strip);
    Some(Metrics {
        tray: strip,
        notify_left: None,
        icons_right: Some(strip.left),
        first_left: None,
        widgets_right: None,
        scale,
    })
}

/// Fullscreen detection via the compositor (Hyprland, then sway). The stage loop and the update gate
/// ask about once a second, so the answer is cached for half a second.
pub fn fullscreen_app() -> bool {
    static CACHE: Mutex<Option<(std::time::Instant, bool)>> = Mutex::new(None);
    let mut c = CACHE.lock().unwrap();
    if let Some((at, v)) = *c { if at.elapsed().as_millis() < 500 { return v; } }
    let v = detect_fullscreen();
    *c = Some((std::time::Instant::now(), v));
    v
}

fn detect_fullscreen() -> bool {
    // Hyprland: `fullscreen` of the active window (0 = none; client and server modes are both fullscreen)
    if let Some(out) = hypr_request("j/activewindow") {
        if let Ok(v) = serde_json::from_str::<serde_json::Value>(&out) { return walk_hyprland_fullscreen(&v); }
        return false;
    }
    // sway: `fullscreen_mode` of the focused container (0 = none)
    if let Some(out) = sway_tree() {
        if let Ok(v) = serde_json::from_str::<serde_json::Value>(&out) { return walk_focused(&v); }
    }
    false
}

/// Newer Hyprland reports a boolean, older an int. `fullscreen` is the compositor state; `fullscreenClient`
/// is the window's own request (browser F11), which Hyprland may not sync to the internal state (floating windows).
fn walk_hyprland_fullscreen(v: &serde_json::Value) -> bool {
    let field = |k: &str| match v.get(k) {
        Some(serde_json::Value::Bool(b)) => *b,
        Some(n) => n.as_i64().unwrap_or(0) != 0,
        None => false,
    };
    field("fullscreen") || field("fullscreenClient")
}

fn walk_focused(v: &serde_json::Value) -> bool {
    let kids = |key: &str| v.get(key).and_then(serde_json::Value::as_array).map(|a| a.iter().any(walk_focused)).unwrap_or(false);
    if v.get("focused").and_then(serde_json::Value::as_bool) == Some(true)
        && v.get("fullscreen_mode").and_then(serde_json::Value::as_i64).unwrap_or(0) != 0 { return true; }
    kids("nodes") || kids("floating_nodes")
}

/// Pid of the compositor's active (focused) window; `None` without Hyprland/sway or with no window.
pub fn active_window_pid() -> Option<u32> {
    if let Some(out) = hypr_request("j/activewindow") {
        if let Ok(v) = serde_json::from_str::<serde_json::Value>(&out) {
            if let Some(pid) = v.get("pid").and_then(serde_json::Value::as_u64) { return Some(pid as u32); }
        }
        return None;
    }
    if let Some(out) = sway_tree() {
        if let Ok(v) = serde_json::from_str::<serde_json::Value>(&out) { return walk_active_pid(&v); }
    }
    None
}

fn walk_active_pid(v: &serde_json::Value) -> Option<u32> {
    if v.get("focused").and_then(serde_json::Value::as_bool) == Some(true) {
        return v.get("pid").and_then(serde_json::Value::as_u64).map(|p| p as u32);
    }
    v.get("nodes").and_then(serde_json::Value::as_array)?.iter().find_map(walk_active_pid)
}

/// `swaymsg -t get_tree`, only under sway (elsewhere the polls would spawn a failing process each time).
fn sway_tree() -> Option<String> {
    if !SWAY.get().copied().unwrap_or(false) { return None; }
    run("swaymsg", &["-t", "get_tree"])
}

fn run(cmd: &str, args: &[&str]) -> Option<String> {
    std::process::Command::new(cmd).args(args).output().ok()
        .filter(|o| o.status.success()).map(|o| String::from_utf8_lossy(&o.stdout).into_owned())
}

/// Monitor with work area and scale; `bar` marks where the strip can appear (every monitor).
pub struct Mon { pub info: MonitorInfo, pub monitor: Rect, pub work: Rect, pub scale: f64, pub bar: Option<Handle> }

pub fn monitors() -> Vec<Mon> {
    let Some(app) = APP.get() else { return Vec::new() };
    let app = app.clone();
    let Some((list, primary_geom)) = on_main(move || {
        let list = app.available_monitors().ok().unwrap_or_default();
        let primary_geom = app.primary_monitor().ok().flatten().map(|p| (*p.position(), *p.size()));
        (list, primary_geom)
    }) else { return Vec::new() };
    list.iter().enumerate().map(|(i, m)| {
        let monitor = rect(*m.position(), *m.size());
        let work = work_rect(m.work_area());
        let is_primary = primary_geom.map(|(p, s)| p == *m.position() && s == *m.size()).unwrap_or(i == 0);
        Mon {
            info: MonitorInfo { id: format!("{}x{}", m.position().x, m.position().y), primary: is_primary,
                width: monitor.right - monitor.left, height: monitor.bottom - monitor.top, index: i as u32 + 1, has_bar: true },
            monitor, work, scale: m.scale_factor(), bar: Some(Handle(1 + i as isize)),
        }
    }).collect()
}

fn own(w: &WebviewWindow) -> Option<(Rect, Rect, f64)> {
    let w = w.clone();
    let m = on_main(move || w.current_monitor().ok().flatten())??;
    Some((rect(*m.position(), *m.size()), work_rect(m.work_area()), m.scale_factor()))
}

fn own_strip(w: &WebviewWindow) -> Option<Rect> {
    let (monitor, work, scale) = own(w)?;
    Some(strip_of(&monitor, &work, scale))
}

/// Monitor containing the stage window (monitor and work-area rectangles).
pub fn monitor_of(raw: Handle) -> Option<(Rect, Rect)> {
    let win = window(raw)?;
    own(&win).map(|(m, w, _)| (m, w))
}

/// Window rectangles, cached briefly: the pointer and bubbles threads poll at 30 ms, and every read
/// clones the Tauri window handle whose tao backend is not built for that kind of cross-thread churn
/// (`Rc` fields with `unsafe impl Sync`); heap corruption was observed with per-poll reads.
static RECT_CACHE: Mutex<Vec<(isize, std::time::Instant, Rect, f64)>> = Mutex::new(Vec::new());

pub fn rect_of(raw: Handle) -> Option<Rect> {
    let mut cache = RECT_CACHE.lock().unwrap();
    if let Some(e) = cache.iter().find(|(i, at, _, _)| *i == raw.0 && at.elapsed().as_millis() < 300) {
        return Some(e.2);
    }
    let win = window(raw)?;
    let r = rect(win.outer_position().ok()?, win.outer_size().ok()?);
    let scale = win.scale_factor().unwrap_or(1.0);
    cache.retain(|(i, _, _, _)| *i != raw.0);
    cache.push((raw.0, std::time::Instant::now(), r, scale));
    Some(r)
}

pub fn scale_of(raw: Handle) -> f64 {
    let read = || RECT_CACHE.lock().unwrap().iter().find(|(i, _, _, _)| *i == raw.0).map(|(_, _, _, s)| *s);
    read().unwrap_or_else(|| { let _ = rect_of(raw); read().unwrap_or(1.0) })
}

/// The strip stands in for the absent parent taskbar (the panel opens above it).
pub fn parent_rect(raw: Handle) -> Option<Rect> { window(raw).and_then(|w| own_strip(&w)) }

pub fn screen_rect() -> Rect {
    APP.get()
        .and_then(|app| on_main(move || app.primary_monitor().ok().flatten()))
        .flatten()
        .map(|m| rect(*m.position(), *m.size()))
        .unwrap_or(Rect { left: 0, top: 0, right: 1920, bottom: 1080 })
}

/// Pointer transparency: Tauri implements it (input region) on X11. GTK panics (no Gdk window)
/// when called before the window is realized, so the request is dropped and re-sent after `show`.
pub fn passthrough(raw: Handle, on: bool) {
    let visible = is_visible(raw);
    let Some(w) = window(raw) else { return };
    if visible {
        let _ = w.set_ignore_cursor_events(on);
    } else {
        // Not shown yet: remember the last intent; `drain_pending` applies it after `show`.
        // (The input region resets when the GdkWindow is recreated, so only the latest matters.)
        let label = w.label().to_string();
        let mut p = PENDING_PASSTHROUGH.lock().unwrap();
        p.retain(|(l, _)| *l != label);
        p.push((label, on));
    }
}

/// (label, passthrough) to apply when the window becomes visible.
static PENDING_PASSTHROUGH: Mutex<Vec<(String, bool)>> = Mutex::new(Vec::new());

/// Visibility tracked on our own show/hide calls: GTK's `is_visible` was observed returning false
/// for a mapped stage window, which silently dropped the "capture input again" request.
static VISIBLE: Mutex<Vec<(isize, bool)>> = Mutex::new(Vec::new());

fn set_visible(raw: Handle, on: bool) {
    let mut v = VISIBLE.lock().unwrap();
    match v.iter_mut().find(|(i, _)| *i == raw.0) { Some(e) => e.1 = on, None => v.push((raw.0, on)) }
}

pub fn hide(raw: Handle) {
    set_visible(raw, false);
    if let Some(w) = window(raw) { let _ = w.hide(); }
}

pub fn is_visible(raw: Handle) -> bool { VISIBLE.lock().unwrap().iter().find(|(i, _)| *i == raw.0).map(|(_, b)| *b).unwrap_or(false) }

/// Nothing to clear: windows are built unfocused and shown without activation.
pub fn no_activate(_raw: Handle) {}

pub fn show_no_activate(raw: Handle) {
    if let Some(w) = window(raw) {
        let _ = w.set_always_on_top(true);
        let _ = w.show();
        set_visible(raw, true);
        drain_pending(&w);
    }
}

/// Apply passthrough requests that arrived while the window was not realized yet.
fn drain_pending(w: &WebviewWindow) {
    let label = w.label().to_string();
    PENDING_PASSTHROUGH.lock().unwrap().retain(|(l, on)| {
        if l == &label { let _ = w.set_ignore_cursor_events(*on); false } else { true }
    });
}

/// Cursor relative to the stage window (CSS pixels) and the left-button state.
pub fn cursor_rel(raw: Handle) -> Option<(f64, f64, bool)> {
    let win = window(raw)?;
    let r = rect_of(raw)?;
    let (x, y, left, _right) = raw_pointer()?;
    let scale = win.scale_factor().ok().unwrap_or(1.0);
    Some(((x - r.left as f64) / scale, (y - r.top as f64) / scale, left))
}

pub fn taskbar_geometry() -> Option<(Rect, Rect, f64)> {
    let win = window(Handle(current_stage_id()?))?;
    let (monitor, work, scale) = own(&win)?;
    Some((strip_of(&monitor, &work, scale), monitor, scale))
}

/// Cursor (root coordinates) and the button states, for the pointer thread. The position comes from the
/// compositor: XWayland learns of real cursor motion only while an X window with an input region is under
/// it, and the strip passes input through over empty space - so `XQueryPointer` alone freezes exactly when
/// the user hovers the strip (XTEST-injected motion still goes through the X11 fallback). Buttons stay on X:
/// a press on a pet makes the frontend disable passthrough there, and the implicit grab carries the release.
/// Hyprland reports the cursor in logical units; `hypr_to_physical` converts using the stage window's own
/// geometry in both spaces (monitor scale and offset), so the X11 rectangle checks stay in physical pixels.
pub fn raw_pointer() -> Option<(f64, f64, bool, bool)> {
    let (x, y) = hyprland_cursor()
        .map(|(lx, ly)| hypr_to_physical(lx, ly).unwrap_or((lx, ly)))
        .or_else(|| x11::query().map(|(x, y, _, _)| (x, y)))?;
    let (_, _, left, right) = x11::query().unwrap_or((0.0, 0.0, false, false));
    Some((x, y, left, right))
}

/// Logical->physical transform, refreshed at most once a second (the floating window can move).
/// The scale comes from the monitor (stable); the offset anchors the stage window's position in
/// both spaces. Deriving the scale from the window's own width broke while the stage was being
/// resized (X and Hyprland geometries disagree mid-resize, e.g. 136/62 instead of 1.6).
fn hypr_to_physical(lx: f64, ly: f64) -> Option<(f64, f64)> {
    type Transform = (f64, f64, f64);
    static CACHE: Mutex<Option<(std::time::Instant, Transform)>> = Mutex::new(None);
    let mut c = CACHE.lock().unwrap();
    let t = match *c {
        Some((at, t)) if at.elapsed().as_millis() < 1000 => t,
        _ => {
            let t = stage_transform()?;
            *c = Some((std::time::Instant::now(), t));
            t
        }
    };
    let (k, ox, oy) = t;
    Some((lx * k + ox, ly * k + oy))
}

/// `(scale, offset x, offset y)` for the stage's monitor: physical = logical * scale + offset.
/// The scale is the monitor's (`monitors`); the offset anchors the stage window's position
/// measured in both spaces (`clients` `at` vs the X11 rectangle).
fn stage_transform() -> Option<(f64, f64, f64)> {
    let rect = rect_of(Handle(current_stage_id()?))?;
    let clients = hypr_request("j/clients")?;
    let mons = hypr_request("j/monitors")?;
    let cv: serde_json::Value = serde_json::from_str(&clients).ok()?;
    let mv: serde_json::Value = serde_json::from_str(&mons).ok()?;
    let stage = cv.as_array()?.iter().find(|c| c.get("title").and_then(serde_json::Value::as_str) == Some("agent-pets-stage"))?;
    let at = stage.get("at")?.as_array()?;
    let mon_id = stage.get("monitor")?.as_i64()?;
    let mon = mv.as_array()?.iter().find(|m| m.get("id").and_then(serde_json::Value::as_i64) == Some(mon_id))?;
    let k = mon.get("scale")?.as_f64()?;
    if k <= 0.1 { return None; }
    let (lx, ly) = (at.first()?.as_f64()?, at.get(1)?.as_f64()?);
    // A monitor at the logical origin starts at X (0,0) too: the offset is exactly zero.
    let (mx, my) = (mon.get("x").and_then(serde_json::Value::as_f64), mon.get("y").and_then(serde_json::Value::as_f64));
    if mx == Some(0.0) && my == Some(0.0) { return Some((k, 0.0, 0.0)); }
    Some((k, rect.left as f64 - lx * k, rect.top as f64 - ly * k))
}

/// Real cursor position from Hyprland's IPC socket (`cursorpos` -> "123, 456"); `None` without Hyprland.
fn hyprland_cursor() -> Option<(f64, f64)> { parse_cursor(&hypr_request_within("cursorpos", 20)?) }

/// One request on Hyprland's IPC socket (what `hyprctl` does, without spawning a process per poll);
/// `None` without Hyprland. The reply ends when Hyprland closes the connection.
fn hypr_request(cmd: &str) -> Option<String> { hypr_request_within(cmd, 250) }

fn hypr_request_within(cmd: &str, timeout_ms: u64) -> Option<String> {
    use std::io::{Read, Write};
    use std::os::unix::net::UnixStream;
    let path = HYPRLAND_SOCK.get().and_then(|p| p.as_deref())?;
    let mut s = UnixStream::connect(path).ok()?;
    let t = Some(std::time::Duration::from_millis(timeout_ms));
    let _ = s.set_read_timeout(t);
    let _ = s.set_write_timeout(t);
    s.write_all(cmd.as_bytes()).ok()?;
    let mut out = Vec::new();
    s.read_to_end(&mut out).ok()?;
    Some(String::from_utf8_lossy(&out).into_owned())
}

fn parse_cursor(s: &str) -> Option<(f64, f64)> {
    let (x, y) = s.trim().split_once(',')?;
    Some((x.trim().parse().ok()?, y.trim().parse().ok()?))
}

/// Resolved once, at startup: `getenv` from the 30 ms pointer threads races `setenv` inside GTK
/// and glibc aborts the process on the corrupted heap (observed SIGABRT in `malloc` under `getenv`).
static HYPRLAND_SOCK: OnceLock<Option<String>> = OnceLock::new();
/// Running under sway (`SWAYSOCK`), resolved at startup for the same reason.
static SWAY: OnceLock<bool> = OnceLock::new();

/// Read the compositor environment (Hyprland socket, sway). Call before the app spawns threads.
pub fn init_hyprland_socket() {
    let _ = HYPRLAND_SOCK.set(hyprland_socket());
    let _ = SWAY.set(std::env::var_os("SWAYSOCK").is_some());
}

fn hyprland_socket() -> Option<String> {
    let sig = std::env::var("HYPRLAND_INSTANCE_SIGNATURE").ok()?;
    let runtime = std::env::var("XDG_RUNTIME_DIR").ok()?;
    Some(format!("{runtime}/hypr/{sig}/.socket.sock"))
}

/// X11 core, dlopened: cursor position and global mouse buttons.
mod x11 {
    use std::sync::{Mutex, OnceLock};

    type Display = *mut core::ffi::c_void;
    type XWindow = u64;

    struct X11 {
        lib: libloading::Library,
        display: Display,
    }
    // SAFETY: the connection belongs to this process and every call takes `LOCK`.
    unsafe impl Send for X11 {}
    unsafe impl Sync for X11 {}

    static X: OnceLock<Option<X11>> = OnceLock::new();
    /// Serializes all calls on the shared `Display*` (Xlib is not thread-safe).
    static LOCK: Mutex<()> = Mutex::new(());

    fn x11() -> Option<&'static X11> {
        let x = X.get_or_init(open).as_ref();
        if x.is_none() {
            static LAST: std::sync::Mutex<Option<std::time::Instant>> = std::sync::Mutex::new(None);
            let mut last = LAST.lock().unwrap();
            if last.map(|t| t.elapsed().as_secs() > 60).unwrap_or(true) {
                *last = Some(std::time::Instant::now());
                pets_core::app_log!("X11: cannot open a connection; pointer tracking is off");
            }
        }
        x
    }

    fn open() -> Option<X11> {
        unsafe {
            let lib = libloading::Library::new("libX11.so.6").ok()?;
            let open_display: libloading::Symbol<unsafe extern "C" fn() -> Display> = lib.get(b"XOpenDisplay").ok()?;
            let display = open_display();
            if display.is_null() { return None; }
            Some(X11 { lib, display })
        }
    }

    /// Cursor position in root coordinates and the left/right-button states.
    /// Xlib is not thread-safe: the pointer thread and the bubbles thread both poll, so every call on the
    /// shared `Display*` goes through `LOCK` (unsynchronized calls corrupted the heap -> glibc abort).
    pub fn query() -> Option<(f64, f64, bool, bool)> {
        let x = x11()?;
        let _guard = LOCK.lock().unwrap();
        let ok = unsafe {
            let lib = &x.lib;
            let root_window: libloading::Symbol<unsafe extern "C" fn(Display) -> XWindow> = lib.get(b"XDefaultRootWindow").ok()?;
            let query: libloading::Symbol<unsafe extern "C" fn(Display, XWindow, *mut XWindow, *mut XWindow,
                *mut i32, *mut i32, *mut i32, *mut i32, *mut u32) -> i32> = lib.get(b"XQueryPointer").ok()?;
            let flush: libloading::Symbol<unsafe extern "C" fn(Display) -> i32> = lib.get(b"XFlush").ok()?;
            let root = root_window(x.display);
            let (mut r, mut c, mut rx, mut ry, mut wx, mut wy, mut mask) = (0u64, 0u64, 0, 0, 0, 0, 0u32);
            let ok = query(x.display, root, &mut r, &mut c, &mut rx, &mut ry, &mut wx, &mut wy, &mut mask);
            flush(x.display);
            if ok != 0 {
                const BUTTON1: u32 = 1 << 8;
                const BUTTON3: u32 = 1 << 10;
                (rx as f64, ry as f64, mask & BUTTON1 != 0, mask & BUTTON3 != 0)
            } else { (f64::NAN, f64::NAN, false, false) }
        };
        static LAST_ERR: std::sync::Mutex<Option<std::time::Instant>> = std::sync::Mutex::new(None);
        let failed = ok.0.is_nan();
        if failed {
            let mut last = LAST_ERR.lock().unwrap();
            if last.map(|t| t.elapsed().as_secs() > 60).unwrap_or(true) {
                *last = Some(std::time::Instant::now());
                pets_core::app_log!("X11: XQueryPointer failed");
            }
            return None;
        }
        Some(ok)
    }

    /// Key currently down: `vk` uses Windows virtual-key codes; only Enter (0x0D) and Esc (0x1B) matter.
    pub fn key_down(vk: i32) -> bool {
        let x = match x11() { Some(v) => v, None => return false };
        // X core keycodes: Return = 36, Escape = 9
        let keycode = match vk { 0x0D => 36, 0x1B => 9, _ => return false };
        let _guard = LOCK.lock().unwrap();
        unsafe {
            let lib = &x.lib;
            let query: Option<libloading::Symbol<unsafe extern "C" fn(Display, *mut u8) -> i32>> = lib.get(b"XQueryKeymap").ok();
            let query = match query { Some(q) => q, None => return false };
            let mut keys = [0u8; 32];
            query(x.display, keys.as_mut_ptr());
            keys[(keycode / 8) as usize] & (1 << (keycode % 8)) != 0
        }
    }
}

/// Raw key state for the pointer thread (`key_down` maps virtual keys internally).
pub fn raw_key_down(vk: i32) -> bool { x11::key_down(vk) }

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_strip_sits_at_the_bottom_when_the_panel_is_there() {
        let monitor = Rect { left: 0, top: 0, right: 1920, bottom: 1080 };
        let work = Rect { left: 0, top: 32, right: 1920, bottom: 1032 }; // panel top 32, panel bottom 48
        let s = strip_of(&monitor, &work, 1.0);
        assert_eq!((s.left, s.right), (0, 1920));
        assert_eq!((s.top, s.bottom), (1032 - 48, 1032));
        assert_eq!(s.height(), 48);
    }

    #[test]
    fn the_strip_moves_to_the_top_when_the_panel_is_there() {
        let monitor = Rect { left: 0, top: 0, right: 2560, bottom: 1440 };
        let work = Rect { left: 0, top: 36, right: 2560, bottom: 1440 };
        let s = strip_of(&monitor, &work, 1.0);
        assert_eq!((s.top, s.bottom), (36, 36 + 48));
    }

    #[test]
    fn the_strip_never_eats_more_than_a_third_of_the_work_area() {
        let monitor = Rect { left: 0, top: 0, right: 800, bottom: 200 };
        let work = Rect { left: 0, top: 0, right: 800, bottom: 200 };
        let s = strip_of(&monitor, &work, 2.0);
        assert!(s.height() <= 200 / 3 + 1, "{}", s.height());
    }

    #[test]
    fn the_metrics_make_the_whole_strip_free_space() {
        // like Windows without UIA: no left zone, right zone = icons_right .. tray.right - gap
        let m = Metrics { tray: Rect { left: 0, top: 1032, right: 1920, bottom: 1080 },
            notify_left: None, icons_right: Some(0), first_left: None, widgets_right: None, scale: 1.0 };
        let (lz, rz) = super::super::placement::zones(&m);
        assert_eq!(lz, None);
        assert_eq!((rz.left, rz.right), (8, 1920 - 8));
    }

    #[test]
    fn sway_fullscreen_is_found_at_any_depth_of_the_tree() {
        let tree = serde_json::json!({
            "nodes": [
                {"name": "workspace 1", "nodes": [
                    {"focused": false, "fullscreen_mode": 0},
                    {"focused": true, "fullscreen_mode": 1, "pid": 7}]},
                {"name": "scratchpad", "floating_nodes": [
                    {"focused": false, "fullscreen_mode": 2}]}]});
        assert!(super::walk_focused(&tree));
        let not_fullscreen = serde_json::json!({"nodes": [{"focused": true, "fullscreen_mode": 0, "pid": 7}]});
        assert!(!super::walk_focused(&not_fullscreen));
        let pid = serde_json::json!({"nodes": [{"nodes": [{"focused": true, "fullscreen_mode": 0, "pid": 7}]}]});
        assert_eq!(super::walk_active_pid(&pid), Some(7));
        assert_eq!(super::walk_active_pid(&serde_json::json!({"nodes": []})), None);
    }

    #[test]
    fn hyprland_fullscreen_field_accepts_int_and_bool() {
        let v = |fs: serde_json::Value| serde_json::json!({"pid": 12, "fullscreen": fs});
        assert!(super::walk_hyprland_fullscreen(&v(1.into())));
        assert!(super::walk_hyprland_fullscreen(&v(true.into())));
        assert!(!super::walk_hyprland_fullscreen(&v(0.into())));
        assert!(!super::walk_hyprland_fullscreen(&serde_json::json!({"pid": 12})));
        // a client request alone (browser F11 on a floating window) is fullscreen too
        let f11 = serde_json::json!({"pid": 12, "fullscreen": 0, "fullscreenClient": 1});
        assert!(super::walk_hyprland_fullscreen(&f11));
        let both_off = serde_json::json!({"pid": 12, "fullscreen": 0, "fullscreenClient": 0});
        assert!(!super::walk_hyprland_fullscreen(&both_off));
    }

    #[test]
    fn hyprland_cursorpos_parses() {
        assert_eq!(super::parse_cursor("1845, 1103"), Some((1845.0, 1103.0)));
        assert_eq!(super::parse_cursor("0, 0\n"), Some((0.0, 0.0)));
        assert_eq!(super::parse_cursor("1845 1103"), None);
        assert_eq!(super::parse_cursor("error: no such request"), None);
    }
}
