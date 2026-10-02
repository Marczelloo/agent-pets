//! Widget settings: `~/.agent-pets/settings.json` (home directory because Windows virtualizes `AppData`
//! for MSIX packages). Missing fields get defaults, unknown fields are preserved on save,
//! and a damaged file is not overwritten until the user changes something.
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(default)]
pub struct Settings {
    pub version: u32,
    pub apps: Apps,
    pub claude_statusline: bool,
    /// Permission to fetch Claude limits from `api.anthropic.com` with the Claude Code token. Off by default.
    pub claude_plan_usage: bool,
    pub notifications: Notifications,
    pub pets: Pets,
    pub power_saving: PowerSaving,
    pub autostart: bool,
    /// Interface language: `auto` = Polish on Polish Windows, English otherwise.
    #[serde(deserialize_with = "or_default")]
    pub language: Language,
    /// Updates from GitHub releases: notify only, install during a quiet period, or disabled.
    #[serde(deserialize_with = "or_default")]
    pub updates: Updates,
    /// Scene window: position, monitor, background, size, and layout ("Taskbar" tab).
    pub stage: Stage,
    /// Fields from newer versions, preserved on save.
    #[serde(flatten)]
    pub extra: serde_json::Map<String, serde_json::Value>,
}

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq)]
#[serde(default)]
pub struct Apps {
    pub claude_code: bool,
    pub codex: bool,
    pub agent_router: bool,
    /// Plugin in opencode config: only after explicit enabling.
    pub opencode: bool,
    /// Door: `/v1/events/generic` for any agent.
    pub generic: bool,
    /// Hook file in `~/.copilot/hooks`: only after explicit enabling.
    pub copilot: bool,
    /// Key in `~/.gemini/config/hooks.json`: only after explicit enabling.
    pub antigravity: bool,
    /// Our entries in `~/.cursor/hooks.json`: only after explicit enabling.
    pub cursor: bool,
    /// File `~/.grok/hooks/agent-pets.json`: only after explicit enabling.
    pub grok: bool,
    /// Our hooks in `~/.zcode/cli/config.json`: only after explicit enabling.
    pub zcode: bool,
}

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq)]
#[serde(default)]
pub struct Notifications { pub needs_you: bool, pub done: bool, pub limits: bool }

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq)]
#[serde(default)]
pub struct Pets {
    /// `skin` is the name from version 0.5 (`sketch`/`clean` only).
    #[serde(alias = "skin", deserialize_with = "or_default")]
    pub style: Style,
    #[serde(deserialize_with = "or_default")]
    pub motion: Motion,
    pub overrides: Overrides,
    pub max_visible: u8,
    /// An idle pet listens to music playing in Windows (Spotify, Apple Music, browser…). Since 0.9.1.
    pub react_to_media: bool,
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

/// Agent appearance differing from the default; missing field means "use default".
#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq, Default)]
#[serde(default)]
pub struct Overrides {
    #[serde(skip_serializing_if = "Option::is_none")] pub claude_code: Option<LookOverride>,
    #[serde(skip_serializing_if = "Option::is_none")] pub codex: Option<LookOverride>,
    #[serde(skip_serializing_if = "Option::is_none")] pub agent_router: Option<LookOverride>,
    #[serde(skip_serializing_if = "Option::is_none")] pub opencode: Option<LookOverride>,
    #[serde(skip_serializing_if = "Option::is_none")] pub copilot: Option<LookOverride>,
    #[serde(skip_serializing_if = "Option::is_none")] pub antigravity: Option<LookOverride>,
    #[serde(skip_serializing_if = "Option::is_none")] pub cursor: Option<LookOverride>,
    #[serde(skip_serializing_if = "Option::is_none")] pub grok: Option<LookOverride>,
    #[serde(skip_serializing_if = "Option::is_none")] pub zcode: Option<LookOverride>,
}

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq, Default)]
#[serde(default)]
pub struct LookOverride {
    #[serde(skip_serializing_if = "Option::is_none", deserialize_with = "or_none")] pub style: Option<Style>,
    #[serde(skip_serializing_if = "Option::is_none", deserialize_with = "or_none")] pub motion: Option<Motion>,
}

