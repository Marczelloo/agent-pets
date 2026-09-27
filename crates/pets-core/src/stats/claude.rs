//! Statystyki z transkryptów Claude Code (`projects/*/*.jsonl`) i plików subagentów (`subagents/agent-*.jsonl`).
use serde_json::Value;
use crate::time::rfc3339_ms;
use crate::tools::from_claude;
use super::{active_tick, Cell, FileEntry, StatAgent};

/// Ostatni człon ścieżki (`C:\work\Agent Pets` → `Agent Pets`); tylko on trafia do księgi.
pub fn project_of(cwd: &str) -> Option<String> {
    cwd.split(['/', '\\']).filter(|p| !p.is_empty()).last().map(String::from)
}

/// Jedna linia transkryptu → wkład w `e` (spec 2.2). Ta sama odpowiedź (`message.id`) powtarza się w kolejnych
/// wierszach, raz na blok treści: liczymy przyrost względem poprzedniego wiersza, więc suma to ostatnie liczby.
pub fn claude_line(e: &mut FileEntry, line: &str, sub: bool) {
    e.cursor.line += 1;
    let Ok(d) = serde_json::from_str::<Value>(line) else { return };
    let s = |k: &str| d.get(k).and_then(Value::as_str);
    e.meta.agent = Some(StatAgent::Claude);
    e.meta.sub = sub;
    if e.meta.project.is_none() { e.meta.project = s("cwd").and_then(project_of); }
    let Some(ts) = s("timestamp").and_then(rfc3339_ms) else { return };
    if e.meta.started.is_none() { e.meta.started = Some(ts); }
    let assistant = match s("type") { Some("assistant") => true, Some("user") => false, _ => return };
    let msg = d.get("message");
    if assistant {
        if let Some(m) = msg.and_then(|m| m.get("model")).and_then(Value::as_str) { e.cursor.model = Some(m.to_string()); }
    }
    let model = e.cursor.model.clone().unwrap_or_else(|| "unknown".to_string());
    if let Some((end, ms)) = active_tick(&mut e.cursor.last_event, ts) { e.cell(end, &model).active_ms += ms; }
    let (true, Some(m)) = (assistant, msg) else { return };
    if let (Some(u), Some(id)) = (m.get("usage"), m.get("id").and_then(Value::as_str)) {
        let n = |k: &str| u.get(k).and_then(Value::as_u64).unwrap_or(0);
        let new = Cell { input: n("input_tokens"), cache_read: n("cache_read_input_tokens"),
            cache_write: n("cache_creation_input_tokens"), output: n("output_tokens"), ..Cell::default() };
        let old = match &e.cursor.last_msg { Some((i, c)) if i == id => *c, _ => Cell::default() };
        let c = e.cell(ts, &model);
        c.input += new.input.saturating_sub(old.input);
        c.cache_read += new.cache_read.saturating_sub(old.cache_read);
        c.cache_write += new.cache_write.saturating_sub(old.cache_write);
        c.output += new.output.saturating_sub(old.output);
        let kept = Cell { input: new.input.max(old.input), cache_read: new.cache_read.max(old.cache_read),
            cache_write: new.cache_write.max(old.cache_write), output: new.output.max(old.output), ..Cell::default() };
        e.cursor.last_msg = Some((id.to_string(), kept));
    }
    for b in m.get("content").and_then(Value::as_array).into_iter().flatten() {
        if b.get("type").and_then(Value::as_str) != Some("tool_use") { continue; }
        let name = b.get("name").and_then(Value::as_str).unwrap_or("");
        let c = e.cell(ts, &model);
        if name == "AskUserQuestion" { c.questions += 1 } else { c.tools.add(from_claude(name)) }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::stats::{Cell, FileEntry, HOUR_MS, StatAgent};
    use crate::time::rfc3339_ms;
    use serde_json::{json, Value};

    const DAY: &str = "2026-09-27T";
    fn at(hms: &str) -> String { format!("{DAY}{hms}.000Z") }
    fn hour(hms: &str) -> i64 { rfc3339_ms(&at(hms)).unwrap().div_euclid(HOUR_MS) }
    fn user(hms: &str, text: &str) -> String {
        json!({"type": "user", "timestamp": at(hms), "cwd": "C:\\work\\Agent Pets", "message": {"role": "user", "content": text}}).to_string()
    }
    fn asst(hms: &str, id: &str, usage: Value, content: Value) -> String {
        json!({"type": "assistant", "timestamp": at(hms), "cwd": "C:\\work\\Agent Pets",
            "message": {"id": id, "model": "claude-opus-5-5", "usage": usage, "content": content}}).to_string()
    }
    fn usage(input: u64, read: u64, write: u64, output: u64) -> Value {
        json!({"input_tokens": input, "cache_read_input_tokens": read, "cache_creation_input_tokens": write, "output_tokens": output})
    }
    fn tool(name: &str, input: Value) -> Value { json!([{"type": "tool_use", "id": "t", "name": name, "input": input}]) }
    fn total(e: &FileEntry) -> Cell {
        let mut c = Cell::default();
        for m in e.hours.values() { for x in m.values() { c.add(x); } }
        c
    }
    fn feed(lines: &[String], sub: bool) -> FileEntry {
        let mut e = FileEntry::default();
        for l in lines { claude_line(&mut e, l, sub); }
        e
    }

    #[test]
    fn one_answer_repeated_in_several_lines_counts_once_with_its_last_numbers() {
        let e = feed(&[
            asst("10:00:00", "m1", usage(10, 900, 100, 5), json!([{"type": "thinking"}])),
            asst("10:00:01", "m1", usage(10, 900, 100, 40), json!([{"type": "text", "text": "x"}])),
            asst("10:00:02", "m1", usage(10, 900, 100, 90), tool("Bash", json!({"command": "ls"}))),
        ], false);
        let t = total(&e);
        assert_eq!((t.input, t.cache_read, t.cache_write, t.output), (10, 900, 100, 90));
        assert_eq!(e.cursor.model.as_deref(), Some("claude-opus-5-5"));
        assert_eq!(e.hours[&hour("10:00:00")].keys().collect::<Vec<_>>(), ["claude-opus-5-5"]);
    }

    #[test]
    fn different_answers_add_up() {
        let e = feed(&[
            asst("10:00:00", "m1", usage(10, 0, 0, 5), json!([])),
            asst("10:00:05", "m2", usage(20, 0, 0, 7), json!([])),
        ], false);
        let t = total(&e);
        assert_eq!((t.input, t.output), (30, 12));
    }

    #[test]
    fn tools_and_questions_are_counted_by_kind() {
        let e = feed(&[
            asst("10:00:00", "a", usage(1, 0, 0, 1), tool("Edit", json!({}))),
            asst("10:00:01", "b", usage(1, 0, 0, 1), tool("Bash", json!({}))),
            asst("10:00:02", "c", usage(1, 0, 0, 1), tool("Grep", json!({}))),
            asst("10:00:03", "d", usage(1, 0, 0, 1), tool("mcp__x__y", json!({}))),
            asst("10:00:04", "e", usage(1, 0, 0, 1), tool("AskUserQuestion", json!({"questions": []}))),
        ], false);
        let t = total(&e);
        assert_eq!((t.tools.edit, t.tools.bash, t.tools.grep, t.tools.mcp, t.tools.other), (1, 1, 1, 1, 0));
        assert_eq!(t.questions, 1);
    }

    #[test]
    fn metadata_comes_from_the_first_lines() {
        let e = feed(&[user("10:00:00", "hej"), asst("10:00:30", "a", usage(1, 0, 0, 1), json!([]))], true);
        assert_eq!(e.meta.agent, Some(StatAgent::Claude));
        assert_eq!(e.meta.project.as_deref(), Some("Agent Pets"));
        assert!(e.meta.sub);
        assert_eq!(e.meta.started, rfc3339_ms(&at("10:00:00")));
    }

    #[test]
    fn work_time_skips_long_pauses_and_lands_in_the_hour_where_the_gap_ends() {
        let e = feed(&[
            user("10:00:00", "a"),
            asst("10:00:30", "a", usage(1, 0, 0, 1), json!([])),
            asst("10:03:00", "b", usage(1, 0, 0, 1), json!([])),
            user("11:00:00", "b"),
            asst("11:00:10", "c", usage(1, 0, 0, 1), json!([])),
        ], false);
        let active = |h: i64| e.hours.get(&h).map(|m| m.values().map(|c| c.active_ms).sum::<u64>()).unwrap_or(0);
        assert_eq!(active(hour("10:00:00")), 180_000);
        assert_eq!(active(hour("11:00:00")), 10_000);

        let e = feed(&[user("09:59:50", "a"), user("10:00:20", "b")], false);
        assert_eq!(e.hours.keys().copied().collect::<Vec<_>>(), [hour("10:00:00")]);
    }

    #[test]
    fn broken_lines_change_only_the_line_counter() {
        let e = feed(&["{ nie json".to_string(), json!({"type": "user"}).to_string()], false);
        assert!(e.hours.is_empty());
        assert_eq!(e.cursor.line, 2);
    }

    #[test]
    fn no_content_reaches_the_book() {
        let secret = "SEKRET-123";
        let e = feed(&[
            json!({"type": "user", "timestamp": at("10:00:00"), "cwd": format!("C:\\{secret}\\proj"),
                "message": {"role": "user", "content": secret}}).to_string(),
            asst("10:00:10", "a", usage(1, 0, 0, 1), tool("Bash", json!({"command": secret}))),
        ], false);
        let s = serde_json::to_string(&e).unwrap();
        assert!(!s.contains(secret), "{s}");
        assert_eq!(e.meta.project.as_deref(), Some("proj"));
    }
}
