pub mod hook;
pub mod transcript;

use serde::{Deserialize, Serialize};
use crate::model::Progress;

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct HookEnvelope {
    pub ts: i64,
    pub ppid: Option<u32>,
    pub payload: serde_json::Value,
}

/// Postęp z `TodoWrite` (starsze wersje Claude Code). Nowsze wersje: `hook::TaskTracker`.
pub fn progress_from_tool_use(name: &str, input: &serde_json::Value) -> Option<Progress> {
    if name != "TodoWrite" { return None; }
    let todos = input.get("todos")?.as_array()?;
    let done = todos.iter().filter(|t| t.get("status").and_then(|s| s.as_str()) == Some("completed")).count();
    Some(Progress { done: done as u32, total: todos.len() as u32 })
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn todo_progress_counts_completed() {
        let input = json!({"todos": [
            {"content": "a", "status": "completed"},
            {"content": "b", "status": "in_progress"},
            {"content": "c", "status": "pending"}]});
        assert_eq!(progress_from_tool_use("TodoWrite", &input), Some(Progress { done: 1, total: 3 }));
        assert_eq!(progress_from_tool_use("Bash", &input), None);
    }
}
