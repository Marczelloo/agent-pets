//! Stan aplikacji między uruchomieniami (`~/.agent-pets/state.json`), osobno od ustawień użytkownika:
//! o której wersji już powiadomiliśmy i którą wersję widzieliśmy przy ostatnim starcie.
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

#[derive(Serialize, Deserialize, Default, Clone, Debug, PartialEq)]
#[serde(default)]
pub struct AppState {
    pub notified_version: Option<String>,
    pub seen_version: Option<String>,
}

pub fn path(home: &Path) -> PathBuf { home.join(".agent-pets").join("state.json") }

/// Brak albo uszkodzony plik: stan domyślny (nic nie zgłoszone, nic nie widziane).
pub fn load(home: &Path) -> AppState {
    std::fs::read(path(home)).ok().and_then(|b| serde_json::from_slice(&b).ok()).unwrap_or_default()
}

/// Zapis atomowy (plik tymczasowy, potem `rename`).
pub fn save(home: &Path, s: &AppState) -> std::io::Result<()> {
    let p = path(home);
    if let Some(dir) = p.parent() { std::fs::create_dir_all(dir)?; }
    let tmp = p.with_extension("json.tmp");
    std::fs::write(&tmp, serde_json::to_vec_pretty(s)?)?;
    std::fs::rename(&tmp, &p)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn missing_or_broken_file_gives_defaults() {
        let d = tempfile::tempdir().unwrap();
        assert_eq!(load(d.path()), AppState::default());
        std::fs::create_dir_all(d.path().join(".agent-pets")).unwrap();
        std::fs::write(path(d.path()), "{bad").unwrap();
        assert_eq!(load(d.path()), AppState::default());
    }

    #[test]
    fn saves_and_loads_back() {
        let d = tempfile::tempdir().unwrap();
        let s = AppState { notified_version: Some("0.7.1".into()), seen_version: Some("0.7.0".into()) };
        save(d.path(), &s).unwrap();
        assert_eq!(load(d.path()), s);
        assert!(!path(d.path()).with_extension("json.tmp").exists());
    }
}
