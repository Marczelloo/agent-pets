use pets_core::endpoint::Endpoint;
use pets_core::ingest::{Incoming, Ingest};
use std::io::Write;
use std::process::{Command, Stdio};
use std::sync::mpsc::channel;
use std::time::{Duration, Instant};

fn run_hook(endpoint_path: &std::path::Path, stdin: &str) -> std::process::Output {
    let mut c = Command::new(env!("CARGO_BIN_EXE_hook"))
        .env("AGENT_PETS_ENDPOINT", endpoint_path)
        .stdin(Stdio::piped()).stdout(Stdio::piped()).stderr(Stdio::piped())
        .spawn().unwrap();
    c.stdin.take().unwrap().write_all(stdin.as_bytes()).unwrap();
    c.wait_with_output().unwrap()
}

#[test]
fn forwards_hook_payload_silently() {
    let (tx, rx) = channel();
    let ing = Ingest::start("tok".into(), tx, std::sync::Arc::new(pets_core::ingest::Doors::new(&pets_core::settings::Apps::default()))).unwrap();
    let dir = tempfile::tempdir().unwrap();
    let p = dir.path().join("endpoint.json");
    ing.endpoint().write(&p).unwrap();
    let out = run_hook(&p, r#"{"hook_event_name":"Stop","session_id":"abc"}"#);
    assert!(out.status.success());
    assert!(out.stdout.is_empty() && out.stderr.is_empty());
    let Incoming::ClaudeHook(env) = rx.recv_timeout(Duration::from_secs(2)).unwrap() else { panic!("zła trasa") };
    assert_eq!(env.payload["session_id"], "abc");
    assert!(env.ts > 0);
    ing.stop();
}

#[test]
fn exits_zero_fast_when_widget_is_down() {
    let dir = tempfile::tempdir().unwrap();
    let p = dir.path().join("endpoint.json");
    Endpoint { port: 1, token: "x".into() }.write(&p).unwrap();
    let t = Instant::now();
    let out = run_hook(&p, r#"{"hook_event_name":"Stop","session_id":"abc"}"#);
    assert!(out.status.success());
    assert!(t.elapsed() < Duration::from_millis(800));
    let out = run_hook(&dir.path().join("missing.json"), "not json");
    assert!(out.status.success());
}

fn run_report(endpoint_path: &std::path::Path, args: &[&str]) -> std::process::Output {
    Command::new(env!("CARGO_BIN_EXE_hook")).arg("report").args(args)
        .env("AGENT_PETS_ENDPOINT", endpoint_path).output().unwrap()
}

#[test]
fn report_sends_a_door_event_and_says_nothing() {
    let (tx, rx) = channel();
    let ing = Ingest::start("tok".into(), tx, std::sync::Arc::new(pets_core::ingest::Doors::new(&pets_core::settings::Apps::default()))).unwrap();
    let dir = tempfile::tempdir().unwrap();
    let p = dir.path().join("endpoint.json");
    ing.endpoint().write(&p).unwrap();
    let out = run_report(&p, &["--agent", "kilo", "--name", "Kilo CLI", "--session", "abc", "--state", "working", "--tool", "edit"]);
    assert!(out.status.success(), "{}", String::from_utf8_lossy(&out.stderr));
    let Incoming::Generic(e) = rx.recv_timeout(Duration::from_secs(2)).unwrap() else { panic!("zła trasa") };
    assert_eq!((e.session_id.as_str(), e.data.agent_name.as_deref()), ("generic:kilo:abc", Some("Kilo CLI")));
    ing.stop();
}

#[test]
fn report_errors_go_to_stderr_with_code_2() {
    let dir = tempfile::tempdir().unwrap();
    let p = dir.path().join("endpoint.json");
    let bad = run_report(&p, &["--agent", "claude", "--session", "abc", "--state", "done"]);
    assert_eq!(bad.status.code(), Some(2));
    assert!(!bad.stderr.is_empty() && bad.stdout.is_empty());
    let down = run_report(&dir.path().join("missing.json"), &["--agent", "kilo", "--session", "abc", "--state", "done"]);
    assert_eq!(down.status.code(), Some(2), "widżet nie działa");
    let (tx, _rx) = channel();
    let ing = Ingest::start("tok".into(), tx, std::sync::Arc::new(pets_core::ingest::Doors::new(&pets_core::settings::Apps { generic: false, ..Default::default() }))).unwrap();
    ing.endpoint().write(&p).unwrap();
    let closed = run_report(&p, &["--agent", "kilo", "--session", "abc", "--state", "done"]);
    assert_eq!(closed.status.code(), Some(2), "furtka wyłączona");
    assert!(String::from_utf8_lossy(&closed.stderr).contains("door"));
    ing.stop();
}

fn run_agent(endpoint_path: &std::path::Path, args: &[&str], stdin: &str) -> std::process::Output {
    let mut c = Command::new(env!("CARGO_BIN_EXE_hook")).args(args)
        .env("AGENT_PETS_ENDPOINT", endpoint_path)
        .stdin(Stdio::piped()).stdout(Stdio::piped()).stderr(Stdio::piped())
        .spawn().unwrap();
    c.stdin.take().unwrap().write_all(stdin.as_bytes()).unwrap();
    c.wait_with_output().unwrap()
}

fn agents_open() -> std::sync::Arc<pets_core::ingest::Doors> {
    std::sync::Arc::new(pets_core::ingest::Doors::new(&pets_core::settings::Apps { copilot: true, antigravity: true, ..Default::default() }))
}

#[test]
fn antigravity_stop_is_forwarded_and_answered_with_a_stop_decision() {
    let (tx, rx) = channel();
    let ing = Ingest::start("tok".into(), tx, agents_open()).unwrap();
    let dir = tempfile::tempdir().unwrap();
    let p = dir.path().join("endpoint.json");
    ing.endpoint().write(&p).unwrap();
    let out = run_agent(&p, &["--agent", "antigravity", "--event", "Stop"], r#"{"conversationId":"d5f1","fullyIdle":true}"#);
    assert!(out.status.success());
    assert_eq!(String::from_utf8_lossy(&out.stdout).trim(), r#"{"decision":"stop"}"#);
    let Incoming::Antigravity(env) = rx.recv_timeout(Duration::from_secs(2)).unwrap() else { panic!("zła trasa") };
    assert_eq!((env.event.as_str(), env.payload["conversationId"].as_str()), ("Stop", Some("d5f1")));
    assert!(env.ts > 0 && env.host.is_none(), "program tylko przy PreInvocation");
    let tool = run_agent(&p, &["--agent", "antigravity", "--event", "PreToolUse"], r#"{"conversationId":"d5f1"}"#);
    assert_eq!(String::from_utf8_lossy(&tool.stdout).trim(), "{}");
    ing.stop();
}

#[test]
fn copilot_hooks_are_forwarded_and_say_nothing() {
    let (tx, rx) = channel();
    let ing = Ingest::start("tok".into(), tx, agents_open()).unwrap();
    let dir = tempfile::tempdir().unwrap();
    let p = dir.path().join("endpoint.json");
    ing.endpoint().write(&p).unwrap();
    let out = run_agent(&p, &["--agent", "copilot", "--event", "PreToolUse"], r#"{"sessionId":"cop_1","toolName":"bash"}"#);
    assert!(out.status.success());
    assert!(out.stdout.is_empty() && out.stderr.is_empty());
    let Incoming::Copilot(env) = rx.recv_timeout(Duration::from_secs(2)).unwrap() else { panic!("zła trasa") };
    assert_eq!((env.event.as_str(), env.payload["toolName"].as_str()), ("PreToolUse", Some("bash")));
    ing.stop();
}

#[test]
fn antigravity_still_gets_its_answer_when_the_widget_is_down_or_the_input_is_bad() {
    let dir = tempfile::tempdir().unwrap();
    let missing = dir.path().join("missing.json");
    let t = Instant::now();
    let out = run_agent(&missing, &["--agent", "antigravity", "--event", "Stop"], r#"{"conversationId":"d5f1"}"#);
    assert!(out.status.success() && t.elapsed() < Duration::from_secs(1));
    assert_eq!(String::from_utf8_lossy(&out.stdout).trim(), r#"{"decision":"stop"}"#);
    let p = dir.path().join("endpoint.json");
    Endpoint { port: 1, token: "x".into() }.write(&p).unwrap();
    let bad = run_agent(&p, &["--agent", "antigravity", "--event", "Stop"], "nie-json");
    assert!(bad.status.success());
    assert_eq!(String::from_utf8_lossy(&bad.stdout).trim(), r#"{"decision":"stop"}"#);
    let other = run_agent(&p, &["--agent", "antigravity", "--event", "PostToolUse"], "nie-json");
    assert_eq!(String::from_utf8_lossy(&other.stdout).trim(), "{}");
}

#[test]
fn a_bad_or_missing_event_name_sends_nothing() {
    let (tx, rx) = channel();
    let ing = Ingest::start("tok".into(), tx, agents_open()).unwrap();
    let dir = tempfile::tempdir().unwrap();
    let p = dir.path().join("endpoint.json");
    ing.endpoint().write(&p).unwrap();
    for args in [&["--agent", "copilot", "--event", "a b"][..], &["--agent", "copilot"][..], &["--agent", "nope", "--event", "Stop"][..]] {
        let out = run_agent(&p, args, r#"{"sessionId":"cop_1"}"#);
        assert!(out.status.success(), "{args:?}");
        assert!(out.stdout.is_empty(), "{args:?}");
    }
    assert!(rx.recv_timeout(Duration::from_millis(300)).is_err(), "nic nie wysłano");
    ing.stop();
}

/// Komenda z `integrations::hook_command` uruchomiona prawdziwą powłoką: `hook.exe` w folderze ze spacją,
/// apostrofem i `&` musi odpowiedzieć Antigravity (przegląd 0.11). PowerShell tylko dla zwykłej ścieżki: wymaga
/// innej formy (`hook_command_ps`), a powłokę Antigravity potwierdza test na żywo.
#[test]
fn the_hook_command_runs_in_real_shells_from_awkward_home_folders() {
    use std::os::windows::process::CommandExt;
    let dir = tempfile::tempdir().unwrap();
    let missing = dir.path().join("missing.json");
    let place = |name: &str| {
        let p = dir.path().join(name).join(".agent-pets").join("hook.exe");
        std::fs::create_dir_all(p.parent().unwrap()).unwrap();
        std::fs::copy(env!("CARGO_BIN_EXE_hook"), &p).unwrap();
        p
    };
    let stop = |out: std::process::Output, what: &str| {
        assert!(String::from_utf8_lossy(&out.stdout).contains(r#"{"decision":"stop"}"#), "{what}: {:?} / {}",
            String::from_utf8_lossy(&out.stdout), String::from_utf8_lossy(&out.stderr));
    };
    let bash = ["C:/Program Files/Git/bin/bash.exe", "C:/Program Files/Git/usr/bin/bash.exe"].into_iter()
        .map(std::path::PathBuf::from).find(|p| p.is_file());
    for name in ["plain", "Jan Kowalski", "O'Neil & Co", "O'Neil", "R&D"] {
        let cmd = pets_core::integrations::hook_command(&place(name), "antigravity", "Stop");
        let out = Command::new("cmd").raw_arg(format!("/S /C \"{cmd}\"")).env("AGENT_PETS_ENDPOINT", &missing)
            .stdin(Stdio::null()).output().unwrap();
        stop(out, &format!("cmd {name}"));
        if let Some(b) = &bash {
            let out = Command::new(b).arg("-c").arg(&cmd).env("AGENT_PETS_ENDPOINT", &missing).stdin(Stdio::null()).output().unwrap();
            stop(out, &format!("bash {name}"));
        }
        let ps = pets_core::integrations::hook_command_ps(&place(name), "copilot", "Stop");
        let out = Command::new("powershell").args(["-NoProfile", "-Command", &ps]).env("AGENT_PETS_ENDPOINT", &missing)
            .stdin(Stdio::null()).output().unwrap();
        assert!(out.status.success(), "powershell {name}: {}", String::from_utf8_lossy(&out.stderr));
    }
    let plain = pets_core::integrations::hook_command(&place("plain"), "antigravity", "Stop");
    let out = Command::new("powershell").args(["-NoProfile", "-Command", &plain]).env("AGENT_PETS_ENDPOINT", &missing)
        .stdin(Stdio::null()).output().unwrap();
    stop(out, "powershell plain");
}
