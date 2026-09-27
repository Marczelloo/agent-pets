//! Statystyki z rolloutów Codexa (`sessions/**/rollout-*.jsonl`).
use serde_json::Value;
use crate::codex::rollout::{js_tool_calls, ASK};
use crate::model::Tool;
use crate::time::rfc3339_ms;
use crate::tools::from_codex;
use super::claude::project_of;
use super::{active_tick, FileEntry, StatAgent};

/// Jedna linia rolloutu → wkład w `e` (spec 2.2). Suma `total_token_usage` jest narastająca: liczymy przyrost.
/// Wątek-dziecko zaczyna się kopią historii rodzica; linie przed `subagent_history_start_ordinal` pomijamy.
pub fn codex_line(e: &mut FileEntry, line: &str) {
    let index = e.cursor.line;
    e.cursor.line += 1;
    if index < e.cursor.skip_until { return; }
    let Ok(d) = serde_json::from_str::<Value>(line) else { return };
    let Some(ts) = d.get("timestamp").and_then(Value::as_str).and_then(rfc3339_ms) else { return };
    let ty = d.get("type").and_then(Value::as_str).unwrap_or("");
    let null = Value::Null;
    let p = d.get("payload").unwrap_or(&null);
    let ps = |k: &str| p.get(k).and_then(Value::as_str);

    if ty == "session_meta" {
        if e.meta.agent.is_some() { return; }
        if ps("thread_source") == Some("subagent") {
            let parent = p.pointer("/source/subagent/thread_spawn/parent_thread_id").and_then(Value::as_str).filter(|v| !v.is_empty());
            if parent.is_none() {
                // wątek pomocniczy bez rodzica (np. guardian): nie liczymy nic z tego pliku
                e.cursor.skip_until = u64::MAX;
                return;
            }
            e.meta.sub = true;
            e.cursor.skip_until = p.get("subagent_history_start_ordinal").and_then(Value::as_u64).unwrap_or(0);
        }
        let router = ps("originator") == Some("agent-router");
        e.meta.agent = Some(if router { StatAgent::Router } else { StatAgent::Codex });
        if router { e.meta.sub = true; }
        e.meta.project = ps("cwd").and_then(project_of);
        e.meta.started = Some(ts);
        e.cursor.last_event = Some(ts);
        return;
    }
    if e.meta.agent.is_none() { return; }
    if ty == "turn_context" {
        if let Some(m) = ps("model") { e.cursor.model = Some(m.to_string()); }
    }
    let model = e.cursor.model.clone().unwrap_or_else(|| "unknown".to_string());
    if let Some((end, ms)) = active_tick(&mut e.cursor.last_event, ts) { e.cell(end, &model).active_ms += ms; }

    match (ty, ps("type").unwrap_or("")) {
        ("event_msg", "token_count") => {
            let Some(u) = p.pointer("/info/total_token_usage") else { return };
            let n = |k: &str| u.get(k).and_then(Value::as_u64).unwrap_or(0);
            let now = [n("input_tokens").saturating_sub(n("cached_input_tokens")), n("cached_input_tokens"),
                n("cache_write_input_tokens"), n("output_tokens")];
            let before = e.cursor.last_total.unwrap_or_default();
            let c = e.cell(ts, &model);
            c.input += now[0].saturating_sub(before[0]);
            c.cache_read += now[1].saturating_sub(before[1]);
            c.cache_write += now[2].saturating_sub(before[2]);
            c.output += now[3].saturating_sub(before[3]);
            e.cursor.last_total = Some(now);
        }
        ("response_item", "function_call") => {
            let name = ps("name").unwrap_or("");
            let c = e.cell(ts, &model);
            if ASK.contains(&name) { c.questions += 1; }
            else if ps("namespace").is_some_and(|n| n.starts_with("mcp__")) { c.tools.add(Tool::Mcp); }
            else if let Some(t) = from_codex(name) { c.tools.add(t); }
        }
        ("response_item", "custom_tool_call") => match ps("name") {
            Some("apply_patch") => e.cell(ts, &model).tools.add(Tool::Edit),
            Some("exec") => {
                let calls = js_tool_calls(ps("input").unwrap_or(""));
                let c = e.cell(ts, &model);
                if calls.iter().any(|x| ASK.contains(&x.as_str())) { c.questions += 1; }
                else if let Some(t) = calls.iter().find_map(|x| from_codex(x)) { c.tools.add(t); }
            }
            _ => {}
        },
        ("response_item", "web_search_call") => e.cell(ts, &model).tools.add(Tool::Web),
        _ => {}
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::stats::{Cell, FileEntry, StatAgent};
    use serde_json::{json, Value};

    fn l(ts: &str, ty: &str, payload: Value) -> String {
        json!({"timestamp": format!("2026-09-27T{ts}.000Z"), "type": ty, "payload": payload}).to_string()
    }
    fn meta(originator: &str) -> String {
        l("10:00:00", "session_meta", json!({"id": "t1", "cwd": "C:\\work\\Agent Pets", "originator": originator, "source": "vscode"}))
    }
    fn tokens(ts: &str, input: u64, cached: u64, output: u64) -> String {
        l(ts, "event_msg", json!({"type": "token_count", "info": {"total_token_usage":
            {"input_tokens": input, "cached_input_tokens": cached, "cache_write_input_tokens": 0, "output_tokens": output}}}))
    }
    fn call(ts: &str, name: &str, args: Value) -> String {
        l(ts, "response_item", json!({"type": "function_call", "name": name, "arguments": args.to_string()}))
    }
    fn total(e: &FileEntry) -> Cell {
        let mut c = Cell::default();
        for m in e.buckets.values() { for x in m.values() { c.add(x); } }
        c
    }
    fn feed(lines: &[String]) -> FileEntry {
        let mut e = FileEntry::default();
        for x in lines { codex_line(&mut e, x); }
        e
    }

    #[test]
    fn running_totals_become_increments() {
        let t = total(&feed(&[meta("Codex Desktop"), tokens("10:00:05", 1000, 800, 50), tokens("10:00:10", 1500, 1200, 90)]));
        assert_eq!((t.input, t.cache_read, t.output), (300, 1200, 90));
    }

    #[test]
    fn a_falling_total_adds_nothing() {
        let t = total(&feed(&[meta("Codex Desktop"), tokens("10:00:05", 1000, 800, 50), tokens("10:00:10", 10, 0, 1)]));
        assert_eq!((t.input, t.cache_read, t.output), (200, 800, 50));
    }

    #[test]
    fn a_child_thread_does_not_count_the_copied_parent_history() {
        let child = l("10:00:00", "session_meta", json!({"id": "c1", "cwd": "C:\\work\\Agent Pets", "originator": "Codex Desktop",
            "thread_source": "subagent", "subagent_history_start_ordinal": 3,
            "source": {"subagent": {"thread_spawn": {"parent_thread_id": "p1", "agent_role": "worker"}}}}));
        let e = feed(&[child, tokens("09:00:00", 1_000_000, 0, 0), meta("Codex Desktop"), tokens("10:00:05", 100, 0, 10)]);
        let t = total(&e);
        assert_eq!((t.input, t.output), (100, 10));
        assert!(e.meta.sub);
        assert_eq!(e.meta.agent, Some(StatAgent::Codex));
    }

    #[test]
    fn a_helper_thread_without_a_parent_is_skipped() {
        let guardian = l("10:00:00", "session_meta", json!({"id": "g", "cwd": "C:\\p", "originator": "Codex Desktop", "thread_source": "subagent"}));
        let e = feed(&[guardian, tokens("10:00:05", 100, 0, 10)]);
        assert!(e.buckets.is_empty());
        assert_eq!(e.meta.agent, None);
    }

    #[test]
    fn only_the_first_session_meta_counts() {
        let other = l("10:00:01", "session_meta", json!({"id": "x", "cwd": "C:\\other", "originator": "agent-router"}));
        let e = feed(&[meta("Codex Desktop"), other]);
        assert_eq!(e.meta.project.as_deref(), Some("Agent Pets"));
        assert_eq!(e.meta.agent, Some(StatAgent::Codex));
        assert_eq!(e.meta.started, crate::time::rfc3339_ms("2026-09-27T10:00:00.000Z"));
    }

    #[test]
    fn router_threads_are_router_subagents() {
        let e = feed(&[meta("agent-router")]);
        assert_eq!(e.meta.agent, Some(StatAgent::Router));
        assert!(e.meta.sub);
    }

    #[test]
    fn tools_questions_and_model() {
        let e = feed(&[
            meta("Codex Desktop"),
            call("10:00:01", "request_user_input", json!({"questions": []})),
            call("10:00:02", "shell_command", json!({"command": "ls"})),
            call("10:00:03", "update_plan", json!({"plan": []})),
            l("10:00:04", "turn_context", json!({"model": "gpt-6-sol"})),
            l("10:00:05", "response_item", json!({"type": "custom_tool_call", "name": "apply_patch", "input": "*** Begin Patch"})),
            l("10:00:06", "response_item", json!({"type": "web_search_call"})),
        ]);
        let t = total(&e);
        assert_eq!((t.questions, t.tools.bash, t.tools.edit, t.tools.web, t.tools.other), (1, 1, 1, 1, 0));
        assert_eq!(e.cursor.model.as_deref(), Some("gpt-6-sol"));
        let first_hour = e.buckets.values().next().unwrap();
        assert!(first_hour.contains_key("unknown") && first_hour.contains_key("gpt-6-sol"), "{first_hour:?}");
    }

    #[test]
    fn no_content_reaches_the_book() {
        let secret = "SEKRET-123";
        let e = feed(&[
            meta("Codex Desktop"),
            call("10:00:01", "shell_command", json!({"command": secret})),
            l("10:00:02", "event_msg", json!({"type": "item_completed", "item": {"type": "UserMessage", "content": [{"text": secret}]}})),
        ]);
        assert!(!serde_json::to_string(&e).unwrap().contains(secret));
    }
}
