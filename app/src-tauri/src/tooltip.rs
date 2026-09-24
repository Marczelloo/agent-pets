//! Okno tooltipa nad paskiem (scena ma wysokość paska, więc tooltip to osobne okno).
//! Przepływ: scena → `tooltip_show` → treść do okna → okno mierzy się → `tooltip_size` → pozycja i pokazanie.
use crate::shell::{self, Shell};
use serde::Serialize;
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager, PhysicalPosition, PhysicalSize, State, WebviewUrl, WebviewWindowBuilder};

#[derive(Default)]
pub struct Tooltip { inner: Mutex<Anchor> }

#[derive(Default, Clone, Copy)]
struct Anchor { seq: u64, x: i32, top: i32, scale: f64, open: bool }

impl Tooltip {
    /// Nowa treść zakotwiczona w `x` (px ekranu) nad `top`; zwraca numer, na który musi odpowiedzieć okno.
    fn open(&self, x: i32, top: i32, scale: f64) -> u64 {
        let mut a = self.inner.lock().unwrap();
        let seq = a.seq + 1;
        *a = Anchor { seq, x, top, scale, open: true };
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
        if let Some(win) = app.get_webview_window("tooltip") { let _ = win.hide(); }
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
    let Some((left, top, scale)) = shell.stage_origin() else { return };
    let seq = tip.open(left + (anchor_x * scale).round() as i32, top, scale);
    let _ = app.emit_to("tooltip", "tooltip://content", ContentMsg { seq, content });
}

#[tauri::command]
pub fn tooltip_size(app: AppHandle, tip: State<Tooltip>, seq: u64, w: f64, h: f64) {
    let Some(a) = tip.accept_size(seq) else { return }; // spóźniona odpowiedź na starą treść albo tooltip już schowany
    let Some(win) = app.get_webview_window("tooltip") else { return };
    let (pw, ph) = ((w * a.scale).round() as i32, (h * a.scale).round() as i32);
    let (sw, _) = shell::screen_size();
    let x = (a.x - pw / 2).clamp(4, (sw - pw - 4).max(4));
    let y = a.top - ph - (6.0 * a.scale).round() as i32;
    let _ = win.set_size(PhysicalSize::new(pw.max(1) as u32, ph.max(1) as u32));
    let _ = win.set_position(PhysicalPosition::new(x, y));
    shell::show_no_activate(&win);
}

#[tauri::command]
pub fn tooltip_hide(app: AppHandle, tip: State<Tooltip>) { tip.hide(&app); }

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn close_drops_the_pending_size_of_an_open_tooltip() {
        let t = Tooltip::default();
        let seq = t.open(100, 1392, 1.0);
        assert!(t.accept_size(seq).is_some());
        t.close();
        assert!(t.accept_size(seq).is_none());
    }

    #[test]
    fn only_the_latest_content_is_sized() {
        let t = Tooltip::default();
        let old = t.open(100, 1392, 1.0);
        let new = t.open(200, 1392, 1.0);
        assert!(t.accept_size(old).is_none());
        assert_eq!(t.accept_size(new).map(|a| a.x), Some(200));
    }
}
