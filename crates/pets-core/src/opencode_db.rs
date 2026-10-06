//! opencode usage from its read-only database `~/.local/share/opencode/opencode.db` (spec 0.11 §4.1).
//! The same database holds login tokens (`credential`, `account`…), so queries touch only the
//! `session`, `message`, and `part` tables and read only selected `data` fields via `json_extract`.
//! Any error (missing file, lock, older schema) means no data, without a message.
use crate::model::Agent;
use rusqlite::types::ValueRef;
use rusqlite::{Connection, OpenFlags, Row};
use std::path::{Path, PathBuf};

const SESSION_USAGE: &str = "SELECT id, tokens_input + tokens_output + tokens_reasoning + tokens_cache_read + tokens_cache_write, cost \
    FROM session WHERE id = ?1";
const LAST_PROVIDER: &str = "SELECT json_extract(data,'$.providerID') FROM message \
    WHERE session_id = ?1 AND json_extract(data,'$.role') = 'assistant' ORDER BY time_created DESC LIMIT 1";
const TODAY: &str = "SELECT COALESCE(SUM(COALESCE(json_extract(data,'$.tokens.input'),0) + COALESCE(json_extract(data,'$.tokens.output'),0) \
    + COALESCE(json_extract(data,'$.tokens.reasoning'),0) + COALESCE(json_extract(data,'$.tokens.cache.read'),0) \
    + COALESCE(json_extract(data,'$.tokens.cache.write'),0)),0), COALESCE(SUM(json_extract(data,'$.cost')),0) \
    FROM message WHERE time_created >= ?1 AND json_extract(data,'$.role') = 'assistant'";
const SESSIONS: &str = "SELECT id, time_updated, parent_id IS NOT NULL, directory FROM session";
const MESSAGES: &str = "SELECT json_extract(data,'$.role'), json_extract(data,'$.providerID'), json_extract(data,'$.modelID'), \
    json_extract(data,'$.time.created'), json_extract(data,'$.time.completed'), json_extract(data,'$.tokens.input'), \
    json_extract(data,'$.tokens.output'), json_extract(data,'$.tokens.reasoning'), json_extract(data,'$.tokens.cache.read'), \
    json_extract(data,'$.tokens.cache.write'), json_extract(data,'$.cost'), json_extract(data,'$.path.cwd'), time_created \
    FROM message WHERE session_id = ?1 ORDER BY time_created";
const TOOLS: &str = "SELECT time_created, json_extract(data,'$.tool') FROM part \
    WHERE session_id = ?1 AND json_extract(data,'$.type') = 'tool' ORDER BY time_created";

/// All module queries; functions use only these constants (a test checks tables and fields).
pub const QUERIES: &[&str] = &[SESSION_USAGE, LAST_PROVIDER, TODAY, SESSIONS, MESSAGES, TOOLS];

pub fn db_path(home: &Path) -> PathBuf { home.join(".local").join("share").join("opencode").join("opencode.db") }

#[cfg(test)]
thread_local! {
    /// Database open count in this thread (test: disabled integration never opens it). Per thread because tests
    /// run in parallel.
    pub static OPENS: std::cell::Cell<usize> = const { std::cell::Cell::new(0) };
}

/// Read-only connection for one read; a lock longer than 200 ms fails the query.
pub fn open(path: &Path) -> Option<Connection> {
    #[cfg(test)]
    OPENS.with(|n| n.set(n.get() + 1));
    if !path.is_file() { return None; }
    let c = Connection::open_with_flags(path, OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_NO_MUTEX).ok()?;
    c.busy_timeout(std::time::Duration::from_millis(200)).ok()?;
    Some(c)
}

