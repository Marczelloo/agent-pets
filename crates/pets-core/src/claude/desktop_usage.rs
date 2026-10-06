//! Claude account limits from the desktop app. Every 5–15 min the app fetches plan usage and appends a sample to
//! `plan-usage-history.json`: `{"version":2,"samples":[{"t":<ms>,"org":"<uuid>","u":{"fh":<5h %>,"sd":<weekly %>}}]}`.
//! The file has percentages only, without reset times. Read it locally, without network or login data.
use crate::model::*;
use std::path::{Path, PathBuf};
use std::time::SystemTime;

pub const FILE: &str = "plan-usage-history.json";
/// A sample older than this is no longer live (the app stopped polling): it is shown as "as of", not as current.
pub const MAX_AGE_MS: i64 = 30 * 60 * 1000;
/// Past its window a reading says nothing any more (the 5 h / weekly window has certainly reset).
const FIVE_HOUR_MS: i64 = 5 * 3_600_000;
const WEEK_MS: i64 = 7 * 24 * 3_600_000;
pub const POLL_MS: i64 = 60_000;
pub const SESSION_ID: &str = "claude-desktop-usage";

/// MSIX installation (`%LOCALAPPDATA%\Packages\Claude_*\LocalCache\Roaming\Claude`) and standard (`%APPDATA%\Claude`).
pub fn candidate_files(local_appdata: &Path, appdata: &Path) -> Vec<PathBuf> {
    let mut out: Vec<PathBuf> = std::fs::read_dir(local_appdata.join("Packages")).into_iter().flatten().flatten()
        .filter(|e| e.file_name().to_string_lossy().starts_with("Claude_"))
        .map(|e| e.path().join("LocalCache").join("Roaming").join("Claude").join(FILE))
        .collect();
    out.sort();
    out.push(appdata.join("Claude").join(FILE));
    out
}

/// Newest history entry.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Sample { pub t: i64, pub five_hour: Option<f32>, pub weekly: Option<f32> }

/// `None` for unknown format or empty history.
pub fn newest(bytes: &[u8]) -> Option<Sample> {
    let v: serde_json::Value = serde_json::from_slice(bytes).ok()?;
    if v.get("version")?.as_i64()? != 2 { return None; }
    let (t, u) = v.get("samples")?.as_array()?.iter()
        .filter_map(|s| Some((s.get("t")?.as_i64()?, s.get("u")?)))
        .max_by_key(|(t, _)| *t)?;
    let pct = |k: &str| u.get(k).and_then(|x| x.as_f64()).map(|x| x as f32);
    Some(Sample { t, five_hour: pct("fh"), weekly: pct("sd") })
}

impl Sample {
    /// Limits event for `now`. A sample older than `MAX_AGE_MS` is flagged `stale_since`; a window that has
    /// run out since the reading is left out (unknown, never a stale number). `None` when nothing is left.
    pub fn event(&self, now: i64) -> Option<Event> {
        let age = now - self.t;
        let stale_since = (age > MAX_AGE_MS).then_some(self.t);
        let limits: Vec<Limit> = [(Window::FiveHour, self.five_hour, FIVE_HOUR_MS), (Window::Weekly, self.weekly, WEEK_MS)].into_iter()
            .filter(|(_, _, span)| age <= *span)
            .filter_map(|(window, pct, _)| Some(Limit { agent: Agent::Claude, window, used_pct: pct?, resets_at: None, stale_since }))
            .collect();
        if limits.is_empty() { return None; }
        let mut e = Event::new(Source::Claude, SESSION_ID, Kind::Limits, self.t);
        e.data.limits = limits;
        Some(e)
    }
}

/// Latest sample as a limits event (see `Sample::event`).
pub fn latest(bytes: &[u8], now: i64) -> Option<Event> { newest(bytes)?.event(now) }

#[allow(clippy::large_enum_variant)] // short-lived values passed by move; boxing would only add noise
#[derive(Debug)]
pub enum Usage {
    /// New sample, or the same one after it grew stale or lost a window (`Limit::stale_since`).
    Limits(Event),
    /// Nothing usable left: remove the limits reported earlier.
    Stale,
}

