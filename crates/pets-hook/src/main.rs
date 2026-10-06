//! hook.exe: forwards Claude Code hook JSON to the widget. Never blocks the agent:
//! 300 ms limit, always exits with code 0. Prints nothing in hook mode.
//!
//! `--agent-pets-statusline` mode (retired pass-through, kept for a `settings.json` that still points here until the app's
//! migration runs): sends nothing and prints only the output of the user's existing statusline command, byte for byte.
//!
//! `hook.exe report --agent <id> --session <id> --state <state> [...]` (door, spec 0.10 §8): a command for people and scripts,
//! not a hook. It alone prints errors to stderr and exits with code 2.
//!
//! `hook.exe --agent <copilot|antigravity|cursor|grok|zcode> --event <name>` (spec 0.11 §2, 0.12 §2): another
//! agent's hook. Sends an `AgentEnvelope` to the widget; outputs only what that agent requires (Antigravity: `{}`, at `Stop`
//! a "stop" decision; Cursor: `{}`, at `beforeSubmitPrompt` `{"continue":true}`).
//!
//! Cursor and Grok also run Claude hooks, and Grok runs Cursor hooks. Such a hook sends nothing (spec 0.12 §2.2).
use pets_core::claude::HookEnvelope;
use pets_core::endpoint::Endpoint;
use pets_core::{host, pid, statusline_install, time};
use std::io::{Read, Write};
use std::path::PathBuf;
use std::time::Duration;

fn read_stdin() -> Vec<u8> { read_stdin_max(1 << 20) }

/// Input JSON, including a UTF-8 BOM: Cursor runs hooks through pwsh, which adds one (verified live, 0.12).
fn json_of(buf: &[u8]) -> Option<serde_json::Value> {
    serde_json::from_slice(buf.strip_prefix(b"\xEF\xBB\xBF").unwrap_or(buf)).ok()
}

/// Input up to `max` bytes. An agent that never closes stdin gets no reply after [`STDIN_WAIT`]: the input counts as
/// missing, and the reading thread dies with the process.
fn read_stdin_max(max: u64) -> Vec<u8> {
    let (tx, rx) = std::sync::mpsc::channel();
    std::thread::spawn(move || {
        let mut buf = Vec::new();
        let _ = std::io::stdin().take(max).read_to_end(&mut buf);
        let _ = tx.send(buf);
    });
    rx.recv_timeout(STDIN_WAIT).unwrap_or_default()
}

/// How long an agent may take to write the hook input; agents write it at once and close the pipe.
const STDIN_WAIT: Duration = Duration::from_secs(3);

/// Environment variable; empty means absent.
fn env_var(k: &str) -> Option<String> { std::env::var(k).ok().filter(|v| !v.is_empty()) }

fn post(path_suffix: &str, body: serde_json::Value) -> Option<()> { send(path_suffix, body).ok().map(|_| ()) }

/// Widget response code or the reason it did not respond.
fn send(path_suffix: &str, body: serde_json::Value) -> Result<u16, String> {
    let path = std::env::var_os("AGENT_PETS_ENDPOINT").map(PathBuf::from).unwrap_or_else(Endpoint::default_path);
    let ep = Endpoint::read(&path).map_err(|_| format!("Agent Pets is not running (no {})", path.display()))?;
    // Windows retries a closed localhost port for about 2 s,
    // and `timeout` does not cover connection setup, so set a separate connection limit.
    let agent = ureq::AgentBuilder::new()
        .timeout_connect(Duration::from_millis(150))
        .timeout(Duration::from_millis(300))
        .build();
    match agent.post(&format!("http://127.0.0.1:{}{path_suffix}", ep.port))
        .set("Authorization", &format!("Bearer {}", ep.token))
        .send_json(body) {
        Ok(r) => Ok(r.status()),
        Err(ureq::Error::Status(c, _)) => Err(match c {
            404 => "the door for other agents is off (Agent Pets settings, Apps)".into(),
            400 => "Agent Pets rejected the report".into(),
            c => format!("Agent Pets answered {c}"),
        }),
        Err(_) => Err("Agent Pets is not running".into()),
    }
}

fn report(args: &[String]) -> i32 {
    let sent = pets_core::adapters::generic::report_body(args).and_then(|b| send("/v1/events/generic", b));
    match sent {
        Ok(_) => 0,
        Err(e) => { eprintln!("agent-pets report: {e}"); 2 }
    }
}

