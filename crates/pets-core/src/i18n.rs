//! Język tekstów pokazywanych użytkownikowi (tray, powiadomienia, opisy integracji). Logi zostają po polsku.
use crate::settings::Language;

#[derive(Clone, Copy, Debug, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "snake_case")]
pub enum Lang { Pl, En }

/// `Auto`: polski tylko przy polskim interfejsie Windows; każdy inny → angielski.
pub fn resolve(setting: Language, system_polish: bool) -> Lang {
    match setting {
        Language::Pl => Lang::Pl,
        Language::En => Lang::En,
        Language::Auto => if system_polish { Lang::Pl } else { Lang::En },
    }
}

pub fn tr(l: Lang, pl: &'static str, en: &'static str) -> &'static str { match l { Lang::Pl => pl, Lang::En => en } }

/// Język interfejsu Windows (LANG_POLISH = 0x15 w młodszych bitach LANGID).
#[cfg(windows)]
pub fn system_polish() -> bool {
    // SAFETY: funkcja bez argumentów, tylko odczyt ustawienia użytkownika.
    let id = unsafe { windows_sys::Win32::Globalization::GetUserDefaultUILanguage() };
    id & 0x3ff == 0x15
}
#[cfg(not(windows))]
pub fn system_polish() -> bool { std::env::var("LANG").map(|v| v.starts_with("pl")).unwrap_or(false) }

/// Język z ustawień i systemu.
pub fn current(setting: Language) -> Lang { resolve(setting, system_polish()) }

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn auto_follows_windows_and_explicit_choice_wins() {
        assert_eq!(resolve(Language::Auto, true), Lang::Pl);
        assert_eq!(resolve(Language::Auto, false), Lang::En);
        assert_eq!(resolve(Language::Pl, false), Lang::Pl);
        assert_eq!(resolve(Language::En, true), Lang::En);
        assert_eq!(tr(Lang::En, "Tak", "Yes"), "Yes");
    }
}
