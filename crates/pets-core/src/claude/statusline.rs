//! JSON statusline Claude Code → limity konta (5h, tydzień), kontekst i tytuł sesji (raport S3).
use super::StatuslineEnvelope;
use crate::model::*;
use serde_json::Value;

fn limit(v: &Value, window: Window) -> Option<Limit> {
    let used = v.get("used_percentage")?.as_f64()?;
    let resets_at = v.get("resets_at").and_then(Value::as_i64).map(|s| s * 1000);
    Some(Limit { agent: Agent::Claude, window, used_pct: used as f32, resets_at })
}

pub fn to_events(env: &StatuslineEnvelope) -> Vec<Event> {
    let p = &env.payload;
    let Some(sid) = p.get("session_id").and_then(Value::as_str) else { return vec![] };
    let mut out = Vec::new();
    let rl = &p["rate_limits"];
    let limits: Vec<Limit> = [(&rl["five_hour"], Window::FiveHour), (&rl["seven_day"], Window::Weekly)]
        .into_iter().filter_map(|(v, w)| limit(v, w)).collect();
    if !limits.is_empty() {
        let mut e = Event::new(Source::Claude, sid, Kind::Limits, env.ts);
        e.data.limits = limits;
        out.push(e);
    }
    let cw = &p["context_window"];
    let context = match (cw["used_percentage"].as_f64(), cw["context_window_size"].as_u64()) {
        (Some(pct), Some(max)) if max > 0 => Some(Context { used: (pct / 100.0 * max as f64).round() as u64, max }),
        _ => None,
    };
    let title = p.get("session_name").and_then(Value::as_str).filter(|s| !s.is_empty()).map(String::from);
    if context.is_some() || title.is_some() {
        let mut e = Event::new(Source::Claude, sid, Kind::Meta, env.ts);
        e.data.context = context;
        e.data.title = title;
        out.push(e);
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::{Agent, Context, Kind, Window};
    use serde_json::json;

    fn fixture() -> serde_json::Value {
        serde_json::from_str(include_str!("../../tests/fixtures/claude/statusline.json")).unwrap()
    }

    #[test]
    fn limits_context_and_title() {
        let ev = to_events(&StatuslineEnvelope { ts: 5_000, payload: fixture() });
        let limits = ev.iter().find(|e| e.kind == Kind::Limits).unwrap();
        assert_eq!(limits.data.limits.len(), 2);
        let five = limits.data.limits.iter().find(|l| l.window == Window::FiveHour).unwrap();
        assert_eq!((five.agent, five.used_pct, five.resets_at), (Agent::Claude, 34.0, Some(1_790_290_000_000)));
        let meta = ev.iter().find(|e| e.kind == Kind::Meta).unwrap();
        assert_eq!(meta.session_id, "3746a003-5ba1-42b3-a085-009646ebcf00");
        assert_eq!(meta.data.context, Some(Context { used: 125_000, max: 1_000_000 }));
        assert_eq!(meta.data.title.as_deref(), Some("Widżet w pasku"));
        assert_eq!(meta.ts, 5_000);
    }

    #[test]
    fn missing_or_null_values_produce_nothing_instead_of_zeroes() {
        let ev = to_events(&StatuslineEnvelope { ts: 1, payload: json!({
            "session_id": "s", "rate_limits": { "five_hour": { "used_percentage": null } },
            "context_window": { "used_percentage": null, "context_window_size": 200000 } }) });
        assert!(ev.iter().all(|e| e.kind != Kind::Limits), "limit bez procentu to brak danych");
        assert!(ev.iter().all(|e| e.data.context.is_none()));
    }

    #[test]
    fn garbage_is_ignored() {
        assert!(to_events(&StatuslineEnvelope { ts: 1, payload: json!("x") }).is_empty());
        assert!(to_events(&StatuslineEnvelope { ts: 1, payload: json!({}) }).is_empty());
    }
}
