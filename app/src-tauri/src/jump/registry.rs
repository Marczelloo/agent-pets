//! Dane sesji z rejestru Claude Code (`~/.claude/sessions/<pid>.json`), czytane w chwili „Przejdź”:
//! sesje utworzone po starcie widżetu też mają tam `hostSessionId`.
use std::path::Path;

#[derive(Clone, Debug, PartialEq)]
pub struct Entry { pub pid: u32, pub session_id: String, pub entrypoint: String, pub host_session_id: Option<String> }

pub fn find(home: &Path, session_id: &str) -> Option<Entry> {
    let dir = home.join(".claude").join("sessions");
    std::fs::read_dir(dir).ok()?.flatten()
        .filter(|f| f.path().extension().and_then(|x| x.to_str()) == Some("json"))
        .filter_map(|f| serde_json::from_slice::<serde_json::Value>(&std::fs::read(f.path()).ok()?).ok())
        .find(|v| v["sessionId"].as_str() == Some(session_id))
        .map(|v| Entry {
            pid: v["pid"].as_u64().unwrap_or(0) as u32,
            session_id: session_id.to_string(),
            entrypoint: v["entrypoint"].as_str().unwrap_or("").to_string(),
            host_session_id: v["hostSessionId"].as_str().map(String::from),
        })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn finds_the_desktop_host_session_id() {
        let d = tempfile::tempdir().unwrap();
        let dir = d.path().join(".claude").join("sessions");
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(dir.join("7.json"),
            r#"{"pid":7,"sessionId":"s1","entrypoint":"claude-desktop","hostSessionId":"local_ab"}"#).unwrap();
        std::fs::write(dir.join("8.json"), "{bad").unwrap();
        let e = find(d.path(), "s1").unwrap();
        assert_eq!((e.pid, e.entrypoint.as_str(), e.host_session_id.as_deref()), (7, "claude-desktop", Some("local_ab")));
        assert!(find(d.path(), "inny").is_none());
    }
}
