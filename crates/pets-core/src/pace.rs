//! When a limit window runs out at the current pace: a rolling hour of readings per window, pure, the clock is passed in.
use crate::model::{Agent, Limit, Window};
use serde::Serialize;
use std::collections::{HashMap, VecDeque};

const MINUTE_MS: i64 = 60_000;
/// Readings older than this no longer say anything about the pace.
const KEEP_MS: i64 = 60 * MINUTE_MS;
/// A slope over less than this is noise (one burst of work looks like a trend).
const MIN_SPAN_MS: i64 = 10 * MINUTE_MS;
const MAX_SAMPLES: usize = 120;
/// The same window's reset time fluctuates between readings; a larger shift is a new window.
const RESET_JITTER_MS: i64 = MINUTE_MS;
/// Usage falling by more than this is a new window (limits without reset times).
const DROP_PCT: f32 = 5.0;

/// A window that will be used up before it resets, if the pace holds.
#[derive(Serialize, Clone, Copy, Debug, PartialEq)]
pub struct Forecast { pub agent: Agent, pub window: Window, pub runs_out_at: i64 }

#[derive(Default)]
struct History { samples: VecDeque<(i64, f32)>, resets_at: Option<i64> }

#[derive(Default)]
pub struct Pace { windows: HashMap<(Agent, Window), History> }

fn fresh(l: &Limit) -> bool { l.stale_since.is_none() && l.used_pct.is_finite() }

impl Pace {
    /// Records the readings; a sample is added when the value moved or a minute passed since the last one.
    pub fn observe(&mut self, limits: &[Limit], now: i64) {
        for l in limits.iter().filter(|l| fresh(l)) {
            let h = self.windows.entry((l.agent, l.window)).or_default();
            let new_window = h.samples.back().is_some_and(|&(_, p)| l.used_pct < p - DROP_PCT)
                || matches!((h.resets_at, l.resets_at), (Some(a), Some(b)) if (a - b).abs() > RESET_JITTER_MS);
            if new_window { h.samples.clear(); }
            if l.resets_at.is_some() { h.resets_at = l.resets_at; }
            if h.samples.back().is_none_or(|&(t, p)| p != l.used_pct || now - t >= MINUTE_MS) {
                h.samples.push_back((now, l.used_pct));
            }
            while h.samples.front().is_some_and(|&(t, _)| now - t > KEEP_MS) || h.samples.len() > MAX_SAMPLES { h.samples.pop_front(); }
        }
    }

