//! Antigravity limits from its local server (`language_server.exe`, 127.0.0.1 only). The server requires an
//! `X-Codeium-Csrf-Token` header with the token it receives in its own arguments (`--csrf_token`); this is not a login credential.
//! Query `RetrieveUserQuotaSummary` (app 2.0): model groups with 5-hour and weekly windows. Older versions
//! and the IDE return 404, then use `GetUserStatus`: per-model limits, 5-hour window only. Use only the Gemini pool;
//! email, plan, and the rest of `GetUserStatus` go nowhere. The app sends the network request.
use crate::model::*;
use serde_json::Value;

pub const SESSION_ID: &str = "antigravity-usage";
pub const POLL_MS: i64 = 60_000;
pub const SUMMARY: &str = "RetrieveUserQuotaSummary";
pub const USER_STATUS: &str = "GetUserStatus";

/// Connect method address on the local server.
pub fn url(port: u16, method: &str) -> String {
    format!("http://127.0.0.1:{port}/exa.language_server_pb.LanguageServerService/{method}")
}

/// CSRF token from the Antigravity server command line (`--csrf_token X` or `--csrf_token=X`). Skip servers of other
/// programs using the same engine (e.g. Windsurf).
pub fn csrf_token(cmdline: &str) -> Option<String> {
    let lower = cmdline.to_lowercase();
    if !lower.contains("antigravity") { return None; }
    let mut it = cmdline.split_whitespace();
    while let Some(a) = it.next() {
        let v = match a.strip_prefix("--csrf_token") {
            Some("") => it.next(),
            Some(rest) => rest.strip_prefix('='),
            None => continue,
        };
        return v.map(|t| t.trim_matches('"')).filter(|t| !t.is_empty()).map(str::to_string);
    }
    None
}

/// Percentage used from `remainingFraction`. Proto3 omits zero in JSON: a limit with reset time but without a
/// fraction is exhausted. The fraction may also arrive as `{ "value": … }`.
fn used_pct(o: &Value) -> Option<f32> {
    let f = match o.get("remainingFraction") {
        Some(v) => v.as_f64().or_else(|| v.get("value")?.as_f64())?,
        None if o.get("resetTime").is_some() => 0.0,
        None => return None,
    };
    Some((((1.0 - f.clamp(0.0, 1.0)) * 1000.0).round() / 10.0) as f32)
}

fn limit(window: Window, o: &Value) -> Option<Limit> {
    Some(Limit {
        agent: Agent::Antigravity, window, used_pct: used_pct(o)?,
        resets_at: o.get("resetTime").and_then(Value::as_str).and_then(crate::time::rfc3339_ms),
    })
}

fn event(limits: Vec<Limit>, now: i64) -> Option<Event> {
    if limits.is_empty() { return None; }
    let mut e = Event::new(Source::Antigravity, SESSION_ID, Kind::Limits, now);
    e.data.limits = limits;
    Some(e)
}

/// `RetrieveUserQuotaSummary` response: `gemini-5h` and `gemini-weekly` buckets.
pub fn from_summary(body: &Value, now: i64) -> Option<Event> {
    let groups = body.get("response").unwrap_or(body).get("groups")?.as_array()?;
    let buckets: Vec<&Value> = groups.iter().filter_map(|g| g.get("buckets")?.as_array()).flatten().collect();
    let find = |id: &str| buckets.iter().find(|b| b.get("bucketId").and_then(Value::as_str) == Some(id)).copied();
    let limits = [("gemini-5h", Window::FiveHour), ("gemini-weekly", Window::Weekly)].into_iter()
        .filter_map(|(id, w)| limit(w, find(id)?))
        .collect();
    event(limits, now)
}

/// `GetUserStatus` response (older versions, IDE): the most used Gemini model as a 5-hour window.
pub fn from_user_status(body: &Value, now: i64) -> Option<Event> {
    let models = body.get("userStatus")?.get("cascadeModelConfigData")?.get("clientModelConfigs")?.as_array()?;
    let worst = models.iter()
        .filter(|m| m.get("label").and_then(Value::as_str).is_some_and(|l| l.to_lowercase().contains("gemini")))
        .filter_map(|m| limit(Window::FiveHour, m.get("quotaInfo")?))
        .max_by(|a, b| a.used_pct.total_cmp(&b.used_pct))?;
    event(vec![worst], now)
}

#[derive(Clone, PartialEq)]
pub struct Server { pub port: u16, pub token: String }

/// Without the token: `{:?}` in a log or panic must not reveal it.
impl std::fmt::Debug for Server {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("Server").field("port", &self.port).finish_non_exhaustive()
    }
}

#[derive(Debug, PartialEq)]
pub enum Failure {
    /// Server responded with this HTTP code.
    Status(u16),
    /// Connection failure, timeout, or non-JSON response.
    Io,
}

#[allow(clippy::large_enum_variant)] // short-lived values passed by move; boxing would only add noise
#[derive(Debug)]
pub enum Usage {
    Limits(Event),
    /// Server disappeared (Antigravity closed): remove reported limits.
    Stale,
}

