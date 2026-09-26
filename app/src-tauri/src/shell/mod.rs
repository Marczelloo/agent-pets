//! Okno sceny w pasku zadań: osadzenie, pętla układu, odtwarzanie po restarcie Explorera, widoczność.
pub mod memo;
pub mod menu;
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

#[derive(Debug)]
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

/// `layout`: ostatnio wysłany układ (okno ustawień otwarte później też zna notkę o ikonach po lewej).
pub struct Shell { tx: Sender<Cmd>, pub stage: Arc<AtomicIsize>, mode: Arc<AtomicU8>, layout: Arc<std::sync::Mutex<Option<Layout>>> }

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

/// Co zrobić z rodzicem okna sceny. `parent`: `None` przed pierwszym obrotem (stan okna nieznany),
/// `Some(0)` okno najwyższego poziomu, `Some(pasek)` osadzone.
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

/// Okno pływające trzeba ustawić, gdy zmienił się cel albo Windows sam zmienił okno (np. `WM_DPICHANGED`
/// po przejściu na monitor o innej skali przeskalował je od starego rozmiaru).
pub fn needs_apply(target: Option<placement::Rect>, last: Option<placement::Rect>, actual: Option<placement::Rect>) -> bool {
    target != last || (target.is_some() && actual != target)
}

/// Szerokość i „witaj” obsługujemy zawsze od razu (nie mogą zginąć przy chwilowym braku paska);
/// reszta czeka w kolejce. Zwraca, czy strona prosi o ponowne wysłanie układu.
pub fn take_basic(pending: &mut Vec<Cmd>, want: &mut f64) -> bool {
    let mut hello = false;
    pending.retain(|c| match c {
        Cmd::Width(w) => { *want = *w; false }
        Cmd::Hello => { hello = true; false }
        _ => true,
    });
    hello
}

/// Czy mierzyć pasek i monitory od nowa. Samo przeciąganie (do ~33 razy na sekundę) korzysta z pomiaru
/// sprzed najwyżej sekundy: wyliczanie monitorów i przejście UI Automation kosztują.
pub fn remeasure(pending: &[Cmd], age: Option<Duration>) -> bool {
    let only_drags = !pending.is_empty() && pending.iter().all(|c| matches!(c, Cmd::Drag(_)));
    !only_drags || age.map_or(true, |a| a >= Duration::from_secs(1))
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
        let layout = Arc::new(std::sync::Mutex::new(None));
        let (m, l) = (mode.clone(), layout.clone());
        std::thread::spawn(move || run(a, rx, s, m, l));
        pointer::spawn(app.clone(), stage.clone(), mode.clone(), tx.clone());
        Ok(Shell { tx, stage, mode, layout })
    }

    pub fn set_width(&self, css: f64) { let _ = self.tx.send(Cmd::Width(css)); }
    /// Nowo załadowana strona prosi o ponowne wysłanie układu i widoczności.
    pub fn hello(&self) { let _ = self.tx.send(Cmd::Hello); }
    pub fn settings_changed(&self) { let _ = self.tx.send(Cmd::Settings); }
    pub fn start_move(&self) { let _ = self.tx.send(Cmd::Move(true)); }
    fn hwnd(&self) -> windows::Win32::Foundation::HWND { taskbar::hwnd(self.stage.load(Ordering::Relaxed)) }
    pub fn floating(&self) -> bool { self.mode.load(Ordering::Relaxed) == pointer::FLOATING }
    pub fn layout(&self) -> Option<Layout> { *self.layout.lock().unwrap() }

    /// Przepuszczanie kliknięć przez przezroczyste miejsca okna pływającego (w pasku nic nie robi).
    pub fn passthrough(&self, on: bool) {
        let on = on && self.floating();
        pointer::PASSTHROUGH.store(on, Ordering::Relaxed);
        taskbar::passthrough(self.hwnd(), on);
    }

    /// Scena, jej monitor i skala: do ustawienia tooltipa.
    pub fn stage_geom(&self) -> Option<(placement::Rect, placement::Rect, f64)> {
        let h = self.hwnd();
        let (monitor, _) = taskbar::monitor_of(h)?;
        Some((taskbar::rect_of(h)?, monitor, taskbar::scale_of(h)))
    }

    /// Gdzie otworzyć panel: przy pasku monitora sceny albo obok sceny pływającej.
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

/// Monitory dla karty „Pasek”.
pub fn monitors() -> Vec<placement::MonitorInfo> { taskbar::monitors().into_iter().map(|m| m.info).collect() }

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

/// Przeciąganie okna pływającego: prostokąt w chwili chwycenia i bieżąca kotwica.
struct FloatDrag { from: placement::Rect, at: (f64, f64) }

