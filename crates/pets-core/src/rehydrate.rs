use std::path::{Path, PathBuf};
use std::time::{Duration, SystemTime};

/// Transkrypt Claude'a nie ma znacznika końca sesji, więc odtwarzamy tylko sesje z rejestru
/// żywych (`claude::registry`). Rollouty Codexa mają `task_complete` i wracają zawsze.
pub fn keep_for_rehydration(files: &[PathBuf], live_claude: &std::collections::HashSet<String>) -> Vec<PathBuf> {
    use crate::watch::{kind_of, FileKind};
    files.iter().filter(|p| match kind_of(p) {
        Some(FileKind::ClaudeTranscript) => p.file_stem().and_then(|s| s.to_str()).map(|s| live_claude.contains(s)).unwrap_or(false),
        Some(FileKind::CodexRollout) => true,
        None => false,
    }).cloned().collect()
}

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
    fn claude_transcripts_only_for_live_sessions_codex_always() {
        let files = vec![
            PathBuf::from(r"C:\u\.claude\projects\p\live-1.jsonl"),
            PathBuf::from(r"C:\u\.claude\projects\p\dead-2.jsonl"),
            PathBuf::from(r"C:\u\.codex\sessions\2026\09\24\rollout-x.jsonl"),
        ];
        let live: std::collections::HashSet<String> = ["live-1".to_string()].into();
        let kept = keep_for_rehydration(&files, &live);
        assert_eq!(kept, vec![files[0].clone(), files[2].clone()]);
    }
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
