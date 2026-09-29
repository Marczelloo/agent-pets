use std::collections::BTreeMap;
use std::io;
use std::path::{Path, PathBuf};
use serde::{Deserialize, Serialize};
use super::FileEntry;

/// Format version; an older ledger is recalculated from history (2: "no project" projects, quarter hours).
pub const VERSION: u32 = 2;

/// Statistics ledger (`~/.agent-pets/stats.json`): one entry per history file read.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct Book { pub v: u32, pub files: BTreeMap<String, FileEntry> }

impl Default for Book { fn default() -> Self { Book { v: VERSION, files: BTreeMap::new() } } }

impl Book {
    pub fn default_path() -> PathBuf { dirs::home_dir().unwrap_or_default().join(".agent-pets").join("stats.json") }

    /// Missing file means an empty ledger; move a damaged file to `.bad` and start over.
    pub fn load(path: &Path) -> Book {
        let Ok(text) = std::fs::read_to_string(path) else { return Book::default() };
        // a different format version is not a damaged file: recalculate history without saving `.bad`
        #[derive(Deserialize)]
        struct Head { v: u32 }
        if serde_json::from_str::<Head>(&text).is_ok_and(|h| h.v != VERSION) { return Book::default(); }
        match serde_json::from_str::<Book>(&text) {
            Ok(b) => b,
            _ => {
                let _ = std::fs::rename(path, path.with_extension("json.bad"));
                Book::default()
            }
        }
    }

    /// Like `load`, but a read error other than a missing file (e.g. antivirus lock) is an error, not an empty ledger:
    /// saving an empty ledger later would erase history for files that no longer exist (review 0.9, I4).
    pub fn load_checked(path: &Path) -> io::Result<Book> {
        match std::fs::read_to_string(path) {
            Ok(_) => Ok(Book::load(path)),
            Err(e) if e.kind() == io::ErrorKind::NotFound => Ok(Book::default()),
            Err(e) => Err(e),
        }
    }

    /// Atomic write: temporary file and replacement.
    pub fn save(&self, path: &Path) -> io::Result<()> {
        if let Some(d) = path.parent() { std::fs::create_dir_all(d)?; }
        let tmp = path.with_extension("json.tmp");
        {
            use std::io::Write;
            let mut f = std::fs::File::create(&tmp)?;
            f.write_all(&serde_json::to_vec(self).map_err(io::Error::other)?)?;
            // write to disk before replacement: a power loss cannot leave an empty file
            f.sync_all()?;
        }
        std::fs::rename(&tmp, path)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::stats::{Cell, FileEntry};

    #[test]
    fn a_book_survives_save_and_load() {
        let dir = tempfile::tempdir().unwrap();
        let p = dir.path().join("stats.json");
        let mut b = Book::default();
        let mut e = FileEntry::default();
        *e.cell(7, "claude-opus-5-5") = Cell { input: 5, ..Cell::default() };
        e.cursor.offset = 42;
        b.files.insert("a.jsonl".into(), e);
        b.save(&p).unwrap();
        assert!(!dir.path().join("stats.json.tmp").exists(), "write via temporary file and rename");
        let l = Book::load(&p);
        assert_eq!(l.v, VERSION);
        assert_eq!(l.files, b.files);
    }

    #[test]
    fn a_read_error_is_not_an_empty_book() {
        let dir = tempfile::tempdir().unwrap();
        // directory in place of a file: a read error other than "file not found"
        let p = dir.path().join("stats.json");
        std::fs::create_dir(&p).unwrap();
        assert!(Book::load_checked(&p).is_err());
        assert!(p.is_dir() && !dir.path().join("stats.json.bad").exists(), "nothing moved aside");
        let missing = dir.path().join("none.json");
        assert_eq!(Book::load_checked(&missing).unwrap().files.len(), 0);
    }

    #[test]
    fn a_book_of_an_older_format_is_rebuilt_from_the_history() {
        let dir = tempfile::tempdir().unwrap();
        let p = dir.path().join("stats.json");
        std::fs::write(&p, r#"{"v":1,"files":{"a.jsonl":{"cursor":{"offset":5,"size":5,"mtime":0,"last_event":null,"line":1,"skip_until":0,"last_msg":null,"last_total":null,"model":null},"meta":{"agent":"claude","project":"home-folder","sub":false,"started":null},"buckets":{}}}}"#).unwrap();
        let b = Book::load(&p);
        assert_eq!((b.v, b.files.len()), (VERSION, 0));
        assert!(!dir.path().join("stats.json.bad").exists(), "an old format is not a broken file");
    }

    #[test]
    fn a_missing_file_is_an_empty_book() {
        let dir = tempfile::tempdir().unwrap();
        let b = Book::load(&dir.path().join("stats.json"));
        assert_eq!((b.v, b.files.len()), (VERSION, 0));
    }

    #[test]
    fn a_broken_file_is_kept_aside_and_the_book_starts_empty() {
        let dir = tempfile::tempdir().unwrap();
        let p = dir.path().join("stats.json");
        std::fs::write(&p, "{ not json").unwrap();
        let b = Book::load(&p);
        assert_eq!(b.files.len(), 0);
        assert_eq!(std::fs::read_to_string(dir.path().join("stats.json.bad")).unwrap(), "{ not json");
        assert!(!p.exists());
    }
}
