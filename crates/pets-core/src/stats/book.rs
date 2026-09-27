use std::collections::BTreeMap;
use std::io;
use std::path::{Path, PathBuf};
use serde::{Deserialize, Serialize};
use super::FileEntry;

/// Księga statystyk (`~/.agent-pets/stats.json`): wpis na każdy przeczytany plik historii.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct Book { pub v: u32, pub files: BTreeMap<String, FileEntry> }

impl Default for Book { fn default() -> Self { Book { v: 1, files: BTreeMap::new() } } }

impl Book {
    pub fn default_path() -> PathBuf { dirs::home_dir().unwrap_or_default().join(".agent-pets").join("stats.json") }

    /// Brak pliku to pusta księga; uszkodzony plik odkładamy jako `.bad` i zaczynamy od nowa.
    pub fn load(path: &Path) -> Book {
        let Ok(text) = std::fs::read_to_string(path) else { return Book::default() };
        match serde_json::from_str::<Book>(&text) {
            Ok(b) if b.v == 1 => b,
            _ => {
                let _ = std::fs::rename(path, path.with_extension("json.bad"));
                Book::default()
            }
        }
    }

    /// Jak `load`, ale błąd odczytu inny niż brak pliku (np. blokada antywirusa) jest błędem, a nie pustą księgą:
    /// pusta księga zapisana potem na dysk skasowałaby historię plików, których już nie ma (przegląd 0.9, I4).
    pub fn load_checked(path: &Path) -> io::Result<Book> {
        match std::fs::read_to_string(path) {
            Ok(_) => Ok(Book::load(path)),
            Err(e) if e.kind() == io::ErrorKind::NotFound => Ok(Book::default()),
            Err(e) => Err(e),
        }
    }

    /// Zapis atomowy: plik tymczasowy i zamiana.
    pub fn save(&self, path: &Path) -> io::Result<()> {
        if let Some(d) = path.parent() { std::fs::create_dir_all(d)?; }
        let tmp = path.with_extension("json.tmp");
        {
            use std::io::Write;
            let mut f = std::fs::File::create(&tmp)?;
            f.write_all(&serde_json::to_vec(self).map_err(io::Error::other)?)?;
            // na dysku przed zamianą: po zaniku zasilania nie zostaje pusty plik
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
        assert!(!dir.path().join("stats.json.tmp").exists(), "zapis przez plik tymczasowy i rename");
        let l = Book::load(&p);
        assert_eq!(l.v, 1);
        assert_eq!(l.files, b.files);
    }

    #[test]
    fn a_read_error_is_not_an_empty_book() {
        let dir = tempfile::tempdir().unwrap();
        // katalog w miejscu pliku: błąd odczytu inny niż „brak pliku”
        let p = dir.path().join("stats.json");
        std::fs::create_dir(&p).unwrap();
        assert!(Book::load_checked(&p).is_err());
        assert!(p.is_dir() && !dir.path().join("stats.json.bad").exists(), "nothing moved aside");
        let missing = dir.path().join("none.json");
        assert_eq!(Book::load_checked(&missing).unwrap().files.len(), 0);
    }

    #[test]
    fn a_missing_file_is_an_empty_book() {
        let dir = tempfile::tempdir().unwrap();
        let b = Book::load(&dir.path().join("stats.json"));
        assert_eq!((b.v, b.files.len()), (1, 0));
    }

    #[test]
    fn a_broken_file_is_kept_aside_and_the_book_starts_empty() {
        let dir = tempfile::tempdir().unwrap();
        let p = dir.path().join("stats.json");
        std::fs::write(&p, "{ nie json").unwrap();
        let b = Book::load(&p);
        assert_eq!(b.files.len(), 0);
        assert_eq!(std::fs::read_to_string(dir.path().join("stats.json.bad")).unwrap(), "{ nie json");
        assert!(!p.exists());
    }
}
