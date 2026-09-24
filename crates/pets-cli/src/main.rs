mod render;

use anyhow::Context as _;
use pets_core::claude::{self, hook::TaskTracker, HookEnvelope};
use pets_core::endpoint::Endpoint;
use pets_core::ingest::{Incoming, Ingest};
use pets_core::model::Event;
use pets_core::rehydrate::recent_files;
use pets_core::store::{Store, Timing};
use pets_core::watch::{watch, Sources};
use pets_core::{hooks_install, pid, time};
use std::fs::File;
use std::io::{BufRead, Write};
use std::path::{Path, PathBuf};
use std::sync::mpsc::channel;
use std::time::Duration;

const USAGE: &str = "użycie: pets-cli run [--record plik.jsonl] | replay plik.jsonl [--speed N] | install-hooks [hook.exe] | uninstall-hooks";

fn claude_settings() -> anyhow::Result<PathBuf> {
    Ok(dirs::home_dir().context("brak katalogu domowego")?.join(".claude").join("settings.json"))
}

fn apply(store: &mut Store, rec: &mut Option<File>, e: Event) -> bool {
    if let Some(f) = rec { let _ = writeln!(f, "{}", serde_json::to_string(&e).unwrap_or_default()); }
    !store.apply(&e).is_empty()
}

fn on_hook(store: &mut Store, sources: &mut Sources, tasks: &mut TaskTracker, rec: &mut Option<File>, env: HookEnvelope) -> bool {
    let mut changed = false;
    if let Some(tp) = claude::hook::transcript_path(&env) {
        if sources.track(&tp, true) { for e in sources.poll(&tp) { changed |= apply(store, rec, e); } }
    }
    for e in claude::hook::to_events(&env) { changed |= apply(store, rec, e); }
    if let Some(e) = tasks.observe(&env) { changed |= apply(store, rec, e); }
    changed
}

fn run(record: Option<PathBuf>) -> anyhow::Result<()> {
    let (tx, rx) = channel();
    let ingest = Ingest::start(Endpoint::new_token(), tx)?;
    ingest.endpoint().write(&Endpoint::default_path()).context("zapis endpoint.json")?;
    let mut rec = record.map(File::create).transpose()?;
    let mut store = Store::new(Timing::default());
    let mut sources = Sources::new();
    let mut tasks = TaskTracker::default();
    let home = dirs::home_dir().context("brak katalogu domowego")?;
    let roots = [home.join(".claude").join("projects"), home.join(".codex").join("sessions")];
    for r in &roots {
        for f in recent_files(r, Duration::from_secs(1800)) {
            if sources.track(&f, true) { for e in sources.poll(&f) { apply(&mut store, &mut rec, e); } }
        }
    }
    let (ptx, prx) = channel();
    let _watcher = watch(&roots, ptx)?;
    let mut last_draw = 0i64;
    loop {
        let mut changed = false;
        while let Ok(Incoming::ClaudeHook(env)) = rx.try_recv() {
            changed |= on_hook(&mut store, &mut sources, &mut tasks, &mut rec, env);
        }
        while let Ok(p) = prx.try_recv() {
            for e in sources.poll(&p) { changed |= apply(&mut store, &mut rec, e); }
        }
        let now = time::now_ms();
        changed |= !store.tick(now, &pid::is_alive).is_empty();
        if changed || now - last_draw >= 1000 {
            print!("\x1b[2J\x1b[H{}", render::render(&store, now));
            let _ = std::io::stdout().flush();
            last_draw = now;
        }
        std::thread::sleep(Duration::from_millis(250));
    }
}

fn replay(path: &Path, speed: f64) -> anyhow::Result<()> {
    let events: Vec<Event> = std::io::BufReader::new(File::open(path)?).lines()
        .map_while(Result::ok).filter_map(|l| serde_json::from_str(&l).ok()).collect();
    let Some(t0) = events.first().map(|e| e.ts) else { println!("pusty plik"); return Ok(()) };
    let start = std::time::Instant::now();
    let mut store = Store::new(Timing::default());
    for e in events {
        let due = Duration::from_millis(((e.ts - t0).max(0) as f64 / speed) as u64);
        if let Some(wait) = due.checked_sub(start.elapsed()) { std::thread::sleep(wait); }
        store.apply(&e);
        store.tick(e.ts, &|_| true);
        print!("\x1b[2J\x1b[H{}", render::render(&store, e.ts));
        let _ = std::io::stdout().flush();
    }
    Ok(())
}

fn main() -> anyhow::Result<()> {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let flag = |f: &str| args.iter().position(|a| a == f).and_then(|i| args.get(i + 1)).cloned();
    match args.first().map(String::as_str) {
        Some("run") => run(flag("--record").map(PathBuf::from)),
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
            anyhow::ensure!(exe.exists(), "nie ma pliku {}", exe.display());
            hooks_install::install_file(&claude_settings()?, &exe.to_string_lossy())?;
            println!("Zainstalowano hooki ({}) w {}", exe.display(), claude_settings()?.display());
            Ok(())
        }
        Some("uninstall-hooks") => {
            hooks_install::uninstall_file(&claude_settings()?)?;
            println!("Usunięto hooki Agent Pets z {}", claude_settings()?.display());
            Ok(())
        }
        _ => { eprintln!("{USAGE}"); Ok(()) }
    }
}
