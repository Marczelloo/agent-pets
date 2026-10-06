//! Background failures worth showing once per run.
use pets_core::i18n::{tr, Lang};
use std::collections::HashSet;
use std::sync::Mutex;
use tauri::{AppHandle, Manager};

#[derive(Default)]
pub struct Problems(Mutex<HashSet<String>>);

impl Problems {
    fn first(&self, key: &str) -> bool { self.0.lock().unwrap().insert(key.to_string()) }
}

pub fn report(app: &AppHandle, key: &str, title: &str, body: &str) {
    pets_core::app_log!("{key}: {title}: {body}");
    if app.state::<Problems>().first(key) { crate::notify::show_problem(app, title, body); }
}

/// User-owned files, absent installs, and explicitly disabled hooks are deliberate no-ops.
pub fn benign_integration_error(error: &str) -> bool {
    [tr(Lang::Pl, "nie jest nasz", "is not ours"), "is not ours",
        tr(Lang::Pl, "nie nadpisuję", "not overwriting"), "not overwriting",
        tr(Lang::Pl, "nie zmieniam", "not changing"), "not changing",
        tr(Lang::Pl, "Nie znaleziono", "not found. Run"), "not found. Run",
        tr(Lang::Pl, "są wyłączone", "are disabled"), "are disabled",
        tr(Lang::Pl, "nieoczekiwany format", "unexpected format"), "unexpected format",
        tr(Lang::Pl, "nic nie zmieniam", "leaving it unchanged"), "leaving it unchanged"]
        .iter().any(|part| error.contains(part))
}

pub fn repair_body(errors: &[(String, String)]) -> String {
    let names = errors.iter().map(|(name, _)| name.as_str()).collect::<Vec<_>>().join(", ");
    let first = errors.first().map(|(_, error)| error.as_str()).unwrap_or("");
    let cut = first.char_indices().nth(120).map_or(first, |(idx, _)| &first[..idx]);
    format!("{names}: {cut}")
}

pub fn collect_repair<T>(errors: &mut Vec<(String, String)>, name: &str, result: Result<T, String>) {
    if let Err(error) = result { if !benign_integration_error(&error) { errors.push((name.into(), error)); } }
}

pub fn repair_title(lang: Lang) -> &'static str { tr(lang, "Nie udało się naprawić integracji", "Couldn't repair an integration") }

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn dedupes_by_key() {
        let p = Problems::default();
        assert!(p.first("repair"));
        assert!(!p.first("repair"));
        assert!(p.first("update"));
    }

    #[test]
    fn joins_names_and_cuts_at_a_character_boundary() {
        let body = repair_body(&[("Claude Code".into(), "ą".repeat(121)), ("opencode".into(), "x".into())]);
        assert_eq!(body, format!("Claude Code, opencode: {}", "ą".repeat(120)));
    }

    #[test]
    fn only_expected_conflicts_are_benign() {
        assert!(benign_integration_error("agent-pets.js is not ours; not overwriting it."));
        assert!(benign_integration_error("Hooki w ZCode są wyłączone"));
        assert!(!benign_integration_error("Cannot write hook.exe: access denied"));
        assert_eq!(repair_title(Lang::En), "Couldn't repair an integration");
    }
}