fn run() -> Option<()> {
    let payload = json_of(&read_stdin())?;
    // a Claude hook run by Cursor or Grok is not a Claude session
    if pets_core::adapters::caller(&payload, &env_var).is_some() { return None; }
    let ppid = pid::agent_pid();
    // resolve the host only where the core reads it: one process snapshot at session start and prompt
    let host = match payload.get("hook_event_name").and_then(|v| v.as_str()) {
        Some("SessionStart" | "UserPromptSubmit") => ppid.and_then(|p| host::host_of(&host::ProcTable::snapshot(), p)),
        _ => None,
    };
    let env = HookEnvelope { ts: time::now_ms(), ppid, payload, host };
    post("/v1/events/claude", serde_json::to_value(&env).ok()?)
}

/// Retired statusline pass-through: nothing goes to the widget, the user sees their statusline's exact output.
fn statusline() {
    let buf = read_stdin();
    let original: Option<serde_json::Value> = std::fs::read(statusline_install::original_path()).ok()
        .and_then(|b| serde_json::from_slice(&b).ok());
    let Some(cmd) = original.as_ref().and_then(|o| o["command"].as_str()) else { return };
    use std::os::windows::process::CommandExt;
    use std::process::{Command, Stdio};
    // `/S /C "<command>"`: cmd removes only the outer quotes and runs a command with its own quotes
    // (e.g. `"C:\x y\line.exe" --opt`) unchanged. Ordinary `args` would quote it differently.
    let Ok(mut child) = Command::new("cmd").raw_arg(format!("/S /C \"{cmd}\""))
        .stdin(Stdio::piped()).stdout(Stdio::piped()).spawn() else { return };
    if let Some(mut si) = child.stdin.take() { let _ = si.write_all(&buf); }
    if let Ok(out) = child.wait_with_output() { let _ = std::io::stdout().write_all(&out.stdout); }
}

/// Value following `--name` in the arguments.
fn arg<'a>(args: &'a [String], name: &str) -> Option<&'a str> {
    args.iter().position(|a| a == name).and_then(|i| args.get(i + 1)).map(String::as_str)
}

/// Another agent's hook: envelope to the widget (spec 0.11 §2, 0.12 §4). Input up to 16 MB: Cursor sends the whole prompt
/// with attachments, and `slim` removes it before anything leaves the process.
fn agent_hook(agent: &str, event: &str) -> Option<()> {
    let mut payload = json_of(&read_stdin_max(16 << 20))?;
    if pets_core::adapters::caller(&payload, &env_var).is_some_and(|c| c.id() != agent) { return None; }
    if agent == "grok" { pets_core::adapters::grok::fill_session(&mut payload, env_var("GROK_SESSION_ID")); }
    if agent == "cursor" { pets_core::adapters::cursor::fill_cwd(&mut payload); }
    pets_core::adapters::slim(&mut payload);
    let ppid = pid::agent_pid();
    let host = if pets_core::adapters::host_event(agent, event) {
        ppid.and_then(|p| host::host_of(&host::ProcTable::snapshot(), p))
    } else { None };
    let env = pets_core::adapters::AgentEnvelope { ts: time::now_ms(), ppid, event: event.to_string(), payload, host };
    post(&format!("/v1/events/{agent}"), serde_json::to_value(&env).ok()?)
}

fn agent_mode(args: &[String]) {
    let Some(agent) = arg(args, "--agent").filter(|a| matches!(*a, "copilot" | "antigravity" | "cursor" | "grok" | "zcode")) else { return };
    let Some(event) = arg(args, "--event").filter(|e| (1..=32).contains(&e.len()) && e.chars().all(|c| c.is_ascii_alphabetic())) else { return };
    let _ = std::panic::catch_unwind(|| agent_hook(agent, event));
    // always reply, even when the widget is down or input is invalid: without it Antigravity cannot finish,
    // and Cursor will not submit the prompt
    let reply = match agent {
        "antigravity" => pets_core::adapters::antigravity::reply(event),
        "cursor" => pets_core::adapters::cursor::reply(event),
        _ => return,
    };
    let mut out = std::io::stdout();
    let _ = writeln!(out, "{reply}");
    let _ = out.flush();
}

fn main() {
    let args: Vec<String> = std::env::args().collect();
    if args.get(1).map(String::as_str) == Some("report") { std::process::exit(report(&args[2..])); }
    std::panic::set_hook(Box::new(|_| {}));
    if args.iter().any(|a| a == "--agent") {
        agent_mode(&args);
        std::process::exit(0);
    }
    if std::env::args().any(|a| a == statusline_install::MARK_ARG) {
        let _ = std::panic::catch_unwind(statusline);
    } else {
        let _ = std::panic::catch_unwind(run);
    }
    std::process::exit(0);
}