/// Number from a cell: integer or floating point; missing, text, negative, or infinite becomes 0.
fn num(r: &Row, i: usize) -> f64 {
    let v = match r.get_ref(i) { Ok(ValueRef::Integer(n)) => n as f64, Ok(ValueRef::Real(x)) => x, _ => 0.0 };
    if v.is_finite() && v > 0.0 { v } else { 0.0 }
}
fn count(r: &Row, i: usize) -> u64 { num(r, i) as u64 }
fn text(r: &Row, i: usize) -> Option<String> { r.get::<_, Option<String>>(i).ok().flatten() }

#[derive(Clone, Debug, PartialEq)]
pub struct SessionUsage { pub id: String, pub tokens: u64, pub cost: f64, pub provider: Option<String> }

/// Usage of selected sessions (IDs without the `opencode:` prefix); missing sessions are skipped.
pub fn session_usage(c: &Connection, ids: &[&str]) -> Vec<SessionUsage> {
    ids.iter().filter_map(|id| {
        let (id, tokens, cost) = c.query_row(SESSION_USAGE, [id], |r| Ok((r.get::<_, String>(0)?, count(r, 1), num(r, 2)))).ok()?;
        let provider = c.query_row(LAST_PROVIDER, [&id], |r| Ok(text(r, 0))).ok().flatten();
        Some(SessionUsage { id, tokens, cost, provider })
    }).collect()
}

/// Response tokens and cost since `since_ms` (local midnight), across all sessions.
pub fn today(c: &Connection, since_ms: i64) -> (u64, f64) {
    c.query_row(TODAY, [since_ms], |r| Ok((count(r, 0), num(r, 1)))).unwrap_or((0, 0.0))
}

/// Account whose limits apply to a session: zero cost with real usage means a subscription (with an API key
/// opencode calculates cost). Without `auth.json`: provider and cost are all we know.
pub fn account_for(u: &SessionUsage) -> Option<Agent> {
    if u.cost != 0.0 || u.tokens == 0 { return None; }
    match u.provider.as_deref()? {
        "openai" => Some(Agent::Codex),
        "anthropic" => Some(Agent::Claude),
        _ => None,
    }
}

#[derive(Clone, Debug, PartialEq)]
pub struct DbSession { pub id: String, pub updated: i64, pub parent: bool, pub directory: String }

pub fn sessions(c: &Connection) -> Vec<DbSession> {
    let Ok(mut st) = c.prepare(SESSIONS) else { return vec![] };
    st.query_map([], |r| Ok(DbSession { id: r.get(0)?, updated: num(r, 1) as i64, parent: r.get(2)?, directory: text(r, 3).unwrap_or_default() }))
        .map(|rows| rows.flatten().collect()).unwrap_or_default()
}

/// Counts for one message; no content (the structure has no place for it).
#[derive(Clone, Debug, PartialEq)]
pub struct DbMessage {
    pub role: String, pub provider: Option<String>, pub model: Option<String>, pub created: i64, pub completed: Option<i64>,
    pub input: u64, pub output: u64, pub reasoning: u64, pub cache_read: u64, pub cache_write: u64, pub cost: f64, pub cwd: Option<String>,
}

/// Session messages; `None` on read error (lock, different schema), distinct from a session without messages.
pub fn messages(c: &Connection, session: &str) -> Option<Vec<DbMessage>> {
    let mut st = c.prepare(MESSAGES).ok()?;
    let rows = st.query_map([session], |r| {
        // time from message data, or from the row column if missing
        let created = Some(num(r, 3) as i64).filter(|t| *t > 0).unwrap_or_else(|| num(r, 12) as i64);
        Ok(DbMessage {
            role: text(r, 0).unwrap_or_default(), provider: text(r, 1), model: text(r, 2), created,
            completed: Some(num(r, 4) as i64).filter(|t| *t > 0),
            input: count(r, 5), output: count(r, 6), reasoning: count(r, 7), cache_read: count(r, 8), cache_write: count(r, 9),
            cost: num(r, 10), cwd: text(r, 11),
        })
    }).ok()?;
    rows.collect::<Result<Vec<_>, _>>().ok()
}

