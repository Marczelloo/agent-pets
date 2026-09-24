use crate::claude::progress_from_tool_use;
use crate::model::*;
use crate::time::rfc3339_ms;

/// Okno kontekstu z nazwy modelu. Dokładna wartość przychodzi ze statusline (faza 3);
/// modele Claude 5 i warianty `[1m]` mają 1M (S3), starsze 200k.
pub fn context_max(model: &str) -> u64 {
    let gen5 = ["claude-opus-5", "claude-sonnet-5", "claude-fable-5"].iter().any(|p| model.starts_with(p));
    if model.contains("[1m]") || gen5 { 1_000_000 } else { 200_000 }
}

#[derive(Default)]
pub struct TranscriptParser {
    session_id: Option<String>,
    title_rank: u8,
    origin_sent: bool,
    last_cwd: Option<String>,
    acc: EventData,
    dirty: bool,
}

fn prompt_text(msg: &serde_json::Value) -> Option<String> {
    let c = msg.get("content")?;
    let text = if let Some(s) = c.as_str() {
        s.to_string()
    } else {
        let arr = c.as_array()?;
        arr.iter().find(|x| x.get("type").and_then(|t| t.as_str()) == Some("text"))?
            .get("text")?.as_str()?.to_string()
    };
    let t = text.trim();
    if t.is_empty() || t.starts_with('<') { return None; }
    Some(t.chars().take(80).collect())
}

impl TranscriptParser {
    pub fn new() -> Self { Self::default() }

    fn set_title(&mut self, title: &str, rank: u8) {
        if rank >= self.title_rank && !title.is_empty() {
            self.title_rank = rank;
            self.acc.title = Some(title.to_string());
            self.dirty = true;
        }
    }

