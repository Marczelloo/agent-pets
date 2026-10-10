//! Linux under Wayland: the two shortcuts go through the desktop's GlobalShortcuts portal. The app runs on XWayland,
//! where a key grab only fires while one of its own X11 windows has focus.
use std::collections::HashMap;
use std::sync::mpsc;
use std::sync::{Mutex, OnceLock};
use std::time::Duration;
use zbus::blocking::{Connection, Proxy};
use zbus::zvariant::{ObjectPath, OwnedValue, Value};

const DEST: &str = "org.freedesktop.portal.Desktop";
const PATH: &str = "/org/freedesktop/portal/desktop";
const IFACE: &str = "org.freedesktop.portal.GlobalShortcuts";
/// The app id the desktop files the shortcuts under (the bundle identifier).
const APP_ID: &str = "dev.agentpets.app";

/// One shortcut to bind: its name ("jump", "panel"), what the desktop shows next to it, the settings accelerator.
pub struct Wanted<'a> { pub name: &'a str, pub description: &'a str, pub accelerator: &'a str }

pub struct Portal {
    conn: Connection,
    /// The live session and its shortcut ids (each id names its trigger: a changed combo is a new shortcut,
    /// because a desktop keeps the trigger it once gave an id and treats the new one only as a hint).
    current: Mutex<Option<(String, HashMap<String, String>)>>,
    tokens: Mutex<u32>,
}

static PORTAL: OnceLock<Option<Portal>> = OnceLock::new();

