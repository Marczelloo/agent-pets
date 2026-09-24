//! Odtwarzanie nagranych zdarzeń: zegar idzie tylko do przodu, a pojedyncza przerwa trwa najwyżej 250 ms,
//! żeby długie ciche okresy w nagraniu nie blokowały odtwarzania.
use crate::model::Event;
use crate::store::Store;
use std::collections::VecDeque;
use std::io::BufRead;
use std::path::Path;

pub struct Replay {
    events: VecDeque<Event>,
    clock: i64,
    speed: f64,
}

impl Replay {
    pub const MAX_GAP_MS: u64 = 250;

    pub fn new(events: Vec<Event>, speed: f64) -> Replay {
        let clock = events.first().map(|e| e.ts).unwrap_or(0);
        Replay { events: events.into(), clock, speed: if speed > 0.0 { speed } else { 1.0 } }
    }

    pub fn load(path: &Path, speed: f64) -> anyhow::Result<Replay> {
        let events = std::io::BufReader::new(std::fs::File::open(path)?).lines()
            .map_while(Result::ok).filter_map(|l| serde_json::from_str(&l).ok()).collect();
        Ok(Replay::new(events, speed))
    }

    pub fn clock(&self) -> i64 { self.clock }
    pub fn is_empty(&self) -> bool { self.events.is_empty() }

    /// Ile milisekund czasu rzeczywistego odczekać przed następnym zdarzeniem.
    pub fn next_delay_ms(&self) -> Option<u64> {
        let e = self.events.front()?;
        let gap = (e.ts - self.clock).max(0);
        Some(((gap as f64 / self.speed) as u64).min(Self::MAX_GAP_MS))
    }

    /// Stosuje następne zdarzenie i przesuwa zegar `Store`. Zwraca zegar po zdarzeniu.
    pub fn apply_next(&mut self, store: &mut Store) -> Option<i64> {
        let e = self.events.pop_front()?;
        self.clock = self.clock.max(e.ts);
        store.apply(&e);
        store.tick(self.clock, &|_| true);
        Some(self.clock)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::{Event, Kind, Source};
    use crate::store::{Store, Timing};

    fn ev(id: &str, kind: Kind, ts: i64) -> Event { Event::new(Source::Claude, id, kind, ts) }

    #[test]
    fn delays_are_scaled_capped_and_never_negative() {
        let mut r = Replay::new(vec![
            ev("a", Kind::SessionStart, 0),
            ev("a", Kind::Prompt, 10_000),
            ev("b", Kind::SessionStart, 5_000),
            ev("a", Kind::TurnEnd, 12_000),
        ], 10.0);
        let mut store = Store::new(Timing::default());
        assert_eq!(r.next_delay_ms(), Some(0));
        assert_eq!(r.apply_next(&mut store), Some(0));
        assert_eq!(r.next_delay_ms(), Some(250)); // 10 s / 10 = 1000 ms, przycięte do 250
        assert_eq!(r.apply_next(&mut store), Some(10_000));
        assert_eq!(r.next_delay_ms(), Some(0)); // starsze zdarzenie nie cofa zegara
        assert_eq!(r.apply_next(&mut store), Some(10_000));
        assert_eq!(r.next_delay_ms(), Some(200));
        assert_eq!(r.apply_next(&mut store), Some(12_000));
        assert!(r.is_empty());
        assert_eq!(r.next_delay_ms(), None);
        assert!(store.session("a").is_some() && store.session("b").is_some());
    }

    #[test]
    fn non_positive_speed_falls_back_to_real_time() {
        let mut r = Replay::new(vec![ev("a", Kind::SessionStart, 0), ev("a", Kind::Prompt, 100)], 0.0);
        let mut s = Store::new(Timing::default());
        r.apply_next(&mut s);
        assert_eq!(r.next_delay_ms(), Some(100));
    }
}