/// A value from a newer version (unknown variant) does not prevent loading the whole file.
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

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq, Default)]
#[serde(rename_all = "snake_case")]
pub enum Updates { #[default] Notify, Auto, Off }

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq, Default)]
#[serde(rename_all = "snake_case")]
pub enum Position { #[default] Right, Left, Custom, Floating }

/// Edge the dragged stage is glued to, so it follows that edge when the icons move: the left or right free
/// zone of a horizontal taskbar (`Start` = its left edge, `End` = its right edge), or the top or bottom
/// corner beside a vertical one.
#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum Dock { LeftStart, LeftEnd, RightStart, RightEnd, Top, Bottom }

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq, Default)]
#[serde(rename_all = "snake_case")]
pub enum BgKind { #[default] None, Glass, Solid }

/// Window anchor: which side holds the pets and which way the window grows.
#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq, Default)]
#[serde(rename_all = "snake_case")]
pub enum Align { Left, Center, #[default] Right }

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq, Default)]
#[serde(rename_all = "snake_case")]
pub enum Order { #[default] Start, Attention, Agent }

#[derive(Serialize, Clone, Debug, PartialEq)]
pub struct Background {
    pub kind: BgKind,
    /// `#RRGGBB`; absent with glass = shade based on taskbar brightness.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub color: Option<String>,
    /// 0–100; absent = default for the kind (glass 12, solid color 90).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub opacity: Option<u8>,
    pub radius: u8,
}

#[derive(Serialize, Clone, Copy, Debug, PartialEq)]
pub struct Show { pub progress: bool, pub limits: bool, pub badge: bool }

/// Bubbles above pets ("Taskbar" tab, "Bubbles and subagents" section).
#[derive(Serialize, Clone, Copy, Debug, PartialEq)]
pub struct Bubbles { pub questions: bool, pub actions: bool }

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq)]
pub struct Point { pub x: f64, pub y: f64 }

/// Manually edited file: an invalid field gets its default value; the rest remains.
#[derive(Serialize, Clone, Debug, PartialEq)]
pub struct Stage {
    pub position: Position,
    /// Taskbar anchor as a fraction of its width (0–1).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub custom_at: Option<f64>,
    /// Edge `custom_at` was dropped on; wins over the fraction, which stays as the fallback.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub dock: Option<Dock>,
    /// Floating window anchor in CSS pixels relative to the monitor work area.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub floating_at: Option<Point>,
    /// `primary` or a device name (`\\.\DISPLAY2`).
    pub monitor: String,
    pub background: Background,
    /// Pet size percentage: 70–300, effectively at most `SIZE_TASKBAR_MAX` on the taskbar.
    pub size: u16,
    pub gap: u8,
    pub padding: u8,
    pub align: Align,
    pub order: Order,
    pub show: Show,
    pub bubbles: Bubbles,
    /// Mini pets for subagents working longer than 20 s.
    pub minis: bool,
    #[serde(flatten)]
    pub extra: serde_json::Map<String, serde_json::Value>,
}

/// JSON number within the type range: round fractions, clamp out-of-range values, return `None` for non-numbers.
fn num<T: TryFrom<i64>>(v: Option<&serde_json::Value>, lo: i64, hi: i64) -> Option<T> {
    let f = v?.as_f64().filter(|f| f.is_finite())?;
    T::try_from((f.round() as i64).clamp(lo, hi)).ok()
}

/// Field value if readable; otherwise retain the current (default) value.
fn field<T: serde::de::DeserializeOwned>(m: &serde_json::Map<String, serde_json::Value>, key: &str, slot: &mut T) {
    if let Some(v) = m.get(key).and_then(|v| serde_json::from_value(v.clone()).ok()) { *slot = v; }
}

