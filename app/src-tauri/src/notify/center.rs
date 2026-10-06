//! Notification center: a history of everything that was (or would be) a Windows toast, shown in the panel.
//! Pure log (`Log`) plus persistence in `~/.agent-pets/notifications.json` and the `pets://notifications` event.
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager};

/// The panel keeps the newest entries only.
pub const MAX: usize = 50;

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum Kind { NeedsYou, Done, Limit, Update, Weekly, Problem }

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct Entry {
    pub id: u64,
    pub kind: Kind,
    pub title: String,
    pub body: String,
    /// session to jump to (agent events); `None` for limits and updates
    pub session_id: Option<String>,
    /// epoch milliseconds
    pub at: i64,
    pub read: bool,
}

/// Newest first, at most `MAX` entries.
#[derive(Serialize, Deserialize, Default, Clone, Debug, PartialEq)]
#[serde(default)]
pub struct Log { items: Vec<Entry>, next: u64 }

impl Log {
    pub fn items(&self) -> &[Entry] { &self.items }
    pub fn unread(&self) -> usize { self.items.iter().filter(|e| !e.read).count() }

    pub fn push(&mut self, kind: Kind, title: &str, body: &str, session_id: Option<String>, at: i64) -> &Entry {
        self.next += 1;
        self.items.insert(0, Entry { id: self.next, kind, title: title.into(), body: body.into(), session_id, at, read: false });
        self.items.truncate(MAX);
        &self.items[0]
    }

    pub fn mark_all_read(&mut self) -> bool {
        let changed = self.unread() > 0;
        self.items.iter_mut().for_each(|e| e.read = true);
        changed
    }

    pub fn remove(&mut self, id: u64) -> bool {
        let n = self.items.len();
        self.items.retain(|e| e.id != id);
        self.items.len() != n
    }

    pub fn clear(&mut self) -> bool {
        let had = !self.items.is_empty();
        self.items.clear();
        had
    }
}

pub fn path(home: &Path) -> PathBuf { home.join(".agent-pets").join("notifications.json") }

/// Missing or corrupt file: empty log. Ids continue after the highest one found.
pub fn load(home: &Path) -> Log {
    let mut log: Log = std::fs::read(path(home)).ok().and_then(|b| serde_json::from_slice(&b).ok()).unwrap_or_default();
    log.items.truncate(MAX);
    log.next = log.next.max(log.items.iter().map(|e| e.id).max().unwrap_or(0));
    log
}

/// Atomic write (temporary file, then `rename`).
pub fn save(home: &Path, log: &Log) -> std::io::Result<()> {
    let p = path(home);
    if let Some(dir) = p.parent() { std::fs::create_dir_all(dir)?; }
    let tmp = p.with_extension("json.tmp");
    std::fs::write(&tmp, serde_json::to_vec(log)?)?;
    std::fs::rename(&tmp, &p)
}

pub struct Center { home: PathBuf, log: Mutex<Log> }

impl Center {
    pub fn load(home: PathBuf) -> Center { let log = Mutex::new(load(&home)); Center { home, log } }

    fn items(&self) -> Vec<Entry> { self.log.lock().unwrap().items().to_vec() }

    /// Apply a change; when it changed something, save and tell the panel.
    fn edit(&self, app: &AppHandle, f: impl FnOnce(&mut Log) -> bool) {
        let (changed, items) = { let mut l = self.log.lock().unwrap(); let c = f(&mut l); if c { let _ = save(&self.home, &l); } (c, l.items().to_vec()) };
        if changed { let _ = app.emit("pets://notifications", items); }
    }
}

/// Add an entry to the center (called next to every toast).
pub fn record(app: &AppHandle, kind: Kind, title: &str, body: &str, session_id: Option<String>) {
    let at = pets_core::time::now_ms();
    app.state::<Center>().edit(app, |l| { l.push(kind, title, body, session_id, at); true });
}

#[tauri::command]
pub fn notifications_list(c: tauri::State<Center>) -> Vec<Entry> { c.items() }

#[tauri::command]
pub fn notifications_read(app: AppHandle, c: tauri::State<Center>) { c.edit(&app, Log::mark_all_read); }

#[tauri::command]
pub fn notification_remove(app: AppHandle, c: tauri::State<Center>, id: u64) { c.edit(&app, |l| l.remove(id)); }

#[tauri::command]
pub fn notifications_clear(app: AppHandle, c: tauri::State<Center>) { c.edit(&app, Log::clear); }

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn newest_first_and_capped() {
        let mut l = Log::default();
        for i in 0..(MAX + 5) { l.push(Kind::Done, &format!("t{i}"), "", None, i as i64); }
        assert_eq!(l.items().len(), MAX);
        assert_eq!(l.items()[0].title, format!("t{}", MAX + 4));
        assert!(l.items().windows(2).all(|w| w[0].id > w[1].id), "ids keep growing, never reused");
    }

    #[test]
    fn read_remove_clear_report_whether_anything_changed() {
        let mut l = Log::default();
        assert!(!l.mark_all_read() && !l.clear());
        let id = l.push(Kind::Update, "u", "", None, 1).id;
        l.push(Kind::Limit, "l", "", None, 2);
        assert_eq!(l.unread(), 2);
        assert!(l.mark_all_read() && l.unread() == 0);
        assert!(!l.mark_all_read());
        assert!(l.remove(id) && !l.remove(id));
        assert!(l.clear() && l.items().is_empty());
    }

    #[test]
    fn survives_a_restart_and_keeps_ids_unique() {
        let d = tempfile::tempdir().unwrap();
        assert_eq!(load(d.path()), Log::default());
        let mut l = Log::default();
        l.push(Kind::NeedsYou, "a", "b", Some("s1".into()), 5);
        save(d.path(), &l).unwrap();
        let mut back = load(d.path());
        assert_eq!(back, l);
        assert_eq!(back.push(Kind::Done, "c", "", None, 6).id, 2);
        std::fs::write(path(d.path()), "{bad").unwrap();
        assert_eq!(load(d.path()), Log::default());
    }

    #[test]
    fn problem_kind_has_a_stable_wire_name() {
        assert_eq!(serde_json::to_string(&Kind::Problem).unwrap(), "\"problem\"");
    }
}
