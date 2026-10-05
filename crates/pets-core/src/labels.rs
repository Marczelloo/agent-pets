//! The user's own session names and pins (⋯ menu in the panel), applied to the snapshot so the name shows everywhere.
//! Persistent (`~/.agent-pets/labels.json`); entries of sessions not seen for 30 days expire.
use crate::model::Session;
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::path::{Path, PathBuf};

pub const KEEP_MS: i64 = 30 * 24 * 3_600_000;
/// Longest custom name, in characters.
pub const MAX_NAME: usize = 80;
/// `touched` is refreshed at most this often, so the file is not rewritten every 250 ms.
const TOUCH_EVERY_MS: i64 = 3_600_000;

pub fn path(home: &Path) -> PathBuf { home.join(".agent-pets").join("labels.json") }

#[derive(Default, Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Label {
    #[serde(default)]
    pub name: Option<String>,
    #[serde(default)]
    pub pinned: bool,
    /// Last time the session was seen or the label changed (core clock, ms).
    #[serde(default)]
    pub touched: i64,
}

#[derive(Default, Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Labels {
    by_id: BTreeMap<String, Label>,
    #[serde(skip)]
    dirty: bool,
}

impl Labels {
    /// Missing or damaged file: no labels.
    pub fn load(path: &Path) -> Labels {
        std::fs::read(path).ok().and_then(|b| serde_json::from_slice(&b).ok()).unwrap_or_default()
    }

    /// Atomic write, only after a change.
    pub fn save_if_dirty(&mut self, path: &Path) -> std::io::Result<()> {
        if !self.dirty { return Ok(()); }
        if let Some(dir) = path.parent() { std::fs::create_dir_all(dir)?; }
        let tmp = path.with_extension("json.tmp");
        std::fs::write(&tmp, serde_json::to_vec(self)?)?;
        std::fs::rename(&tmp, path)?;
        self.dirty = false;
        Ok(())
    }

    /// Trimmed and cut to 80 characters; empty or `None` clears the name.
    pub fn rename(&mut self, id: &str, name: Option<String>, now: i64) {
        let name = name.map(|n| n.trim().chars().take(MAX_NAME).collect::<String>().trim_end().to_string()).filter(|n| !n.is_empty());
        self.edit(id, now, |l| l.name = name);
    }

    pub fn pin(&mut self, id: &str, pinned: bool, now: i64) { self.edit(id, now, |l| l.pinned = pinned); }

    /// An entry with no name and no pin is removed, so the file holds only real labels.
    fn edit(&mut self, id: &str, now: i64, f: impl FnOnce(&mut Label)) {
        let before = self.by_id.get(id).cloned();
        let mut l = before.clone().unwrap_or_default();
        f(&mut l);
        if l.name.is_none() && !l.pinned { if before.is_none() { return; } self.by_id.remove(id); }
        else if Some(&l) != before.as_ref() { l.touched = now; self.by_id.insert(id.to_string(), l); }
        else { return; }
        self.dirty = true;
    }

    /// Custom name replaces the title (and sets `renamed`), `pinned` follows the pin.
    pub fn apply(&mut self, sessions: Vec<Session>, now: i64) -> Vec<Session> {
        sessions.into_iter().map(|mut s| {
            if let Some(l) = self.by_id.get_mut(&s.id) {
                if let Some(n) = &l.name { s.title = n.clone(); s.renamed = true; }
                s.pinned = l.pinned;
                if now - l.touched >= TOUCH_EVERY_MS { l.touched = now; self.dirty = true; }
            }
            s
        }).collect()
    }

    pub fn prune(&mut self, now: i64) {
        let before = self.by_id.len();
        self.by_id.retain(|_, l| now - l.touched <= KEEP_MS);
        self.dirty |= self.by_id.len() != before;
    }

    pub fn is_empty(&self) -> bool { self.by_id.is_empty() }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::{Agent, JumpTarget, Origin, State};

    fn sess(id: &str, title: &str) -> Session {
        Session {
            id: id.into(), agent: Agent::Claude, origin: Origin::Cli, title: title.into(), cwd: String::new(), state: State::Idle,
            tool: None, progress: None, context: None, started_at: 0, last_activity: 0, state_since: 0,
            turn_started_at: None, jump: JumpTarget { session_id: id.into(), ..Default::default() }, router_task: None,
            parent: None, sub: None, action: None, question: None, waits_on_child: false, model: None, agent_name: None, usage: None,
            pinned: false, renamed: false,
        }
    }
    fn one(l: &mut Labels, id: &str, now: i64) -> Session { l.apply(vec![sess(id, "auto")], now).remove(0) }

