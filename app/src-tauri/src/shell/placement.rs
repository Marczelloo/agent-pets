//! Czysta geometria sceny w pasku zadań (bez Win32), w pikselach fizycznych ekranu.

#[derive(Clone, Copy, Debug, PartialEq, Eq, Default)]
pub struct Rect { pub left: i32, pub top: i32, pub right: i32, pub bottom: i32 }

impl Rect {
    pub fn height(&self) -> i32 { self.bottom - self.top }
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Metrics {
    pub tray: Rect,
    /// lewa krawędź zasobnika (`TrayNotifyWnd`)
    pub notify_left: Option<i32>,
    /// prawa krawędź ostatniego elementu paska (Start, wyszukiwanie, ikony aplikacji) z UI Automation
    pub icons_right: Option<i32>,
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
}

pub const GAP_CSS: f64 = 8.0;
/// Gdy UI Automation nie powie, gdzie kończą się ikony (brak UIA, zmiana paska w nowym Windows),
/// scena zostaje mała przy zasobniku (do 2 zwierzaków), zamiast ryzykować zasłonięcie ikon.
pub const FALLBACK_MAX_CSS: f64 = 200.0;

/// Scena stoi przy zasobniku i ma szerokość treści (`want_css`), ale nigdy nie wchodzi na ikony aplikacji.
/// `None`, gdy pomiar jest chwilowo niewiarygodny (w trakcie zmiany skali pasek ma wysokość 0).
pub fn place(m: &Metrics, want_css: f64) -> Option<Placement> {
    if m.tray.height() <= 0 || m.scale <= 0.0 { return None; }
    let gap = (GAP_CSS * m.scale).round() as i32;
    let right = m.notify_left.filter(|l| *l > m.tray.left && *l <= m.tray.right).unwrap_or(m.tray.right) - gap;
    let left = m.icons_right.filter(|r| *r >= m.tray.left).map(|r| r + gap)
        .unwrap_or_else(|| (right - (FALLBACK_MAX_CSS * m.scale).round() as i32).max(m.tray.left));
    let free = (right - left).max(0);
    let w = ((want_css.max(0.0) * m.scale).round() as i32).min(free);
    Some(Placement {
        x: right - w - m.tray.left,
        w,
        h: m.tray.height(),
        max_css: free as f64 / m.scale,
        height_css: m.tray.height() as f64 / m.scale,
    })
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
    fn m(icons: Option<i32>, scale: f64) -> Metrics { Metrics { tray: TRAY, notify_left: Some(2291), icons_right: icons, scale } }

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

    #[test]
    fn autohidden_taskbar_is_not_visible() {
        assert!(taskbar_visible(TRAY, SCREEN));
        assert!(!taskbar_visible(Rect { left: 0, top: 1438, right: 2560, bottom: 1486 }, SCREEN));
    }
}
