use std::fs::File;
use std::io::{Read, Seek, SeekFrom};
use std::path::PathBuf;

pub struct TailReader {
    path: PathBuf,
    offset: u64,
    partial: String,
}

impl TailReader {
    pub fn new(path: impl Into<PathBuf>) -> Self {
        TailReader { path: path.into(), offset: 0, partial: String::new() }
    }

    pub fn from_end(path: impl Into<PathBuf>) -> std::io::Result<Self> {
        let path = path.into();
        let offset = std::fs::metadata(&path)?.len();
        Ok(TailReader { path, offset, partial: String::new() })
    }

    pub fn path(&self) -> &std::path::Path { &self.path }

    pub fn read_lines(&mut self) -> std::io::Result<Vec<String>> {
        let len = std::fs::metadata(&self.path)?.len();
        if len < self.offset {
            self.offset = 0;
            self.partial.clear();
        }
        if len == self.offset { return Ok(Vec::new()); }
        let mut f = File::open(&self.path)?;
        f.seek(SeekFrom::Start(self.offset))?;
        let mut buf = Vec::with_capacity((len - self.offset) as usize);
        f.take(len - self.offset).read_to_end(&mut buf)?;
        self.offset += buf.len() as u64;
        let mut text = std::mem::take(&mut self.partial);
        text.push_str(&String::from_utf8_lossy(&buf));
        let mut lines: Vec<String> = text.split('\n').map(|l| l.trim_end_matches('\r').to_string()).collect();
        self.partial = lines.pop().unwrap_or_default();
        Ok(lines.into_iter().filter(|l| !l.is_empty()).collect())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    #[test]
    fn reads_only_complete_lines_and_resumes() {
        let dir = tempfile::tempdir().unwrap();
        let p = dir.path().join("a.jsonl");
        let mut f = File::create(&p).unwrap();
        write!(f, "one\r\ntwo\nthr").unwrap();
        let mut t = TailReader::new(&p);
        assert_eq!(t.read_lines().unwrap(), vec!["one", "two"]);
        write!(f, "ee\n").unwrap();
        assert_eq!(t.read_lines().unwrap(), vec!["three"]);
        assert!(t.read_lines().unwrap().is_empty());
    }

    #[test]
    fn from_end_skips_existing_content() {
        let dir = tempfile::tempdir().unwrap();
        let p = dir.path().join("b.jsonl");
        std::fs::write(&p, "old\n").unwrap();
        let mut t = TailReader::from_end(&p).unwrap();
        std::fs::OpenOptions::new().append(true).open(&p).unwrap().write_all(b"new\n").unwrap();
        assert_eq!(t.read_lines().unwrap(), vec!["new"]);
    }

    #[test]
    fn truncation_resets_offset() {
        let dir = tempfile::tempdir().unwrap();
        let p = dir.path().join("c.jsonl");
        std::fs::write(&p, "aaaaaaaa\nbbbbbbbb\n").unwrap();
        let mut t = TailReader::new(&p);
        t.read_lines().unwrap();
        std::fs::write(&p, "x\n").unwrap();
        assert_eq!(t.read_lines().unwrap(), vec!["x"]);
    }
}