/// Query the known server every `POLL_MS`; when it fails (Antigravity restart: new port and token), search again.
#[derive(Default)]
pub struct Poller {
    server: Option<Server>,
    next: i64,
    reported: bool,
}

impl Poller {
    pub fn new() -> Poller { Poller::default() }

    pub fn poll(&mut self, now: i64, find: &dyn Fn() -> Vec<Server>,
        post: &dyn Fn(&Server, &str) -> Result<Value, Failure>) -> Option<Usage> {
        if now < self.next { return None; }
        self.next = now + POLL_MS;
        let known = self.server.take();
        // search processes only when the known server does not respond
        let fresh = std::iter::once_with(find).flatten().filter(|s| Some(s) != known.as_ref());
        for s in known.clone().into_iter().chain(fresh) {
            if let Some(e) = ask(&s, now, post) {
                self.server = Some(s);
                self.reported = true;
                return Some(Usage::Limits(e));
            }
        }
        std::mem::take(&mut self.reported).then_some(Usage::Stale)
    }
}

fn ask(s: &Server, now: i64, post: &dyn Fn(&Server, &str) -> Result<Value, Failure>) -> Option<Event> {
    match post(s, SUMMARY) {
        Ok(v) => from_summary(&v, now).or_else(|| post(s, USER_STATUS).ok().and_then(|v| from_user_status(&v, now))),
        // method is unavailable in this version
        Err(Failure::Status(404)) => post(s, USER_STATUS).ok().and_then(|v| from_user_status(&v, now)),
        // wrong port (e.g. HTTPS beside HTTP), wrong token, or closed server
        Err(_) => None,
    }
}

