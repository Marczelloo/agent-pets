//! Grok Build: hooki z `~/.grok/hooks/agent-pets.json` (spec 0.12 §4). `hook.exe --agent grok --event <nazwa>`.
use serde_json::Value;

/// Uzupełnia `sessionId` ze zmiennej `GROK_SESSION_ID`, gdy JSON go nie ma (ani `session_id`).
pub fn fill_session(payload: &mut Value, sid: Option<String>) {
    let (Some(o), Some(sid)) = (payload.as_object_mut(), sid) else { return };
    if !o.contains_key("sessionId") && !o.contains_key("session_id") { o.insert("sessionId".into(), Value::String(sid)); }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn the_session_id_comes_from_the_environment_when_the_json_has_none() {
        let mut p = json!({"hookEventName": "Stop"});
        fill_session(&mut p, Some("g1".into()));
        assert_eq!(p["sessionId"], "g1");
        let mut own = json!({"sessionId": "g2"});
        fill_session(&mut own, Some("g1".into()));
        assert_eq!(own["sessionId"], "g2");
        let mut snake = json!({"session_id": "g3"});
        fill_session(&mut snake, Some("g1".into()));
        assert!(snake.get("sessionId").is_none());
        let mut none = json!({});
        fill_session(&mut none, None);
        assert!(none.get("sessionId").is_none());
        let mut arr = json!([1]);
        fill_session(&mut arr, Some("g1".into()));
        assert_eq!(arr, json!([1]));
    }
}
