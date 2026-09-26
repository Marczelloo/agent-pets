//! Okno tooltipa nad paskiem (scena ma wysokość paska, więc tooltip to osobne okno).
//! Przepływ: scena → `tooltip_show` → treść do okna → okno mierzy się → `tooltip_size` → pozycja i pokazanie.
use crate::shell::{self, placement::Rect, Shell};
use serde::Serialize;
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager, PhysicalPosition, PhysicalSize, State, WebviewUrl, WebviewWindowBuilder};

#[derive(Default)]
pub struct Tooltip { inner: Mutex<Anchor> }

#[derive(Default, Clone, Copy)]
struct Anchor { seq: u64, x: i32, stage: Rect, monitor: Rect, scale: f64, open: bool }

impl Tooltip {
    /// Nowa treść zakotwiczona w `x` (px ekranu) przy scenie `stage` na monitorze `monitor`;
    /// zwraca numer, na który musi odpowiedzieć okno.
    fn open(&self, x: i32, stage: Rect, monitor: Rect, scale: f64) -> u64 {
        let mut a = self.inner.lock().unwrap();
        let seq = a.seq + 1;
        *a = Anchor { seq, x, stage, monitor, scale, open: true };
        seq
    }

    /// Kotwica dla rozmiaru zmierzonego przez okno; `None` dla starej treści albo schowanego tooltipa.
    fn accept_size(&self, seq: u64) -> Option<Anchor> {
        let a = *self.inner.lock().unwrap();
        (a.open && a.seq == seq).then_some(a)
    }

    fn close(&self) { self.inner.lock().unwrap().open = false; }

    /// Chowa tooltip, np. gdy strona sceny została załadowana od nowa (restart Explorera):
    /// nowa strona nie wie o tooltipie starej i sama by go nie schowała.
    pub fn hide(&self, app: &AppHandle) {
        self.close();
        if let Some(win) = app.get_webview_window("tooltip") { shell::hide(&win); }
    }
}

#[derive(Serialize, Clone)]
struct ContentMsg { seq: u64, content: serde_json::Value }

pub fn build(app: &AppHandle) -> tauri::Result<()> {
    let w = WebviewWindowBuilder::new(app, "tooltip", WebviewUrl::App("tooltip.html".into()))
        .title("agent-pets-tooltip").inner_size(280.0, 120.0).decorations(false).transparent(true)
        .always_on_top(true).skip_taskbar(true).resizable(false).shadow(false).focused(false).visible(false)
        .build()?;
    w.set_ignore_cursor_events(true)?;
    Ok(())
}

#[tauri::command]
pub fn tooltip_show(app: AppHandle, tip: State<Tooltip>, shell: State<Shell>, anchor_x: f64, content: serde_json::Value) {
    let Some((stage, monitor, scale)) = shell.stage_geom() else { return };
    let seq = tip.open(stage.left + (anchor_x * scale).round() as i32, stage, monitor, scale);
    let _ = app.emit_to("tooltip", "tooltip://content", ContentMsg { seq, content });
}

#[tauri::command]
pub fn tooltip_size(app: AppHandle, tip: State<Tooltip>, seq: u64, w: f64, h: f64) {
    let Some(a) = tip.accept_size(seq) else { return }; // spóźniona odpowiedź na starą treść albo tooltip już schowany
    let Some(win) = app.get_webview_window("tooltip") else { return };
    let (pw, ph) = ((w * a.scale).round() as i32, (h * a.scale).round() as i32);
    let (x, y) = shell::placement::tooltip_pos(a.x, a.stage, a.monitor, pw, ph, a.scale);
    let _ = win.set_size(PhysicalSize::new(pw.max(1) as u32, ph.max(1) as u32));
    let _ = win.set_position(PhysicalPosition::new(x, y));
    shell::show_no_activate(&win);
}

#[tauri::command]
pub fn tooltip_hide(app: AppHandle, tip: State<Tooltip>) { tip.hide(&app); }

#[cfg(test)]
mod tests {
    use super::*;

    const STAGE: Rect = Rect { left: 2000, top: 1392, right: 2200, bottom: 1440 };
    const SCREEN: Rect = Rect { left: 0, top: 0, right: 2560, bottom: 1440 };

    #[test]
    fn close_drops_the_pending_size_of_an_open_tooltip() {
        let t = Tooltip::default();
        let seq = t.open(100, STAGE, SCREEN, 1.0);
        assert!(t.accept_size(seq).is_some());
        t.close();
        assert!(t.accept_size(seq).is_none());
    }

    #[test]
    fn only_the_latest_content_is_sized() {
        let t = Tooltip::default();
        let old = t.open(100, STAGE, SCREEN, 1.0);
        let new = t.open(200, STAGE, SCREEN, 1.0);
        assert!(t.accept_size(old).is_none());
        assert_eq!(t.accept_size(new).map(|a| a.x), Some(200));
    }
}
