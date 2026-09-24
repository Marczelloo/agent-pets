use std::io::Write;
use std::process::{Command, Stdio};
use std::time::Instant;

#[test]
fn passes_the_original_statusline_output_through_even_without_the_widget() {
    let dir = tempfile::tempdir().unwrap();
    let orig = dir.path().join("orig.json");
    std::fs::write(&orig, r#"{"type":"command","command":"findstr ."}"#).unwrap();
    let t0 = Instant::now();
    let mut child = Command::new(env!("CARGO_BIN_EXE_hook"))
        .arg("--agent-pets-statusline")
        .env("AGENT_PETS_ENDPOINT", dir.path().join("missing.json"))
        .env("AGENT_PETS_STATUSLINE_ORIGINAL", &orig)
        .stdin(Stdio::piped()).stdout(Stdio::piped()).spawn().unwrap();
    child.stdin.take().unwrap().write_all(b"{\"session_id\":\"s\"}\n").unwrap();
    let out = child.wait_with_output().unwrap();
    assert!(out.status.success());
    assert_eq!(String::from_utf8_lossy(&out.stdout).trim(), "{\"session_id\":\"s\"}");
    assert!(t0.elapsed().as_millis() < 1500);
}

#[test]
fn runs_an_original_command_with_a_quoted_path_unchanged() {
    let dir = tempfile::tempdir().unwrap();
    let orig = dir.path().join("orig.json");
    let findstr = format!("{}\\System32\\findstr.exe", std::env::var("SystemRoot").unwrap());
    let cmd = format!("\"{findstr}\" .");
    std::fs::write(&orig, serde_json::json!({"type": "command", "command": cmd}).to_string()).unwrap();
    let mut child = Command::new(env!("CARGO_BIN_EXE_hook"))
        .arg("--agent-pets-statusline")
        .env("AGENT_PETS_ENDPOINT", dir.path().join("missing.json"))
        .env("AGENT_PETS_STATUSLINE_ORIGINAL", &orig)
        .stdin(Stdio::piped()).stdout(Stdio::piped()).spawn().unwrap();
    child.stdin.take().unwrap().write_all(b"{\"a\":1}\n").unwrap();
    let out = child.wait_with_output().unwrap();
    assert_eq!(String::from_utf8_lossy(&out.stdout).trim(), "{\"a\":1}");
}

#[test]
fn prints_nothing_when_there_was_no_original_statusline() {
    let dir = tempfile::tempdir().unwrap();
    let orig = dir.path().join("orig.json");
    std::fs::write(&orig, "null").unwrap();
    let out = Command::new(env!("CARGO_BIN_EXE_hook"))
        .arg("--agent-pets-statusline")
        .env("AGENT_PETS_ENDPOINT", dir.path().join("missing.json"))
        .env("AGENT_PETS_STATUSLINE_ORIGINAL", &orig)
        .stdin(Stdio::null()).output().unwrap();
    assert!(out.status.success());
    assert!(out.stdout.is_empty());
}
