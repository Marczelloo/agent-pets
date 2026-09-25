//! Ustawienia widżetu: `~/.agent-pets/settings.json` (katalog domowy, bo Windows wirtualizuje `AppData`
//! dla pakietów MSIX). Brakujące pola dostają wartości domyślne, nieznane są zachowywane przy zapisie,
//! a uszkodzony plik nie jest nadpisywany, dopóki użytkownik czegoś nie zmieni.
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(default)]
pub struct Settings {
    pub version: u32,
    pub apps: Apps,
    pub claude_statusline: bool,
    /// Zgoda na pobieranie limitów Claude'a z `api.anthropic.com` tokenem Claude Code. Domyślnie brak zgody.
    pub claude_plan_usage: bool,
    pub notifications: Notifications,
    pub pets: Pets,
    pub power_saving: PowerSaving,
    pub autostart: bool,
    /// Pola z nowszych wersji, zachowywane przy zapisie.
    #[serde(flatten)]
    pub extra: serde_json::Map<String, serde_json::Value>,
}

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq)]
#[serde(default)]
pub struct Apps { pub claude_code: bool, pub codex: bool, pub agent_router: bool }

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq)]
#[serde(default)]
pub struct Notifications { pub needs_you: bool, pub done: bool, pub limits: bool }

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq)]
#[serde(default)]
pub struct Pets { pub skin: Skin, pub max_visible: u8 }

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq, Default)]
#[serde(rename_all = "snake_case")]
pub enum Skin { #[default] Sketch, Clean }

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq, Default)]
#[serde(rename_all = "snake_case")]
pub enum PowerSaving { #[default] Auto, Always, Never }

impl Default for Apps { fn default() -> Self { Apps { claude_code: true, codex: true, agent_router: true } } }
impl Default for Notifications { fn default() -> Self { Notifications { needs_you: true, done: true, limits: true } } }
impl Default for Pets { fn default() -> Self { Pets { skin: Skin::Sketch, max_visible: 5 } } }

impl Default for Settings {
    fn default() -> Self {
        Settings {
            version: 1, apps: Apps::default(), claude_statusline: false, claude_plan_usage: false,
            notifications: Notifications::default(), pets: Pets::default(), power_saving: PowerSaving::Auto,
            autostart: true, extra: serde_json::Map::new(),
        }
    }
}

pub const MAX_VISIBLE: (u8, u8) = (1, 8);

pub fn path(home: &Path) -> PathBuf { home.join(".agent-pets").join("settings.json") }

#[derive(Debug, PartialEq)]
pub struct Loaded { pub settings: Settings, pub first_run: bool, pub error: Option<String> }

pub fn load(path: &Path) -> Loaded {
    let bytes = match std::fs::read(path) {
        Ok(b) => b,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound =>
            return Loaded { settings: Settings::default(), first_run: true, error: None },
        Err(e) => return Loaded { settings: Settings::default(), first_run: false, error: Some(e.to_string()) },
    };
    match serde_json::from_slice::<Settings>(&bytes) {
        Ok(s) => Loaded { settings: s, first_run: false, error: None },
        Err(e) => Loaded { settings: Settings::default(), first_run: false,
            error: Some(format!("{} jest uszkodzony ({e}); używam ustawień domyślnych", path.display())) },
    }
}

/// Zapis atomowy (plik tymczasowy, potem `rename`); limit widocznych zwierzaków przycięty do 1–8.
pub fn save(path: &Path, s: &Settings) -> std::io::Result<()> {
    let mut s = s.clone();
    s.pets.max_visible = s.pets.max_visible.clamp(MAX_VISIBLE.0, MAX_VISIBLE.1);
    if let Some(dir) = path.parent() { std::fs::create_dir_all(dir)?; }
    let tmp = path.with_extension("json.tmp");
    std::fs::write(&tmp, serde_json::to_vec_pretty(&s)?)?;
    std::fs::rename(&tmp, path)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tmp() -> (tempfile::TempDir, PathBuf) {
        let d = tempfile::tempdir().unwrap();
        let p = path(d.path());
        (d, p)
    }

    #[test]
    fn defaults_ask_nothing_of_the_network() {
        let s = Settings::default();
        assert!(!s.claude_plan_usage && !s.claude_statusline);
        assert!(s.apps.claude_code && s.apps.codex && s.apps.agent_router);
        assert_eq!((s.pets.skin, s.pets.max_visible, s.power_saving, s.autostart), (Skin::Sketch, 5, PowerSaving::Auto, true));
    }

    #[test]
    fn a_missing_file_is_the_first_run() {
        let (_d, p) = tmp();
        let l = load(&p);
        assert!(l.first_run && l.error.is_none());
        assert_eq!(l.settings, Settings::default());
    }

    #[test]
    fn missing_fields_get_defaults() {
        let (_d, p) = tmp();
        std::fs::create_dir_all(p.parent().unwrap()).unwrap();
        std::fs::write(&p, r#"{"version":1,"pets":{"skin":"clean"}}"#).unwrap();
        let l = load(&p);
        assert!(!l.first_run && l.error.is_none());
        assert_eq!((l.settings.pets.skin, l.settings.pets.max_visible), (Skin::Clean, 5));
        assert!(l.settings.apps.codex);
    }

    #[test]
    fn unknown_fields_survive_a_save() {
        let (_d, p) = tmp();
        std::fs::create_dir_all(p.parent().unwrap()).unwrap();
        std::fs::write(&p, r#"{"version":1,"future":{"x":1}}"#).unwrap();
        let mut s = load(&p).settings;
        s.autostart = false;
        save(&p, &s).unwrap();
        let v: serde_json::Value = serde_json::from_slice(&std::fs::read(&p).unwrap()).unwrap();
        assert_eq!(v["future"]["x"], 1);
        assert_eq!(v["autostart"], false);
    }

    #[test]
    fn a_broken_file_is_reported_and_left_alone() {
        let (_d, p) = tmp();
        std::fs::create_dir_all(p.parent().unwrap()).unwrap();
        std::fs::write(&p, "{bad").unwrap();
        let l = load(&p);
        assert!(!l.first_run && l.error.is_some());
        assert_eq!(l.settings, Settings::default());
        assert_eq!(std::fs::read_to_string(&p).unwrap(), "{bad");
    }

    #[test]
    fn save_clamps_the_pet_limit_and_leaves_no_temp_file() {
        let (d, p) = tmp();
        let mut s = Settings::default();
        s.pets.max_visible = 99;
        save(&p, &s).unwrap();
        assert_eq!(load(&p).settings.pets.max_visible, 8);
        let names: Vec<_> = std::fs::read_dir(d.path().join(".agent-pets")).unwrap().flatten()
            .map(|e| e.file_name().to_string_lossy().into_owned()).collect();
        assert_eq!(names, vec!["settings.json".to_string()]);
    }
}
