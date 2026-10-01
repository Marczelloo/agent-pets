use std::io::Write;
use std::process::{Command, Stdio};
use std::time::Instant;

#[test]
fn passes_the_original_statusline_output_through_even_without_the_widget() {
    let dir = tempfile::tempdir().unwrap();
    let orig = dir.path().join("orig.json");
    // `grep .` (POSIX) or `findstr .` (Windows): prints the input line back
    let line = if cfg!(windows) { "findstr ." } else { "grep ." };
    std::fs::write(&orig, serde_json::json!({"type": "command", "command": line}).to_string()).unwrap();
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
    assert!(t0.elapsed().as_millis() < 20_000);
}

#[test]
fn runs_an_original_command_with_a_quoted_path_unchanged() {
    let dir = tempfile::tempdir().unwrap();
    let orig = dir.path().join("orig.json");
    // a real program in a folder with a space, invoked through quotes: `cat`/`findstr` prints the input back
    let prog = if cfg!(windows) {
        let findstr = format!("{}\\System32\\findstr.exe", std::env::var("SystemRoot").unwrap());
        std::fs::write(&orig, serde_json::json!({"type": "command", "command": format!("\"{findstr}\" .")}).to_string()).unwrap();
        return run_and_expect(dir.path(), &orig, "{\"a\":1}");
    } else {
        let sub = dir.path().join("sub dir");
        std::fs::create_dir_all(&sub).unwrap();
        let cat = sub.join("mycat");
        std::fs::copy("/bin/cat", &cat).unwrap();
        std::fs::set_permissions(&cat, std::os::unix::fs::PermissionsExt::from_mode(0o755)).unwrap();
        cat
    };
    let cmd = format!("\"{}\"", prog.display());
    std::fs::write(&orig, serde_json::json!({"type": "command", "command": cmd}).to_string()).unwrap();
    run_and_expect(dir.path(), &orig, "{\"a\":1}");
}

fn run_and_expect(dir: &std::path::Path, orig: &std::path::Path, expect: &str) {
    let mut child = Command::new(env!("CARGO_BIN_EXE_hook"))
        .arg("--agent-pets-statusline")
        .env("AGENT_PETS_ENDPOINT", dir.join("missing.json"))
        .env("AGENT_PETS_STATUSLINE_ORIGINAL", orig)
        .stdin(Stdio::piped()).stdout(Stdio::piped()).spawn().unwrap();
    child.stdin.take().unwrap().write_all(format!("{expect}\n").as_bytes()).unwrap();
    let out = child.wait_with_output().unwrap();
    assert_eq!(String::from_utf8_lossy(&out.stdout).trim(), expect);
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

#[test]
fn sends_nothing_to_the_widget() {
    let dir = tempfile::tempdir().unwrap();
    let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
    listener.set_nonblocking(true).unwrap();
    let ep = dir.path().join("endpoint.json");
    std::fs::write(&ep, format!("{{\"port\":{},\"token\":\"t\"}}", listener.local_addr().unwrap().port())).unwrap();
    let orig = dir.path().join("orig.json");
    std::fs::write(&orig, r#"{"type":"command","command":"findstr ."}"#).unwrap();
    let mut child = Command::new(env!("CARGO_BIN_EXE_hook"))
        .arg("--agent-pets-statusline")
        .env("AGENT_PETS_ENDPOINT", &ep)
        .env("AGENT_PETS_STATUSLINE_ORIGINAL", &orig)
        .stdin(Stdio::piped()).stdout(Stdio::piped()).spawn().unwrap();
    child.stdin.take().unwrap().write_all(b"{\"session_id\":\"s\"}\n").unwrap();
    let out = child.wait_with_output().unwrap();
    assert_eq!(String::from_utf8_lossy(&out.stdout).trim(), "{\"session_id\":\"s\"}");
    assert!(listener.accept().is_err(), "the hook must not connect to the widget");
}