/// Currently running Antigravity servers: each listening port with its process token.
#[cfg(windows)]
pub fn find_servers() -> Vec<Server> {
    crate::pid::process_list().into_iter()
        .filter(|(_, _, exe)| exe.to_lowercase().starts_with("language_server"))
        .filter_map(|(pid, _, _)| Some((pid, csrf_token(&crate::pid::command_line(pid)?)?)))
        .flat_map(|(pid, token)| crate::pid::listening_ports(pid).into_iter().map(move |port| Server { port, token: token.clone() }))
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    use std::cell::RefCell;

    const NOW: i64 = 1_790_340_000_000;

    #[test]
    fn debug_output_hides_the_token() {
        let d = format!("{:?}", Server { port: 4242, token: "sekret-123".into() });
        assert!(d.contains("4242"));
        assert!(!d.contains("sekret"));
    }

    fn summary() -> Value {
        json!({"response": {"groups": [
            {"displayName": "Gemini Models", "buckets": [
                {"bucketId": "gemini-weekly", "window": "weekly", "remainingFraction": 0.995003, "resetTime": "2026-10-02T11:00:09Z"},
                {"bucketId": "gemini-5h", "window": "5h", "remainingFraction": 0.9807389, "resetTime": "2026-09-29T17:31:55Z"}]},
            {"displayName": "Claude and GPT models", "buckets": [
                {"bucketId": "3p-weekly", "window": "weekly", "remainingFraction": 1, "resetTime": "2026-10-06T12:54:26Z"},
                {"bucketId": "3p-5h", "window": "5h", "remainingFraction": 0.1, "resetTime": "2026-09-29T17:54:26Z"}]}]}})
    }

    fn user_status() -> Value {
        json!({"userStatus": {"email": "x@y", "planStatus": {"planInfo": {"planName": "Pro"}},
            "cascadeModelConfigData": {"clientModelConfigs": [
                {"label": "Gemini 3.8 Flash (High)", "quotaInfo": {"remainingFraction": 0.9, "resetTime": "2026-09-29T17:31:55Z"}},
                {"label": "Gemini 3.8 Pro", "quotaInfo": {"remainingFraction": 0.6, "resetTime": "2026-09-29T17:40:00Z"}},
                {"label": "Claude Opus", "quotaInfo": {"remainingFraction": 0.0, "resetTime": "2026-09-29T17:00:00Z"}}]}}})
    }

    #[test]
    fn the_token_comes_only_from_an_antigravity_server() {
        let cmd = r"C:\Users\x\AppData\Local\Programs\Antigravity\resources\bin\language_server.exe --standalone --override_ide_name antigravity --https_server_port 0 --csrf_token abc-123 --app_data_dir antigravity";
        assert_eq!(csrf_token(cmd).as_deref(), Some("abc-123"));
        assert_eq!(csrf_token("language_server.exe --app_data_dir antigravity --csrf_token=\"q\"").as_deref(), Some("q"));
        assert_eq!(csrf_token(r"C:\Windsurf\language_server.exe --csrf_token abc"), None);
        assert_eq!(csrf_token("language_server.exe antigravity --csrf_token"), None);
        assert_eq!(csrf_token("language_server.exe antigravity"), None);
    }

    #[test]
    fn the_summary_gives_both_gemini_windows_with_resets() {
        let e = from_summary(&summary(), NOW).unwrap();
        assert_eq!((e.kind, e.source, e.ts, e.session_id.as_str()), (Kind::Limits, Source::Antigravity, NOW, SESSION_ID));
        assert_eq!(e.data.limits, vec![
            Limit { agent: Agent::Antigravity, window: Window::FiveHour, used_pct: 1.9, resets_at: crate::time::rfc3339_ms("2026-09-29T17:31:55Z") },
            Limit { agent: Agent::Antigravity, window: Window::Weekly, used_pct: 0.5, resets_at: crate::time::rfc3339_ms("2026-10-02T11:00:09Z") },
        ]);
    }

    #[test]
    fn a_missing_fraction_with_a_reset_is_an_exhausted_limit_not_no_data() {
        let b = json!({"groups": [{"buckets": [
            {"bucketId": "gemini-5h", "resetTime": "2026-09-29T17:31:55Z"},
            {"bucketId": "gemini-weekly", "remainingFraction": {"value": 0.25}}]}]});
        let e = from_summary(&b, NOW).unwrap();
        assert_eq!(e.data.limits.iter().map(|l| (l.window, l.used_pct)).collect::<Vec<_>>(),
            vec![(Window::FiveHour, 100.0), (Window::Weekly, 75.0)]);
        assert!(from_summary(&json!({"groups": [{"buckets": [{"bucketId": "gemini-5h"}]}]}), NOW).is_none());
        assert!(from_summary(&json!({"groups": [{"buckets": [{"bucketId": "3p-5h", "remainingFraction": 0.5}]}]}), NOW).is_none());
        assert!(from_summary(&json!("x"), NOW).is_none());
    }

    #[test]
    fn user_status_gives_the_most_used_gemini_model_as_the_5h_window() {
        let e = from_user_status(&user_status(), NOW).unwrap();
        assert_eq!(e.data.limits, vec![Limit { agent: Agent::Antigravity, window: Window::FiveHour, used_pct: 40.0,
            resets_at: crate::time::rfc3339_ms("2026-09-29T17:40:00Z") }]);
        // no account details (email, plan) go further
        assert!(!serde_json::to_string(&e).unwrap().contains("x@y"));
    }

    fn srv(port: u16) -> Server { Server { port, token: "t".into() } }

    #[test]
    fn the_poller_falls_back_to_user_status_on_404_and_skips_dead_ports() {
        let calls = RefCell::new(Vec::new());
        let post = |s: &Server, m: &str| { calls.borrow_mut().push((s.port, m.to_string())); match (s.port, m) {
            (1, _) => Err(Failure::Io),
            (2, SUMMARY) => Err(Failure::Status(404)),
            (2, _) => Ok(user_status()),
            _ => unreachable!(),
        } };
        let mut p = Poller::new();
        let Some(Usage::Limits(e)) = p.poll(NOW, &|| vec![srv(1), srv(2)], &post) else { panic!() };
        assert_eq!(e.data.limits[0].used_pct, 40.0);
        assert_eq!(*calls.borrow(), vec![(1, SUMMARY.into()), (2, SUMMARY.into()), (2, USER_STATUS.into())]);
    }

    #[test]
    fn the_poller_asks_once_a_minute_and_keeps_the_working_server() {
        let found = RefCell::new(0);
        let find = || { *found.borrow_mut() += 1; vec![srv(5)] };
        let mut p = Poller::new();
        assert!(matches!(p.poll(NOW, &find, &|_, _| Ok(summary())), Some(Usage::Limits(_))));
        assert!(p.poll(NOW + POLL_MS - 1, &find, &|_, _| unreachable!()).is_none());
        assert!(matches!(p.poll(NOW + POLL_MS, &|| unreachable!(), &|_, _| Ok(summary())), Some(Usage::Limits(_))));
        assert_eq!(*found.borrow(), 1, "known server needs no search");
    }

    #[test]
    fn a_restarted_server_is_found_again_and_a_closed_one_drops_the_limits_once() {
        let mut p = Poller::new();
        assert!(p.poll(NOW, &|| vec![srv(5)], &|_, _| Ok(summary())).is_some());
        // restart: old port denies (401 after token change), new one works
        let post = |s: &Server, _: &str| if s.port == 5 { Err(Failure::Status(401)) } else { Ok(summary()) };
        assert!(matches!(p.poll(NOW + POLL_MS, &|| vec![srv(6)], &post), Some(Usage::Limits(_))));
        // closed: no server
        assert!(matches!(p.poll(NOW + 2 * POLL_MS, &Vec::new, &|_, _| Err(Failure::Io)), Some(Usage::Stale)));
        assert!(p.poll(NOW + 3 * POLL_MS, &Vec::new, &|_, _| Err(Failure::Io)).is_none(), "only once");
    }

    #[test]
    fn nothing_running_reports_nothing() {
        assert!(Poller::new().poll(NOW, &Vec::new, &|_, _| unreachable!()).is_none());
    }
}
