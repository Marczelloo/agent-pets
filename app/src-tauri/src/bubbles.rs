//! Okno dymków nad sceną (spec 0.8, 2.3): przezroczyste, zawsze na wierzchu, bez fokusu i bez przycisku w pasku.
//! Strona liczy, które dymki pokazać, i prosi o rozmiar (`bubbles_place`); Rust stawia okno nad sceną
//! (przy górnej krawędzi monitora pod nią). Mysz: okno przepuszcza kliknięcia poza dymkami; klik w dymek
//! rozpoznaje wątek kursora (30 ms), jak w oknie pływającym.
use crate::shell::{self, placement::Rect, Shell};
use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager, PhysicalPosition, PhysicalSize, State, WebviewUrl, WebviewWindowBuilder};

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum Kind { Question, Action }

/// Dymek do kliknięcia: prostokąt w px CSS okna dymków.
#[derive(Deserialize, Clone, Debug, PartialEq)]
pub struct Hit { pub id: String, pub kind: Kind, pub x: f64, pub y: f64, pub w: f64, pub h: f64 }

pub fn hit(hits: &[Hit], x: f64, y: f64) -> Option<&Hit> {
    hits.iter().find(|h| x >= h.x && x < h.x + h.w && y >= h.y && y < h.y + h.h)
}

/// Pas dymków: prostokąt okna (px ekranu), przesunięcie lewej krawędzi sceny względem okna i strona sceny.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Band { pub rect: Rect, pub offset: i32, pub above: bool }

/// Okno `pw`×`ph` z zapasem `margin` po obu stronach sceny, w granicach monitora; nad sceną albo pod nią.
pub fn band(stage: Rect, monitor: Rect, pw: i32, ph: i32, margin: i32) -> Band {
    let left = (stage.left - margin).clamp(monitor.left, (monitor.right - pw).max(monitor.left));
    let above = stage.top - ph >= monitor.top;
    let top = if above { stage.top - ph } else { stage.bottom };
    Band { rect: Rect { left, top, right: left + pw, bottom: top + ph }, offset: stage.left - left, above }
}

/// Dymki tylko przy widocznej scenie i bez aplikacji na pełnym ekranie (strona mogła przegapić `pets://visibility`).
pub fn allowed(fullscreen: bool, stage_shown: bool) -> bool { !fullscreen && stage_shown }

/// Zapas okna po obu stronach sceny (px CSS): dymek skrajnego zwierzaka może wystawać poza scenę.
pub const MARGIN_CSS: f64 = 150.0;

#[derive(Default)]
pub struct Bubbles { inner: Mutex<Inner> }

#[derive(Default)]
struct Inner { hits: Vec<Hit>, shown: bool }

impl Bubbles {
    pub fn set_hits(&self, hits: Vec<Hit>) { self.inner.lock().unwrap().hits = hits; }

    /// Nad zwierzakiem sesji widać teraz jakiś dymek: najechanie go rozwija zamiast pokazywać tooltip.
    pub fn showing(&self, id: &str) -> bool { self.inner.lock().unwrap().hits.iter().any(|h| h.id == id) }

    /// Nad zwierzakiem sesji widać teraz dymek z jej pytaniem (zastępuje toast „czeka na Ciebie”).
    pub fn asking(&self, id: &str) -> bool {
        let s = self.inner.lock().unwrap();
        // schowanie okna czyści prostokąty, więc wystarczy spojrzeć na nie
        s.hits.iter().any(|h| h.kind == Kind::Question && h.id == id)
    }
}

/// Odpowiedź na `bubbles_place`: przesunięcie sceny w oknie (px CSS) i czy pas jest nad sceną.
#[derive(Serialize, Clone, Copy, Debug)]
pub struct Placed { pub offset: f64, pub above: bool }

pub fn build(app: &AppHandle) -> tauri::Result<()> {
    let w = WebviewWindowBuilder::new(app, "bubbles", WebviewUrl::App("bubbles.html".into()))
        .title("agent-pets-bubbles").inner_size(400.0, 80.0).decorations(false).transparent(true)
        .always_on_top(true).skip_taskbar(true).resizable(false).shadow(false).focused(false).visible(false)
        .build()?;
    w.set_ignore_cursor_events(true)?;
    shell::no_activate(&w);
    spawn_pointer(app.clone());
    Ok(())
}

/// Pozycje widocznych zwierzaków ze sceny (px CSS sceny) dla strony dymków.
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct PetAt { pub id: String, pub x: f64 }

