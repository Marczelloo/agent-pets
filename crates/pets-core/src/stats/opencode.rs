//! opencode statistics from its database (spec 0.11 §4.4): each session is a ledger entry `opencode:<id>`, recalculated
//! when its `time_updated` changes. Same buckets and fields as Claude and Codex.
use crate::opencode_db as db;
use crate::tools::from_opencode;
use super::claude::project_of;
use super::{active_tick, Book, FileEntry, StatAgent};

/// Ledger entry for one session, from scratch; `None` when the database could not be read now.
fn entry(c: &rusqlite::Connection, s: &db::DbSession) -> Option<FileEntry> {
    let mut e = FileEntry::default();
    e.meta.agent = Some(StatAgent::Opencode);
    e.meta.project = project_of(&s.directory);
    e.meta.sub = s.parent;
    e.cursor.mtime = s.updated;
    let msgs = db::messages(c, &s.id)?;
    let tools = db::tools(c, &s.id)?;
    e.meta.started = msgs.iter().map(|m| m.created).filter(|t| *t > 0).min();
    // work instants: start and end of each message and tool, with the model at that time
    let mut moments: Vec<(i64, Option<String>)> = Vec::new();
    for m in &msgs {
        if m.role == "assistant" {
            let c = e.cell(m.created, m.model.as_deref().unwrap_or("unknown"));
            c.input += m.input;
            c.output += m.output + m.reasoning;
            c.cache_read += m.cache_read;
            c.cache_write += m.cache_write;
        }
        moments.push((m.created, m.model.clone()));
        if let Some(done) = m.completed { moments.push((done, m.model.clone())); }
    }
    for (at, name) in tools {
        // `question` is the agent's question to the user, like Claude's `AskUserQuestion`
        let model = msgs.iter().rfind(|m| m.created <= at && m.model.is_some()).and_then(|m| m.model.clone());
        let cell = e.cell(at, model.as_deref().unwrap_or("unknown"));
        if name == "question" { cell.questions += 1 } else { cell.tools.add(from_opencode(&name)) }
        moments.push((at, None));
    }
    moments.sort_by_key(|m| m.0);
    let mut model = String::from("unknown");
    for (at, m) in moments {
        if let Some(m) = m { model = m; }
        if let Some((end, ms)) = active_tick(&mut e.cursor.last_event, at) { e.cell(end, &model).active_ms += ms; }
    }
    Some(e)
}