fn run(app: AppHandle, rx: Receiver<Cmd>, stage: Arc<AtomicIsize>, pmode: Arc<AtomicU8>, shared: Arc<std::sync::Mutex<Option<Layout>>>) {
    use tauri::Manager;
    let uia = taskbar::Uia::new().ok();
    if uia.is_none() { eprintln!("agent-pets: UI Automation niedostępne, scena zostanie mała przy zasobniku"); }
    let (mut want, mut n) = (0.0f64, 1u32);
    // rodzic okna sceny: uchwyt paska (0 = okno najwyższego poziomu, None = jeszcze nieustalony)
    let (mut parent, mut embed_failed): (Option<isize>, bool) = (None, false);
    let mut pending: Vec<Cmd> = Vec::new();
    // ostatni pomiar monitorów i paska (przeciąganie korzysta z niego do sekundy)
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
        let float = st.position == Position::Floating;
        let chosen = placement::pick(&mons.iter().map(|m| (m.info.clone(), m.bar.is_some())).collect::<Vec<_>>(), &st.monitor, float);
        let Some(mon) = mons.get(chosen) else { continue };
        let bar = if float { None } else { mon.bar.or_else(taskbar::tray) };
        if !float && bar.is_none() { continue; }
        let mut h = stage.load(Ordering::Relaxed);
        if !taskbar::is_window(h) {
            // okno zginęło razem z paskiem przy restarcie Explorera
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
        match attach(parent, bar.map(|b| b.0 as isize)) {
            Attach::Embed(b) => {
                // z okna pływającego: w pasku kliknięcia zawsze są nasze
                pointer::PASSTHROUGH.store(false, Ordering::Relaxed);
                taskbar::passthrough(hw, false);
                embed_failed = taskbar::embed(hw, taskbar::hwnd(b)).is_err();
                if embed_failed { eprintln!("agent-pets: osadzenie w pasku nie powiodło się, okno pływające"); }
                parent = Some(b);
                last_layout = None;
            }
            Attach::Detach => {
                taskbar::detach(hw);
                parent = Some(0);
                embed_failed = false;
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
                        if let Err(e) = crate::settings::update(&app, |s| s.stage.floating_at = Some(pets_core::settings::Point { x, y })) {
                            eprintln!("agent-pets: {e}");
                        }
                    },
                    Cmd::Width(_) | Cmd::Hello | Cmd::Settings | Cmd::Move(_) | Cmd::MoveDone(_) | Cmd::Drag(_) => {}
                }
            }
            let at = dragging.as_ref().map(|d| d.at).or(saved);
            let l = Layout { max_css: ((mon.work.right - mon.work.left) as f64 / mon.scale - 16.0).floor(), height_css: h_css,
                scale: mon.scale, mode: "floating", light: crate::system::light_taskbar(), left_fallback: false };
            if last_layout != Some(l) { let _ = app.emit("pets://layout", l); last_layout = Some(l); *shared.lock().unwrap() = Some(l); }
            let vis = !taskbar::fullscreen_app();
            if last_visible != Some(vis) { let _ = app.emit("pets://visibility", vis); last_visible = Some(vis); }
            let r = (want > 0.0 && vis).then(|| placement::float_rect(mon.work, at, anchor, want, h_css, mon.scale));
            if needs_apply(r, last_rect, taskbar::rect_of(hw)) { taskbar::apply_rect(hw, r); last_rect = r; }
            continue;
        }
        dragging = None;
        last_rect = None;
        if moving.is_none() { set_pmode(pointer::NORMAL); }
        let Some(b) = bar else { continue };
        let cached = bar_metrics.filter(|(h, _)| !fresh && *h == b.0 as isize).map(|(_, m)| m);
        let Some(m) = cached.or_else(|| taskbar::metrics(b, uia.as_ref())) else { continue };
        bar_metrics = Some((b.0 as isize, m));
        let width = (m.tray.right - m.tray.left).max(1) as f64;
        let px_of = |at: f64| m.tray.left + (at * width).round() as i32;
        for c in std::mem::take(&mut pending) {
            match c {
                Cmd::Width(_) | Cmd::Hello | Cmd::Settings => {}
                Cmd::Move(true) if moving.is_none() => {
                    let mode = mode_of(&st);
                    let anchor = match mode { Mode::Left => Anchor::Left, Mode::Custom { anchor, .. } => anchor, Mode::Right => Anchor::Right };
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
                        let (at, align) = (mv.at, align_of(mv.anchor));
                        if let Err(e) = crate::settings::update(&app, |s| { s.stage.position = Position::Custom; s.stage.custom_at = Some(at); s.stage.align = align; }) {
                            eprintln!("agent-pets: {e}");
                        }
                    }
                },
            }
        }
        // w trakcie przesuwania pozycja z przesuwania, inaczej z ustawień
        let mode = match &moving { Some(mv) => Mode::Custom { at: mv.at, anchor: mv.anchor }, None => mode_of(&st) };
        let p = placement::place_mode(&m, want, mode);
        if let Some(p) = p {
            let l = Layout { max_css: p.max_css.floor(), height_css: p.height_css, scale: m.scale, mode: "taskbar",
                light: crate::system::light_taskbar(), left_fallback: p.left_fallback && st.position == Position::Left };
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