fn object<'de, D: serde::Deserializer<'de>>(d: D) -> Result<serde_json::Map<String, serde_json::Value>, D::Error> {
    Ok(match serde_json::Value::deserialize(d)? { serde_json::Value::Object(m) => m, _ => serde_json::Map::new() })
}

impl<'de> Deserialize<'de> for Background {
    fn deserialize<D: serde::Deserializer<'de>>(d: D) -> Result<Self, D::Error> {
        let m = object(d)?;
        let mut b = Background::default();
        field(&m, "kind", &mut b.kind);
        b.color = m.get("color").and_then(|v| v.as_str()).map(str::to_string);
        b.opacity = num(m.get("opacity"), 0, 255);
        if let Some(r) = num(m.get("radius"), 0, 255) { b.radius = r; }
        Ok(b)
    }
}

impl<'de> Deserialize<'de> for Show {
    fn deserialize<D: serde::Deserializer<'de>>(d: D) -> Result<Self, D::Error> {
        let m = object(d)?;
        let mut s = Show::default();
        field(&m, "progress", &mut s.progress);
        field(&m, "limits", &mut s.limits);
        field(&m, "badge", &mut s.badge);
        Ok(s)
    }
}

impl<'de> Deserialize<'de> for Bubbles {
    fn deserialize<D: serde::Deserializer<'de>>(d: D) -> Result<Self, D::Error> {
        let m = object(d)?;
        let mut b = Bubbles::default();
        field(&m, "questions", &mut b.questions);
        field(&m, "actions", &mut b.actions);
        Ok(b)
    }
}

impl<'de> Deserialize<'de> for Stage {
    fn deserialize<D: serde::Deserializer<'de>>(d: D) -> Result<Self, D::Error> {
        let mut m = object(d)?;
        let mut s = Stage::default();
        field(&m, "position", &mut s.position);
        s.custom_at = m.get("custom_at").and_then(|v| v.as_f64());
        field(&m, "dock", &mut s.dock);
        s.floating_at = m.get("floating_at").and_then(|v| serde_json::from_value(v.clone()).ok());
        if let Some(v) = m.get("monitor").and_then(|v| v.as_str()) { s.monitor = v.to_string(); }
        field(&m, "background", &mut s.background);
        if let Some(v) = num(m.get("size"), 0, u16::MAX as i64) { s.size = v; }
        if let Some(v) = num(m.get("gap"), 0, 255) { s.gap = v; }
        if let Some(v) = num(m.get("padding"), 0, 255) { s.padding = v; }
        field(&m, "align", &mut s.align);
        field(&m, "order", &mut s.order);
        field(&m, "show", &mut s.show);
        field(&m, "bubbles", &mut s.bubbles);
        field(&m, "minis", &mut s.minis);
        for k in ["position", "custom_at", "dock", "floating_at", "monitor", "background", "size", "gap", "padding", "align", "order", "show",
                  "bubbles", "minis"] {
            m.remove(k);
        }
        s.extra = m;
        Ok(s)
    }
}

pub const SIZE: (u16, u16) = (70, 300);
/// On a 48 px taskbar, a pet at 100% already fills the height; larger sizes are for floating windows only.
pub const SIZE_TASKBAR_MAX: u16 = 100;
pub const PRIMARY: &str = "primary";

impl Default for Background { fn default() -> Self { Background { kind: BgKind::None, color: None, opacity: None, radius: 12 } } }
impl Default for Show { fn default() -> Self { Show { progress: true, limits: true, badge: true } } }
impl Default for Bubbles { fn default() -> Self { Bubbles { questions: true, actions: true } } }
impl Default for Stage {
    fn default() -> Self {
        Stage {
            position: Position::Right, custom_at: None, dock: None, floating_at: None, monitor: PRIMARY.into(),
            background: Background::default(), size: 100, gap: 0, padding: 2, align: Align::Right,
            order: Order::Start, show: Show::default(), bubbles: Bubbles::default(), minis: true,
            extra: serde_json::Map::new(),
        }
    }
}

