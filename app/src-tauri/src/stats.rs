//! Statistics (spec 0.9): low-priority history scan thread, "Statistics" window, and its commands.
use std::sync::Mutex;
use std::time::Duration;
use pets_core::i18n::{tr, Lang};
use pets_core::stats::scan::{Progress, Scanner};
use pets_core::stats::summary::{local_day, summary, week_compare, week_start, weekly_recap, Metric, Period, Query, RaceBy, StatsView};
use pets_core::stats::Book;
use tauri::{AppHandle, Emitter, Manager, WebviewUrl, WebviewWindowBuilder};

/// Chunk size for one scan step (bytes); the thread yields between steps.
pub const STEP_BYTES: u64 = 4 * 1024 * 1024;
const SAVE_EVERY_MS: i64 = 5_000;
const RESCAN: Duration = Duration::from_secs(30);
const PROGRESS_EVERY_MS: i64 = 500;
const DAY_MS: i64 = 86_400_000;
const HOUR_MS: i64 = 3_600_000;
/// Toast attempts for one recap (one per rescan, ~5 min): right after logon Windows may not take toasts yet.
const WEEKLY_TRIES: u8 = 10;

/// Current Monday when the local clock has passed 09:00 and the week was not handled yet.
pub fn due(now: i64, last_sent_week: Option<i64>, tz: &dyn Fn(i64) -> i64) -> Option<i64> {
    let day = local_day(now, tz);
    let week = week_start(day);
    let local_ms = (now + tz(now)).rem_euclid(DAY_MS);
    (last_sent_week.is_some_and(|last| last < week) && (day > week || local_ms >= 9 * HOUR_MS)).then_some(week)
}

/// The attempt for `week` after `prev`: whether it is the first one (record the recap in the center then) and the new count.
fn weekly_attempt(prev: Option<(i64, u8)>, week: i64) -> (bool, (i64, u8)) {
    match prev {
        Some((w, n)) if w == week => (false, (w, n.saturating_add(1))),
        _ => (true, (week, 1)),
    }
}

fn weekly_path(home: &std::path::Path) -> std::path::PathBuf { home.join(".agent-pets").join("weekly.json") }

fn save_week(path: &std::path::Path, week: i64) -> std::io::Result<()> {
    if let Some(parent) = path.parent() { std::fs::create_dir_all(parent)?; }
    let temp = path.with_extension("json.tmp");
    std::fs::write(&temp, serde_json::json!({ "last_sent_week": week }).to_string())?;
    std::fs::rename(temp, path)
}

fn check_weekly(app: &AppHandle, book: &Book, home: &std::path::Path, now: i64) {
    let path = weekly_path(home);
    let week = week_start(local_day(now, &tz_offset));
    let last = std::fs::read(&path).ok().and_then(|b| serde_json::from_slice::<serde_json::Value>(&b).ok())
        .and_then(|v| v.get("last_sent_week")?.as_i64());
    if last.is_none() {
        if let Err(e) = save_week(&path, week) { pets_core::app_log!("statistics: weekly state: {e}"); }
        return;
    }
    let Some(week) = due(now, last, &tz_offset) else { return };
    let cur = app.state::<crate::settings::SettingsState>().get();
    let lang = pets_core::i18n::current(cur.language);
    let last = week_compare(book, now, &tz_offset).last;
    let prev = week_compare(book, now - 7 * DAY_MS, &tz_offset).last;
    // the week counts as handled only once the toast went out (or there is nothing to show): a failed one is tried again
    let handled = match weekly_recap(&last, &prev, lang).filter(|_| cur.notifications.weekly) {
        None => true,
        Some((title, body)) => {
            let st = app.state::<StatsState>();
            let mut attempt = st.weekly.lock().unwrap();
            let (first, next) = weekly_attempt(*attempt, week);
            *attempt = Some(next);
            crate::notify::show_weekly(app, &title, &body, tr(lang, "Statystyki", "Statistics"), first) || next.1 >= WEEKLY_TRIES
        }
    };
    if handled { if let Err(e) = save_week(&path, week) { pets_core::app_log!("statistics: weekly state: {e}"); } }
}

