//! Czysta geometria sceny w pasku zadań (bez Win32), w pikselach fizycznych ekranu.

#[derive(Clone, Copy, Debug, PartialEq, Eq, Default)]
pub struct Rect { pub left: i32, pub top: i32, pub right: i32, pub bottom: i32 }

impl Rect {
    pub fn height(&self) -> i32 { self.bottom - self.top }
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Metrics {
    pub tray: Rect,
    /// lewa krawędź zasobnika (`TrayNotifyWnd`) albo zegara drugiego paska
    pub notify_left: Option<i32>,
    /// prawa krawędź ostatniego elementu paska (Start, wyszukiwanie, ikony aplikacji) z UI Automation
    pub icons_right: Option<i32>,
    /// lewa krawędź pierwszego elementu grupy ikon (`StartButton`) z UI Automation
    pub first_left: Option<i32>,
    /// prawa krawędź elementów przed Startem (przycisk Widżetów), jeśli są
    pub widgets_right: Option<i32>,
    pub scale: f64,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Placement {
    /// pozycja we współrzędnych klienta paska (okno jest jego dzieckiem)
    pub x: i32,
    pub w: i32,
    pub h: i32,
    /// wolne miejsce w pikselach CSS; UI mieści w nim tylu zwierzaków, ilu się da
    pub max_css: f64,
    pub height_css: f64,
    /// tryb „lewa” bez lewej strefy (ikony do lewej): scena stoi przy zasobniku
    pub left_fallback: bool,
}

pub const GAP_CSS: f64 = 8.0;
/// Gdy UI Automation nie powie, gdzie kończą się ikony (brak UIA, zmiana paska w nowym Windows),
/// scena zostaje mała przy zasobniku (do 2 zwierzaków), zamiast ryzykować zasłonięcie ikon.
pub const FALLBACK_MAX_CSS: f64 = 200.0;
/// Najwęższa strefa, w której mieści się jeden zwierzak (sloty sceny przy u = 0,3 i marginesy).
pub const MIN_ZONE_CSS: f64 = 70.0;

/// Wolny od ikon fragment paska w pikselach ekranu, już z odstępami `GAP_CSS`.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Zone { pub left: i32, pub right: i32 }

impl Zone {
    pub fn width(&self) -> i32 { (self.right - self.left).max(0) }
    fn distance(&self, x: i32) -> i32 { if x < self.left { self.left - x } else if x > self.right { x - self.right } else { 0 } }
}

/// Po której stronie okna jest kotwica, czyli w którą stronę okno rośnie.
#[derive(Clone, Copy, Debug, PartialEq)]
pub enum Anchor { Left, Center, Right }

#[derive(Clone, Copy, Debug, PartialEq)]
pub enum Mode { Right, Left, Custom { at: f64, anchor: Anchor } }

/// Strefy: lewa (od krawędzi paska albo za Widżetami do pierwszego elementu grupy ikon), jeśli mieści zwierzaka,
/// i prawa (od ostatniej ikony do zasobnika).
pub fn zones(m: &Metrics) -> (Option<Zone>, Zone) {
    let gap = (GAP_CSS * m.scale).round() as i32;
    let right = m.notify_left.filter(|l| *l > m.tray.left && *l <= m.tray.right).unwrap_or(m.tray.right) - gap;
    let left = m.icons_right.filter(|r| *r >= m.tray.left).map(|r| r + gap)
        .unwrap_or_else(|| (right - (FALLBACK_MAX_CSS * m.scale).round() as i32).max(m.tray.left));
    let lz = m.first_left.filter(|f| *f > m.tray.left).map(|f| Zone {
        left: m.widgets_right.filter(|w| *w < f).unwrap_or(m.tray.left).max(m.tray.left) + gap,
        right: f - gap,
    }).filter(|z| z.width() as f64 >= MIN_ZONE_CSS * m.scale);
    (lz, Zone { left, right })
}

/// Okno w strefie przy kotwicy `a`: szerokość treści przycięta do strefy, okno dosunięte do jej wnętrza.
fn in_zone(m: &Metrics, z: Zone, a: i32, anchor: Anchor, want_css: f64, left_fallback: bool) -> Placement {
    let w = ((want_css.max(0.0) * m.scale).round() as i32).min(z.width());
    let x = match anchor { Anchor::Left => a, Anchor::Center => a - w / 2, Anchor::Right => a - w };
    let x = x.clamp(z.left, (z.right - w).max(z.left));
    Placement {
        x: x - m.tray.left, w, h: m.tray.height(),
        max_css: z.width() as f64 / m.scale, height_css: m.tray.height() as f64 / m.scale, left_fallback,
    }
}

/// Strefa zawierająca punkt albo najbliższa (przy remisie prawa, jak domyślna pozycja).
fn nearest(m: &Metrics, x: i32) -> Zone {
    match zones(m) {
        (Some(l), r) if l.distance(x) < r.distance(x) => l,
        (_, r) => r,
    }
}

/// Scena w wybranym trybie. Zawsze w wolnej strefie, nigdy na ikonach aplikacji.
/// `None`, gdy pomiar jest chwilowo niewiarygodny (w trakcie zmiany skali pasek ma wysokość 0).
pub fn place_mode(m: &Metrics, want_css: f64, mode: Mode) -> Option<Placement> {
    if m.tray.height() <= 0 || m.scale <= 0.0 { return None; }
    let (lz, rz) = zones(m);
    Some(match mode {
        Mode::Right => in_zone(m, rz, rz.right, Anchor::Right, want_css, false),
        Mode::Left => match lz {
            Some(z) => in_zone(m, z, z.left, Anchor::Left, want_css, false),
            None => in_zone(m, rz, rz.right, Anchor::Right, want_css, true),
        },
        Mode::Custom { at, anchor } => {
            let a = m.tray.left + (at.clamp(0.0, 1.0) * (m.tray.right - m.tray.left) as f64).round() as i32;
            let z = nearest(m, a);
            in_zone(m, z, a.clamp(z.left, z.right), anchor, want_css, false)
        }
    })
}

/// Scena przy zasobniku (tryb „prawa”, zachowanie z 0.6); testy z 0.6 sprawdzają nim te same liczby.
#[cfg(test)]
pub fn place(m: &Metrics, want_css: f64) -> Option<Placement> { place_mode(m, want_css, Mode::Right) }

/// Kotwica przeciągniętej sceny (px ekranu) → ułamek szerokości paska, przyciągnięty do najbliższej strefy.
pub fn custom_at(m: &Metrics, anchor_x: i32) -> f64 {
    let z = nearest(m, anchor_x);
    let width = (m.tray.right - m.tray.left).max(1) as f64;
    (anchor_x.clamp(z.left, z.right) - m.tray.left) as f64 / width
}

/// Monitor dla karty „Pasek”: `id` to nazwa urządzenia (`szDevice`), `index` od 1 w kolejności Windows.
#[derive(serde::Serialize, Clone, Debug, PartialEq)]
pub struct MonitorInfo { pub id: String, pub primary: bool, pub width: i32, pub height: i32, pub index: u32 }

/// Który monitor: wybrany, jeśli jest podłączony i (w pasku) ma pasek; inaczej główny (ustawienie się nie zmienia).
/// Okno pływające nie potrzebuje paska, tylko obszaru roboczego.
pub fn pick(monitors: &[(MonitorInfo, bool)], want: &str, floating: bool) -> usize {
    let primary = monitors.iter().position(|(m, _)| m.primary).unwrap_or(0);
    if want == pets_core::settings::PRIMARY { return primary; }
    monitors.iter().position(|(m, bar)| (*bar || floating) && m.id == want).unwrap_or(primary)
}

/// Odstęp okna pływającego od paska przy pozycji domyślnej (px CSS).
pub const FLOAT_MARGIN_CSS: f64 = 16.0;

/// Okno pływające w pikselach ekranu. `at`: kotwica (px CSS od lewego górnego rogu obszaru roboczego) na dolnej
/// krawędzi okna, po stronie `anchor`; brak: środek nad paskiem. Wynik zawsze w obszarze roboczym.
pub fn float_rect(work: Rect, at: Option<(f64, f64)>, anchor: Anchor, w_css: f64, h_css: f64, scale: f64) -> Rect {
    let (w, h) = ((w_css * scale).round() as i32, (h_css * scale).round() as i32);
    let (ax, ay, anchor) = match at {
        Some((x, y)) => (work.left + (x * scale).round() as i32, work.top + (y * scale).round() as i32, anchor),
        None => ((work.left + work.right) / 2, work.bottom - (FLOAT_MARGIN_CSS * scale).round() as i32, Anchor::Center),
    };
    let x = match anchor { Anchor::Left => ax, Anchor::Center => ax - w / 2, Anchor::Right => ax - w };
    let x = x.clamp(work.left, (work.right - w).max(work.left));
    let y = (ay - h).clamp(work.top, (work.bottom - h).max(work.top));
    Rect { left: x, top: y, right: x + w, bottom: y + h }
}

/// Odwrotność `float_rect`: kotwica okna do zapisania w ustawieniach.
pub fn float_anchor(work: Rect, r: Rect, anchor: Anchor, scale: f64) -> (f64, f64) {
    let x = match anchor { Anchor::Left => r.left, Anchor::Center => (r.left + r.right) / 2, Anchor::Right => r.right };
    ((x - work.left) as f64 / scale, (r.bottom - work.top) as f64 / scale)
}

/// Tooltip nad sceną (albo pod nią, gdy nad nią brak miejsca), w granicach monitora sceny.
pub fn tooltip_pos(anchor_x: i32, stage: Rect, monitor: Rect, pw: i32, ph: i32, scale: f64) -> (i32, i32) {
    let (m4, gap) = ((4.0 * scale).round() as i32, (6.0 * scale).round() as i32);
    let x = (anchor_x - pw / 2).clamp(monitor.left + m4, (monitor.right - pw - m4).max(monitor.left + m4));
    let above = stage.top - ph - gap;
    (x, if above >= monitor.top { above } else { stage.bottom + gap })
}

/// Autoukryty pasek chowa się za dolną krawędź ekranu, zostawiając ok. 2 px.
pub fn taskbar_visible(tray: Rect, screen: Rect) -> bool {
    screen.bottom - tray.top > 4 && tray.bottom > screen.top
}

#[cfg(test)]
mod tests {
    use super::*;

    const TRAY: Rect = Rect { left: 0, top: 1392, right: 2560, bottom: 1440 };
    const SCREEN: Rect = Rect { left: 0, top: 0, right: 2560, bottom: 1440 };
    fn m(icons: Option<i32>, scale: f64) -> Metrics {
        Metrics { tray: TRAY, notify_left: Some(2291), icons_right: icons, first_left: None, widgets_right: None, scale }
    }
    /// Ikony na środku jak na maszynie deweloperskiej (spike S2): Start od 882, ostatnia ikona do 1657.
    fn centered() -> Metrics { Metrics { first_left: Some(882), ..m(Some(1657), 1.0) } }

    #[test]
    fn zones_with_centered_icons_left_aligned_icons_and_a_widgets_button() {
        let (l, r) = zones(&centered());
        assert_eq!(l, Some(Zone { left: 8, right: 874 }));
        assert_eq!(r, Zone { left: 1665, right: 2283 });
        let left_aligned = Metrics { first_left: Some(12), ..m(Some(700), 1.0) };
        assert_eq!(zones(&left_aligned).0, None);
        let widgets = Metrics { widgets_right: Some(160), ..centered() };
        assert_eq!(zones(&widgets).0, Some(Zone { left: 168, right: 874 }));
        assert_eq!(zones(&m(Some(1657), 1.0)).0, None, "without UIA edges there is no left zone");
    }

    #[test]
    fn left_mode_grows_right_from_the_left_zone_and_falls_back_to_the_tray() {
        let p = place_mode(&centered(), 300.0, Mode::Left).unwrap();
        assert_eq!((p.x, p.w, p.left_fallback), (8, 300, false));
        assert_eq!(p.max_css, 866.0);
        let left_aligned = Metrics { first_left: Some(12), ..m(Some(700), 1.0) };
        let f = place_mode(&left_aligned, 300.0, Mode::Left).unwrap();
        assert!(f.left_fallback);
        assert_eq!(Placement { left_fallback: false, ..f }, place(&left_aligned, 300.0).unwrap());
    }

    #[test]
    fn custom_anchor_inside_the_icons_snaps_to_the_nearest_zone() {
        // kotwica 1200 px leży w ikonach (882–1657): bliżej lewej strefy (koniec 874) niż prawej (początek 1665)
        let p = place_mode(&centered(), 200.0, Mode::Custom { at: 1200.0 / 2560.0, anchor: Anchor::Right }).unwrap();
        assert_eq!((p.x, p.w), (874 - 200, 200));
        let q = place_mode(&centered(), 200.0, Mode::Custom { at: 1600.0 / 2560.0, anchor: Anchor::Left }).unwrap();
        assert_eq!((q.x, q.w), (1665, 200));
    }

    #[test]
    fn custom_window_is_pushed_back_when_icons_grow_and_never_covers_them() {
        let at = 1700.0 / 2560.0;
        let before = place_mode(&centered(), 300.0, Mode::Custom { at, anchor: Anchor::Left }).unwrap();
        assert_eq!(before.x, 1700);
        // przybyło ikon: ostatnia kończy się teraz na 1900
        let grown = Metrics { icons_right: Some(1900), ..centered() };
        let after = place_mode(&grown, 300.0, Mode::Custom { at, anchor: Anchor::Left }).unwrap();
        assert!(after.x >= 1908, "{after:?}");
        assert!(after.x + after.w <= 2283);
        // strefa węższa niż treść: okno przycięte do strefy
        let tight = Metrics { icons_right: Some(2100), ..centered() };
        let t = place_mode(&tight, 300.0, Mode::Custom { at, anchor: Anchor::Left }).unwrap();
        assert_eq!((t.x, t.w), (2108, 2283 - 2108));
    }

    #[test]
    fn custom_anchor_round_trips_and_keeps_its_zone_on_another_resolution() {
        for (anchor, x) in [(Anchor::Left, 300), (Anchor::Center, 500), (Anchor::Right, 2000)] {
            let at = custom_at(&centered(), x);
            let p = place_mode(&centered(), 120.0, Mode::Custom { at, anchor }).unwrap();
            let got = match anchor { Anchor::Left => p.x, Anchor::Center => p.x + p.w / 2, Anchor::Right => p.x + p.w };
            assert!((got - x).abs() <= 1, "{anchor:?}: {got} vs {x}");
        }
        assert_eq!(custom_at(&centered(), 1200), 874.0 / 2560.0, "an anchor in the icons is stored snapped");
        // ten sam ułamek na pasku 1920 px (ikony 662–1242) zostaje w lewej strefie
        let small = Metrics { tray: Rect { left: 0, top: 1032, right: 1920, bottom: 1080 }, notify_left: Some(1700),
            icons_right: Some(1242), first_left: Some(662), widgets_right: None, scale: 1.0 };
        let p = place_mode(&small, 120.0, Mode::Custom { at: 300.0 / 2560.0, anchor: Anchor::Left }).unwrap();
        assert!(p.x + p.w <= 654, "{p:?}");
    }

    #[test]
    fn sits_left_of_the_tray_with_a_gap() {
        // liczby zmierzone na maszynie deweloperskiej przez UI Automation (ostatnia ikona kończy się na 1657)
        let p = place(&m(Some(1657), 1.0), 400.0).unwrap();
        assert_eq!((p.x, p.w, p.h), (2291 - 8 - 400, 400, 48));
        assert_eq!(p.max_css, (2291 - 8 - (1657 + 8)) as f64);
    }

    #[test]
    fn never_covers_app_icons() {
        let p = place(&m(Some(2100), 1.0), 400.0).unwrap();
        assert_eq!(p.w, 2291 - 8 - (2100 + 8));
        assert_eq!(p.x, 2100 + 8);
    }

    #[test]
    fn converts_css_to_physical_pixels_at_150_percent() {
        let p = place(&m(Some(1657), 1.5), 200.0).unwrap();
        assert_eq!(p.w, 300);
        assert_eq!(p.x, 2291 - 12 - 300);
        assert!((p.height_css - 32.0).abs() < 1e-9);
    }

    #[test]
    fn without_uia_stays_small_instead_of_risking_the_app_icons() {
        let p = place(&m(None, 1.0), 400.0).unwrap();
        assert_eq!(p.max_css, FALLBACK_MAX_CSS);
        assert_eq!(p.w, FALLBACK_MAX_CSS as i32);
        let p15 = place(&m(None, 1.5), 400.0).unwrap();
        assert_eq!(p15.max_css, FALLBACK_MAX_CSS);
        assert_eq!(p15.w, (FALLBACK_MAX_CSS * 1.5) as i32);
    }

    #[test]
    fn icons_reaching_the_tray_leave_no_room() {
        let p = place(&m(Some(2400), 1.0), 400.0).unwrap();
        assert_eq!((p.w, p.max_css), (0, 0.0));
    }

    #[test]
    fn skips_zero_height_measurements_during_dpi_change() {
        let mut mm = m(Some(1657), 1.0);
        mm.tray.bottom = mm.tray.top;
        assert!(place(&mm, 400.0).is_none());
    }

    fn mon(id: &str, primary: bool, has_bar: bool) -> (MonitorInfo, bool) {
        (MonitorInfo { id: id.into(), primary, width: 1920, height: 1080, index: 0 }, has_bar)
    }

    #[test]
    fn picks_the_chosen_monitor_or_falls_back_to_the_primary() {
        let ms = [mon(r"\\.\DISPLAY2", false, true), mon(r"\\.\DISPLAY1", true, true), mon(r"\\.\DISPLAY3", false, false)];
        assert_eq!(pick(&ms, "primary", false), 1);
        assert_eq!(pick(&ms, r"\\.\DISPLAY2", false), 0);
        assert_eq!(pick(&ms, r"\\.\DISPLAY3", false), 1, "no taskbar on that monitor");
        assert_eq!(pick(&ms, r"\\.\DISPLAY3", true), 2, "the floating window does not need a taskbar");
        assert_eq!(pick(&ms, r"\\.\DISPLAY9", true), 1, "unplugged");
        assert_eq!(pick(&[], "primary", false), 0);
    }

    // obszar roboczy drugiego monitora ze spike'a S1: na lewo od głównego, przesunięty w pionie
    const WORK2: Rect = Rect { left: -1920, top: 139, right: 0, bottom: 1171 };

    #[test]
    fn floating_window_defaults_above_the_taskbar_and_grows_from_its_anchor() {
        let r = float_rect(WORK2, None, Anchor::Right, 200.0, 48.0, 1.0);
        assert_eq!((r.left, r.right, r.bottom), (-960 - 100, -960 + 100, 1171 - 16));
        let at = Some((400.0, 500.0));
        assert_eq!(float_rect(WORK2, at, Anchor::Left, 200.0, 48.0, 1.0), Rect { left: -1520, top: 139 + 500 - 48, right: -1320, bottom: 639 });
        assert_eq!(float_rect(WORK2, at, Anchor::Center, 200.0, 48.0, 1.0).left, -1620);
        assert_eq!(float_rect(WORK2, at, Anchor::Right, 200.0, 48.0, 1.0).right, -1520);
    }

    #[test]
    fn floating_window_never_leaves_the_work_area_and_honours_the_scale() {
        let r = float_rect(WORK2, Some((5000.0, -300.0)), Anchor::Left, 200.0, 48.0, 1.5);
        assert_eq!((r.right, r.top, r.right - r.left, r.bottom - r.top), (0, 139, 300, 72));
        let back = float_anchor(WORK2, r, Anchor::Left, 1.5);
        assert_eq!(float_rect(WORK2, Some(back), Anchor::Left, 200.0, 48.0, 1.5), r);
    }

    #[test]
    fn tooltip_stays_on_the_stage_monitor_and_flips_below_near_the_top() {
        let stage = Rect { left: -1500, top: 1171, right: -1300, bottom: 1219 };
        let mon2 = Rect { left: -1920, top: 139, right: 0, bottom: 1219 };
        assert_eq!(tooltip_pos(-1910, stage, mon2, 200, 80, 1.0), (-1916, 1171 - 80 - 6));
        let high = Rect { left: -500, top: 150, right: -300, bottom: 198 };
        assert_eq!(tooltip_pos(-400, high, mon2, 200, 80, 1.0), (-500, 198 + 6));
    }

    #[test]
    fn autohidden_taskbar_is_not_visible() {
        assert!(taskbar_visible(TRAY, SCREEN));
        assert!(!taskbar_visible(Rect { left: 0, top: 1438, right: 2560, bottom: 1486 }, SCREEN));
    }
}
