//! „Przejdź”: plan kroków (czysty, testowany) i ich wykonanie (`exec`, Win32). Kolejność ze spec 8.
pub mod exec;
pub mod registry;

use pets_core::model::{Agent, App, Session};
use serde::Serialize;
use std::path::Path;

#[derive(Clone, Debug, PartialEq)]
pub struct Target {
    pub agent: Agent,
    pub session_id: String,
    pub cwd: String,
    pub pid: Option<u32>,
    pub host_session_id: Option<String>,
    pub desktop: bool,
}

impl Target {
    pub fn from(s: &Session, reg: Option<&registry::Entry>) -> Target {
        Target {
            agent: s.agent,
            session_id: s.id.clone(),
            cwd: if s.cwd.is_empty() { s.jump.cwd.clone() } else { s.cwd.clone() },
            pid: s.jump.pid.or(reg.map(|r| r.pid)),
            host_session_id: reg.and_then(|r| r.host_session_id.clone()),
            desktop: s.jump.app == Some(App::ClaudeDesktop) || reg.map(|r| r.entrypoint == "claude-desktop").unwrap_or(false),
        }
    }
}

#[derive(Clone, Debug, PartialEq)]
pub enum Step {
    DeepLink(String),
    FocusProcess(u32),
    OpenTerminal { cwd: String, program: String, args: Vec<String> },
    Clipboard(String),
}

#[derive(Serialize, Clone, Debug, PartialEq)]
pub struct JumpResult { pub method: String, pub detail: String }

fn id_char(c: char) -> bool { c.is_ascii_alphanumeric() || c == '_' || c == '-' }

/// `^[A-Za-z0-9_-]{1,128}$`: tylko taki id trafia do URL-a i do argumentów procesu.
fn safe_id(id: &str) -> bool { !id.is_empty() && id.len() <= 128 && id.chars().all(id_char) }

/// `^local_[A-Za-z0-9-]{1,64}$`, jak w obsłudze linków aplikacji Claude.
fn host_ok(h: &str) -> bool {
    h.strip_prefix("local_")
        .map(|r| !r.is_empty() && r.len() <= 64 && r.chars().all(|c| c.is_ascii_alphanumeric() || c == '-'))
        .unwrap_or(false)
}

fn resume(t: &Target) -> (String, Vec<String>) {
    match t.agent {
        Agent::Claude => ("claude".into(), vec!["--resume".into(), t.session_id.clone()]),
        Agent::Codex => ("codex".into(), vec!["resume".into(), t.session_id.clone()]),
    }
}

/// Komenda wznowienia do schowka. Id spoza bezpiecznego alfabetu jest przefiltrowane.
pub fn resume_command(t: &Target) -> String {
    let id: String = t.session_id.chars().filter(|c| id_char(*c)).collect();
    let base = match t.agent { Agent::Claude => format!("claude --resume {id}"), Agent::Codex => format!("codex resume {id}") };
    if t.cwd.is_empty() { base } else { format!("cd \"{}\"; {base}", t.cwd.replace('"', "")) }
}

pub fn plan(t: &Target) -> Vec<Step> {
    if !safe_id(&t.session_id) { return vec![Step::Clipboard(resume_command(t))]; }
    let mut out = Vec::new();
    match t.agent {
        Agent::Claude => {
            if t.desktop {
                if let Some(h) = t.host_session_id.as_deref().filter(|h| host_ok(h)) {
                    out.push(Step::DeepLink(format!("claude://code/continue?session={h}")));
                }
            }
            if let Some(pid) = t.pid { out.push(Step::FocusProcess(pid)); }
        }
        Agent::Codex => out.push(Step::DeepLink(format!("codex://threads/{}", t.session_id))),
    }
    if !t.cwd.is_empty() && Path::new(&t.cwd).is_dir() {
        let (program, args) = resume(t);
        out.push(Step::OpenTerminal { cwd: t.cwd.clone(), program, args });
    }
    out.push(Step::Clipboard(resume_command(t)));
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    fn t(agent: Agent, desktop: bool) -> Target {
        Target { agent, session_id: "3746a003-5ba1".into(), cwd: std::env::temp_dir().to_string_lossy().into(),
                 pid: Some(42), host_session_id: Some("local_f1d1d64e-9530".into()), desktop }
    }

    #[test]
    fn claude_desktop_deep_links_then_focuses_then_resumes() {
        let p = plan(&t(Agent::Claude, true));
        assert_eq!(p[0], Step::DeepLink("claude://code/continue?session=local_f1d1d64e-9530".into()));
        assert_eq!(p[1], Step::FocusProcess(42));
        assert!(matches!(&p[2], Step::OpenTerminal { program, args, .. } if program == "claude" && args == &vec!["--resume".to_string(), "3746a003-5ba1".into()]));
        assert!(matches!(p.last(), Some(Step::Clipboard(_))));
    }

    #[test]
    fn claude_cli_focuses_its_terminal_first() {
        let mut x = t(Agent::Claude, false);
        x.host_session_id = None;
        assert_eq!(plan(&x)[0], Step::FocusProcess(42));
    }

    #[test]
    fn codex_opens_the_thread_in_the_app() {
        let p = plan(&t(Agent::Codex, false));
        assert_eq!(p[0], Step::DeepLink("codex://threads/3746a003-5ba1".into()));
        assert!(matches!(&p[1], Step::OpenTerminal { program, args, .. } if program == "codex" && args == &vec!["resume".to_string(), "3746a003-5ba1".into()]));
    }

    #[test]
    fn missing_data_still_ends_in_the_clipboard() {
        let x = Target { agent: Agent::Claude, session_id: "abc".into(), cwd: String::new(), pid: None, host_session_id: None, desktop: false };
        let p = plan(&x);
        assert_eq!(p.len(), 1);
        assert_eq!(p[0], Step::Clipboard("claude --resume abc".into()));
    }

    #[test]
    fn unsafe_ids_never_reach_urls_or_processes() {
        let mut x = t(Agent::Claude, true);
        x.session_id = "a\" & calc".into();
        x.host_session_id = Some("local_x&y".into());
        let p = plan(&x);
        assert_eq!(p.len(), 1, "{p:?}");
        assert!(matches!(&p[0], Step::Clipboard(c) if !c.contains('&') && c.ends_with("; claude --resume acalc")), "{p:?}");
    }

    #[test]
    fn unsafe_host_session_id_skips_only_the_deep_link() {
        let mut x = t(Agent::Claude, true);
        x.host_session_id = Some("local_x&y".into());
        assert_eq!(plan(&x)[0], Step::FocusProcess(42));
    }

    #[test]
    fn nonexistent_cwd_skips_the_terminal() {
        let mut x = t(Agent::Codex, false);
        x.cwd = r"C:\nie\ma\takiego\katalogu".into();
        assert!(plan(&x).iter().all(|s| !matches!(s, Step::OpenTerminal { .. })));
    }
}