pub struct StatsState {
    pub scanner: Mutex<Scanner>,
    pub progress: Mutex<Progress>,
    /// Writing is allowed only after successfully reading the ledger from disk.
    pub writable: std::sync::atomic::AtomicBool,
    /// Monday recap not delivered yet: its week and the attempts so far.
    weekly: Mutex<Option<(i64, u8)>>,
}

impl StatsState {
    /// Empty ledger until the scan thread (`spawn`) reads it from disk.
    pub fn load(home: &std::path::Path) -> StatsState {
        let roots = vec![home.join(".claude").join("projects"), home.join(".codex").join("sessions")];
        StatsState { scanner: Mutex::new(Scanner::new(roots, Book::default())), progress: Mutex::new(Progress::default()),
            writable: std::sync::atomic::AtomicBool::new(false), weekly: Mutex::new(None) }
    }
}

/// One pass: queue changed files and scan to completion, pausing for fullscreen apps and saving every `SAVE_EVERY_MS`
/// and at the end. Hold the scanner lock only during each step so the window can compute its view meanwhile.
pub fn run_until_done(sc: &Mutex<Scanner>, step: u64, pause: &dyn Fn() -> bool, save: &mut dyn FnMut(&Book),
    now: &dyn Fn() -> i64, progress: &mut dyn FnMut(Progress), sleep: &dyn Fn(u64)) -> Progress {
    let queued = sc.lock().unwrap().refresh();
    let mut last_save = now();
    loop {
        // fullscreen: read nothing, not even one chunk (0.9 review)
        if pause() { sleep(1_000); continue; }
        let p = sc.lock().unwrap().step(step, pause);
        progress(p);
        let t = now();
        if p.done {
            if queued > 0 { save(&sc.lock().unwrap().book); }
            return p;
        }
        if t - last_save >= SAVE_EVERY_MS { save(&sc.lock().unwrap().book); last_save = t; }
        sleep(if pause() { 1_000 } else { 20 });
    }
}

/// Add opencode sessions from its database to the ledger (spec 0.11 §4.4): only when integration is enabled and no fullscreen game runs.
/// Return the number of processed sessions (0 = nothing to save).
pub fn sync_opencode(sc: &Mutex<Scanner>, db_path: &std::path::Path, on: bool, pause: &dyn Fn() -> bool) -> usize {
    if !on || pause() { return 0; }
    let Some(c) = pets_core::opencode_db::open(db_path) else { return 0 };
    // the lock is held only for a lookup or an insert, never while the database is read: the statistics window stays responsive
    pets_core::stats::opencode::sync_with(&|key| sc.lock().unwrap().book.files.get(key).map(|e| e.cursor.mtime), &c, pause,
        &mut |key, e| { sc.lock().unwrap().book.files.insert(key, e); })
}

/// Ledger from disk; retry read errors (e.g. antivirus lock at startup), then return `None` if they persist:
/// write nothing so an empty ledger cannot overwrite history (0.9 review, I4).
pub fn open_book(path: &std::path::Path, tries: u32, sleep: &dyn Fn(u64)) -> Option<Book> {
    for i in 0..tries {
        match Book::load_checked(path) {
            Ok(b) => return Some(b),
            Err(e) if i + 1 < tries => { let _ = e; sleep(1_000) }
            Err(e) => pets_core::app_log!("statistics: cannot read ledger ({e}); writes disabled for this session"),
        }
    }
    None
}

