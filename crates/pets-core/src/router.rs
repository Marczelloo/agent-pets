//! Agent Router tasks from `~/.agent-router/status.json` (public router file, version 1).
//! A task links to a Codex pet by `threadId` (the rollout session has the same ID),
//! gives it the task title and health data, and shows an error for a failed task (spec 5.1).
use crate::model::*;
use crate::time::rfc3339_ms;
use serde_json::Value;
use std::path::PathBuf;
use std::time::SystemTime;

pub const FILE: &str = "status.json";
pub const POLL_MS: i64 = 1000;

/// Router MCP tool names can have any registered server prefix.
pub fn linking_tool(name: &str) -> bool {
    name.strip_prefix("mcp__").and_then(|rest| rest.rsplit_once("__"))
        .is_some_and(|(_, tool)| matches!(tool, "codex_delegate" | "codex_continue" | "codex_review"))
}

pub fn to_events(bytes: &[u8]) -> Vec<Event> {
    let Ok(v) = serde_json::from_slice::<Value>(bytes) else { return vec![] };
    if v.get("version").and_then(Value::as_i64) != Some(1) { return vec![]; }
    let stall_ms = v.get("stallSeconds").and_then(Value::as_i64).unwrap_or(180) * 1000;
    let Some(tasks) = v.get("tasks").and_then(Value::as_array) else { return vec![] };
    tasks.iter().flat_map(|t| task_events(t, stall_ms)).collect()
}

fn task_events(t: &Value, stall_ms: i64) -> Vec<Event> {
    let s = |k: &str| t.get(k).and_then(Value::as_str);
    let (Some(thread), Some(task_id), Some(ts)) = (s("threadId"), s("taskId"), s("updatedAt").and_then(rfc3339_ms))
        else { return vec![] };
    let status = s("status").unwrap_or("").to_string();
    let mut meta = Event::new(Source::Router, thread, Kind::Meta, ts);
    meta.data.title = s("title").filter(|x| !x.is_empty()).map(String::from);
    meta.data.origin = Some(Origin::Router);
    meta.data.cwd = s("workingDirectory").map(String::from);
    meta.data.router_task = Some(RouterTask {
        task_id: task_id.into(), status: status.clone(),
        last_activity_at: s("lastActivityAt").and_then(rfc3339_ms),
        blocked: t.get("blocked").and_then(Value::as_bool).unwrap_or(false), stall_ms,
    });
    let mut out = vec![meta];
    if status == "failed" || status == "quota_exhausted" { out.push(Event::new(Source::Router, thread, Kind::Error, ts)); }
    out
}

pub struct Poller { path: PathBuf, next_check: i64, seen: Option<SystemTime> }

impl Poller {
    pub fn new(path: PathBuf) -> Poller { Poller { path, next_check: i64::MIN, seen: None } }

    /// The next `poll` rereads the file (e.g. after re-enabling the router in settings).
    pub fn reset(&mut self) { self.seen = None; self.next_check = i64::MIN; }

    /// Check mtime every `POLL_MS`; read the entire (small) file only after a change.
    pub fn poll(&mut self, now: i64) -> Vec<Event> {
        if now < self.next_check { return vec![]; }
        self.next_check = now + POLL_MS;
        let Some(m) = std::fs::metadata(&self.path).ok().and_then(|m| m.modified().ok()) else { return vec![] };
        if self.seen == Some(m) { return vec![]; }
        // remember the timestamp only after a successful read; retry a failed read (temporarily locked file)
        let Ok(bytes) = std::fs::read(&self.path) else { return vec![] };
        self.seen = Some(m);
        to_events(&bytes)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn router_linking_uses_the_mcp_tool_suffix() {
        for server in ["agent-router", "router", "plugin_x_agent-router"] {
            assert!(linking_tool(&format!("mcp__{server}__codex_delegate")));
            assert!(linking_tool(&format!("mcp__{server}__codex_continue")));
            assert!(linking_tool(&format!("mcp__{server}__codex_review")));
        }
        assert!(!linking_tool("mcp__router__codex_task_status"));
        assert!(!linking_tool("codex_delegate"));
    }

    fn fixture() -> Vec<u8> { include_bytes!("../tests/fixtures/router/status.json").to_vec() }

    #[test]
    fn running_task_gives_the_codex_pet_its_title_and_health_inputs() {
        let ev = to_events(&fixture());
        let e = ev.iter().find(|e| e.session_id == "01a0aaaa-0000-7000-8000-000000000001").unwrap();
        assert_eq!((e.kind, e.source), (Kind::Meta, Source::Router));
        assert_eq!(e.ts, crate::time::rfc3339_ms("2026-09-25T11:59:50.000Z").unwrap());
        assert_eq!(e.data.title.as_deref(), Some("Count Rust files in crates"));
        assert_eq!((e.data.origin, e.data.cwd.as_deref()), (Some(Origin::Router), Some("C:/work/project")));
        assert_eq!(e.data.router_task, Some(RouterTask {
            task_id: "t_run".into(), status: "running".into(),
            last_activity_at: crate::time::rfc3339_ms("2026-09-25T11:59:40.000Z"), blocked: false, stall_ms: 180_000,
        }));
    }

    #[test]
    fn failed_task_shows_an_error() {
        let ev = to_events(&fixture());
        let kinds: Vec<Kind> = ev.iter().filter(|e| e.session_id.ends_with("0002")).map(|e| e.kind).collect();
        assert_eq!(kinds, vec![Kind::Meta, Kind::Error]);
    }

    #[test]
    fn task_without_a_thread_is_skipped() {
        assert_eq!(to_events(&fixture()).iter().filter(|e| e.kind == Kind::Meta).count(), 2);
    }

    #[test]
    fn broken_empty_or_future_files_give_nothing() {
        assert!(to_events(b"").is_empty());
        assert!(to_events(b"{bad").is_empty());
        let v2 = String::from_utf8(fixture()).unwrap().replace("\"version\": 1", "\"version\": 2");
        assert!(to_events(v2.as_bytes()).is_empty());
    }

    #[cfg(windows)]
    #[test]
    fn a_failed_read_is_retried_instead_of_losing_the_change() {
        // an antivirus may hold the file: the timestamp changed, but reading failed
        use std::os::windows::fs::OpenOptionsExt;
        let d = tempfile::tempdir().unwrap();
        let f = d.path().join(FILE);
        std::fs::write(&f, fixture()).unwrap();
        let mut p = Poller::new(f.clone());
        let lock = std::fs::OpenOptions::new().read(true).share_mode(0).open(&f).unwrap();
        assert!(p.poll(0).is_empty(), "file locked");
        drop(lock);
        assert_eq!(p.poll(POLL_MS).len(), 3, "same change read on the next attempt");
    }

    #[test]
    fn poller_reads_once_per_change_and_at_most_every_second() {
        let d = tempfile::tempdir().unwrap();
        let f = d.path().join(FILE);
        std::fs::write(&f, fixture()).unwrap();
        let mut p = Poller::new(f.clone());
        assert_eq!(p.poll(0).len(), 3);
        assert!(p.poll(POLL_MS).is_empty(), "file did not change");
        let modified = std::fs::metadata(&f).unwrap().modified().unwrap();
        std::fs::write(&f, fixture()).unwrap();
        std::fs::File::options().write(true).open(&f).unwrap()
            .set_modified(modified + std::time::Duration::from_secs(2)).unwrap();
        assert!(p.poll(POLL_MS + 1).is_empty(), "too early");
        assert_eq!(p.poll(2 * POLL_MS).len(), 3);
    }
}