fn is_hex_color(c: &str) -> bool { c.len() == 7 && c.starts_with('#') && c[1..].chars().all(|h| h.is_ascii_hexdigit()) }

impl Stage {
    /// Values within the "Taskbar" tab ranges; invalid color disappears, empty monitor means primary.
    pub fn clamped(&self) -> Stage {
        let mut s = self.clone();
        s.size = s.size.clamp(SIZE.0, SIZE.1);
        s.gap = s.gap.min(30);
        s.padding = s.padding.min(24);
        s.background.radius = s.background.radius.min(24);
        s.background.opacity = s.background.opacity.map(|o| o.min(100));
        s.background.color = s.background.color.filter(|c| is_hex_color(c));
        s.custom_at = s.custom_at.filter(|v| v.is_finite()).map(|v| v.clamp(0.0, 1.0));
        s.floating_at = s.floating_at.filter(|p| p.x.is_finite() && p.y.is_finite());
        if s.monitor.trim().is_empty() { s.monitor = PRIMARY.into(); }
        s
    }
}

impl Default for Apps {
    fn default() -> Self { Apps { claude_code: true, codex: true, agent_router: true, opencode: false, generic: true, copilot: false, antigravity: false,
        cursor: false, grok: false, zcode: false } }
}
impl Default for Notifications { fn default() -> Self { Notifications { needs_you: true, done: true, limits: true } } }
impl Default for Pets {
    fn default() -> Self { Pets { style: Style::Sticker, motion: Motion::Calm, overrides: Overrides::default(), max_visible: 5, react_to_media: true } }
}

