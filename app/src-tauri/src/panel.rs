//! Panel above the taskbar: session list, limits, "Jump". Show and hide the window only through the Tauri API.
use crate::shell::placement::{self, Rect};
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager, WebviewUrl, WebviewWindowBuilder, WindowEvent};

const W: f64 = 400.0;
const H: f64 = 540.0;
const MARGIN: f64 = 12.0;
const BLUR_GRACE_MS: i64 = 400;
/// On X11 the compositor may bounce focus right after `set_focus` on a freshly shown window;
/// a focus-out that close to opening is the compositor, not the user clicking away.
const BLUR_GUARD_MS: i64 = 300;

#[derive(Default)]
pub struct PanelToggle { visible: bool, blurred_at: Option<i64>, shown_at: i64 }

impl PanelToggle {
    pub fn shown(&mut self) { self.visible = true; self.blurred_at = None; self.shown_at = pets_core::time::now_ms(); }
    pub fn blurred(&mut self, now: i64) { self.visible = false; self.blurred_at = Some(now); }
    pub fn hidden(&mut self) { self.visible = false; }
    /// Whether the panel should be visible after a click. Clicking the icon or stage removes panel focus,
    /// so a click immediately after focus loss means "close", not "close and reopen".
    pub fn toggle(&mut self, now: i64) -> bool {
        if self.visible { return false; }
        !matches!(self.blurred_at, Some(t) if now - t < BLUR_GRACE_MS)
    }
    /// Whether a focus-out this close to opening is the compositor fighting over focus (X11),
    /// not the user leaving: the hide is ignored so the panel does not flash and die.
    pub fn transient_blur(&self, now: i64) -> bool {
        self.shown_at > 0 && now - self.shown_at < BLUR_GUARD_MS
    }
}

#[derive(Default)]
pub struct Panel(pub Mutex<PanelToggle>);

/// Panel top-left corner (physical pixels): above the taskbar at the right edge, like Windows 11 flyouts.
/// If the taskbar is hidden (auto-hide) or unknown: above the bottom edge of the screen.
pub fn origin(tray: Option<Rect>, screen: Rect, scale: f64) -> (i32, i32) {
    let (w, h, m) = (W * scale, H * scale, MARGIN * scale);
    // taskbar docked to the left or right edge: beside it, at the bottom
    if let Some(t) = tray.filter(|t| t.width() < t.height()) {
        let x = if placement::bar_side(t, screen) == placement::Side::Left { (t.right as f64).max(screen.left as f64) + m } else { (t.left as f64).min(screen.right as f64) - w - m };
        return (x.round() as i32, (screen.bottom as f64 - h - m).round() as i32);
    }
    let bottom = match tray {
        Some(t) if t.top > screen.top && t.top < screen.bottom - 2 => t.top,
        _ => screen.bottom,
    };
    ((screen.right as f64 - w - m).round() as i32, (bottom as f64 - h - m).round() as i32)
}

/// Panel near a floating stage: centered above it (or below it if there is no room), within the work area.
pub fn origin_near(stage: Rect, work: Rect, scale: f64) -> (i32, i32) {
    let (w, h, m) = ((W * scale).round() as i32, (H * scale).round() as i32, (MARGIN * scale).round() as i32);
    let x = ((stage.left + stage.right) / 2 - w / 2).clamp(work.left + m, (work.right - w - m).max(work.left + m));
    let above = stage.top - h - m;
    let y = if above >= work.top + m { above } else { (stage.bottom + m).min((work.bottom - h - m).max(work.top)) };
    (x, y)
}

pub fn build(app: &AppHandle) -> tauri::Result<()> {
    let w = WebviewWindowBuilder::new(app, "panel", WebviewUrl::App("panel.html".into()))
        .title("Agent Pets").inner_size(W, H).decorations(false).transparent(true).always_on_top(true)
        // Linux: `resizable(false)` freezes GTK size hints and later resizing is ignored
        .skip_taskbar(true).resizable(cfg!(target_os = "linux")).shadow(true).visible(false).build()?;
    let a = app.clone();
    w.on_window_event(move |e| if let WindowEvent::Focused(false) = e {
        let st = a.state::<Panel>();
        let mut p = st.0.lock().unwrap();
        if p.transient_blur(pets_core::time::now_ms()) {
            return;
        }
        p.blurred(pets_core::time::now_ms());
        drop(p);
        if let Some(win) = a.get_webview_window("panel") { let _ = win.hide(); }
        let _ = a.emit_to("panel", "panel://visible", false);
    });
    Ok(())
}

fn place(app: &AppHandle) {
    let Some(win) = app.get_webview_window("panel") else { return };
    let at = app.try_state::<crate::shell::Shell>().and_then(|s| s.panel_at());
    let (x, y, scale) = match at {
        Some(crate::shell::PanelAt::Near { stage, work, scale }) => { let (x, y) = origin_near(stage, work, scale); (x, y, scale) }
        Some(crate::shell::PanelAt::Taskbar { bar, monitor, scale }) => { let (x, y) = origin(bar, monitor, scale); (x, y, scale) }
        None => {
            let (tray, screen, scale) = match crate::shell::taskbar_geometry() {
                Some((t, s, k)) => (Some(t), s, k),
                None => {
                    let (w, h) = crate::shell::screen_size();
                    (None, Rect { left: 0, top: 0, right: w, bottom: h }, win.scale_factor().unwrap_or(1.0))
                }
            };
            let (x, y) = origin(tray, screen, scale);
            (x, y, scale)
        }
    };
    crate::shell::place_window(&win, Rect { left: x, top: y, right: x + (W * scale).round() as i32, bottom: y + (H * scale).round() as i32 }, false);
}

