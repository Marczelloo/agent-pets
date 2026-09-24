use serde_json::Value;
use crate::model::*;
use crate::time::rfc3339_ms;
use crate::tools::from_codex;

/// Nazwy narzędzi wywoływanych w kodzie JS narzędzia `exec`, np. `tools.exec_command(`.
pub fn js_tool_calls(src: &str) -> Vec<String> {
    let mut out = Vec::new();
    let mut rest = src;
    while let Some(i) = rest.find("tools.") {
        rest = &rest[i + 6..];
        let name: String = rest.chars().take_while(|c| c.is_ascii_alphanumeric() || *c == '_').collect();
        let after = rest[name.len()..].trim_start();
        if !name.is_empty() && after.starts_with('(') { out.push(name); }
    }
    out
}

const ASK: [&str; 3] = ["request_user_input", "request_user_input_async", "request_permissions"];

/// Okno limitu rozpoznajemy po `window_minutes`; `primary`/`secondary` nie mają stałego znaczenia.
fn limits_from(rl: &Value) -> Vec<Limit> {
    ["primary", "secondary"].iter().filter_map(|k| {
        let w = rl.get(*k)?;
        let window = match w.get("window_minutes")?.as_u64()? { 300 => Window::FiveHour, 10080 => Window::Weekly, _ => return None };
        Some(Limit {
            agent: Agent::Codex,
            window,
            used_pct: w.get("used_percent")?.as_f64()? as f32,
            resets_at: w.get("resets_at").and_then(|v| v.as_i64()).map(|s| s * 1000),
        })
    }).collect()
}

#[derive(Default)]
pub struct RolloutParser {
    sid: Option<String>,
    parent: Option<String>,
    skip: bool,
    router: bool,
    titled: bool,
}

impl RolloutParser {
    pub fn new() -> Self { Self::default() }

    fn ev(&self, kind: Kind, ts: i64) -> Option<Event> {
        let src = if self.router { Source::Router } else { Source::Codex };
        Some(Event::new(src, self.sid.clone()?, kind, ts))
    }

    fn one(&self, ts: i64, kind: Kind) -> Vec<Event> {
        self.ev(kind, ts).map(|e| vec![e]).unwrap_or_default()
    }

    fn tool_start(&self, tool: Tool, ts: i64) -> Vec<Event> {
        self.ev(Kind::ToolStart, ts).map(|mut e| { e.tool = Some(tool); vec![e] }).unwrap_or_default()
    }