/// The portal when the session is Wayland and the desktop offers GlobalShortcuts; `on` gets the name of a pressed shortcut.
/// The first call decides, later ones return the same answer.
pub fn get(on: impl Fn(&str) + Send + 'static) -> Option<&'static Portal> {
    PORTAL.get_or_init(|| {
        std::env::var_os("WAYLAND_DISPLAY")?;
        let p = open().map_err(|e| pets_core::app_log!("hotkeys: no GlobalShortcuts portal ({e}), using X11 key grabs")).ok()?;
        p.listen(on);
        Some(p)
    }).as_ref()
}

fn open() -> Result<Portal, String> {
    let conn = Connection::session().map_err(|e| e.to_string())?;
    // a host app has no sandbox to name it: tell the portal who we are (before any other portal call on this connection);
    // older portals lack the registry, and then the desktop guesses from the process
    if let Err(e) = conn.call_method(Some(DEST), PATH, Some("org.freedesktop.host.portal.Registry"), "Register",
        &(APP_ID, HashMap::<&str, Value>::new())) {
        pets_core::app_log!("hotkeys: the portal did not take our app id ({e})");
    }
    let reply = conn.call_method(Some(DEST), PATH, Some("org.freedesktop.DBus.Properties"), "Get", &(IFACE, "version"))
        .map_err(|e| e.to_string())?;
    let v: OwnedValue = reply.body().deserialize().map_err(|e| e.to_string())?;
    pets_core::app_log!("hotkeys: GlobalShortcuts portal version {:?}", u32::try_from(v).ok());
    Ok(Portal { conn, current: Mutex::new(None), tokens: Mutex::new(0) })
}

impl Portal {
    fn token(&self) -> String {
        let mut n = self.tokens.lock().unwrap();
        *n += 1;
        format!("agentpets{}_{}", std::process::id(), *n)
    }

    /// Calls `method` with `handle_token` already in its options and waits for the request's Response
    /// (subscribed before the call, so a fast answer is not missed). `wait` covers a dialog the desktop may show.
    fn request<B>(&self, method: &str, token: &str, body: &B, wait: Duration) -> Result<HashMap<String, OwnedValue>, String>
    where B: serde::Serialize + zbus::zvariant::DynamicType {
        let sender = self.conn.unique_name().ok_or("no bus name")?.trim_start_matches(':').replace('.', "_");
        let path = format!("{PATH}/request/{sender}/{token}");
        let (ready_tx, ready_rx) = mpsc::channel();
        let (tx, rx) = mpsc::channel();
        let conn = self.conn.clone();
        std::thread::spawn(move || {
            let it = Proxy::new(&conn, DEST, path.as_str(), "org.freedesktop.portal.Request")
                .and_then(|p| p.receive_signal("Response").map(|it| (p, it)));
            let (_proxy, mut it) = match it { Ok(x) => { let _ = ready_tx.send(Ok(())); x } Err(e) => { let _ = ready_tx.send(Err(e.to_string())); return; } };
            if let Some(m) = it.next() { let _ = tx.send(m.body().deserialize::<(u32, HashMap<String, OwnedValue>)>().map_err(|e| e.to_string())); }
        });
        ready_rx.recv().map_err(|e| e.to_string())??;
        self.conn.call_method(Some(DEST), PATH, Some(IFACE), method, body).map_err(|e| e.to_string())?;
        match rx.recv_timeout(wait) {
            Ok(Ok((0, results))) => Ok(results),
            Ok(Ok((1, _))) => Err("the desktop's dialog was cancelled".into()),
            Ok(Ok((code, _))) => Err(format!("the desktop refused the shortcuts (response {code})")),
            Ok(Err(e)) => Err(e),
            Err(_) => Err("the desktop did not answer".into()),
        }
    }

    /// Replaces the session with one holding `wanted`; per shortcut name, `None` = bound, `Some(why)` otherwise.
    /// `None` overall when the desktop gives us no session at all (GNOME wants an app id it can find a desktop file for,
    /// which a loose AppImage lacks): the caller falls back to X11 key grabs.
    pub fn bind(&self, wanted: &[Wanted]) -> Option<HashMap<String, Option<String>>> {
        if let Some((old, _)) = self.current.lock().unwrap().take() {
            let _ = self.conn.call_method(Some(DEST), old.as_str(), Some("org.freedesktop.portal.Session"), "Close", &());
        }
        let fail_all = |e: &str| wanted.iter().map(|w| (w.name.to_string(), Some(e.to_string()))).collect();
        if wanted.is_empty() { return Some(HashMap::new()); }
        let mut ids = HashMap::new();
        let mut list = Vec::new();
        let mut out = HashMap::new();
        for w in wanted {
            match trigger(w.accelerator) {
                Some(t) => {
                    let id = format!("{}:{t}", w.name);
                    ids.insert(id.clone(), w.name.to_string());
                    list.push((id, HashMap::from([("description", Value::from(w.description)), ("preferred_trigger", Value::from(t))])));
                }
                None => { out.insert(w.name.to_string(), Some(format!("the desktop has no name for {}", w.accelerator))); }
            }
        }
        if list.is_empty() { return Some(out); }
        let (token, session_token) = (self.token(), self.token());
        let opts = HashMap::from([("handle_token", Value::from(token.as_str())), ("session_handle_token", Value::from(session_token.as_str()))]);
        let session = match self.request("CreateSession", &token, &(opts,), Duration::from_secs(10)).map(|r| r.get("session_handle").and_then(text)) {
            Ok(Some(s)) => s,
            Ok(None) => { pets_core::app_log!("hotkeys: the portal gave no session, using X11 key grabs"); return None; }
            Err(e) => { pets_core::app_log!("hotkeys: portal session: {e}; using X11 key grabs"); return None; }
        };
        let Ok(session_path) = ObjectPath::try_from(session.as_str()) else { return None };
        // keep it before binding: a press can arrive as soon as the desktop has the shortcuts
        *self.current.lock().unwrap() = Some((session.clone(), ids.clone()));
        let token = self.token();
        let opts = HashMap::from([("handle_token", Value::from(token.as_str()))]);
        // a desktop may ask the person to confirm the shortcuts first
        let bound = match self.request("BindShortcuts", &token, &(session_path, list, "", opts), Duration::from_secs(300)) {
            Ok(r) => r.get("shortcuts").map(bound_ids).unwrap_or_default(),
            Err(e) => { pets_core::app_log!("hotkeys: portal bind: {e}"); return Some(fail_all(&e)); }
        };
        for (id, name) in &ids {
            let ok = bound.iter().any(|(b, _)| b == id);
            let trig = bound.iter().find(|(b, _)| b == id).map(|(_, t)| t.as_str()).unwrap_or("");
            pets_core::app_log!("hotkeys: portal {name} -> {id} bound={ok} trigger={trig:?}");
            out.insert(name.clone(), (!ok).then(|| "the desktop did not take this shortcut".to_string()));
        }
        Some(out)
    }

    /// One listener for the app's lifetime: a press of a shortcut of the live session goes to `on` by name.
    fn listen(&self, on: impl Fn(&str) + Send + 'static) {
        let conn = self.conn.clone();
        std::thread::spawn(move || {
            let it = match Proxy::new(&conn, DEST, PATH, IFACE).and_then(|p| p.receive_signal("Activated").map(|it| (p, it))) {
                Ok(x) => x,
                Err(e) => { pets_core::app_log!("hotkeys: cannot hear the portal: {e}"); return; }
            };
            let (_proxy, it) = it;
            for m in it {
                let body = m.body();
                let Ok((session, id, _, _)) = body.deserialize::<(ObjectPath, String, u64, HashMap<String, OwnedValue>)>() else { continue };
                let Some(p) = PORTAL.get().and_then(Option::as_ref) else { continue };
                let name = match &*p.current.lock().unwrap() {
                    Some((s, ids)) if s.as_str() == session.as_str() => ids.get(&id).cloned(),
                    _ => None,
                };
                if let Some(name) = name { on(&name); }
            }
        });
    }
}

fn text(v: &OwnedValue) -> Option<String> {
    match &**v { Value::Str(s) => Some(s.to_string()), Value::ObjectPath(p) => Some(p.to_string()), _ => None }
}

/// `a(sa{sv})` of the bind result: (id, trigger description).
fn bound_ids(v: &OwnedValue) -> Vec<(String, String)> {
    let Value::Array(a) = &**v else { return Vec::new() };
    a.iter().filter_map(|item| {
        let Value::Structure(s) = item else { return None };
        let f = s.fields();
        let Some(Value::Str(id)) = f.first() else { return None };
        let desc = match f.get(1) {
            Some(Value::Dict(d)) => d.get::<&str, String>(&"trigger_description").ok().flatten().unwrap_or_default(),
            _ => String::new(),
        };
        Some((id.to_string(), desc))
    }).collect()
}

/// A settings accelerator (`Ctrl+Alt+Shift+J`, `Super+F2`) in the shortcuts spec's form (`CTRL+ALT+SHIFT+j`, `LOGO+F2`):
/// modifiers in capitals, the key as its XKB keysym name. `None` for a key it has no name for.
pub fn trigger(accelerator: &str) -> Option<String> {
    let mut mods = Vec::new();
    let mut key = None;
    for part in accelerator.split('+').map(str::trim).filter(|s| !s.is_empty()) {
        let lower = part.to_ascii_lowercase();
        let m = match lower.as_str() {
            "ctrl" | "control" | "cmdorctrl" | "commandorcontrol" => Some("CTRL"),
            "alt" | "option" => Some("ALT"),
            "shift" => Some("SHIFT"),
            "super" | "meta" | "cmd" | "command" | "win" => Some("LOGO"),
            _ => None,
        };
        match m {
            Some(m) => if !mods.contains(&m) { mods.push(m) },
            None => { if key.is_some() { return None; } key = Some(keysym(&lower)?); }
        }
    }
    let key = key?;
    let order = ["CTRL", "ALT", "SHIFT", "LOGO"];
    let mut parts: Vec<String> = order.iter().filter(|m| mods.contains(m)).map(|m| m.to_string()).collect();
    parts.push(key);
    Some(parts.join("+"))
}

fn keysym(lower: &str) -> Option<String> {
    let k = lower.strip_prefix("key").filter(|s| s.len() == 1)
        .or_else(|| lower.strip_prefix("digit").filter(|s| s.len() == 1))
        .unwrap_or(lower);
    if k.len() == 1 && k.chars().all(|c| c.is_ascii_alphanumeric()) { return Some(k.to_string()); }
    if let Some(n) = k.strip_prefix('f').and_then(|n| n.parse::<u8>().ok()).filter(|n| (1..=24).contains(n)) { return Some(format!("F{n}")); }
    if let Some(n) = k.strip_prefix("numpad").filter(|n| n.len() == 1 && n.chars().all(|c| c.is_ascii_digit())) { return Some(format!("KP_{n}")); }
    let named = match k {
        "space" => "space", "enter" | "return" => "Return", "tab" => "Tab", "insert" => "Insert", "delete" => "Delete",
        "home" => "Home", "end" => "End", "pageup" => "Page_Up", "pagedown" => "Page_Down",
        "up" | "arrowup" => "Up", "down" | "arrowdown" => "Down", "left" | "arrowleft" => "Left", "right" | "arrowright" => "Right",
        "minus" => "minus", "equal" => "equal", "bracketleft" => "bracketleft", "bracketright" => "bracketright",
        "backslash" => "backslash", "semicolon" => "semicolon", "quote" => "apostrophe", "comma" => "comma",
        "period" => "period", "slash" => "slash", "backquote" => "grave",
        _ => return None,
    };
    Some(named.to_string())
}

#[cfg(test)]
mod tests {
    use super::trigger;

    #[test]
    fn accelerators_become_spec_triggers() {
        assert_eq!(trigger("Ctrl+Alt+Shift+J").as_deref(), Some("CTRL+ALT+SHIFT+j"));
        assert_eq!(trigger("shift+super+k").as_deref(), Some("SHIFT+LOGO+k"));
        assert_eq!(trigger("Super+Shift+KeyK").as_deref(), Some("SHIFT+LOGO+k"));
        assert_eq!(trigger("Ctrl+Shift+F2").as_deref(), Some("CTRL+SHIFT+F2"));
        assert_eq!(trigger("Alt+Digit5").as_deref(), Some("ALT+5"));
        assert_eq!(trigger("Ctrl+PageDown").as_deref(), Some("CTRL+Page_Down"));
        assert_eq!(trigger("Ctrl+Numpad3").as_deref(), Some("CTRL+KP_3"));
        assert_eq!(trigger("Ctrl+Backquote").as_deref(), Some("CTRL+grave"));
    }

    #[test]
    fn unknown_or_doubled_keys_have_no_trigger() {
        assert_eq!(trigger("Ctrl+Nope"), None);
        assert_eq!(trigger("Ctrl+A+B"), None);
        assert_eq!(trigger("Ctrl+Shift"), None);
    }
}
