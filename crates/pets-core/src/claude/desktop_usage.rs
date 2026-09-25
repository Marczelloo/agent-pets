//! Limity konta Claude z aplikacji desktopowej. Aplikacja co 5–15 min pobiera zużycie planu i dopisuje próbkę do
//! `plan-usage-history.json`: `{"version":2,"samples":[{"t":<ms>,"org":"<uuid>","u":{"fh":<5h %>,"sd":<tydzień %>}}]}`.
//! Plik ma tylko procenty, bez czasu resetu. Czytamy go lokalnie, bez sieci i bez danych logowania.
use crate::model::*;
use std::path::{Path, PathBuf};
use std::time::SystemTime;

pub const FILE: &str = "plan-usage-history.json";
/// Próbka starsza niż to jest nieaktualna (aplikacja zamknięta): nie zgłaszamy jej.
pub const MAX_AGE_MS: i64 = 30 * 60 * 1000;
pub const POLL_MS: i64 = 60_000;
pub const SESSION_ID: &str = "claude-desktop-usage";

/// Instalacja MSIX (`%LOCALAPPDATA%\Packages\Claude_*\LocalCache\Roaming\Claude`) i zwykła (`%APPDATA%\Claude`).
pub fn candidate_files(local_appdata: &Path, appdata: &Path) -> Vec<PathBuf> {
    let mut out: Vec<PathBuf> = std::fs::read_dir(local_appdata.join("Packages")).into_iter().flatten().flatten()
        .filter(|e| e.file_name().to_string_lossy().starts_with("Claude_"))
        .map(|e| e.path().join("LocalCache").join("Roaming").join("Claude").join(FILE))
        .collect();
    out.sort();
    out.push(appdata.join("Claude").join(FILE));
    out
}

/// Najnowsza próbka jako zdarzenie limitów. `None` dla nieznanego formatu, pustej historii i próbki nieaktualnej.
pub fn latest(bytes: &[u8], now: i64) -> Option<Event> {
    let v: serde_json::Value = serde_json::from_slice(bytes).ok()?;
    if v.get("version")?.as_i64()? != 2 { return None; }
    let sample = v.get("samples")?.as_array()?.iter()
        .filter_map(|s| Some((s.get("t")?.as_i64()?, s.get("u")?)))
        .max_by_key(|(t, _)| *t)?;
    let (t, u) = sample;
    if now - t > MAX_AGE_MS { return None; }
    let limits: Vec<Limit> = [("fh", Window::FiveHour), ("sd", Window::Weekly)].into_iter()
        .filter_map(|(k, window)| Some(Limit { agent: Agent::Claude, window, used_pct: u.get(k)?.as_f64()? as f32, resets_at: None }))
        .collect();
    if limits.is_empty() { return None; }
    let mut e = Event::new(Source::Claude, SESSION_ID, Kind::Limits, t);
    e.data.limits = limits;
    Some(e)
}

#[derive(Debug)]
pub enum Usage {
    /// nowa próbka
    Limits(Event),
    /// ostatnia zgłoszona próbka jest starsza niż `MAX_AGE_MS` (aplikacja zamknięta): jej limity trzeba zdjąć
    Stale,
}

pub struct Poller {
    files: Vec<PathBuf>,
    next_check: i64,
    seen: Option<(PathBuf, SystemTime)>,
    /// czas ostatniej zgłoszonej próbki, dopóki jej limity są w użyciu
    reported: Option<i64>,
}

impl Poller {
    pub fn new(files: Vec<PathBuf>) -> Poller { Poller { files, next_check: i64::MIN, seen: None, reported: None } }

    /// Co `POLL_MS` sprawdza pliki; czyta tylko ten z najnowszym mtime i tylko gdy się zmienił.
    pub fn poll(&mut self, now: i64) -> Option<Usage> {
        if now < self.next_check { return None; }
        self.next_check = now + POLL_MS;
        let newest = self.files.iter()
            .filter_map(|f| Some((f.clone(), std::fs::metadata(f).ok()?.modified().ok()?)))
            .max_by_key(|(_, m)| *m);
        if let Some(newest) = newest.filter(|n| self.seen.as_ref() != Some(n)) {
            let e = std::fs::read(&newest.0).ok().and_then(|b| latest(&b, now));
            self.seen = Some(newest);
            if let Some(e) = e {
                self.reported = Some(e.ts);
                return Some(Usage::Limits(e));
            }
        }
        match self.reported {
            Some(t) if now - t > MAX_AGE_MS => { self.reported = None; Some(Usage::Stale) }
            _ => None,
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
    fn stale_sample_is_no_data() {
        let b = history(json!([{ "t": NOW - MAX_AGE_MS - 1, "org": "o", "u": { "fh": 10, "sd": 20 } }]));
        assert!(latest(&b, NOW).is_none());
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
        assert!(p.poll(now + POLL_MS).is_none(), "plik się nie zmienił");
        std::thread::sleep(std::time::Duration::from_millis(20));
        std::fs::write(&f, history(json!([{ "t": now, "org": "o", "u": { "fh": 2 } }]))).unwrap();
        assert!(p.poll(now + POLL_MS + 1).is_none(), "za wcześnie od ostatniego sprawdzenia");
        assert_eq!(pct(&limits(p.poll(now + 2 * POLL_MS)), Window::FiveHour), Some(2.0));
    }

    fn limits(u: Option<Usage>) -> Event {
        match u { Some(Usage::Limits(e)) => e, other => panic!("oczekiwano limitów, jest {other:?}") }
    }

    #[test]
    fn poller_reports_once_when_the_app_stops_updating() {
        // aplikacja Claude zamknięta: plik przestaje się zmieniać, a ostatnia próbka się starzeje
        let d = tempfile::tempdir().unwrap();
        let f = d.path().join(FILE);
        let now = crate::time::now_ms();
        std::fs::write(&f, history(json!([{ "t": now, "org": "o", "u": { "fh": 50 } }]))).unwrap();
        let mut p = Poller::new(vec![f]);
        limits(p.poll(now));
        assert!(p.poll(now + MAX_AGE_MS - POLL_MS).is_none());
        assert!(matches!(p.poll(now + MAX_AGE_MS + POLL_MS), Some(Usage::Stale)));
        assert!(p.poll(now + MAX_AGE_MS + 3 * POLL_MS).is_none(), "tylko raz");
    }
}