    pub fn parse_line(&mut self, line: &str) -> Vec<Event> {
        let Ok(d) = serde_json::from_str::<Value>(line) else { return vec![] };
        let Some(ts) = d.get("timestamp").and_then(|v| v.as_str()).and_then(rfc3339_ms) else { return vec![] };
        let ty = d.get("type").and_then(|v| v.as_str()).unwrap_or("");
        let null = Value::Null;
        let p = d.get("payload").unwrap_or(&null);
        let pt = p.get("type").and_then(|v| v.as_str()).unwrap_or("");
        let ps = |k: &str| p.get(k).and_then(|v| v.as_str());

        if ty == "session_meta" {
            let id = ps("id").or(ps("session_id")).unwrap_or("").to_string();
            if ps("thread_source") == Some("subagent") {
                self.skip = true;
                self.parent = p.pointer("/source/subagent/thread_spawn/parent_thread_id").and_then(|v| v.as_str()).map(String::from);
                return match &self.parent {
                    Some(par) => {
                        let mut e = Event::new(Source::Codex, par.clone(), Kind::ToolStart, ts);
                        e.tool = Some(Tool::Agent);
                        vec![e]
                    }
                    None => vec![],
                };
            }
            let originator = ps("originator").unwrap_or("");
            self.router = originator == "agent-router";
            self.sid = Some(id);
            let (origin, app) = if self.router { (Origin::Router, None) }
                else if originator == "codex-tui" || ps("source") == Some("cli") { (Origin::Cli, Some(App::Terminal)) }
                else { (Origin::Desktop, Some(App::CodexApp)) };
            let mut e = self.ev(Kind::SessionStart, ts).unwrap();
            e.data.cwd = ps("cwd").map(String::from);
            e.data.origin = Some(origin);
            e.data.app = app;
            return vec![e];
        }

        if self.skip {
            if ty == "event_msg" && (pt == "task_complete" || pt == "turn_aborted") {
                if let Some(par) = &self.parent { return vec![Event::new(Source::Codex, par.clone(), Kind::ToolEnd, ts)]; }
            }
            return vec![];
        }
        if self.sid.is_none() { return vec![]; }

        match (ty, pt) {
            ("event_msg", "task_started") => self.one(ts, Kind::Prompt),
            ("event_msg", "task_complete") | ("event_msg", "turn_aborted") => self.one(ts, Kind::TurnEnd),
            ("event_msg", "error") | ("event_msg", "stream_error") => self.one(ts, Kind::Error),
            ("event_msg", "token_count") => {
                let mut e = self.ev(Kind::Meta, ts).unwrap();
                if let (Some(used), Some(max)) = (
                    p.pointer("/info/last_token_usage/input_tokens").and_then(|v| v.as_u64()),
                    p.pointer("/info/model_context_window").and_then(|v| v.as_u64()),
                ) { e.data.context = Some(Context { used, max }); }
                if let Some(rl) = p.get("rate_limits") { e.data.limits = limits_from(rl); }
                if e.data.context.is_none() && e.data.limits.is_empty() { vec![] } else { vec![e] }
            }
            ("event_msg", "item_completed") => match p.pointer("/item/type").and_then(|v| v.as_str()) {
                Some("UserMessage") if !self.titled => {
                    let text = p.pointer("/item/content/0/text").and_then(|v| v.as_str()).unwrap_or("").trim();
                    if text.is_empty() { return vec![]; }
                    self.titled = true;
                    let mut e = self.ev(Kind::Meta, ts).unwrap();
                    e.data.title = Some(text.chars().take(80).collect());
                    vec![e]
                }
                Some("ContextCompaction") => self.one(ts, Kind::Compact),
                _ => vec![],
            },
            ("compacted", _) => self.one(ts, Kind::Compact),
            ("response_item", "custom_tool_call") => match ps("name") {
                Some("apply_patch") => self.tool_start(Tool::Edit, ts),
                Some("exec") => {
                    let calls = js_tool_calls(ps("input").unwrap_or(""));
                    if calls.iter().any(|c| ASK.contains(&c.as_str())) { return self.one(ts, Kind::NeedsInput); }
                    match calls.iter().find_map(|c| from_codex(c)) {
                        Some(t) => self.tool_start(t, ts),
                        None => vec![],
                    }
                }
                _ => vec![],
            },
            ("response_item", "function_call") => {
                let name = ps("name").unwrap_or("");
                let ns = ps("namespace").unwrap_or("");
                if ASK.contains(&name) { return self.one(ts, Kind::NeedsInput); }
                if name == "update_plan" {
                    let args: Value = serde_json::from_str(ps("arguments").unwrap_or("{}")).unwrap_or(Value::Null);
                    let Some(plan) = args.get("plan").and_then(|v| v.as_array()) else { return vec![] };
                    let done = plan.iter().filter(|s| s.get("status").and_then(|v| v.as_str()) == Some("completed")).count();
                    let mut e = self.ev(Kind::Meta, ts).unwrap();
                    e.data.progress = Some(Progress { done: done as u32, total: plan.len() as u32 });
                    return vec![e];
                }
                let tool = if ns.starts_with("mcp__") { Some(Tool::Mcp) } else { from_codex(name) };
                tool.map(|t| self.tool_start(t, ts)).unwrap_or_default()
            }
            ("response_item", "web_search_call") => self.tool_start(Tool::Web, ts),
            ("response_item", "custom_tool_call_output") | ("response_item", "function_call_output") => self.one(ts, Kind::ToolEnd),
            _ => vec![],
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    const TS: &str = "2026-09-23T19:25:19.386Z";
    fn l(ty: &str, payload: Value) -> String { json!({"timestamp": TS, "type": ty, "payload": payload}).to_string() }
    fn meta(originator: &str, source: Value, thread_source: Value) -> String {
        l("session_meta", json!({"id": "t1", "cwd": "C:\\p", "originator": originator, "source": source, "thread_source": thread_source}))
    }
    fn started(p: &mut RolloutParser) { p.parse_line(&meta("Codex Desktop", json!("vscode"), json!("user"))); }

    #[test]
    fn desktop_session_meta() {
        let mut p = RolloutParser::new();
        let e = p.parse_line(&meta("Codex Desktop", json!("vscode"), json!("user")));
        assert_eq!((e[0].kind, e[0].source, e[0].session_id.as_str()), (Kind::SessionStart, Source::Codex, "t1"));
        assert_eq!((e[0].data.origin, e[0].data.app), (Some(Origin::Desktop), Some(App::CodexApp)));
        assert_eq!(e[0].data.cwd.as_deref(), Some("C:\\p"));
        assert_eq!(e[0].ts, 1_790_191_519_386);
    }

    #[test]
    fn router_and_cli_origins() {
        let mut p = RolloutParser::new();
        let e = p.parse_line(&meta("agent-router", json!("vscode"), Value::Null));
        assert_eq!((e[0].source, e[0].data.origin), (Source::Router, Some(Origin::Router)));
        let mut p = RolloutParser::new();
        let e = p.parse_line(&meta("codex-tui", json!("cli"), json!("user")));
        assert_eq!((e[0].data.origin, e[0].data.app), (Some(Origin::Cli), Some(App::Terminal)));
    }

    #[test]
    fn subagent_is_agent_action_on_parent() {
        let mut p = RolloutParser::new();
        let src = json!({"subagent": {"thread_spawn": {"parent_thread_id": "parent1", "depth": 1}}});
        let e = p.parse_line(&meta("Codex Desktop", src, json!("subagent")));
        assert_eq!((e[0].session_id.as_str(), e[0].kind, e[0].tool), ("parent1", Kind::ToolStart, Some(Tool::Agent)));
        assert!(p.parse_line(&l("response_item", json!({"type": "custom_tool_call", "name": "apply_patch", "input": ""}))).is_empty());
        let e = p.parse_line(&l("event_msg", json!({"type": "task_complete"})));
        assert_eq!((e[0].session_id.as_str(), e[0].kind), ("parent1", Kind::ToolEnd));
    }

    #[test]
    fn guardian_subagent_without_parent_is_ignored() {
        let mut p = RolloutParser::new();
        assert!(p.parse_line(&meta("Codex Desktop", json!({"subagent": {"other": "guardian"}}), json!("subagent"))).is_empty());
        assert!(p.parse_line(&l("event_msg", json!({"type": "task_started"}))).is_empty());
    }

    #[test]
    fn turn_lifecycle() {
        let mut p = RolloutParser::new();
        started(&mut p);
        let k = |p: &mut RolloutParser, t: &str| p.parse_line(&l("event_msg", json!({"type": t})))[0].kind;
        assert_eq!(k(&mut p, "task_started"), Kind::Prompt);
        assert_eq!(k(&mut p, "task_complete"), Kind::TurnEnd);
        assert_eq!(k(&mut p, "turn_aborted"), Kind::TurnEnd);
        assert_eq!(k(&mut p, "error"), Kind::Error);
    }

    #[test]
    fn exec_js_input_picks_first_meaningful_tool() {
        let mut p = RolloutParser::new();
        started(&mut p);
        let input = "await tools.update_plan({plan:[]}); const r = await tools.exec_command({cmd:\"ls\"})";
        let e = p.parse_line(&l("response_item", json!({"type": "custom_tool_call", "name": "exec", "input": input})));
        assert_eq!((e[0].kind, e[0].tool), (Kind::ToolStart, Some(Tool::Bash)));
        let e = p.parse_line(&l("response_item", json!({"type": "custom_tool_call", "name": "exec", "input": "tools.apply_patch(x)"})));
        assert_eq!(e[0].tool, Some(Tool::Edit));
        let e = p.parse_line(&l("response_item", json!({"type": "custom_tool_call", "name": "exec", "input": "tools.request_user_input({})"})));
        assert_eq!(e[0].kind, Kind::NeedsInput);
        let e = p.parse_line(&l("response_item", json!({"type": "custom_tool_call_output", "output": []})));
        assert_eq!(e[0].kind, Kind::ToolEnd);
    }

    #[test]
    fn function_calls() {
        let mut p = RolloutParser::new();
        started(&mut p);
        let fc = |p: &mut RolloutParser, v: Value| p.parse_line(&l("response_item", v));
        let e = fc(&mut p, json!({"type": "function_call", "name": "js", "namespace": "mcp__node_repl", "arguments": "{}"}));
        assert_eq!(e[0].tool, Some(Tool::Mcp));
        let e = fc(&mut p, json!({"type": "function_call", "name": "run", "namespace": "web", "arguments": "{}"}));
        assert_eq!(e[0].tool, Some(Tool::Web));
        let e = fc(&mut p, json!({"type": "function_call", "name": "request_user_input", "arguments": "{}"}));
        assert_eq!(e[0].kind, Kind::NeedsInput);
        let e = fc(&mut p, json!({"type": "function_call", "name": "update_plan",
            "arguments": "{\"plan\":[{\"step\":\"a\",\"status\":\"completed\"},{\"step\":\"b\",\"status\":\"in_progress\"}]}"}));
        assert_eq!((e[0].kind, e[0].data.progress), (Kind::Meta, Some(Progress { done: 1, total: 2 })));
        assert!(fc(&mut p, json!({"type": "function_call", "name": "sleep", "namespace": "clock", "arguments": "{}"})).is_empty());
    }

    #[test]
    fn token_count_gives_context_and_limits() {
        let mut p = RolloutParser::new();
        started(&mut p);
        let e = p.parse_line(&l("event_msg", json!({"type": "token_count",
            "info": {"last_token_usage": {"input_tokens": 28370}, "model_context_window": 258400},
            "rate_limits": {"primary": {"used_percent": 12.5, "window_minutes": 300, "resets_at": 1790209519},
                            "secondary": {"used_percent": 6.0, "window_minutes": 10080, "resets_at": 1790711013}}})));
        assert_eq!(e[0].data.context, Some(Context { used: 28370, max: 258400 }));
        assert_eq!(e[0].data.limits, vec![
            Limit { agent: Agent::Codex, window: Window::FiveHour, used_pct: 12.5, resets_at: Some(1_790_209_519_000) },
            Limit { agent: Agent::Codex, window: Window::Weekly, used_pct: 6.0, resets_at: Some(1_790_711_013_000) }]);
    }

    #[test]
    fn primary_window_is_identified_by_minutes_not_name() {
        let mut p = RolloutParser::new();
        started(&mut p);
        let e = p.parse_line(&l("event_msg", json!({"type": "token_count",
            "rate_limits": {"primary": {"used_percent": 71.0, "window_minutes": 10080, "resets_at": 1}}})));
        assert_eq!(e[0].data.limits[0].window, Window::Weekly);
    }

    #[test]
    fn user_message_titles_once_and_compaction() {
        let mut p = RolloutParser::new();
        started(&mut p);
        let um = |t: &str| l("event_msg", json!({"type": "item_completed", "item": {"type": "UserMessage", "content": [{"type": "text", "text": t}]}}));
        assert_eq!(p.parse_line(&um("Pierwszy"))[0].data.title.as_deref(), Some("Pierwszy"));
        assert!(p.parse_line(&um("Drugi")).is_empty());
        let e = p.parse_line(&l("event_msg", json!({"type": "item_completed", "item": {"type": "ContextCompaction"}})));
        assert_eq!(e[0].kind, Kind::Compact);
    }

    #[test]
    fn js_tool_call_scanner() {
        assert_eq!(js_tool_calls("a tools.exec_command ({}) tools.x tools.apply_patch("), vec!["exec_command", "apply_patch"]);
    }

    #[test]
    fn real_rollout_fixtures_parse() {
        let dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/codex");
        let Ok(rd) = std::fs::read_dir(&dir) else { return };
        for f in rd.flatten() {
            let mut p = RolloutParser::new();
            let text = std::fs::read_to_string(f.path()).unwrap();
            let evs: Vec<Event> = text.lines().flat_map(|x| p.parse_line(x)).collect();
            assert!(evs.iter().any(|e| e.kind == Kind::SessionStart), "brak SessionStart w {:?}", f.path());
            assert!(evs.iter().any(|e| e.kind == Kind::Prompt), "brak Prompt w {:?}", f.path());
        }
    }
}