#[derive(Serialize, Clone, Debug)]
struct StagePets { pets: Vec<PetAt>, width: f64, zoom: f64 }

#[tauri::command]
pub fn stage_pets(app: AppHandle, pets: Vec<PetAt>, width: f64, zoom: f64) {
    let _ = app.emit_to("bubbles", "pets://stage-pets", StagePets { pets, width, zoom });
}

#[tauri::command]
pub fn bubbles_place(app: AppHandle, state: State<Bubbles>, shell: State<Shell>, w: f64, h: f64) -> Option<Placed> {
    if !allowed(shell::fullscreen_app(), shell.stage_shown()) { hide(&app, &state); return None; }
    let (stage, monitor, scale) = shell.stage_geom()?;
    let win = app.get_webview_window("bubbles")?;
    let b = band(stage, monitor, (w * scale).round() as i32, (h * scale).round() as i32, (MARGIN_CSS * scale).round() as i32);
    let _ = win.set_size(PhysicalSize::new((b.rect.right - b.rect.left).max(1) as u32, (b.rect.bottom - b.rect.top).max(1) as u32));
    let _ = win.set_position(PhysicalPosition::new(b.rect.left, b.rect.top));
    let mut s = state.inner.lock().unwrap();
    if !s.shown { shell::show_no_activate(&win); s.shown = true; }
    Some(Placed { offset: b.offset as f64 / scale, above: b.above })
}

#[tauri::command]
pub fn bubbles_hide(app: AppHandle, state: State<Bubbles>) { hide(&app, &state); }

pub fn hide(app: &AppHandle, state: &Bubbles) {
    let mut s = state.inner.lock().unwrap();
    s.hits.clear();
    if s.shown {
        if let Some(win) = app.get_webview_window("bubbles") { shell::hide(&win); }
        s.shown = false;
    }
}

/// Prostokąty dymków do kliknięcia (po każdym rysowaniu).
#[tauri::command]
pub fn bubbles_hits(state: State<Bubbles>, hits: Vec<Hit>) { state.set_hits(hits); }

/// Klik w dymek z pytaniem przenosi do sesji, w dymek z akcją otwiera panel na tej sesji.
fn click(app: &AppHandle, h: &Hit) {
    match h.kind {
        Kind::Question => {
            let r = crate::jump_to(app, &h.id);
            if r.needs_attention() { crate::panel::open_with_status(app, Some(h.id.clone()), r.detail); }
        }
        Kind::Action => crate::panel::open(app, Some(h.id.clone())),
    }
}

/// Dymek pod kursorem po zmianie (`Some(nowy)`), albo `None`, gdy nic się nie zmieniło.
pub fn hover_change(prev: &Option<String>, target: Option<&Hit>) -> Option<Option<String>> {
    let now = target.map(|h| h.id.clone());
    (now != *prev).then_some(now)
}

