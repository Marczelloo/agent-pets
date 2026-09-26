//! Muzyka w Windows: sesje odtwarzania z GSMTC (`GlobalSystemMediaTransportControlsSessionManager`), czyli to,
//! co pokazuje kafelek multimediów przy głośności: Spotify, Apple Music, przeglądarki, VLC… Bez tytułów utworów:
//! scena potrzebuje tylko „gra / nie gra” i nazwy aplikacji.
use serde::Serialize;
use std::sync::Mutex;

#[derive(Serialize, Clone, Debug, Default, PartialEq, Eq)]
pub struct Media {
    pub playing: bool,
    /// AUMID aplikacji, która gra (np. `Spotify.exe`, `AppleInc.AppleMusicWin_…!App`)
    pub app: Option<String>,
}

#[derive(Default)]
pub struct MediaState(pub Mutex<Media>);

/// Z listy sesji `(aplikacja, gra?)`: pierwsza grająca wygrywa.
pub fn pick(sessions: &[(String, bool)]) -> Media {
    match sessions.iter().find(|(_, on)| *on) {
        Some((app, _)) => Media { playing: true, app: Some(app.clone()) },
        None => Media::default(),
    }
}

/// Sesje odtwarzania: `(AUMID, gra?)`. Błąd WinRT (np. usługa niedostępna) = brak sesji.
pub fn sessions() -> Vec<(String, bool)> { read_sessions().unwrap_or_default() }

#[cfg(windows)]
fn read_sessions() -> windows::core::Result<Vec<(String, bool)>> {
    use windows::Media::Control::{
        GlobalSystemMediaTransportControlsSessionManager as Manager,
        GlobalSystemMediaTransportControlsSessionPlaybackStatus as Status,
    };
    let mgr = Manager::RequestAsync()?.get()?;
    let mut out = Vec::new();
    for s in mgr.GetSessions()? {
        let app = s.SourceAppUserModelId().map(|h| h.to_string()).unwrap_or_default();
        let on = s.GetPlaybackInfo().and_then(|i| i.PlaybackStatus()).map(|st| st == Status::Playing).unwrap_or(false);
        out.push((app, on));
    }
    Ok(out)
}

#[cfg(not(windows))]
fn read_sessions() -> Result<Vec<(String, bool)>, ()> { Ok(Vec::new()) }

/// Liczy stan muzyki i rozsyła `pets://media`, gdy się zmienia. Wyłączone w ustawieniach = nic nie gra.
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

/// Stan odtwarzania co 2 s (odpytanie GSMTC to jedno wywołanie WinRT, bez zdarzeń per sesja).
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

    /// Na żywo: `cargo test -p agent-pets live_sessions -- --ignored --nocapture` przy grającej muzyce.
    #[test]
    #[ignore]
    fn live_sessions() { println!("{:?} -> {:?}", read_sessions(), pick(&sessions())); }
}
