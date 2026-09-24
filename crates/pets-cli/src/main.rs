mod render;

use anyhow::Context as _;
use pets_core::hooks_install;
use pets_core::replay::Replay;
use pets_core::runtime::{Runtime, RuntimeConfig};
use pets_core::store::{Store, Timing};
use pets_core::time;
use std::fs::File;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::time::Duration;

const USAGE: &str = "użycie: pets-cli run [--record plik.jsonl] | replay plik.jsonl [--speed N] | install-hooks [hook.exe] | uninstall-hooks";

fn claude_settings() -> anyhow::Result<PathBuf> {
    Ok(dirs::home_dir().context("brak katalogu domowego")?.join(".claude").join("settings.json"))
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
    if rp.is_empty() { println!("pusty plik"); return Ok(()); }
    let mut store = Store::new(Timing::default());
    while let Some(d) = rp.next_delay_ms() {
        std::thread::sleep(Duration::from_millis(d));
        let Some(clock) = rp.apply_next(&mut store) else { break };
        print!("\x1b[2J\x1b[H{}", render::render(&store, clock));
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
