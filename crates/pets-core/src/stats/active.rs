use super::GAP_MS;

/// Work time from the next event: gap from the previous one if within `GAP_MS` (spec 2.3).
/// Return `(gap end time, ms)`. An event older than the previous one does not move the clock backward.
pub fn active_tick(last: &mut Option<i64>, ts: i64) -> Option<(i64, u64)> {
    let prev = *last;
    if prev.is_some_and(|p| ts < p) { return None; }
    *last = Some(ts);
    let gap = ts - prev?;
    (gap > 0 && gap <= GAP_MS).then_some((ts, gap as u64))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn gaps_up_to_five_minutes_are_work() {
        let mut last = None;
        let got: Vec<_> = [0, 60, 400, 460].iter().map(|s| active_tick(&mut last, s * 1000)).collect();
        assert_eq!(got, [None, Some((60_000, 60_000)), None, Some((460_000, 60_000))]);
    }

    #[test]
    fn an_older_event_does_not_rewind_the_clock() {
        let mut last = None;
        active_tick(&mut last, 100_000);
        assert_eq!(active_tick(&mut last, 90_000), None);
        assert_eq!(last, Some(100_000));
        assert_eq!(active_tick(&mut last, 110_000), Some((110_000, 10_000)));
    }
}
