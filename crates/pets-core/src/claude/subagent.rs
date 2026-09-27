//! Subagenci Claude Code z ich własnych plików: `…/projects/<proj>/<sesja>/subagents/agent-<id>.jsonl`
//! i sąsiedni `agent-<id>.meta.json` (typ, opis, praca w tle). Dziecko ma id `"{sesja}/{agentId}"`.
use std::path::{Path, PathBuf};
use serde_json::Value;
use crate::action::action_text;
use crate::i18n::Lang;
use crate::model::*;
use crate::time::rfc3339_ms;
use crate::tools::from_claude;

pub struct SubagentParser {
    meta_path: PathBuf,
    meta: Option<SubInfo>,
    lang: Lang,
    started: bool,
    sent_meta: bool,
    /// ostatnia linia to odpowiedź (tekst bez narzędzia): (id dziecka, czas linii)
    answered: Option<(String, i64)>,
}

/// `agent-<id>.jsonl` → `agent-<id>.meta.json`.
fn meta_path(path: &Path) -> PathBuf {
    let stem = path.file_stem().and_then(|s| s.to_str()).unwrap_or("");
    path.with_file_name(format!("{stem}.meta.json"))
}

fn read_meta(p: &Path) -> Option<SubInfo> {
    let v: Value = serde_json::from_slice(&std::fs::read(p).ok()?).ok()?;
    let s = |k: &str| v.get(k).and_then(|x| x.as_str()).filter(|x| !x.is_empty()).map(String::from);
    Some(SubInfo {
        kind: SubKind::Claude,
        agent_type: s("agentType"),
        description: s("description"),
        background: v.get("requestShape").and_then(|x| x.as_str()) == Some("background"),
    })
}

impl SubagentParser {
    pub fn new(path: &Path, lang: Lang) -> Self {
        let meta_path = meta_path(path);
        let meta = read_meta(&meta_path);
        SubagentParser { meta_path, meta, lang, started: false, sent_meta: false, answered: None }
    }

    fn event(&self, sid: &str, parent: &str, kind: Kind, ts: i64) -> Event {
        let mut e = Event::new(Source::Claude, sid, kind, ts);
        e.data.parent = Some(parent.to_string());
        e
    }

    pub fn parse_line(&mut self, line: &str) -> Vec<Event> {
        let Ok(d) = serde_json::from_str::<Value>(line) else { return vec![] };
        let s = |k: &str| d.get(k).and_then(|v| v.as_str());
        let (Some(parent), Some(agent), Some(ts)) = (s("sessionId"), s("agentId"), s("timestamp").and_then(rfc3339_ms)) else { return vec![] };
        let sid = format!("{parent}/{agent}");
        // opis bywa zapisany chwilę po pierwszej linii
        if self.meta.is_none() { self.meta = read_meta(&self.meta_path); }
        let null = Value::Null;
        let content = d.pointer("/message/content").unwrap_or(&null);
        let items = content.as_array().map(|a| a.as_slice()).unwrap_or(&[]);
        let has = |t: &str| items.iter().any(|c| c.get("type").and_then(|v| v.as_str()) == Some(t));

        let mut out = Vec::new();
        if !self.started {
            self.started = true;
            let mut e = self.event(&sid, parent, Kind::SessionStart, ts);
            e.data.cwd = s("cwd").map(String::from);
            out.push(e);
            out.push(self.event(&sid, parent, Kind::Prompt, ts));
        }
        match s("type") {
            Some("assistant") if has("tool_use") => {
                let c = items.iter().rev().find(|c| c.get("type").and_then(|v| v.as_str()) == Some("tool_use")).unwrap();
                let name = c.get("name").and_then(|v| v.as_str()).unwrap_or("");
                let mut e = self.event(&sid, parent, Kind::ToolStart, ts);
                e.tool = Some(from_claude(name));
                e.data.action = action_text(name, c.get("input").unwrap_or(&null), self.lang);
                out.push(e);
            }
            Some("assistant") if !items.is_empty() => out.push(self.event(&sid, parent, Kind::ToolEnd, ts)),
            Some("user") if has("tool_result") => out.push(self.event(&sid, parent, Kind::ToolEnd, ts)),
            _ => {}
        }
        match s("type") {
            Some("assistant") if has("text") && !has("tool_use") => self.answered = Some((sid.clone(), ts)),
            Some("assistant") | Some("user") if !out.is_empty() => self.answered = None,
            _ => {}
        }
        // każde zdarzenie niesie rodzaj dziecka: odtworzone po zniknięciu dalej podlega regułom subagentów
        let sub = self.meta.clone().unwrap_or(SubInfo { kind: SubKind::Claude, agent_type: None, description: None, background: false });
        if let Some(first) = out.first_mut() {
            if !self.sent_meta {
                first.data.title = sub.description.clone().or_else(|| sub.agent_type.clone());
                // bez pliku meta czekamy, aż się pojawi (wtedy przyjdzie opis)
                self.sent_meta = self.meta.is_some();
            }
        }
        for e in &mut out { e.data.sub = Some(sub.clone()); }
        out
    }

