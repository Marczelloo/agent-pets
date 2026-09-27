//! Skan historii (spec 2.4): najpierw cała historia od najnowszych plików, potem tylko dopisane linie.
use std::fs::File;
use std::io::{BufRead, BufReader, Seek, SeekFrom};
use std::path::PathBuf;
use serde::Serialize;
use crate::watch::{kind_of, FileKind};
use super::claude::claude_line;
use super::codex::codex_line;
use super::{Book, FileEntry};

/// Co ile przeczytanych bajtów pytamy, czy wstrzymać skan (gra na pełnym ekranie).
pub const PORTION: u64 = 256 * 1024;

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize)]
pub struct Progress { pub files: usize, pub scanned: u64, pub total: u64, pub done: bool }

pub struct Scanner { roots: Vec<PathBuf>, queue: Vec<PathBuf>, scanned: u64, total: u64, pub book: Book }

fn walk(dir: &std::path::Path, out: &mut Vec<PathBuf>) {
    let Ok(rd) = std::fs::read_dir(dir) else { return };
    for e in rd.flatten() {
        let p = e.path();
        match e.file_type() {
            Ok(t) if t.is_dir() => walk(&p, out),
            Ok(t) if t.is_file() && kind_of(&p).is_some() => out.push(p),
            _ => {}
        }
    }
}

fn stamp(m: &std::fs::Metadata) -> (u64, i64) {
    let mtime = m.modified().ok().and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok()).map(|d| d.as_millis() as i64).unwrap_or(0);
    (m.len(), mtime)
}

fn feed(kind: FileKind, e: &mut FileEntry, line: &str) {
    match kind {
        FileKind::ClaudeTranscript => claude_line(e, line, false),
        FileKind::ClaudeSubagent => claude_line(e, line, true),
        FileKind::CodexRollout => codex_line(e, line),
    }
}

impl Scanner {
    pub fn new(roots: Vec<PathBuf>, book: Book) -> Scanner { Scanner { roots, queue: Vec::new(), scanned: 0, total: 0, book } }

    /// Kolejka plików zmienionych od ostatniego odczytu (rozmiar albo czas zmiany), od najnowszego.
    pub fn refresh(&mut self) -> usize {
        let mut files = Vec::new();
        for r in &self.roots { walk(r, &mut files); }
        let mut q: Vec<(i64, u64, PathBuf)> = files.into_iter().filter_map(|p| {
            let (len, mtime) = stamp(&std::fs::metadata(&p).ok()?);
            let key = p.to_string_lossy().into_owned();
            let e = self.book.files.get(&key);
            let changed = e.is_none_or(|e| e.cursor.size != len || e.cursor.mtime != mtime);
            let offset = e.map(|e| e.cursor.offset).filter(|&o| o <= len).unwrap_or(0);
            changed.then_some((mtime, len - offset, p))
        }).collect();
        q.sort_by(|a, b| b.0.cmp(&a.0));
        self.total = q.iter().map(|x| x.1).sum();
        self.scanned = 0;
        self.queue = q.into_iter().map(|x| x.2).collect();
        self.queue.len()
    }

    fn progress(&self) -> Progress {
        Progress { files: self.queue.len(), scanned: self.scanned, total: self.total, done: self.queue.is_empty() }
    }

