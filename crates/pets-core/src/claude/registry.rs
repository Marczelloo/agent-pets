//! Rejestr żywych sesji Claude Code: `~/.claude/sessions/<pid>.json` (odkryty przy weryfikacji fazy 1).
use std::path::Path;
use crate::model::*;

#[derive(Clone, Debug, PartialEq)]
pub struct LiveSession {
    pub pid: u32,
    pub session_id: String,
    pub cwd: String,
    pub entrypoint: String,
    /// `name` z rejestru, pominięte gdy `nameSource == "derived"` (nazwa z katalogu, gorsza niż ai-title)
    pub title: Option<String>,
    pub started_at: i64,
}

impl LiveSession {
    pub fn to_event(&self) -> Event {
        let mut e = Event::new(Source::Claude, self.session_id.clone(), Kind::SessionStart, self.started_at);
        e.data.pid = Some(self.pid);
        e.data.cwd = Some(self.cwd.clone());
        e.data.title = self.title.clone();
        let (origin, app) = match self.entrypoint.as_str() {
            "claude-desktop" => (Origin::Desktop, App::ClaudeDesktop),
            _ => (Origin::Cli, App::Terminal),
        };
        e.data.origin = Some(origin);
        e.data.app = Some(app);
        e
    }
}

pub fn read_registry(dir: &Path) -> Vec<LiveSession> {
    let Ok(rd) = std::fs::read_dir(dir) else { return vec![] };
    rd.flatten()
        .filter(|f| f.path().extension().and_then(|x| x.to_str()) == Some("json"))
        .filter_map(|f| {
            let v: serde_json::Value = serde_json::from_str(&std::fs::read_to_string(f.path()).ok()?).ok()?;
            let s = |k: &str| v.get(k).and_then(|x| x.as_str());
            let derived = s("nameSource") == Some("derived");
            Some(LiveSession {
                pid: v.get("pid")?.as_u64()? as u32,
                session_id: s("sessionId")?.to_string(),
                cwd: s("cwd").unwrap_or("").to_string(),
                entrypoint: s("entrypoint").unwrap_or("").to_string(),
                title: if derived { None } else { s("name").map(String::from) },
                started_at: v.get("startedAt").and_then(|x| x.as_i64()).unwrap_or(0),
            })
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn write(dir: &Path, name: &str, body: &str) { std::fs::write(dir.join(name), body).unwrap(); }

    #[test]
    fn reads_live_sessions_and_skips_junk() {
        let dir = tempfile::tempdir().unwrap();
        write(dir.path(), "100.json", r#"{"pid":100,"sessionId":"a","cwd":"C:\\p","startedAt":5,"entrypoint":"claude-desktop","name":"Widżet","nameSource":"user","status":"busy"}"#);
        write(dir.path(), "200.json", r#"{"pid":200,"sessionId":"b","cwd":"C:\\q","startedAt":6,"entrypoint":"cli","name":"user-cd","nameSource":"derived","status":"idle"}"#);
        write(dir.path(), "300.abc.key", "x");
        write(dir.path(), "400.json", "{zepsuty");
        let mut v = read_registry(dir.path());
        v.sort_by_key(|s| s.pid);
        assert_eq!(v.len(), 2);
        assert_eq!((v[0].pid, v[0].session_id.as_str(), v[0].title.as_deref()), (100, "a", Some("Widżet")));
        assert_eq!(v[1].title, None, "nazwa wyprowadzona z katalogu nie jest tytułem");
        assert!(read_registry(&dir.path().join("brak")).is_empty());
    }

    #[test]
    fn live_session_becomes_session_start_with_pid() {
        let s = LiveSession { pid: 7, session_id: "a".into(), cwd: "C:\\p".into(), entrypoint: "cli".into(),
                              title: Some("T".into()), started_at: 42 };
        let e = s.to_event();
        assert_eq!((e.kind, e.session_id.as_str(), e.ts), (Kind::SessionStart, "a", 42));
        assert_eq!((e.data.pid, e.data.origin, e.data.app), (Some(7), Some(Origin::Cli), Some(App::Terminal)));
        assert_eq!((e.data.title.as_deref(), e.data.cwd.as_deref()), (Some("T"), Some("C:\\p")));
    }
}
