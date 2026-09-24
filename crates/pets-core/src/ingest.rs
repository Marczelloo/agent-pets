use std::io::Read;
use std::sync::mpsc::Sender;
use std::sync::Arc;
use std::thread::JoinHandle;
use crate::claude::{HookEnvelope, StatuslineEnvelope};
use crate::endpoint::Endpoint;

pub enum Incoming {
    ClaudeHook(HookEnvelope),
    ClaudeStatusline(StatuslineEnvelope),
}

pub struct Ingest {
    endpoint: Endpoint,
    server: Arc<tiny_http::Server>,
    handle: Option<JoinHandle<()>>,
}

const MAX_BODY: u64 = 1 << 20;

impl Ingest {
    pub fn start(token: String, tx: Sender<Incoming>) -> anyhow::Result<Ingest> {
        let server = Arc::new(tiny_http::Server::http("127.0.0.1:0").map_err(|e| anyhow::anyhow!(e))?);
        let port = server.server_addr().to_ip().map(|a| a.port()).ok_or_else(|| anyhow::anyhow!("brak portu"))?;
        let endpoint = Endpoint { port, token: token.clone() };
        let srv = server.clone();
        let handle = std::thread::spawn(move || {
            let expected = format!("Bearer {token}");
            for mut req in srv.incoming_requests() {
                let status = handle_request(&mut req, &expected, &tx);
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

fn handle_request(req: &mut tiny_http::Request, expected: &str, tx: &Sender<Incoming>) -> u16 {
    if *req.method() != tiny_http::Method::Post { return 404; }
    let statusline = match req.url() {
        "/v1/events/claude" => false,
        "/v1/events/claude-statusline" => true,
        _ => return 404,
    };
    let auth = req.headers().iter().find(|h| h.field.equiv("Authorization")).map(|h| h.value.as_str().to_string());
    if auth.as_deref() != Some(expected) { return 401; }
    if req.body_length().map(|l| l as u64 > MAX_BODY).unwrap_or(false) { return 413; }
    let mut body = Vec::new();
    if req.as_reader().take(MAX_BODY + 1).read_to_end(&mut body).is_err() { return 400; }
    if body.len() as u64 > MAX_BODY { return 413; }
    let msg = if statusline {
        serde_json::from_slice::<StatuslineEnvelope>(&body).map(Incoming::ClaudeStatusline)
    } else {
        serde_json::from_slice::<HookEnvelope>(&body).map(Incoming::ClaudeHook)
    };
    match msg {
        Ok(m) => { let _ = tx.send(m); 204 }
        Err(_) => 400,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::mpsc::channel;
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
        let ing = Ingest::start("secret".into(), tx).unwrap();
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

    #[test]
    fn accepts_statusline_on_its_own_route() {
        let (tx, rx) = channel();
        let ing = Ingest::start("secret".into(), tx).unwrap();
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
