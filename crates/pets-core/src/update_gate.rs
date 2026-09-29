//! When an automatic update may be installed: only during a quiet period.
use crate::model::State;

/// Required uninterrupted quiet time before installation.
pub const CALM_MS: i64 = 120_000;

/// Busy: an agent is thinking, working, compacting, or waiting for the user; a full-screen game or presentation;
/// or the panel or settings window is open.
pub fn busy(states: &[State], fullscreen: bool, ui_open: bool) -> bool {
    fullscreen || ui_open
        || states.iter().any(|s| matches!(s, State::Thinking | State::Working | State::Compacting | State::NeedsYou))
}

/// Quiet timer: `true` when nothing has been busy for `CALM_MS`.
#[derive(Default, Debug)]
pub struct Calm { since: Option<i64> }

impl Calm {
    pub fn observe(&mut self, busy: bool, now: i64) -> bool {
        if busy { self.since = None; return false; }
        now - *self.since.get_or_insert(now) >= CALM_MS
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn working_asking_or_compacting_sessions_block_the_install() {
        for s in [State::Thinking, State::Working, State::Compacting, State::NeedsYou] {
            assert!(busy(&[State::Idle, s], false, false), "{s:?}");
        }
        for s in [State::Done, State::Idle, State::Sleep, State::Ended, State::Error] {
            assert!(!busy(&[s], false, false), "{s:?}");
        }
        assert!(!busy(&[], false, false));
    }

    #[test]
    fn a_fullscreen_app_or_an_open_window_blocks_the_install() {
        assert!(busy(&[], true, false));
        assert!(busy(&[], false, true));
    }

    #[test]
    fn two_quiet_minutes_are_needed_and_any_interruption_restarts_the_count() {
        let mut c = Calm::default();
        assert!(!c.observe(false, 1_000));
        assert!(!c.observe(false, 1_000 + CALM_MS - 1));
        assert!(c.observe(false, 1_000 + CALM_MS));
        assert!(!c.observe(true, 1_000 + CALM_MS + 10));
        let back = 1_000 + CALM_MS + 20;
        assert!(!c.observe(false, back));
        assert!(!c.observe(false, back + CALM_MS - 1));
        assert!(c.observe(false, back + CALM_MS));
    }
}