    #[test]
    fn rename_trims_and_an_empty_name_clears_it() {
        let mut l = Labels::default();
        l.rename("a", Some("  My work \n".into()), 10);
        assert_eq!(one(&mut l, "a", 10).title, "My work");
        assert!(one(&mut l, "a", 10).renamed);
        l.rename("a", Some("   ".into()), 20);
        assert_eq!(one(&mut l, "a", 20).title, "auto");
        assert!(!one(&mut l, "a", 20).renamed);
        assert!(l.is_empty(), "no name and no pin leaves no entry");
        l.rename("a", Some("x".into()), 30);
        l.rename("a", None, 40);
        assert!(l.is_empty());
    }

    #[test]
    fn a_name_is_cut_to_eighty_characters_on_a_char_boundary() {
        let mut l = Labels::default();
        l.rename("a", Some("ż".repeat(100)), 0);
        let t = one(&mut l, "a", 0).title;
        assert_eq!(t.chars().count(), 80);
        assert!(t.chars().all(|c| c == 'ż'));
    }

    #[test]
    fn pinning_and_unpinning() {
        let mut l = Labels::default();
        l.pin("a", true, 0);
        let s = one(&mut l, "a", 0);
        assert!(s.pinned);
        assert_eq!(s.title, "auto", "a pin alone keeps the title");
        l.pin("a", false, 1);
        assert!(!one(&mut l, "a", 1).pinned);
        assert!(l.is_empty());
    }

    #[test]
    fn a_named_session_stays_when_unpinned_and_a_pinned_one_when_the_name_is_cleared() {
        let mut l = Labels::default();
        l.rename("a", Some("N".into()), 0);
        l.pin("a", true, 0);
        l.pin("a", false, 1);
        assert!(!l.is_empty());
        l.pin("a", true, 2);
        l.rename("a", None, 3);
        let s = one(&mut l, "a", 3);
        assert!(s.pinned && s.title == "auto");
    }

    #[test]
    fn other_sessions_are_untouched() {
        let mut l = Labels::default();
        l.rename("a", Some("N".into()), 0);
        let out = l.apply(vec![sess("a", "t"), sess("b", "u")], 0);
        assert_eq!((out[0].title.as_str(), out[1].title.as_str(), out[1].pinned), ("N", "u", false));
    }

    #[test]
    fn entries_expire_after_thirty_days_unless_the_session_keeps_showing_up() {
        let mut l = Labels::default();
        l.rename("old", Some("o".into()), 0);
        l.rename("seen", Some("s".into()), 0);
        let half = KEEP_MS / 2;
        one(&mut l, "seen", half);
        l.prune(KEEP_MS + 1);
        let out = l.apply(vec![sess("old", "t"), sess("seen", "t")], KEEP_MS + 1);
        assert_eq!((out[0].title.as_str(), out[1].title.as_str()), ("t", "s"));
    }

    #[test]
    fn survives_a_restart_and_a_broken_file_means_no_labels() {
        let dir = tempfile::tempdir().unwrap();
        let p = path(dir.path());
        let mut l = Labels::default();
        l.rename("a", Some("N".into()), 5);
        l.pin("a", true, 5);
        l.save_if_dirty(&p).unwrap();
        assert!(!p.with_extension("json.tmp").exists());
        let mut again = Labels::load(&p);
        let s = one(&mut again, "a", 5);
        assert!(s.pinned && s.title == "N");
        std::fs::write(&p, "{bad").unwrap();
        assert!(Labels::load(&p).is_empty());
    }

    #[test]
    fn saving_only_happens_after_a_change() {
        let dir = tempfile::tempdir().unwrap();
        let p = path(dir.path());
        let mut l = Labels::default();
        l.save_if_dirty(&p).unwrap();
        assert!(!p.exists());
        l.rename("a", Some("N".into()), 1);
        l.save_if_dirty(&p).unwrap();
        assert!(p.exists());
    }

    #[test]
    fn seeing_a_session_dirties_the_file_at_most_once_an_hour() {
        let mut l = Labels::default();
        l.rename("a", Some("N".into()), 0);
        l.dirty = false;
        one(&mut l, "a", 1_000);
        one(&mut l, "a", TOUCH_EVERY_MS - 1);
        assert!(!l.dirty, "frequent passes do not write");
        one(&mut l, "a", TOUCH_EVERY_MS);
        assert!(l.dirty);
        l.dirty = false;
        one(&mut l, "a", TOUCH_EVERY_MS + 1_000);
        assert!(!l.dirty);
    }

    #[test]
    fn setting_the_same_value_again_does_not_dirty() {
        let mut l = Labels::default();
        l.pin("a", true, 0);
        l.dirty = false;
        l.pin("a", true, 5);
        l.pin("b", false, 5);
        assert!(!l.dirty);
    }
}
