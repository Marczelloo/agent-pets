use crate::model::Tool;

pub fn from_claude(name: &str) -> Tool {
    match name {
        "Edit" | "MultiEdit" | "Write" | "NotebookEdit" => Tool::Edit,
        "Bash" | "PowerShell" | "BashOutput" => Tool::Bash,
        "Read" => Tool::Read,
        "Grep" | "Glob" => Tool::Grep,
        "WebSearch" | "WebFetch" => Tool::Web,
        "Task" | "Agent" => Tool::Agent,
        n if n.starts_with("mcp__") => Tool::Mcp,
        _ => Tool::Other,
    }
}

/// `None` oznacza narzędzie pomocnicze, które nie zmienia animacji.
pub fn from_codex(name: &str) -> Option<Tool> {
    match name {
        "shell_command" | "exec_command" | "write_stdin" | "shell" | "local_shell" => Some(Tool::Bash),
        "apply_patch" => Some(Tool::Edit),
        "web__run" | "web_search" | "run" => Some(Tool::Web),
        "view_image" => Some(Tool::Read),
        "spawn_agent" | "followup_task" | "send_message" => Some(Tool::Agent),
        "update_plan" | "wait" | "wait_agent" | "sleep" | "list_agents" | "close_agent" | "get_goal"
        | "create_goal" | "curr_time" | "request_user_input" | "request_user_input_async"
        | "request_permissions" => None,
        n if n.starts_with("mcp__") || n == "js" => Some(Tool::Mcp),
        _ => Some(Tool::Other),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn claude_tools_map_to_actions() {
        assert_eq!(from_claude("Edit"), Tool::Edit);
        assert_eq!(from_claude("MultiEdit"), Tool::Edit);
        assert_eq!(from_claude("Write"), Tool::Edit);
        assert_eq!(from_claude("NotebookEdit"), Tool::Edit);
        assert_eq!(from_claude("Bash"), Tool::Bash);
        assert_eq!(from_claude("PowerShell"), Tool::Bash);
        assert_eq!(from_claude("Read"), Tool::Read);
        assert_eq!(from_claude("Grep"), Tool::Grep);
        assert_eq!(from_claude("Glob"), Tool::Grep);
        assert_eq!(from_claude("WebSearch"), Tool::Web);
        assert_eq!(from_claude("WebFetch"), Tool::Web);
        assert_eq!(from_claude("Task"), Tool::Agent);
        assert_eq!(from_claude("Agent"), Tool::Agent);
        assert_eq!(from_claude("mcp__agent-router__codex_delegate"), Tool::Mcp);
        assert_eq!(from_claude("AskUserQuestion"), Tool::Other);
    }

    #[test]
    fn codex_tools_map_to_actions() {
        assert_eq!(from_codex("shell_command"), Some(Tool::Bash));
        assert_eq!(from_codex("exec_command"), Some(Tool::Bash));
        assert_eq!(from_codex("write_stdin"), Some(Tool::Bash));
        assert_eq!(from_codex("apply_patch"), Some(Tool::Edit));
        assert_eq!(from_codex("web__run"), Some(Tool::Web));
        assert_eq!(from_codex("view_image"), Some(Tool::Read));
        assert_eq!(from_codex("spawn_agent"), Some(Tool::Agent));
        assert_eq!(from_codex("mcp__node_repl__js"), Some(Tool::Mcp));
        assert_eq!(from_codex("js"), Some(Tool::Mcp));
        // narzędzia pomocnicze nie zmieniają animacji
        assert_eq!(from_codex("update_plan"), None);
        assert_eq!(from_codex("wait"), None);
        assert_eq!(from_codex("sleep"), None);
        assert_eq!(from_codex("request_user_input"), None);
        assert_eq!(from_codex("something_new"), Some(Tool::Other));
    }
}
