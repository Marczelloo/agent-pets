//! Session host program (terminal, VS Code, t3code…): walk up the agent process's parents.
//! One Toolhelp snapshot per walk (spike S3), at most 8 steps, with reused PID protection.
use crate::model::App;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Clone, Debug, PartialEq)]
pub struct Proc { pub pid: u32, pub parent: u32, pub exe: String, pub created: Option<u64> }

/// Process snapshot: `pid → (parent, name)`. Read live creation time only for processes visited in the walk.
pub struct ProcTable { procs: HashMap<u32, Proc>, live: bool }

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct Host {
    pub app: App,
    /// `App::Other` program name.
    #[serde(default)]
    pub name: Option<String>,
    pub pid: u32,
}

const MAX_STEPS: usize = 8;

impl ProcTable {
    pub fn from_procs(v: Vec<Proc>) -> ProcTable {
        ProcTable { procs: v.into_iter().map(|p| (p.pid, p)).collect(), live: false }
    }

    #[cfg(windows)]
    pub fn snapshot() -> ProcTable {
        let procs = crate::pid::process_list().into_iter()
            .map(|(pid, parent, exe)| (pid, Proc { pid, parent, exe, created: None })).collect();
        ProcTable { procs, live: true }
    }

    pub fn get(&self, pid: u32) -> Option<&Proc> { self.procs.get(&pid) }

    /// Creation time (FILETIME); absent if it cannot be checked (e.g. access denied).
    pub fn created(&self, pid: u32) -> Option<u64> {
        let p = self.procs.get(&pid)?;
        if p.created.is_some() || !self.live { return p.created; }
        #[cfg(windows)]
        { crate::pid::process_created(pid) }
        #[cfg(not(windows))]
        { None }
    }
}

/// Program by file name. Deliberately exclude `claude.exe`: both the CLI and Claude app use it (spike S3).
pub fn app_of_exe(exe: &str) -> Option<App> {
    let e = exe.to_ascii_lowercase();
    Some(match e.as_str() {
        "t3 code.exe" | "t3code.exe" => App::T3code,
        "code.exe" | "code - insiders.exe" => App::Vscode,
        "cursor.exe" => App::Cursor,
        // since 2.0: the "Antigravity" app and a separate "Antigravity IDE"
        "antigravity.exe" | "antigravity ide.exe" => App::Antigravity,
        "zed.exe" => App::Zed,
        // verified live: %LOCALAPPDATA%\Programs\ZCode\ZCode.exe
        "zcode.exe" => App::Zcode,
        "idea64.exe" | "pycharm64.exe" | "webstorm64.exe" | "goland64.exe" | "rider64.exe" | "clion64.exe"
            | "rustrover64.exe" | "phpstorm64.exe" => App::Jetbrains,
        "windowsterminal.exe" => App::Terminal,
        _ => return None,
    })
}

/// A reported PID may steer focus only to a live process running in a known terminal or IDE, never to this app.
pub fn focusable_pid(t: &ProcTable, pid: u32, self_pid: u32) -> bool {
    if pid == 0 || pid == self_pid { return false; }
    let Some(p) = t.get(pid) else { return false };
    app_of_exe(&p.exe).is_some() || host_of(t, pid).is_some()
}

