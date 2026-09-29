//! Antigravity limits from its local server (127.0.0.1 only). We read the CSRF token from the server process
//! arguments on each discovery; we send it only to that server and never store or log it.
use pets_core::adapters::antigravity_usage::{self as au, Failure, Poller, Server, Usage};
use std::sync::mpsc::Sender;
use std::time::Duration;

pub fn post(s: &Server, method: &str) -> Result<serde_json::Value, Failure> {
    let resp = ureq::post(&au::url(s.port, method))
        .set("Connect-Protocol-Version", "1")
        .set("X-Codeium-Csrf-Token", &s.token)
        .timeout(Duration::from_secs(3))
        .send_json(serde_json::json!({}));
    match resp {
        Ok(r) => r.into_json().map_err(|_| Failure::Io),
        Err(ureq::Error::Status(code, _)) => Err(Failure::Status(code)),
        Err(_) => Err(Failure::Io),
    }
}

/// Thread: checks consent (`allowed`, Antigravity enabled in settings) every second and polls limits
/// every minute (`POLL_MS`). On disable it forgets the server, so it polls immediately when enabled again.
pub fn spawn(tx: Sender<Usage>, allowed: impl Fn() -> bool + Send + 'static) {
    std::thread::spawn(move || {
        let mut poller = Poller::new();
        loop {
            if allowed() {
                if let Some(u) = poller.poll(pets_core::time::now_ms(), &au::find_servers, &post) {
                    if tx.send(u).is_err() { return; }
                }
            } else {
                poller = Poller::new();
            }
            std::thread::sleep(Duration::from_secs(1));
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::mpsc::channel;

    /// Path and headers of the received request.
    type Seen = (String, Vec<(String, String)>);

    /// Server on 127.0.0.1 that responds once and returns the request path and headers.
    fn serve(status: u16, body: &'static str) -> (u16, std::sync::mpsc::Receiver<Seen>) {
        let srv = tiny_http::Server::http("127.0.0.1:0").unwrap();
        let port = srv.server_addr().to_ip().unwrap().port();
        let (tx, rx) = channel();
        std::thread::spawn(move || {
            let req = srv.recv().unwrap();
            let h = req.headers().iter().map(|h| (h.field.to_string().to_lowercase(), h.value.to_string())).collect();
            let _ = tx.send((req.url().to_string(), h));
            let _ = req.respond(tiny_http::Response::from_string(body).with_status_code(status));
        });
        (port, rx)
    }

    #[test]
    fn asks_the_local_server_with_its_token() {
        let (port, seen) = serve(200, r#"{"response":{"groups":[{"buckets":[{"bucketId":"gemini-5h","remainingFraction":0.5}]}]}}"#);
        let s = Server { port, token: "tok".into() };
        let v = post(&s, au::SUMMARY).unwrap();
        assert_eq!(au::from_summary(&v, 5).unwrap().data.limits[0].used_pct, 50.0);
        let (path, h) = seen.recv().unwrap();
        assert_eq!(path, "/exa.language_server_pb.LanguageServerService/RetrieveUserQuotaSummary");
        assert!(h.contains(&("x-codeium-csrf-token".into(), "tok".into())));
        assert!(h.contains(&("connect-protocol-version".into(), "1".into())));
    }

    #[test]
    fn missing_method_and_dead_port_are_told_apart() {
        let (port, _) = serve(404, "{}");
        assert_eq!(post(&Server { port, token: "t".into() }, au::SUMMARY), Err(Failure::Status(404)));
        let free = std::net::TcpListener::bind("127.0.0.1:0").unwrap().local_addr().unwrap().port();
        assert_eq!(post(&Server { port: free, token: "t".into() }, au::SUMMARY), Err(Failure::Io));
    }
}
