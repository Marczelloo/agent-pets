//! hook.exe: przekazuje JSON hooka Claude Code do widżetu. Nigdy nie blokuje agenta:
//! limit 300 ms, zawsze kod 0. W trybie hooka nic nie wypisuje.
//!
//! Tryb `--agent-pets-statusline` (przelotka statusline): przekazuje JSON statusline do widżetu, a na wyjście
//! wypisuje wyłącznie wyjście dotychczasowej komendy statusline użytkownika, bajt w bajt.
use pets_core::claude::{HookEnvelope, StatuslineEnvelope};
use pets_core::endpoint::Endpoint;
use pets_core::{pid, statusline_install, time};
use std::io::{Read, Write};
use std::path::PathBuf;
use std::time::Duration;

fn read_stdin() -> Vec<u8> {
    let mut buf = Vec::new();
    let _ = std::io::stdin().take(1 << 20).read_to_end(&mut buf);
    buf
}

fn post(path_suffix: &str, body: serde_json::Value) -> Option<()> {
    let path = std::env::var_os("AGENT_PETS_ENDPOINT").map(PathBuf::from).unwrap_or_else(Endpoint::default_path);
    let ep = Endpoint::read(&path).ok()?;
    // Windows ponawia połączenie z zamkniętym portem na localhoście ok. 2 s,
    // a `timeout` nie obejmuje fazy łączenia, więc limit łączenia ustawiamy osobno.
    let agent = ureq::AgentBuilder::new()
        .timeout_connect(Duration::from_millis(150))
        .timeout(Duration::from_millis(300))
        .build();
    agent.post(&format!("http://127.0.0.1:{}{path_suffix}", ep.port))
        .set("Authorization", &format!("Bearer {}", ep.token))
        .send_json(body)
        .ok()?;
    Some(())
}

fn run() -> Option<()> {
    let payload: serde_json::Value = serde_json::from_slice(&read_stdin()).ok()?;
    let env = HookEnvelope { ts: time::now_ms(), ppid: pid::agent_pid(), payload };
    post("/v1/events/claude", serde_json::to_value(&env).ok()?)
}

/// Przelotka statusline: dane do widżetu, a użytkownik widzi dokładnie wyjście swojego statusline.
fn statusline() {
    let buf = read_stdin();
    if let Ok(payload) = serde_json::from_slice::<serde_json::Value>(&buf) {
        let env = StatuslineEnvelope { ts: time::now_ms(), payload };
        if let Ok(body) = serde_json::to_value(&env) { let _ = post("/v1/events/claude-statusline", body); }
    }
    let original: Option<serde_json::Value> = std::fs::read(statusline_install::original_path()).ok()
        .and_then(|b| serde_json::from_slice(&b).ok());
    let Some(cmd) = original.as_ref().and_then(|o| o["command"].as_str()) else { return };
    use std::os::windows::process::CommandExt;
    use std::process::{Command, Stdio};
    // `/S /C "<komenda>"`: cmd zdejmuje tylko zewnętrzne cudzysłowy, a komendę z własnymi cudzysłowami
    // (np. `"C:\x y\line.exe" --opt`) uruchamia bez zmian. Zwykłe `args` cytowałyby ją po swojemu.
    let Ok(mut child) = Command::new("cmd").raw_arg(format!("/S /C \"{cmd}\""))
        .stdin(Stdio::piped()).stdout(Stdio::piped()).spawn() else { return };
    if let Some(mut si) = child.stdin.take() { let _ = si.write_all(&buf); }
    if let Ok(out) = child.wait_with_output() { let _ = std::io::stdout().write_all(&out.stdout); }
}

fn main() {
    std::panic::set_hook(Box::new(|_| {}));
    if std::env::args().any(|a| a == statusline_install::MARK_ARG) {
        let _ = std::panic::catch_unwind(statusline);
    } else {
        let _ = std::panic::catch_unwind(run);
    }
    std::process::exit(0);
}
