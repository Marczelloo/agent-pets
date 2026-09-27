use std::io::Read;
use std::sync::mpsc::Sender;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::thread::JoinHandle;
use crate::claude::{HookEnvelope, StatuslineEnvelope};
use crate::endpoint::Endpoint;

pub enum Incoming {
    ClaudeHook(HookEnvelope),
    ClaudeStatusline(StatuslineEnvelope),
    /// zdarzenie z furtki, już sprawdzone (`adapters::generic::to_event`)
    Generic(crate::model::Event),
    /// koperta pluginu opencode (`adapters::opencode::events`)
    Opencode(serde_json::Value),
}

pub struct Ingest {
    endpoint: Endpoint,
    server: Arc<tiny_http::Server>,
    handle: Option<JoinHandle<()>>,
}

const MAX_BODY: u64 = 1 << 20;

impl Ingest {
    /// `generic`: czy furtka (`/v1/events/generic`) jest otwarta; przełączana w locie z ustawień.
    pub fn start(token: String, tx: Sender<Incoming>, generic: Arc<AtomicBool>) -> anyhow::Result<Ingest> {
        let server = Arc::new(tiny_http::Server::http("127.0.0.1:0").map_err(|e| anyhow::anyhow!(e))?);
        let port = server.server_addr().to_ip().map(|a| a.port()).ok_or_else(|| anyhow::anyhow!("brak portu"))?;
        let endpoint = Endpoint { port, token: token.clone() };
        let srv = server.clone();
        let handle = std::thread::spawn(move || {
            let expected = format!("Bearer {token}");
            for mut req in srv.incoming_requests() {
                let status = handle_request(&mut req, &expected, &tx, &generic);
                let _ = req.respond(tiny_http::Response::empty(status));
            }
        });
        Ok(Ingest { endpoint, server, handle: Some(handle) })
    }

    pub fn endpoint(&self) -> &Endpoint { &self.endpoint }

    pub fn stop(mut self) {
        self.server.unblock();
        if let Some(h) = self.handle.take() { let _ = h.join(); }
    }
}

enum Route { Claude, Statusline, Opencode, Generic }