/// Nearest known program above `pid`: a standalone terminal keeps its identity even when an IDE launched it.
/// Among same-named program processes, take the highest one: only the main process has a window to jump to.
pub fn host_of(t: &ProcTable, pid: u32) -> Option<Host> {
    let mut chain: Vec<u32> = Vec::new();
    let mut cur = pid;
    for _ in 0..MAX_STEPS {
        let Some(p) = t.get(cur) else { break };
        let parent = p.parent;
        if parent == 0 || parent == cur || chain.contains(&parent) || t.get(parent).is_none() { break; }
        // parent younger than child: its PID was reused, so it is not our ancestor
        if let (Some(pc), Some(cc)) = (t.created(parent), t.created(cur)) { if pc > cc { break; } }
        chain.push(parent);
        cur = parent;
    }
    let found: Vec<(usize, App)> = chain.iter().enumerate()
        .filter_map(|(i, p)| t.get(*p).and_then(|x| app_of_exe(&x.exe)).map(|a| (i, a))).collect();
    let (i, app) = found.first().copied()?;
    let exe = t.get(chain[i])?.exe.to_ascii_lowercase();
    let mut top = i;
    while top + 1 < chain.len() && t.get(chain[top + 1]).map(|x| x.exe.to_ascii_lowercase() == exe).unwrap_or(false) { top += 1; }
    Some(Host { app, name: None, pid: chain[top] })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn p(pid: u32, parent: u32, exe: &str, created: u64) -> Proc { Proc { pid, parent, exe: exe.into(), created: Some(created) } }

    #[test]
    fn a_terminal_inside_vs_code_belongs_to_vs_code() {
        let t = ProcTable::from_procs(vec![p(1, 2, "pwsh.exe", 50), p(2, 3, "cmd.exe", 40), p(3, 4, "claude.exe", 30),
            p(4, 5, "Code.exe", 20), p(5, 6, "Code.exe", 10), p(6, 0, "explorer.exe", 1)]);
        assert_eq!(host_of(&t, 1), Some(Host { app: App::Vscode, name: None, pid: 5 }), "main VS Code process, not a helper");
    }

    #[test]
    fn windows_terminal_is_the_host_when_nothing_else_is_above() {
        let t = ProcTable::from_procs(vec![p(1, 2, "pwsh.exe", 50), p(2, 3, "WindowsTerminal.exe", 40), p(3, 0, "explorer.exe", 1)]);
        assert_eq!(host_of(&t, 1).map(|h| (h.app, h.pid)), Some((App::Terminal, 2)));
    }

    #[test]
    fn a_terminal_launched_from_an_ide_owns_its_window() {
        let t = ProcTable::from_procs(vec![p(1, 2, "pwsh.exe", 50), p(2, 3, "WindowsTerminal.exe", 40), p(3, 0, "Code.exe", 30)]);
        assert_eq!(host_of(&t, 1).map(|h| (h.app, h.pid)), Some((App::Terminal, 2)));
    }

    #[test]
    fn an_integrated_shell_belongs_to_its_ide() {
        for exe in ["Cursor.exe", "idea64.exe"] {
            let t = ProcTable::from_procs(vec![p(1, 2, "pwsh.exe", 50), p(2, 3, "conhost.exe", 40), p(3, 0, exe, 30)]);
            assert_eq!(host_of(&t, 1).map(|h| h.pid), Some(3), "{exe}");
        }
    }

    #[test]
    fn a_loop_in_the_table_stops() {
        let t = ProcTable::from_procs(vec![p(1, 2, "a.exe", 10), p(2, 1, "b.exe", 10)]);
        assert_eq!(host_of(&t, 1), None);
    }

    #[test]
    fn a_reused_parent_pid_stops_the_walk() {
        // the claude.exe parent exited and a later VS Code process reused its PID
        let t = ProcTable::from_procs(vec![p(1, 2, "claude.exe", 50), p(2, 0, "Code.exe", 90)]);
        assert_eq!(host_of(&t, 1), None);
    }

    #[test]
    fn claude_and_unknown_programs_are_not_hosts() {
        let t = ProcTable::from_procs(vec![p(1, 2, "claude.exe", 50), p(2, 3, "claude.exe", 40), p(3, 0, "explorer.exe", 1)]);
        assert_eq!(host_of(&t, 1), None);
        assert_eq!(app_of_exe("claude.exe"), None);
    }

    #[test]
    fn exe_names_map_case_insensitively() {
        for (exe, app) in [("T3 Code.exe", App::T3code), ("t3code.exe", App::T3code), ("code.exe", App::Vscode),
                           ("Code - Insiders.exe", App::Vscode), ("Cursor.exe", App::Cursor), ("Antigravity.exe", App::Antigravity), ("Antigravity IDE.exe", App::Antigravity),
                           ("zed.exe", App::Zed), ("idea64.exe", App::Jetbrains), ("RustRover64.exe", App::Jetbrains),
                           ("windowsterminal.exe", App::Terminal), ("ZCode.exe", App::Zcode)] {
            assert_eq!(app_of_exe(exe), Some(app), "{exe}");
        }
    }

    #[test]
    fn a_door_pid_must_name_a_live_session_process_other_than_this_app() {
        let t = ProcTable::from_procs(vec![p(1, 0, "Agent Pets.exe", 1), p(2, 3, "pwsh.exe", 5),
            p(3, 0, "WindowsTerminal.exe", 1), p(4, 2, "node.exe", 9), p(7, 0, "Cursor.exe", 1),
            p(5, 0, "explorer.exe", 1), p(6, 0, "svchost.exe", 1), p(8, 5, "notepad.exe", 9)]);
        for pid in [2, 3, 4, 7] { assert!(focusable_pid(&t, pid, 1), "{pid}"); }
        for pid in [0, 1, 5, 6, 8, 99] { assert!(!focusable_pid(&t, pid, 1), "{pid}"); }
        assert!(!focusable_pid(&t, 4, 4), "never this app");
    }

    #[test]
    fn the_walk_is_at_most_eight_steps() {
        let mut v: Vec<Proc> = (1..=12).map(|i| p(i, i + 1, "cmd.exe", 100 - i as u64)).collect();
        v.push(p(13, 0, "Code.exe", 1));
        assert_eq!(host_of(&ProcTable::from_procs(v), 1), None);
    }

    #[cfg(windows)]
    #[test]
    fn the_snapshot_knows_this_process_and_its_parent() {
        let t = ProcTable::snapshot();
        let me = t.get(std::process::id()).expect("current process in snapshot");
        assert_eq!(Some(me.parent), crate::pid::process_entry(std::process::id()).map(|(p, _)| p));
        assert!(t.created(std::process::id()).is_some());
    }

    #[test]
    fn a_0_9_hook_envelope_has_no_host() {
        let e: crate::claude::HookEnvelope = serde_json::from_value(serde_json::json!({"ts": 1, "ppid": 2, "payload": {}})).unwrap();
        assert_eq!(e.host, None);
    }
}