    /// Plik kończy się odpowiedzią subagenta: przy odtwarzaniu po starcie to dziecko już skończyło.
    pub fn finished(&self) -> Option<(String, i64)> { self.answered.clone()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::i18n::Lang;
    use serde_json::json;

    const SID: &str = "3746a003-5ba1-42b3-a085-009646ebcf00";

    fn line(ty: &str, content: serde_json::Value, ts: &str) -> String {
        json!({"isSidechain": true, "agentId": "a1", "sessionId": "p1", "type": ty, "timestamp": ts, "cwd": "C:\\w",
               "message": {"role": if ty == "user" { "user" } else { "assistant" }, "content": content}}).to_string()
    }

    fn with_meta(dir: &std::path::Path, meta: Option<serde_json::Value>) -> std::path::PathBuf {
        let p = dir.join("agent-a1.jsonl");
        if let Some(m) = meta { std::fs::write(dir.join("agent-a1.meta.json"), m.to_string()).unwrap(); }
        p
    }

    #[test]
    fn the_first_line_starts_the_child_with_its_meta() {
        let d = tempfile::tempdir().unwrap();
        let p = with_meta(d.path(), Some(json!({"agentType": "Explore", "description": "Znajdź testy", "requestShape": "background"})));
        let mut sp = SubagentParser::new(&p, Lang::Pl);
        let e = sp.parse_line(&line("user", json!("zadanie"), "2026-09-26T10:00:00.000Z"));
        assert_eq!(e.iter().map(|e| e.kind).collect::<Vec<_>>(), vec![Kind::SessionStart, Kind::Prompt]);
        assert!(e.iter().all(|e| e.session_id == "p1/a1" && e.data.parent.as_deref() == Some("p1")));
        let sub = e[0].data.sub.clone().unwrap();
        assert_eq!(sub, SubInfo { kind: SubKind::Claude, agent_type: Some("Explore".into()), description: Some("Znajdź testy".into()), background: true });
        assert_eq!(e[0].data.title.as_deref(), Some("Znajdź testy"));
        assert_eq!(e[0].data.cwd.as_deref(), Some("C:\\w"));
        assert!(e[0].data.pid.is_none());
    }

    #[test]
    fn tools_and_results_drive_the_child_state() {
        let d = tempfile::tempdir().unwrap();
        let mut sp = SubagentParser::new(&with_meta(d.path(), None), Lang::Pl);
        sp.parse_line(&line("user", json!("zadanie"), "2026-09-26T10:00:00.000Z"));
        let e = sp.parse_line(&line("assistant", json!([{"type": "tool_use", "name": "Read", "input": {"file_path": "C:\\x\\a.rs"}}]), "2026-09-26T10:00:01.000Z"));
        assert_eq!((e[0].kind, e[0].tool, e[0].data.action.as_deref()), (Kind::ToolStart, Some(Tool::Read), Some("Czyta a.rs")));
        let e = sp.parse_line(&line("user", json!([{"type": "tool_result", "content": "x"}]), "2026-09-26T10:00:02.000Z"));
        assert_eq!(e[0].kind, Kind::ToolEnd);
        let e = sp.parse_line(&line("assistant", json!([{"type": "text", "text": "gotowe"}]), "2026-09-26T10:00:03.000Z"));
        assert_eq!(e[0].kind, Kind::ToolEnd, "tekst asystenta: myśli");
        assert!(sp.parse_line(r#"{"type":"attachment","isSidechain":true,"agentId":"a1","sessionId":"p1","timestamp":"2026-09-26T10:00:04.000Z"}"#).is_empty());
        assert!(sp.parse_line("{bad").is_empty());
    }

    #[test]
    fn a_child_without_meta_has_no_description() {
        let d = tempfile::tempdir().unwrap();
        let mut sp = SubagentParser::new(&with_meta(d.path(), None), Lang::Pl);
        let e = sp.parse_line(&line("user", json!("x"), "2026-09-26T10:00:00.000Z"));
        let sub = e[0].data.sub.clone().unwrap();
        assert_eq!((sub.kind, sub.agent_type, sub.description, sub.background), (SubKind::Claude, None, None, false));
    }

    #[test]
    fn meta_written_after_the_first_line_is_still_picked_up() {
        let d = tempfile::tempdir().unwrap();
        let p = with_meta(d.path(), None);
        let mut sp = SubagentParser::new(&p, Lang::Pl);
        sp.parse_line(&line("user", json!("x"), "2026-09-26T10:00:00.000Z"));
        std::fs::write(d.path().join("agent-a1.meta.json"), json!({"agentType": "Plan", "description": "Plan"}).to_string()).unwrap();
        let e = sp.parse_line(&line("assistant", json!([{"type": "text", "text": "."}]), "2026-09-26T10:00:01.000Z"));
        assert_eq!(e[0].data.sub.as_ref().and_then(|s| s.agent_type.as_deref()), Some("Plan"));
    }

    #[test]
    fn real_subagent_fixture_parses() {
        let p = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/claude/subagents/agent-ac80bccb9e5a3f6e0.jsonl");
        let mut sp = SubagentParser::new(&p, Lang::En);
        let text = std::fs::read_to_string(&p).unwrap();
        let evs: Vec<Event> = text.lines().flat_map(|l| sp.parse_line(l)).collect();
        let id = format!("{SID}/ac80bccb9e5a3f6e0");
        assert!(evs.iter().all(|e| e.session_id == id));
        assert_eq!(evs[0].kind, Kind::SessionStart);
        assert_eq!(evs[0].data.sub.as_ref().map(|s| (s.description.as_deref(), s.background)), Some((Some("List spike names"), true)));
        assert!(evs.iter().any(|e| e.kind == Kind::ToolStart && e.tool == Some(Tool::Bash) && e.data.action.as_deref() == Some("ls")));
    }

    #[test]
    fn every_event_knows_it_is_a_claude_subagent() {
        let d = tempfile::tempdir().unwrap();
        let mut sp = SubagentParser::new(&with_meta(d.path(), Some(json!({"agentType": "Plan"}))), Lang::Pl);
        sp.parse_line(&line("user", json!("x"), "2026-09-26T10:00:00.000Z"));
        let e = sp.parse_line(&line("assistant", json!([{"type": "text", "text": "."}]), "2026-09-26T10:00:01.000Z"));
        assert_eq!(e[0].data.sub.as_ref().map(|s| s.kind), Some(SubKind::Claude), "odtworzone dziecko nie traci rodzaju");
    }

    #[test]
    fn a_file_ending_with_an_answer_is_a_finished_subagent() {
        let d = tempfile::tempdir().unwrap();
        let mut sp = SubagentParser::new(&with_meta(d.path(), None), Lang::Pl);
        sp.parse_line(&line("user", json!("x"), "2026-09-26T10:00:00.000Z"));
        sp.parse_line(&line("assistant", json!([{"type": "tool_use", "name": "Read", "input": {}}]), "2026-09-26T10:00:01.000Z"));
        assert_eq!(sp.finished(), None);
        sp.parse_line(&line("user", json!([{"type": "tool_result", "content": "x"}]), "2026-09-26T10:00:02.000Z"));
        assert_eq!(sp.finished(), None);
        sp.parse_line(&line("assistant", json!([{"type": "text", "text": "gotowe"}]), "2026-09-26T10:00:03.000Z"));
        assert_eq!(sp.finished().map(|(id, _)| id), Some("p1/a1".to_string()));
    }
}
