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
    let seq = {
        let mut a = tip.inner.lock().unwrap();
        let seq = a.seq + 1;
        *a = Anchor { seq, x: left + (anchor_x * scale).round() as i32, top, scale, open: true };
        seq
    };
    let _ = app.emit_to("tooltip", "tooltip://content", ContentMsg { seq, content });
}

#[tauri::command]
pub fn tooltip_size(app: AppHandle, tip: State<Tooltip>, seq: u64, w: f64, h: f64) {
    let a = *tip.inner.lock().unwrap();
    if !a.open || a.seq != seq { return; } // spóźniona odpowiedź na starą treść albo tooltip już schowany
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
pub fn tooltip_hide(app: AppHandle, tip: State<Tooltip>) {
    tip.inner.lock().unwrap().open = false;
    if let Some(win) = app.get_webview_window("tooltip") { let _ = win.hide(); }
}