/// Local time offset from UTC (ms) at `ts`, including daylight saving time.
#[cfg(windows)]
pub fn tz_offset(ts: i64) -> i64 {
    use windows::Win32::Foundation::{FILETIME, SYSTEMTIME};
    use windows::Win32::System::Time::{FileTimeToSystemTime, SystemTimeToFileTime, SystemTimeToTzSpecificLocalTime};
    const EPOCH_DIFF_MS: i64 = 11_644_473_600_000;
    let to_ft = |ms: i64| { let v = ((ms + EPOCH_DIFF_MS) * 10_000) as u64; FILETIME { dwLowDateTime: v as u32, dwHighDateTime: (v >> 32) as u32 } };
    let from_ft = |f: FILETIME| (((f.dwHighDateTime as u64) << 32 | f.dwLowDateTime as u64) / 10_000) as i64 - EPOCH_DIFF_MS;
    unsafe {
        let (mut utc, mut local, mut lft) = (SYSTEMTIME::default(), SYSTEMTIME::default(), FILETIME::default());
        if FileTimeToSystemTime(&to_ft(ts), &mut utc).is_err() { return 0; }
        if SystemTimeToTzSpecificLocalTime(None, &utc, &mut local).is_err() { return 0; }
        if SystemTimeToFileTime(&local, &mut lft).is_err() { return 0; }
        let off = from_ft(lft) - ts;
        (off as f64 / 60_000.0).round() as i64 * 60_000
    }
}

/// Linux: `localtime_r` returns the offset in `tm_gmtoff` (seconds), already DST-corrected.
#[cfg(not(windows))]
pub fn tz_offset(ts: i64) -> i64 {
    unsafe {
        let t: libc::time_t = (ts / 1000) as libc::time_t;
        let mut tm: libc::tm = std::mem::zeroed();
        if libc::localtime_r(&t, &mut tm).is_null() { return 0; }
        tm.tm_gmtoff as i64 * 1_000
    }
}

/// Scan thread: all history on first launch, then only changed files every 30 s.
pub fn spawn(app: AppHandle) {
    std::thread::spawn(move || {
        #[cfg(windows)]
        unsafe {
            use windows::Win32::System::Threading::{GetCurrentThread, SetThreadPriority, THREAD_PRIORITY_BELOW_NORMAL};
            let _ = SetThreadPriority(GetCurrentThread(), THREAD_PRIORITY_BELOW_NORMAL);
        }
        #[cfg(target_os = "linux")]
        unsafe {
            // nice +10: the history scan yields to interactive work
            libc::setpriority(libc::PRIO_PROCESS, 0, 10);
        }
        let st = app.state::<StatsState>();
        let path = Book::default_path();
        if let Some(b) = open_book(&path, 5, &|ms| std::thread::sleep(Duration::from_millis(ms))) {
            st.scanner.lock().unwrap().book = b;
            st.writable.store(true, std::sync::atomic::Ordering::Relaxed);
        }
        let mut sent = 0i64;
        loop {
            run_until_done(&st.scanner, STEP_BYTES, &crate::shell::fullscreen_app,
                &mut |b: &Book| if st.writable.load(std::sync::atomic::Ordering::Relaxed) {
                    if let Err(e) = b.save(&path) { pets_core::app_log!("statistics: {e}") }
                },
                &pets_core::time::now_ms,
                &mut |p| {
                    *st.progress.lock().unwrap() = p;
                    let t = pets_core::time::now_ms();
                    if p.done || t - sent >= PROGRESS_EVERY_MS { let _ = app.emit_to("stats", "stats://progress", p); sent = t; }
                },
                &|ms| std::thread::sleep(Duration::from_millis(ms)));
            let settings = app.state::<crate::settings::SettingsState>();
            let db = pets_core::opencode_db::db_path(&settings.home);
            if sync_opencode(&st.scanner, &db, settings.get().apps.opencode, &crate::shell::fullscreen_app) > 0
                && st.writable.load(std::sync::atomic::Ordering::Relaxed) {
                if let Err(e) = st.scanner.lock().unwrap().book.save(&path) { pets_core::app_log!("statistics: {e}") }
            }
            if st.writable.load(std::sync::atomic::Ordering::Relaxed) {
                check_weekly(&app, &st.scanner.lock().unwrap().book, &settings.home, pets_core::time::now_ms());
            }
            std::thread::sleep(RESCAN);
        }
    });
}

/// Save when the app exits (without waiting on the scanner lock during a long step).
pub fn save_now(app: &AppHandle) {
    if let Some(st) = app.try_state::<StatsState>() {
        if !st.writable.load(std::sync::atomic::Ordering::Relaxed) { return; }
        if let Ok(sc) = st.scanner.try_lock() { let _ = sc.book.save(&Book::default_path()); }
    }
}