/// Session tool calls: (time, tool name); `None` on read error.
pub fn tools(c: &Connection, session: &str) -> Option<Vec<(i64, String)>> {
    let mut st = c.prepare(TOOLS).ok()?;
    let rows = st.query_map([session], |r| Ok((num(r, 0) as i64, text(r, 1).unwrap_or_default()))).ok()?;
    Some(rows.collect::<Result<Vec<_>, _>>().ok()?.into_iter().filter(|(_, n)| !n.is_empty()).collect())
}

/// Test databases with the opencode schema (spike S3), shared by this module, runtime, and statistics tests.
#[cfg(test)]
pub(crate) mod fixture {
    use rusqlite::params;

    /// User-like database (spike S3), with a login token table that must not be read.
    pub fn db(dir: &std::path::Path) -> std::path::PathBuf {
        std::fs::create_dir_all(dir).unwrap();
        let p = dir.join("opencode.db");
        let c = rusqlite::Connection::open(&p).unwrap();
        c.execute_batch("
            CREATE TABLE session (id text PRIMARY KEY, project_id text NOT NULL, parent_id text, slug text NOT NULL, directory text NOT NULL,
              title text NOT NULL, version text NOT NULL, time_created integer NOT NULL, time_updated integer NOT NULL, model text,
              cost real DEFAULT 0 NOT NULL, tokens_input integer DEFAULT 0 NOT NULL, tokens_output integer DEFAULT 0 NOT NULL,
              tokens_reasoning integer DEFAULT 0 NOT NULL, tokens_cache_read integer DEFAULT 0 NOT NULL, tokens_cache_write integer DEFAULT 0 NOT NULL);
            CREATE TABLE message (id text PRIMARY KEY, session_id text NOT NULL, time_created integer NOT NULL, time_updated integer NOT NULL, data text NOT NULL);
            CREATE TABLE part (id text PRIMARY KEY, message_id text NOT NULL, session_id text NOT NULL, time_created integer NOT NULL,
              time_updated integer NOT NULL, data text NOT NULL);
            CREATE TABLE credential (id text PRIMARY KEY, label text NOT NULL, value text NOT NULL);
            INSERT INTO credential VALUES ('c1', 'openai', 'SEKRET-123');
        ").unwrap();
        p
    }

    pub fn session(c: &rusqlite::Connection, id: &str, parent: Option<&str>, updated: i64, cost: f64, t: [i64; 5]) {
        c.execute("INSERT INTO session VALUES (?1, 'p', ?2, 's', 'C:/work/app', 'SEKRET-123 title', '1', 1, ?3, NULL, ?4, ?5, ?6, ?7, ?8, ?9)",
            params![id, parent, updated, cost, t[0], t[1], t[2], t[3], t[4]]).unwrap();
    }

    pub fn message(c: &rusqlite::Connection, id: &str, sid: &str, created: i64, data: serde_json::Value) {
        c.execute("INSERT INTO message VALUES (?1, ?2, ?3, ?3, ?4)", params![id, sid, created, data.to_string()]).unwrap();
    }

    pub fn reply(provider: &str, created: i64, tokens: [i64; 5], cost: f64) -> serde_json::Value {
        serde_json::json!({"role": "assistant", "providerID": provider, "modelID": "gpt-6-sol", "cost": cost,
            "tokens": {"input": tokens[0], "output": tokens[1], "reasoning": tokens[2], "cache": {"read": tokens[3], "write": tokens[4]}},
            "time": {"created": created, "completed": created + 500}, "path": {"cwd": "C:/work/app", "root": "C:/work"},
            "summary": {"body": "SEKRET-123"}})
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use super::fixture::*;
    use rusqlite::params;

    #[test]
    fn a_session_adds_up_its_five_token_columns_and_names_its_last_provider() {
        let d = tempfile::tempdir().unwrap();
        let p = db(d.path());
        {
            let w = rusqlite::Connection::open(&p).unwrap();
            session(&w, "ses_a", None, 10, 0.0, [100, 20, 5, 1000, 50]);
            message(&w, "m1", "ses_a", 1, reply("anthropic", 1, [1, 1, 0, 0, 0], 0.0));
            message(&w, "m2", "ses_a", 2, reply("openai", 2, [1, 1, 0, 0, 0], 0.0));
        }
        let c = open(&p).expect("baza");
        let u = session_usage(&c, &["ses_a", "ses_missing"]);
        assert_eq!(u, vec![SessionUsage { id: "ses_a".into(), tokens: 1175, cost: 0.0, provider: Some("openai".into()) }]);
    }

    #[test]
    fn today_counts_only_replies_since_midnight() {
        let d = tempfile::tempdir().unwrap();
        let p = db(d.path());
        {
            let w = rusqlite::Connection::open(&p).unwrap();
            message(&w, "old", "s", 999_940_000, reply("openai", 999_940_000, [1000, 0, 0, 0, 0], 1.0));
            message(&w, "new", "s", 1_000_000_000, reply("openai", 1_000_000_000, [10, 20, 3, 400, 5], 0.25));
            message(&w, "q", "s", 1_000_000_100, serde_json::json!({"role": "user", "tokens": {"input": 999}}));
        }
        let c = open(&p).unwrap();
        let (tokens, cost) = today(&c, 1_000_000_000);
        assert_eq!((tokens, cost), (438, 0.25));
    }

    #[test]
    fn the_account_is_known_only_for_subscriptions_of_openai_and_anthropic() {
        let u = |p: &str, tokens: u64, cost: f64| SessionUsage { id: "s".into(), tokens, cost, provider: Some(p.into()) };
        assert_eq!(account_for(&u("openai", 10, 0.0)), Some(crate::model::Agent::Codex));
        assert_eq!(account_for(&u("anthropic", 10, 0.0)), Some(crate::model::Agent::Claude));
        assert_eq!(account_for(&u("openai", 10, 0.5)), None, "koszt > 0 to klucz API");
        assert_eq!(account_for(&u("zai-coding-plan", 10, 0.0)), None);
        assert_eq!(account_for(&u("openai", 0, 0.0)), None, "no usage means no account information");
        assert_eq!(account_for(&SessionUsage { id: "s".into(), tokens: 10, cost: 0.0, provider: None }), None);
    }

    #[test]
    fn sessions_messages_and_tools_carry_numbers_and_names_only() {
        let d = tempfile::tempdir().unwrap();
        let p = db(d.path());
        {
            let w = rusqlite::Connection::open(&p).unwrap();
            session(&w, "ses_p", None, 20, 0.0, [0; 5]);
            session(&w, "ses_k", Some("ses_p"), 30, 0.0, [0; 5]);
            message(&w, "m1", "ses_p", 5, serde_json::json!({"role": "user", "time": {"created": 5}, "summary": {"title": "SEKRET-123"}}));
            message(&w, "m2", "ses_p", 6, reply("openai", 6, [1, 2, 3, 4, 5], 0.0));
            w.execute("INSERT INTO part VALUES ('p1', 'm2', 'ses_p', 7, 7, ?1)",
                params![serde_json::json!({"type": "tool", "tool": "bash", "state": {"input": {"command": "SEKRET-123"}}}).to_string()]).unwrap();
            w.execute("INSERT INTO part VALUES ('p2', 'm2', 'ses_p', 8, 8, ?1)",
                params![serde_json::json!({"type": "text", "text": "SEKRET-123"}).to_string()]).unwrap();
        }
        let c = open(&p).unwrap();
        let mut s = sessions(&c);
        s.sort_by(|a, b| a.id.cmp(&b.id));
        assert_eq!(s, vec![DbSession { id: "ses_k".into(), updated: 30, parent: true, directory: "C:/work/app".into() },
                           DbSession { id: "ses_p".into(), updated: 20, parent: false, directory: "C:/work/app".into() }]);
        let m = messages(&c, "ses_p").unwrap();
        assert_eq!(m.len(), 2);
        assert_eq!((m[0].role.as_str(), m[0].created), ("user", 5));
        assert_eq!((m[1].role.as_str(), m[1].provider.as_deref(), m[1].model.as_deref()), ("assistant", Some("openai"), Some("gpt-6-sol")));
        assert_eq!((m[1].input, m[1].output, m[1].reasoning, m[1].cache_read, m[1].cache_write), (1, 2, 3, 4, 5));
        assert_eq!((m[1].completed, m[1].cwd.as_deref()), (Some(506), Some("C:/work/app")));
        assert_eq!(tools(&c, "ses_p"), Some(vec![(7, "bash".to_string())]));
        assert!(!format!("{s:?}{m:?}{:?}", tools(&c, "ses_p")).contains("SEKRET"));
    }

    #[test]
    fn a_missing_old_or_locked_database_gives_no_data() {
        let d = tempfile::tempdir().unwrap();
        assert!(open(&d.path().join("nope.db")).is_none());
        let old = d.path().join("old.db");
        rusqlite::Connection::open(&old).unwrap()
            .execute_batch("CREATE TABLE session (id text PRIMARY KEY, time_updated integer); INSERT INTO session VALUES ('s', 1);").unwrap();
        let c = open(&old).unwrap();
        assert!(session_usage(&c, &["s"]).is_empty());
        assert_eq!(today(&c, 0), (0, 0.0));
        assert!(messages(&c, "s").is_none() && tools(&c, "s").is_none(), "an error is not an empty session");
        let p = db(d.path());
        let w = rusqlite::Connection::open(&p).unwrap();
        session(&w, "ses_a", None, 1, 0.0, [1, 0, 0, 0, 0]);
        w.execute_batch("BEGIN EXCLUSIVE; UPDATE session SET cost = 1;").unwrap();
        let c = open(&p).unwrap();
        assert!(session_usage(&c, &["ses_a"]).is_empty());
    }

    #[test]
    fn every_query_touches_only_allowed_tables_and_fields() {
        const ALLOWED: [&str; 14] = ["$.role", "$.providerid", "$.modelid", "$.cost", "$.tokens.input", "$.tokens.output", "$.tokens.reasoning",
            "$.tokens.cache.read", "$.tokens.cache.write", "$.time.created", "$.time.completed", "$.path.cwd", "$.type", "$.tool"];
        assert!(!QUERIES.is_empty());
        for q in QUERIES {
            let l = q.to_lowercase();
            for bad in ["credential", "account", "share", "secret", "auth", "select *"] { assert!(!l.contains(bad), "{bad} in: {q}"); }
            let words: Vec<&str> = l.split(|c: char| !(c.is_ascii_alphanumeric() || c == '_')).filter(|w| !w.is_empty()).collect();
            for (i, w) in words.iter().enumerate() {
                if matches!(*w, "from" | "join") { assert!(matches!(words[i + 1], "session" | "message" | "part"), "table {} in: {q}", words[i + 1]); }
            }
            let mut rest = l.as_str();
            while let Some(i) = rest.find("data") {
                let before = &rest[..i];
                assert!(before.ends_with("json_extract("), "entire `data` in: {q}");
                let after = &rest[i + 4..];
                let path = after.strip_prefix(",'").and_then(|a| a.split('\'').next()).unwrap_or("");
                assert!(ALLOWED.contains(&path), "path {path} in: {q}");
                rest = after;
            }
        }
    }

    #[test]
    fn local_midnight_starts_the_local_day() {
        for t in [1_790_000_000_000i64, 1_774_746_000_000, 1_792_890_000_000, 1_000_000_000_000] {
            let m = crate::time::local_midnight(t);
            assert!(m <= t && t < m + 25 * 3_600_000, "{t} → {m}");
            assert_eq!(crate::time::local_midnight(m), m, "{t}");
            assert!(crate::time::local_midnight(m - 1) < m, "a minute before midnight belongs to the previous day");
        }
    }
}
