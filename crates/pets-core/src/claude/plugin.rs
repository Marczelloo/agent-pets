//! Claude Code mod (plugin) payloads: pure mapping from the JSON the mod POSTs (limits, context, cost, turn-end
//! reason, model) to runtime events. The HTTP route that calls it lives in the app.
use crate::model::*;
use serde::Deserialize;

/// Session id carrying the account-wide limits sent by the mod (not tied to any real session).
pub const USAGE_SESSION_ID: &str = "claude-mod-usage";

#[derive(Deserialize, Debug, Clone, Default, PartialEq)]
#[serde(default)]
pub struct ModPayload {
    pub v: u32,
    pub kind: String,
    pub session_id: String,
    pub ts: i64,
    pub cwd: Option<String>,
    pub model: Option<String>,
    pub context: Option<ModContext>,
    pub rate_limits: Vec<ModLimit>,
    pub cost_usd: Option<f64>,
    pub reason: Option<String>,
}

#[derive(Deserialize, Debug, Clone, Default, PartialEq)]
#[serde(default)]
pub struct ModContext {
    pub tokens: Option<u64>,
    pub window: Option<u64>,
    pub percent: Option<f64>,
}

#[derive(Deserialize, Debug, Clone, Default, PartialEq)]
#[serde(default)]
pub struct ModLimit {
    pub kind: String,
    pub percent_used: f64,
    /// ISO 8601 string (confirmed by the spike).
    pub resets_at: Option<String>,
}

/// What a payload turns into: runtime events plus the session cost (not an event field).
#[derive(Debug, Clone, Default, PartialEq)]
pub struct ModUpdate {
    pub events: Vec<Event>,
    pub cost: Option<f64>,
}

fn limits_event(p: &ModPayload) -> Option<Event> {
    let limits: Vec<Limit> = p.rate_limits.iter()
        .filter_map(|l| {
            let window = match l.kind.as_str() {
                "five_hour" => Window::FiveHour,
                "seven_day" => Window::Weekly,
                _ => return None,
            };
            // NaN would survive clamp; treat it as no data for this entry.
            if l.percent_used.is_nan() { return None; }
            Some(Limit {
                agent: Agent::Claude,
                window,
                used_pct: l.percent_used.clamp(0.0, 100.0) as f32,
                resets_at: l.resets_at.as_deref().and_then(crate::time::rfc3339_ms),
                stale_since: None,
            })
        })
        .collect();
    if limits.is_empty() { return None; }
    let mut e = Event::new(Source::Claude, USAGE_SESSION_ID, Kind::Limits, p.ts);
    e.data.limits = limits;
    Some(e)
}

fn context_of(c: &ModContext) -> Option<Context> {
    match (c.tokens, c.window, c.percent) {
        (Some(used), Some(max), _) => Some(Context { used: used.min(max), max }),
        (None, Some(max), Some(pct)) if pct.is_finite() && pct >= 0.0 =>
            Some(Context { used: (pct.min(100.0) / 100.0 * max as f64).round() as u64, max }),
        _ => None,
    }
}