pub fn window_title(lang: Lang) -> &'static str { tr(lang, "Agent Pets: statystyki", "Agent Pets: statistics") }

/// Open the statistics window; subsequent calls only show it.
pub fn open(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("stats") {
        let _ = w.unminimize();
        let _ = w.show();
        let _ = w.set_focus();
        return;
    }
    // like the settings window: build on a separate thread (Windows event-handler deadlock)
    let app = app.clone();
    std::thread::spawn(move || {
        let lang = app.state::<crate::settings::SettingsState>().lang();
        // 800×720 fits the whole window (podium, race, calendar, badges, and loading bar) without scrolling
        let (w, h) = crate::settings::fit_size((800.0, 720.0), crate::settings::work_area(&app));
        let theme = crate::settings::window_theme(app.state::<crate::settings::SettingsState>().get().theme);
        let _ = WebviewWindowBuilder::new(&app, "stats", WebviewUrl::App("stats.html".into()))
            .title(window_title(lang)).inner_size(w, h).min_inner_size(620.0, 460.0).theme(theme).center().build();
    });
}

#[tauri::command]
pub fn stats_open(app: AppHandle) { crate::panel::hide(&app); open(&app); }

async fn on_worker<T: Send + 'static>(job: impl FnOnce() -> T + Send + 'static) -> Result<T, String> {
    tauri::async_runtime::spawn_blocking(job).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn stats_view(app: AppHandle, period: Period, metric: Metric, race: RaceBy) -> Result<StatsView, String> {
    on_worker(move || {
        let st = app.state::<StatsState>();
        let sc = st.scanner.lock().unwrap();
        summary(&sc.book, &Query { period, metric, race }, pets_core::time::now_ms(), &tz_offset)
    }).await
}

#[tauri::command]
pub fn stats_progress(app: AppHandle) -> Progress { *app.state::<StatsState>().progress.lock().unwrap() }

#[cfg(test)]
mod tests {
    use super::*;
    use pets_core::stats::scan::Scanner;
    use pets_core::stats::Book;
    use std::cell::{Cell, RefCell};
    use std::sync::Mutex;

    #[test]
    fn stats_work_runs_on_a_blocking_worker() {
        let caller = std::thread::current().id();
        let worker = tauri::async_runtime::block_on(on_worker(|| std::thread::current().id())).unwrap();
        assert_ne!(worker, caller);
    }

    #[test]
    fn a_failed_recap_is_recorded_once_and_tried_again() {
        assert_eq!(weekly_attempt(None, 7), (true, (7, 1)));
        assert_eq!(weekly_attempt(Some((7, 1)), 7), (false, (7, 2)));
        assert_eq!(weekly_attempt(Some((0, 4)), 7), (true, (7, 1)));
        assert_eq!(weekly_attempt(Some((7, u8::MAX)), 7), (false, (7, u8::MAX)));
    }

    #[test]
    fn recap_due_respects_local_monday_and_missed_days() {
        let tz = |_: i64| 2 * HOUR_MS;
        let local_monday = week_start(local_day(1_790_640_000_000, &tz));
        let at = |day: i64, hour: i64, minute: i64| (day * DAY_MS) + hour * HOUR_MS + minute * 60_000 - tz(0);
        let week = local_monday;
        assert_eq!(due(at(week - 1, 12, 0), Some(week - 7), &tz), None);
        assert_eq!(due(at(week, 8, 59), Some(week - 7), &tz), None);
        assert_eq!(due(at(week, 9, 0), Some(week - 7), &tz), Some(week));
        assert_eq!(due(at(week + 2, 12, 0), Some(week - 7), &tz), Some(week));
        assert_eq!(due(at(week + 2, 12, 0), Some(week), &tz), None);
        assert_eq!(due(at(week, 9, 0), None, &tz), None);
    }

    #[test]
    fn the_local_offset_is_whole_quarter_hours_within_fourteen_hours() {
        for ts in [0i64, 1_790_467_200_000, 1_800_000_000_000] {
            let o = tz_offset(ts);
            assert_eq!(o % (15 * 60_000), 0, "{o}");
            assert!(o.abs() <= 14 * 3_600_000, "{o}");
        }
    }

    fn home_with(lines: usize) -> (tempfile::TempDir, Vec<std::path::PathBuf>) {
        let d = tempfile::tempdir().unwrap();
        let p = d.path().join("projects").join("p");
        std::fs::create_dir_all(&p).unwrap();
        let line = serde_json::json!({"type": "user", "timestamp": "2026-09-27T10:00:00.000Z", "cwd": "C:/w/x", "message": {"content": "x"}}).to_string();
        std::fs::write(p.join("s.jsonl"), format!("{line}\n").repeat(lines)).unwrap();
        (d, vec![std::path::PathBuf::from(p.parent().unwrap())])
    }

    #[test]
    fn opencode_stats_need_the_switch_a_database_and_no_game() {
        let (d, roots) = home_with(1);
        let sc = Mutex::new(Scanner::new(roots, Book::default()));
        let db = d.path().join("opencode.db");
        assert_eq!(sync_opencode(&sc, &db, false, &|| false), 0, "opencode disabled");
        assert_eq!(sync_opencode(&sc, &db, true, &|| false), 0, "database missing");
        assert_eq!(sync_opencode(&sc, &db, true, &|| true), 0, "fullscreen game");
        assert!(sc.lock().unwrap().book.files.is_empty());
    }

    #[test]
    fn a_paused_scan_reads_nothing_until_it_resumes() {
        let (_d, roots) = home_with(10);
        let sc = Mutex::new(Scanner::new(roots, Book::default()));
        let log = RefCell::new(Vec::<String>::new());
        let pauses = Cell::new(2);
        run_until_done(&sc, 1 << 30, &|| { let n = pauses.get(); if n > 0 { pauses.set(n - 1) } n > 0 },
            &mut |_| {}, &|| 0, &mut |p| log.borrow_mut().push(format!("step {}", p.scanned)),
            &|ms| log.borrow_mut().push(format!("sleep {ms}")));
        let l = log.borrow();
        assert_eq!((l[0].as_str(), l[1].as_str()), ("sleep 1000", "sleep 1000"), "{l:?}");
        assert!(l[2].starts_with("step ") && l[2] != "step 0", "{l:?}");
    }

    #[test]
    fn the_book_opens_with_retries_and_never_as_an_empty_stand_in() {
        let dir = tempfile::tempdir().unwrap();
        let tries = Cell::new(0);
        let locked = dir.path().join("stats.json");
        std::fs::create_dir(&locked).unwrap();
        assert!(open_book(&locked, 3, &|_| tries.set(tries.get() + 1)).is_none());
        assert_eq!(tries.get(), 2, "waits between the three tries");
        assert!(open_book(&dir.path().join("none.json"), 3, &|_| {}).is_some());
    }

    #[test]
    fn the_scan_loop_saves_every_five_seconds_and_at_the_end() {
        let (_d, roots) = home_with(2000);
        let sc = Mutex::new(Scanner::new(roots, Book::default()));
        let clock = Cell::new(0i64);
        let saves = RefCell::new(Vec::<(i64, usize)>::new());
        let paused = Cell::new(3);
        let p = run_until_done(&sc, 20_000,
            &|| { let n = paused.get(); if n > 0 { paused.set(n - 1) } n > 0 },
            &mut |b: &Book| saves.borrow_mut().push((clock.get(), b.files.len())),
            &|| { clock.set(clock.get() + 2_000); clock.get() },
            &mut |_| {},
            &|_| {});
        assert!(p.done);
        let s = saves.borrow();
        assert!(s.len() >= 2, "{s:?}");
        assert!(s.windows(2).all(|w| w[1].0 - w[0].0 >= 5_000 || w[1] == *s.last().unwrap()), "{s:?}");
        assert_eq!(s.last().unwrap().1, 1, "the final save has the file");
        assert_eq!(sc.lock().unwrap().book.files.values().next().unwrap().cursor.line, 2000);
    }
}