    pub fn parse_line(&mut self, line: &str) -> Vec<Event> {
        let Ok(d) = serde_json::from_str::<serde_json::Value>(line) else { return vec![] };
        // linie subagentów (sidechain) nie mogą nadpisać kontekstu ani tytułu sesji głównej
        if d.get("isSidechain").and_then(|v| v.as_bool()) == Some(true) { return vec![]; }
        let s = |k: &str| d.get(k).and_then(|v| v.as_str());
        if let Some(sid) = s("sessionId") { self.session_id = Some(sid.to_string()); }
        if !self.origin_sent {
            match s("entrypoint") {
                Some("claude-desktop") => {
                    self.acc.origin = Some(Origin::Desktop);
                    self.acc.app = Some(App::ClaudeDesktop);
                    self.origin_sent = true;
                    self.dirty = true;
                }
                Some("cli") => {
                    self.acc.origin = Some(Origin::Cli);
                    self.acc.app = Some(App::Terminal);
                    self.origin_sent = true;
                    self.dirty = true;
                }
                _ => {}
            }
        }
        if let Some(cwd) = s("cwd") {
            if self.last_cwd.as_deref() != Some(cwd) {
                self.last_cwd = Some(cwd.to_string());
                self.acc.cwd = Some(cwd.to_string());
                self.dirty = true;
            }
        }
        match s("type") {
            Some("custom-title") => if let Some(t) = s("customTitle") { self.set_title(t, 3) },
            Some("ai-title") => if let Some(t) = s("aiTitle") { self.set_title(t, 2) },
            Some("user") if d.get("isMeta").and_then(|v| v.as_bool()) != Some(true) && self.title_rank < 1 => {
                if let Some(t) = d.get("message").and_then(prompt_text) { self.set_title(&t, 1) }
            }
            Some("assistant") => {
                if let Some(m) = d.get("message") {
                    if let Some(u) = m.get("usage") {
                        let n = |k: &str| u.get(k).and_then(|v| v.as_u64()).unwrap_or(0);
                        let used = n("input_tokens") + n("cache_creation_input_tokens") + n("cache_read_input_tokens");
                        let model = m.get("model").and_then(|v| v.as_str()).unwrap_or("");
                        // użycie większe niż zakładane okno znaczy, że okno jest większe (1M)
                        let max = context_max(model).max(if used > 200_000 { 1_000_000 } else { 0 }).max(used);
                        self.acc.context = Some(Context { used, max });
                        self.dirty = true;
                    }
                    for c in m.get("content").and_then(|v| v.as_array()).into_iter().flatten() {
                        if c.get("type").and_then(|v| v.as_str()) == Some("tool_use") {
                            let name = c.get("name").and_then(|v| v.as_str()).unwrap_or("");
                            if let Some(p) = progress_from_tool_use(name, c.get("input").unwrap_or(&serde_json::Value::Null)) {
                                self.acc.progress = Some(p);
                                self.dirty = true;
                            }
                        }
                    }
                }
            }
            _ => {}
        }
        let (Some(ts), Some(sid)) = (s("timestamp").and_then(rfc3339_ms), self.session_id.clone()) else { return vec![] };
        if !self.dirty { return vec![]; }
        self.dirty = false;
        let mut e = Event::new(Source::Claude, sid, Kind::Meta, ts);
        e.data = std::mem::take(&mut self.acc);
        vec![e]
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const TS: &str = "2026-09-24T10:00:00.000Z";

    fn line(v: serde_json::Value) -> String { v.to_string() }

    #[test]
    fn first_prompt_then_ai_then_custom_title() {
        let mut p = TranscriptParser::new();
        let e = p.parse_line(&line(serde_json::json!({"type": "user", "sessionId": "s", "timestamp": TS,
            "entrypoint": "claude-desktop", "message": {"role": "user", "content": "Zrób widżet do paska zadań"}})));
        assert_eq!(e[0].data.title.as_deref(), Some("Zrób widżet do paska zadań"));
        assert_eq!(e[0].data.origin, Some(Origin::Desktop));
        assert_eq!(e[0].data.app, Some(App::ClaudeDesktop));
        // ai-title bez timestamp jest odkładany do następnej linii z czasem
        assert!(p.parse_line(&line(serde_json::json!({"type": "ai-title", "aiTitle": "Widżet", "sessionId": "s"}))).is_empty());
        let e = p.parse_line(&line(serde_json::json!({"type": "assistant", "sessionId": "s", "timestamp": TS,
            "message": {"model": "claude-opus-5", "content": [], "usage": {"input_tokens": 2,
            "cache_creation_input_tokens": 100, "cache_read_input_tokens": 900, "output_tokens": 5}}})));
        assert_eq!(e[0].data.title.as_deref(), Some("Widżet"));
        assert_eq!(e[0].data.context, Some(Context { used: 1002, max: 1_000_000 }));
        p.parse_line(&line(serde_json::json!({"type": "custom-title", "customTitle": "Agent Pets", "sessionId": "s"})));
        p.parse_line(&line(serde_json::json!({"type": "ai-title", "aiTitle": "Gorszy", "sessionId": "s"})));
        let e = p.parse_line(&line(serde_json::json!({"type": "user", "sessionId": "s", "timestamp": TS,
            "message": {"role": "user", "content": "drugi prompt"}})));
        assert_eq!(e[0].data.title.as_deref(), Some("Agent Pets"));
    }

    #[test]
    fn tool_results_and_tags_are_not_titles() {
        let mut p = TranscriptParser::new();
        let e = p.parse_line(&line(serde_json::json!({"type": "user", "sessionId": "s", "timestamp": TS,
            "message": {"role": "user", "content": [{"type": "tool_result", "content": "x"}]}})));
        assert!(e.is_empty() || e[0].data.title.is_none());
        let e = p.parse_line(&line(serde_json::json!({"type": "user", "sessionId": "s", "timestamp": TS,
            "message": {"role": "user", "content": "<command-name>/model</command-name>"}})));
        assert!(e.is_empty() || e[0].data.title.is_none());
    }

    #[test]
    fn long_prompt_is_truncated_to_80_chars() {
        let mut p = TranscriptParser::new();
        let long = "ą".repeat(100);
        let e = p.parse_line(&line(serde_json::json!({"type": "user", "sessionId": "s", "timestamp": TS,
            "message": {"role": "user", "content": long}})));
        assert_eq!(e[0].data.title.as_ref().unwrap().chars().count(), 80);
    }

    #[test]
    fn todo_tool_use_sets_progress() {
        let mut p = TranscriptParser::new();
        let e = p.parse_line(&line(serde_json::json!({"type": "assistant", "sessionId": "s", "timestamp": TS,
            "message": {"model": "m", "content": [{"type": "tool_use", "name": "TodoWrite",
            "input": {"todos": [{"status": "completed"}, {"status": "completed"}, {"status": "pending"}]}}]}})));
        assert_eq!(e[0].data.progress, Some(Progress { done: 2, total: 3 }));
    }

    #[test]
    fn million_context_models() {
        // S3: statusline pokazał context_window_size = 1 000 000 dla claude-sonnet-5 bez [1m]
        assert_eq!(context_max("claude-opus-4-1[1m]"), 1_000_000);
        assert_eq!(context_max("claude-sonnet-5"), 1_000_000);
        assert_eq!(context_max("claude-opus-5"), 1_000_000);
        assert_eq!(context_max("claude-haiku-4-5-20251001"), 200_000);
    }

    #[test]
    fn usage_above_assumed_window_never_exceeds_100_percent() {
        let mut p = TranscriptParser::new();
        let e = p.parse_line(&line(serde_json::json!({"type": "assistant", "sessionId": "s", "timestamp": TS,
            "message": {"model": "claude-haiku-4-5", "content": [], "usage": {"input_tokens": 300_000}}})));
        let c = e[0].data.context.unwrap();
        assert!(c.used <= c.max, "{c:?}");
    }

    #[test]
    fn sidechain_lines_are_ignored() {
        let mut p = TranscriptParser::new();
        let e = p.parse_line(&line(serde_json::json!({"type": "user", "sessionId": "s", "timestamp": TS, "isSidechain": true,
            "message": {"role": "user", "content": "prompt subagenta"}})));
        assert!(e.is_empty());
    }

    #[test]
    fn unchanged_lines_emit_nothing() {
        let mut p = TranscriptParser::new();
        let plain = line(serde_json::json!({"type": "system", "sessionId": "s", "timestamp": TS, "cwd": "C:\\p"}));
        assert_eq!(p.parse_line(&plain).len(), 1, "pierwsza linia niesie cwd");
        assert!(p.parse_line(&plain).is_empty(), "ta sama cwd nie może generować zdarzeń w kółko");
    }

    #[test]
    fn garbage_lines_are_ignored() {
        let mut p = TranscriptParser::new();
        assert!(p.parse_line("{not json").is_empty());
    }

    #[test]
    fn real_transcript_fixture_yields_title() {
        let f = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/claude/desktop-session.jsonl");
        let Ok(text) = std::fs::read_to_string(&f) else { return };
        let mut p = TranscriptParser::new();
        let evs: Vec<Event> = text.lines().flat_map(|l| p.parse_line(l)).collect();
        assert!(evs.iter().any(|e| e.data.title.is_some()));
        assert!(evs.iter().any(|e| e.data.context.is_some()));
    }
}
