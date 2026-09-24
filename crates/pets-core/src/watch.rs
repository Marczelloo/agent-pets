use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::mpsc::Sender;
use crate::claude::transcript::TranscriptParser;
use crate::codex::rollout::RolloutParser;
use crate::model::Event;
use crate::tail::TailReader;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum FileKind { ClaudeTranscript, CodexRollout }

pub fn kind_of(path: &Path) -> Option<FileKind> {
    if path.extension().and_then(|e| e.to_str()) != Some("jsonl") { return None; }
    let name = path.file_name()?.to_str()?;
    if name.starts_with("rollout-") { return Some(FileKind::CodexRollout); }
    if path.components().any(|c| c.as_os_str() == "projects") { return Some(FileKind::ClaudeTranscript); }
    None
}

enum Parser { Claude(TranscriptParser), Codex(RolloutParser) }

/// Śledzone pliki transkryptów i rolloutów, każdy z własnym czytnikiem końcówki i parserem.
pub struct Sources { tails: HashMap<PathBuf, (TailReader, Parser)> }

impl Default for Sources {
    fn default() -> Self { Self::new() }
}

impl Sources {
    pub fn new() -> Self { Sources { tails: HashMap::new() } }

    pub fn track(&mut self, path: &Path, from_start: bool) -> bool {
        if self.tails.contains_key(path) { return true; }
        let Some(kind) = kind_of(path) else { return false };
        let tail = if from_start { TailReader::new(path) } else {
            match TailReader::from_end(path) { Ok(t) => t, Err(_) => return false }
        };
        let parser = match kind {
            FileKind::ClaudeTranscript => Parser::Claude(TranscriptParser::new()),
            FileKind::CodexRollout => Parser::Codex(RolloutParser::new()),
        };
        self.tails.insert(path.to_path_buf(), (tail, parser));
        true
    }

    pub fn poll(&mut self, path: &Path) -> Vec<Event> {
        if !self.tails.contains_key(path) && !self.track(path, true) { return vec![]; }
        let (tail, parser) = self.tails.get_mut(path).unwrap();
        let lines = tail.read_lines().unwrap_or_default();
        lines.iter().flat_map(|l| match parser {
            Parser::Claude(p) => p.parse_line(l),
            Parser::Codex(p) => p.parse_line(l),
        }).collect()
    }

    pub fn poll_all(&mut self) -> Vec<Event> {
        let paths: Vec<PathBuf> = self.tails.keys().cloned().collect();
        paths.iter().flat_map(|p| self.poll(p)).collect()
    }
}

/// Rekurencyjna obserwacja katalogów; wysyła ścieżki utworzonych lub zmienionych plików `.jsonl`.
/// Zwrócony watcher trzeba trzymać przy życiu.
pub fn watch(roots: &[PathBuf], tx: Sender<PathBuf>) -> notify::Result<notify::RecommendedWatcher> {
    use notify::{EventKind, RecursiveMode, Watcher};
    let mut w = notify::recommended_watcher(move |res: notify::Result<notify::Event>| {
        if let Ok(ev) = res {
            if matches!(ev.kind, EventKind::Create(_) | EventKind::Modify(_)) {
                for p in ev.paths {
                    if p.extension().and_then(|e| e.to_str()) == Some("jsonl") { let _ = tx.send(p); }
                }
            }
        }
    })?;
    for r in roots {
        if r.exists() { w.watch(r, RecursiveMode::Recursive)?; }
    }
    Ok(w)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;
    use std::time::Duration;

    const META: &str = r#"{"timestamp":"2026-09-24T10:00:00.000Z","type":"session_meta","payload":{"id":"t1","cwd":"C:\\p","originator":"Codex Desktop","source":"vscode","thread_source":"user"}}"#;
    const START: &str = r#"{"timestamp":"2026-09-24T10:00:01.000Z","type":"event_msg","payload":{"type":"task_started"}}"#;

    #[test]
    fn kinds_by_path() {
        assert_eq!(kind_of(Path::new(r"C:\u\.codex\sessions\2026\09\24\rollout-x.jsonl")), Some(FileKind::CodexRollout));
        assert_eq!(kind_of(Path::new(r"C:\u\.claude\projects\p\abc.jsonl")), Some(FileKind::ClaudeTranscript));
        assert_eq!(kind_of(Path::new(r"C:\u\notes.txt")), None);
    }

    #[test]
    fn sources_track_and_poll_incrementally() {
        let dir = tempfile::tempdir().unwrap();
        let p = dir.path().join("rollout-a.jsonl");
        std::fs::write(&p, format!("{META}\n")).unwrap();
        let mut s = Sources::new();
        assert!(s.track(&p, true));
        let e = s.poll(&p);
        assert_eq!(e.len(), 1);
        std::fs::OpenOptions::new().append(true).open(&p).unwrap().write_all(format!("{START}\n").as_bytes()).unwrap();
        assert_eq!(s.poll_all().len(), 1);
    }

    #[test]
    fn watcher_reports_changed_jsonl() {
        let dir = tempfile::tempdir().unwrap();
        let (tx, rx) = std::sync::mpsc::channel();
        let _w = watch(&[dir.path().to_path_buf()], tx).unwrap();
        std::thread::sleep(Duration::from_millis(200));
        let p = dir.path().join("rollout-b.jsonl");
        std::fs::write(&p, format!("{META}\n")).unwrap();
        let got = rx.recv_timeout(Duration::from_secs(3)).unwrap();
        assert_eq!(got.file_name(), p.file_name());
    }
}
