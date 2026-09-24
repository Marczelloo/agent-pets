//! Wątek rdzenia: zdarzenia z `pets-core` → migawka stanu dla UI (`pets://snapshot`).
use pets_core::model::{Limit, Session};
use pets_core::replay::Replay;
use pets_core::runtime::{Runtime, RuntimeConfig};
use pets_core::store::{Store, Timing};
use pets_core::time::now_ms;
use serde::Serialize;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter};

#[derive(Serialize, Clone, Default, Debug, PartialEq)]
pub struct Snapshot {
    pub sessions: Vec<Session>,
    pub limits: Vec<Limit>,
    /// zegar rdzenia (ms); w trybie odtwarzania różni się od zegara ściennego
    pub now: i64,
}

pub type Shared = Arc<Mutex<Snapshot>>;

pub fn snapshot_of(store: &Store, now: i64) -> Snapshot {
    Snapshot { sessions: store.sessions().into_iter().cloned().collect(), limits: store.limits().to_vec(), now }
}

pub enum Mode { Live, Replay { path: PathBuf, speed: f64 } }

impl Mode {
    pub fn from_env() -> Mode {
        match std::env::var_os("AGENT_PETS_REPLAY") {
            Some(p) => Mode::Replay {
                path: p.into(),
                speed: std::env::var("AGENT_PETS_REPLAY_SPEED").ok().and_then(|s| s.parse().ok()).unwrap_or(1.0),
            },
            None => Mode::Live,
        }
    }
}

pub fn spawn(app: AppHandle, shared: Shared, mode: Mode) {
    std::thread::spawn(move || {
        let publish = |store: &Store, now: i64| {
            let s = snapshot_of(store, now);
            *shared.lock().unwrap() = s.clone();
            let _ = app.emit("pets://snapshot", s);
        };
        let result = match mode {
            Mode::Live => live(&publish),
            Mode::Replay { path, speed } => replay(&path, speed, &publish),
        };
        if let Err(e) = result { eprintln!("agent-pets: rdzeń danych zatrzymany: {e:#}"); }
    });
}

fn live(publish: &dyn Fn(&Store, i64)) -> anyhow::Result<()> {
    let mut rt = Runtime::start(RuntimeConfig::from_env()?)?;
    publish(rt.store(), now_ms());
    loop {
        let now = now_ms();
        if rt.step(now) { publish(rt.store(), now); }
        std::thread::sleep(Duration::from_millis(250));
    }
}

fn replay(path: &Path, speed: f64, publish: &dyn Fn(&Store, i64)) -> anyhow::Result<()> {
    let mut rp = Replay::load(path, speed)?;
    let mut store = Store::new(Timing::default());
    while let Some(d) = rp.next_delay_ms() {
        std::thread::sleep(Duration::from_millis(d));
        if let Some(clock) = rp.apply_next(&mut store) { publish(&store, clock); }
    }
    // Po nagraniu zegar płynie dalej w czasie rzeczywistym, więc działają progi (done → idle itd.).
    let end = Instant::now();
    loop {
        std::thread::sleep(Duration::from_millis(250));
        let now = rp.clock() + end.elapsed().as_millis() as i64;
        if !store.tick(now, &|_| true).is_empty() { publish(&store, now); }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use pets_core::model::*;
    use pets_core::replay::Replay;
    use pets_core::store::{Store, Timing};
    use std::path::Path;

    #[test]
    fn snapshot_serializes_like_the_ts_types() {
        let mut store = Store::new(Timing::default());
        let mut e = Event::new(Source::Claude, "s1", Kind::ToolStart, 1_000);
        e.tool = Some(Tool::Edit);
        e.data.progress = Some(Progress { done: 1, total: 4 });
        store.apply(&e);
        let v = serde_json::to_value(snapshot_of(&store, 2_000)).unwrap();
        assert_eq!(v["now"], 2_000);
        let s = &v["sessions"][0];
        assert_eq!(s["state"], "working");
        assert_eq!(s["tool"], "edit");
        assert_eq!(s["progress"]["total"], 4);
        assert_eq!(s["started_at"], 1_000);
        assert!(s["context"].is_null());
        assert!(v["limits"].as_array().unwrap().is_empty());
    }

    #[test]
    fn demo_recording_yields_seven_sessions_and_limits() {
        let path = concat!(env!("CARGO_MANIFEST_DIR"), "/../demo/many-sessions.jsonl");
        let mut rp = Replay::load(Path::new(path), 1000.0).unwrap();
        let mut store = Store::new(Timing::default());
        while rp.apply_next(&mut store).is_some() {}
        let snap = snapshot_of(&store, rp.clock());
        assert_eq!(snap.sessions.len(), 7);
        assert_eq!(snap.limits.len(), 4);
        let state = |id: &str| store.session(id).map(|s| s.state);
        assert_eq!(state("d5"), Some(State::NeedsYou));
        assert_eq!(state("d6"), Some(State::Error));
        assert_eq!(state("d7"), Some(State::Done));
    }
}
