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
    /// Język interfejsu: `auto` = polski przy polskim Windows, inaczej angielski.
    #[serde(deserialize_with = "or_default")]
    pub language: Language,
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
pub struct Pets {
    /// `skin` to nazwa z wersji 0.5 (tylko `sketch`/`clean`).
    #[serde(alias = "skin", deserialize_with = "or_default")]
    pub style: Style,
    #[serde(deserialize_with = "or_default")]
    pub motion: Motion,
    pub overrides: Overrides,
    pub max_visible: u8,
}

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq, Default)]
#[serde(rename_all = "snake_case")]
pub enum Style { Sketch, Clean, #[default] Sticker, Pixel, Neon, Ink, Pastel }

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq, Default)]
#[serde(rename_all = "snake_case")]
pub enum Motion { #[default] Calm, #[serde(alias = "anime")] Dynamic }

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq, Default)]
#[serde(rename_all = "snake_case")]
pub enum Language { #[default] Auto, Pl, En }

/// Wygląd agenta inny niż domyślny; brak pola = „jak domyślny”.
#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq, Default)]
#[serde(default)]
pub struct Overrides {
    #[serde(skip_serializing_if = "Option::is_none")] pub claude_code: Option<LookOverride>,
    #[serde(skip_serializing_if = "Option::is_none")] pub codex: Option<LookOverride>,
    #[serde(skip_serializing_if = "Option::is_none")] pub agent_router: Option<LookOverride>,
}

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq, Default)]
#[serde(default)]
pub struct LookOverride {
    #[serde(skip_serializing_if = "Option::is_none", deserialize_with = "or_none")] pub style: Option<Style>,
    #[serde(skip_serializing_if = "Option::is_none", deserialize_with = "or_none")] pub motion: Option<Motion>,
}

/// Wartość z nowszej wersji (nieznany wariant) nie psuje wczytania całego pliku.
fn or_default<'de, D: serde::Deserializer<'de>, T: serde::de::DeserializeOwned + Default>(d: D) -> Result<T, D::Error> {
    let v = serde_json::Value::deserialize(d)?;
    Ok(serde_json::from_value(v).unwrap_or_default())
}

fn or_none<'de, D: serde::Deserializer<'de>, T: serde::de::DeserializeOwned>(d: D) -> Result<Option<T>, D::Error> {
    let v = serde_json::Value::deserialize(d)?;
    Ok(serde_json::from_value(v).ok())
}

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq, Default)]
#[serde(rename_all = "snake_case")]
pub enum PowerSaving { #[default] Auto, Always, Never }

impl Default for Apps { fn default() -> Self { Apps { claude_code: true, codex: true, agent_router: true } } }
impl Default for Notifications { fn default() -> Self { Notifications { needs_you: true, done: true, limits: true } } }
impl Default for Pets {
    fn default() -> Self { Pets { style: Style::Sticker, motion: Motion::Calm, overrides: Overrides::default(), max_visible: 5 } }
}

impl Default for Settings {
    fn default() -> Self {
        Settings {
            version: 1, apps: Apps::default(), claude_statusline: false, claude_plan_usage: false,
            notifications: Notifications::default(), pets: Pets::default(), power_saving: PowerSaving::Auto,
            autostart: true, language: Language::Auto, extra: serde_json::Map::new(),
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
            error: Some(format!("{}: {e}", path.display())) },
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
        assert_eq!((s.pets.style, s.pets.max_visible, s.power_saving, s.autostart), (Style::Sticker, 5, PowerSaving::Auto, true));
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
        assert_eq!((l.settings.pets.style, l.settings.pets.max_visible), (Style::Clean, 5));
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
    #[test]
    fn new_settings_look_like_the_app_icon() {
        let p = Settings::default().pets;
        assert_eq!((p.style, p.motion, p.overrides), (Style::Sticker, Motion::Calm, Overrides::default()));
    }

    fn load_str(json: &str) -> Loaded {
        let (_d, p) = tmp();
        std::fs::create_dir_all(p.parent().unwrap()).unwrap();
        std::fs::write(&p, json).unwrap();
        load(&p)
    }

    #[test]
    fn the_old_skin_field_becomes_the_style() {
        let l = load_str(r#"{"version":1,"pets":{"skin":"sketch","max_visible":4}}"#);
        assert!(l.error.is_none());
        assert_eq!((l.settings.pets.style, l.settings.pets.max_visible), (Style::Sketch, 4));
    }

    #[test]
    fn unknown_style_and_motion_fall_back_without_losing_the_rest() {
        let l = load_str(r#"{"version":1,"autostart":false,"pets":{"style":"hologram","motion":"warp","max_visible":3}}"#);
        assert!(l.error.is_none());
        assert_eq!((l.settings.pets.style, l.settings.pets.motion, l.settings.pets.max_visible), (Style::Sticker, Motion::Calm, 3));
        assert!(!l.settings.autostart);
    }

    #[test]
    fn an_unknown_override_value_drops_only_that_field() {
        let l = load_str(r#"{"version":1,"pets":{"overrides":{"codex":{"style":"x","motion":"anime"},"claude_code":{"style":"neon"}}}}"#);
        assert!(l.error.is_none());
        let o = l.settings.pets.overrides;
        assert_eq!(o.codex, Some(LookOverride { style: None, motion: Some(Motion::Dynamic) }));
        assert_eq!(o.claude_code, Some(LookOverride { style: Some(Style::Neon), motion: None }));
        assert_eq!(o.agent_router, None);
    }

    #[test]
    fn the_old_anime_motion_reads_as_dynamic_and_saves_as_dynamic() {
        let l = load_str(r#"{"version":1,"pets":{"motion":"anime","overrides":{"codex":{"motion":"dynamic"}}}}"#);
        assert!(l.error.is_none());
        assert_eq!(l.settings.pets.motion, Motion::Dynamic);
        assert_eq!(l.settings.pets.overrides.codex.and_then(|o| o.motion), Some(Motion::Dynamic));
        assert_eq!(serde_json::to_string(&Motion::Dynamic).unwrap(), r#""dynamic""#);
    }

    #[test]
    fn save_writes_style_never_skin_and_omits_empty_overrides() {
        let (_d, p) = tmp();
        let mut s = Settings::default();
        s.pets.style = Style::Clean;
        save(&p, &s).unwrap();
        let v: serde_json::Value = serde_json::from_slice(&std::fs::read(&p).unwrap()).unwrap();
        assert_eq!(v["pets"]["style"], "clean");
        assert_eq!(v["pets"]["motion"], "calm");
        assert!(v["pets"].get("skin").is_none());
        assert_eq!(v["pets"]["overrides"], serde_json::json!({}));
    }
    #[test]
    fn language_defaults_to_auto_and_unknown_values_fall_back() {
        assert_eq!(Settings::default().language, Language::Auto);
        assert_eq!(load_str(r#"{"version":1,"language":"en"}"#).settings.language, Language::En);
        assert_eq!(load_str(r#"{"version":1,"language":"klingon"}"#).settings.language, Language::Auto);
    }

    #[test]
    fn a_broken_file_error_is_technical_and_names_the_path() {
        let l = load_str("{bad");
        let e = l.error.unwrap();
        assert!(e.contains("settings.json") && !e.contains("uszkodzony"), "{e}");
    }
}
