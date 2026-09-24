//! hook.exe: przekazuje JSON hooka Claude Code do widżetu. Nigdy nie blokuje agenta:
//! limit 300 ms, zawsze kod 0, nic nie wypisuje.
use pets_core::claude::HookEnvelope;
use pets_core::endpoint::Endpoint;
use pets_core::{pid, time};
use std::io::Read;
use std::path::PathBuf;
use std::time::Duration;

fn run() -> Option<()> {
    let mut buf = Vec::new();
    std::io::stdin().take(1 << 20).read_to_end(&mut buf).ok()?;
    let payload: serde_json::Value = serde_json::from_slice(&buf).ok()?;
    let path = std::env::var_os("AGENT_PETS_ENDPOINT").map(PathBuf::from).unwrap_or_else(Endpoint::default_path);
    let ep = Endpoint::read(&path).ok()?;
    let env = HookEnvelope { ts: time::now_ms(), ppid: pid::agent_pid(), payload };
    // Windows ponawia połączenie z zamkniętym portem na localhoście ok. 2 s,
    // a `timeout` nie obejmuje fazy łączenia, więc limit łączenia ustawiamy osobno.
    let agent = ureq::AgentBuilder::new()
        .timeout_connect(Duration::from_millis(150))
        .timeout(Duration::from_millis(300))
        .build();
    agent.post(&format!("http://127.0.0.1:{}/v1/events/claude", ep.port))
        .set("Authorization", &format!("Bearer {}", ep.token))
        .send_json(serde_json::to_value(&env).ok()?)
        .ok()?;
    Some(())
}

fn main() {
    std::panic::set_hook(Box::new(|_| {}));
    let _ = std::panic::catch_unwind(run);
    std::process::exit(0);
}
