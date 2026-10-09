//! Music: on Windows playback sessions from GSMTC (`GlobalSystemMediaTransportControlsSessionManager`), the source
//! shown by the media tile near the volume control: Spotify, Apple Music, browsers, VLC… On Linux, the same
//! information from MPRIS over D-Bus (`org.mpris.MediaPlayer2.*`). No track titles:
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

/// Linux: MPRIS players on the session bus; the "app" is the bus name suffix (`firefox`, `spotify`…).
/// A D-Bus error (no session bus, player gone mid-query) means no sessions from that player.
#[cfg(not(windows))]
fn read_sessions() -> Result<Vec<(String, bool)>, ()> {
    use zbus::blocking::Connection;
    const PREFIX: &str = "org.mpris.MediaPlayer2.";
    thread_local! {
        // reuse the connection instead of reconnecting every 2 s; reconnect after an error
        static BUS: std::cell::RefCell<Option<Connection>> = const { std::cell::RefCell::new(None) };
    }
    let conn = match BUS.with_borrow(std::clone::Clone::clone) {
        Some(c) => c,
        None => {
            let c = Connection::session().map_err(|_| ())?;
            BUS.set(Some(c.clone()));
            c
        }
    };
    let names: Result<Vec<String>, ()> = conn.call_method(Some("org.freedesktop.DBus"), "/org/freedesktop/DBus",
        Some("org.freedesktop.DBus"), "ListNames", &())
        .and_then(|m| m.body().deserialize::<Vec<String>>()).map_err(|_| ());
    let names = match names {
        Ok(n) => n,
        Err(()) => { BUS.set(None); return Err(()); } // bus connection broken: reconnect next time
    };
    let mut out = Vec::new();
    for n in names.into_iter().filter(|n| n.starts_with(PREFIX) && n.len() > PREFIX.len()) {
        let status = conn.call_method(Some(n.as_str()), "/org/mpris/MediaPlayer2",
            Some("org.freedesktop.DBus.Properties"), "Get",
            &("org.mpris.MediaPlayer2.Player", "PlaybackStatus"))
            .ok()
            .and_then(|m| m.body().deserialize::<zbus::zvariant::OwnedValue>().ok())
            .and_then(|v| match &*v { zbus::zvariant::Value::Str(s) => Some(s.to_string()), _ => None });
        out.push((player_app(&n[PREFIX.len()..]).to_string(), status.as_deref() == Some("Playing")));
    }
    Ok(out)
}

/// App name from the bus name suffix, without the per-process part (`firefox.instance_1_42` -> `firefox`).
#[cfg(not(windows))]
fn player_app(suffix: &str) -> &str {
    suffix.split_once(".instance").map_or(suffix, |(app, _)| app)
}

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

    #[cfg(not(windows))]
    #[test]
    fn mpris_instance_suffix_is_not_part_of_the_app_name() {
        assert_eq!(player_app("spotify"), "spotify");
        assert_eq!(player_app("firefox.instance_1_42"), "firefox");
        assert_eq!(player_app("vlc.instance12345"), "vlc");
        assert_eq!(player_app("chromium.instance7"), "chromium");
    }

    /// Live: `cargo test -p agent-pets live_sessions -- --ignored --nocapture` while music is playing.
    #[test]
    #[ignore]
    fn live_sessions() { println!("{:?} -> {:?}", read_sessions(), pick(&sessions())); }

    /// Live: a fake MPRIS player on the real session bus, to verify the query path without a player app.
    #[cfg(not(windows))]
    #[test]
    #[ignore]
    fn live_mpris_fake_player() {
        use zbus::blocking::Connection;
        struct Player;
        #[zbus::interface(name = "org.mpris.MediaPlayer2.Player")]
        impl Player {
            #[zbus(property)]
            fn playback_status(&self) -> &str { "Playing" }
        }
        let conn = Connection::session().unwrap();
        conn.object_server().at("/org/mpris/MediaPlayer2", Player).unwrap();
        conn.request_name("org.mpris.MediaPlayer2.apets-test").unwrap();
        let sessions = read_sessions().unwrap();
        assert!(sessions.contains(&("apets-test".to_string(), true)), "{sessions:?}");
    }
}
