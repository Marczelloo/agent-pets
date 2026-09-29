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
    /// program-gospodarz (VS Code, t3code…): jego okno przed oknem procesu agenta
    pub host_pid: Option<u32>,
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
            host_pid: s.jump.host_pid,
            host_session_id: reg.and_then(|r| r.host_session_id.clone()),
            // sesja żyje w aplikacji agenta (Claude albo Codex): tylko wtedy deep link ma dokąd prowadzić
            desktop: matches!(s.jump.app, Some(App::ClaudeDesktop | App::CodexApp))
                || reg.map(|r| r.entrypoint == "claude-desktop").unwrap_or(false),
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

impl JumpResult {
    /// Schowek albo porażka: użytkownik musi przeczytać `detail`, więc panel zostaje otwarty z komunikatem.
    pub fn needs_attention(&self) -> bool { self.method == "clipboard" || self.method == "none" }
}

fn id_char(c: char) -> bool { c.is_ascii_alphanumeric() || c == '_' || c == '-' }

/// `^[A-Za-z0-9_-]{1,128}$`: tylko taki id trafia do URL-a i do argumentów procesu.
fn safe_id(id: &str) -> bool { !id.is_empty() && id.len() <= 128 && id.chars().all(id_char) }

/// `^local_[A-Za-z0-9-]{1,64}$`, jak w obsłudze linków aplikacji Claude.
fn host_ok(h: &str) -> bool {
    h.strip_prefix("local_")
        .map(|r| !r.is_empty() && r.len() <= 64 && r.chars().all(|c| c.is_ascii_alphanumeric() || c == '-'))
        .unwrap_or(false)
}

/// Id sesji w samym agencie (bez naszego prefiksu `opencode:`).
fn agent_id(t: &Target) -> &str {
    match t.agent {
        Agent::Opencode => t.session_id.strip_prefix("opencode:").unwrap_or(&t.session_id),
        _ => &t.session_id,
    }
}

/// Program i argumenty wznowienia; `None` = agent bez wznowienia z linii poleceń (furtka, agenci z 0.11/0.12).
fn resume(t: &Target) -> Option<(String, Vec<String>)> {
    let id = agent_id(t).to_string();
    match t.agent {
        Agent::Claude => Some(("claude".into(), vec!["--resume".into(), id])),
        Agent::Codex => Some(("codex".into(), vec!["resume".into(), id])),
        Agent::Opencode => Some(("opencode".into(), vec!["--session".into(), id])),
        Agent::Antigravity | Agent::Copilot | Agent::Cursor | Agent::Grok | Agent::Zcode | Agent::Other => None,
    }
}

/// Komenda wznowienia do schowka (albo samo `cd`, gdy agent nie ma wznowienia). Id spoza bezpiecznego alfabetu jest przefiltrowane.
pub fn resume_command(t: &Target) -> String {
    let id: String = agent_id(t).chars().filter(|c| id_char(*c)).collect();
    let cd = (!t.cwd.is_empty()).then(|| format!("cd \"{}\"", t.cwd.replace('"', "")));
    let base = resume(t).map(|(p, a)| {
        let args: Vec<&str> = a[..a.len() - 1].iter().map(String::as_str).collect();
        format!("{p} {} {id}", args.join(" "))
    });
    match (cd, base) {
        (Some(cd), Some(b)) => format!("{cd}; {b}"),
        (Some(cd), None) => cd,
        (None, Some(b)) => b,
        (None, None) => String::new(),
    }
}