/// Kursor nad dymkiem: okno łapie mysz (bez fokusu); poza dymkami przepuszcza kliknięcia do okien pod spodem.
fn spawn_pointer(app: AppHandle) {
    std::thread::spawn(move || {
        let mut was_down = false;
        let mut over = false;
        // dymek pod kursorem rozwija się do pełnej treści, jak po najechaniu na zwierzaka
        let mut hovering: Option<String> = None;
        loop {
            std::thread::sleep(Duration::from_millis(30));
            let Some(win) = app.get_webview_window("bubbles") else { continue };
            let state = app.state::<Bubbles>();
            let hits = { let s = state.inner.lock().unwrap(); if s.shown { s.hits.clone() } else { Vec::new() } };
            let Some(c) = shell::cursor_in(&win) else { continue };
            let target = hit(&hits, c.x, c.y).cloned();
            if target.is_some() != over { over = target.is_some(); shell::set_passthrough(&win, !over); }
            if let Some(h) = hover_change(&hovering, target.as_ref()) {
                hovering = h;
                let _ = app.emit_to("bubbles", "pets://bubble-hover", hovering.clone());
            }
            if c.left && !was_down {
                if let Some(t) = &target {
                    let a = app.clone();
                    let t = t.clone();
                    // „Przejdź” uruchamia procesy: poza wątkiem kursora, jak przycisk w toaście
                    std::thread::spawn(move || click(&a, &t));
                }
            }
            was_down = c.left;
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::shell::placement::Rect;

    const MON: Rect = Rect { left: 0, top: 0, right: 2560, bottom: 1440 };
    const STAGE: Rect = Rect { left: 2000, top: 1392, right: 2200, bottom: 1440 };

    #[test]
    fn the_band_stands_above_the_stage_with_room_on_both_sides() {
        let b = band(STAGE, MON, 500, 80, 150);
        assert_eq!(b.rect, Rect { left: 1850, top: 1312, right: 2350, bottom: 1392 });
        assert_eq!((b.offset, b.above), (150, true));
    }

    #[test]
    fn the_band_stays_on_the_monitor_and_reports_the_shift() {
        let right = Rect { left: 2400, top: 1392, right: 2550, bottom: 1440 };
        let b = band(right, MON, 450, 80, 150);
        assert_eq!((b.rect.left, b.rect.right), (2110, 2560));
        assert_eq!(b.offset, 2400 - 2110, "strona przesuwa dymki o to, o ile okno nie mogło wyjść za ekran");
    }

    #[test]
    fn at_the_top_edge_the_band_goes_below_the_stage() {
        let floating = Rect { left: 100, top: 20, right: 300, bottom: 68 };
        let b = band(floating, MON, 500, 80, 150);
        assert_eq!((b.rect.top, b.rect.bottom, b.above), (68, 148, false));
        assert_eq!(b.rect.left, 0);
    }

    #[test]
    fn on_a_second_monitor_the_band_uses_that_monitor() {
        let second = Rect { left: -1920, top: 0, right: 0, bottom: 1080 };
        let stage = Rect { left: -300, top: 1032, right: -100, bottom: 1080 };
        let b = band(stage, second, 500, 80, 150);
        assert_eq!((b.rect.left, b.rect.right, b.rect.top), (-500, 0, 952));
    }

    #[test]
    fn hovering_a_pet_with_a_visible_bubble_expands_it_instead_of_the_tooltip() {
        let b = Bubbles::default();
        b.set_hits(vec![Hit { id: "a".into(), kind: Kind::Action, x: 0.0, y: 0.0, w: 10.0, h: 10.0 }]);
        assert!(b.showing("a"));
        assert!(!b.showing("b"));
    }

    #[test]
    fn the_bubble_under_the_cursor_is_reported_once_per_change() {
        let h = Hit { id: "a".into(), kind: Kind::Question, x: 0.0, y: 0.0, w: 10.0, h: 10.0 };
        assert_eq!(hover_change(&None, Some(&h)), Some(Some("a".into())));
        assert_eq!(hover_change(&Some("a".into()), Some(&h)), None, "bez zmiany nic nie wysyłamy");
        assert_eq!(hover_change(&Some("a".into()), None), Some(None));
        assert_eq!(hover_change(&None, None), None);
    }

    #[test]
    fn a_click_hits_the_bubble_under_the_cursor_only() {
        let hits = vec![
            Hit { id: "a".into(), kind: Kind::Question, x: 10.0, y: 40.0, w: 100.0, h: 30.0 },
            Hit { id: "b".into(), kind: Kind::Action, x: 120.0, y: 40.0, w: 80.0, h: 30.0 },
        ];
        assert_eq!(hit(&hits, 15.0, 45.0).map(|h| (h.id.as_str(), h.kind)), Some(("a", Kind::Question)));
        assert_eq!(hit(&hits, 150.0, 69.0).map(|h| h.id.as_str()), Some("b"));
        assert!(hit(&hits, 115.0, 45.0).is_none(), "przerwa między dymkami przepuszcza klik");
        assert!(hit(&hits, 15.0, 10.0).is_none());
    }

    #[test]
    fn no_bubbles_over_a_fullscreen_app_or_a_hidden_stage() {
        assert!(allowed(false, true));
        assert!(!allowed(true, true), "gra na pełnym ekranie");
        assert!(!allowed(false, false), "scena schowana (ukryty pasek, brak miejsca)");
    }

    #[test]
    fn a_visible_question_bubble_stands_in_for_the_toast() {
        let b = Bubbles::default();
        assert!(!b.asking("a"));
        b.set_hits(vec![Hit { id: "a".into(), kind: Kind::Question, x: 0.0, y: 0.0, w: 10.0, h: 10.0 },
                        Hit { id: "b".into(), kind: Kind::Action, x: 20.0, y: 0.0, w: 10.0, h: 10.0 }]);
        assert!(b.asking("a"));
        assert!(!b.asking("b"), "dymek z akcją to nie pytanie");
        b.set_hits(vec![]);
        assert!(!b.asking("a"), "dymek zniknął (pełny ekran, „+N”): toast znowu potrzebny");
    }
}
