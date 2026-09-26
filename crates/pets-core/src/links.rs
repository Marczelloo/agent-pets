//! Powiązania zadań Agent Routera z sesjami, które je zleciły (`taskId` → id sesji rodzica).
//! Trwałe (`~/.agent-pets/links.json`, tylko id), żeby dziecko wróciło do rodzica po restarcie; wpisy wygasają po 7 dniach.
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::path::{Path, PathBuf};

pub const KEEP_MS: i64 = 7 * 24 * 3_600_000;

pub fn path(home: &Path) -> PathBuf { home.join(".agent-pets").join("links.json") }

#[derive(Default, Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Links {
    /// `taskId` → (id sesji rodzica, czas powiązania ms)
    tasks: BTreeMap<String, (String, i64)>,
    #[serde(skip)]
    dirty: bool,
}

impl Links {
    /// Brak albo uszkodzony plik: brak powiązań (zadania zostają zwykłymi zwierzakami, jak w 0.7).
    pub fn load(path: &Path) -> Links {
        std::fs::read(path).ok().and_then(|b| serde_json::from_slice(&b).ok()).unwrap_or_default()
    }

    /// Zapis atomowy, tylko po zmianie.
    pub fn save_if_dirty(&mut self, path: &Path) -> std::io::Result<()> {
        if !self.dirty { return Ok(()); }
        if let Some(dir) = path.parent() { std::fs::create_dir_all(dir)?; }
        let tmp = path.with_extension("json.tmp");
        std::fs::write(&tmp, serde_json::to_vec(self)?)?;
        std::fs::rename(&tmp, path)?;
        self.dirty = false;
        Ok(())
    }

    pub fn link(&mut self, task: &str, parent: &str, now: i64) {
        if self.tasks.get(task).map(|(p, _)| p.as_str()) == Some(parent) { return; }
        self.tasks.insert(task.to_string(), (parent.to_string(), now));
        self.dirty = true;
    }

    pub fn parent_of(&self, task: &str) -> Option<&str> { self.tasks.get(task).map(|(p, _)| p.as_str()) }

    pub fn prune(&mut self, now: i64) {
        let before = self.tasks.len();
        self.tasks.retain(|_, (_, at)| now - *at <= KEEP_MS);
        self.dirty |= self.tasks.len() != before;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_task_points_at_its_parent() {
        let mut l = Links::default();
        assert_eq!(l.parent_of("t1"), None);
        l.link("t1", "p1", 1_000);
        l.link("t2", "p2", 1_000);
        l.link("t1", "p3", 2_000);
        assert_eq!((l.parent_of("t1"), l.parent_of("t2")), (Some("p3"), Some("p2")), "nowsze zlecenie (np. continue) wygrywa");
    }

    #[test]
    fn links_survive_a_restart_and_hold_only_ids() {
        let d = tempfile::tempdir().unwrap();
        let p = path(d.path());
        let mut l = Links::default();
        l.link("codex-1", "3746a003-5ba1", 5);
        l.save_if_dirty(&p).unwrap();
        let text = std::fs::read_to_string(&p).unwrap();
        assert!(text.contains("codex-1") && text.contains("3746a003-5ba1"));
        let back = Links::load(&p);
        assert_eq!(back.parent_of("codex-1"), Some("3746a003-5ba1"));
        std::fs::remove_file(&p).unwrap();
        let mut again = back;
        again.save_if_dirty(&p).unwrap();
        assert!(!p.exists(), "bez zmian nie ma zapisu");
    }

    #[test]
    fn links_expire_after_7_days() {
        let mut l = Links::default();
        l.link("old", "p", 0);
        l.link("new", "p", KEEP_MS);
        l.prune(KEEP_MS + 1);
        assert_eq!((l.parent_of("old"), l.parent_of("new")), (None, Some("p")));
    }

    #[test]
    fn a_broken_file_means_no_links() {
        let d = tempfile::tempdir().unwrap();
        let p = path(d.path());
        std::fs::create_dir_all(p.parent().unwrap()).unwrap();
        std::fs::write(&p, "{zepsuty").unwrap();
        assert_eq!(Links::load(&p).parent_of("x"), None);
        assert_eq!(Links::load(&d.path().join("brak.json")).parent_of("x"), None);
    }
}
