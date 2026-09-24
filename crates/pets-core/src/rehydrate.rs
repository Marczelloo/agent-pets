use std::path::{Path, PathBuf};
use std::time::{Duration, SystemTime};

/// Pliki `*.jsonl` zmodyfikowane w ostatnim `max_age`, rekurencyjnie, od najstarszego.
pub fn recent_files(root: &Path, max_age: Duration) -> Vec<PathBuf> {
    let now = SystemTime::now();
    let mut out: Vec<(SystemTime, PathBuf)> = Vec::new();
    let mut stack = vec![root.to_path_buf()];
    while let Some(dir) = stack.pop() {
        let Ok(rd) = std::fs::read_dir(&dir) else { continue };
        for e in rd.flatten() {
            let p = e.path();
            let Ok(md) = e.metadata() else { continue };
            if md.is_dir() { stack.push(p); continue; }
            if p.extension().and_then(|x| x.to_str()) != Some("jsonl") { continue; }
            if let Ok(m) = md.modified() {
                if now.duration_since(m).map(|a| a <= max_age).unwrap_or(true) { out.push((m, p)); }
            }
        }
    }
    out.sort();
    out.into_iter().map(|(_, p)| p).collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn finds_recent_jsonl_recursively() {
        let dir = tempfile::tempdir().unwrap();
        let sub = dir.path().join("2026").join("09");
        std::fs::create_dir_all(&sub).unwrap();
        std::fs::write(sub.join("a.jsonl"), "x\n").unwrap();
        std::fs::write(sub.join("b.txt"), "x\n").unwrap();
        let found = recent_files(dir.path(), Duration::from_secs(60));
        assert_eq!(found.len(), 1);
        assert!(recent_files(&dir.path().join("missing"), Duration::from_secs(60)).is_empty());
    }
}
