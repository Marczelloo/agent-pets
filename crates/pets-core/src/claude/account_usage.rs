//! Limity konta Claude prosto z serwera Anthropic (`GET https://api.anthropic.com/api/oauth/usage`), tak jak robi
//! to `/usage` w Claude Code: dokładne procenty i czasy resetu, bez sesji CLI. Tu jest tylko czysta część
//! (token, odpowiedź → zdarzenie); zapytanie sieciowe wysyła aplikacja.
use crate::model::*;
use serde_json::Value;

pub const URL: &str = "https://api.anthropic.com/api/oauth/usage";
/// Nagłówek wymagany przez endpointy OAuth (jak w Claude Code).
pub const BETA: &str = "oauth-2025-04-20";
pub const SESSION_ID: &str = "claude-account-usage";

/// Token dostępu z `~/.claude/.credentials.json`, jeśli jeszcze ważny. Claude Code sam go odświeża.
pub fn token(credentials: &[u8], now: i64) -> Option<String> {
    let v: Value = serde_json::from_slice(credentials).ok()?;
    let o = v.get("claudeAiOauth")?;
    let tok = o.get("accessToken")?.as_str().filter(|t| !t.is_empty())?;
    if o.get("expiresAt").and_then(Value::as_i64).is_some_and(|exp| exp <= now) { return None; }
    Some(tok.to_string())
}

/// Odpowiedź `api/oauth/usage` jako zdarzenie limitów. Brak `utilization` to brak danych, nie 0%.
pub fn to_event(body: &Value, now: i64) -> Option<Event> {
    let limits: Vec<Limit> = [("five_hour", Window::FiveHour), ("seven_day", Window::Weekly)].into_iter()
        .filter_map(|(k, window)| {
            let w = body.get(k)?;
            Some(Limit {
                agent: Agent::Claude, window, used_pct: w.get("utilization")?.as_f64()? as f32,
                resets_at: w.get("resets_at").and_then(Value::as_str).and_then(crate::time::rfc3339_ms),
            })
        })
        .collect();
    if limits.is_empty() { return None; }
    let mut e = Event::new(Source::Claude, SESSION_ID, Kind::Limits, now);
    e.data.limits = limits;
    Some(e)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    const NOW: i64 = 1_790_340_000_000;

    #[test]
    fn valid_token_only() {
        let creds = |exp: i64| serde_json::to_vec(&json!({"claudeAiOauth": {"accessToken": "tok", "expiresAt": exp}})).unwrap();
        assert_eq!(token(&creds(NOW + 60_000), NOW).as_deref(), Some("tok"));
        assert_eq!(token(&creds(NOW - 1), NOW), None, "wygasły: czekamy, aż Claude Code go odświeży");
        assert_eq!(token(b"{bad", NOW), None);
        assert_eq!(token(br#"{"claudeAiOauth":{"accessToken":""}}"#, NOW), None);
    }

    #[test]
    fn limits_with_exact_resets() {
        let body = json!({
            "five_hour": {"utilization": 1.0, "resets_at": "2026-09-25T18:20:00.013684+00:00"},
            "seven_day": {"utilization": 84.0, "resets_at": "2026-09-29T07:00:00.013705+00:00"},
            "seven_day_opus": null});
        let e = to_event(&body, NOW).unwrap();
        assert_eq!((e.kind, e.source, e.ts, e.session_id.as_str()), (Kind::Limits, Source::Claude, NOW, SESSION_ID));
        assert_eq!(e.data.limits, vec![
            Limit { agent: Agent::Claude, window: Window::FiveHour, used_pct: 1.0, resets_at: Some(1_790_360_400_013) },
            Limit { agent: Agent::Claude, window: Window::Weekly, used_pct: 84.0, resets_at: Some(1_790_665_200_013) },
        ]);
    }

    #[test]
    fn missing_values_are_no_data() {
        assert!(to_event(&json!({"five_hour": null, "seven_day": {"utilization": null}}), NOW).is_none());
        assert!(to_event(&json!("x"), NOW).is_none());
        let e = to_event(&json!({"seven_day": {"utilization": 5.0, "resets_at": null}}), NOW).unwrap();
        assert_eq!(e.data.limits, vec![Limit { agent: Agent::Claude, window: Window::Weekly, used_pct: 5.0, resets_at: None }]);
    }
}
