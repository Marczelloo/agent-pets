//! Muting Windows toasts for a while: tray menu, settings window and panel all go through these pure helpers.
use crate::settings::Notifications;

const HOUR_MS: i64 = 3_600_000;
const MORNING_MS: i64 = 8 * HOUR_MS;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum MuteChoice { Off, Hour, Morning, Forever }

impl MuteChoice {
    /// Value sent by the settings window and the panel.
    pub fn parse(s: &str) -> Option<MuteChoice> {
        match s { "off" => Some(MuteChoice::Off), "hour" => Some(MuteChoice::Hour), "morning" => Some(MuteChoice::Morning), "forever" => Some(MuteChoice::Forever), _ => None }
    }
}

/// `muted_until` for a choice made at `now` (ms); `None` unmutes. `local_midnight` is `time::local_midnight` in production.
pub fn mute_until(choice: MuteChoice, now: i64, local_midnight: impl Fn(i64) -> i64) -> Option<i64> {
    match choice {
        MuteChoice::Off => None,
        MuteChoice::Hour => Some(now + HOUR_MS),
        MuteChoice::Forever => Some(i64::MAX),
        MuteChoice::Morning => {
            let today = local_midnight(now) + MORNING_MS;
            // 30 h after today's midnight is inside tomorrow even on a 23 or 25 hour day
            Some(if now < today { today } else { local_midnight(local_midnight(now) + 30 * HOUR_MS) + MORNING_MS })
        }
    }
}

pub fn muted(n: &Notifications, now: i64) -> bool { n.muted_until.is_some_and(|u| now < u) }

/// Local `HH:MM` of `ts`, from the local midnight of its day.
pub fn clock(ts: i64, local_midnight: impl Fn(i64) -> i64) -> String {
    let m = (ts - local_midnight(ts)).rem_euclid(86_400_000) / 60_000;
    format!("{:02}:{:02}", m / 60, m % 60)
}

#[cfg(test)]
mod tests {
    use super::*;

    const DAY: i64 = 86_400_000;
    fn utc_midnight(ts: i64) -> i64 { ts - ts.rem_euclid(DAY) }
    /// 2026-10-05 00:00 UTC plus `h:m`.
    fn at(h: i64, m: i64) -> i64 { 20_730 * DAY + h * HOUR_MS + m * 60_000 }
    fn n(until: Option<i64>) -> Notifications { Notifications { muted_until: until, ..Notifications::default() } }

    #[test]
    fn an_hour_forever_and_off() {
        assert_eq!(mute_until(MuteChoice::Hour, at(14, 40), utc_midnight), Some(at(15, 40)));
        assert_eq!(mute_until(MuteChoice::Forever, at(14, 40), utc_midnight), Some(i64::MAX));
        assert_eq!(mute_until(MuteChoice::Off, at(14, 40), utc_midnight), None);
    }

    #[test]
    fn the_morning_is_the_next_eight_oclock() {
        assert_eq!(mute_until(MuteChoice::Morning, at(3, 0), utc_midnight), Some(at(8, 0)), "before 8:00 means today");
        assert_eq!(mute_until(MuteChoice::Morning, at(7, 59), utc_midnight), Some(at(8, 0)));
        assert_eq!(mute_until(MuteChoice::Morning, at(8, 0), utc_midnight), Some(at(32, 0)), "at 8:00 sharp it is tomorrow");
        assert_eq!(mute_until(MuteChoice::Morning, at(23, 30), utc_midnight), Some(at(32, 0)));
    }

    #[test]
    fn the_morning_follows_the_local_day() {
        // a fake zone two hours ahead of UTC: local midnight is 22:00 UTC the day before
        let plus2 = |ts: i64| utc_midnight(ts + 2 * HOUR_MS) - 2 * HOUR_MS;
        assert_eq!(mute_until(MuteChoice::Morning, at(5, 0), plus2), Some(at(6, 0)), "07:00 local, so 08:00 local is 06:00 UTC");
        assert_eq!(mute_until(MuteChoice::Morning, at(7, 0), plus2), Some(at(30, 0)));
    }

    #[test]
    fn muted_only_before_the_deadline() {
        assert!(!muted(&n(None), at(10, 0)));
        assert!(muted(&n(Some(at(10, 0))), at(10, 0) - 1));
        assert!(!muted(&n(Some(at(10, 0))), at(10, 0)), "expired exactly at the boundary");
        assert!(muted(&n(Some(i64::MAX)), at(10, 0)));
    }

    #[test]
    fn the_choice_comes_from_a_word() {
        assert_eq!(MuteChoice::parse("hour"), Some(MuteChoice::Hour));
        assert_eq!(MuteChoice::parse("morning"), Some(MuteChoice::Morning));
        assert_eq!(MuteChoice::parse("forever"), Some(MuteChoice::Forever));
        assert_eq!(MuteChoice::parse("off"), Some(MuteChoice::Off));
        assert_eq!(MuteChoice::parse("x"), None);
    }

    #[test]
    fn the_clock_is_two_digits() {
        assert_eq!(clock(at(15, 40), utc_midnight), "15:40");
        assert_eq!(clock(at(8, 5), utc_midnight), "08:05");
        assert_eq!(clock(at(0, 0), utc_midnight), "00:00");
    }
}