/// Recalculate `opencode:<id>` entries for sessions whose `time_updated` differs from the stored `cursor.mtime`.
/// Check for pause (full-screen game) before each session. Return the number of recalculated sessions.
pub fn sync(book: &mut Book, c: &rusqlite::Connection, pause: &dyn Fn() -> bool) -> usize {
    let mut n = 0;
    for s in db::sessions(c) {
        let key = format!("opencode:{}", s.id);
        if book.files.get(&key).is_some_and(|e| e.cursor.mtime == s.updated) { continue; }
        if pause() { break; }
        // read error: keep the old entry; different `time_updated` will recalculate it on the next scan
        let Some(e) = entry(c, &s) else { continue };
        book.files.insert(key, e);
        n += 1;
    }
    n
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::opencode_db::fixture::*;
    use crate::stats::{Book, BUCKET_MS, StatAgent};
    use rusqlite::params;

    const T0: i64 = 1_790_000_000_000;

    fn tool(w: &rusqlite::Connection, id: &str, sid: &str, at: i64, name: &str) {
        w.execute("INSERT INTO part VALUES (?1, 'm', ?2, ?3, ?3, ?4)",
            params![id, sid, at, serde_json::json!({"type": "tool", "tool": name}).to_string()]).unwrap();
    }

    fn home_db(d: &tempfile::TempDir) -> std::path::PathBuf {
        let p = db(d.path());
        let w = rusqlite::Connection::open(&p).unwrap();
        session(&w, "ses_p", None, T0 + 10_000, 0.0, [0; 5]);
        session(&w, "ses_k", Some("ses_p"), T0 + 20_000, 0.0, [0; 5]);
        message(&w, "u1", "ses_p", T0, serde_json::json!({"role": "user", "time": {"created": T0}}));
        message(&w, "a1", "ses_p", T0 + 1000, reply("openai", T0 + 1000, [10, 20, 3, 400, 5], 0.0));
        message(&w, "a2", "ses_p", T0 + 61_000, reply("openai", T0 + 61_000, [1, 2, 0, 0, 0], 0.0));
        tool(&w, "t1", "ses_p", T0 + 30_000, "bash");
        tool(&w, "t2", "ses_p", T0 + 31_000, "edit");
        tool(&w, "t3", "ses_p", T0 + 32_000, "question");
        message(&w, "k1", "ses_k", T0 + 5000, reply("opencode", T0 + 5000, [7, 0, 0, 0, 0], 0.0));
        p
    }

    #[test]
    fn every_session_becomes_an_entry_with_its_numbers() {
        let d = tempfile::tempdir().unwrap();
        let c = crate::opencode_db::open(&home_db(&d)).unwrap();
        let mut b = Book::default();
        assert_eq!(sync(&mut b, &c, &|| false), 2);
        let p = &b.files["opencode:ses_p"];
        assert_eq!((p.meta.agent, p.meta.project.as_deref(), p.meta.sub, p.meta.started), (Some(StatAgent::Opencode), Some("app"), false, Some(T0)));
        assert_eq!(p.cursor.mtime, T0 + 10_000);
        let mut all = crate::stats::Cell::default();
        for m in p.buckets.values() { for c in m.values() { all.add(c); } }
        assert_eq!((all.input, all.output, all.cache_read, all.cache_write), (11, 25, 400, 5), "output + reasoning");
        assert_eq!((all.tools.bash, all.tools.edit, all.questions), (1, 1, 1));
        assert!(all.active_ms > 0 && all.active_ms <= 61_500, "{}", all.active_ms);
        assert!(p.buckets[&(T0 + 1000).div_euclid(BUCKET_MS)].contains_key("gpt-6-sol"));
        let k = &b.files["opencode:ses_k"];
        assert_eq!((k.meta.sub, k.meta.agent), (true, Some(StatAgent::Opencode)));
    }

    #[test]
    fn only_changed_sessions_are_counted_again_from_scratch() {
        let d = tempfile::tempdir().unwrap();
        let path = home_db(&d);
        let c = crate::opencode_db::open(&path).unwrap();
        let mut b = Book::default();
        sync(&mut b, &c, &|| false);
        let before = b.files["opencode:ses_p"].clone();
        assert_eq!(sync(&mut b, &c, &|| false), 0, "no database changes");
        drop(c);
        let w = rusqlite::Connection::open(&path).unwrap();
        w.execute("UPDATE session SET time_updated = ?1 WHERE id = 'ses_p'", params![T0 + 99_000]).unwrap();
        drop(w);
        let c = crate::opencode_db::open(&path).unwrap();
        assert_eq!(sync(&mut b, &c, &|| false), 1);
        let after = &b.files["opencode:ses_p"];
        assert_eq!(after.buckets, before.buckets, "recalculated from scratch without double counting");
        assert_eq!(after.cursor.mtime, T0 + 99_000);
    }

    #[test]
    fn a_database_error_keeps_the_entry_counted_before() {
        let d = tempfile::tempdir().unwrap();
        let path = home_db(&d);
        let mut b = Book::default();
        sync(&mut b, &crate::opencode_db::open(&path).unwrap(), &|| false);
        let before = b.files["opencode:ses_p"].clone();
        let w = rusqlite::Connection::open(&path).unwrap();
        w.execute("UPDATE session SET time_updated = ?1 WHERE id = 'ses_p'", params![T0 + 99_000]).unwrap();
        // messages temporarily unreadable (lock, schema changing): do not save an empty entry
        w.execute_batch("ALTER TABLE message RENAME TO message_busy;").unwrap();
        drop(w);
        assert_eq!(sync(&mut b, &crate::opencode_db::open(&path).unwrap(), &|| false), 0);
        assert_eq!(b.files["opencode:ses_p"], before, "old entry remains and will be recalculated on the next scan");
    }

    #[test]
    fn a_pause_stops_between_sessions_and_an_old_schema_gives_nothing() {
        let d = tempfile::tempdir().unwrap();
        let c = crate::opencode_db::open(&home_db(&d)).unwrap();
        let mut b = Book::default();
        assert_eq!(sync(&mut b, &c, &|| true), 0);
        assert!(b.files.is_empty());
        let old = d.path().join("old.db");
        rusqlite::Connection::open(&old).unwrap().execute_batch("CREATE TABLE session (id text PRIMARY KEY);").unwrap();
        let c = crate::opencode_db::open(&old).unwrap();
        assert_eq!(sync(&mut b, &c, &|| false), 0);
    }
}
