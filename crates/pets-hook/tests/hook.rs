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
    let ing = Ingest::start("tok".into(), tx).unwrap();
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
