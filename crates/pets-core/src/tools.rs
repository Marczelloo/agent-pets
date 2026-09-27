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

/// Nazwy narzędzi opencode (spike S1, z dokumentacji). Nazwa z `_` spoza listy to narzędzie MCP (`serwer_narzędzie`).
pub fn from_opencode(name: &str) -> Tool {
    match name {
        "bash" => Tool::Bash,
        "edit" | "write" | "patch" | "multiedit" => Tool::Edit,
        "read" => Tool::Read,
        "grep" | "glob" | "list" => Tool::Grep,
        "webfetch" | "websearch" => Tool::Web,
        "task" => Tool::Agent,
        n if n.contains('_') => Tool::Mcp,
        _ => Tool::Other,
    }
}

/// Nazwy narzędzi Copilota: CLI (`bash`, `view`, `edit`…) i tryb agenta VS Code (`run_in_terminal`, `read_file`…).
/// MCP w CLI to `serwer/narzędzie`, w VS Code `mcp_…`.
pub fn from_copilot(name: &str) -> Tool {
    match name {
        "bash" | "powershell" | "run_in_terminal" | "shell" => Tool::Bash,
        "edit" | "create" | "str_replace" | "write" | "replace_string_in_file" | "create_file" | "insert_edit_into_file" => Tool::Edit,
        "view" | "read" | "read_file" => Tool::Read,
        "grep" | "glob" | "grep_search" | "file_search" | "list_dir" => Tool::Grep,
        "web_fetch" | "fetch_webpage" | "web_search" => Tool::Web,
        "task" | "runSubagent" => Tool::Agent,
        n if n.contains('/') || n.starts_with("mcp_") => Tool::Mcp,
        _ => Tool::Other,
    }
}

/// Nazwy narzędzi Antigravity (spike S2; do potwierdzenia nagraniem na żywo). MCP: `mcp_…`.
pub fn from_antigravity(name: &str) -> Tool {
    match name {
        "run_command" => Tool::Bash,
        "view_file" | "view_file_outline" | "view_code_item" | "list_dir" => Tool::Read,
        "write_to_file" | "replace_file_content" | "multi_replace_file_content" => Tool::Edit,
        "grep_search" | "find_by_name" | "codebase_search" => Tool::Grep,
        "read_url_content" | "search_web" => Tool::Web,
        n if n.starts_with("browser_") => Tool::Web,
        "invoke_subagent" => Tool::Agent,
        n if n.starts_with("mcp_") => Tool::Mcp,
        _ => Tool::Other,
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