pub fn to_update(p: &ModPayload) -> ModUpdate {
    let mut events: Vec<Event> = limits_event(p).into_iter().collect();
    let cost = p.cost_usd.filter(|c| c.is_finite() && *c >= 0.0);
    if p.session_id.is_empty() {
        return ModUpdate { events, cost };
    }
    let session = |kind: Kind| Event::new(Source::Claude, p.session_id.as_str(), kind, p.ts);
    match p.kind.as_str() {
        "measure" => {
            let ctx = p.context.as_ref().and_then(context_of);
            if ctx.is_some() || p.model.is_some() {
                let mut e = session(Kind::Meta);
                e.data.context = ctx;
                e.data.model = p.model.clone();
                events.push(e);
            }
        }
        "start" => {
            if let Some(model) = &p.model {
                let mut e = session(Kind::Meta);
                e.data.model = Some(model.clone());
                e.data.cwd = p.cwd.clone();
                events.push(e);
            }
        }
        "turn_end" => match p.reason.as_deref() {
            Some("aborted") => events.push(session(Kind::TurnEnd)),
            Some("error") | Some("refusal") => events.push(session(Kind::Error)),
            _ => {}
        },
        _ => {}
    }
    ModUpdate { events, cost }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn p(v: serde_json::Value) -> ModPayload { serde_json::from_value(v).unwrap() }

    #[test]
    fn measure_carries_the_model_too() {
        let u = to_update(&p(json!({"v":1,"kind":"measure","session_id":"s","ts":5,"model":"claude-opus-5-5"})));
        assert_eq!(u.events[0].data.model.as_deref(), Some("claude-opus-5-5"));
    }

    #[test]
    fn context_never_exceeds_the_window() {
        let c = |v| to_update(&p(json!({"v":1,"kind":"measure","session_id":"s","ts":5,"context":v}))).events[0].data.context;
        assert_eq!(c(json!({"tokens":300,"window":200})), Some(Context { used: 200, max: 200 }));
        assert_eq!(c(json!({"percent":250,"window":200})), Some(Context { used: 200, max: 200 }));
    }

    #[test]
    fn rate_limits_become_one_limits_event_on_the_usage_session() {
        let u = to_update(&p(json!({"v":1,"kind":"measure","session_id":"s","ts":5,"rate_limits":[
            {"kind":"five_hour","percent_used":23.5,"resets_at":"2026-10-04T18:00:00Z"},
            {"kind":"seven_day","percent_used":140.0},
            {"kind":"spend_limit","percent_used":10.0}]})));
        let e = u.events.iter().find(|e| e.kind == Kind::Limits).unwrap();
        assert_eq!(e.session_id, USAGE_SESSION_ID);
        assert_eq!((e.source, e.ts), (Source::Claude, 5));
        assert_eq!(e.data.limits.len(), 2);
        assert_eq!(e.data.limits[0].window, Window::FiveHour);
        assert_eq!(e.data.limits[0].used_pct, 23.5);
        assert_eq!(e.data.limits[0].resets_at, crate::time::rfc3339_ms("2026-10-04T18:00:00Z"));
        assert_eq!(e.data.limits[1].window, Window::Weekly);
        assert_eq!(e.data.limits[1].used_pct, 100.0);
        assert_eq!(e.data.limits[1].resets_at, None);
    }

    #[test]
    fn context_and_cost_go_to_the_session() {
        let u = to_update(&p(json!({"v":1,"kind":"measure","session_id":"s","ts":5,
            "context":{"tokens":81234,"window":1000000,"percent":8},"cost_usd":1.42})));
        let m = u.events.iter().find(|e| e.kind == Kind::Meta).unwrap();
        assert_eq!(m.session_id, "s");
        assert_eq!(m.data.context, Some(Context { used: 81234, max: 1000000 }));
        assert_eq!(u.cost, Some(1.42));
    }

    #[test]
    fn context_from_percent_and_window_only() {
        let u = to_update(&p(json!({"v":1,"kind":"measure","session_id":"s","ts":5,
            "context":{"window":200000,"percent":25}})));
        assert_eq!(u.events[0].data.context, Some(Context { used: 50000, max: 200000 }));
    }

    #[test]
    fn bad_cost_is_dropped() {
        let cost = |c: serde_json::Value| to_update(&p(json!({"v":1,"kind":"measure","session_id":"s","ts":5,"cost_usd":c}))).cost;
        assert_eq!(cost(json!(-0.5)), None);
        assert_eq!(cost(json!(0.0)), Some(0.0));
    }

    #[test]
    fn turn_end_reasons_map() {
        let k = |r: &str| to_update(&p(json!({"v":1,"kind":"turn_end","session_id":"s","ts":5,"reason":r}))).events.iter().map(|e| e.kind).collect::<Vec<_>>();
        assert_eq!(k("aborted"), [Kind::TurnEnd]);
        assert_eq!(k("error"), [Kind::Error]);
        assert_eq!(k("refusal"), [Kind::Error]);
        assert!(k("answer").is_empty());
    }

    #[test]
    fn start_carries_the_model_and_unknown_fields_are_ignored() {
        let u = to_update(&p(json!({"v":1,"kind":"start","session_id":"s","ts":5,"model":"claude-opus-5-5","cwd":"/work/x","extra":{"x":1}})));
        assert_eq!(u.events[0].data.model.as_deref(), Some("claude-opus-5-5"));
        assert_eq!(u.events[0].data.cwd.as_deref(), Some("/work/x"));
    }

    #[test]
    fn missing_figures_send_nothing() {
        let u = to_update(&p(json!({"v":1,"kind":"measure","session_id":"s","ts":5})));
        assert!(u.events.is_empty() && u.cost.is_none());
    }

    #[test]
    fn empty_session_id_only_yields_limits() {
        let u = to_update(&p(json!({"v":1,"kind":"measure","session_id":"","ts":5,
            "context":{"tokens":1,"window":2},
            "rate_limits":[{"kind":"five_hour","percent_used":1.0}]})));
        assert_eq!(u.events.len(), 1);
        assert_eq!(u.events[0].kind, Kind::Limits);
    }
}
