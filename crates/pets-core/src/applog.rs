//! App log file `~/.agent-pets/agent-pets.log`: release builds have no console, so errors that
//! would go to stderr also land here. One line per entry, the home folder written as `~`, only
//! app errors and lifecycle events (never session titles, prompts or tokens). The file rotates
//! to `agent-pets.log.1` at [`MAX_BYTES`]; the Diagnostics report shows its tail.

use std::io::{Read, Seek, SeekFrom, Write};
use std::path::{Path, PathBuf};
use std::sync::Mutex;

pub const MAX_BYTES: u64 = 512 * 1024;
/// Lines of the log in the Diagnostics report.
pub const REPORT_LINES: usize = 40;

struct Log { path: PathBuf, home: String }

static LOG: Mutex<Option<Log>> = Mutex::new(None);

pub fn path(home: &Path) -> PathBuf { home.join(".agent-pets").join("agent-pets.log") }

/// Start writing to the log file under `home`. Without it, [`write`] only prints to stderr.
pub fn init(home: &Path) {
    *LOG.lock().unwrap_or_else(|e| e.into_inner()) = Some(Log { path: path(home), home: home.to_string_lossy().into_owned() });
}

/// Print to stderr and append to the log file (when [`init`] ran). Never fails.
pub fn write(msg: &str) {
    eprintln!("agent-pets: {msg}");
    // copied out so a panic while writing (logged by the panic hook) never waits for this lock
    let target = LOG.lock().unwrap_or_else(|e| e.into_inner()).as_ref().map(|l| (l.path.clone(), l.home.clone()));
    if let Some((path, home)) = target { let _ = append(&path, &home, MAX_BYTES, crate::time::now_ms(), msg); }
}

/// Last `n` lines of the current log file (empty when there is none).
pub fn tail(n: usize) -> Vec<String> {
    let p = LOG.lock().unwrap_or_else(|e| e.into_inner()).as_ref().map(|l| l.path.clone());
    p.map(|p| read_tail(&p, n)).unwrap_or_default()
}

/// Like `eprintln!`, also into the log file: `app_log!("statistics: {e}")`.
#[macro_export]
macro_rules! app_log {
    ($($arg:tt)*) => { $crate::applog::write(&format!($($arg)*)) };
}

/// One entry: `<UTC time> <message>` with line breaks folded and the home folder as `~`.
pub fn line(home: &str, now_ms: i64, msg: &str) -> String {
    let mut m = msg.replace("\r\n", " / ").replace(['\r', '\n'], " / ");
    if !home.is_empty() {
        m = m.replace(home, "~");
        let alt = home.replace('\\', "/");
        if alt != home { m = m.replace(&alt, "~"); }
    }
    format!("{} {m}\n", crate::time::rfc3339(now_ms))
}

pub fn append(path: &Path, home: &str, max_bytes: u64, now_ms: i64, msg: &str) -> std::io::Result<()> {
    if let Some(dir) = path.parent() { std::fs::create_dir_all(dir)?; }
    if std::fs::metadata(path).map(|m| m.len() >= max_bytes).unwrap_or(false) {
        let old = path.with_extension("log.1");
        let _ = std::fs::remove_file(&old);
        std::fs::rename(path, &old)?;
    }
    let mut f = std::fs::OpenOptions::new().create(true).append(true).open(path)?;
    f.write_all(line(home, now_ms, msg).as_bytes())
}

pub fn read_tail(path: &Path, n: usize) -> Vec<String> {
    let Ok(mut f) = std::fs::File::open(path) else { return Vec::new() };
    let len = f.metadata().map(|m| m.len()).unwrap_or(0);
    let start = len.saturating_sub(64 * 1024);
    if f.seek(SeekFrom::Start(start)).is_err() { return Vec::new(); }
    let mut buf = Vec::new();
    if f.read_to_end(&mut buf).is_err() { return Vec::new(); }
    let text = String::from_utf8_lossy(&buf);
    // a cut first line is dropped
    let lines: Vec<&str> = text.lines().skip(usize::from(start > 0)).collect();
    lines[lines.len().saturating_sub(n)..].iter().map(|s| s.to_string()).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_line_has_the_time_one_row_and_no_home_folder() {
        let l = line(r"C:\Users\ala", 0, "cannot read C:\\Users\\ala\\.agent-pets\\stats.json\nsecond C:/Users/ala/x");
        assert_eq!(l, "1970-01-01T00:00:00.000Z cannot read ~\\.agent-pets\\stats.json / second ~/x\n");
    }

    #[test]
    fn appends_and_reads_the_last_lines() {
        let d = tempfile::tempdir().unwrap();
        let p = path(d.path());
        for i in 0..5 { append(&p, "", MAX_BYTES, 0, &format!("e{i}")).unwrap(); }
        let t = read_tail(&p, 2);
        assert_eq!(t.len(), 2);
        assert!(t[0].ends_with(" e3") && t[1].ends_with(" e4"), "{t:?}");
        assert!(read_tail(&d.path().join("none.log"), 5).is_empty());
    }

    #[test]
    fn rotates_to_one_old_file_at_the_limit() {
        let d = tempfile::tempdir().unwrap();
        let p = path(d.path());
        for i in 0..40 { append(&p, "", 200, 0, &format!("entry {i}")).unwrap(); }
        let old = p.with_extension("log.1");
        assert!(old.is_file());
        assert!(std::fs::metadata(&p).unwrap().len() < 200 + 64);
        assert!(std::fs::metadata(&old).unwrap().len() < 200 + 64);
        assert!(read_tail(&p, 1)[0].ends_with(" entry 39"));
        let names: Vec<_> = std::fs::read_dir(p.parent().unwrap()).unwrap().flatten().map(|e| e.file_name()).collect();
        assert_eq!(names.len(), 2, "{names:?}");
    }

    #[test]
    fn a_long_log_keeps_whole_lines_in_the_tail() {
        let d = tempfile::tempdir().unwrap();
        let p = path(d.path());
        let long = "x".repeat(1000);
        for i in 0..100 { append(&p, "", MAX_BYTES, 0, &format!("{i} {long}")).unwrap(); }
        let t = read_tail(&p, 1000);
        assert!(t.iter().all(|l| l.starts_with("1970-")), "a cut line leaked");
        assert!(t.last().unwrap().contains(" 99 "));
    }
}
