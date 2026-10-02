//! Pure geometry for the stage in the taskbar (without Win32), in physical screen pixels.

#[derive(Clone, Copy, Debug, PartialEq, Eq, Default)]
pub struct Rect { pub left: i32, pub top: i32, pub right: i32, pub bottom: i32 }

impl Rect {
    pub fn height(&self) -> i32 { self.bottom - self.top }
    pub fn width(&self) -> i32 { self.right - self.left }
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Metrics {
    pub tray: Rect,
    /// Left edge of the tray (`TrayNotifyWnd`) or secondary-taskbar clock.
    pub notify_left: Option<i32>,
    /// Right edge of the last taskbar item (Start, search, app icons) from UI Automation.
    pub icons_right: Option<i32>,
    /// Left edge of the first icon-group item (`StartButton`) from UI Automation.
    pub first_left: Option<i32>,
    /// Right edge of items before Start (Widgets button), if any.
    pub widgets_right: Option<i32>,
    pub scale: f64,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Placement {
    /// Position in taskbar client coordinates (the window is its child).
    pub x: i32,
    pub w: i32,
    pub h: i32,
    /// Free space in CSS pixels; the UI fits as many pets as possible.
    pub max_css: f64,
    pub height_css: f64,
    /// "Left" mode without a left zone (icons extend left): stage sits near the tray.
    pub left_fallback: bool,
}

pub const GAP_CSS: f64 = 8.0;
/// If UI Automation cannot find where icons end (no UIA, new Windows taskbar layout),
/// keep the stage small near the tray (up to 2 pets) to avoid covering icons.
pub const FALLBACK_MAX_CSS: f64 = 200.0;
/// Narrowest zone that fits one pet (stage slots at u = 0.3 and margins).
pub const MIN_ZONE_CSS: f64 = 70.0;

/// Icon-free taskbar segment in screen pixels, with `GAP_CSS` spacing included.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Zone { pub left: i32, pub right: i32 }

impl Zone {
    pub fn width(&self) -> i32 { (self.right - self.left).max(0) }
    fn distance(&self, x: i32) -> i32 { if x < self.left { self.left - x } else if x > self.right { x - self.right } else { 0 } }
}

/// Which side of the window holds the anchor, hence which way the window grows.
#[derive(Clone, Copy, Debug, PartialEq)]
pub enum Anchor { Left, Center, Right }

pub use pets_core::settings::Dock;

/// `Custom.dock`: edge of a free zone the stage is glued to; it wins over the `at` fraction, which only
/// remains as the fallback while that zone does not exist (e.g. icons temporarily fill the left side).
#[derive(Clone, Copy, Debug, PartialEq)]
pub enum Mode { Right, Left, Custom { at: f64, anchor: Anchor, dock: Option<Dock> } }

impl Mode {
    pub fn anchor(self) -> Anchor {
        match self { Mode::Left => Anchor::Left, Mode::Right => Anchor::Right, Mode::Custom { anchor, .. } => anchor }
    }
}

/// Zones: left (from taskbar edge or after Widgets to the first icon-group item), if it fits a pet,
/// and right (from the last icon to the tray).
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

/// Window in a zone at anchor `a`: content width clipped to the zone, window moved inside it.
fn in_zone(m: &Metrics, z: Zone, a: i32, anchor: Anchor, want_css: f64, left_fallback: bool) -> Placement {
    let w = ((want_css.max(0.0) * m.scale).round() as i32).min(z.width());
    let x = match anchor { Anchor::Left => a, Anchor::Center => a - w / 2, Anchor::Right => a - w };
    let x = x.clamp(z.left, (z.right - w).max(z.left));
    Placement {
        x: x - m.tray.left, w, h: m.tray.height(),
        max_css: z.width() as f64 / m.scale, height_css: m.tray.height() as f64 / m.scale, left_fallback,
    }
}

/// Zone containing the point or nearest to it (right wins ties, as with the default position).
fn nearest(m: &Metrics, x: i32) -> Zone {
    match zones(m) {
        (Some(l), r) if l.distance(x) < r.distance(x) => l,
        (_, r) => r,
    }
}

/// Zone, anchor point and growth side of a horizontal dock; `None` for a vertical-bar dock or a missing left zone.
fn dock_target(lz: Option<Zone>, rz: Zone, d: Dock) -> Option<(Zone, i32, Anchor)> {
    match d {
        Dock::LeftStart => lz.map(|z| (z, z.left, Anchor::Left)),
        Dock::LeftEnd => lz.map(|z| (z, z.right, Anchor::Right)),
        Dock::RightStart => Some((rz, rz.left, Anchor::Left)),
        Dock::RightEnd => Some((rz, rz.right, Anchor::Right)),
        Dock::Top | Dock::Bottom => None,
    }
}

/// How close (CSS pixels) a dropped stage must be to a zone edge to be glued to it.
pub const SNAP_CSS: f64 = 12.0;

/// Edge to glue a stage dropped at `at` to, if it ended up flush with (or pushed against) a zone edge.
pub fn snap_dock(m: &Metrics, want_css: f64, at: f64, anchor: Anchor) -> Option<Dock> {
    let p = place_mode(m, want_css, Mode::Custom { at, anchor, dock: None })?;
    if p.w <= 0 { return None; }
    let (left, right) = (m.tray.left + p.x, m.tray.left + p.x + p.w);
    let centre = (left + right) / 2;
    let (lz, rz) = zones(m);
    let (z, is_left) = match lz { Some(l) if l.distance(centre) < rz.distance(centre) => (l, true), _ => (rz, false) };
    let thr = (SNAP_CSS * m.scale).round() as i32;
    let (to_start, to_end) = (left - z.left <= thr, z.right - right <= thr);
    if !to_start && !to_end { return None; }
    let start = if to_start && to_end { anchor != Anchor::Right } else { to_start };
    Some(match (is_left, start) {
        (true, true) => Dock::LeftStart, (true, false) => Dock::LeftEnd,
        (false, true) => Dock::RightStart, (false, false) => Dock::RightEnd,
    })
}

/// Stage in the selected mode. Always in a free zone, never over app icons.
/// `None` when a measurement is temporarily unreliable (taskbar height is 0 during a scale change).
pub fn place_mode(m: &Metrics, want_css: f64, mode: Mode) -> Option<Placement> {
    if m.tray.height() <= 0 || m.scale <= 0.0 { return None; }
    let (lz, rz) = zones(m);
    Some(match mode {
        Mode::Right => in_zone(m, rz, rz.right, Anchor::Right, want_css, false),
        Mode::Left => match lz {
            Some(z) => in_zone(m, z, z.left, Anchor::Left, want_css, false),
            None => in_zone(m, rz, rz.right, Anchor::Right, want_css, true),
        },
        Mode::Custom { dock: Some(d), .. } if dock_target(lz, rz, d).is_some() => {
            let (z, a, anchor) = dock_target(lz, rz, d).unwrap_or((rz, rz.right, Anchor::Right));
            in_zone(m, z, a, anchor, want_css, false)
        }
        Mode::Custom { at, anchor, .. } => {
            let a = m.tray.left + (at.clamp(0.0, 1.0) * (m.tray.right - m.tray.left) as f64).round() as i32;
            let z = nearest(m, a);
            in_zone(m, z, a.clamp(z.left, z.right), anchor, want_css, false)
        }
    })
}

/// Stage near the tray ("right" mode, 0.6 behavior); 0.6 tests check the same values through it.
#[cfg(test)]
pub fn place(m: &Metrics, want_css: f64) -> Option<Placement> { place_mode(m, want_css, Mode::Right) }

/// Dragged-stage anchor (screen pixels) → fraction of taskbar width, snapped to the nearest zone.
pub fn custom_at(m: &Metrics, anchor_x: i32) -> f64 {
    let z = nearest(m, anchor_x);
    let width = (m.tray.right - m.tray.left).max(1) as f64;
    (anchor_x.clamp(z.left, z.right) - m.tray.left) as f64 / width
}

/// Monitor for the "Taskbar" tab: `id` is the device name (`szDevice`), `index` starts at 1 in Windows order.
#[derive(serde::Serialize, Clone, Debug, PartialEq)]
pub struct MonitorInfo { pub id: String, pub primary: bool, pub width: i32, pub height: i32, pub index: u32, pub has_bar: bool }

/// Which monitor: selected if connected and (in taskbar mode) it has a taskbar; otherwise primary (setting stays unchanged).
/// A floating window needs only the work area, not a taskbar.
pub fn pick(monitors: &[(MonitorInfo, bool)], want: &str, floating: bool) -> usize {
    let primary = monitors.iter().position(|(m, _)| m.primary).unwrap_or(0);
    if want == pets_core::settings::PRIMARY { return primary; }
    monitors.iter().position(|(m, bar)| (*bar || floating) && m.id == want).unwrap_or(primary)
}

/// Gap between the floating window and taskbar at the default position (CSS pixels).
pub const FLOAT_MARGIN_CSS: f64 = 16.0;

/// Floating window in screen pixels. `at`: anchor (CSS pixels from work area's top left) on the window's bottom
/// edge, on the `anchor` side; absent: centered above the taskbar. Result always stays in the work area.
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

/// Inverse of `float_rect`: window anchor to save in settings.
pub fn float_anchor(work: Rect, r: Rect, anchor: Anchor, scale: f64) -> (f64, f64) {
    let x = match anchor { Anchor::Left => r.left, Anchor::Center => (r.left + r.right) / 2, Anchor::Right => r.right };
    ((x - work.left) as f64 / scale, (r.bottom - work.top) as f64 / scale)
}

/// Tooltip above the stage (or below when there is no room above), within the stage monitor.
pub fn tooltip_pos(anchor_x: i32, stage: Rect, monitor: Rect, pw: i32, ph: i32, scale: f64) -> (i32, i32) {
    let (m4, gap) = ((4.0 * scale).round() as i32, (6.0 * scale).round() as i32);
    let x = (anchor_x - pw / 2).clamp(monitor.left + m4, (monitor.right - pw - m4).max(monitor.left + m4));
    let above = stage.top - ph - gap;
    (x, if above >= monitor.top { above } else { stage.bottom + gap })
}

/// Screen edge a taskbar is docked to.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Side { Left, Right, Top, Bottom }

impl Side { pub fn vertical(self) -> bool { matches!(self, Side::Left | Side::Right) } }

/// Edge of its monitor that the taskbar sits on, judged from its shape and position (an auto-hidden bar
/// keeps its shape and mostly stays on its side of the monitor's centre).
pub fn bar_side(bar: Rect, monitor: Rect) -> Side {
    if bar.width() < bar.height() {
        if bar.left + bar.right < monitor.left + monitor.right { Side::Left } else { Side::Right }
    } else if bar.top + bar.bottom < monitor.top + monitor.bottom { Side::Top } else { Side::Bottom }
}

/// Stage next to a taskbar docked at the left or right edge: the embedded layout assumes a horizontal bar,
/// so the stage floats in the work area's bottom corner beside it.
/// `top`: the upper corner instead of the lower one.
pub fn beside_vertical_bar(work: Rect, side: Side, top: bool, w_css: f64, h_css: f64, scale: f64) -> Rect {
    let (w, h, m) = ((w_css * scale).round() as i32, (h_css * scale).round() as i32, (GAP_CSS * scale).round() as i32);
    let x = if side == Side::Right { work.right - w - m } else { work.left + m };
    let x = x.clamp(work.left, (work.right - w).max(work.left));
    let y = (if top { work.top + m } else { work.bottom - m - h }).clamp(work.top, (work.bottom - h).max(work.top));
    Rect { left: x, top: y, right: x + w, bottom: y + h }
}

/// Corner of the work area a stage dropped at `r` beside a vertical bar is glued to, if it is close to one.
pub fn snap_corner(work: Rect, r: Rect, scale: f64) -> Option<Dock> {
    let thr = ((GAP_CSS + SNAP_CSS) * scale).round() as i32;
    let (up, down) = (r.top - work.top, work.bottom - r.bottom);
    if down <= thr && down <= up { Some(Dock::Bottom) } else if up <= thr { Some(Dock::Top) } else { None }
}

/// Auto-hidden taskbar moves beyond the screen edge, leaving about 2 px.
pub fn taskbar_visible(tray: Rect, screen: Rect) -> bool {
    if tray.width() < tray.height() { tray.right.min(screen.right) - tray.left.max(screen.left) > 4 }
    else { tray.bottom.min(screen.bottom) - tray.top.max(screen.top) > 4 }
}

#[cfg(test)]
mod tests {
    use super::*;

    const TRAY: Rect = Rect { left: 0, top: 1392, right: 2560, bottom: 1440 };
    const SCREEN: Rect = Rect { left: 0, top: 0, right: 2560, bottom: 1440 };
    fn m(icons: Option<i32>, scale: f64) -> Metrics {
        Metrics { tray: TRAY, notify_left: Some(2291), icons_right: icons, first_left: None, widgets_right: None, scale }
    }
    /// Centered icons as on the development machine (spike S2): Start at 882, last icon ends at 1657.
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
        // anchor at 1200 px lies among icons (882–1657): closer to left zone (ends 874) than right (starts 1665)
        let p = place_mode(&centered(), 200.0, Mode::Custom { at: 1200.0 / 2560.0, anchor: Anchor::Right, dock: None }).unwrap();
        assert_eq!((p.x, p.w), (874 - 200, 200));
        let q = place_mode(&centered(), 200.0, Mode::Custom { at: 1600.0 / 2560.0, anchor: Anchor::Left, dock: None }).unwrap();
        assert_eq!((q.x, q.w), (1665, 200));
    }

    #[test]
    fn custom_window_is_pushed_back_when_icons_grow_and_never_covers_them() {
        let at = 1700.0 / 2560.0;
        let before = place_mode(&centered(), 300.0, Mode::Custom { at, anchor: Anchor::Left, dock: None }).unwrap();
        assert_eq!(before.x, 1700);
        // more icons: the last one now ends at 1900
        let grown = Metrics { icons_right: Some(1900), ..centered() };
        let after = place_mode(&grown, 300.0, Mode::Custom { at, anchor: Anchor::Left, dock: None }).unwrap();
        assert!(after.x >= 1908, "{after:?}");
        assert!(after.x + after.w <= 2283);
        // zone narrower than content: clip window to the zone
        let tight = Metrics { icons_right: Some(2100), ..centered() };
        let t = place_mode(&tight, 300.0, Mode::Custom { at, anchor: Anchor::Left, dock: None }).unwrap();
        assert_eq!((t.x, t.w), (2108, 2283 - 2108));
    }

    #[test]
    fn custom_anchor_round_trips_and_keeps_its_zone_on_another_resolution() {
        for (anchor, x) in [(Anchor::Left, 300), (Anchor::Center, 500), (Anchor::Right, 2000)] {
            let at = custom_at(&centered(), x);
            let p = place_mode(&centered(), 120.0, Mode::Custom { at, anchor, dock: None }).unwrap();
            let got = match anchor { Anchor::Left => p.x, Anchor::Center => p.x + p.w / 2, Anchor::Right => p.x + p.w };
            assert!((got - x).abs() <= 1, "{anchor:?}: {got} vs {x}");
        }
        assert_eq!(custom_at(&centered(), 1200), 874.0 / 2560.0, "an anchor in the icons is stored snapped");
        // same fraction on a 1920 px taskbar (icons 662–1242) stays in the left zone
        let small = Metrics { tray: Rect { left: 0, top: 1032, right: 1920, bottom: 1080 }, notify_left: Some(1700),
            icons_right: Some(1242), first_left: Some(662), widgets_right: None, scale: 1.0 };
        let p = place_mode(&small, 120.0, Mode::Custom { at: 300.0 / 2560.0, anchor: Anchor::Left, dock: None }).unwrap();
        assert!(p.x + p.w <= 654, "{p:?}");
    }

    fn custom(dock: Dock, want: f64, m: &Metrics) -> Placement {
        place_mode(m, want, Mode::Custom { at: 0.5, anchor: Anchor::Left, dock: Some(dock) }).unwrap()
    }

    #[test]
    fn a_docked_stage_follows_its_zone_edge_when_the_icons_move() {
        // next to the icons on the left: the zone ends where the icon group starts (882 -> 874 with the gap)
        assert_eq!(custom(Dock::LeftEnd, 200.0, &centered()).x, 874 - 200);
        // a window opens and the whole group shifts left by 60 px, then the app closes again
        let shifted = Metrics { first_left: Some(822), icons_right: Some(1597), ..centered() };
        assert_eq!(custom(Dock::LeftEnd, 200.0, &shifted).x, 814 - 200);
        assert_eq!(custom(Dock::LeftEnd, 200.0, &centered()).x, 874 - 200, "and it comes back by itself");
        // next to the icons on the right: starts where they end
        assert_eq!(custom(Dock::RightStart, 200.0, &centered()).x, 1665);
        assert_eq!(custom(Dock::RightStart, 200.0, &Metrics { icons_right: Some(1717), ..centered() }).x, 1725);
        assert_eq!(custom(Dock::RightEnd, 200.0, &centered()).x, 2283 - 200);
        assert_eq!(custom(Dock::LeftStart, 200.0, &centered()).x, 8);
    }

    #[test]
    fn a_left_dock_without_a_left_zone_falls_back_to_the_saved_fraction() {
        let left_aligned = Metrics { first_left: Some(12), ..m(Some(700), 1.0) };
        let free = |m: &Metrics| place_mode(m, 200.0, Mode::Custom { at: 0.5, anchor: Anchor::Left, dock: None }).unwrap();
        assert_eq!(custom(Dock::LeftEnd, 200.0, &left_aligned), free(&left_aligned));
        assert_eq!(custom(Dock::Top, 200.0, &centered()), free(&centered()), "a vertical-bar dock means nothing here");
    }

    #[test]
    fn dropping_next_to_an_edge_glues_the_stage_to_it() {
        let m = centered();
        // dropped with its right side near the icon group (878 is within 12 px of 874)
        assert_eq!(snap_dock(&m, 200.0, custom_at(&m, 878), Anchor::Right), Some(Dock::LeftEnd));
        // dragged far into the icons: pushed against them, still glued
        assert_eq!(snap_dock(&m, 200.0, 1200.0 / 2560.0, Anchor::Right), Some(Dock::LeftEnd));
        assert_eq!(snap_dock(&m, 200.0, 1670.0 / 2560.0, Anchor::Left), Some(Dock::RightStart));
        assert_eq!(snap_dock(&m, 200.0, 2290.0 / 2560.0, Anchor::Right), Some(Dock::RightEnd));
        assert_eq!(snap_dock(&m, 200.0, 0.0, Anchor::Left), Some(Dock::LeftStart));
        // in the middle of a zone: nothing to glue to
        assert_eq!(snap_dock(&m, 100.0, 400.0 / 2560.0, Anchor::Left), None);
        assert_eq!(snap_dock(&m, 100.0, 1900.0 / 2560.0, Anchor::Left), None);
    }

    #[test]
    fn a_stage_filling_a_narrow_zone_picks_the_edge_of_its_anchor() {
        let m = Metrics { first_left: Some(300), icons_right: Some(1657), ..centered() };
        // the left zone 8..292 is narrower than the content: both edges touch
        assert_eq!(snap_dock(&m, 400.0, 100.0 / 2560.0, Anchor::Left), Some(Dock::LeftStart));
        assert_eq!(snap_dock(&m, 400.0, 100.0 / 2560.0, Anchor::Right), Some(Dock::LeftEnd));
    }

    #[test]
    fn beside_a_vertical_bar_the_stage_can_sit_in_either_corner() {
        let work = Rect { left: 62, top: 0, right: 2560, bottom: 1440 };
        let up = beside_vertical_bar(work, Side::Left, true, 200.0, 48.0, 1.0);
        assert_eq!(up, Rect { left: 70, top: 8, right: 270, bottom: 56 });
        assert_eq!(snap_corner(work, up, 1.0), Some(Dock::Top));
        let down = beside_vertical_bar(work, Side::Left, false, 200.0, 48.0, 1.0);
        assert_eq!(snap_corner(work, down, 1.0), Some(Dock::Bottom));
        assert_eq!(snap_corner(work, Rect { left: 70, top: 600, right: 270, bottom: 648 }, 1.0), None);
        assert_eq!(snap_corner(work, Rect { left: 70, top: 14, right: 270, bottom: 62 }, 1.0), Some(Dock::Top));
    }

    #[test]
    fn sits_left_of_the_tray_with_a_gap() {
        // numbers measured on the development machine via UI Automation (last icon ends at 1657)
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
        (MonitorInfo { id: id.into(), primary, width: 1920, height: 1080, index: 0, has_bar }, has_bar)
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

    // secondary monitor work area from spike S1: left of primary, vertically offset
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
        // top bar slid up, vertical bars slid left or right
        assert!(taskbar_visible(Rect { left: 0, top: 0, right: 2560, bottom: 48 }, SCREEN));
        assert!(!taskbar_visible(Rect { left: 0, top: -46, right: 2560, bottom: 2 }, SCREEN));
        assert!(taskbar_visible(Rect { left: 0, top: 0, right: 62, bottom: 1440 }, SCREEN));
        assert!(!taskbar_visible(Rect { left: -60, top: 0, right: 2, bottom: 1440 }, SCREEN));
        assert!(!taskbar_visible(Rect { left: 2558, top: 0, right: 2620, bottom: 1440 }, SCREEN));
    }

    #[test]
    fn taskbar_side_follows_its_shape_and_place_on_the_monitor() {
        assert_eq!(bar_side(TRAY, SCREEN), Side::Bottom);
        assert_eq!(bar_side(Rect { left: 0, top: 0, right: 2560, bottom: 48 }, SCREEN), Side::Top);
        assert_eq!(bar_side(Rect { left: 0, top: 0, right: 62, bottom: 1440 }, SCREEN), Side::Left);
        assert_eq!(bar_side(Rect { left: 2498, top: 0, right: 2560, bottom: 1440 }, SCREEN), Side::Right);
        let second = Rect { left: -1920, top: 139, right: 0, bottom: 1219 };
        assert_eq!(bar_side(Rect { left: -62, top: 139, right: 0, bottom: 1219 }, second), Side::Right, "secondary monitor left of the primary");
        assert!(Side::Left.vertical() && Side::Right.vertical() && !Side::Top.vertical() && !Side::Bottom.vertical());
    }

    #[test]
    fn the_stage_sits_beside_a_vertical_bar_in_the_work_area_corner() {
        let work = Rect { left: 62, top: 0, right: 2560, bottom: 1440 };
        let l = beside_vertical_bar(work, Side::Left, false, 200.0, 48.0, 1.0);
        assert_eq!(l, Rect { left: 70, top: 1440 - 8 - 48, right: 270, bottom: 1432 });
        let right_work = Rect { left: 0, top: 0, right: 2498, bottom: 1440 };
        let r = beside_vertical_bar(right_work, Side::Right, false, 200.0, 48.0, 1.5);
        assert_eq!((r.right, r.bottom, r.right - r.left, r.bottom - r.top), (2498 - 12, 1440 - 12, 300, 72));
        let wide = beside_vertical_bar(work, Side::Left, false, 5000.0, 48.0, 1.0);
        assert!(wide.left >= work.left && wide.right <= work.right + 5000, "never starts left of the work area");
        assert_eq!(wide.left, work.left);
    }
}
