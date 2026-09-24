//! Natywna mysz: WebView2 osadzony w oknie innego procesu nie dostaje zdarzeń DOM (spike S1),
//! więc co 30 ms czytamy kursor i przyciski i wysyłamy `pets://pointer` w pikselach CSS sceny.
use serde::Serialize;
use std::sync::atomic::{AtomicIsize, Ordering};
use std::sync::Arc;
use std::time::Duration;
use tauri::{AppHandle, Emitter};

#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct Sample { pub inside: bool, pub x: f64, pub y: f64, pub left: bool, pub right: bool }

#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum PointerEvent { Move { x: f64, y: f64 }, Leave, Click { x: f64, y: f64 }, Context { x: f64, y: f64 } }

pub fn diff(prev: &Sample, cur: &Sample) -> Vec<PointerEvent> {
    let mut out = Vec::new();
    if cur.inside {
        if !prev.inside || prev.x != cur.x || prev.y != cur.y { out.push(PointerEvent::Move { x: cur.x, y: cur.y }); }
        if cur.left && !prev.left && prev.inside { out.push(PointerEvent::Click { x: cur.x, y: cur.y }); }
        if cur.right && !prev.right && prev.inside { out.push(PointerEvent::Context { x: cur.x, y: cur.y }); }
    } else if prev.inside {
        out.push(PointerEvent::Leave);
    }
    out
}

pub fn spawn(app: AppHandle, stage: Arc<AtomicIsize>) {
    std::thread::spawn(move || {
        let mut prev = Sample::default();
        loop {
            std::thread::sleep(Duration::from_millis(30));
            let cur = sample(stage.load(Ordering::Relaxed)).unwrap_or_default();
            for e in diff(&prev, &cur) { let _ = app.emit("pets://pointer", e); }
            prev = cur;
        }
    });
}

fn sample(raw: isize) -> Option<Sample> {
    use windows::Win32::Foundation::{POINT, RECT};
    use windows::Win32::UI::HiDpi::GetDpiForWindow;
    use windows::Win32::UI::Input::KeyboardAndMouse::{GetAsyncKeyState, VIRTUAL_KEY, VK_LBUTTON, VK_RBUTTON};
    use windows::Win32::UI::WindowsAndMessaging::{GetCursorPos, GetWindowRect, IsChild, WindowFromPoint};
    if raw == 0 { return None; }
    let h = super::taskbar::hwnd(raw);
    unsafe {
        let mut r = RECT::default();
        GetWindowRect(h, &mut r).ok()?;
        let mut p = POINT::default();
        GetCursorPos(&mut p).ok()?;
        let hit = WindowFromPoint(p);
        let inside = p.x >= r.left && p.x < r.right && p.y >= r.top && p.y < r.bottom && (hit == h || IsChild(h, hit).as_bool());
        let dpi = GetDpiForWindow(h);
        let scale = if dpi == 0 { 1.0 } else { dpi as f64 / 96.0 };
        let down = |vk: VIRTUAL_KEY| (GetAsyncKeyState(vk.0 as i32) as u16 & 0x8000) != 0;
        Some(Sample {
            inside,
            x: ((p.x - r.left) as f64 / scale).round(),
            y: ((p.y - r.top) as f64 / scale).round(),
            left: down(VK_LBUTTON),
            right: down(VK_RBUTTON),
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn at(x: f64, y: f64) -> Sample { Sample { inside: true, x, y, left: false, right: false } }

    #[test]
    fn enter_move_and_leave() {
        let out = Sample::default();
        assert_eq!(diff(&out, &at(10.0, 20.0)), vec![PointerEvent::Move { x: 10.0, y: 20.0 }]);
        assert!(diff(&at(10.0, 20.0), &at(10.0, 20.0)).is_empty());
        assert_eq!(diff(&at(10.0, 20.0), &at(11.0, 20.0)), vec![PointerEvent::Move { x: 11.0, y: 20.0 }]);
        assert_eq!(diff(&at(11.0, 20.0), &out), vec![PointerEvent::Leave]);
    }

    #[test]
    fn click_only_on_the_press_edge_inside() {
        let down = Sample { left: true, ..at(5.0, 5.0) };
        assert_eq!(diff(&at(5.0, 5.0), &down), vec![PointerEvent::Click { x: 5.0, y: 5.0 }]);
        assert!(diff(&down, &down).is_empty());
        // wciśnięty poza sceną i przeciągnięty do środka: to nie jest kliknięcie
        let outside_down = Sample { inside: false, left: true, ..Sample::default() };
        assert_eq!(diff(&outside_down, &down), vec![PointerEvent::Move { x: 5.0, y: 5.0 }]);
    }

    #[test]
    fn right_button_is_a_context_click() {
        let r = Sample { right: true, ..at(3.0, 4.0) };
        assert_eq!(diff(&at(3.0, 4.0), &r), vec![PointerEvent::Context { x: 3.0, y: 4.0 }]);
    }

    #[test]
    fn serializes_for_the_ui() {
        assert_eq!(serde_json::to_string(&PointerEvent::Leave).unwrap(), r#"{"kind":"leave"}"#);
        assert_eq!(serde_json::to_string(&PointerEvent::Move { x: 1.0, y: 2.0 }).unwrap(), r#"{"kind":"move","x":1.0,"y":2.0}"#);
    }
}
