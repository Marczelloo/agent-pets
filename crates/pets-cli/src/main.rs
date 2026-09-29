mod render;

use anyhow::Context as _;
use pets_core::{hooks_install, statusline_install};
use pets_core::replay::Replay;
use pets_core::runtime::{Runtime, RuntimeConfig};
use pets_core::store::{Store, Timing};
use pets_core::time;
use std::fs::File;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::time::Duration;

const USAGE: &str = "usage: pets-cli run [--record file.jsonl] | replay file.jsonl [--speed N] | install-hooks [hook.exe] | uninstall-hooks | install-statusline [hook.exe] | uninstall-statusline | stats-scan [--out stats.json]";

fn claude_settings() -> anyhow::Result<PathBuf> {
    Ok(dirs::home_dir().context("home directory not found")?.join(".claude").join("settings.json"))
}

fn run(record: Option<PathBuf>) -> anyhow::Result<()> {
    let mut cfg = RuntimeConfig::from_env()?;
    cfg.record = record.map(File::create).transpose()?;
    let mut rt = Runtime::start(cfg)?;
    let mut last_draw = 0i64;
    loop {
        let now = time::now_ms();
        if rt.step(now) || now - last_draw >= 1000 {
            print!("\x1b[2J\x1b[H{}", render::render(rt.store(), now));
            let _ = std::io::stdout().flush();
            last_draw = now;
        }
        std::thread::sleep(Duration::from_millis(250));
    }
}

fn replay(path: &Path, speed: f64) -> anyhow::Result<()> {
    let mut rp = Replay::load(path, speed)?;
    if rp.is_empty() { println!("empty file"); return Ok(()); }
    let mut store = Store::new(Timing::default());
    while let Some(d) = rp.next_delay_ms() {
        std::thread::sleep(Duration::from_millis(d));
        let Some(clock) = rp.apply_next(&mut store) else { break };
        print!("\x1b[2J\x1b[H{}", render::render(&store, clock));
        let _ = std::io::stdout().flush();
    }
    Ok(())
}

/// Developer tool (0.9): scan all history into a separate ledger and summarize it without project names.
fn stats_scan(out: Option<PathBuf>) -> anyhow::Result<()> {
    use pets_core::stats::{scan::Scanner, Book, Cell};
    let home = dirs::home_dir().context("home directory not found")?;
    let roots = vec![home.join(".claude").join("projects"), home.join(".codex").join("sessions")];
    let book = out.as_deref().map(Book::load).unwrap_or_default();
    let mut sc = Scanner::new(roots, book);
    let t0 = std::time::Instant::now();
    let files = sc.refresh();
    let mut last = std::time::Instant::now();
    loop {
        let p = sc.step(4 * 1024 * 1024, &|| false);
        if p.done || last.elapsed() > Duration::from_secs(2) {
            println!("{:>6.1} s  {} MB / {} MB  files queued: {}", t0.elapsed().as_secs_f64(), p.scanned >> 20, p.total >> 20, p.files);
            last = std::time::Instant::now();
        }
        if p.done { break; }
    }
    let mut c = Cell::default();
    for e in sc.book.files.values() { for m in e.buckets.values() { for x in m.values() { c.add(x); } } }
    println!("files: {files}, scan time: {:.1} s", t0.elapsed().as_secs_f64());
    println!("tokens: {} (input {}, cache read {}, cache write {}, output {}), work: {} h, questions: {}",
        c.tokens(), c.input, c.cache_read, c.cache_write, c.output, c.active_ms / 3_600_000, c.questions);
    if let Some(o) = out { sc.book.save(&o)?; println!("ledger: {} bytes", std::fs::metadata(&o)?.len()); }
    Ok(())
}

fn main() -> anyhow::Result<()> {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let flag = |f: &str| args.iter().position(|a| a == f).and_then(|i| args.get(i + 1)).cloned();
    match args.first().map(String::as_str) {
        Some("run") => run(flag("--record").map(PathBuf::from)),
        Some("stats-scan") => stats_scan(flag("--out").map(PathBuf::from)),
        Some("replay") => {
            let file = args.get(1).context(USAGE)?;
            let speed = flag("--speed").and_then(|s| s.parse().ok()).unwrap_or(10.0);
            replay(Path::new(file), speed)
        }
        Some("install-hooks") => {
            let exe = match args.get(1) {
                Some(p) => PathBuf::from(p),
                None => std::env::current_exe()?.with_file_name("hook.exe"),
            };
            anyhow::ensure!(exe.exists(), "file not found: {}", exe.display());
            hooks_install::install_file(&claude_settings()?, &exe.to_string_lossy())?;
            println!("Installed hooks ({}) in {}", exe.display(), claude_settings()?.display());
            Ok(())
        }
        Some("uninstall-hooks") => {
            hooks_install::uninstall_file(&claude_settings()?)?;
            println!("Removed Agent Pets hooks from {}", claude_settings()?.display());
            Ok(())
        }
        Some("install-statusline") => {
            let exe = match args.get(1) {
                Some(p) => PathBuf::from(p),
                None => std::env::current_exe()?.with_file_name("hook.exe"),
            };
            anyhow::ensure!(exe.exists(), "file not found: {}", exe.display());
            statusline_install::install_file(&claude_settings()?, &exe.to_string_lossy())?;
            println!("Installed statusline pass-through ({}) in {}; previous statusLine saved in {}",
                exe.display(), claude_settings()?.display(), statusline_install::original_path().display());
            Ok(())
        }
        Some("uninstall-statusline") => {
            statusline_install::uninstall_file(&claude_settings()?)?;
            println!("Restored previous statusLine in {}", claude_settings()?.display());
            Ok(())
        }
        _ => { eprintln!("{USAGE}"); Ok(()) }
    }
}