fn handle_request(req: &mut tiny_http::Request, expected: &str, tx: &Sender<Incoming>, generic: &AtomicBool) -> u16 {
    if *req.method() != tiny_http::Method::Post { return 404; }
    let route = match req.url() {
        "/v1/events/claude" => Route::Claude,
        "/v1/events/claude-statusline" => Route::Statusline,
        "/v1/events/opencode" => Route::Opencode,
        // wyłączona furtka wygląda jak brak trasy
        "/v1/events/generic" if generic.load(Ordering::Relaxed) => Route::Generic,
        _ => return 404,
    };
    let auth = req.headers().iter().find(|h| h.field.equiv("Authorization")).map(|h| h.value.as_str().to_string());
    if auth.as_deref() != Some(expected) { return 401; }
    if req.body_length().map(|l| l as u64 > MAX_BODY).unwrap_or(false) { return 413; }
    let mut body = Vec::new();
    if req.as_reader().take(MAX_BODY + 1).read_to_end(&mut body).is_err() { return 400; }
    if body.len() as u64 > MAX_BODY { return 413; }
    let msg = match route {
        Route::Statusline => serde_json::from_slice::<StatuslineEnvelope>(&body).ok().map(Incoming::ClaudeStatusline),
        Route::Claude => serde_json::from_slice::<HookEnvelope>(&body).ok().map(Incoming::ClaudeHook),
        Route::Opencode => serde_json::from_slice::<serde_json::Value>(&body).ok().filter(|v| v.is_object()).map(Incoming::Opencode),
        Route::Generic => serde_json::from_slice::<crate::adapters::generic::GenericEvent>(&body).ok()
            .and_then(|g| crate::adapters::generic::to_event(g, crate::time::now_ms()).ok()).map(Incoming::Generic),
    };
    match msg {
        Some(m) => { let _ = tx.send(m); 204 }
        None => 400,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::mpsc::channel;
    use std::sync::atomic::AtomicBool;
    use std::time::Duration;

    fn post(port: u16, path: &str, token: &str, body: &str) -> u16 {
        match ureq::post(&format!("http://127.0.0.1:{port}{path}"))
            .set("Authorization", &format!("Bearer {token}"))
            .timeout(Duration::from_secs(2))
            .send_string(body) {
            Ok(r) => r.status(),
            Err(ureq::Error::Status(c, _)) => c,
            Err(e) => panic!("{e}"),
        }
    }

    #[test]
    fn accepts_valid_hook_and_rejects_bad_requests() {
        let (tx, rx) = channel();
        let ing = Ingest::start("secret".into(), tx, door(true)).unwrap();
        let port = ing.endpoint().port;
        let body = r#"{"ts":1,"ppid":5,"payload":{"hook_event_name":"Stop","session_id":"s"}}"#;
        assert_eq!(post(port, "/v1/events/claude", "secret", body), 204);
        match rx.recv_timeout(Duration::from_secs(2)).unwrap() {
            Incoming::ClaudeHook(h) => assert_eq!(h.ppid, Some(5)),
            _ => panic!("zła trasa"),
        }
        assert_eq!(post(port, "/v1/events/claude", "wrong", body), 401);
        assert_eq!(post(port, "/nope", "secret", body), 404);
        assert_eq!(post(port, "/v1/events/claude", "secret", "{bad"), 400);
        ing.stop();
    }

    fn door(on: bool) -> Arc<AtomicBool> { Arc::new(AtomicBool::new(on)) }

    #[test]
    fn the_door_accepts_a_valid_event() {
        let (tx, rx) = channel();
        let ing = Ingest::start("secret".into(), tx, door(true)).unwrap();
        let port = ing.endpoint().port;
        let body = r#"{"agent":"kilo","name":"Kilo CLI","session":"abc","state":"working","tool":"edit"}"#;
        assert_eq!(post(port, "/v1/events/generic", "secret", body), 204);
        match rx.recv_timeout(Duration::from_secs(2)).unwrap() {
            Incoming::Generic(e) => {
                assert_eq!((e.agent(), e.session_id.as_str()), (crate::model::Agent::Other, "generic:kilo:abc"));
                assert_eq!(e.data.agent_name.as_deref(), Some("Kilo CLI"));
            }
            _ => panic!("zła trasa"),
        }
        ing.stop();
    }

    #[test]
    fn the_door_rejects_impostors_bad_ids_and_oversized_bodies() {
        let (tx, rx) = channel();
        let ing = Ingest::start("secret".into(), tx, door(true)).unwrap();
        let port = ing.endpoint().port;
        let ev = |agent: &str, session: &str| format!(r#"{{"agent":"{agent}","session":"{session}","state":"done"}}"#);
        assert_eq!(post(port, "/v1/events/generic", "secret", &ev("claude", "abc")), 400);
        assert_eq!(post(port, "/v1/events/generic", "secret", &ev("Kilo CLI", "abc")), 400);
        assert_eq!(post(port, "/v1/events/generic", "secret", &ev("kilo", "../x")), 400);
        assert_eq!(post(port, "/v1/events/generic", "secret", r#"{"agent":"kilo","session":"a","state":"nope"}"#), 400);
        assert_eq!(post(port, "/v1/events/generic", "wrong", &ev("kilo", "abc")), 401);
        let big = format!(r#"{{"agent":"kilo","session":"abc","state":"done","title":"{}"}}"#, "x".repeat(1 << 20));
        assert_eq!(post(port, "/v1/events/generic", "secret", &big), 413);
        assert!(rx.recv_timeout(Duration::from_millis(200)).is_err(), "nic nie trafiło do kanału");
        ing.stop();
    }

    #[test]
    fn opencode_envelopes_have_their_own_route() {
        let (tx, rx) = channel();
        let ing = Ingest::start("secret".into(), tx, door(false)).unwrap();
        let port = ing.endpoint().port;
        let body = r#"{"v":1,"event":"session.status","session":"ses_1","status":"busy"}"#;
        assert_eq!(post(port, "/v1/events/opencode", "secret", body), 204);
        match rx.recv_timeout(Duration::from_secs(2)).unwrap() {
            Incoming::Opencode(v) => assert_eq!(v["session"], "ses_1"),
            _ => panic!("zła trasa"),
        }
        assert_eq!(post(port, "/v1/events/opencode", "wrong", body), 401);
        assert_eq!(post(port, "/v1/events/opencode", "secret", "[1]"), 400);
        ing.stop();
    }

    #[test]
    fn a_closed_door_is_not_there() {
        let (tx, rx) = channel();
        let d = door(false);
        let ing = Ingest::start("secret".into(), tx, d.clone()).unwrap();
        let port = ing.endpoint().port;
        let body = r#"{"agent":"kilo","session":"abc","state":"done"}"#;
        assert_eq!(post(port, "/v1/events/generic", "secret", body), 404);
        assert!(rx.recv_timeout(Duration::from_millis(200)).is_err());
        d.store(true, std::sync::atomic::Ordering::Relaxed);
        assert_eq!(post(port, "/v1/events/generic", "secret", body), 204, "przełącznik działa w locie");
        ing.stop();
    }

    #[test]
    fn accepts_statusline_on_its_own_route() {
        let (tx, rx) = channel();
        let ing = Ingest::start("secret".into(), tx, door(true)).unwrap();
        let port = ing.endpoint().port;
        let body = r#"{"ts":1,"payload":{"session_id":"s"}}"#;
        assert_eq!(post(port, "/v1/events/claude-statusline", "secret", body), 204);
        match rx.recv_timeout(Duration::from_secs(2)).unwrap() {
            Incoming::ClaudeStatusline(s) => assert_eq!(s.payload["session_id"], "s"),
            _ => panic!("zła trasa"),
        }
        assert_eq!(post(port, "/v1/events/claude-statusline", "wrong", body), 401);
        ing.stop();
    }
}