pub fn plan(t: &Target) -> Vec<Step> {
    let resumable = resume(t).is_some();
    if resumable && !safe_id(agent_id(t)) { return vec![Step::Clipboard(resume_command(t))]; }
    let mut out = Vec::new();
    match t.agent {
        Agent::Claude if t.desktop => {
            if let Some(h) = t.host_session_id.as_deref().filter(|h| host_ok(h)) {
                out.push(Step::DeepLink(format!("claude://code/continue?session={h}")));
            }
        }
        // `ShellExecute` na zarejestrowanym `codex://` zawsze „się udaje”, więc link tylko dla sesji z aplikacji Codex
        Agent::Codex if t.desktop => out.push(Step::DeepLink(format!("codex://threads/{}", t.session_id))),
        _ => {}
    }
    if let Some(h) = t.host_pid.filter(|h| Some(*h) != t.pid) { out.push(Step::FocusProcess(h)); }
    if let Some(pid) = t.pid { out.push(Step::FocusProcess(pid)); }
    if let Some((program, args)) = resume(t).filter(|_| !t.cwd.is_empty() && Path::new(&t.cwd).is_dir()) {
        out.push(Step::OpenTerminal { cwd: t.cwd.clone(), program, args });
    }
    let clip = resume_command(t);
    if !clip.is_empty() { out.push(Step::Clipboard(clip)); }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    fn t(agent: Agent, desktop: bool) -> Target {
        Target { agent, session_id: "3746a003-5ba1".into(), cwd: std::env::temp_dir().to_string_lossy().into(),
                 pid: Some(42), host_pid: None, host_session_id: Some("local_f1d1d64e-9530".into()), desktop }
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
        let p = plan(&t(Agent::Codex, true));
        assert_eq!(p[0], Step::DeepLink("codex://threads/3746a003-5ba1".into()));
        assert!(matches!(&p[2], Step::OpenTerminal { program, args, .. } if program == "codex" && args == &vec!["resume".to_string(), "3746a003-5ba1".into()]));
    }

    #[test]
    fn codex_cli_focuses_its_terminal_instead_of_opening_the_app() {
        // `ShellExecute` na zarejestrowanym `codex://` zawsze „się udaje”, więc sesja z terminala nigdy by do niego nie wróciła.
        let p = plan(&t(Agent::Codex, false));
        assert_eq!(p[0], Step::FocusProcess(42));
        assert!(p.iter().all(|s| !matches!(s, Step::DeepLink(_))));
    }

    #[test]
    fn clipboard_and_failure_need_the_user_to_read_the_result() {
        let r = |m: &str| JumpResult { method: m.into(), detail: String::new() };
        assert!(r("clipboard").needs_attention() && r("none").needs_attention());
        assert!(!r("deeplink").needs_attention() && !r("focus").needs_attention() && !r("terminal").needs_attention());
    }

    #[test]
    fn missing_data_still_ends_in_the_clipboard() {
        let x = Target { agent: Agent::Claude, session_id: "abc".into(), cwd: String::new(), pid: None, host_pid: None, host_session_id: None, desktop: false };
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
    fn the_host_program_window_comes_before_the_agent_process() {
        let mut x = t(Agent::Claude, false);
        x.host_pid = Some(7);
        let p = plan(&x);
        assert_eq!(&p[..2], &[Step::FocusProcess(7), Step::FocusProcess(42)]);
        x.host_pid = Some(42);
        assert_eq!(plan(&x).iter().filter(|s| matches!(s, Step::FocusProcess(_))).count(), 1, "ten sam proces raz");
        let mut d = t(Agent::Claude, true);
        d.host_pid = Some(7);
        assert!(matches!(plan(&d)[0], Step::DeepLink(_)), "deep link zostaje pierwszy");
    }

    #[test]
    fn opencode_resumes_its_own_session_id() {
        let mut x = t(Agent::Opencode, false);
        x.session_id = "opencode:ses_3f2a".into();
        let p = plan(&x);
        assert_eq!(p[0], Step::FocusProcess(42));
        assert!(p.iter().any(|s| matches!(s, Step::OpenTerminal { program, args, .. }
            if program == "opencode" && args == &vec!["--session".to_string(), "ses_3f2a".into()])), "{p:?}");
        assert!(matches!(p.last(), Some(Step::Clipboard(c)) if c.ends_with("; opencode --session ses_3f2a")), "{p:?}");
    }

    #[test]
    fn an_agent_without_resume_focuses_and_copies_only_the_folder() {
        let mut x = t(Agent::Other, false);
        x.session_id = "generic:kilo:abc".into();
        let p = plan(&x);
        assert_eq!(p[0], Step::FocusProcess(42));
        assert!(p.iter().all(|s| !matches!(s, Step::OpenTerminal { .. } | Step::DeepLink(_))), "{p:?}");
        assert!(matches!(p.last(), Some(Step::Clipboard(c)) if c.starts_with("cd \"") && !c.contains(';')), "{p:?}");
    }

    #[test]
    fn copilot_and_antigravity_focus_their_program_without_resume() {
        for (a, id) in [(Agent::Copilot, "copilot:cop_1"), (Agent::Antigravity, "antigravity:d5f1"), (Agent::Cursor, "cursor:conv_1"),
                        (Agent::Grok, "grok:g1"), (Agent::Zcode, "zcode:zc_1")] {
            let mut x = t(a, false);
            x.session_id = id.into();
            let p = plan(&x);
            assert_eq!(p[0], Step::FocusProcess(42), "{a:?}");
            assert!(p.iter().all(|s| !matches!(s, Step::OpenTerminal { .. } | Step::DeepLink(_))), "{p:?}");
            assert!(matches!(p.last(), Some(Step::Clipboard(c)) if c.starts_with("cd \"") && !c.contains(';')), "{p:?}");
        }
    }

    #[test]
    fn nonexistent_cwd_skips_the_terminal() {
        let mut x = t(Agent::Codex, false);
        x.cwd = r"C:\nie\ma\takiego\katalogu".into();
        assert!(plan(&x).iter().all(|s| !matches!(s, Step::OpenTerminal { .. })));
    }
}