pub fn open(app: &AppHandle, focus: Option<String>) {
    // Bubble clicks call this from their own thread; placing and focusing the window touches GTK.
    let a = app.clone();
    let _ = crate::shell::on_main(move || {
        let Some(win) = a.get_webview_window("panel") else { return };
        place(&a);
        let _ = win.show();
        let _ = win.set_focus();
        a.state::<Panel>().0.lock().unwrap().shown();
        let _ = a.emit_to("panel", "panel://visible", true);
        if let Some(id) = focus { let _ = a.emit_to("panel", "panel://focus", id); }
    });
}

/// Open the panel with a status-bar message (e.g. a "Jump" result from a toast).
pub fn open_with_status(app: &AppHandle, focus: Option<String>, status: String) {
    open(app, focus);
    let _ = app.emit_to("panel", "panel://status", status);
}

pub fn hide(app: &AppHandle) {
    if let Some(win) = app.get_webview_window("panel") { let _ = win.hide(); }
    app.state::<Panel>().0.lock().unwrap().hidden();
    let _ = app.emit_to("panel", "panel://visible", false);
}

pub fn toggle(app: &AppHandle, focus: Option<String>) {
    let show = app.state::<Panel>().0.lock().unwrap().toggle(pets_core::time::now_ms());
    if show { open(app, focus) } else { hide(app) }
}

#[tauri::command]
pub fn panel_open(app: AppHandle, focus: Option<String>) { toggle(&app, focus); }

#[tauri::command]
pub fn panel_hide(app: AppHandle) { hide(&app); }

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn click_that_caused_the_blur_closes_instead_of_reopening() {
        let mut t = PanelToggle::default();
        assert!(t.toggle(1_000), "closed → open");
        t.shown();
        t.blurred(2_000);
        assert!(!t.toggle(2_100), "click just after focus loss: remains closed");
        assert!(t.toggle(3_000), "later click opens");
    }

    #[test]
    fn toggle_closes_an_open_panel() {
        let mut t = PanelToggle::default();
        t.shown();
        assert!(!t.toggle(5_000));
    }

    #[test]
    fn focus_out_right_after_open_is_a_compositor_bounce() {
        let mut t = PanelToggle::default();
        t.shown();
        t.shown_at = 1_000;
        assert!(t.transient_blur(1_200), "bounce within the guard is ignored");
        assert!(!t.transient_blur(1_400), "later focus-out still hides");
    }

    const SCREEN: Rect = Rect { left: 0, top: 0, right: 2560, bottom: 1440 };

    #[test]
    fn panel_opens_beside_a_vertical_taskbar_at_the_bottom() {
        let left = Rect { left: 0, top: 0, right: 62, bottom: 1440 };
        assert_eq!(origin(Some(left), SCREEN, 1.0), (62 + 12, 1440 - 540 - 12));
        let right = Rect { left: 2498, top: 0, right: 2560, bottom: 1440 };
        assert_eq!(origin(Some(right), SCREEN, 1.0), (2498 - 400 - 12, 1440 - 540 - 12));
    }

    #[test]
    fn panel_sits_above_the_real_taskbar_at_the_right_edge() {
        let tray = Rect { left: 0, top: 1368, right: 2560, bottom: 1440 };
        assert_eq!(origin(Some(tray), SCREEN, 1.5), (2560 - 600 - 18, 1368 - 810 - 18));
    }

    #[test]
    fn on_the_second_monitor_the_panel_stays_on_that_monitor() {
        let mon2 = Rect { left: -1920, top: 139, right: 0, bottom: 1219 };
        let bar2 = Rect { left: -1920, top: 1171, right: 0, bottom: 1219 };
        assert_eq!(origin(Some(bar2), mon2, 1.0), (-400 - 12, 1171 - 540 - 12));
    }

    #[test]
    fn next_to_a_floating_stage_above_it_or_below_when_there_is_no_room() {
        let work = Rect { left: 0, top: 0, right: 2560, bottom: 1392 };
        let low = Rect { left: 1000, top: 1200, right: 1200, bottom: 1248 };
        assert_eq!(origin_near(low, work, 1.0), (1100 - 200, 1200 - 540 - 12));
        let high = Rect { left: 2500, top: 20, right: 2560, bottom: 68 };
        assert_eq!(origin_near(high, work, 1.0), (2560 - 400 - 12, 68 + 12));
    }

    #[test]
    fn hidden_or_unknown_taskbar_uses_the_screen_bottom() {
        let hidden = Rect { left: 0, top: 1438, right: 2560, bottom: 1510 };
        assert_eq!(origin(Some(hidden), SCREEN, 1.0), (2560 - 400 - 12, 1440 - 540 - 12));
        assert_eq!(origin(None, SCREEN, 1.0), (2560 - 400 - 12, 1440 - 540 - 12));
    }
}