impl Default for Settings {
    fn default() -> Self {
        Settings {
            version: 1, apps: Apps::default(), claude_statusline: false, claude_plan_usage: false,
            notifications: Notifications::default(), pets: Pets::default(), power_saving: PowerSaving::Auto,
            autostart: true, language: Language::Auto, updates: Updates::Notify, stage: Stage::default(),
            extra: serde_json::Map::new(),
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
        Ok(mut s) => { s.stage = s.stage.clamped(); Loaded { settings: s, first_run: false, error: None } }
        Err(e) => Loaded { settings: Settings::default(), first_run: false,
            error: Some(format!("{}: {e}", path.display())) },
    }
}

/// Atomic write (temporary file, then `rename`); visible pet limit clamped to 1–8, scene to tab ranges.
pub fn save(path: &Path, s: &Settings) -> std::io::Result<()> {
    let mut s = s.clone();
    s.pets.max_visible = s.pets.max_visible.clamp(MAX_VISIBLE.0, MAX_VISIBLE.1);
    s.stage = s.stage.clamped();
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

    #[test]
    fn a_0_9_file_opens_the_door_but_not_opencode() {
        let l = load_str(r#"{"version":1,"apps":{"claude_code":true,"codex":false,"agent_router":true}}"#);
        assert!(l.error.is_none());
        let a = l.settings.apps;
        // opencode changes its own files, so require explicit enabling; the door is a local route
        assert_eq!((a.claude_code, a.codex, a.agent_router, a.opencode, a.generic), (true, false, true, false, true));
    }

    #[test]
    fn a_0_10_file_keeps_copilot_and_antigravity_off() {
        let l = load_str(r#"{"version":1,"apps":{"claude_code":true,"codex":true,"agent_router":true,"opencode":true,"generic":true}}"#);
        assert!(l.error.is_none());
        let a = l.settings.apps;
        // both write hook files in agent configs, so require explicit enabling
        assert_eq!((a.opencode, a.copilot, a.antigravity), (true, false, false));
        let back: Apps = serde_json::from_value(serde_json::to_value(Apps { copilot: true, ..a }).unwrap()).unwrap();
        assert_eq!((back.copilot, back.antigravity), (true, false));
    }

    #[test]
    fn a_0_11_file_keeps_cursor_grok_and_zcode_off() {
        let l = load_str(r#"{"version":1,"apps":{"claude_code":true,"copilot":true,"antigravity":true}}"#);
        assert!(l.error.is_none());
        let a = l.settings.apps;
        assert_eq!((a.copilot, a.cursor, a.grok, a.zcode), (true, false, false, false));
        assert_eq!((Apps::default().cursor, Apps::default().grok, Apps::default().zcode), (false, false, false));
        let back: Apps = serde_json::from_value(serde_json::to_value(Apps { cursor: true, zcode: true, ..a }).unwrap()).unwrap();
        assert_eq!((back.cursor, back.grok, back.zcode), (true, false, true));
        let o = load_str(r#"{"version":1,"pets":{"overrides":{"zcode":{"style":"neon"},"grok":{"motion":"calm"}}}}"#).settings.pets.overrides;
        assert_eq!(o.zcode, Some(LookOverride { style: Some(Style::Neon), motion: None }));
        assert_eq!((o.grok.is_some(), o.cursor), (true, None));
    }

    #[test]
    fn copilot_and_antigravity_look_overrides_survive_a_save() {
        let l = load_str(r#"{"version":1,"pets":{"overrides":{"copilot":{"style":"neon"},"antigravity":{"motion":"calm"}}}}"#);
        assert_eq!(l.settings.pets.overrides.copilot, Some(LookOverride { style: Some(Style::Neon), motion: None }));
        assert_eq!(l.settings.pets.overrides.antigravity, Some(LookOverride { style: None, motion: Some(Motion::Calm) }));
    }

    #[test]
    fn an_opencode_look_override_survives_a_save() {
        let l = load_str(r#"{"version":1,"pets":{"overrides":{"opencode":{"style":"neon"}}}}"#);
        assert_eq!(l.settings.pets.overrides.opencode, Some(LookOverride { style: Some(Style::Neon), motion: None }));
        let v = serde_json::to_value(&l.settings).unwrap();
        assert_eq!(v["pets"]["overrides"]["opencode"]["style"], "neon");
    }

    #[test]
    fn a_0_6_file_gets_todays_stage_and_notify_updates() {
        let l = load_str(r#"{"version":1,"pets":{"style":"pixel","max_visible":4}}"#);
        assert!(l.error.is_none());
        let st = &l.settings.stage;
        assert_eq!(l.settings.updates, Updates::Notify);
        assert_eq!(*st, Stage::default());
        assert_eq!((st.position, st.size, st.gap, st.padding, st.align, st.order), (Position::Right, 100, 0, 2, Align::Right, Order::Start));
        assert_eq!(st.monitor, "primary");
        assert_eq!((st.background.kind, st.background.radius, st.background.color.clone(), st.background.opacity), (BgKind::None, 12, None, None));
        assert!(st.show.progress && st.show.limits && st.show.badge);
        assert!(st.custom_at.is_none() && st.floating_at.is_none());
        assert!(st.bubbles.questions && st.bubbles.actions && st.minis, "0.8: bubbles and mini pets enabled by default");
    }

    #[test]
    fn bubble_and_mini_switches_are_read_leniently() {
        let l = load_str(r#"{"version":1,"stage":{"gap":4,"bubbles":{"questions":false,"actions":"no"},"minis":false}}"#);
        let st = &l.settings.stage;
        assert_eq!((st.bubbles.questions, st.bubbles.actions, st.minis, st.gap), (false, true, false, 4));
        assert!(!st.extra.contains_key("bubbles") && !st.extra.contains_key("minis"));
        let l = load_str(r#"{"version":1,"stage":{"bubbles":7,"minis":"x"}}"#);
        assert_eq!(l.settings.stage.bubbles, Bubbles::default());
        assert!(l.settings.stage.minis);
    }

    #[test]
    fn unknown_stage_values_fall_back_field_by_field() {
        let l = load_str(r#"{"version":1,"updates":"weekly","stage":{"position":"top","align":"diagonal","order":"random","size":110,"background":{"kind":"blur","radius":6}}}"#);
        assert!(l.error.is_none(), "{:?}", l.error);
        let st = &l.settings.stage;
        assert_eq!(l.settings.updates, Updates::Notify);
        assert_eq!((st.position, st.align, st.order, st.size), (Position::Right, Align::Right, Order::Start, 110));
        assert_eq!((st.background.kind, st.background.radius), (BgKind::None, 6));
    }

    #[test]
    fn the_dock_survives_a_round_trip_and_an_unknown_one_is_dropped() {
        let st: Stage = serde_json::from_str(r#"{"position":"custom","custom_at":0.3,"dock":"left_end"}"#).unwrap();
        assert_eq!(st.dock, Some(Dock::LeftEnd));
        assert_eq!(serde_json::to_value(&st).unwrap()["dock"], "left_end");
        let bad: Stage = serde_json::from_str(r#"{"dock":"middle"}"#).unwrap();
        assert_eq!(bad.dock, None);
        assert!(serde_json::to_value(&bad).unwrap().get("dock").is_none());
        assert!(!serde_json::to_value(&st).unwrap().get("extra").is_some(), "dock is a known field, not an extra one");
    }

    #[test]
    fn save_clamps_stage_values() {
        let (_d, p) = tmp();
        let mut s = Settings::default();
        s.stage.size = 999;
        s.stage.gap = 99;
        s.stage.padding = 99;
        s.stage.background.radius = 99;
        s.stage.background.opacity = Some(250);
        s.stage.background.color = Some("red".into());
        s.stage.custom_at = Some(1.7);
        s.stage.monitor = String::new();
        save(&p, &s).unwrap();
        let st = load(&p).settings.stage;
        assert_eq!((st.size, st.gap, st.padding, st.background.radius, st.background.opacity), (300, 30, 24, 24, Some(100)));
        assert_eq!((st.background.color, st.custom_at, st.monitor.as_str()), (None, Some(1.0), "primary"));
        let mut low = Stage { size: 10, custom_at: Some(-0.5), ..Stage::default() };
        low.background.color = Some("#A1b2C3".into());
        let c = low.clamped();
        assert_eq!((c.size, c.custom_at, c.background.color), (70, Some(0.0), Some("#A1b2C3".into())));
    }

    #[test]
    fn a_hand_edited_stage_value_of_the_wrong_type_only_resets_that_value() {
        let l = load_str(r#"{"version":1,"autostart":false,"stage":{"gap":300,"size":110.5,"padding":-4,"monitor":5,
            "show":{"badge":"yes","limits":false},"background":{"kind":"glass","radius":"round"}}}"#);
        assert!(l.error.is_none(), "{:?}", l.error);
        assert!(!l.settings.autostart, "the rest of the file is kept");
        let st = &l.settings.stage;
        assert_eq!((st.gap, st.size, st.padding, st.monitor.as_str()), (30, 111, 0, "primary"));
        assert_eq!((st.show.badge, st.show.limits), (true, false));
        assert_eq!((st.background.kind, st.background.radius), (BgKind::Glass, 12));
    }

    #[test]
    fn unknown_stage_fields_survive_a_save() {
        let (_d, p) = tmp();
        std::fs::create_dir_all(p.parent().unwrap()).unwrap();
        std::fs::write(&p, r#"{"version":1,"stage":{"gap":4,"future":1}}"#).unwrap();
        let s = load(&p).settings;
        assert_eq!(s.stage.gap, 4);
        save(&p, &s).unwrap();
        let v: serde_json::Value = serde_json::from_slice(&std::fs::read(&p).unwrap()).unwrap();
        assert_eq!((v["stage"]["future"].clone(), v["stage"]["gap"].clone(), v["updates"].clone()), (serde_json::json!(1), serde_json::json!(4), serde_json::json!("notify")));
    }
}
