//! Music in Windows: playback sessions from GSMTC (`GlobalSystemMediaTransportControlsSessionManager`), the source
//! shown by the media tile near the volume control: Spotify, Apple Music, browsers, VLC… No track titles:
//! the stage needs only "playing / not playing" and the app name.
use serde::Serialize;
use std::sync::Mutex;

#[derive(Serialize, Clone, Debug, Default, PartialEq, Eq)]
pub struct Media {
    pub playing: bool,
    /// AUMID of the playing app (e.g. `Spotify.exe`, `AppleInc.AppleMusicWin_…!App`).
    pub app: Option<String>,
}

#[derive(Default)]
pub struct MediaState(pub Mutex<Media>);

/// From sessions `(app, playing?)`: the first playing app wins.
pub fn pick(sessions: &[(String, bool)]) -> Media {
    match sessions.iter().find(|(_, on)| *on) {
        Some((app, _)) => Media { playing: true, app: Some(app.clone()) },
        None => Media::default(),
    }
}

/// Playback sessions: `(AUMID, playing?)`. A WinRT error (e.g. service unavailable) means no sessions.
pub fn sessions() -> Vec<(String, bool)> { read_sessions().unwrap_or_default() }

#[cfg(windows)]
fn read_sessions() -> windows::core::Result<Vec<(String, bool)>> {
    use windows::Media::Control::{
        GlobalSystemMediaTransportControlsSessionManager as Manager,
        GlobalSystemMediaTransportControlsSessionPlaybackStatus as Status,
    };
    thread_local! {
        // reuse the manager from the first query instead of reconnecting every 2 s; reconnect after an error
        static MGR: std::cell::RefCell<Option<Manager>> = const { std::cell::RefCell::new(None) };
    }
    let mgr = match MGR.with_borrow(|m| m.clone()) {
        Some(m) => m,
        None => {
            let m = Manager::RequestAsync()?.get()?;
            MGR.set(Some(m.clone()));
            m
        }
    };
    let list = mgr.GetSessions().inspect_err(|_| MGR.set(None))?;
    let mut out = Vec::new();
    for s in list {
        let app = s.SourceAppUserModelId().map(|h| h.to_string()).unwrap_or_default();
        let on = s.GetPlaybackInfo().and_then(|i| i.PlaybackStatus()).map(|st| st == Status::Playing).unwrap_or(false);
        out.push((app, on));
    }
    Ok(out)
}

#[cfg(not(windows))]
fn read_sessions() -> Result<Vec<(String, bool)>, ()> { Ok(Vec::new()) }

/// Compute media state and emit `pets://media` when it changes. Disabled in settings = nothing is playing.
pub fn refresh_media(app: &tauri::AppHandle) {
    use tauri::{Emitter, Manager};
    let on = app.state::<crate::settings::SettingsState>().get().pets.react_to_media;
    let now = if on { pick(&sessions()) } else { Media::default() };
    let state = app.state::<MediaState>();
    let mut cur = state.0.lock().unwrap();
    if *cur != now {
        *cur = now.clone();
        drop(cur);
        let _ = app.emit("pets://media", now);
    }
}

/// Poll playback state every 2 s (GSMTC query is one WinRT call, without per-session events).
pub fn watch_media(app: tauri::AppHandle) {
    std::thread::spawn(move || loop {
        refresh_media(&app);
        std::thread::sleep(std::time::Duration::from_secs(2));
    });
}

#[tauri::command]
pub fn media_get(state: tauri::State<MediaState>) -> Media { state.0.lock().unwrap().clone() }

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_first_playing_session_wins_and_paused_ones_do_not_count() {
        assert_eq!(pick(&[]), Media::default());
        assert_eq!(pick(&[("chrome".into(), false)]), Media::default());
        assert_eq!(
            pick(&[("chrome".into(), false), ("Spotify.exe".into(), true), ("vlc".into(), true)]),
            Media { playing: true, app: Some("Spotify.exe".into()) }
        );
    }

    /// Live: `cargo test -p agent-pets live_sessions -- --ignored --nocapture` while music is playing.
    #[test]
    #[ignore]
    fn live_sessions() { println!("{:?} -> {:?}", read_sessions(), pick(&sessions())); }
}
