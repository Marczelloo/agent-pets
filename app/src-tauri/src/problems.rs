//! Background failures worth showing once per run.
use pets_core::i18n::{tr, Lang};
use pets_core::integrations::Error;
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

pub fn repair_body(errors: &[(String, String)]) -> String {
    let names = errors.iter().map(|(name, _)| name.as_str()).collect::<Vec<_>>().join(", ");
    let first = errors.first().map(|(_, error)| error.as_str()).unwrap_or("");
    let cut = first.char_indices().nth(120).map_or(first, |(idx, _)| &first[..idx]);
    format!("{names}: {cut}")
}

pub fn collect_repair<T>(errors: &mut Vec<(String, String)>, name: &str, result: Result<T, Error>) {
    if let Err(error) = result { if !error.left_alone() { errors.push((name.into(), error.into())); } }
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
    fn only_failures_are_collected() {
        let mut errors = Vec::new();
        collect_repair::<()>(&mut errors, "opencode", Err(Error::LeftAlone("left alone".into())));
        assert!(errors.is_empty());
        collect_repair::<()>(&mut errors, "Claude Code", Err(Error::Failed("Cannot write hook.exe: access denied".into())));
        assert_eq!(errors, [("Claude Code".into(), "Cannot write hook.exe: access denied".into())]);
        assert_eq!(repair_title(Lang::En), "Couldn't repair an integration");
    }
}