    /// Windows that run out before they reset, from the rise over the kept hour; an idle hour gives nothing.
    pub fn forecasts(&self, limits: &[Limit], now: i64) -> Vec<Forecast> {
        limits.iter().filter(|l| fresh(l) && l.used_pct < 100.0).filter_map(|l| {
            let h = self.windows.get(&(l.agent, l.window))?;
            let (&(t0, p0), &(t1, p1)) = (h.samples.front()?, h.samples.back()?);
            if t1 - t0 < MIN_SPAN_MS || p1 <= p0 { return None; }
            let rate = (p1 - p0) as f64 / (t1 - t0) as f64;
            let runs_out_at = t1 + ((100.0 - p1 as f64) / rate) as i64;
            (runs_out_at > now && l.resets_at.is_none_or(|r| runs_out_at < r))
                .then_some(Forecast { agent: l.agent, window: l.window, runs_out_at })
        }).collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const T0: i64 = 1_000_000_000;
    const R: i64 = T0 + 5 * 3_600_000;
    fn lim(pct: f32, resets_at: Option<i64>, stale: Option<i64>) -> Limit {
        Limit { agent: Agent::Claude, window: Window::FiveHour, used_pct: pct, resets_at, stale_since: stale }
    }
    fn min(m: i64) -> i64 { T0 + m * MINUTE_MS }
    /// 20% at T0, then +1 point a minute.
    fn climbing(minutes: i64) -> (Pace, Limit) {
        let mut p = Pace::default();
        let mut l = lim(20.0, Some(R), None);
        for m in 0..=minutes { l.used_pct = 20.0 + m as f32; p.observe(&[l], min(m)); }
        (p, l)
    }

    #[test]
    fn a_steady_rise_says_when_it_hits_100() {
        let (p, l) = climbing(30);
        // 50% at minute 30, one point a minute: 100% at minute 80
        let f = p.forecasts(&[l], min(30));
        assert_eq!(f, vec![Forecast { agent: Agent::Claude, window: Window::FiveHour, runs_out_at: min(80) }]);
    }

    #[test]
    fn idle_or_flat_usage_gives_nothing() {
        let mut p = Pace::default();
        let l = lim(40.0, Some(R), None);
        for m in 0..=30 { p.observe(&[l], min(m)); }
        assert!(p.forecasts(&[l], min(30)).is_empty(), "flat");
        // a burst, then an hour of nothing: the burst has left the kept window
        let (mut p, mut l) = climbing(10);
        l.used_pct = 30.0;
        for m in 11..=80 { p.observe(&[l], min(m)); }
        assert!(p.forecasts(&[l], min(80)).is_empty());
    }

    #[test]
    fn less_than_ten_minutes_of_history_is_no_trend() {
        let (p, l) = climbing(9);
        assert!(p.forecasts(&[l], min(9)).is_empty());
        let (p, l) = climbing(10);
        assert_eq!(p.forecasts(&[l], min(10)).len(), 1);
    }

    #[test]
    fn a_new_window_starts_a_new_history() {
        let (mut p, l) = climbing(30);
        // the reset time jumps by hours: whatever rose before says nothing about this window
        let next = lim(l.used_pct + 1.0, Some(R + 5 * 3_600_000), None);
        p.observe(&[next], min(31));
        assert!(p.forecasts(&[next], min(31)).is_empty());
        // a big drop without reset times is a new window too
        let (mut p, _) = climbing(30);
        let dropped = lim(3.0, None, None);
        p.observe(&[dropped], min(31));
        assert!(p.forecasts(&[dropped], min(31)).is_empty());
        p.observe(&[lim(20.0, None, None)], min(45));
        assert_eq!(p.forecasts(&[lim(20.0, None, None)], min(45)).len(), 1, "it starts counting again from the new window");
    }

    #[test]
    fn reset_time_jitter_keeps_the_history() {
        let (mut p, l) = climbing(30);
        let next = lim(l.used_pct + 1.0, Some(R + 20_000), None);
        p.observe(&[next], min(31));
        assert_eq!(p.forecasts(&[next], min(31)).len(), 1);
    }

    #[test]
    fn running_out_after_the_reset_is_not_a_forecast() {
        let (p, l) = climbing(30);
        let early_reset = lim(l.used_pct, Some(min(70)), None);
        assert!(p.forecasts(&[early_reset], min(30)).is_empty());
        let no_reset_known = lim(l.used_pct, None, None);
        assert_eq!(p.forecasts(&[no_reset_known], min(30)).len(), 1);
    }

    #[test]
    fn stale_readings_are_ignored() {
        let mut p = Pace::default();
        let stale = lim(50.0, Some(R), Some(T0));
        for m in 0..=30 { p.observe(&[Limit { used_pct: 20.0 + m as f32, ..stale }], min(m)); }
        assert!(p.forecasts(&[stale], min(30)).is_empty());
        let (p, l) = climbing(30);
        assert!(p.forecasts(&[Limit { stale_since: Some(min(1)), ..l }], min(30)).is_empty(), "a stale reading gets no forecast even with history");
    }

    #[test]
    fn a_full_window_and_a_past_forecast_say_nothing() {
        let (p, l) = climbing(30);
        assert!(p.forecasts(&[l], min(81)).is_empty(), "the moment has passed");
        assert!(p.forecasts(&[lim(100.0, Some(R), None)], min(30)).is_empty());
    }

    #[test]
    fn samples_are_bounded() {
        let mut p = Pace::default();
        for i in 0..500 { p.observe(&[lim(10.0 + i as f32 * 0.01, Some(R), None)], T0 + i * 1_000); }
        let h = &p.windows[&(Agent::Claude, Window::FiveHour)];
        assert!(h.samples.len() <= MAX_SAMPLES);
    }

    #[test]
    fn windows_are_tracked_per_agent() {
        let mut p = Pace::default();
        let codex = |pct: f32| Limit { agent: Agent::Codex, ..lim(pct, Some(R), None) };
        for m in 0..=30 { p.observe(&[lim(20.0 + m as f32, Some(R), None), codex(40.0)], min(m)); }
        let f = p.forecasts(&[lim(50.0, Some(R), None), codex(40.0)], min(30));
        assert_eq!(f.iter().map(|f| f.agent).collect::<Vec<_>>(), [Agent::Claude]);
    }
}
