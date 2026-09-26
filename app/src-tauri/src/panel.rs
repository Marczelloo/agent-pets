//! Panel nad paskiem: lista sesji, limity, „Przejdź”. Okno pokazywane i chowane wyłącznie przez API Tauri.
use crate::shell::placement::Rect;
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager, PhysicalPosition, WebviewUrl, WebviewWindowBuilder, WindowEvent};

const W: f64 = 400.0;
const H: f64 = 540.0;
const MARGIN: f64 = 12.0;
const BLUR_GRACE_MS: i64 = 400;

#[derive(Default)]
pub struct PanelToggle { visible: bool, blurred_at: Option<i64> }

impl PanelToggle {
    pub fn shown(&mut self) { self.visible = true; self.blurred_at = None; }
    pub fn blurred(&mut self, now: i64) { self.visible = false; self.blurred_at = Some(now); }
    pub fn hidden(&mut self) { self.visible = false; }
    /// Czy po kliknięciu panel ma być widoczny. Kliknięcie ikony albo sceny samo zabiera panelowi fokus,
    /// więc klik tuż po utracie fokusu to „zamknij”, a nie „zamknij i otwórz”.
    pub fn toggle(&mut self, now: i64) -> bool {
        if self.visible { return false; }
        !matches!(self.blurred_at, Some(t) if now - t < BLUR_GRACE_MS)
    }
}

#[derive(Default)]
pub struct Panel(pub Mutex<PanelToggle>);

/// Lewy górny róg panelu (piksele fizyczne): nad paskiem przy prawej krawędzi, jak wysuwane panele Windows 11.
/// Pasek schowany (auto-ukrywanie) albo nieznany: nad dolną krawędzią ekranu.
pub fn origin(tray: Option<Rect>, screen: Rect, scale: f64) -> (i32, i32) {
    let (w, h, m) = (W * scale, H * scale, MARGIN * scale);
    let bottom = match tray {
        Some(t) if t.top > screen.top && t.top < screen.bottom - 2 => t.top,
        _ => screen.bottom,
    };
    ((screen.right as f64 - w - m).round() as i32, (bottom as f64 - h - m).round() as i32)
}

/// Panel przy scenie pływającej: nad nią (albo pod nią, gdy brak miejsca), wyśrodkowany, w obszarze roboczym.
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
        .skip_taskbar(true).resizable(false).shadow(true).visible(false).build()?;
    let a = app.clone();
    w.on_window_event(move |e| if let WindowEvent::Focused(false) = e {
        if let Some(win) = a.get_webview_window("panel") { let _ = win.hide(); }
        a.state::<Panel>().0.lock().unwrap().blurred(pets_core::time::now_ms());
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
    let _ = win.set_size(tauri::PhysicalSize::new((W * scale).round() as u32, (H * scale).round() as u32));
    let _ = win.set_position(PhysicalPosition::new(x, y));
}

pub fn open(app: &AppHandle, focus: Option<String>) {
    let Some(win) = app.get_webview_window("panel") else { return };
    place(app);
    let _ = win.show();
    let _ = win.set_focus();
    app.state::<Panel>().0.lock().unwrap().shown();
    let _ = app.emit_to("panel", "panel://visible", true);
    if let Some(id) = focus { let _ = app.emit_to("panel", "panel://focus", id); }
}

/// Otwiera panel z komunikatem w pasku statusu (np. wynik „Przejdź” z toastu).
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
        assert!(t.toggle(1_000), "zamknięty → otwórz");
        t.shown();
        t.blurred(2_000);
        assert!(!t.toggle(2_100), "klik zaraz po utracie fokusu: zostaje zamknięty");
        assert!(t.toggle(3_000), "późniejszy klik otwiera");
    }

    #[test]
    fn toggle_closes_an_open_panel() {
        let mut t = PanelToggle::default();
        t.shown();
        assert!(!t.toggle(5_000));
    }

    const SCREEN: Rect = Rect { left: 0, top: 0, right: 2560, bottom: 1440 };

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