    /// Czyta całe linie, dopóki następna mieści się w `budget` (zawsze co najmniej jedną). Kursor i wkład pliku
    /// zmieniają się razem, więc zapisana w dowolnej chwili księga wznawia skan bez podwójnego liczenia.
    pub fn step(&mut self, budget: u64, pause: &dyn Fn() -> bool) -> Progress {
        let mut consumed = 0u64;
        let mut next_pause = PORTION;
        while let Some(path) = self.queue.first().cloned() {
            let (Some(kind), Ok(m)) = (kind_of(&path), std::fs::metadata(&path)) else { self.queue.remove(0); continue };
            let (len, mtime) = stamp(&m);
            let entry = self.book.files.entry(path.to_string_lossy().into_owned()).or_default();
            if len < entry.cursor.offset { *entry = FileEntry::default(); }
            let Ok(mut f) = File::open(&path) else { self.queue.remove(0); continue };
            if f.seek(SeekFrom::Start(entry.cursor.offset)).is_err() { self.queue.remove(0); continue; }
            let mut r = BufReader::new(f);
            let mut buf = Vec::new();
            let (mut finished, mut stop) = (false, false);
            loop {
                buf.clear();
                let n = match r.read_until(b'\n', &mut buf) { Ok(n) => n as u64, Err(_) => { finished = true; break } };
                // koniec pliku albo niedokończona ostatnia linia: czeka na kolejny odczyt
                if n == 0 || buf.last() != Some(&b'\n') { finished = true; break; }
                if consumed > 0 && consumed + n > budget { stop = true; break; }
                feed(kind, entry, String::from_utf8_lossy(&buf).trim_end());
                entry.cursor.offset += n;
                consumed += n;
                self.scanned += n;
                if consumed >= next_pause {
                    next_pause += PORTION;
                    if pause() { stop = true; break; }
                }
            }
            if finished {
                entry.cursor.size = len;
                entry.cursor.mtime = mtime;
                self.queue.remove(0);
            }
            if stop { return self.progress(); }
        }
        self.progress()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::stats::{Book, Cell};
    use serde_json::json;
    use std::io::Write;
    use std::path::Path;
    use std::time::{Duration, SystemTime};

    fn claude(i: u64) -> String {
        json!({"type": "assistant", "timestamp": format!("2026-09-27T10:00:{:02}.000Z", i % 60), "cwd": "C:/w/proj",
            "message": {"id": format!("m{i}"), "model": "claude-opus-5-5", "usage": {"input_tokens": 10, "output_tokens": 1}, "content": []}}).to_string()
    }
    fn codex_meta() -> String {
        json!({"timestamp": "2026-09-27T10:00:00.000Z", "type": "session_meta", "payload": {"id": "t", "cwd": "C:/w/cdx", "originator": "Codex Desktop"}}).to_string()
    }
    fn codex_tokens(total: u64) -> String {
        json!({"timestamp": "2026-09-27T10:00:05.000Z", "type": "event_msg", "payload": {"type": "token_count",
            "info": {"total_token_usage": {"input_tokens": total, "cached_input_tokens": 0, "output_tokens": 0}}}}).to_string()
    }
    fn write(p: &Path, lines: &[String]) {
        std::fs::create_dir_all(p.parent().unwrap()).unwrap();
        std::fs::write(p, lines.iter().map(|l| format!("{l}\n")).collect::<String>()).unwrap();
    }
    fn append(p: &Path, s: &str) { std::fs::OpenOptions::new().append(true).open(p).unwrap().write_all(s.as_bytes()).unwrap(); }
    fn input_of(b: &Book) -> u64 {
        let mut c = Cell::default();
        for e in b.files.values() { for m in e.hours.values() { for x in m.values() { c.add(x); } } }
        c.input
    }
    struct Home { _d: tempfile::TempDir, roots: Vec<PathBuf>, main: PathBuf, agent: PathBuf, rollout: PathBuf }
    fn home() -> Home {
        let d = tempfile::tempdir().unwrap();
        let projects = d.path().join(".claude").join("projects");
        let sessions = d.path().join(".codex").join("sessions");
        let main = projects.join("p").join("s1.jsonl");
        let agent = projects.join("p").join("s1").join("subagents").join("agent-a.jsonl");
        let rollout = sessions.join("2026").join("09").join("27").join("rollout-x.jsonl");
        write(&main, &[claude(1), claude(2)]);
        write(&agent, &[claude(3)]);
        write(&rollout, &[codex_meta(), codex_tokens(100)]);
        Home { roots: vec![projects, sessions], main, agent, rollout, _d: d }
    }
    fn all(s: &mut Scanner) -> Progress {
        s.refresh();
        loop { let p = s.step(1 << 30, &|| false); if p.done { return p; } }
    }
    const NO: &dyn Fn() -> bool = &|| false;

    #[test]
    fn a_full_scan_counts_every_kind_of_file() {
        let h = home();
        let mut s = Scanner::new(h.roots.clone(), Book::default());
        assert_eq!(s.refresh(), 3);
        let p = s.step(1 << 30, NO);
        assert!(p.done);
        assert_eq!(p.scanned, p.total);
        assert_eq!(input_of(&s.book), 10 * 3 + 100);
        let key = |p: &Path| p.to_string_lossy().into_owned();
        assert!(s.book.files[&key(&h.agent)].meta.sub);
        assert!(!s.book.files[&key(&h.main)].meta.sub);
        assert_eq!(s.book.files[&key(&h.rollout)].meta.project.as_deref(), Some("cdx"));
        assert_eq!(s.refresh(), 0, "nothing changed");
    }

    #[test]
    fn appended_lines_are_counted_once() {
        let h = home();
        let mut s = Scanner::new(h.roots.clone(), Book::default());
        all(&mut s);
        append(&h.main, &format!("{}\n", claude(4)));
        assert_eq!(s.refresh(), 1);
        all(&mut s);
        assert_eq!(input_of(&s.book), 10 * 4 + 100);
    }

    #[test]
    fn a_restart_in_the_middle_counts_nothing_twice() {
        let h = home();
        let lines: Vec<String> = (10..40).map(claude).collect();
        write(&h.main, &lines);
        let mut once = Scanner::new(h.roots.clone(), Book::default());
        all(&mut once);

        let dir = tempfile::tempdir().unwrap();
        let saved = dir.path().join("stats.json");
        let mut s = Scanner::new(h.roots.clone(), Book::default());
        s.refresh();
        let p = s.step(900, NO);
        assert!(!p.done && p.scanned > 0 && p.scanned <= 900);
        s.book.save(&saved).unwrap();
        let mut again = Scanner::new(h.roots.clone(), Book::load(&saved));
        all(&mut again);
        assert_eq!(again.book.files, once.book.files);
    }

    #[test]
    fn an_unfinished_line_waits_for_its_end() {
        let h = home();
        let mut s = Scanner::new(h.roots.clone(), Book::default());
        all(&mut s);
        let line = claude(5);
        let (a, b) = line.split_at(line.len() / 2);
        append(&h.main, a);
        all(&mut s);
        assert_eq!(input_of(&s.book), 130);
        append(&h.main, &format!("{b}\n"));
        all(&mut s);
        assert_eq!(input_of(&s.book), 140);
    }

    #[test]
    fn a_shorter_file_is_counted_again_from_the_start() {
        let h = home();
        let mut s = Scanner::new(h.roots.clone(), Book::default());
        all(&mut s);
        write(&h.rollout, &[codex_meta(), codex_tokens(7)]);
        all(&mut s);
        assert_eq!(input_of(&s.book), 30 + 7);
    }

    #[test]
    fn a_pause_stops_after_the_first_portion() {
        let h = home();
        let big: Vec<String> = (0..3000).map(claude).collect();
        write(&h.main, &big);
        let mut s = Scanner::new(h.roots.clone(), Book::default());
        s.refresh();
        let p = s.step(1 << 30, &|| true);
        assert!(!p.done);
        assert!(p.scanned <= PORTION + 1024, "{}", p.scanned);
    }

    #[test]
    fn newer_files_are_read_first() {
        let h = home();
        let old = SystemTime::now() - Duration::from_secs(86_400);
        for p in [&h.main, &h.agent] { std::fs::File::options().write(true).open(p).unwrap().set_modified(old).unwrap(); }
        let mut s = Scanner::new(h.roots.clone(), Book::default());
        s.refresh();
        s.step(1, NO);
        let rollout = h.rollout.to_string_lossy().into_owned();
        assert!(s.book.files.contains_key(&rollout), "{:?}", s.book.files.keys().collect::<Vec<_>>());
    }
}
