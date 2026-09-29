//! Claude account limits from the Anthropic server every few minutes, using the same login as Claude Code.
//! Read the token from `~/.claude/.credentials.json` on each request (Claude Code refreshes it), send it
//! only to `api.anthropic.com`, and never store or log it.
use pets_core::claude::account_usage;
use pets_core::model::Event;
use std::path::PathBuf;
use std::sync::mpsc::Sender;
use std::time::Duration;

const EVERY: Duration = Duration::from_secs(5 * 60);
const BACKOFF: Duration = Duration::from_secs(15 * 60);

#[derive(Debug, PartialEq)]
pub enum Failure { Unauthorized, RateLimited, Other }

pub fn fetch(url: &str, token: &str, now: i64) -> Result<Option<Event>, Failure> {
    let resp = ureq::get(url)
        .set("Authorization", &format!("Bearer {token}"))
        .set("anthropic-beta", account_usage::BETA)
        .set("User-Agent", concat!("agent-pets/", env!("CARGO_PKG_VERSION")))
        .timeout(Duration::from_secs(15))
        .call();
    match resp {
        Ok(r) => {
            let body: serde_json::Value = r.into_json().map_err(|_| Failure::Other)?;
            Ok(account_usage::to_event(&body, now))
        }
        Err(ureq::Error::Status(401 | 403, _)) => Err(Failure::Unauthorized),
        Err(ureq::Error::Status(429, _)) => Err(Failure::RateLimited),
        Err(_) => Err(Failure::Other),
    }
}

fn credentials() -> Option<PathBuf> {
    std::env::var_os("USERPROFILE").map(|h| PathBuf::from(h).join(".claude").join(".credentials.json"))
}

fn current_token(now: i64) -> Option<String> {
    credentials().and_then(|p| std::fs::read(p).ok()).and_then(|b| account_usage::token(&b, now))
}

/// Thread: immediately, then every 5 min (every 15 min after rate limiting). Sends nothing without a token,
/// and does not even read the token without user consent (`allowed`, `claude_plan_usage` setting).
/// Returns whether consent and a valid token exist at startup (whether to wait for the first response).
pub fn spawn(tx: Sender<Event>, allowed: impl Fn() -> bool + Send + 'static) -> bool {
    let has_token = allowed() && current_token(pets_core::time::now_ms()).is_some();
    std::thread::spawn(move || loop {
        if !allowed() {
            // consent may arrive from settings at any time
            std::thread::sleep(Duration::from_secs(5));
            continue;
        }
        let now = pets_core::time::now_ms();
        let token = current_token(now);
        let wait = match token.map(|t| fetch(account_usage::URL, &t, now)) {
            Some(Ok(Some(e))) => { if tx.send(e).is_err() { return; } EVERY }
            Some(Err(Failure::RateLimited)) => BACKOFF,
            _ => EVERY,
        };
        std::thread::sleep(wait);
    });
    has_token
}

#[cfg(test)]
mod tests {
    use super::*;
    use pets_core::model::Window;
    use std::sync::mpsc::channel;

    /// Server on 127.0.0.1 that responds once and returns the request headers.
    fn serve(status: u16, body: &'static str) -> (String, std::sync::mpsc::Receiver<Vec<(String, String)>>) {
        let srv = tiny_http::Server::http("127.0.0.1:0").unwrap();
        let url = format!("http://127.0.0.1:{}/api/oauth/usage", srv.server_addr().to_ip().unwrap().port());
        let (tx, rx) = channel();
        std::thread::spawn(move || {
            let req = srv.recv().unwrap();
            let _ = tx.send(req.headers().iter().map(|h| (h.field.to_string().to_lowercase(), h.value.to_string())).collect());
            let _ = req.respond(tiny_http::Response::from_string(body).with_status_code(status));
        });
        (url, rx)
    }

    #[test]
    fn sends_the_token_and_turns_the_answer_into_limits() {
        let (url, headers) = serve(200, r#"{"five_hour":{"utilization":12.0,"resets_at":"2026-09-25T18:20:00+00:00"}}"#);
        let e = fetch(&url, "tok", 5).unwrap().unwrap();
        assert_eq!((e.data.limits[0].window, e.data.limits[0].used_pct), (Window::FiveHour, 12.0));
        let h = headers.recv().unwrap();
        assert!(h.contains(&("authorization".into(), "Bearer tok".into())));
        assert!(h.contains(&("anthropic-beta".into(), account_usage::BETA.into())));
    }

    #[test]
    fn expired_token_and_rate_limit_are_told_apart() {
        let (url, _) = serve(401, "{}");
        assert_eq!(fetch(&url, "tok", 5), Err(Failure::Unauthorized));
        let (url, _) = serve(429, "{}");
        assert_eq!(fetch(&url, "tok", 5), Err(Failure::RateLimited));
    }
}
