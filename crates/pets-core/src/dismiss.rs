//! Sesje ukryte ręcznie (✕ w panelu, „Usuń z paska”): ukryte, dopóki nie zrobią czegoś nowego.
//! Trwałe (`~/.agent-pets/dismissed.json`), więc odtworzone po restarcie sesje nie wracają; wpisy wygasają po 7 dniach.
use crate::model::{Session, State};
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::path::{Path, PathBuf};

pub const KEEP_MS: i64 = 7 * 24 * 3_600_000;

pub fn path(home: &Path) -> PathBuf { home.join(".agent-pets").join("dismissed.json") }

/// Stany zdejmowane przez „Usuń nieaktywne”. Błąd zostaje, bo zwykle wymaga reakcji.
pub fn inactive(s: &Session) -> bool { matches!(s.state, State::Idle | State::Done | State::Sleep | State::Ended) }

#[derive(Default, Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Dismissed {
    /// id sesji → czas ukrycia (zegar rdzenia, ms)
    at: BTreeMap<String, i64>,
    #[serde(skip)]
    dirty: bool,
}

impl Dismissed {
    /// Brak albo uszkodzony plik: nic nie jest ukryte.
    pub fn load(path: &Path) -> Dismissed {
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

    pub fn dismiss(&mut self, ids: &[String], now: i64) {
        for id in ids { self.at.insert(id.clone(), now); }
        self.dirty |= !ids.is_empty();
    }

    pub fn undismiss(&mut self, ids: &[String]) {
        for id in ids { self.dirty |= self.at.remove(id).is_some(); }
    }

    /// Zostawia sesje nieukryte; sesja aktywna po ukryciu wraca, a jej wpis znika.
    pub fn filter(&mut self, sessions: Vec<Session>) -> Vec<Session> {
        sessions.into_iter().filter(|s| match self.at.get(&s.id) {
            Some(at) if s.last_activity <= *at => false,
            Some(_) => { self.at.remove(&s.id); self.dirty = true; true }
            None => true,
        }).collect()
    }

    pub fn prune(&mut self, now: i64) {
        let before = self.at.len();
        self.at.retain(|_, at| now - *at <= KEEP_MS);
        self.dirty |= self.at.len() != before;
    }

    pub fn is_empty(&self) -> bool { self.at.is_empty() }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::{Agent, JumpTarget, Origin, Session, State};

    fn sess(id: &str, state: State, last: i64) -> Session {
        Session {
            id: id.into(), agent: Agent::Claude, origin: Origin::Cli, title: id.into(), cwd: String::new(), state,
            tool: None, progress: None, context: None, started_at: 0, last_activity: last, state_since: 0,
            turn_started_at: None, jump: JumpTarget { session_id: id.into(), ..Default::default() }, router_task: None,
        }
    }
    fn ids(v: &[Session]) -> Vec<&str> { v.iter().map(|s| s.id.as_str()).collect() }

    #[test]
    fn a_dismissed_session_stays_hidden_until_it_does_something_new() {
        let mut d = Dismissed::default();
        d.dismiss(&["a".into()], 1_000);
        assert_eq!(ids(&d.filter(vec![sess("a", State::Idle, 1_000), sess("b", State::Working, 5)])), vec!["b"]);
        assert!(!d.is_empty());
        let back = d.filter(vec![sess("a", State::NeedsYou, 1_001)]);
        assert_eq!(ids(&back), vec!["a"]);
        assert!(d.is_empty(), "the entry goes away once the session is back");
    }

    #[test]
    fn undo_brings_it_back_at_once() {
        let mut d = Dismissed::default();
        d.dismiss(&["a".into(), "b".into()], 100);
        d.undismiss(&["a".into()]);
        assert_eq!(ids(&d.filter(vec![sess("a", State::Idle, 50), sess("b", State::Idle, 50)])), vec!["a"]);
    }

    #[test]
    fn entries_expire_after_seven_days() {
        let mut d = Dismissed::default();
        d.dismiss(&["old".into()], 0);
        d.dismiss(&["new".into()], KEEP_MS - 6 * 24 * 3_600_000);
        d.prune(KEEP_MS + 1);
        assert_eq!(ids(&d.filter(vec![sess("old", State::Sleep, 0), sess("new", State::Sleep, 0)])), vec!["old"]);
    }

    #[test]
    fn survives_a_restart_and_a_broken_file_means_nothing_is_hidden() {
        let dir = tempfile::tempdir().unwrap();
        let p = path(dir.path());
        let mut d = Dismissed::default();
        d.dismiss(&["a".into()], 2_000);
        d.save_if_dirty(&p).unwrap();
        assert!(!p.with_extension("json.tmp").exists());
        let mut again = Dismissed::load(&p);
        // sesja odtworzona z historii ma ten sam czas ostatniej aktywności
        assert!(again.filter(vec![sess("a", State::Idle, 1_500)]).is_empty());
        std::fs::write(&p, "{bad").unwrap();
        assert!(Dismissed::load(&p).is_empty());
    }

    #[test]
    fn saving_only_happens_after_a_change() {
        let dir = tempfile::tempdir().unwrap();
        let p = path(dir.path());
        let mut d = Dismissed::default();
        d.save_if_dirty(&p).unwrap();
        assert!(!p.exists());
        d.dismiss(&["a".into()], 1);
        d.save_if_dirty(&p).unwrap();
        assert!(p.exists());
    }

    #[test]
    fn remove_inactive_takes_idle_done_sleep_and_ended_only() {
        let yes = [State::Idle, State::Done, State::Sleep, State::Ended];
        let no = [State::Thinking, State::Working, State::NeedsYou, State::Error, State::Compacting];
        for s in yes { assert!(inactive(&sess("x", s, 0)), "{s:?}"); }
        for s in no { assert!(!inactive(&sess("x", s, 0)), "{s:?}"); }
    }
}
