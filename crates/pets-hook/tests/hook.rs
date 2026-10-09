use pets_core::endpoint::Endpoint;
use pets_core::ingest::{Incoming, Ingest};
use std::io::Write;
use std::process::{Command, Stdio};
use std::sync::mpsc::channel;
use std::time::{Duration, Instant};

fn run_hook(endpoint_path: &std::path::Path, stdin: &str) -> std::process::Output {
    run_with(endpoint_path, &[], &[], stdin)
}

fn output_bounded(child: std::process::Child) -> std::process::Output {
    let (tx, rx) = channel();
    std::thread::spawn(move || { let _ = tx.send(child.wait_with_output()); });
    rx.recv_timeout(Duration::from_secs(20)).expect("hook.exe did not exit").unwrap()
}

#[test]
fn forwards_hook_payload_silently() {
    let (tx, rx) = channel();
    let ing = Ingest::start("tok".into(), tx, std::sync::Arc::new(pets_core::ingest::Doors::new(&pets_core::settings::Apps::default())), Default::default()).unwrap();
    let dir = tempfile::tempdir().unwrap();
    let p = dir.path().join("endpoint.json");
    ing.endpoint().write(&p).unwrap();
    let out = run_hook(&p, r#"{"hook_event_name":"Stop","session_id":"abc"}"#);
    assert!(out.status.success());
    assert!(out.stdout.is_empty() && out.stderr.is_empty());
    let Incoming::ClaudeHook(env) = rx.recv_timeout(Duration::from_secs(10)).unwrap() else { panic!("wrong route") };
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
    assert!(t.elapsed() < Duration::from_secs(15));
    let out = run_hook(&dir.path().join("missing.json"), "not json");
    assert!(out.status.success());
}

fn run_report(endpoint_path: &std::path::Path, args: &[&str]) -> std::process::Output {
    output_bounded(Command::new(env!("CARGO_BIN_EXE_hook")).arg("report").args(args)
        .env("AGENT_PETS_ENDPOINT", endpoint_path).stdout(Stdio::piped()).stderr(Stdio::piped()).spawn().unwrap())
}

#[test]
fn report_sends_a_door_event_and_says_nothing() {
    let (tx, rx) = channel();
    let ing = Ingest::start("tok".into(), tx, std::sync::Arc::new(pets_core::ingest::Doors::new(&pets_core::settings::Apps::default())), Default::default()).unwrap();
    let dir = tempfile::tempdir().unwrap();
    let p = dir.path().join("endpoint.json");
    ing.endpoint().write(&p).unwrap();
    let out = run_report(&p, &["--agent", "kilo", "--name", "Kilo CLI", "--session", "abc", "--state", "working", "--tool", "edit"]);
    assert!(out.status.success(), "{}", String::from_utf8_lossy(&out.stderr));
    let Incoming::Generic(e) = rx.recv_timeout(Duration::from_secs(10)).unwrap() else { panic!("wrong route") };
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
    assert_eq!(down.status.code(), Some(2), "widget is down");
    let (tx, _rx) = channel();
    let ing = Ingest::start("tok".into(), tx, std::sync::Arc::new(pets_core::ingest::Doors::new(&pets_core::settings::Apps { generic: false, ..Default::default() })), Default::default()).unwrap();
    ing.endpoint().write(&p).unwrap();
    let closed = run_report(&p, &["--agent", "kilo", "--session", "abc", "--state", "done"]);
    assert_eq!(closed.status.code(), Some(2), "door is closed");
    assert!(String::from_utf8_lossy(&closed.stderr).contains("door"));
    ing.stop();
}

fn run_agent(endpoint_path: &std::path::Path, args: &[&str], stdin: &str) -> std::process::Output {
    run_with(endpoint_path, args, &[], stdin)
}

/// Variables by which `hook.exe` identifies another caller; tests set only the ones they need.
const CALLER_VARS: [&str; 3] = ["GROK_HOOK_EVENT", "GROK_SESSION_ID", "ZCODE_SESSION_ID"];

#[test]
fn an_agent_that_never_closes_stdin_still_gets_its_answer() {
    let dir = tempfile::tempdir().unwrap();
    let mut c = Command::new(env!("CARGO_BIN_EXE_hook"))
        .args(["--agent", "antigravity", "--event", "Stop"]).env("AGENT_PETS_ENDPOINT", dir.path().join("missing.json"))
        .stdin(Stdio::piped()).stdout(Stdio::piped()).stderr(Stdio::piped()).spawn().unwrap();
    let mut si = c.stdin.take().unwrap();
    si.write_all(br#"{"conversationId":"d5"#).unwrap();
    let out = output_bounded(c);
    drop(si);
    assert!(out.status.success());
    assert_eq!(String::from_utf8_lossy(&out.stdout).trim(), r#"{"decision":"stop"}"#);
}

fn run_with(endpoint_path: &std::path::Path, args: &[&str], vars: &[(&str, &str)], stdin: &str) -> std::process::Output {
    let mut cmd = Command::new(env!("CARGO_BIN_EXE_hook"));
    cmd.args(args).env("AGENT_PETS_ENDPOINT", endpoint_path)
        .stdin(Stdio::piped()).stdout(Stdio::piped()).stderr(Stdio::piped());
    for k in CALLER_VARS { cmd.env_remove(k); }
    for (k, v) in vars { cmd.env(k, v); }
    let mut c = cmd.spawn().unwrap();
    // write input on a separate thread: with large JSON the hook may exit before reading it all
    let mut si = c.stdin.take().unwrap();
    let body = stdin.as_bytes().to_vec();
    let w = std::thread::spawn(move || { let _ = si.write_all(&body); });
    let out = output_bounded(c);
    let _ = w.join();
    out
}

fn agents_open() -> std::sync::Arc<pets_core::ingest::Doors> {
    std::sync::Arc::new(pets_core::ingest::Doors::new(&pets_core::settings::Apps { copilot: true, antigravity: true, ..Default::default() }))
}

#[test]
fn antigravity_stop_is_forwarded_and_answered_with_a_stop_decision() {
    let (tx, rx) = channel();
    let ing = Ingest::start("tok".into(), tx, agents_open(), Default::default()).unwrap();
    let dir = tempfile::tempdir().unwrap();
    let p = dir.path().join("endpoint.json");
    ing.endpoint().write(&p).unwrap();
    let out = run_agent(&p, &["--agent", "antigravity", "--event", "Stop"], r#"{"conversationId":"d5f1","fullyIdle":true}"#);
    assert!(out.status.success());
    assert_eq!(String::from_utf8_lossy(&out.stdout).trim(), r#"{"decision":"stop"}"#);
    let Incoming::Antigravity(env) = rx.recv_timeout(Duration::from_secs(10)).unwrap() else { panic!("wrong route") };
    assert_eq!((env.event.as_str(), env.payload["conversationId"].as_str()), ("Stop", Some("d5f1")));
    assert!(env.ts > 0 && env.host.is_none(), "host only at PreInvocation");
    let tool = run_agent(&p, &["--agent", "antigravity", "--event", "PreToolUse"], r#"{"conversationId":"d5f1"}"#);
    assert_eq!(String::from_utf8_lossy(&tool.stdout).trim(), "{}");
    ing.stop();
}

#[test]
fn copilot_hooks_are_forwarded_and_say_nothing() {
    let (tx, rx) = channel();
    let ing = Ingest::start("tok".into(), tx, agents_open(), Default::default()).unwrap();
    let dir = tempfile::tempdir().unwrap();
    let p = dir.path().join("endpoint.json");
    ing.endpoint().write(&p).unwrap();
    let out = run_agent(&p, &["--agent", "copilot", "--event", "PreToolUse"], r#"{"sessionId":"cop_1","toolName":"bash"}"#);
    assert!(out.status.success());
    assert!(out.stdout.is_empty() && out.stderr.is_empty());
    let Incoming::Copilot(env) = rx.recv_timeout(Duration::from_secs(10)).unwrap() else { panic!("wrong route") };
    assert_eq!((env.event.as_str(), env.payload["toolName"].as_str()), ("PreToolUse", Some("bash")));
    ing.stop();
}

#[test]
fn antigravity_still_gets_its_answer_when_the_widget_is_down_or_the_input_is_bad() {
    let dir = tempfile::tempdir().unwrap();
    let missing = dir.path().join("missing.json");
    let t = Instant::now();
    let out = run_agent(&missing, &["--agent", "antigravity", "--event", "Stop"], r#"{"conversationId":"d5f1"}"#);
    assert!(out.status.success() && t.elapsed() < Duration::from_secs(15));
    assert_eq!(String::from_utf8_lossy(&out.stdout).trim(), r#"{"decision":"stop"}"#);
    let p = dir.path().join("endpoint.json");
    Endpoint { port: 1, token: "x".into() }.write(&p).unwrap();
    let bad = run_agent(&p, &["--agent", "antigravity", "--event", "Stop"], "not-json");
    assert!(bad.status.success());
    assert_eq!(String::from_utf8_lossy(&bad.stdout).trim(), r#"{"decision":"stop"}"#);
    let other = run_agent(&p, &["--agent", "antigravity", "--event", "PostToolUse"], "not-json");
    assert_eq!(String::from_utf8_lossy(&other.stdout).trim(), "{}");
}

#[test]
fn a_bad_or_missing_event_name_sends_nothing() {
    let (tx, rx) = channel();
    let ing = Ingest::start("tok".into(), tx, agents_open(), Default::default()).unwrap();
    let dir = tempfile::tempdir().unwrap();
    let p = dir.path().join("endpoint.json");
    ing.endpoint().write(&p).unwrap();
    for args in [&["--agent", "copilot", "--event", "a b"][..], &["--agent", "copilot"][..], &["--agent", "nope", "--event", "Stop"][..]] {
        let out = run_agent(&p, args, r#"{"sessionId":"cop_1"}"#);
        assert!(out.status.success(), "{args:?}");
        assert!(out.stdout.is_empty(), "{args:?}");
    }
    assert!(rx.try_recv().is_err(), "nothing was sent");
    ing.stop();
}

/// Command from `integrations::hook_command` run in a real shell: `hook.exe` in a folder with a space,
/// apostrophe, and `&` must answer Antigravity (review 0.11). PowerShell only for an ordinary path: it needs
/// another form (`hook_command_ps`), while a live test verifies Antigravity's shell.
#[test]
fn the_hook_command_runs_in_real_shells_from_awkward_home_folders() {
    let dir = tempfile::tempdir().unwrap();
    let missing = dir.path().join("missing.json");
    let hook_name = if cfg!(windows) { "hook.exe" } else { "hook" };
    let place = |name: &str| {
        let p = dir.path().join(name).join(".agent-pets").join(hook_name);
        std::fs::create_dir_all(p.parent().unwrap()).unwrap();
        std::fs::copy(env!("CARGO_BIN_EXE_hook"), &p).unwrap();
        #[cfg(unix)]
        std::fs::set_permissions(&p, std::os::unix::fs::PermissionsExt::from_mode(0o755)).unwrap();
        p
    };
    let stop = |out: std::process::Output, what: &str| {
        assert!(String::from_utf8_lossy(&out.stdout).contains(r#"{"decision":"stop"}"#), "{what}: {:?} / {}",
            String::from_utf8_lossy(&out.stdout), String::from_utf8_lossy(&out.stderr));
    };
    // how a shell runs a command line
    type Shell = Box<dyn Fn(&str) -> Command>;
    #[cfg(windows)]
    let shells: Vec<(&str, Shell)> = {
        use std::os::windows::process::CommandExt;
        let bash = ["C:/Program Files/Git/bin/bash.exe", "C:/Program Files/Git/usr/bin/bash.exe"].into_iter()
            .map(std::path::PathBuf::from).find(|p| p.is_file());
        let mut v: Vec<(&str, Shell)> = vec![("cmd", Box::new(|cmd: &str| {
            let mut c = Command::new("cmd");
            c.raw_arg(format!("/S /C \"{cmd}\""));
            c
        }))];
        // Git's bash by full path: a bare `bash` on PATH is WSL's launcher
        if let Some(b) = bash {
            v.push(("bash", Box::new(move |cmd: &str| { let mut c = Command::new(&b); c.arg("-c").arg(cmd); c })));
        }
        v
    };
    #[cfg(not(windows))]
    let shells: Vec<(&str, Shell)> = vec![
        ("sh", Box::new(|cmd: &str| { let mut c = Command::new("sh"); c.arg("-c").arg(cmd); c })),
        ("bash", Box::new(|cmd: &str| { let mut c = Command::new("bash"); c.arg("-c").arg(cmd); c })),
    ];
    for name in ["plain", "Jan Kowalski", "O'Neil & Co", "O'Neil", "R&D"] {
        let cmd = pets_core::integrations::hook_command(&place(name), "antigravity", "Stop");
        for (what, make) in &shells {
            let out = make(&cmd).env("AGENT_PETS_ENDPOINT", &missing).stdin(Stdio::null()).output().unwrap();
            stop(out, &format!("{what} {name}"));
        }
        #[cfg(windows)]
        {
            let ps = pets_core::integrations::hook_command_ps(&place(name), "copilot", "Stop");
            let out = Command::new("powershell").args(["-NoProfile", "-Command", &ps]).env("AGENT_PETS_ENDPOINT", &missing)
                .stdin(Stdio::null()).output().unwrap();
            assert!(out.status.success(), "powershell {name}: {}", String::from_utf8_lossy(&out.stderr));
        }
    }
    #[cfg(windows)]
    {
        let plain = pets_core::integrations::hook_command(&place("plain"), "antigravity", "Stop");
        let out = Command::new("powershell").args(["-NoProfile", "-Command", &plain]).env("AGENT_PETS_ENDPOINT", &missing)
            .stdin(Stdio::null()).output().unwrap();
        stop(out, "powershell plain");
    }
}

fn new_agents_open() -> std::sync::Arc<pets_core::ingest::Doors> {
    std::sync::Arc::new(pets_core::ingest::Doors::new(&pets_core::settings::Apps { cursor: true, grok: true, zcode: true, ..Default::default() }))
}

fn widget() -> (Ingest, std::sync::mpsc::Receiver<Incoming>, tempfile::TempDir, std::path::PathBuf) {
    let (tx, rx) = channel();
    let ing = Ingest::start("tok".into(), tx, new_agents_open(), Default::default()).unwrap();
    let dir = tempfile::tempdir().unwrap();
    let p = dir.path().join("endpoint.json");
    ing.endpoint().write(&p).unwrap();
    (ing, rx, dir, p)
}

#[test]
fn cursor_input_with_a_utf8_bom_still_reaches_the_widget() {
    // verified live: Cursor runs hooks through pwsh with UTF-8 `$OutputEncoding`, so JSON starts with a BOM
    let (ing, rx, _dir, p) = widget();
    let out = run_agent(&p, &["--agent", "cursor", "--event", "beforeSubmitPrompt"],
        "\u{feff}{\"conversation_id\":\"conv_1\",\"hook_event_name\":\"beforeSubmitPrompt\"}\r\n");
    assert_eq!(String::from_utf8_lossy(&out.stdout).trim(), r#"{"continue":true}"#);
    let Incoming::Cursor(env) = rx.recv_timeout(Duration::from_secs(10)).unwrap() else { panic!("wrong route") };
    assert_eq!(env.payload["conversation_id"], "conv_1");
    ing.stop();
}

#[test]
fn the_cursor_folder_is_kept_although_the_workspace_roots_are_slimmed_away() {
    let (ing, rx, _dir, p) = widget();
    run_agent(&p, &["--agent", "cursor", "--event", "sessionStart"],
        r#"{"conversation_id":"conv_1","cursor_version":"3.22.12","workspace_roots":["/C:/w/app"]}"#);
    let Incoming::Cursor(env) = rx.recv_timeout(Duration::from_secs(10)).unwrap() else { panic!("wrong route") };
    assert_eq!(env.payload["cwd"], "C:/w/app");
    assert!(env.payload.get("workspace_roots").is_none());
    ing.stop();
}

#[test]
fn cursor_hooks_are_forwarded_and_always_let_cursor_go_on() {
    let (ing, rx, _dir, p) = widget();
    let out = run_agent(&p, &["--agent", "cursor", "--event", "beforeSubmitPrompt"],
        r#"{"conversation_id":"conv_1","cursor_version":"1.7.2","hook_event_name":"beforeSubmitPrompt","prompt":"sekret"}"#);
    assert!(out.status.success());
    assert_eq!(String::from_utf8_lossy(&out.stdout).trim(), r#"{"continue":true}"#);
    let Incoming::Cursor(env) = rx.recv_timeout(Duration::from_secs(10)).unwrap() else { panic!("wrong route") };
    assert_eq!((env.event.as_str(), env.payload["conversation_id"].as_str()), ("beforeSubmitPrompt", Some("conv_1")));
    assert!(env.payload.get("prompt").is_none(), "prompt does not leave the hook");
    let tool = run_agent(&p, &["--agent", "cursor", "--event", "preToolUse"], r#"{"conversation_id":"conv_1","cursor_version":"1.7.2"}"#);
    assert_eq!(String::from_utf8_lossy(&tool.stdout).trim(), "{}");
    assert!(matches!(rx.recv_timeout(Duration::from_secs(10)).unwrap(), Incoming::Cursor(_)));
    ing.stop();
}

#[test]
fn grok_and_zcode_hooks_are_forwarded_and_say_nothing() {
    let (ing, rx, _dir, p) = widget();
    let out = run_with(&p, &["--agent", "grok", "--event", "Stop"], &[("GROK_HOOK_EVENT", "Stop")], r#"{"sessionId":"g1","hookEventName":"Stop"}"#);
    assert!(out.status.success() && out.stdout.is_empty());
    assert!(matches!(rx.recv_timeout(Duration::from_secs(10)).unwrap(), Incoming::Grok(_)));
    let out = run_with(&p, &["--agent", "zcode", "--event", "Stop"], &[("ZCODE_SESSION_ID", "zc_1")], r#"{"sessionId":"zc_1","hookEventName":"Stop"}"#);
    assert!(out.status.success() && out.stdout.is_empty());
    assert!(matches!(rx.recv_timeout(Duration::from_secs(10)).unwrap(), Incoming::Zcode(_)));
    ing.stop();
}

#[test]
fn grok_takes_the_session_id_from_its_environment() {
    let (ing, rx, _dir, p) = widget();
    run_with(&p, &["--agent", "grok", "--event", "PreToolUse"], &[("GROK_HOOK_EVENT", "PreToolUse"), ("GROK_SESSION_ID", "g1")],
        r#"{"hookEventName":"PreToolUse","toolName":"bash"}"#);
    let Incoming::Grok(env) = rx.recv_timeout(Duration::from_secs(10)).unwrap() else { panic!("wrong route") };
    assert_eq!(env.payload["sessionId"], "g1");
    ing.stop();
}

#[test]
fn cursor_still_gets_its_answer_when_the_widget_is_down_or_the_input_is_bad() {
    let dir = tempfile::tempdir().unwrap();
    let t = Instant::now();
    let out = run_agent(&dir.path().join("missing.json"), &["--agent", "cursor", "--event", "beforeSubmitPrompt"], r#"{"cursor_version":"1"}"#);
    assert!(out.status.success() && t.elapsed() < Duration::from_secs(15));
    assert_eq!(String::from_utf8_lossy(&out.stdout).trim(), r#"{"continue":true}"#);
    let bad = run_agent(&dir.path().join("missing.json"), &["--agent", "cursor", "--event", "beforeSubmitPrompt"], "not-json");
    assert!(bad.status.success());
    assert_eq!(String::from_utf8_lossy(&bad.stdout).trim(), r#"{"continue":true}"#);
}

#[test]
fn a_hook_run_by_another_agent_sends_nothing() {
    let (ing, rx, _dir, p) = widget();
    // Grok reads Cursor hooks: do not pretend to be Cursor, but keep the Cursor response
    let out = run_with(&p, &["--agent", "cursor", "--event", "preToolUse"], &[("GROK_HOOK_EVENT", "PreToolUse")], r#"{"conversation_id":"c"}"#);
    assert!(out.status.success());
    assert_eq!(String::from_utf8_lossy(&out.stdout).trim(), "{}");
    // Cursor and Grok read Claude hooks: these are not Claude sessions
    run_with(&p, &[], &[], r#"{"hook_event_name":"Stop","session_id":"abc","cursor_version":"1.7.2"}"#);
    run_with(&p, &[], &[("GROK_HOOK_EVENT", "Stop")], r#"{"hook_event_name":"Stop","session_id":"abc"}"#);
    assert!(rx.try_recv().is_err(), "nothing was sent");
    ing.stop();
}

#[test]
fn claude_started_from_zcode_is_still_claude() {
    let (tx, rx) = channel();
    let ing = Ingest::start("tok".into(), tx, std::sync::Arc::new(pets_core::ingest::Doors::new(&pets_core::settings::Apps::default())), Default::default()).unwrap();
    let dir = tempfile::tempdir().unwrap();
    let p = dir.path().join("endpoint.json");
    ing.endpoint().write(&p).unwrap();
    run_with(&p, &[], &[("ZCODE_SESSION_ID", "zc_1")], r#"{"hook_event_name":"Stop","session_id":"abc"}"#);
    let Incoming::ClaudeHook(env) = rx.recv_timeout(Duration::from_secs(10)).unwrap() else { panic!("wrong route") };
    assert_eq!(env.payload["session_id"], "abc");
    ing.stop();
}

#[test]
fn a_huge_cursor_prompt_never_leaves_the_hook() {
    let (ing, rx, _dir, p) = widget();
    let big = format!(r#"{{"conversation_id":"conv_1","cursor_version":"1.7.2","prompt":"{}"}}"#, "a".repeat(2 << 20));
    let t = Instant::now();
    let out = run_agent(&p, &["--agent", "cursor", "--event", "beforeSubmitPrompt"], &big);
    assert!(t.elapsed() < Duration::from_secs(15), "{:?}", t.elapsed());
    assert_eq!(String::from_utf8_lossy(&out.stdout).trim(), r#"{"continue":true}"#);
    let Incoming::Cursor(env) = rx.recv_timeout(Duration::from_secs(10)).unwrap() else { panic!("wrong route") };
    assert!(env.payload.get("prompt").is_none());
    assert!(serde_json::to_vec(&env).unwrap().len() < 1 << 20);
    ing.stop();
}

#[test]
fn a_bad_cursor_event_name_sends_nothing() {
    let (ing, rx, _dir, p) = widget();
    let out = run_agent(&p, &["--agent", "cursor", "--event", "a b"], r#"{"cursor_version":"1"}"#);
    assert!(out.status.success());
    assert!(rx.try_recv().is_err(), "nothing was sent");
    ing.stop();
}