pub struct Poller {
    files: Vec<PathBuf>,
    next_check: i64,
    seen: Option<(PathBuf, SystemTime)>,
    last: Option<Sample>,
    /// What was last reported for `last`: (stale, has 5 h, has weekly). A change means another report.
    reported: Option<(bool, bool, bool)>,
}

impl Poller {
    pub fn new(files: Vec<PathBuf>) -> Poller { Poller { files, next_check: i64::MIN, seen: None, last: None, reported: None } }

    /// Check files every `POLL_MS`; read only the one with the latest mtime and only if it changed.
    pub fn poll(&mut self, now: i64) -> Option<Usage> {
        if now < self.next_check { return None; }
        self.next_check = now + POLL_MS;
        let newest_file = self.files.iter()
            .filter_map(|f| Some((f.clone(), std::fs::metadata(f).ok()?.modified().ok()?)))
            .max_by_key(|(_, m)| *m);
        let mut fresh_read = false;
        if let Some(n) = newest_file.filter(|n| self.seen.as_ref() != Some(n)) {
            self.last = std::fs::read(&n.0).ok().and_then(|b| newest(&b));
            self.seen = Some(n);
            fresh_read = self.last.is_some();
        }
        match self.last.and_then(|s| s.event(now)) {
            Some(e) => {
                let shape = (e.data.limits.iter().any(|l| l.stale_since.is_some()),
                    e.data.limits.iter().any(|l| l.window == Window::FiveHour), e.data.limits.iter().any(|l| l.window == Window::Weekly));
                if !fresh_read && self.reported == Some(shape) { return None; }
                self.reported = Some(shape);
                Some(Usage::Limits(e))
            }
            None => self.reported.take().map(|_| Usage::Stale),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    const NOW: i64 = 1_790_281_094_534;

    fn history(samples: serde_json::Value) -> Vec<u8> {
        serde_json::to_vec(&json!({ "version": 2, "samples": samples })).unwrap()
    }

    fn pct(e: &Event, w: Window) -> Option<f32> {
        e.data.limits.iter().find(|l| l.window == w).map(|l| l.used_pct)
    }

    #[test]
    fn newest_sample_becomes_claude_limits_without_reset() {
        let b = history(json!([
            { "t": NOW - 900_000, "org": "o", "u": { "fh": 58, "sd": 75 } },
            { "t": NOW - 60_000, "org": "o", "u": { "fh": 69, "sd": 77 } }]));
        let e = latest(&b, NOW).unwrap();
        assert_eq!((e.kind, e.source, e.ts, e.session_id.as_str()), (Kind::Limits, Source::Claude, NOW - 60_000, SESSION_ID));
        assert_eq!((pct(&e, Window::FiveHour), pct(&e, Window::Weekly)), (Some(69.0), Some(77.0)));
        assert!(e.data.limits.iter().all(|l| l.agent == Agent::Claude && l.resets_at.is_none()));
    }

    #[test]
    fn an_old_sample_is_kept_but_marked_with_its_age() {
        let t = NOW - MAX_AGE_MS - 1;
        let e = latest(&history(json!([{ "t": t, "org": "o", "u": { "fh": 10, "sd": 20 } }])), NOW).unwrap();
        assert_eq!((pct(&e, Window::FiveHour), pct(&e, Window::Weekly)), (Some(10.0), Some(20.0)));
        assert!(e.data.limits.iter().all(|l| l.stale_since == Some(t)));
        let live = latest(&history(json!([{ "t": NOW - MAX_AGE_MS, "org": "o", "u": { "fh": 10 } }])), NOW).unwrap();
        assert_eq!(live.data.limits[0].stale_since, None, "30 min is still live");
    }

    #[test]
    fn a_window_that_has_run_out_since_the_reading_is_dropped() {
        let at = |age: i64| history(json!([{ "t": NOW - age, "org": "o", "u": { "fh": 38, "sd": 47 } }]));
        let e = latest(&at(18 * 3_600_000), NOW).unwrap();
        assert_eq!((pct(&e, Window::FiveHour), pct(&e, Window::Weekly)), (None, Some(47.0)), "5 h is long over, the week is not");
        assert!(latest(&at(8 * 24 * 3_600_000), NOW).is_none(), "nothing left after a week");
    }

    #[test]
    fn unknown_or_broken_files_are_no_data_never_zero() {
        assert!(latest(b"{bad", NOW).is_none());
        assert!(latest(&serde_json::to_vec(&json!({ "version": 1, "samples": [{ "t": NOW, "fh": 1, "sd": 2 }] })).unwrap(), NOW).is_none());
        assert!(latest(&history(json!([])), NOW).is_none());
        assert!(latest(&history(json!([{ "t": NOW, "org": "o", "u": { "so": 5 } }])), NOW).is_none());
    }

    #[test]
    fn partial_sample_gives_only_known_windows() {
        let e = latest(&history(json!([{ "t": NOW, "org": null, "u": { "sd": 40.5 } }])), NOW).unwrap();
        assert_eq!((pct(&e, Window::FiveHour), pct(&e, Window::Weekly)), (None, Some(40.5)));
    }

    #[test]
    fn finds_msix_and_classic_install_files() {
        let d = tempfile::tempdir().unwrap();
        let local = d.path().join("Local");
        let roaming = d.path().join("Roaming");
        let msix = local.join("Packages/Claude_pzs8sxrjxfjjc/LocalCache/Roaming/Claude");
        std::fs::create_dir_all(&msix).unwrap();
        std::fs::create_dir_all(local.join("Packages/Other_123")).unwrap();
        let files = candidate_files(&local, &roaming);
        assert_eq!(files, vec![msix.join(FILE), roaming.join("Claude").join(FILE)]);
    }

    #[test]
    fn poller_reads_on_change_at_most_once_a_minute() {
        let d = tempfile::tempdir().unwrap();
        let f = d.path().join(FILE);
        let now = crate::time::now_ms();
        std::fs::write(&f, history(json!([{ "t": now, "org": "o", "u": { "fh": 1 } }]))).unwrap();
        let mut p = Poller::new(vec![d.path().join("missing.json"), f.clone()]);
        assert_eq!(pct(&limits(p.poll(now)), Window::FiveHour), Some(1.0));
        assert!(p.poll(now + POLL_MS).is_none(), "file did not change");
        std::thread::sleep(std::time::Duration::from_millis(20));
        std::fs::write(&f, history(json!([{ "t": now, "org": "o", "u": { "fh": 2 } }]))).unwrap();
        assert!(p.poll(now + POLL_MS + 1).is_none(), "too soon since the last check");
        assert_eq!(pct(&limits(p.poll(now + 2 * POLL_MS)), Window::FiveHour), Some(2.0));
    }

    fn limits(u: Option<Usage>) -> Event {
        match u { Some(Usage::Limits(e)) => e, other => panic!("expected limits, got {other:?}") }
    }

    #[test]
    fn poller_reports_each_change_of_age_once_when_the_app_stops_updating() {
        // Claude app closed: the file stops changing; the sample becomes "as of", then loses its 5 h window, then goes
        let d = tempfile::tempdir().unwrap();
        let f = d.path().join(FILE);
        let now = crate::time::now_ms();
        std::fs::write(&f, history(json!([{ "t": now, "org": "o", "u": { "fh": 50, "sd": 60 } }]))).unwrap();
        let mut p = Poller::new(vec![f]);
        assert!(limits(p.poll(now)).data.limits.iter().all(|l| l.stale_since.is_none()));
        assert!(p.poll(now + MAX_AGE_MS - POLL_MS).is_none());
        let aged = limits(p.poll(now + MAX_AGE_MS + POLL_MS));
        assert!(aged.data.limits.iter().all(|l| l.stale_since == Some(now)) && aged.data.limits.len() == 2);
        assert!(p.poll(now + MAX_AGE_MS + 3 * POLL_MS).is_none(), "only once");
        let later = limits(p.poll(now + FIVE_HOUR_MS + 5 * POLL_MS));
        assert_eq!((pct(&later, Window::FiveHour), pct(&later, Window::Weekly)), (None, Some(60.0)));
        assert!(p.poll(now + FIVE_HOUR_MS + 7 * POLL_MS).is_none());
        assert!(matches!(p.poll(now + WEEK_MS + 3 * POLL_MS), Some(Usage::Stale)));
        assert!(p.poll(now + WEEK_MS + 5 * POLL_MS).is_none(), "only once");
    }
}
