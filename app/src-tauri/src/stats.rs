//! Statystyki (spec 0.9): wątek skanu historii o niskim priorytecie, okno „Statystyki” i jego komendy.
use std::sync::Mutex;
use std::time::Duration;
use pets_core::i18n::{tr, Lang};
use pets_core::stats::scan::{Progress, Scanner};
use pets_core::stats::summary::{summary, Metric, Period, Query, RaceBy, StatsView};
use pets_core::stats::Book;
use tauri::{AppHandle, Emitter, Manager, WebviewUrl, WebviewWindowBuilder};

/// Porcja jednego kroku skanu (bajty); między krokami wątek oddaje procesor.
pub const STEP_BYTES: u64 = 4 * 1024 * 1024;
const SAVE_EVERY_MS: i64 = 5_000;
const RESCAN: Duration = Duration::from_secs(30);
const PROGRESS_EVERY_MS: i64 = 500;

pub struct StatsState {
    pub scanner: Mutex<Scanner>,
    pub progress: Mutex<Progress>,
    /// zapis dozwolony dopiero po udanym odczycie księgi z dysku
    pub writable: std::sync::atomic::AtomicBool,
}

impl StatsState {
    /// Pusta księga do czasu odczytu z dysku w wątku skanu (`spawn`).
    pub fn load(home: &std::path::Path) -> StatsState {
        let roots = vec![home.join(".claude").join("projects"), home.join(".codex").join("sessions")];
        StatsState { scanner: Mutex::new(Scanner::new(roots, Book::default())), progress: Mutex::new(Progress::default()),
            writable: std::sync::atomic::AtomicBool::new(false) }
    }
}

/// Jeden przebieg: kolejka zmienionych plików i skan do końca, z pauzą (pełny ekran), zapisem co `SAVE_EVERY_MS`
/// i na końcu. Zamek skanera trzymamy tylko na czas kroku, więc okno może w tym czasie liczyć widok.
pub fn run_until_done(sc: &Mutex<Scanner>, step: u64, pause: &dyn Fn() -> bool, save: &mut dyn FnMut(&Book),
    now: &dyn Fn() -> i64, progress: &mut dyn FnMut(Progress), sleep: &dyn Fn(u64)) -> Progress {
    let queued = sc.lock().unwrap().refresh();
    let mut last_save = now();
    loop {
        // pełny ekran: nie czytamy nic, nawet jednej porcji (przegląd 0.9)
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

/// Sesje opencode z jego bazy do księgi (spec 0.11 §4.4): tylko przy włączonej integracji i bez gry na pełnym ekranie.
/// Zwraca liczbę przeliczonych sesji (0 = nic do zapisu).
pub fn sync_opencode(sc: &Mutex<Scanner>, db_path: &std::path::Path, on: bool, pause: &dyn Fn() -> bool) -> usize {
    if !on || pause() { return 0; }
    let Some(c) = pets_core::opencode_db::open(db_path) else { return 0 };
    pets_core::stats::opencode::sync(&mut sc.lock().unwrap().book, &c, pause)
}

/// Księga z dysku; błąd odczytu (np. blokada antywirusa przy starcie) ponawiamy, a gdy nie mija, zwracamy `None`:
/// wtedy nic nie zapisujemy, żeby pusta księga nie nadpisała historii (przegląd 0.9, I4).
pub fn open_book(path: &std::path::Path, tries: u32, sleep: &dyn Fn(u64)) -> Option<Book> {
    for i in 0..tries {
        match Book::load_checked(path) {
            Ok(b) => return Some(b),
            Err(e) if i + 1 < tries => { let _ = e; sleep(1_000) }
            Err(e) => eprintln!("agent-pets: statystyki: nie da się odczytać księgi ({e}); bez zapisu do końca sesji"),
        }
    }
    None
}

/// Przesunięcie czasu lokalnego względem UTC (ms) w chwili `ts`, z czasem letnim.
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

/// Wątek skanu: cała historia przy pierwszym uruchomieniu, potem co 30 s tylko zmienione pliki.
pub fn spawn(app: AppHandle) {
    std::thread::spawn(move || {
        unsafe {
            use windows::Win32::System::Threading::{GetCurrentThread, SetThreadPriority, THREAD_PRIORITY_BELOW_NORMAL};
            let _ = SetThreadPriority(GetCurrentThread(), THREAD_PRIORITY_BELOW_NORMAL);
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
                    if let Err(e) = b.save(&path) { eprintln!("agent-pets: statystyki: {e}") }
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
                if let Err(e) = st.scanner.lock().unwrap().book.save(&path) { eprintln!("agent-pets: statystyki: {e}") }
            }
            std::thread::sleep(RESCAN);
        }
    });
}

/// Zapis przy wyjściu z aplikacji (bez czekania na zamek skanera w trakcie długiego kroku).
pub fn save_now(app: &AppHandle) {
    if let Some(st) = app.try_state::<StatsState>() {
        if !st.writable.load(std::sync::atomic::Ordering::Relaxed) { return; }
        if let Ok(sc) = st.scanner.try_lock() { let _ = sc.book.save(&Book::default_path()); }
    }
}

pub fn window_title(lang: Lang) -> &'static str { tr(lang, "Agent Pets: statystyki", "Agent Pets: statistics") }

/// Otwiera okno statystyk; drugie wywołanie tylko je pokazuje.
pub fn open(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("stats") {
        let _ = w.unminimize();
        let _ = w.show();
        let _ = w.set_focus();
        return;
    }
    // jak okno ustawień: budowa w osobnym wątku (zakleszczenie w obsłudze zdarzeń na Windows)
    let app = app.clone();
    std::thread::spawn(move || {
        let lang = app.state::<crate::settings::SettingsState>().lang();
        // 800×720 mieści całe okno (podium, wyścig, kalendarz, odznaki i pasek wczytywania) bez przewijania
        let (w, h) = crate::settings::fit_size((800.0, 720.0), crate::settings::work_area(&app));
        let _ = WebviewWindowBuilder::new(&app, "stats", WebviewUrl::App("stats.html".into()))
            .title(window_title(lang)).inner_size(w, h).min_inner_size(620.0, 460.0).center().build();
    });
}

#[tauri::command]
pub fn stats_open(app: AppHandle) { crate::panel::hide(&app); open(&app); }

#[tauri::command]
pub fn stats_view(app: AppHandle, period: Period, metric: Metric, race: RaceBy) -> StatsView {
    let st = app.state::<StatsState>();
    let sc = st.scanner.lock().unwrap();
    summary(&sc.book, &Query { period, metric, race }, pets_core::time::now_ms(), &tz_offset)
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
        assert_eq!(sync_opencode(&sc, &db, false, &|| false), 0, "wyłączony opencode");
        assert_eq!(sync_opencode(&sc, &db, true, &|| false), 0, "brak bazy");
        assert_eq!(sync_opencode(&sc, &db, true, &|| true), 0, "gra na pełnym ekranie");
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
