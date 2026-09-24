# Agent Pets: faza 2 (scena i maskotki w pasku zadań). Plan implementacji

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Cel:** aplikacja Tauri `agent-pets` osadza w pasku zadań scenę z żywymi zwierzakami. Każdy zwierzak odgrywa prawdziwy stan sesji z rdzenia danych. Scena ma pasek postępu pod każdym zwierzakiem, paski limitów, plakietkę „+N” i tooltip. Pierwszy zwierzak nie jest ucinany z lewej, a scena nie nachodzi na ikony aplikacji.

**Architektura:**
- **Rdzeń:** pętla z `pets-cli run` przechodzi do `pets_core::runtime::Runtime`, a odtwarzanie do `pets_core::replay::Replay`. Aplikacja i CLI używają tego samego kodu.
- **Wątek rdzenia w aplikacji:** publikuje pełną migawkę stanu (`Snapshot`) do UI przy każdej zmianie.
- **Powłoka (Rust):**
  - osadza okno sceny w `Shell_TrayWnd`;
  - wolne miejsce między ikonami aplikacji a zasobnikiem mierzy przez UI Automation;
  - odtwarza okno po restarcie Explorera;
  - czyta mysz natywnie;
  - prowadzi okno tooltipa i ikonę w trayu.
- **UI:** czysty TypeScript bez frameworka.
  - `renderer/` to port 1:1 prototypu v6, sprawdzany testem zgodności z `prototype/pets.js`.
  - `stage/` to układ, przepełnienie, HUD i pętla 30 kl./s.

**Stos:**
- Tauri 2.11, `windows` 0.61 (ta sama wersja co w Tauri), Rust 1.93;
- Vite, TypeScript (strict), vitest, pnpm 10, Node 22.

**Specyfikacja:** `docs/superpowers/specs/2026-09-24-agent-pets-design.md` (sekcje 2.1, 2.2, 3, 5, 7, 10, 11, 12, 13 „Faza 2”). Wyniki spike'ów: `docs/spikes/S1-S2-taskbar-embed.md`.

**Odstępstwo od specyfikacji:** React wchodzi dopiero w fazie 3, razem z panelem. Scena i tooltip to jedno płótno i kilka linijek DOM, więc framework nic nie wnosi (YAGNI). Renderer i tak ma być „bez frameworka” (spec 3).

## Global Constraints

- Tylko Windows 11, główny monitor, pasek zadań na dole.
- **Mini widok:** skala zwierzaka u = 0,3 przy wysokości paska 48 CSS px (u = 0,3·h/48). Ma pełne animacje, rekwizyty i cząsteczki. Upraszczanie mini widoku jest zabronione.
- **Przepełnienie:**
  - widocznych najwyżej 5 zwierzaków; nadmiar zwija się w plakietkę „+N”;
  - nigdy nie ukrywamy `needs_you` ani `error`; zwijane są najstarsze spośród pozostałych;
  - kolejność stabilna według `started_at` (przy remisie według `id`).
- **Pasek postępu:**
  - pod zwierzakiem, `done/total`;
  - bez listy, a sesja aktywna (`thinking`, `working`, `compacting`, `needs_you`): pasek pulsuje.
- **Limity:** paski 5h i tygodniowy, osobno dla Claude'a i Codexa. Pasek bez danych jest ukryty; nigdy nie pokazuje 0% zamiast braku danych.
- **Kolory:**
  - kontur `#2B1D16`, papier `#FAF9F5`, glina `#D97757`, teal `#1D9E75`/`#5DCAA5`, bursztyn `#EF9F27`;
  - Claude = `#D97757`, Codex = `#5DCAA5`;
  - limit ≥ 90% = `#E24B4A`.
- **Klatki i CPU:** scena w pasku rysuje 30 kl./s. Rysowanie jest wstrzymane przy ukrytym pasku i przy aplikacji pełnoekranowej. Całość < 2% CPU przy 5 aktywnych zwierzakach.
- **Mysz:** zdarzenia DOM myszy w osadzonej scenie nie działają. Wejście myszy pochodzi wyłącznie z natywnego wątku w Rust (`pets://pointer`).
- **Bezpieczeństwo:**
  - tytuły sesji to treść promptów, więc do DOM trafiają tylko przez `textContent`, nigdy przez `innerHTML`;
  - żadnego ruchu sieciowego poza `127.0.0.1`.
- **Zdarzenia Tauri:**

  | Nazwa | Ładunek |
  |---|---|
  | `pets://snapshot` | `Snapshot` |
  | `pets://layout` | `{max_css, height_css, scale}` |
  | `pets://visibility` | `bool` |
  | `pets://pointer` | `{kind: "move"\|"leave"\|"click"\|"context", x?, y?}` |
  | `tooltip://content` | `{seq, content}` |

- **Komendy Tauri:** `snapshot`, `stage_hello`, `stage_set_width(width)`, `tooltip_show(anchorX, content)`, `tooltip_size(seq, w, h)`, `tooltip_hide`.
- **Weryfikacja przed każdym commitem:**
  - `cargo test --workspace` z katalogu głównego;
  - od tasku 2 także `pnpm test` i `pnpm typecheck` w `app/`;
  - kod wyjścia sprawdzamy jawnie. Nie przepuszczamy wyjścia testów przez `| head` ani `| grep`, bo to gubi kod wyjścia.
- **Stopka commita:** `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- **Delegacja do Codexa** (CLAUDE.md, zadania mechaniczne z obiektywnym kryterium): kandydatami są taski 3 i 4. Kryterium akceptacji to test zgodności z prototypem. Review po Codeksie jest obowiązkowy.
- **Konflikty przy uruchamianiu:**
  - aplikacja i `pets-cli run` nie mogą działać naraz, bo obie zapisują `endpoint.json`;
  - spike `spikes/taskbar-embed` zajmuje port 1420 i trzeba go zamknąć przed `pnpm tauri dev`.

## Review Focus

1. **Mało miejsca w pasku** (dużo ikon, skala 150–200%), wolne miejsce mniejsze niż jeden zwierzak. Oczekiwane: pojemność 0, widać tylko „+N” albo nic, a scena nigdy nie wchodzi na ikony. Test: task 6, `capacity 0`.
2. **Nieznany stan lub narzędzie** z nowszego rdzenia (np. `"state":"paused"`). Oczekiwane: scena zastępcza (`thinking` / `mcp`), bez wyjątku. Test: task 5, `sceneFor`.
3. **Postęp z `total == 0`**, np. wszystkie zadania usunięte. Oczekiwane: traktowany jak brak listy (pulsowanie), bez `NaN` w szerokości. Test: task 6, `progressFraction`.
4. **Kontekst z `max == 0`, limit spoza 0–100 albo z `resets_at` w przeszłości.** Oczekiwane: brak linii kontekstu zamiast „NaN%”, procent przycięty do 0–100, „reset wkrótce”. Testy: task 6 (`clampPct`) i task 9 (`petTooltip`, `formatReset`).
5. **Pusty tytuł i pusty `cwd` albo tytuł długości promptu.** Oczekiwane: „Sesja bez tytułu”, a długi tytuł ucięty do 80 znaków z „…”. Test: task 9, `petTooltip`.

---

## Struktura plików

```
Cargo.toml                              + członek "app/src-tauri"
crates/pets-core/src/runtime.rs         NOWY: Runtime (ingest + watch + rehydracja + tick)
crates/pets-core/src/replay.rs          NOWY: Replay (tempo odtwarzania, monotoniczny zegar)
crates/pets-cli/src/main.rs             run/replay na Runtime/Replay
app/
  package.json, pnpm-lock.yaml, tsconfig.json, vite.config.ts
  index.html                            okno sceny
  tooltip.html                          okno tooltipa
  dev.html                              podgląd sceny w przeglądarce (bez Tauri)
  demo/many-sessions.jsonl              nagranie 7 sesji do trybu odtwarzania
  src/types.ts                          typy lustrzane do Rust (Session, Limit, Snapshot, ...)
  src/main.ts                           wejście okna sceny
  src/dev.ts                            wejście dev.html
  src/renderer/                         port prototypu v6
    rng.ts  math.ts  pen.ts  palette.ts  pose.ts  fold.ts  scenes.ts  pet.ts
    draw/props.ts  draw/items.ts  draw/body.ts
    index.ts                            publiczne API renderera
    testing.ts                          recorder kontekstu 2D, LCG, loader prototypu (tylko testy)
    parity.test.ts  smoke.test.ts
  src/skins/types.ts  clawd.ts  kodek.ts  index.ts
  src/stage/
    sceneFor.ts                         Session → klucz sceny, agent → skórka
    layout.ts                           przepełnienie, pozycje, szerokość
    hit.ts                              punkt → cel (zwierzak, limity, „+N”)
    hud.ts                              pasek postępu, paski limitów, plakietka
    roster.ts                           migawka → zwierzaki (tworzenie, zmiana sceny, zanik)
    bridge.ts                           Bridge: Tauri albo atrapa do dev.html
    demo.ts                             dane pokazowe do dev.html
    hover.ts                            tooltip po najechaniu
    stage.ts                            pętla 30 kl./s i rysowanie
  src/tooltip/text.ts                   treść tooltipa (czysta logika)
  src/tooltip/view.ts                   render treści do DOM (textContent)
  src/tooltip/main.ts                   wejście okna tooltipa
  src-tauri/
    Cargo.toml, build.rs, tauri.conf.json, capabilities/default.json, icons/
    src/main.rs, src/lib.rs
    src/core.rs                         wątek rdzenia → Snapshot
    src/shell/mod.rs                    Shell: okno sceny, pętla układu, odtwarzanie, widoczność
    src/shell/placement.rs              czysta geometria (testy)
    src/shell/taskbar.rs                Win32 + UI Automation
    src/shell/pointer.rs                natywna mysz (diff testowany)
    src/tooltip.rs                      okno tooltipa i komendy
    src/tray.rs                         ikona w trayu z „Zakończ”
docs/phase2-verification.md             ręczna checklista fazy 2
```

---

### Task 1: `Runtime` i `Replay` w `pets-core`

Pętla `pets-cli run` i logika `replay` przechodzą do biblioteki, żeby aplikacja Tauri używała tego samego kodu.

**Files:**
- Create: `crates/pets-core/src/runtime.rs`
- Create: `crates/pets-core/src/replay.rs`
- Modify: `crates/pets-core/src/lib.rs` (dodać `pub mod replay; pub mod runtime;`)
- Modify: `crates/pets-cli/src/main.rs` (funkcje `run`, `replay`, usunąć `apply` i `on_hook`)

**Interfaces:**
- Consumes: `Ingest::start`, `Endpoint`, `watch`, `Sources`, `TaskTracker`, `claude::hook::{transcript_path, to_events}`, `claude::registry::read_registry`, `rehydrate::{recent_files, keep_for_rehydration}`, `pid::is_alive`, `Store`.
- Produces:
  - `pets_core::runtime::RuntimeConfig { home: PathBuf, endpoint_path: PathBuf, record: Option<File> }` oraz `RuntimeConfig::from_env() -> anyhow::Result<RuntimeConfig>`;
  - `pets_core::runtime::Runtime::start(cfg) -> anyhow::Result<Runtime>`, `step(&mut self, now: i64) -> bool`, `store(&self) -> &Store`;
  - `pets_core::replay::Replay::new(Vec<Event>, speed: f64)`, `load(&Path, speed) -> anyhow::Result<Replay>`, `next_delay_ms(&self) -> Option<u64>`, `apply_next(&mut self, &mut Store) -> Option<i64>`, `clock(&self) -> i64`, `is_empty(&self) -> bool`.

- [ ] **Step 1: Napisz testy `Replay`** (na końcu nowego pliku `crates/pets-core/src/replay.rs`)

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::{Kind, Source};

    fn ev(id: &str, kind: Kind, ts: i64) -> Event { Event::new(Source::Claude, id, kind, ts) }

    #[test]
    fn delays_are_scaled_capped_and_never_negative() {
        let mut r = Replay::new(vec![
            ev("a", Kind::SessionStart, 0),
            ev("a", Kind::Prompt, 10_000),
            ev("b", Kind::SessionStart, 5_000),
            ev("a", Kind::TurnEnd, 12_000),
        ], 10.0);
        let mut store = Store::new(Timing::default());
        assert_eq!(r.next_delay_ms(), Some(0));
        assert_eq!(r.apply_next(&mut store), Some(0));
        assert_eq!(r.next_delay_ms(), Some(250)); // 10 s / 10 = 1000 ms, przycięte do 250
        assert_eq!(r.apply_next(&mut store), Some(10_000));
        assert_eq!(r.next_delay_ms(), Some(0)); // starsze zdarzenie nie cofa zegara
        assert_eq!(r.apply_next(&mut store), Some(10_000));
        assert_eq!(r.next_delay_ms(), Some(200));
        assert_eq!(r.apply_next(&mut store), Some(12_000));
        assert!(r.is_empty());
        assert_eq!(r.next_delay_ms(), None);
        assert!(store.session("a").is_some() && store.session("b").is_some());
    }

    #[test]
    fn non_positive_speed_falls_back_to_real_time() {
        let r = Replay::new(vec![ev("a", Kind::SessionStart, 0), ev("a", Kind::Prompt, 100)], 0.0);
        let mut r = r;
        let mut s = Store::new(Timing::default());
        r.apply_next(&mut s);
        assert_eq!(r.next_delay_ms(), Some(100));
    }
}
```

- [ ] **Step 2: Implementuj `Replay`** (góra pliku `replay.rs`)

```rust
//! Odtwarzanie nagranych zdarzeń: zegar idzie tylko do przodu, a pojedyncza przerwa trwa najwyżej 250 ms,
//! żeby długie ciche okresy w nagraniu nie blokowały odtwarzania.
use crate::model::Event;
use crate::store::{Store, Timing};
use std::collections::VecDeque;
use std::io::BufRead;
use std::path::Path;

pub struct Replay {
    events: VecDeque<Event>,
    clock: i64,
    speed: f64,
}

impl Replay {
    pub const MAX_GAP_MS: u64 = 250;

    pub fn new(events: Vec<Event>, speed: f64) -> Replay {
        let clock = events.first().map(|e| e.ts).unwrap_or(0);
        Replay { events: events.into(), clock, speed: if speed > 0.0 { speed } else { 1.0 } }
    }

    pub fn load(path: &Path, speed: f64) -> anyhow::Result<Replay> {
        let events = std::io::BufReader::new(std::fs::File::open(path)?).lines()
            .map_while(Result::ok).filter_map(|l| serde_json::from_str(&l).ok()).collect();
        Ok(Replay::new(events, speed))
    }

    pub fn clock(&self) -> i64 { self.clock }
    pub fn is_empty(&self) -> bool { self.events.is_empty() }

    /// Ile milisekund czasu rzeczywistego odczekać przed następnym zdarzeniem.
    pub fn next_delay_ms(&self) -> Option<u64> {
        let e = self.events.front()?;
        let gap = (e.ts - self.clock).max(0);
        Some(((gap as f64 / self.speed) as u64).min(Self::MAX_GAP_MS))
    }

    /// Stosuje następne zdarzenie i przesuwa zegar `Store`. Zwraca zegar po zdarzeniu.
    pub fn apply_next(&mut self, store: &mut Store) -> Option<i64> {
        let e = self.events.pop_front()?;
        self.clock = self.clock.max(e.ts);
        store.apply(&e);
        store.tick(self.clock, &|_| true);
        Some(self.clock)
    }
}
```

W testach `Timing` jest już zaimportowany przez `use super::*`. Poza testami import `Timing` nie jest potrzebny: usuń go z `use crate::store::{Store, Timing};`, jeśli kompilator zgłosi nieużywany import.

- [ ] **Step 3: Napisz testy `Runtime`** (na końcu nowego pliku `crates/pets-core/src/runtime.rs`)

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::{Agent, Origin};
    use std::time::Instant;

    fn home() -> tempfile::TempDir {
        let d = tempfile::tempdir().unwrap();
        for p in [".claude/projects", ".claude/sessions", ".codex/sessions/2026/09/24"] {
            std::fs::create_dir_all(d.path().join(p)).unwrap();
        }
        d
    }

    fn cfg(h: &tempfile::TempDir) -> RuntimeConfig {
        RuntimeConfig { home: h.path().into(), endpoint_path: h.path().join("endpoint.json"), record: None }
    }

    #[test]
    fn rehydrates_recent_codex_rollouts() {
        let h = home();
        let fixture = concat!(env!("CARGO_MANIFEST_DIR"), "/tests/fixtures/codex/router-task.jsonl");
        std::fs::copy(fixture, h.path().join(".codex/sessions/2026/09/24/rollout-test.jsonl")).unwrap();
        let rt = Runtime::start(cfg(&h)).unwrap();
        assert!(rt.store().sessions().iter().any(|s| s.agent == Agent::Codex && s.origin == Origin::Router));
    }

    #[test]
    fn hook_posted_to_endpoint_reaches_store() {
        let h = home();
        let mut rt = Runtime::start(cfg(&h)).unwrap();
        let ep = Endpoint::read(&h.path().join("endpoint.json")).unwrap();
        let body = serde_json::json!({"ts": crate::time::now_ms(), "ppid": null, "payload": {
            "hook_event_name": "UserPromptSubmit", "session_id": "hook-s1", "cwd": "C:\\work\\demo", "prompt": "x"}});
        let status = ureq::post(&format!("http://127.0.0.1:{}/v1/events/claude", ep.port))
            .set("Authorization", &format!("Bearer {}", ep.token))
            .send_string(&body.to_string()).unwrap().status();
        assert_eq!(status, 204);
        let t0 = Instant::now();
        while rt.store().session("hook-s1").is_none() && t0.elapsed() < Duration::from_secs(3) {
            rt.step(crate::time::now_ms());
            std::thread::sleep(Duration::from_millis(20));
        }
        assert!(rt.store().session("hook-s1").is_some());
    }
}
```

- [ ] **Step 4: Uruchom testy i sprawdź, że się nie kompilują**

Run: `cargo test -p pets-core replay` (najpierw dopisz `pub mod replay; pub mod runtime;` w `lib.rs`)
Expected: błąd kompilacji, bo brakuje `Runtime` i `RuntimeConfig`.

- [ ] **Step 5: Implementuj `Runtime`** (góra pliku `runtime.rs`)

```rust
//! Rdzeń danych na żywo: ingest hooków, obserwacja plików, odtworzenie stanu po starcie i zegar.
use crate::claude::{self, hook::TaskTracker, HookEnvelope};
use crate::endpoint::Endpoint;
use crate::ingest::{Incoming, Ingest};
use crate::model::Event;
use crate::pid;
use crate::rehydrate::{keep_for_rehydration, recent_files};
use crate::store::{Store, Timing};
use crate::watch::{watch, Sources};
use anyhow::Context as _;
use std::fs::File;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::mpsc::{channel, Receiver};
use std::time::Duration;

pub struct RuntimeConfig {
    pub home: PathBuf,
    pub endpoint_path: PathBuf,
    /// Opcjonalny zapis znormalizowanych zdarzeń (JSONL), jak `pets-cli run --record`.
    pub record: Option<File>,
}

impl RuntimeConfig {
    pub fn from_env() -> anyhow::Result<Self> {
        Ok(RuntimeConfig {
            home: dirs::home_dir().context("brak katalogu domowego")?,
            endpoint_path: Endpoint::default_path(),
            record: None,
        })
    }
}

pub struct Runtime {
    store: Store,
    sources: Sources,
    tasks: TaskTracker,
    record: Option<File>,
    hooks: Receiver<Incoming>,
    files: Option<Receiver<PathBuf>>,
    _ingest: Ingest,
    _watcher: Option<notify::RecommendedWatcher>,
}

impl Runtime {
    pub fn start(cfg: RuntimeConfig) -> anyhow::Result<Runtime> {
        let (tx, hooks) = channel();
        let ingest = Ingest::start(Endpoint::new_token(), tx)?;
        ingest.endpoint().write(&cfg.endpoint_path).context("zapis endpoint.json")?;
        let mut rt = Runtime {
            store: Store::new(Timing::default()), sources: Sources::new(), tasks: TaskTracker::default(),
            record: cfg.record, hooks, files: None, _ingest: ingest, _watcher: None,
        };
        let roots = [cfg.home.join(".claude").join("projects"), cfg.home.join(".codex").join("sessions")];
        // Odtworzenie stanu: żywe sesje Claude'a z rejestru, potem ich transkrypty i rollouty Codexa.
        let live: Vec<_> = claude::registry::read_registry(&cfg.home.join(".claude").join("sessions"))
            .into_iter().filter(|s| pid::is_alive(s.pid)).collect();
        for s in &live { rt.apply(s.to_event()); }
        let live_ids = live.iter().map(|s| s.session_id.clone()).collect();
        let recent: Vec<PathBuf> = roots.iter().flat_map(|r| recent_files(r, Duration::from_secs(1800))).collect();
        for f in keep_for_rehydration(&recent, &live_ids) { rt.poll_file(&f); }
        let (ftx, files) = channel();
        rt._watcher = Some(watch(&roots, ftx)?);
        rt.files = Some(files);
        Ok(rt)
    }

    pub fn store(&self) -> &Store { &self.store }

    /// Przetwarza zaległe zdarzenia i przesuwa zegar. Zwraca `true`, gdy stan się zmienił.
    pub fn step(&mut self, now: i64) -> bool {
        let mut changed = false;
        while let Ok(Incoming::ClaudeHook(env)) = self.hooks.try_recv() { changed |= self.on_hook(env); }
        let paths: Vec<PathBuf> = self.files.as_ref().map(|rx| rx.try_iter().collect()).unwrap_or_default();
        for p in paths { changed |= self.poll_file(&p); }
        changed |= !self.store.tick(now, &pid::is_alive).is_empty();
        changed
    }

    fn apply(&mut self, e: Event) -> bool {
        if let Some(f) = &mut self.record { let _ = writeln!(f, "{}", serde_json::to_string(&e).unwrap_or_default()); }
        !self.store.apply(&e).is_empty()
    }

    fn poll_file(&mut self, p: &Path) -> bool {
        let mut changed = false;
        if self.sources.track(p, true) { for e in self.sources.poll(p) { changed |= self.apply(e); } }
        changed
    }

    fn on_hook(&mut self, env: HookEnvelope) -> bool {
        let mut changed = false;
        if let Some(tp) = claude::hook::transcript_path(&env) { changed |= self.poll_file(&tp); }
        for e in claude::hook::to_events(&env) { changed |= self.apply(e); }
        if let Some(e) = self.tasks.observe(&env) { changed |= self.apply(e); }
        changed
    }
}
```

`notify` jest już zależnością `pets-core`, więc `notify::RecommendedWatcher` jest dostępny.

- [ ] **Step 6: Uruchom testy nowych modułów**

Run: `cargo test -p pets-core runtime` i `cargo test -p pets-core replay`
Expected: 2 + 2 testy PASS.

- [ ] **Step 7: Przepnij `pets-cli` na `Runtime` i `Replay`**

W `crates/pets-cli/src/main.rs` usuń funkcje `apply` i `on_hook` oraz niepotrzebne importy. Zastąp `run` i `replay`:

```rust
use pets_core::replay::Replay;
use pets_core::runtime::{Runtime, RuntimeConfig};
use pets_core::store::{Store, Timing};
use pets_core::{hooks_install, time};

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
```

Zostaw `use std::io::Write;` (potrzebny do `flush`). `BufRead`, `channel`, `Incoming`, `Ingest`, `Endpoint`, `claude`, `TaskTracker`, `rehydrate`, `watch`, `pid` oraz `Event` usuń, jeśli kompilator zgłosi je jako nieużywane. `anyhow::Context` zostaje, bo używa go `claude_settings`.

- [ ] **Step 8: Pełna weryfikacja**

Run: `cargo test --workspace`, a potem `cargo build --release -p pets-cli` i ręcznie `.\target\release\pets-cli.exe replay crates\pets-cli\tests\data\sample.jsonl --speed 4`
Expected:
- wszystkie testy PASS (72 dotychczasowe + 4 nowe);
- replay pokazuje sesję `Demo` przechodzącą przez `thinking`, `working:edit` i `done`.

- [ ] **Step 9: Commit**

```bash
git add crates/pets-core/src/runtime.rs crates/pets-core/src/replay.rs crates/pets-core/src/lib.rs crates/pets-cli/src/main.rs
git commit -m "refactor(core): Runtime and Replay shared by pets-cli and the app"
```

---

### Task 2: Szkielet aplikacji Tauri z wątkiem rdzenia

Aplikacja `agent-pets` startuje i otwiera zwykłe, pływające okno sceny (bez osadzania, to task 7). Pokazuje w nim liczbę sesji z prawdziwej migawki. Działa tryb odtwarzania z pliku.

**Files:**
- Modify: `Cargo.toml` (członek `app/src-tauri`), `.gitignore`
- Create: `app/package.json`, `app/tsconfig.json`, `app/vite.config.ts`, `app/index.html`, `app/src/main.ts`, `app/src/types.ts`
- Create: `app/src-tauri/Cargo.toml`, `build.rs`, `tauri.conf.json`, `capabilities/default.json`, `icons/` (kopia ze spike'a), `src/main.rs`, `src/lib.rs`, `src/core.rs`
- Create: `app/demo/many-sessions.jsonl`

**Interfaces:**
- Consumes: `Runtime`, `RuntimeConfig`, `Replay` (task 1), `Store::sessions()`, `Store::limits()`.
- Produces:
  - Rust: `core::Snapshot { sessions: Vec<Session>, limits: Vec<Limit>, now: i64 }` (Serialize), `core::Shared = Arc<Mutex<Snapshot>>`, `core::snapshot_of(&Store, i64) -> Snapshot`, `core::Mode::{Live, Replay{path, speed}}`, `core::Mode::from_env()`, `core::spawn(AppHandle, Shared, Mode)`;
  - komenda `snapshot`; zdarzenie `pets://snapshot`;
  - zmienne środowiskowe `AGENT_PETS_REPLAY` (ścieżka) i `AGENT_PETS_REPLAY_SPEED` (domyślnie 1);
  - TS: typy z `app/src/types.ts` (niżej).

- [ ] **Step 1: Workspace i `.gitignore`**

W `Cargo.toml` zmień listę członków:

```toml
members = ["crates/pets-core", "crates/pets-hook", "crates/pets-cli", "app/src-tauri"]
```

Dopisz do `.gitignore`:

```
app/node_modules
app/dist
app/src-tauri/gen
```

- [ ] **Step 2: Projekt frontendu**

```powershell
mkdir app; cd app
pnpm init
pnpm add @tauri-apps/api@^2
pnpm add -D @tauri-apps/cli@^2 vite typescript vitest @types/node
```

Zastąp pola `scripts` i `type` w `app/package.json`:

```json
{
  "name": "agent-pets-app",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc --noEmit && vite build",
    "test": "vitest run",
    "typecheck": "tsc --noEmit",
    "tauri": "tauri"
  }
}
```

Sekcje `dependencies` i `devDependencies` zostają takie, jakie zapisał `pnpm add`.

`app/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "useDefineForClassFields": true,
    "module": "ESNext",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "types": ["node", "vite/client"],
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true
  },
  "include": ["src", "vite.config.ts"]
}
```

`app/vite.config.ts`:

```ts
/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

const page = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  clearScreen: false,
  server: { port: 1420, strictPort: true, watch: { ignored: ['**/src-tauri/**'] } },
  build: { rollupOptions: { input: { stage: page('index.html') } } },
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
});
```

Taski 8 i 9 dopiszą do `input` strony `dev` i `tooltip`.

- [ ] **Step 3: Typy lustrzane `app/src/types.ts`**

```ts
// Lustro modelu z crates/pets-core/src/model.rs (serde: snake_case, Option → null).
export type Agent = 'claude' | 'codex';
export type Origin = 'cli' | 'desktop' | 'router';
export type State = 'thinking' | 'working' | 'needs_you' | 'done' | 'error' | 'idle' | 'sleep' | 'compacting' | 'ended';
export type Tool = 'edit' | 'bash' | 'read' | 'grep' | 'web' | 'agent' | 'mcp' | 'other';

export interface Progress { done: number; total: number }
export interface Context { used: number; max: number }

export interface Session {
  id: string;
  agent: Agent;
  origin: Origin;
  title: string;
  cwd: string;
  state: State;
  tool: Tool | null;
  progress: Progress | null;
  context: Context | null;
  started_at: number;
  last_activity: number;
  state_since: number;
  turn_started_at: number | null;
  jump: { pid: number | null; session_id: string; cwd: string; app: string | null };
}

export interface Limit { agent: Agent; window: 'five_hour' | 'weekly'; used_pct: number; resets_at: number | null }
export interface Snapshot { sessions: Session[]; limits: Limit[]; now: number }
export interface StageLayout { max_css: number; height_css: number; scale: number }
export type PointerMsg =
  | { kind: 'move'; x: number; y: number }
  | { kind: 'leave' }
  | { kind: 'click'; x: number; y: number }
  | { kind: 'context'; x: number; y: number };
export interface TooltipContent { title: string; subtitle: string; lines: string[] }
```

- [ ] **Step 4: Strona tymczasowa** (task 8 zastąpi `main.ts`)

`app/index.html`:

```html
<!doctype html>
<html lang="pl">
<head>
<meta charset="utf-8" />
<title>agent-pets-stage</title>
<style>
html,body{margin:0;padding:0;background:transparent;overflow:hidden;width:100%;height:100%;
  font-family:"Segoe UI Variable Text","Segoe UI",system-ui,sans-serif}
canvas{display:block;width:100%;height:100%}
#info{color:#D97757;font-size:12px;padding:14px 8px}
</style>
</head>
<body>
<canvas id="stage" hidden></canvas>
<div id="info"></div>
<script type="module" src="/src/main.ts"></script>
</body>
</html>
```

`app/src/main.ts`:

```ts
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import type { Snapshot } from './types';

const info = document.getElementById('info')!;
const show = (s: Snapshot) => { info.textContent = `Agent Pets: ${s.sessions.length} sesji, ${s.limits.length} limitów`; };
void listen<Snapshot>('pets://snapshot', e => show(e.payload)).then(() => invoke<Snapshot>('snapshot').then(show));
```

- [ ] **Step 5: Crate `app/src-tauri`**

Skopiuj ikony: `Copy-Item -Recurse spikes\taskbar-embed\src-tauri\icons app\src-tauri\icons`.

`app/src-tauri/Cargo.toml`:

```toml
[package]
name = "agent-pets"
edition.workspace = true
version.workspace = true

[lib]
name = "agent_pets_lib"

[build-dependencies]
tauri-build = { version = "2", features = [] }

[dependencies]
pets-core = { path = "../../crates/pets-core" }
tauri = { version = "2.11", features = ["tray-icon"] }
serde.workspace = true
serde_json.workspace = true
anyhow.workspace = true

[target.'cfg(windows)'.dependencies]
windows = { version = "0.61", features = [
  "Win32_Foundation", "Win32_Graphics_Gdi", "Win32_UI_WindowsAndMessaging", "Win32_UI_HiDpi",
  "Win32_UI_Input_KeyboardAndMouse", "Win32_UI_Accessibility", "Win32_System_Com",
  "Win32_System_Ole", "Win32_System_Variant", "Win32_UI_Shell",
] }
```

`app/src-tauri/build.rs`:

```rust
fn main() {
    tauri_build::build()
}
```

`app/src-tauri/tauri.conf.json`:

```json
{
  "$schema": "https://schema.tauri.app/config/2",
  "productName": "Agent Pets",
  "version": "0.1.0",
  "identifier": "dev.agentpets.app",
  "build": {
    "beforeDevCommand": "pnpm dev",
    "devUrl": "http://localhost:1420",
    "beforeBuildCommand": "pnpm build",
    "frontendDist": "../dist"
  },
  "app": { "withGlobalTauri": false, "windows": [], "security": { "csp": null } },
  "bundle": { "active": false, "icon": ["icons/32x32.png", "icons/128x128.png", "icons/icon.ico"] }
}
```

`app/src-tauri/capabilities/default.json`:

```json
{
  "$schema": "../gen/schemas/desktop-schema.json",
  "identifier": "default",
  "description": "Scena i tooltip",
  "windows": ["stage*", "tooltip"],
  "permissions": ["core:default"]
}
```

`app/src-tauri/src/main.rs`:

```rust
// Bez okna konsoli w wydaniu.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    agent_pets_lib::run()
}
```

- [ ] **Step 6: Test migawki** (na końcu `app/src-tauri/src/core.rs`)

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use pets_core::model::*;

    #[test]
    fn snapshot_serializes_like_the_ts_types() {
        let mut store = Store::new(Timing::default());
        let mut e = Event::new(Source::Claude, "s1", Kind::ToolStart, 1_000);
        e.tool = Some(Tool::Edit);
        e.data.progress = Some(Progress { done: 1, total: 4 });
        store.apply(&e);
        let v = serde_json::to_value(snapshot_of(&store, 2_000)).unwrap();
        assert_eq!(v["now"], 2_000);
        let s = &v["sessions"][0];
        assert_eq!(s["state"], "working");
        assert_eq!(s["tool"], "edit");
        assert_eq!(s["progress"]["total"], 4);
        assert_eq!(s["started_at"], 1_000);
        assert!(s["context"].is_null());
        assert!(v["limits"].as_array().unwrap().is_empty());
    }
}
```

- [ ] **Step 7: Implementuj `core.rs`** (góra pliku)

```rust
//! Wątek rdzenia: zdarzenia z `pets-core` → migawka stanu dla UI (`pets://snapshot`).
use pets_core::model::{Limit, Session};
use pets_core::replay::Replay;
use pets_core::runtime::{Runtime, RuntimeConfig};
use pets_core::store::{Store, Timing};
use pets_core::time::now_ms;
use serde::Serialize;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter};

#[derive(Serialize, Clone, Default, Debug, PartialEq)]
pub struct Snapshot {
    pub sessions: Vec<Session>,
    pub limits: Vec<Limit>,
    /// zegar rdzenia (ms); w trybie odtwarzania różni się od zegara ściennego
    pub now: i64,
}

pub type Shared = Arc<Mutex<Snapshot>>;

pub fn snapshot_of(store: &Store, now: i64) -> Snapshot {
    Snapshot { sessions: store.sessions().into_iter().cloned().collect(), limits: store.limits().to_vec(), now }
}

pub enum Mode { Live, Replay { path: PathBuf, speed: f64 } }

impl Mode {
    pub fn from_env() -> Mode {
        match std::env::var_os("AGENT_PETS_REPLAY") {
            Some(p) => Mode::Replay {
                path: p.into(),
                speed: std::env::var("AGENT_PETS_REPLAY_SPEED").ok().and_then(|s| s.parse().ok()).unwrap_or(1.0),
            },
            None => Mode::Live,
        }
    }
}

pub fn spawn(app: AppHandle, shared: Shared, mode: Mode) {
    std::thread::spawn(move || {
        let publish = |store: &Store, now: i64| {
            let s = snapshot_of(store, now);
            *shared.lock().unwrap() = s.clone();
            let _ = app.emit("pets://snapshot", s);
        };
        let result = match mode {
            Mode::Live => live(&publish),
            Mode::Replay { path, speed } => replay(&path, speed, &publish),
        };
        if let Err(e) = result { eprintln!("agent-pets: rdzeń danych zatrzymany: {e:#}"); }
    });
}

fn live(publish: &dyn Fn(&Store, i64)) -> anyhow::Result<()> {
    let mut rt = Runtime::start(RuntimeConfig::from_env()?)?;
    publish(rt.store(), now_ms());
    loop {
        let now = now_ms();
        if rt.step(now) { publish(rt.store(), now); }
        std::thread::sleep(Duration::from_millis(250));
    }
}

fn replay(path: &Path, speed: f64, publish: &dyn Fn(&Store, i64)) -> anyhow::Result<()> {
    let mut rp = Replay::load(path, speed)?;
    let mut store = Store::new(Timing::default());
    while let Some(d) = rp.next_delay_ms() {
        std::thread::sleep(Duration::from_millis(d));
        if let Some(clock) = rp.apply_next(&mut store) { publish(&store, clock); }
    }
    // Po nagraniu zegar płynie dalej w czasie rzeczywistym, więc działają progi (done → idle itd.).
    let end = Instant::now();
    loop {
        std::thread::sleep(Duration::from_millis(250));
        let now = rp.clock() + end.elapsed().as_millis() as i64;
        if !store.tick(now, &|_| true).is_empty() { publish(&store, now); }
    }
}
```

- [ ] **Step 8: `lib.rs`** (task 7 zastąpi tymczasowe okno powłoką)

```rust
mod core;

use tauri::{Manager, RunEvent, WebviewUrl, WebviewWindowBuilder};

#[tauri::command]
fn snapshot(state: tauri::State<core::Shared>) -> core::Snapshot {
    state.lock().unwrap().clone()
}

pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let shared: core::Shared = Default::default();
            app.manage(shared.clone());
            // Tymczasowe pływające okno sceny; osadzenie w pasku przychodzi w tasku 7.
            WebviewWindowBuilder::new(app, "stage0", WebviewUrl::App("index.html".into()))
                .title("agent-pets-stage").inner_size(400.0, 48.0).decorations(false)
                .transparent(true).always_on_top(true).skip_taskbar(true).resizable(false).shadow(false)
                .build()?;
            core::spawn(app.handle().clone(), shared, core::Mode::from_env());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![snapshot])
        .build(tauri::generate_context!())
        .expect("nie udało się zbudować aplikacji Tauri")
        .run(|_app, event| {
            // Okno sceny ginie razem z paskiem przy restarcie Explorera; aplikacja ma wtedy żyć dalej.
            if let RunEvent::ExitRequested { api, code, .. } = event {
                if code.is_none() { api.prevent_exit(); }
            }
        });
}
```

- [ ] **Step 9: Nagranie pokazowe `app/demo/many-sessions.jsonl`**

Siedem sesji w różnych stanach plus limity. Zdarzenia jednej sesji są oddalone o ≥ 700 ms, żeby minimalny czas stanu (600 ms) nie opóźniał przejść.

```
{"source":"claude","session_id":"d1","kind":"session_start","ts":1000000,"data":{"title":"Refaktor parsera rolloutów","cwd":"C:\\work\\parser","origin":"cli"}}
{"source":"claude","session_id":"d1","kind":"prompt","ts":1000700,"data":{"context":{"used":84000,"max":200000}}}
{"source":"claude","session_id":"d1","kind":"tool_start","tool":"edit","ts":1001400,"data":{"progress":{"done":2,"total":5}}}
{"source":"codex","session_id":"d2","kind":"session_start","ts":1002100,"data":{"title":"Migracja testów na vitest","cwd":"C:\\work\\tests","origin":"desktop"}}
{"source":"codex","session_id":"d2","kind":"prompt","ts":1002800,"data":{}}
{"source":"codex","session_id":"d2","kind":"tool_start","tool":"bash","ts":1003500,"data":{}}
{"source":"claude","session_id":"d3","kind":"session_start","ts":1004200,"data":{"title":"Research: UI Automation w pasku","cwd":"C:\\work\\uia","origin":"desktop"}}
{"source":"claude","session_id":"d3","kind":"prompt","ts":1004900,"data":{}}
{"source":"claude","session_id":"d3","kind":"tool_start","tool":"web","ts":1005600,"data":{}}
{"source":"codex","session_id":"d4","kind":"session_start","ts":1006300,"data":{"title":"Zadanie routera: lint","cwd":"C:\\work\\lint","origin":"router"}}
{"source":"codex","session_id":"d4","kind":"prompt","ts":1007000,"data":{}}
{"source":"codex","session_id":"d4","kind":"tool_start","tool":"mcp","ts":1007700,"data":{"progress":{"done":1,"total":3}}}
{"source":"claude","session_id":"d5","kind":"session_start","ts":1008400,"data":{"title":"Poprawka hooków","cwd":"C:\\work\\hooks","origin":"cli"}}
{"source":"claude","session_id":"d5","kind":"prompt","ts":1009100,"data":{}}
{"source":"claude","session_id":"d5","kind":"needs_input","ts":1009800,"data":{}}
{"source":"codex","session_id":"d6","kind":"session_start","ts":1010500,"data":{"title":"Build release","cwd":"C:\\work\\build","origin":"cli"}}
{"source":"codex","session_id":"d6","kind":"prompt","ts":1011200,"data":{}}
{"source":"codex","session_id":"d6","kind":"error","ts":1011900,"data":{}}
{"source":"claude","session_id":"d7","kind":"session_start","ts":1012600,"data":{"title":"Dokumentacja README","cwd":"C:\\work\\docs","origin":"cli"}}
{"source":"claude","session_id":"d7","kind":"prompt","ts":1013300,"data":{}}
{"source":"claude","session_id":"d7","kind":"tool_start","tool":"read","ts":1014000,"data":{}}
{"source":"claude","session_id":"d7","kind":"turn_end","ts":1014700,"data":{}}
{"source":"codex","session_id":"limits","kind":"limits","ts":1015000,"data":{"limits":[{"agent":"codex","window":"five_hour","used_pct":12.0,"resets_at":1019000000},{"agent":"codex","window":"weekly","used_pct":91.0,"resets_at":1400000000},{"agent":"claude","window":"five_hour","used_pct":34.0,"resets_at":1016000000},{"agent":"claude","window":"weekly","used_pct":61.0,"resets_at":1300000000}]}}
```

Dopisz test w `core.rs` (moduł `tests`), który pilnuje, że nagranie wciąż się parsuje i daje 7 sesji:

```rust
    #[test]
    fn demo_recording_yields_seven_sessions_and_limits() {
        let path = concat!(env!("CARGO_MANIFEST_DIR"), "/../demo/many-sessions.jsonl");
        let mut rp = Replay::load(Path::new(path), 1000.0).unwrap();
        let mut store = Store::new(Timing::default());
        while rp.apply_next(&mut store).is_some() {}
        let snap = snapshot_of(&store, rp.clock());
        assert_eq!(snap.sessions.len(), 7);
        assert_eq!(snap.limits.len(), 4);
        let state = |id: &str| store.session(id).map(|s| s.state);
        assert_eq!(state("d5"), Some(State::NeedsYou));
        assert_eq!(state("d6"), Some(State::Error));
        assert_eq!(state("d7"), Some(State::Done));
    }
```

- [ ] **Step 10: Weryfikacja**

Run z katalogu głównego: `cargo test --workspace`
Expected: PASS, w tym 2 nowe testy w `agent-pets`.

Jeśli kompilacja zgłosi brak `../dist` (`frontendDist`): uruchom raz `pnpm --dir app build`. Potem dopisz do README w sekcji Setup krok `pnpm --dir app install; pnpm --dir app build` przed `cargo test --workspace`.

Run: `cd app; pnpm test; pnpm typecheck`
Expected: vitest „No test files found” (z kodem 0: dodaj `--passWithNoTests` do skryptu `test`, jeśli vitest kończy się kodem 1), typecheck bez błędów.

Ręcznie, z `app/`: `$env:AGENT_PETS_REPLAY="$PWD\demo\many-sessions.jsonl"; pnpm tauri dev`
Expected: pływające okienko z napisem, który w ciągu ok. 6 s dochodzi do „Agent Pets: 7 sesji, 4 limitów”. Potem bez zmiennej (`Remove-Item Env:AGENT_PETS_REPLAY`): liczba żywych sesji, zgodna z `pets-cli run` uruchomionym osobno. Zamknij okno przez Ctrl+C w terminalu.

- [ ] **Step 11: Commit**

```bash
git add Cargo.toml Cargo.lock .gitignore app
git commit -m "feat(app): Tauri app skeleton with core thread, snapshots and replay mode"
```

---

### Task 3: Port renderera, część 1 — silnik akcji i sprężyn

Przeniesienie logiki kroku z `prototype/pets.js` do modułów TS 1:1. Kryterium akceptacji to identyczne wartości sprężyn i nazwy akcji w prototypie i porcie po 240 klatkach, dla każdej sceny i skórki, przy tym samym ziarnie losowości.

**Delegacja:** dobry kandydat dla Codexa (`sol`, `isolation: "worktree"`): mechaniczny port z obiektywnym testem. W `task` przekaż cały ten task, ścieżki absolutne i kryterium „`pnpm test` w `app/` przechodzi, test zgodności niezmieniony”. W `scope` zakaż zmian w `prototype/` i w teście zgodności.

**Files:**
- Create: `app/src/renderer/rng.ts`, `math.ts`, `pose.ts`, `fold.ts`, `scenes.ts`, `pet.ts`, `index.ts`, `testing.ts`, `parity.test.ts`

**Interfaces:**
- Consumes: `prototype/pets.js` (tylko odczyt, w teście).
- Produces:
  - `rng.ts`: `rng(): number`, `setRng(f: () => number): void`;
  - `math.ts`: `PI, TAU, cl, ease, eOut, kf, hr, lerpC`;
  - `pose.ts`: `K: string[]`, `DEF`, `SPR`;
  - `fold.ts`: `FOLD`, `foldHW`, `morph`;
  - `scenes.ts`: `SCENES` (prototyp `S`), `type Scene`, `type Act`, `pend`, `burst`, `pagePos`, `BOLT`, `WL`, `NETKF`;
  - `pet.ts`: `interface Pet`, `createPet(type: SkinId, scene: string): Pet` (prototyp `mkC`), `setScene(c, scene, instant?)` (`setSt`), `stepPet(c, dt, t)` (`stepC`), `startAct`, `nextAct`, `targets`;
  - `testing.ts`: `seeded(seed)`, `recorder()`, `loadPrototype(rng)`.

**Zasady portu (obowiązują też w tasku 4):**
1. **Mapa przeniesienia** (linie `prototype/pets.js`):

   | Linie | Zawartość | Plik |
   |---|---|---|
   | 5 | `PI, TAU, cl, ease, eOut` | `math.ts` |
   | 15 | `kf` | `math.ts` |
   | 97 | `hr` | `math.ts` |
   | 108 | `lerpC` | `math.ts` |
   | 7–9 | `K, DEF, SPR` | `pose.ts` |
   | 14 | `pend` | `scenes.ts` |
   | 16–25 | `dance, HIP, kb, TYPE, REST, SHEET, NETKF, pagePos, BOLT, WL, wrenchAng` | `scenes.ts` |
   | 26–70 | `S` → `SCENES` | `scenes.ts` |
   | 71 | `burst` | `scenes.ts` |
   | 126–128 | `FOLD, foldHW, morph` | `fold.ts` |
   | 72–96 | `mkC, startAct, setSt, nextAct, targets, slot, stepC` | `pet.ts` |

2. **Nazwy:** zachowaj nazwy i kolejność wyrażeń bez zmian (także kolejność operacji arytmetycznych), bo test porównuje liczby. Zmieniają się tylko nazwy publiczne:

   | Prototyp | Port |
   |---|---|
   | `mkC` | `createPet` |
   | `setSt` | `setScene` |
   | `stepC` | `stepPet` |
   | `S` | `SCENES` |

3. **Losowość:** każde `Math.random()` zastąp `rng()` z `rng.ts`. Kolejność wywołań musi zostać ta sama.
4. **Warunki skórki w silniku:**
   - `c.type==='kodek'` w `stepC` (antena) zostaje w tasku 3 jako `c.type==='kodek'`;
   - w tasku 4 zamieniasz go na `SKINS[c.type].antenna`.
5. **Typy:**
   - `Pet` ma pola prototypu `c` plus `alpha?: number` (task 5);
   - cele akcji to `Record<string, any>`;
   - `Act = [name: string, dur: number, fn: (a: number, c: Pet, t: number) => Record<string, any> | undefined, onStart?: (c: Pet) => void, onEnd?: (c: Pet) => void]`;
   - `Scene = { base: Record<string, any>; acts: Act[]; seq?: Act[]; cycle?: number }`;
   - dozwolone jawne `any` tam, gdzie prototyp jest dynamiczny.
6. **Kod bez UI:** kodu demo (linie 223–246: `big`, `mini`, przyciski, `frame`, tryb `strip`) nie przenosimy.

- [ ] **Step 1: Narzędzia testowe `app/src/renderer/testing.ts`**

```ts
// Narzędzia tylko dla testów: deterministyczna losowość, nagrywający kontekst 2D i loader prototypu v6.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

/** LCG z trybu filmstrip prototypu (`prototype/pets.js`, linia 245). */
export function seeded(seed: number) {
  let s = seed;
  return {
    next: () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; },
    reset: (v: number) => { s = v; },
  };
}

/** Kontekst 2D, który zapisuje każde wywołanie i przypisanie (liczby zaokrąglone do 0,001). */
export function recorder() {
  const log: string[] = [];
  const props: Record<string, unknown> = {
    globalAlpha: 1, lineWidth: 1, fillStyle: '#000', strokeStyle: '#000', font: '10px x',
    textAlign: 'start', textBaseline: 'alphabetic', lineCap: 'butt', lineJoin: 'miter',
  };
  const r = (v: unknown) => (typeof v === 'number' ? String(Math.round(v * 1000) / 1000) : String(v));
  const ctx = new Proxy({} as Record<string, unknown>, {
    get: (_t, k: string) => {
      if (k in props) return props[k];
      if (k === 'measureText') return () => ({ width: 1 });
      return (...a: unknown[]) => { log.push(`${k}(${a.map(r).join(',')})`); };
    },
    set: (_t, k: string, v) => { props[k] = v; log.push(`${k}=${r(v)}`); return true; },
  });
  return { ctx: ctx as unknown as CanvasRenderingContext2D, log };
}

export interface ProtoApi {
  S: Record<string, unknown>;
  mkC(type: string, st: string): any;
  stepC(c: any, dt: number, t: number): void;
  drawC(x: CanvasRenderingContext2D, c: any, X: number, Y: number, u: number, t: number): void;
  setSK(v: boolean): void;
  setBoil(v: number): void;
}

const PROTO = fileURLToPath(new URL('../../../prototype/pets.js', import.meta.url));

/** Ładuje prototyp v6 w piaskownicy `vm` z atrapami DOM; `Math.random` pochodzi z `rng`. */
export function loadPrototype(rng: () => number): ProtoApi {
  const noop = () => {};
  const el = (): Record<string, unknown> => ({
    clientWidth: 680, clientHeight: 300, getContext: () => recorder().ctx, style: {}, dataset: {},
    appendChild: noop, querySelectorAll: () => [], checked: false,
  });
  const els: Record<string, unknown> = {};
  const sandbox: Record<string, unknown> = {
    document: { getElementById: (id: string) => (els[id] ??= el()), createElement: el, body: {}, querySelectorAll: () => [] },
    window: { devicePixelRatio: 1, addEventListener: noop },
    getComputedStyle: () => ({ fontFamily: 'x', color: '#000' }),
    requestAnimationFrame: noop,
    performance: { now: () => 0 },
    __rng: rng,
  };
  // Każdy kontekst `vm` ma własny obiekt Math, więc podmiana nie wycieka do testów.
  const src = 'Math.random=__rng;' + readFileSync(PROTO, 'utf8') +
    ';globalThis.__p={S,mkC,stepC,drawC,setSK:v=>{SK=v},setBoil:v=>{BOIL=v}};';
  vm.runInNewContext(src, sandbox);
  return sandbox.__p as ProtoApi;
}
```

- [ ] **Step 2: Test zgodności kroku `app/src/renderer/parity.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { K } from './pose';
import { createPet, setRng, stepPet } from './index';
import { loadPrototype, seeded, type ProtoApi } from './testing';

export const PROTO_SCENES = ['thinking', 'edit', 'bash', 'read', 'grep', 'web', 'agent', 'mcp', 'needs', 'done', 'error', 'idle', 'sleep'];
export const SKIN_IDS = ['clawd', 'kodek'] as const;

const rng = seeded(7);
const proto: ProtoApi = loadPrototype(rng.next);
setRng(rng.next);

/** Stan po każdej 20. klatce: nazwa akcji i wszystkie sprężyny (6 miejsc po przecinku). */
function trace(make: () => any, step: (c: any, dt: number, t: number) => void): string[] {
  rng.reset(7);
  const c = make();
  const out: string[] = [];
  let T = 0;
  for (let f = 1; f <= 240; f++) {
    T += 1 / 60;
    step(c, 1 / 60, T);
    if (f % 20 === 0) out.push(`${c.act[0]}|${K.map(k => c.p[k].x.toFixed(6)).join(',')}|parts=${c.parts.length}`);
  }
  return out;
}

describe('port silnika = prototyp v6', () => {
  for (const skin of SKIN_IDS) for (const scene of PROTO_SCENES) {
    it(`${skin} / ${scene}`, () => {
      const a = trace(() => proto.mkC(skin, scene), proto.stepC);
      const b = trace(() => createPet(skin, scene), stepPet);
      expect(b).toEqual(a);
    });
  }
});
```

- [ ] **Step 3: Uruchom test i sprawdź, że pada**

Run: `cd app; pnpm test`
Expected: FAIL, bo brak modułów `./pose` i `./index`.

- [ ] **Step 4: Przenieś kod** według mapy i zasad portu.

`rng.ts`:

```ts
let source: () => number = Math.random;
export const rng = () => source();
export function setRng(f: () => number): void { source = f; }
```

`index.ts`:

```ts
export { rng, setRng } from './rng';
export { SCENES } from './scenes';
export type { Scene, Act } from './scenes';
export { createPet, setScene, stepPet, type Pet } from './pet';
```

Task 4 dopisze do `index.ts` `drawPet` i `pen`.

- [ ] **Step 5: Uruchom testy**

Run: `pnpm test; pnpm typecheck`
Expected: 26 testów zgodności PASS, typecheck bez błędów.

Jeśli test pada: pierwsza różniąca się linia śladu wskazuje scenę, klatkę i sprężynę. Popraw port. **Nie zmieniaj** testu ani prototypu.

- [ ] **Step 6: Commit**

```bash
git add app/src/renderer
git commit -m "feat(renderer): port v6 action/spring engine to TS with prototype parity test"
```

---

### Task 4: Port renderera, część 2 — rysowanie i skórki

Przeniesienie rysowania (ciało, ręce, twarz, rekwizyty, przedmioty, cząsteczki) i wydzielenie skórek. Kryterium akceptacji: identyczna sekwencja wywołań Canvas 2D w prototypie i porcie (liczby zaokrąglone do 0,001), w tym dla skali mini u = 0,3.

**Delegacja:** jak w tasku 3; najlepiej ten sam wątek Codexa (`codex_continue`).

**Files:**
- Create: `app/src/renderer/pen.ts`, `palette.ts`, `draw/props.ts`, `draw/items.ts`, `draw/body.ts`
- Create: `app/src/skins/types.ts`, `clawd.ts`, `kodek.ts`, `index.ts`
- Modify: `app/src/renderer/pet.ts` (antena ze skórki), `index.ts`, `parity.test.ts`

**Interfaces:**
- Consumes: moduły z tasku 3.
- Produces:
  - `pen.ts`: `pen: { sketch: boolean; boil: number; sid: number; font: string }` (prototypowe `SK`, `BOIL`, `SID`, `FF`), `rrP, elP, path, bbox, shp, seg, lines, hose, mitt`;
  - `palette.ts`: `OL, PAPER, STEEL, DARK, COL, SPIN`;
  - `draw/props.ts`: `drawProp, drawPillow, drawMug, BOARD`;
  - `draw/items.ts`: `drawItems, drawWebPage`;
  - `draw/body.ts`: `drawPet(x: CanvasRenderingContext2D, c: Pet, X: number, Y: number, u: number, t: number): void` (prototyp `drawC`);
  - `skins/index.ts`: `type SkinId = 'clawd' | 'kodek'`, `SKINS: Record<SkinId, Skin>`.

**Mapa przeniesienia** (linie `prototype/pets.js`):

| Linie | Zawartość | Plik |
|---|---|---|
| 2 i 6 | `FF`, `SK`, `BOIL`, `SID` → pola `pen` | `pen.ts` |
| 98–107 | `rrP, elP, path, bbox, shp, seg` | `pen.ts` |
| 109–112 | `lines, hose, mitt` | `pen.ts` |
| 10 | `SPIN` | `palette.ts` |
| 12–13 | `COL, OL, PAPER, STEEL, DARK` | `palette.ts` |
| 11 | `PAL` | przechodzi do skórek |
| 113–125 | `BOARD, drawProp, drawPillow, drawMug` | `draw/props.ts` |
| 129–140 | `drawItems, drawWebPage` | `draw/items.ts` |
| 141–222 | `drawC` → `drawPet` | `draw/body.ts` |

**Skórka** (`skins/types.ts`):

```ts
export interface Skin {
  id: 'clawd' | 'kodek';
  pal: { m: string; s: string; b: string; h: string; g: string; gs: string };
  width: number; depth: number; height: number; radius: number;   // W, Dp, H, R (w u)
  armLen: number; mitt: number;                                   // AL, mr
  legs: [number, number][]; legW: number;                         // LG, lwid
  eyeX: number; eyeW: number; eyeH: number;                       // .17/.2, 8.5/11, 15/22
  screenFace: boolean;   // ekran-twarz, kursor, wygaszacz (Kodek)
  antenna: boolean;      // antena ze sprężyną (Kodek)
  backVents: boolean;    // kratki na plecach (Kodek)
  eyeGlint: boolean;     // odblask w oku (Clawd)
  blush: boolean;        // rumieńce (Clawd)
  frontLegsOnlySitting: boolean; // przy siedzeniu rysuj tylko przednie nóżki (Clawd)
}
```

Wartości:

| Pole | `clawd.ts` | `kodek.ts` |
|---|---|---|
| `pal` | `PAL.clawd` z linii 11 | `PAL.kodek` z linii 11 |
| `width` / `depth` | 98 / 52 | 88 / 50 |
| `height` / `radius` | 58 / 3.5 | 64 / 18 |
| `armLen` / `mitt` | 30 / 6.2 | 26 / 5.5 |
| `legs` | `[[-.33,.22],[-.12,-.22],[.12,-.22],[.33,.22]]` | `[[-.25,0],[.25,0]]` |
| `legW` | 10 | 16 |
| `eyeX` / `eyeW` / `eyeH` | .2 / 11 / 22 | .17 / 8.5 / 15 |
| cechy `true` | `eyeGlint`, `blush`, `frontLegsOnlySitting` | `screenFace`, `antenna`, `backVents` |

Pozostałe cechy mają `false`.

**Zamiany w `drawPet` i pomocnikach:**
- na początku `drawPet` dodaj `const sk = SKINS[c.type as SkinId]`;
- zamiany `isK`:

  | Prototyp | Port |
  |---|---|
  | `isK?88:98` | `sk.width` |
  | `isK?50:52` | `sk.depth` |
  | `isK?64:58` | `sk.height` |
  | `isK?18:3.5` | `sk.radius` |
  | `isK?26:30` | `sk.armLen` |
  | `isK?5.5:6.2` | `sk.mitt` |
  | tablica `LG` | `sk.legs` |
  | `isK?16:10` | `sk.legW` |
  | `isK?.17:.2` | `sk.eyeX` |
  | `isK?8.5:11` | `sk.eyeW` |
  | `isK?15:22` | `sk.eyeH` |
  | `PAL[c.type]` | `sk.pal` |

- cechy skórki:

  | Linia | Prototyp | Port |
  |---|---|---|
  | 173 | `if(isK)` (antena) | `sk.antenna` |
  | 178 | `isK` (kratki) | `sk.backVents` |
  | 181 | `saver=isK&&loaf>.5` | `sk.screenFace&&loaf>.5` |
  | 184 | `if(isK)` (ekran-twarz) | `sk.screenFace` |
  | 192 | `!isK` (odblask) | `sk.eyeGlint` |
  | 197 | `!isK` (rumieńce) | `sk.blush` |
  | 200 | `isK\|\|g.z>=-.5*u` | `!sk.frontLegsOnlySitting\|\|g.z>=-.5*u` |

- nieużywane `isK` z linii 114 usuń;
- w `stepPet` zamień `c.type==='kodek'` na `SKINS[c.type as SkinId].antenna`;
- `SK`, `BOIL`, `SID`, `FF` zamień na `pen.sketch`, `pen.boil`, `pen.sid`, `pen.font`; `drawPet` zaczyna się od `pen.sid=0`;
- `GA` w `drawPet` zostaje `1-.22*cl(P.dim.x)` (mnożnik `alpha` dochodzi dopiero w tasku 5).

- [ ] **Step 1: Rozszerz test zgodności o rysowanie** (dopisz na końcu `parity.test.ts`)

```ts
import { drawPet, pen } from './index';
import { recorder } from './testing';

pen.font = 'x';

function drawTrace(api: {
  make: () => any; step: (c: any, dt: number, t: number) => void;
  draw: (x: CanvasRenderingContext2D, c: any, X: number, Y: number, u: number, t: number) => void;
  sketch: (v: boolean) => void; boil: (v: number) => void;
}, sketch: boolean, u: number): string[] {
  rng.reset(7);
  api.sketch(sketch);
  const c = api.make();
  const rec = recorder();
  let T = 0;
  for (let f = 1; f <= 240; f++) {
    T += 1 / 60;
    api.boil(Math.floor(T * 8));
    api.step(c, 1 / 60, T);
    if (f % 40 === 0) { rec.log.push(`--- klatka ${f}`); api.draw(rec.ctx, c, 100, 150, u, T); }
  }
  return rec.log;
}

describe('port rysowania = prototyp v6', () => {
  for (const skin of SKIN_IDS) for (const scene of PROTO_SCENES) for (const sketch of [true, false]) for (const u of [1, 0.3]) {
    it(`${skin} / ${scene} / ${sketch ? 'rysowany' : 'czysty'} / u=${u}`, () => {
      const a = drawTrace({ make: () => proto.mkC(skin, scene), step: proto.stepC, draw: proto.drawC,
        sketch: proto.setSK, boil: proto.setBoil }, sketch, u);
      const b = drawTrace({ make: () => createPet(skin, scene), step: stepPet, draw: drawPet,
        sketch: v => { pen.sketch = v; }, boil: v => { pen.boil = v; } }, sketch, u);
      expect(b.length).toBe(a.length);
      const i = b.findIndex((v, k) => v !== a[k]);
      expect(i === -1 ? null : { at: i, proto: a[i], port: b[i], before: a.slice(Math.max(0, i - 3), i) }).toBeNull();
    });
  }
});
```

Rysowanie zmienia stan zwierzaka (`c.hand`, `c.aHand`, `c.hoop`, `c.boltAng`, `c.pAng`), a te pola wpływają na późniejsze kroki. Dlatego ślad rysowania sprawdza przy okazji także to sprzężenie.

- [ ] **Step 2: Uruchom i sprawdź, że pada**

Run: `pnpm test`
Expected: FAIL, bo brak `drawPet` i `pen` w `./index`.

- [ ] **Step 3: Przenieś rysowanie i utwórz skórki** według mapy i zamian.

Dopisz do `renderer/index.ts`:

```ts
export { drawPet } from './draw/body';
export { pen } from './pen';
```

`skins/index.ts`:

```ts
import { clawd } from './clawd';
import { kodek } from './kodek';
import type { Skin } from './types';
export type { Skin } from './types';
export type SkinId = Skin['id'];
export const SKINS: Record<SkinId, Skin> = { clawd, kodek };
```

- [ ] **Step 4: Uruchom testy**

Run: `pnpm test; pnpm typecheck`
Expected: 26 + 104 testów zgodności PASS.

Przy błędzie test pokazuje pierwsze różniące się wywołanie i 3 poprzednie. Popraw port, **nie** test.

- [ ] **Step 5: Commit**

```bash
git add app/src/renderer app/src/skins
git commit -m "feat(renderer): port v6 drawing and extract Clawd/Kodek skins, canvas-call parity with prototype"
```

---

### Task 5: Sceny `compact` i `bye`, przezroczystość zwierzaka, `sceneFor`

Specyfikacja wymaga sceny dla `compacting` (wysiłek, pot, bez nowego rekwizytu) i dla `ended` (macha i schodzi ze sceny w ok. 1,5 s). Prototyp ich nie ma.

**Files:**
- Modify: `app/src/renderer/scenes.ts`, `app/src/renderer/draw/body.ts`, `app/src/renderer/pet.ts` (pole `alpha?`)
- Create: `app/src/stage/sceneFor.ts`, `app/src/stage/sceneFor.test.ts`, `app/src/renderer/smoke.test.ts`

**Interfaces:**
- Consumes: `SCENES`, `createPet`, `stepPet`, `drawPet`, `recorder`, `seeded`, `setRng`.
- Produces:
  - `type SceneKey = 'thinking'|'edit'|'bash'|'read'|'grep'|'web'|'agent'|'mcp'|'needs'|'done'|'error'|'idle'|'sleep'|'compact'|'bye'`;
  - `sceneFor(s: Pick<Session,'state'|'tool'>): SceneKey`, `skinFor(agent: string): SkinId`;
  - `Pet.alpha?: number` (mnożnik przezroczystości całego zwierzaka, domyślnie 1).

- [ ] **Step 1: Testy `app/src/stage/sceneFor.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { sceneFor, skinFor } from './sceneFor';

describe('sceneFor', () => {
  it('maps working tools to tool scenes, other to mcp', () => {
    expect(sceneFor({ state: 'working', tool: 'edit' })).toBe('edit');
    expect(sceneFor({ state: 'working', tool: 'web' })).toBe('web');
    expect(sceneFor({ state: 'working', tool: 'other' })).toBe('mcp');
    expect(sceneFor({ state: 'working', tool: null })).toBe('mcp');
  });
  it('maps states', () => {
    expect(sceneFor({ state: 'needs_you', tool: null })).toBe('needs');
    expect(sceneFor({ state: 'compacting', tool: null })).toBe('compact');
    expect(sceneFor({ state: 'ended', tool: null })).toBe('bye');
    expect(sceneFor({ state: 'sleep', tool: null })).toBe('sleep');
  });
  it('falls back on unknown values from a newer core', () => {
    expect(sceneFor({ state: 'paused' as never, tool: null })).toBe('thinking');
    expect(sceneFor({ state: 'working', tool: 'teleport' as never })).toBe('mcp');
  });
  it('picks the skin by agent', () => {
    expect(skinFor('claude')).toBe('clawd');
    expect(skinFor('codex')).toBe('kodek');
    expect(skinFor('gemini')).toBe('clawd');
  });
});
```

- [ ] **Step 2: Test dymny `app/src/renderer/smoke.test.ts`** (następca `prototype/smoke-test.js`)

```ts
import { describe, expect, it } from 'vitest';
import { K } from './pose';
import { SCENES, createPet, drawPet, pen, setRng, setScene, stepPet } from './index';
import { recorder, seeded } from './testing';

const rng = seeded(11);
setRng(rng.next);
pen.font = 'x';

describe('każda scena i skórka: bez NaN i wyjątków', () => {
  for (const skin of ['clawd', 'kodek'] as const) for (const scene of Object.keys(SCENES)) {
    it(`${skin} / ${scene}`, () => {
      const c = createPet(skin, 'idle');
      setScene(c, scene);
      c.alpha = 0.5;
      const rec = recorder();
      let T = 0;
      for (let f = 0; f < 400; f++) {
        T += 1 / 60;
        pen.boil = Math.floor(T * 8);
        stepPet(c, 1 / 60, T);
        if (f % 10 === 0) drawPet(rec.ctx, c, 60, 40, 0.3, T);
      }
      for (const k of K) expect(Number.isFinite(c.p[k].x), k).toBe(true);
      expect(rec.log.some(l => l.includes('NaN'))).toBe(false);
    });
  }
  it('has the new scenes', () => {
    expect(SCENES).toHaveProperty('compact');
    expect(SCENES).toHaveProperty('bye');
  });
});
```

- [ ] **Step 3: Uruchom i sprawdź, że pada**

Run: `pnpm test`
Expected: FAIL (brak `./sceneFor`, brak scen `compact` i `bye`).

- [ ] **Step 4: Implementuj `app/src/stage/sceneFor.ts`**

```ts
import type { SkinId } from '../skins';
import type { Session } from '../types';

export type SceneKey = 'thinking' | 'edit' | 'bash' | 'read' | 'grep' | 'web' | 'agent' | 'mcp'
  | 'needs' | 'done' | 'error' | 'idle' | 'sleep' | 'compact' | 'bye';

const TOOL: Record<string, SceneKey> = {
  edit: 'edit', bash: 'bash', read: 'read', grep: 'grep', web: 'web', agent: 'agent', mcp: 'mcp', other: 'mcp',
};
const STATE: Record<string, SceneKey> = {
  thinking: 'thinking', needs_you: 'needs', done: 'done', error: 'error', idle: 'idle',
  sleep: 'sleep', compacting: 'compact', ended: 'bye',
};

export function sceneFor(s: Pick<Session, 'state' | 'tool'>): SceneKey {
  if (s.state === 'working') return TOOL[s.tool ?? 'other'] ?? 'mcp';
  return STATE[s.state] ?? 'thinking';
}

export const skinFor = (agent: string): SkinId => (agent === 'codex' ? 'kodek' : 'clawd');
```

- [ ] **Step 5: Nowe sceny w `SCENES`** (dopisz w obiekcie w `scenes.ts`, po `sleep`)

```ts
  compact: { base: { th: .2, look: .3, squint: .5 }, acts: [
    ['ściska kontekst', 2.4, (a, _c, t) => {
      const p = .5 + .5 * Math.sin(a * TAU / 1.2);
      return { ikL: 1, ikR: 1, hxL: -44 + 22 * p, hyL: -40 + 2 * Math.sin(t * 14), hxR: 44 - 22 * p,
        hyR: -40 + 2 * Math.sin(t * 14 + 1), lean: .25 * p, squint: .4 + .5 * p, tilt: .03 * Math.sin(t * 9) };
    }],
    ['ociera czoło', 1.5, a => ({ ikL: 1, hxL: -26 + 34 * ease(cl(a / 1.1)), hyL: -64, ikR: 1, hxR: 30, hyR: -34, look: .1, ex: .2 }),
      c => pend(c, .5, () => c.parts.push({ k: 'drop', x: -30, y: -62, vx: -25, vy: -20, g: 160, life: 0, max: .8 }))],
  ] },
  bye: { base: {}, seq: [
    ['macha na pożegnanie', .7, () => ({ th: 0, look: 0, happy: .8, armR: 2.3, oscR: .55, _f: 11 })],
    ['odchodzi', .9, a => ({ th: PI / 2, lx: 40 * ease(cl(a / .9)), walkW: 1, look: -.2 })],
  ], acts: [
    ['odszedł', 5, () => ({ th: PI / 2, lx: 40 })],
  ] },
```

Pot przy `compact` pojawia się sam z istniejącej reguły: `squint > .4` → krople.

- [ ] **Step 6: Mnożnik przezroczystości w `drawPet`**

W `draw/body.ts` zmień definicję `GA`:

```ts
const GA = (1 - .22 * cl(P.dim.x)) * (c.alpha ?? 1);
```

Mnożenie przez 1 jest dokładne w IEEE 754, więc testy zgodności z taskiem 4 dalej przechodzą. W `pet.ts` dodaj do `Pet` pole `alpha?: number`.

- [ ] **Step 7: Uruchom testy**

Run: `pnpm test; pnpm typecheck`
Expected: wszystkie PASS: zgodność (130), dymny (31: 15 scen × 2 skórki + 1), `sceneFor` (4).

- [ ] **Step 8: Commit**

```bash
git add app/src/renderer app/src/stage
git commit -m "feat(renderer): compact and bye scenes, pet alpha, session-to-scene mapping"
```

---

### Task 6: Model sceny — przepełnienie, układ, trafienia, HUD (czysta logika)

W tym tasku jest poprawka ucinania pierwszego zwierzaka z lewej, zgłoszonego w spike'u S1 i przypomnianego przez użytkownika. Układ liczymy od lewej krawędzi, z zapasem na zasięg zwierzaka. Szerokość okna wynika z treści, więc scena nie zabiera miejsca ikonom.

**Files:**
- Create: `app/src/stage/layout.ts`, `layout.test.ts`, `hit.ts`, `hit.test.ts`, `hud.ts`, `hud.test.ts`

**Interfaces:**
- Consumes: `Session`, `Limit` (task 2).
- Produces:
  - `layout.ts`:
    - stałe `SLOT = 74`, `LEFT_REACH = 24`, `RIGHT_REACH = 42`, `PAD = 2`, `BADGE_W = 24`, `LIMITS_W = 26`, `MAX_PETS = 5`;
    - `contentWidth(n, badge, limits): number`;
    - `capacity(total, hasLimits, maxWidth, maxPets?): number`;
    - `pickVisible(sorted: Session[], cap): { visible: Session[]; hidden: number }`;
    - `layout({ sessions, hasLimits, maxWidth, maxPets? }): LayoutOut`, gdzie `LayoutOut = { width; pets: { id; x }[]; hidden; hiddenIds: string[]; badgeX: number|null; limitsX: number|null }`;
  - `hit.ts`: `type Target = { kind:'pet'; id; x } | { kind:'limits'; x } | { kind:'badge'; x } | null`, `hitTest(out, x, y, height): Target`;
  - `hud.ts`: `AGENT_COLOR`, `clampPct`, `progressFraction`, `limitBars(limits): LimitBar[]`, `drawProgress`, `drawLimits`, `drawBadge`.

**Skąd te liczby** (u = 0,3; prototyp `drawC` i `drawProp`):
- lewy zasięg zwierzaka:
  - poduszka −72u = 21,6 px;
  - ręka wyciągnięta w bok ok. 73u = 22 px;
  - obrócone ciało do 55u;
- prawy zasięg: szafa CRT 131u = 39,3 px;
- odstęp między zwierzakami: `SLOT` = 74 jak w prototypie; 39 + 24 < 74.

Cząsteczki (nuty, gwiazdki) mogą wychodzić poza te granice; to efekt ulotny i nie jest ucinaniem postaci.

- [ ] **Step 1: Testy `layout.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import type { Session, State } from '../types';
import { BADGE_W, LEFT_REACH, LIMITS_W, RIGHT_REACH, SLOT, capacity, contentWidth, layout, pickVisible } from './layout';

const mk = (id: string, started_at: number, state: State = 'working'): Session => ({
  id, agent: 'claude', origin: 'cli', title: id, cwd: '', state, tool: 'edit', progress: null, context: null,
  started_at, last_activity: started_at, state_since: started_at, turn_started_at: null,
  jump: { pid: null, session_id: id, cwd: '', app: null },
});

describe('pickVisible', () => {
  it('shows everything that fits', () => {
    const s = [mk('a', 1), mk('b', 2)];
    expect(pickVisible(s, 5)).toEqual({ visible: s, hidden: 0 });
  });
  it('collapses the oldest first and keeps start order', () => {
    const s = [1, 2, 3, 4, 5, 6, 7].map(i => mk(`s${i}`, i));
    const r = pickVisible(s, 5);
    expect(r.visible.map(v => v.id)).toEqual(['s3', 's4', 's5', 's6', 's7']);
    expect(r.hidden).toBe(2);
  });
  it('never hides needs_you or error', () => {
    const s = [mk('old-needs', 1, 'needs_you'), mk('old-err', 2, 'error'), ...[3, 4, 5, 6, 7].map(i => mk(`s${i}`, i))];
    const ids = pickVisible(s, 5).visible.map(v => v.id);
    expect(ids).toEqual(['old-needs', 'old-err', 's5', 's6', 's7']);
  });
  it('keeps the newest urgent ones when they alone exceed capacity', () => {
    const s = [1, 2, 3].map(i => mk(`n${i}`, i, 'needs_you'));
    expect(pickVisible(s, 2).visible.map(v => v.id)).toEqual(['n2', 'n3']);
  });
  it('capacity 0 hides everything', () => {
    expect(pickVisible([mk('a', 1)], 0)).toEqual({ visible: [], hidden: 1 });
  });
});

describe('layout', () => {
  it('first pet is never clipped on the left and the last fits on the right (spike S1 bug)', () => {
    for (let n = 1; n <= 7; n++) for (const hasLimits of [false, true]) {
      const sessions = Array.from({ length: n }, (_, i) => mk(`s${i}`, i));
      const out = layout({ sessions, hasLimits, maxWidth: 400 });
      expect(out.pets.length).toBeGreaterThan(0);
      expect(out.pets[0].x - LEFT_REACH).toBeGreaterThanOrEqual(0);
      const last = out.pets[out.pets.length - 1];
      expect(last.x + RIGHT_REACH).toBeLessThanOrEqual(out.width - (hasLimits ? LIMITS_W : 0));
      expect(out.width).toBeLessThanOrEqual(400);
    }
  });
  it('width follows content, not a fixed stage size', () => {
    expect(layout({ sessions: [mk('a', 1)], hasLimits: false, maxWidth: 1000 }).width).toBe(contentWidth(1, false, false));
    expect(layout({ sessions: [], hasLimits: false, maxWidth: 1000 }).width).toBe(0);
    expect(layout({ sessions: [], hasLimits: true, maxWidth: 1000 }).width).toBe(contentWidth(0, false, true));
  });
  it('shows at most 5 pets and a +N badge with the hidden ids', () => {
    const sessions = Array.from({ length: 8 }, (_, i) => mk(`s${i}`, i));
    const out = layout({ sessions, hasLimits: true, maxWidth: 2000 });
    expect(out.pets).toHaveLength(5);
    expect(out.hidden).toBe(3);
    expect(out.hiddenIds).toEqual(['s0', 's1', 's2']);
    expect(out.badgeX).toBe(2);
    expect(out.pets[0].x).toBe(2 + BADGE_W + LEFT_REACH);
    expect(out.pets[1].x - out.pets[0].x).toBe(SLOT);
  });
  it('shrinks capacity to the free space between app icons and the tray', () => {
    const sessions = Array.from({ length: 5 }, (_, i) => mk(`s${i}`, i));
    const w2 = contentWidth(2, true, false);
    const out = layout({ sessions, hasLimits: false, maxWidth: w2 });
    expect(out.pets).toHaveLength(2);
    expect(out.hidden).toBe(3);
    expect(out.width).toBeLessThanOrEqual(w2);
  });
  it('capacity 0: only the badge when even one pet does not fit, nothing when the badge does not fit', () => {
    const s = [mk('a', 1), mk('b', 2)];
    expect(capacity(2, false, 30)).toBe(0);
    const out = layout({ sessions: s, hasLimits: false, maxWidth: 30 });
    expect(out.pets).toHaveLength(0);
    expect(out.badgeX).toBe(2);
    expect(out.width).toBeLessThanOrEqual(30);
    const none = layout({ sessions: s, hasLimits: false, maxWidth: 10 });
    expect(none.width).toBe(0);
    expect(none.badgeX).toBeNull();
  });
});
```

- [ ] **Step 2: Testy `hit.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { hitTest } from './hit';
import { LEFT_REACH, SLOT, type LayoutOut } from './layout';

const out: LayoutOut = { width: 250, pets: [{ id: 'a', x: 50 }, { id: 'b', x: 124 }], hidden: 1, hiddenIds: ['z'],
  badgeX: 2, limitsX: 222 };

describe('hitTest', () => {
  it('finds pets by slot, including props on their right', () => {
    expect(hitTest(out, 50, 30, 48)).toEqual({ kind: 'pet', id: 'a', x: 50 });
    expect(hitTest(out, 50 - LEFT_REACH + SLOT - 1, 30, 48)).toEqual({ kind: 'pet', id: 'a', x: 50 });
    expect(hitTest(out, 124 + 30, 30, 48)).toEqual({ kind: 'pet', id: 'b', x: 124 });
  });
  it('finds the badge and the limits', () => {
    expect(hitTest(out, 10, 24, 48)).toEqual({ kind: 'badge', x: 14 });
    expect(hitTest(out, 230, 24, 48)).toEqual({ kind: 'limits', x: 235 });
  });
  it('misses outside the stage', () => {
    expect(hitTest(out, -1, 24, 48)).toBeNull();
    expect(hitTest(out, 251, 24, 48)).toBeNull();
    expect(hitTest(out, 100, 49, 48)).toBeNull();
  });
});
```

- [ ] **Step 3: Testy `hud.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { clampPct, limitBars, progressFraction } from './hud';

describe('hud', () => {
  it('progressFraction treats missing or empty lists as unknown', () => {
    expect(progressFraction(null)).toBeNull();
    expect(progressFraction({ done: 0, total: 0 })).toBeNull();
    expect(progressFraction({ done: 2, total: 4 })).toBe(0.5);
    expect(progressFraction({ done: 9, total: 4 })).toBe(1);
  });
  it('clampPct keeps 0..100 and survives garbage', () => {
    expect(clampPct(-5)).toBe(0);
    expect(clampPct(140)).toBe(100);
    expect(clampPct(Number.NaN)).toBe(0);
  });
  it('limitBars shows only windows with data, in a fixed order', () => {
    const bars = limitBars([
      { agent: 'codex', window: 'weekly', used_pct: 91, resets_at: null },
      { agent: 'claude', window: 'five_hour', used_pct: 34, resets_at: null },
    ]);
    expect(bars).toEqual([
      { agent: 'claude', window: 'five_hour', pct: 34 },
      { agent: 'codex', window: 'weekly', pct: 91 },
    ]);
    expect(limitBars([])).toEqual([]);
  });
});
```

- [ ] **Step 4: Uruchom i sprawdź, że pada**

Run: `pnpm test`
Expected: FAIL (brak modułów).

- [ ] **Step 5: Implementuj `layout.ts`**

```ts
import type { Session } from '../types';

// Wymiary w pikselach CSS przy u = 0,3 (wysokość paska 48). Uzasadnienie: plan fazy 2, task 6.
export const SLOT = 74;
export const LEFT_REACH = 24;
export const RIGHT_REACH = 42;
export const PAD = 2;
export const BADGE_W = 24;
export const LIMITS_W = 26;
export const MAX_PETS = 5;

export interface LayoutOut {
  width: number;
  pets: { id: string; x: number }[];
  hidden: number;
  hiddenIds: string[];
  badgeX: number | null;
  limitsX: number | null;
}

const URGENT = new Set(['needs_you', 'error']);

export function contentWidth(n: number, badge: boolean, limits: boolean): number {
  let w = 0;
  if (badge) w += BADGE_W;
  if (n > 0) w += LEFT_REACH + (n - 1) * SLOT + RIGHT_REACH;
  if (limits) w += LIMITS_W;
  return w === 0 ? 0 : w + 2 * PAD;
}

export function capacity(total: number, hasLimits: boolean, maxWidth: number, maxPets = MAX_PETS): number {
  for (let n = Math.min(total, maxPets); n > 0; n--) {
    if (contentWidth(n, n < total, hasLimits) <= maxWidth) return n;
  }
  return 0;
}

export function pickVisible(sorted: Session[], cap: number): { visible: Session[]; hidden: number } {
  if (sorted.length <= cap) return { visible: sorted, hidden: 0 };
  if (cap <= 0) return { visible: [], hidden: sorted.length };
  const keep = new Set(sorted.filter(s => URGENT.has(s.state)).slice(-cap).map(s => s.id));
  const rest = sorted.filter(s => !keep.has(s.id));
  for (let i = rest.length - 1; i >= 0 && keep.size < cap; i--) keep.add(rest[i].id);
  const visible = sorted.filter(s => keep.has(s.id));
  return { visible, hidden: sorted.length - visible.length };
}

const byStart = (a: Session, b: Session) => a.started_at - b.started_at || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

export function layout(inp: { sessions: Session[]; hasLimits: boolean; maxWidth: number; maxPets?: number }): LayoutOut {
  const sorted = [...inp.sessions].sort(byStart);
  const cap = capacity(sorted.length, inp.hasLimits, inp.maxWidth, inp.maxPets);
  const { visible, hidden } = pickVisible(sorted, cap);
  const badge = hidden > 0;
  const width = contentWidth(visible.length, badge, inp.hasLimits);
  if (width > inp.maxWidth) {
    return { width: 0, pets: [], hidden: sorted.length, hiddenIds: sorted.map(s => s.id), badgeX: null, limitsX: null };
  }
  const shown = new Set(visible.map(s => s.id));
  let x = PAD;
  const badgeX = badge ? x : null;
  if (badge) x += BADGE_W;
  return {
    width,
    pets: visible.map((s, i) => ({ id: s.id, x: x + LEFT_REACH + i * SLOT })),
    hidden,
    hiddenIds: sorted.filter(s => !shown.has(s.id)).map(s => s.id),
    badgeX,
    limitsX: inp.hasLimits ? width - PAD - LIMITS_W : null,
  };
}
```

- [ ] **Step 6: Implementuj `hit.ts`**

```ts
import { BADGE_W, LEFT_REACH, LIMITS_W, RIGHT_REACH, SLOT, type LayoutOut } from './layout';

export type Target = { kind: 'pet'; id: string; x: number } | { kind: 'limits'; x: number } | { kind: 'badge'; x: number } | null;

export function hitTest(out: LayoutOut, x: number, y: number, height: number): Target {
  if (x < 0 || x > out.width || y < 0 || y > height) return null;
  if (out.limitsX != null && x >= out.limitsX) return { kind: 'limits', x: out.limitsX + LIMITS_W / 2 };
  if (out.badgeX != null && x >= out.badgeX && x < out.badgeX + BADGE_W) return { kind: 'badge', x: out.badgeX + BADGE_W / 2 };
  for (let i = 0; i < out.pets.length; i++) {
    const p = out.pets[i];
    const left = p.x - LEFT_REACH;
    const right = i + 1 < out.pets.length ? left + SLOT : p.x + RIGHT_REACH;
    if (x >= left && x < right) return { kind: 'pet', id: p.id, x: p.x };
  }
  return null;
}
```

- [ ] **Step 7: Implementuj `hud.ts`**

```ts
import type { Limit, Session } from '../types';
import { BADGE_W } from './layout';

export const AGENT_COLOR: Record<string, string> = { claude: '#D97757', codex: '#5DCAA5' };
const TRACK = 'rgba(128,128,128,0.30)';
const HOT = '#E24B4A';
const ACTIVE = new Set(['thinking', 'working', 'compacting', 'needs_you']);

export const clampPct = (v: number) => (Number.isFinite(v) ? Math.min(100, Math.max(0, v)) : 0);

export function progressFraction(p: Session['progress']): number | null {
  if (!p || !(p.total > 0)) return null;
  return Math.min(1, Math.max(0, p.done / p.total));
}

/** Pasek postępu pod zwierzakiem: 28×2 px; bez listy zadań pulsuje, gdy sesja pracuje. */
export function drawProgress(x: CanvasRenderingContext2D, cx: number, y: number, s: Session, t: number): void {
  const col = AGENT_COLOR[s.agent] ?? AGENT_COLOR.claude;
  const f = progressFraction(s.progress);
  x.save();
  x.fillStyle = TRACK;
  x.fillRect(cx - 14, y, 28, 2);
  if (f != null) {
    x.fillStyle = col;
    x.fillRect(cx - 14, y, 28 * f, 2);
  } else if (ACTIVE.has(s.state)) {
    x.globalAlpha = .25 + .45 * (.5 + .5 * Math.sin(t * 4));
    x.fillStyle = col;
    x.fillRect(cx - 14, y, 28, 2);
  }
  x.restore();
}

export interface LimitBar { agent: 'claude' | 'codex'; window: 'five_hour' | 'weekly'; pct: number }

export function limitBars(limits: Limit[]): LimitBar[] {
  const out: LimitBar[] = [];
  for (const agent of ['claude', 'codex'] as const) for (const window of ['five_hour', 'weekly'] as const) {
    const l = limits.find(v => v.agent === agent && v.window === window);
    if (l && Number.isFinite(l.used_pct)) out.push({ agent, window, pct: clampPct(l.used_pct) });
  }
  return out;
}

/** Pionowe paski 3 px: 5h pełnym kolorem, tydzień przygaszony; grupy agentów rozdziela większy odstęp. */
export function drawLimits(x: CanvasRenderingContext2D, lx: number, h: number, bars: LimitBar[]): void {
  const top = 8, H = h - 16;
  let px = lx + 3;
  let prev: string | null = null;
  for (const b of bars) {
    if (prev && prev !== b.agent) px += 3;
    x.save();
    x.fillStyle = TRACK;
    x.fillRect(px, top, 3, H);
    x.globalAlpha = b.window === 'weekly' ? .6 : 1;
    x.fillStyle = b.pct >= 90 ? HOT : AGENT_COLOR[b.agent];
    const fh = H * b.pct / 100;
    x.fillRect(px, top + H - fh, 3, fh);
    x.restore();
    px += 5;
    prev = b.agent;
  }
}

export function drawBadge(x: CanvasRenderingContext2D, bx: number, h: number, hidden: number, font: string): void {
  const w = BADGE_W - 4, hh = 16, y = (h - hh) / 2;
  x.save();
  x.fillStyle = 'rgba(128,128,128,0.35)';
  x.beginPath();
  x.roundRect(bx + 2, y, w, hh, 5);
  x.fill();
  x.fillStyle = '#FAF9F5';
  x.font = `600 10px ${font}`;
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.fillText(`+${hidden}`, bx + 2 + w / 2, y + hh / 2 + .5);
  x.restore();
}
```

- [ ] **Step 8: Uruchom testy**

Run: `pnpm test; pnpm typecheck`
Expected: wszystkie PASS.

- [ ] **Step 9: Commit**

```bash
git add app/src/stage
git commit -m "feat(stage): overflow, content-sized layout without left clipping, hit testing, HUD"
```

---

### Task 7: Powłoka — osadzenie w pasku, wolne miejsce przez UI Automation, odtwarzanie, widoczność, tray

**Files:**
- Create: `app/src-tauri/src/shell/mod.rs`, `shell/placement.rs`, `shell/taskbar.rs`, `app/src-tauri/src/tray.rs`
- Modify: `app/src-tauri/src/lib.rs`, `app/src/main.ts` (tymczasowo woła `stage_hello` i `stage_set_width`)

**Interfaces:**
- Consumes: `core::Shared`.
- Produces:
  - `shell::Shell::start(&AppHandle) -> tauri::Result<Shell>`, `Shell::set_width(f64)`, `Shell::hello()`, `Shell::stage_origin() -> Option<(i32, i32, f64)>` (lewa, górna krawędź sceny w px ekranu, skala), pole `pub stage: Arc<AtomicIsize>`;
  - `shell::screen_size() -> (i32, i32)`, `shell::show_no_activate(&WebviewWindow)`;
  - `shell::placement::{Rect, Metrics, Placement, place, taskbar_visible}`;
  - komendy `stage_hello`, `stage_set_width(width: f64)`;
  - zdarzenia `pets://layout` (`{max_css, height_css, scale}`) i `pets://visibility` (`bool`);
  - `tray::build(&AppHandle)`.

- [ ] **Step 1: Testy geometrii `shell/placement.rs`** (na końcu pliku)

```rust
#[cfg(test)]
mod tests {
    use super::*;

    const TRAY: Rect = Rect { left: 0, top: 1392, right: 2560, bottom: 1440 };
    const SCREEN: Rect = Rect { left: 0, top: 0, right: 2560, bottom: 1440 };
    fn m(icons: Option<i32>, scale: f64) -> Metrics { Metrics { tray: TRAY, notify_left: Some(2291), icons_right: icons, scale } }

    #[test]
    fn sits_left_of_the_tray_with_a_gap() {
        // liczby zmierzone na maszynie deweloperskiej przez UI Automation (ostatnia ikona kończy się na 1657)
        let p = place(&m(Some(1657), 1.0), 400.0).unwrap();
        assert_eq!((p.x, p.w, p.h), (2291 - 8 - 400, 400, 48));
        assert_eq!(p.max_css, (2291 - 8 - (1657 + 8)) as f64);
    }

    #[test]
    fn never_covers_app_icons() {
        let p = place(&m(Some(2100), 1.0), 400.0).unwrap();
        assert_eq!(p.w, 2291 - 8 - (2100 + 8));
        assert_eq!(p.x, 2100 + 8);
    }

    #[test]
    fn converts_css_to_physical_pixels_at_150_percent() {
        let p = place(&m(Some(1657), 1.5), 200.0).unwrap();
        assert_eq!(p.w, 300);
        assert_eq!(p.x, 2291 - 12 - 300);
        assert!((p.height_css - 32.0).abs() < 1e-9);
    }

    #[test]
    fn without_uia_uses_the_whole_taskbar() {
        assert_eq!(place(&m(None, 1.0), 400.0).unwrap().max_css, 2283.0);
    }

    #[test]
    fn icons_reaching_the_tray_leave_no_room() {
        let p = place(&m(Some(2400), 1.0), 400.0).unwrap();
        assert_eq!((p.w, p.max_css), (0, 0.0));
    }

    #[test]
    fn skips_zero_height_measurements_during_dpi_change() {
        let mut mm = m(Some(1657), 1.0);
        mm.tray.bottom = mm.tray.top;
        assert!(place(&mm, 400.0).is_none());
    }

    #[test]
    fn autohidden_taskbar_is_not_visible() {
        assert!(taskbar_visible(TRAY, SCREEN));
        assert!(!taskbar_visible(Rect { left: 0, top: 1438, right: 2560, bottom: 1486 }, SCREEN));
    }
}
```

- [ ] **Step 2: Implementuj `placement.rs`** (góra pliku)

```rust
//! Czysta geometria sceny w pasku zadań (bez Win32), w pikselach fizycznych ekranu.

#[derive(Clone, Copy, Debug, PartialEq, Eq, Default)]
pub struct Rect { pub left: i32, pub top: i32, pub right: i32, pub bottom: i32 }

impl Rect {
    pub fn height(&self) -> i32 { self.bottom - self.top }
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Metrics {
    pub tray: Rect,
    /// lewa krawędź zasobnika (`TrayNotifyWnd`)
    pub notify_left: Option<i32>,
    /// prawa krawędź ostatniego elementu paska (Start, wyszukiwanie, ikony aplikacji) z UI Automation
    pub icons_right: Option<i32>,
    pub scale: f64,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Placement {
    /// pozycja we współrzędnych klienta paska (okno jest jego dzieckiem)
    pub x: i32,
    pub w: i32,
    pub h: i32,
    /// wolne miejsce w pikselach CSS; UI mieści w nim tylu zwierzaków, ilu się da
    pub max_css: f64,
    pub height_css: f64,
}

pub const GAP_CSS: f64 = 8.0;

/// Scena stoi przy zasobniku i ma szerokość treści (`want_css`), ale nigdy nie wchodzi na ikony aplikacji.
/// `None`, gdy pomiar jest chwilowo niewiarygodny (w trakcie zmiany skali pasek ma wysokość 0).
pub fn place(m: &Metrics, want_css: f64) -> Option<Placement> {
    if m.tray.height() <= 0 || m.scale <= 0.0 { return None; }
    let gap = (GAP_CSS * m.scale).round() as i32;
    let right = m.notify_left.filter(|l| *l > m.tray.left && *l <= m.tray.right).unwrap_or(m.tray.right) - gap;
    let left = m.icons_right.filter(|r| *r >= m.tray.left).map(|r| r + gap).unwrap_or(m.tray.left);
    let free = (right - left).max(0);
    let w = ((want_css.max(0.0) * m.scale).round() as i32).min(free);
    Some(Placement {
        x: right - w - m.tray.left,
        w,
        h: m.tray.height(),
        max_css: free as f64 / m.scale,
        height_css: m.tray.height() as f64 / m.scale,
    })
}

/// Autoukryty pasek chowa się za dolną krawędź ekranu, zostawiając ok. 2 px.
pub fn taskbar_visible(tray: Rect, screen: Rect) -> bool {
    screen.bottom - tray.top > 4 && tray.bottom > screen.top
}
```

- [ ] **Step 3: Uruchom testy geometrii**

Tymczasowo dodaj w `lib.rs` `mod shell;`, a w `shell/mod.rs` tylko `pub mod placement;`.
Run: `cargo test -p agent-pets placement`
Expected: 7 PASS.

- [ ] **Step 4: Win32 i UI Automation `shell/taskbar.rs`**

```rust
//! Pasek zadań Windows 11: uchwyty, pomiary (Win32 + UI Automation), osadzenie okna sceny.
use super::placement::{Metrics, Placement, Rect};
use windows::core::{w, PCWSTR};
use windows::Win32::Foundation::{HWND, RECT};
use windows::Win32::System::Com::{CoCreateInstance, CoInitializeEx, CLSCTX_INPROC_SERVER, COINIT_MULTITHREADED};
use windows::Win32::UI::Accessibility::{CUIAutomation, IUIAutomation, IUIAutomationElement, IUIAutomationTreeWalker};
use windows::Win32::UI::HiDpi::GetDpiForWindow;
use windows::Win32::UI::Shell::{SHQueryUserNotificationState, QUNS_BUSY, QUNS_PRESENTATION_MODE, QUNS_RUNNING_D3D_FULL_SCREEN};
use windows::Win32::UI::WindowsAndMessaging::*;

pub fn hwnd(raw: isize) -> HWND { HWND(raw as *mut core::ffi::c_void) }

pub fn tray() -> Option<HWND> { unsafe { FindWindowW(w!("Shell_TrayWnd"), PCWSTR::null()).ok() } }

pub fn rect_of(h: HWND) -> Option<Rect> {
    let mut r = RECT::default();
    unsafe { GetWindowRect(h, &mut r).ok()?; }
    Some(Rect { left: r.left, top: r.top, right: r.right, bottom: r.bottom })
}

pub fn scale_of(h: HWND) -> f64 {
    let d = unsafe { GetDpiForWindow(h) };
    if d == 0 { 1.0 } else { d as f64 / 96.0 }
}

pub fn is_window(raw: isize) -> bool { raw != 0 && unsafe { IsWindow(Some(hwnd(raw))).as_bool() } }

pub fn screen_rect() -> Rect {
    unsafe { Rect { left: 0, top: 0, right: GetSystemMetrics(SM_CXSCREEN), bottom: GetSystemMetrics(SM_CYSCREEN) } }
}

/// Aplikacja pełnoekranowa (gra, film, prezentacja): wtedy nie rysujemy.
pub fn fullscreen_app() -> bool {
    matches!(unsafe { SHQueryUserNotificationState() }, Ok(s) if s == QUNS_BUSY || s == QUNS_RUNNING_D3D_FULL_SCREEN || s == QUNS_PRESENTATION_MODE)
}

/// Elementy paska Win11 są w XAML i nie mają własnych HWND, więc koniec ikon mierzy UI Automation.
pub struct Uia { auto: IUIAutomation, walker: IUIAutomationTreeWalker }

impl Uia {
    pub fn new() -> windows::core::Result<Uia> {
        unsafe {
            let _ = CoInitializeEx(None, COINIT_MULTITHREADED);
            let auto: IUIAutomation = CoCreateInstance(&CUIAutomation, None, CLSCTX_INPROC_SERVER)?;
            let walker = auto.ControlViewWalker()?;
            Ok(Uia { auto, walker })
        }
    }

    fn find(&self, el: &IUIAutomationElement, id: &str, depth: u32) -> Option<IUIAutomationElement> {
        if depth > 3 { return None; }
        let mut c = unsafe { self.walker.GetFirstChildElement(el) }.ok();
        while let Some(ch) = c {
            if unsafe { ch.CurrentAutomationId() }.map(|b| b.to_string() == id).unwrap_or(false) { return Some(ch); }
            if let Some(f) = self.find(&ch, id, depth + 1) { return Some(f); }
            c = unsafe { self.walker.GetNextSiblingElement(&ch) }.ok();
        }
        None
    }

    /// Prawa krawędź ostatniego dziecka `TaskbarFrame` (Start, wyszukiwanie, przyciski aplikacji).
    pub fn icons_right(&self, tray: HWND) -> Option<i32> {
        let root = unsafe { self.auto.ElementFromHandle(tray) }.ok()?;
        let frame = self.find(&root, "TaskbarFrame", 0)?;
        let mut right: Option<i32> = None;
        let mut c = unsafe { self.walker.GetFirstChildElement(&frame) }.ok();
        while let Some(ch) = c {
            if let Ok(r) = unsafe { ch.CurrentBoundingRectangle() } {
                if r.right > r.left { right = Some(right.map_or(r.right, |x| x.max(r.right))); }
            }
            c = unsafe { self.walker.GetNextSiblingElement(&ch) }.ok();
        }
        right
    }
}

pub fn metrics(tray: HWND, uia: Option<&Uia>) -> Option<Metrics> {
    let r = rect_of(tray)?;
    let notify = unsafe { FindWindowExW(Some(tray), None, w!("TrayNotifyWnd"), PCWSTR::null()) }.ok()
        .and_then(rect_of).map(|n| n.left);
    Some(Metrics { tray: r, notify_left: notify, icons_right: uia.and_then(|u| u.icons_right(tray)), scale: scale_of(tray) })
}

pub fn embed(stage: HWND, tray: HWND) -> windows::core::Result<()> {
    unsafe {
        let style = GetWindowLongW(stage, GWL_STYLE) as u32;
        SetWindowLongW(stage, GWL_STYLE, ((style & !(WS_POPUP.0 | WS_CAPTION.0 | WS_THICKFRAME.0)) | WS_CHILD.0) as i32);
        SetParent(stage, Some(tray))?;
    }
    Ok(())
}

/// Osadzone okno: współrzędne klienta paska. Szerokość 0 → okno ukryte (brak treści albo miejsca).
pub fn apply(stage: HWND, p: Option<Placement>) {
    unsafe {
        match p {
            Some(p) if p.w > 0 => { let _ = SetWindowPos(stage, Some(HWND_TOP), p.x, 0, p.w, p.h, SWP_SHOWWINDOW | SWP_NOACTIVATE | SWP_FRAMECHANGED); }
            _ => { let _ = ShowWindow(stage, SW_HIDE); }
        }
    }
}

/// Plan awaryjny, gdy `SetParent` zawiedzie: zwykłe okno tuż nad paskiem, na tej samej pozycji.
pub fn apply_floating(stage: HWND, m: &Metrics, p: Option<Placement>) {
    unsafe {
        match p {
            Some(p) if p.w > 0 => { let _ = SetWindowPos(stage, Some(HWND_TOPMOST), m.tray.left + p.x, m.tray.top - p.h, p.w, p.h, SWP_SHOWWINDOW | SWP_NOACTIVATE); }
            _ => { let _ = ShowWindow(stage, SW_HIDE); }
        }
    }
}

pub fn show_no_activate(h: HWND) {
    unsafe {
        let _ = ShowWindow(h, SW_SHOWNOACTIVATE);
        let _ = SetWindowPos(h, Some(HWND_TOPMOST), 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE | SWP_SHOWWINDOW);
    }
}
```

Sygnatury są dla `windows` 0.61. W tej wersji opcjonalne uchwyty to `Option<HWND>`, a `FindWindowW`, `SetParent` i `GetWindowRect` zwracają `Result`. Jeśli kompilator zgłosi inną sygnaturę, dopasuj wywołanie, nie wersję crate'a: musi zgadzać się z wersją, której używa Tauri, bo `WebviewWindow::hwnd()` zwraca jej `HWND`.

- [ ] **Step 5: `shell/mod.rs`**

```rust
//! Okno sceny w pasku zadań: osadzenie, pętla układu, odtwarzanie po restarcie Explorera, widoczność.
pub mod placement;
mod taskbar;

use serde::Serialize;
use std::sync::atomic::{AtomicIsize, Ordering};
use std::sync::mpsc::{channel, Receiver, RecvTimeoutError, Sender};
use std::sync::Arc;
use std::time::Duration;
use tauri::{AppHandle, Emitter, WebviewUrl, WebviewWindow, WebviewWindowBuilder};

pub enum Cmd { Width(f64), Hello }

#[derive(Serialize, Clone, Copy, PartialEq, Debug)]
pub struct Layout { pub max_css: f64, pub height_css: f64, pub scale: f64 }

pub struct Shell { tx: Sender<Cmd>, pub stage: Arc<AtomicIsize> }

pub fn build_stage(app: &AppHandle, label: &str) -> tauri::Result<WebviewWindow> {
    WebviewWindowBuilder::new(app, label, WebviewUrl::App("index.html".into()))
        .title("agent-pets-stage").inner_size(400.0, 48.0).decorations(false).transparent(true)
        .always_on_top(true).skip_taskbar(true).resizable(false).shadow(false).focused(false).visible(false)
        .build()
}

fn raw(w: &WebviewWindow) -> isize { w.hwnd().map(|h| h.0 as isize).unwrap_or(0) }

impl Shell {
    pub fn start(app: &AppHandle) -> tauri::Result<Shell> {
        let win = build_stage(app, "stage0")?;
        let stage = Arc::new(AtomicIsize::new(raw(&win)));
        let (tx, rx) = channel();
        let (a, s) = (app.clone(), stage.clone());
        std::thread::spawn(move || run(a, rx, s));
        Ok(Shell { tx, stage })
    }

    pub fn set_width(&self, css: f64) { let _ = self.tx.send(Cmd::Width(css)); }
    /// Nowo załadowana strona prosi o ponowne wysłanie układu i widoczności.
    pub fn hello(&self) { let _ = self.tx.send(Cmd::Hello); }

    pub fn stage_origin(&self) -> Option<(i32, i32, f64)> {
        let h = taskbar::hwnd(self.stage.load(Ordering::Relaxed));
        let r = taskbar::rect_of(h)?;
        Some((r.left, r.top, taskbar::scale_of(h)))
    }
}

pub fn screen_size() -> (i32, i32) { let r = taskbar::screen_rect(); (r.right, r.bottom) }

pub fn show_no_activate(w: &WebviewWindow) { if let Ok(h) = w.hwnd() { taskbar::show_no_activate(h); } }

/// Tworzy nowe okno sceny na wątku głównym (stare zginęło razem z paskiem).
fn recreate(app: &AppHandle, n: u32) -> Option<isize> {
    let (tx, rx) = channel();
    let h = app.clone();
    app.run_on_main_thread(move || { let _ = tx.send(build_stage(&h, &format!("stage{n}")).map(|w| raw(&w))); }).ok()?;
    rx.recv_timeout(Duration::from_secs(10)).ok()?.ok()
}

fn run(app: AppHandle, rx: Receiver<Cmd>, stage: Arc<AtomicIsize>) {
    let uia = taskbar::Uia::new().ok();
    if uia.is_none() { eprintln!("agent-pets: UI Automation niedostępne, scena zajmie cały pasek"); }
    let (mut want, mut last_tray, mut floating, mut n) = (0.0f64, 0isize, false, 1u32);
    let mut last_layout: Option<Layout> = None;
    let mut last_visible: Option<bool> = None;
    loop {
        match rx.recv_timeout(Duration::from_millis(1000)) {
            Ok(Cmd::Width(w)) => want = w,
            Ok(Cmd::Hello) => { last_layout = None; last_visible = None; }
            Err(RecvTimeoutError::Timeout) => {}
            Err(RecvTimeoutError::Disconnected) => return,
        }
        let Some(tray) = taskbar::tray() else { continue };
        let mut h = stage.load(Ordering::Relaxed);
        if tray.0 as isize != last_tray {
            // pierwszy start albo restart Explorera (nowy uchwyt paska)
            if !taskbar::is_window(h) {
                let Some(nh) = recreate(&app, n) else { continue };
                n += 1;
                h = nh;
                stage.store(nh, Ordering::Relaxed);
                last_layout = None;
                last_visible = None;
            }
            floating = taskbar::embed(taskbar::hwnd(h), tray).is_err();
            if floating { eprintln!("agent-pets: osadzenie w pasku nie powiodło się, okno pływające"); }
            last_tray = tray.0 as isize;
        }
        let Some(m) = taskbar::metrics(tray, uia.as_ref()) else { continue };
        let p = placement::place(&m, want);
        if let Some(p) = p {
            let l = Layout { max_css: p.max_css.floor(), height_css: p.height_css, scale: m.scale };
            if last_layout != Some(l) { let _ = app.emit("pets://layout", l); last_layout = Some(l); }
        }
        if floating { taskbar::apply_floating(taskbar::hwnd(h), &m, p) } else { taskbar::apply(taskbar::hwnd(h), p) }
        let vis = placement::taskbar_visible(m.tray, taskbar::screen_rect()) && !taskbar::fullscreen_app();
        if last_visible != Some(vis) { let _ = app.emit("pets://visibility", vis); last_visible = Some(vis); }
    }
}
```

- [ ] **Step 6: Tray `tray.rs`**

```rust
//! Ikona w zasobniku. Faza 2: tylko „Zakończ”; panel z kliknięcia ikony to faza 3.
use tauri::menu::{Menu, MenuItem};
use tauri::tray::TrayIconBuilder;
use tauri::AppHandle;

pub fn build(app: &AppHandle) -> tauri::Result<()> {
    let quit = MenuItem::with_id(app, "quit", "Zakończ Agent Pets", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&quit])?;
    let mut b = TrayIconBuilder::with_id("main").tooltip("Agent Pets").menu(&menu)
        .on_menu_event(|app, e| if e.id() == "quit" { app.exit(0) });
    if let Some(icon) = app.default_window_icon() { b = b.icon(icon.clone()); }
    b.build(app)?;
    Ok(())
}
```

`app.exit(0)` wysyła `ExitRequested` z `code = Some(0)`, więc `prevent_exit` (tylko dla `None`) go nie blokuje.

- [ ] **Step 7: `lib.rs`**

Dodaj `mod shell; mod tray;` i komendy:

```rust
#[tauri::command]
fn stage_hello(shell: tauri::State<shell::Shell>) { shell.hello(); }

#[tauri::command]
fn stage_set_width(width: f64, shell: tauri::State<shell::Shell>) { shell.set_width(width); }
```

W `setup` zastąp tymczasowe `WebviewWindowBuilder` przez:

```rust
            app.manage(shell::Shell::start(app.handle())?);
            tray::build(app.handle())?;
```

`invoke_handler` rozszerz o `stage_hello` i `stage_set_width`. Usuń nieużywane importy `WebviewUrl` i `WebviewWindowBuilder`.

- [ ] **Step 8: Strona tymczasowa prosi o miejsce**

W `app/src/main.ts` dopisz na końcu:

```ts
void invoke('stage_hello');
void invoke('stage_set_width', { width: 220 });
```

- [ ] **Step 9: Testy i ręczna weryfikacja**

Run: `cargo test --workspace`
Expected: PASS.

Ręcznie (`cd app; pnpm tauri dev`; najpierw zamknij spike i `pets-cli run`):
1. Napis „Agent Pets: N sesji…” stoi w pasku na lewo od zasobnika, nie na ikonach aplikacji.
2. Otwórz kilka aplikacji, żeby ikon przybyło: w ciągu ok. 1 s scena się zwęża albo znika, ale nigdy nie wchodzi na ikony.
3. Restart Explorera (`Stop-Process -Name explorer`): scena wraca w ciągu kilku sekund.
4. Skala 150%, a potem 100% (Ustawienia → Ekran, zmienia **użytkownik**): scena dopasowuje się i nie nachodzi na ikony.
5. Autoukrywanie paska: scena chowa się razem z paskiem.
6. Tray: ikona Agent Pets z menu „Zakończ Agent Pets”, które zamyka aplikację.

Wyniki zapisz w `docs/phase2-verification.md` (plik powstaje tutaj, task 10 go uzupełni).

- [ ] **Step 10: Commit**

```bash
git add app/src-tauri app/src/main.ts docs/phase2-verification.md
git commit -m "feat(shell): embed stage in the taskbar, size it to the free space via UI Automation, recreate after Explorer restart, tray"
```

---

### Task 8: Scena na żywo — roster, HUD, pętla 30 kl./s, most do Tauri i podgląd w przeglądarce

**Files:**
- Create: `app/src/stage/roster.ts`, `roster.test.ts`, `bridge.ts`, `demo.ts`, `stage.ts`, `app/dev.html`, `app/src/dev.ts`
- Modify: `app/src/main.ts`, `app/index.html` (usunąć `#info` i `hidden` z płótna), `app/vite.config.ts` (wejście `dev`)

**Interfaces:**
- Consumes:
  - `createPet`, `setScene`, `stepPet`, `drawPet`, `pen`;
  - `sceneFor`, `skinFor`;
  - `layout`, `LayoutOut`;
  - `drawProgress`, `drawLimits`, `drawBadge`, `limitBars`;
  - typy z `types.ts`.
- Produces:
  - `Roster` (`sync(sessions, t)`, `get(id)`, `alpha(entry, t)`) i `interface Entry { session; pet; scene; born; byeAt?; phase }`;
  - `interface Bridge` (niżej), `tauriBridge()`, `fakeBridge(canvas, tip, opts)`;
  - `startStage(canvas, bridge): StageHandle`, gdzie `StageHandle = { hover: (p: PointerMsg) => void }`; task 9 użyje go do podpięcia tooltipa.

- [ ] **Step 1: Testy `roster.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import type { Session, State, Tool } from '../types';
import { Roster } from './roster';

const s = (id: string, state: State, tool: Tool | null = null, agent: 'claude' | 'codex' = 'claude'): Session => ({
  id, agent, origin: 'cli', title: id, cwd: '', state, tool, progress: null, context: null,
  started_at: 1, last_activity: 1, state_since: 1, turn_started_at: null,
  jump: { pid: null, session_id: id, cwd: '', app: null },
});

describe('Roster', () => {
  it('creates a pet per session with the right skin and scene', () => {
    const r = new Roster();
    r.sync([s('a', 'working', 'bash'), s('b', 'sleep', null, 'codex')], 0);
    expect(r.get('a')?.scene).toBe('bash');
    expect(r.get('a')?.pet.type).toBe('clawd');
    expect(r.get('b')?.pet.type).toBe('kodek');
  });
  it('switches scene only when the state changes', () => {
    const r = new Roster();
    r.sync([s('a', 'working', 'bash')], 0);
    const pet = r.get('a')!.pet;
    r.sync([s('a', 'working', 'bash')], 1);
    expect(r.get('a')!.pet).toBe(pet);
    r.sync([s('a', 'done')], 2);
    expect(r.get('a')!.scene).toBe('done');
    expect(r.get('a')!.pet).toBe(pet);
  });
  it('removes pets whose sessions disappeared', () => {
    const r = new Roster();
    r.sync([s('a', 'idle')], 0);
    r.sync([], 1);
    expect(r.get('a')).toBeUndefined();
  });
  it('does not spawn a pet for a session that is already ended', () => {
    const r = new Roster();
    r.sync([s('gone', 'ended')], 0);
    expect(r.get('gone')).toBeUndefined();
  });
  it('fades in on arrival and out after the goodbye wave', () => {
    const r = new Roster();
    r.sync([s('a', 'idle')], 10);
    const e = r.get('a')!;
    expect(r.alpha(e, 10)).toBe(0);
    expect(r.alpha(e, 10.3)).toBeCloseTo(1);
    r.sync([s('a', 'ended')], 20);
    expect(r.alpha(e, 20.5)).toBeCloseTo(1);
    expect(r.alpha(e, 21.5)).toBeCloseTo(0);
  });
});
```

- [ ] **Step 2: Uruchom i sprawdź, że pada**

Run: `pnpm test`
Expected: FAIL (brak `./roster`).

- [ ] **Step 3: Implementuj `roster.ts`**

```ts
import { createPet, setScene, type Pet } from '../renderer';
import type { Session } from '../types';
import { sceneFor, skinFor, type SceneKey } from './sceneFor';

export interface Entry { session: Session; pet: Pet; scene: SceneKey; born: number; byeAt?: number; phase: number }

const FADE_IN = .3, BYE_WAVE = .7, BYE_FADE = .8;

/** Przesunięcie fazy animacji z id sesji, żeby zwierzaki nie ruszały się synchronicznie. */
function phaseOf(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return (Math.abs(h) % 1000) / 1000 * 3;
}

export class Roster {
  private entries = new Map<string, Entry>();

  get(id: string): Entry | undefined { return this.entries.get(id); }

  sync(sessions: Session[], t: number): void {
    const seen = new Set<string>();
    for (const s of sessions) {
      const scene = sceneFor(s);
      const e = this.entries.get(s.id);
      if (!e) {
        if (scene === 'bye') continue;
        this.entries.set(s.id, { session: s, pet: createPet(skinFor(s.agent), scene), scene, born: t, phase: phaseOf(s.id) });
        seen.add(s.id);
        continue;
      }
      seen.add(s.id);
      e.session = s;
      if (e.scene !== scene) {
        setScene(e.pet, scene);
        e.scene = scene;
        e.byeAt = scene === 'bye' ? t : undefined;
      }
    }
    for (const id of [...this.entries.keys()]) if (!seen.has(id)) this.entries.delete(id);
  }

  alpha(e: Entry, t: number): number {
    const fadeIn = Math.min(1, Math.max(0, (t - e.born) / FADE_IN));
    if (e.byeAt == null) return fadeIn;
    return fadeIn * (1 - Math.min(1, Math.max(0, (t - e.byeAt - BYE_WAVE) / BYE_FADE)));
  }
}
```

- [ ] **Step 4: Most `bridge.ts`**

```ts
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import type { PointerMsg, Snapshot, StageLayout, TooltipContent } from '../types';

export interface Bridge {
  /** Po zarejestrowaniu nasłuchu: zgłasza gotowość i zwraca bieżącą migawkę. */
  start(): Promise<Snapshot | null>;
  onSnapshot(cb: (s: Snapshot) => void): void;
  onLayout(cb: (l: StageLayout) => void): void;
  onVisibility(cb: (v: boolean) => void): void;
  onPointer(cb: (p: PointerMsg) => void): void;
  setWidth(css: number): void;
  showTooltip(anchorX: number, content: TooltipContent): void;
  hideTooltip(): void;
}

export function tauriBridge(): Bridge {
  const subs: Promise<unknown>[] = [];
  const on = <T>(ev: string, cb: (v: T) => void) => { subs.push(listen<T>(ev, e => cb(e.payload))); };
  return {
    async start() {
      await Promise.all(subs);
      await invoke('stage_hello');
      return invoke<Snapshot>('snapshot');
    },
    onSnapshot: cb => on('pets://snapshot', cb),
    onLayout: cb => on('pets://layout', cb),
    onVisibility: cb => on('pets://visibility', cb),
    onPointer: cb => on('pets://pointer', cb),
    setWidth: w => { void invoke('stage_set_width', { width: w }); },
    showTooltip: (anchorX, content) => { void invoke('tooltip_show', { anchorX, content }); },
    hideTooltip: () => { void invoke('tooltip_hide'); },
  };
}
```

Atrapę `fakeBridge` (dla `dev.html`) dopisz w tym samym pliku:

```ts
import { demoLimits, demoSessions } from './demo';

export function fakeBridge(canvas: HTMLCanvasElement, tip: HTMLElement,
  opts: { count: () => number; maxWidth: () => number; render: (el: HTMLElement, c: TooltipContent) => void }): Bridge {
  const snaps: ((s: Snapshot) => void)[] = [];
  const lays: ((l: StageLayout) => void)[] = [];
  const snap = (): Snapshot => ({ sessions: demoSessions(opts.count(), Date.now()), limits: demoLimits(Date.now()), now: Date.now() });
  let lastMax = -1;
  setInterval(() => snaps.forEach(cb => cb(snap())), 1000);
  setInterval(() => {
    const m = opts.maxWidth();
    if (m !== lastMax) { lastMax = m; lays.forEach(cb => cb({ max_css: m, height_css: 48, scale: 1 })); }
  }, 200);
  return {
    async start() { return snap(); },
    onSnapshot: cb => { snaps.push(cb); },
    onLayout: cb => { lays.push(cb); },
    onVisibility: () => {},
    onPointer: cb => {
      canvas.addEventListener('mousemove', e => cb({ kind: 'move', x: e.offsetX, y: e.offsetY }));
      canvas.addEventListener('mouseleave', () => cb({ kind: 'leave' }));
      canvas.addEventListener('click', e => cb({ kind: 'click', x: e.offsetX, y: e.offsetY }));
    },
    setWidth: w => { canvas.style.width = `${w}px`; },
    showTooltip: (x, content) => {
      opts.render(tip, content);
      const box = canvas.getBoundingClientRect();
      tip.style.left = `${Math.max(4, box.left + x - tip.offsetWidth / 2)}px`;
      tip.style.top = `${box.top - tip.offsetHeight - 6}px`;
    },
    hideTooltip: () => { tip.hidden = true; },
  };
}
```

- [ ] **Step 5: Dane pokazowe `demo.ts`**

```ts
import type { Limit, Session, State, Tool } from '../types';

const CYCLE: [State, Tool | null][] = [
  ['working', 'edit'], ['working', 'bash'], ['thinking', null], ['working', 'web'], ['working', 'read'],
  ['working', 'grep'], ['working', 'agent'], ['working', 'mcp'], ['needs_you', null], ['done', null],
  ['compacting', null], ['idle', null], ['sleep', null], ['error', null],
];
const TITLES = ['Refaktor parsera', 'Migracja testów', 'Research UIA', 'Lint w routerze', 'Poprawka hooków',
  'Build release', 'README', 'Nowa skórka', 'Tooltip'];
const BASE = Date.now() - 60_000;

/** `count` sesji; każda co 6 s przechodzi do następnego stanu z `CYCLE`. */
export function demoSessions(count: number, nowMs: number): Session[] {
  return Array.from({ length: count }, (_, i) => {
    const phase = Math.floor(nowMs / 6000) + i * 3;
    const [state, tool] = CYCLE[phase % CYCLE.length];
    const id = `demo-${i + 1}`;
    return {
      id, agent: i % 2 ? 'codex' : 'claude', origin: i % 3 === 2 ? 'router' : i % 2 ? 'desktop' : 'cli',
      title: `${TITLES[i % TITLES.length]}`, cwd: `C:\\work\\demo${i + 1}`, state, tool,
      progress: i % 3 === 0 ? { done: phase % 6, total: 6 } : null,
      context: i % 2 === 0 ? { used: 40_000 + i * 30_000, max: 200_000 } : null,
      started_at: BASE + i * 1000, last_activity: nowMs - i * 15_000, state_since: nowMs, turn_started_at: null,
      jump: { pid: null, session_id: id, cwd: '', app: null },
    };
  });
}

export function demoLimits(nowMs: number): Limit[] {
  return [
    { agent: 'claude', window: 'five_hour', used_pct: 34, resets_at: nowMs + 2 * 3_600_000 },
    { agent: 'claude', window: 'weekly', used_pct: 61, resets_at: nowMs + 3 * 86_400_000 },
    { agent: 'codex', window: 'five_hour', used_pct: 12, resets_at: nowMs + 4 * 3_600_000 },
    { agent: 'codex', window: 'weekly', used_pct: 91, resets_at: nowMs + 5 * 86_400_000 },
  ];
}
```

- [ ] **Step 6: Scena `stage.ts`**

```ts
import { drawPet, pen, stepPet } from '../renderer';
import type { PointerMsg, Snapshot, StageLayout } from '../types';
import type { Bridge } from './bridge';
import { drawBadge, drawLimits, drawProgress, limitBars } from './hud';
import { layout, type LayoutOut } from './layout';
import { Roster } from './roster';

const FPS = 30;

export interface StageHandle { hover: (p: PointerMsg) => void }

export function startStage(canvas: HTMLCanvasElement, bridge: Bridge): StageHandle {
  const x = canvas.getContext('2d')!;
  pen.font = getComputedStyle(document.body).fontFamily || 'sans-serif';
  let snap: Snapshot = { sessions: [], limits: [], now: 0 };
  let lay: StageLayout = { max_css: 0, height_css: 48, scale: 1 };
  let out: LayoutOut = layout({ sessions: [], hasLimits: false, maxWidth: 0 });
  let visible = true, running = false, T = 0, last = performance.now(), sentWidth = -1;
  const roster = new Roster();
  const handle: StageHandle = { hover: () => {} };

  const relayout = () => {
    out = layout({ sessions: snap.sessions, hasLimits: limitBars(snap.limits).length > 0, maxWidth: lay.max_css });
    roster.sync(snap.sessions, T);
    if (out.width !== sentWidth) { sentWidth = out.width; bridge.setWidth(out.width); }
  };

  function fit() {
    const d = devicePixelRatio || 1, w = canvas.clientWidth, h = canvas.clientHeight;
    const pw = Math.round(w * d), ph = Math.round(h * d);
    if (canvas.width !== pw || canvas.height !== ph) { canvas.width = pw; canvas.height = ph; }
    x.setTransform(d, 0, 0, d, 0, 0);
    return { w, h };
  }

  function frame() {
    if (!visible) { running = false; return; }
    const now = performance.now();
    const dt = Math.min(.05, (now - last) / 1000);
    last = now;
    T += dt;
    pen.boil = Math.floor(T * 8);
    const { w, h } = fit();
    x.clearRect(0, 0, w, h);
    const u = .3 * h / 48, Y = h - 8;
    for (const p of out.pets) {
      const e = roster.get(p.id);
      if (!e) continue;
      const tt = T + e.phase;
      stepPet(e.pet, dt, tt);
      e.pet.alpha = roster.alpha(e, T);
      drawPet(x, e.pet, p.x, Y, u, tt);
      drawProgress(x, p.x, h - 4, e.session, T);
    }
    if (out.badgeX != null) drawBadge(x, out.badgeX, h, out.hidden, pen.font);
    if (out.limitsX != null) drawLimits(x, out.limitsX, h, limitBars(snap.limits));
    setTimeout(frame, Math.max(0, 1000 / FPS - (performance.now() - now)));
  }

  function kick() {
    if (running || !visible) return;
    running = true;
    last = performance.now();
    setTimeout(frame, 0);
  }

  bridge.onSnapshot(s => { snap = s; relayout(); });
  bridge.onLayout(l => { lay = l; relayout(); });
  bridge.onVisibility(v => { visible = v; kick(); });
  bridge.onPointer(p => handle.hover(p));
  void bridge.start().then(s => { if (s) { snap = s; relayout(); } kick(); });
  return handle;
}
```

Pętla na `setTimeout` zamiast `requestAnimationFrame` daje stałe 30 kl./s niezależnie od odświeżania monitora (S2: koszt liniowy względem liczby klatek). Zwierzaki zwinięte w „+N” nie są krokowane ani rysowane.

- [ ] **Step 7: Wejścia**

`app/src/main.ts` (zastąp całość):

```ts
import { tauriBridge } from './stage/bridge';
import { startStage } from './stage/stage';

startStage(document.getElementById('stage') as HTMLCanvasElement, tauriBridge());
```

W `app/index.html` usuń `<div id="info"></div>`, regułę `#info` i atrybut `hidden` płótna.

`app/dev.html`:

```html
<!doctype html>
<html lang="pl">
<head>
<meta charset="utf-8" />
<title>Scena Agent Pets</title>
<style>
:root{--bg:#F3F3F3;--tb:#EDEDED;--txt:#3D3D3A;--mut:#8C887E;--line:#DEDEDE;--tip:#F9F9F9;--tipb:rgba(0,0,0,.1)}
@media (prefers-color-scheme: dark){:root:not([data-theme="light"]){--bg:#202020;--tb:#1C1C1C;--txt:#E8E6DE;--mut:#8C887E;--line:#333;--tip:#2C2C2C;--tipb:rgba(255,255,255,.08)}}
:root[data-theme="dark"]{--bg:#202020;--tb:#1C1C1C;--txt:#E8E6DE;--mut:#8C887E;--line:#333;--tip:#2C2C2C;--tipb:rgba(255,255,255,.08)}
body{margin:0;background:var(--bg);color:var(--txt);font-family:"Segoe UI Variable Text","Segoe UI",system-ui,sans-serif;min-height:100vh;display:flex;flex-direction:column}
.controls{display:flex;flex-wrap:wrap;gap:16px;padding:16px;font-size:13px;color:var(--mut)}
.controls label{display:flex;align-items:center;gap:8px}
.spacer{flex:1}
.taskbar{position:relative;height:48px;background:var(--tb);border-top:1px solid var(--line);display:flex;justify-content:flex-end;padding-right:8px;overflow:hidden}
canvas{display:block;height:48px;width:0}
.tip{position:fixed;background:var(--tip);border:1px solid var(--tipb);border-radius:8px;padding:8px 10px;font-size:12px;max-width:264px;box-shadow:0 4px 16px rgba(0,0,0,.18)}
.tip .title{font-weight:600;font-size:13px;margin-bottom:2px}.tip .sub{color:var(--mut);margin-bottom:4px}
</style>
</head>
<body>
<div class="controls">
  <label>Sesje <input type="range" id="count" min="0" max="9" value="7"><output id="countOut">7</output></label>
  <label>Wolne miejsce <input type="range" id="width" min="0" max="700" value="480"><output id="widthOut">480</output> px</label>
</div>
<div class="spacer"></div>
<div class="tip" id="tip" hidden></div>
<div class="taskbar"><canvas id="stage"></canvas></div>
<script type="module" src="/src/dev.ts"></script>
</body>
</html>
```

`app/src/dev.ts`:

```ts
import { fakeBridge } from './stage/bridge';
import { startStage } from './stage/stage';
import type { TooltipContent } from './types';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const count = $<HTMLInputElement>('count'), width = $<HTMLInputElement>('width');
count.oninput = () => { $('countOut').textContent = count.value; };
width.oninput = () => { $('widthOut').textContent = width.value; };

// Podmieniane w tasku 9 na wspólny renderTooltip z src/tooltip/view.ts.
const render = (el: HTMLElement, c: TooltipContent) => { el.textContent = `${c.title} · ${c.lines.join(' · ')}`; el.hidden = false; };

startStage($<HTMLCanvasElement>('stage'), fakeBridge($<HTMLCanvasElement>('stage'), $('tip'),
  { count: () => +count.value, maxWidth: () => +width.value, render }));
```

W `vite.config.ts` rozszerz `input` o `dev: page('dev.html')`.

- [ ] **Step 8: Testy i podgląd**

Run: `pnpm test; pnpm typecheck; cargo test --workspace`
Expected: PASS.

Podgląd w przeglądarce: `pnpm dev`, potem `http://localhost:1420/dev.html`. Sprawdź:
1. Siedem sesji daje pięć zwierzaków, plakietkę „+2” i paski limitów. Tygodniowy limit Codexa jest czerwony (91%).
2. Suwak „Wolne miejsce” w dół: zwierzaków ubywa, „+N” rośnie. Pierwszy zwierzak nigdy nie jest ucięty z lewej.
3. Co 6 s zwierzaki zmieniają sceny, a pasek postępu pulsuje u sesji bez listy.
4. Sesje 0: płótno ma szerokość 26 px (same limity).

Na żywo: `$env:AGENT_PETS_REPLAY="$PWD\demo\many-sessions.jsonl"; pnpm tauri dev`. W pasku 5 zwierzaków + „+2” + limity, w stanach z nagrania. Potem bez zmiennej: zwierzaki prawdziwych sesji, a ta rozmowa pokazuje `bash`/`edit` przy moich narzędziach.

- [ ] **Step 9: Commit**

```bash
git add app
git commit -m "feat(stage): live taskbar stage with pets, progress, limits, +N badge at 30 fps; browser dev preview"
```

---

### Task 9: Mysz i tooltip

**Files:**
- Create: `app/src-tauri/src/shell/pointer.rs`, `app/src-tauri/src/tooltip.rs`
- Create: `app/src/tooltip/text.ts`, `text.test.ts`, `view.ts`, `main.ts`, `app/tooltip.html`, `app/src/stage/hover.ts`
- Modify:
  - `app/src-tauri/src/shell/mod.rs` (`pub mod pointer;` i start wątku w `Shell::start`);
  - `app/src-tauri/src/lib.rs` (tooltip: stan, okno, komendy);
  - `app/src/stage/stage.ts` (podpięcie `Hover`);
  - `app/src/dev.ts` (wspólny `renderTooltip`);
  - `app/vite.config.ts` (wejście `tooltip`).

**Interfaces:**
- Consumes:
  - `Shell::stage`, `Shell::stage_origin()`, `shell::screen_size()`, `shell::show_no_activate()`;
  - `hitTest`, `LayoutOut`, `Bridge`, `StageHandle`.
- Produces:
  - Rust:
    - `pointer::{Sample, PointerEvent, diff(&Sample, &Sample) -> Vec<PointerEvent>, spawn(AppHandle, Arc<AtomicIsize>)}`;
    - komendy `tooltip_show(anchor_x, content)`, `tooltip_size(seq, w, h)`, `tooltip_hide`;
    - `tooltip::build(&AppHandle)`, `tooltip::Tooltip` (stan);
  - TS:
    - `petTooltip(s, nowMs)`, `limitsTooltip(limits, nowMs)`, `badgeTooltip(sessions)`;
    - `formatAgo(ms)`, `formatReset(resetsAt, nowMs)`, `actionLabel(s)`;
    - `renderTooltip(el, content)`;
    - klasa `Hover`.

- [ ] **Step 1: Testy `pointer.rs`** (na końcu pliku)

```rust
#[cfg(test)]
mod tests {
    use super::*;

    fn at(x: f64, y: f64) -> Sample { Sample { inside: true, x, y, left: false, right: false } }

    #[test]
    fn enter_move_and_leave() {
        let out = Sample::default();
        assert_eq!(diff(&out, &at(10.0, 20.0)), vec![PointerEvent::Move { x: 10.0, y: 20.0 }]);
        assert!(diff(&at(10.0, 20.0), &at(10.0, 20.0)).is_empty());
        assert_eq!(diff(&at(10.0, 20.0), &at(11.0, 20.0)), vec![PointerEvent::Move { x: 11.0, y: 20.0 }]);
        assert_eq!(diff(&at(11.0, 20.0), &out), vec![PointerEvent::Leave]);
    }

    #[test]
    fn click_only_on_the_press_edge_inside() {
        let down = Sample { left: true, ..at(5.0, 5.0) };
        assert_eq!(diff(&at(5.0, 5.0), &down), vec![PointerEvent::Click { x: 5.0, y: 5.0 }]);
        assert!(diff(&down, &down).is_empty());
        // wciśnięty poza sceną i przeciągnięty do środka: to nie jest kliknięcie
        let outside_down = Sample { inside: false, left: true, ..Sample::default() };
        assert_eq!(diff(&outside_down, &down), vec![PointerEvent::Move { x: 5.0, y: 5.0 }]);
    }

    #[test]
    fn right_button_is_a_context_click() {
        let r = Sample { right: true, ..at(3.0, 4.0) };
        assert_eq!(diff(&at(3.0, 4.0), &r), vec![PointerEvent::Context { x: 3.0, y: 4.0 }]);
    }

    #[test]
    fn serializes_for_the_ui() {
        assert_eq!(serde_json::to_string(&PointerEvent::Leave).unwrap(), r#"{"kind":"leave"}"#);
        assert_eq!(serde_json::to_string(&PointerEvent::Move { x: 1.0, y: 2.0 }).unwrap(), r#"{"kind":"move","x":1.0,"y":2.0}"#);
    }
}
```

- [ ] **Step 2: Implementuj `pointer.rs`** (góra pliku)

```rust
//! Natywna mysz: WebView2 osadzony w oknie innego procesu nie dostaje zdarzeń DOM (spike S1),
//! więc co 30 ms czytamy kursor i przyciski i wysyłamy `pets://pointer` w pikselach CSS sceny.
use serde::Serialize;
use std::sync::atomic::{AtomicIsize, Ordering};
use std::sync::Arc;
use std::time::Duration;
use tauri::{AppHandle, Emitter};

#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct Sample { pub inside: bool, pub x: f64, pub y: f64, pub left: bool, pub right: bool }

#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum PointerEvent { Move { x: f64, y: f64 }, Leave, Click { x: f64, y: f64 }, Context { x: f64, y: f64 } }

pub fn diff(prev: &Sample, cur: &Sample) -> Vec<PointerEvent> {
    let mut out = Vec::new();
    if cur.inside {
        if !prev.inside || prev.x != cur.x || prev.y != cur.y { out.push(PointerEvent::Move { x: cur.x, y: cur.y }); }
        if cur.left && !prev.left && prev.inside { out.push(PointerEvent::Click { x: cur.x, y: cur.y }); }
        if cur.right && !prev.right && prev.inside { out.push(PointerEvent::Context { x: cur.x, y: cur.y }); }
    } else if prev.inside {
        out.push(PointerEvent::Leave);
    }
    out
}

pub fn spawn(app: AppHandle, stage: Arc<AtomicIsize>) {
    std::thread::spawn(move || {
        let mut prev = Sample::default();
        loop {
            std::thread::sleep(Duration::from_millis(30));
            let cur = sample(stage.load(Ordering::Relaxed)).unwrap_or_default();
            for e in diff(&prev, &cur) { let _ = app.emit("pets://pointer", e); }
            prev = cur;
        }
    });
}

fn sample(raw: isize) -> Option<Sample> {
    use windows::Win32::Foundation::{POINT, RECT};
    use windows::Win32::UI::HiDpi::GetDpiForWindow;
    use windows::Win32::UI::Input::KeyboardAndMouse::{GetAsyncKeyState, VIRTUAL_KEY, VK_LBUTTON, VK_RBUTTON};
    use windows::Win32::UI::WindowsAndMessaging::{GetCursorPos, GetWindowRect, IsChild, WindowFromPoint};
    if raw == 0 { return None; }
    let h = super::taskbar::hwnd(raw);
    unsafe {
        let mut r = RECT::default();
        GetWindowRect(h, &mut r).ok()?;
        let mut p = POINT::default();
        GetCursorPos(&mut p).ok()?;
        let hit = WindowFromPoint(p);
        let inside = p.x >= r.left && p.x < r.right && p.y >= r.top && p.y < r.bottom && (hit == h || IsChild(h, hit).as_bool());
        let dpi = GetDpiForWindow(h);
        let scale = if dpi == 0 { 1.0 } else { dpi as f64 / 96.0 };
        let down = |vk: VIRTUAL_KEY| (GetAsyncKeyState(vk.0 as i32) as u16 & 0x8000) != 0;
        Some(Sample {
            inside,
            x: ((p.x - r.left) as f64 / scale).round(),
            y: ((p.y - r.top) as f64 / scale).round(),
            left: down(VK_LBUTTON),
            right: down(VK_RBUTTON),
        })
    }
}
```

W `shell/mod.rs` dopisz `pub mod pointer;`. W `Shell::start`, przed `Ok(...)`, dodaj `pointer::spawn(app.clone(), stage.clone());`. `taskbar::hwnd` musi być `pub(super)` lub `pub`; już jest `pub`.

- [ ] **Step 3: Testy treści tooltipa `app/src/tooltip/text.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import type { Session } from '../types';
import { actionLabel, badgeTooltip, formatAgo, formatReset, limitsTooltip, petTooltip } from './text';

const base: Session = {
  id: 's', agent: 'claude', origin: 'cli', title: 'Widżet w pasku', cwd: 'C:\\work\\agent-pets', state: 'working',
  tool: 'bash', progress: { done: 2, total: 5 }, context: { used: 50_000, max: 200_000 }, started_at: 0,
  last_activity: 100_000, state_since: 0, turn_started_at: null, jump: { pid: null, session_id: 's', cwd: '', app: null },
};

describe('petTooltip', () => {
  it('shows title, agent, action, progress, context and quiet time', () => {
    expect(petTooltip(base, 220_000)).toEqual({
      title: 'Widżet w pasku',
      subtitle: 'Claude Code · CLI',
      lines: ['Uruchamia komendy', 'Zadania: 2/5', 'Kontekst: 25%', 'Ostatnia aktywność: 2 min temu'],
    });
  });
  it('falls back to the folder name, then to a placeholder', () => {
    expect(petTooltip({ ...base, title: '' }, 100_000).title).toBe('agent-pets');
    expect(petTooltip({ ...base, title: '', cwd: '' }, 100_000).title).toBe('Sesja bez tytułu');
  });
  it('cuts prompt-long titles to 80 characters', () => {
    const t = petTooltip({ ...base, title: 'x'.repeat(200) }, 100_000).title;
    expect(t).toHaveLength(80);
    expect(t.endsWith('…')).toBe(true);
  });
  it('skips context with max 0 and progress with total 0', () => {
    const lines = petTooltip({ ...base, context: { used: 5, max: 0 }, progress: { done: 0, total: 0 } }, 100_000).lines;
    expect(lines.some(l => l.startsWith('Kontekst'))).toBe(false);
    expect(lines.some(l => l.startsWith('Zadania'))).toBe(false);
  });
  it('names origins and unknown values safely', () => {
    expect(petTooltip({ ...base, agent: 'codex', origin: 'router' }, 0).subtitle).toBe('Codex · Agent Router');
    expect(actionLabel({ state: 'paused' as never, tool: null })).toBe('Pracuje');
  });
});

describe('formatting', () => {
  it('formatAgo', () => {
    expect(formatAgo(3_000)).toBe('teraz');
    expect(formatAgo(42_000)).toBe('42 s temu');
    expect(formatAgo(7 * 60_000)).toBe('7 min temu');
    expect(formatAgo(3 * 3_600_000 + 5)).toBe('3 h temu');
  });
  it('formatReset uses local time, a weekday beyond 24 h, and handles the past', () => {
    const now = new Date(2026, 8, 24, 12, 0).getTime();
    expect(formatReset(new Date(2026, 8, 24, 17, 5).getTime(), now)).toBe('reset 17:05');
    expect(formatReset(new Date(2026, 8, 26, 9, 0).getTime(), now)).toBe('reset sob 09:00');
    expect(formatReset(now - 1, now)).toBe('reset wkrótce');
    expect(formatReset(null, now)).toBe('');
  });
  it('limitsTooltip clamps and orders', () => {
    const now = new Date(2026, 8, 24, 12, 0).getTime();
    const t = limitsTooltip([
      { agent: 'codex', window: 'weekly', used_pct: 140, resets_at: null },
      { agent: 'claude', window: 'five_hour', used_pct: 34.4, resets_at: new Date(2026, 8, 24, 17, 5).getTime() },
    ], now);
    expect(t.title).toBe('Limity');
    expect(t.lines).toEqual(['Claude · 5h: 34% · reset 17:05', 'Codex · tydzień: 100%']);
  });
  it('badgeTooltip lists hidden sessions', () => {
    const t = badgeTooltip([base, { ...base, id: 'b', title: 'Druga' }]);
    expect(t.title).toBe('Jeszcze 2 sesje');
    expect(t.lines).toEqual(['Widżet w pasku · Uruchamia komendy', 'Druga · Uruchamia komendy']);
  });
});
```

- [ ] **Step 4: Uruchom i sprawdź, że pada**

Run: `cargo test -p agent-pets pointer; cd app; pnpm test`
Expected:
- Rust: 4 PASS po stepie 2;
- TS: FAIL (brak `./text`).

- [ ] **Step 5: Implementuj `app/src/tooltip/text.ts`**

```ts
import type { Limit, Session, TooltipContent } from '../types';
import { clampPct, progressFraction } from '../stage/hud';

const AGENT: Record<string, string> = { claude: 'Claude Code', codex: 'Codex' };
const ORIGIN: Record<string, string> = { cli: 'CLI', desktop: 'aplikacja', router: 'Agent Router' };
const TOOL: Record<string, string> = {
  edit: 'Edytuje pliki', bash: 'Uruchamia komendy', read: 'Czyta plik', grep: 'Przeszukuje kod',
  web: 'Szuka w sieci', agent: 'Zleca subagentowi', mcp: 'Używa narzędzia MCP', other: 'Pracuje',
};
const STATE: Record<string, string> = {
  thinking: 'Myśli', needs_you: 'Czeka na Ciebie', done: 'Skończył', error: 'Błąd', idle: 'Bezczynny',
  sleep: 'Śpi', compacting: 'Kompaktuje kontekst', ended: 'Zakończył sesję',
};
const WINDOW: Record<string, string> = { five_hour: '5h', weekly: 'tydzień' };
const DAYS = ['nd', 'pn', 'wt', 'śr', 'czw', 'pt', 'sob'];

const cut = (s: string, n: number) => ([...s].length <= n ? s : [...s].slice(0, n - 1).join('') + '…');
const basename = (p: string) => p.split(/[\\/]/).filter(Boolean).pop() ?? '';
const pad = (n: number) => String(n).padStart(2, '0');

export function actionLabel(s: Pick<Session, 'state' | 'tool'>): string {
  if (s.state === 'working') return TOOL[s.tool ?? 'other'] ?? TOOL.other;
  return STATE[s.state] ?? TOOL.other;
}

export function formatAgo(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  if (s < 10) return 'teraz';
  if (s < 60) return `${s} s temu`;
  if (s < 3600) return `${Math.floor(s / 60)} min temu`;
  return `${Math.floor(s / 3600)} h temu`;
}

export function formatReset(resetsAt: number | null, nowMs: number): string {
  if (resetsAt == null) return '';
  if (resetsAt <= nowMs) return 'reset wkrótce';
  const d = new Date(resetsAt);
  const hm = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  return resetsAt - nowMs < 86_400_000 ? `reset ${hm}` : `reset ${DAYS[d.getDay()]} ${hm}`;
}

export function petTooltip(s: Session, nowMs: number): TooltipContent {
  const lines = [actionLabel(s)];
  const f = progressFraction(s.progress);
  if (f != null && s.progress) lines.push(`Zadania: ${s.progress.done}/${s.progress.total}`);
  if (s.context && s.context.max > 0) lines.push(`Kontekst: ${Math.round(clampPct(s.context.used * 100 / s.context.max))}%`);
  lines.push(`Ostatnia aktywność: ${formatAgo(nowMs - s.last_activity)}`);
  return {
    title: cut(s.title || basename(s.cwd) || 'Sesja bez tytułu', 80),
    subtitle: `${AGENT[s.agent] ?? s.agent} · ${ORIGIN[s.origin] ?? s.origin}`,
    lines,
  };
}

export function limitsTooltip(limits: Limit[], nowMs: number): TooltipContent {
  const lines: string[] = [];
  for (const agent of ['claude', 'codex']) for (const window of ['five_hour', 'weekly']) {
    const l = limits.find(v => v.agent === agent && v.window === window);
    if (!l || !Number.isFinite(l.used_pct)) continue;
    const reset = formatReset(l.resets_at, nowMs);
    lines.push(`${agent === 'claude' ? 'Claude' : 'Codex'} · ${WINDOW[window]}: ${Math.round(clampPct(l.used_pct))}%${reset ? ` · ${reset}` : ''}`);
  }
  return { title: 'Limity', subtitle: '', lines };
}

export function badgeTooltip(hidden: Session[]): TooltipContent {
  const n = hidden.length;
  const noun = n === 1 ? 'sesja' : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? 'sesje' : 'sesji';
  return {
    title: `Jeszcze ${n} ${noun}`,
    subtitle: '',
    lines: hidden.slice(0, 6).map(s => `${cut(s.title || basename(s.cwd) || 'Sesja bez tytułu', 40)} · ${actionLabel(s)}`),
  };
}
```

- [ ] **Step 6: Widok i okno tooltipa**

`app/src/tooltip/view.ts`:

```ts
import type { TooltipContent } from '../types';

/** Tytuły sesji to treść promptów: wyłącznie `textContent`, nigdy `innerHTML`. */
export function renderTooltip(el: HTMLElement, c: TooltipContent): void {
  const row = (cls: string, text: string) => {
    const d = document.createElement('div');
    d.className = cls;
    d.textContent = text;
    return d;
  };
  el.replaceChildren(row('title', c.title), ...(c.subtitle ? [row('sub', c.subtitle)] : []), ...c.lines.map(l => row('line', l)));
  el.hidden = false;
}
```

`app/tooltip.html`:

```html
<!doctype html>
<html lang="pl">
<head>
<meta charset="utf-8" />
<title>agent-pets-tooltip</title>
<style>
:root{--tip:#F9F9F9;--tipb:rgba(0,0,0,.12);--txt:#1F1F1F;--mut:#6B6A63}
@media (prefers-color-scheme: dark){:root:not([data-theme="light"]){--tip:#2C2C2C;--tipb:rgba(255,255,255,.1);--txt:#F3F3F3;--mut:#A5A298}}
:root[data-theme="dark"]{--tip:#2C2C2C;--tipb:rgba(255,255,255,.1);--txt:#F3F3F3;--mut:#A5A298}
html,body{margin:0;padding:0;background:transparent;overflow:hidden}
body{font-family:"Segoe UI Variable Text","Segoe UI",system-ui,sans-serif}
#tip{display:inline-block;box-sizing:border-box;max-width:264px;background:var(--tip);color:var(--txt);border:1px solid var(--tipb);border-radius:8px;padding:8px 10px;font-size:12px;line-height:1.4}
#tip .title{font-weight:600;font-size:13px;overflow-wrap:anywhere}
#tip .sub{color:var(--mut);margin-bottom:4px}
</style>
</head>
<body>
<div id="tip" hidden></div>
<script type="module" src="/src/tooltip/main.ts"></script>
</body>
</html>
```

`app/src/tooltip/main.ts`:

```ts
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import type { TooltipContent } from '../types';
import { renderTooltip } from './view';

const box = document.getElementById('tip')!;
void listen<{ seq: number; content: TooltipContent }>('tooltip://content', async e => {
  renderTooltip(box, e.payload.content);
  const r = box.getBoundingClientRect();
  await invoke('tooltip_size', { seq: e.payload.seq, w: Math.ceil(r.width), h: Math.ceil(r.height) });
});
```

W `vite.config.ts` dodaj `tooltip: page('tooltip.html')` do `input`. W `dev.ts` zastąp lokalny `render` importem `renderTooltip` z `./tooltip/view`.

- [ ] **Step 7: `tooltip.rs`**

```rust
//! Okno tooltipa nad paskiem (scena ma wysokość paska, więc tooltip to osobne okno).
//! Przepływ: scena → `tooltip_show` → treść do okna → okno mierzy się → `tooltip_size` → pozycja i pokazanie.
use crate::shell::{self, Shell};
use serde::Serialize;
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager, PhysicalPosition, PhysicalSize, State, WebviewUrl, WebviewWindowBuilder};

#[derive(Default)]
pub struct Tooltip { inner: Mutex<Anchor> }

#[derive(Default, Clone, Copy)]
struct Anchor { seq: u64, x: i32, top: i32, scale: f64, open: bool }

#[derive(Serialize, Clone)]
struct ContentMsg { seq: u64, content: serde_json::Value }

pub fn build(app: &AppHandle) -> tauri::Result<()> {
    let w = WebviewWindowBuilder::new(app, "tooltip", WebviewUrl::App("tooltip.html".into()))
        .title("agent-pets-tooltip").inner_size(280.0, 120.0).decorations(false).transparent(true)
        .always_on_top(true).skip_taskbar(true).resizable(false).shadow(false).focused(false).visible(false)
        .build()?;
    w.set_ignore_cursor_events(true)?;
    Ok(())
}

#[tauri::command]
pub fn tooltip_show(app: AppHandle, tip: State<Tooltip>, shell: State<Shell>, anchor_x: f64, content: serde_json::Value) {
    let Some((left, top, scale)) = shell.stage_origin() else { return };
    let seq = {
        let mut a = tip.inner.lock().unwrap();
        a.seq += 1;
        *a = Anchor { seq: a.seq, x: left + (anchor_x * scale).round() as i32, top, scale, open: true };
        a.seq
    };
    let _ = app.emit_to("tooltip", "tooltip://content", ContentMsg { seq, content });
}

#[tauri::command]
pub fn tooltip_size(app: AppHandle, tip: State<Tooltip>, seq: u64, w: f64, h: f64) {
    let a = *tip.inner.lock().unwrap();
    if !a.open || a.seq != seq { return; } // spóźniona odpowiedź na starą treść albo tooltip już schowany
    let Some(win) = app.get_webview_window("tooltip") else { return };
    let (pw, ph) = ((w * a.scale).round() as i32, (h * a.scale).round() as i32);
    let (sw, _) = shell::screen_size();
    let x = (a.x - pw / 2).clamp(4, (sw - pw - 4).max(4));
    let y = a.top - ph - (6.0 * a.scale).round() as i32;
    let _ = win.set_size(PhysicalSize::new(pw.max(1) as u32, ph.max(1) as u32));
    let _ = win.set_position(PhysicalPosition::new(x, y));
    shell::show_no_activate(&win);
}

#[tauri::command]
pub fn tooltip_hide(app: AppHandle, tip: State<Tooltip>) {
    tip.inner.lock().unwrap().open = false;
    if let Some(win) = app.get_webview_window("tooltip") { let _ = win.hide(); }
}
```

W `lib.rs`:
- dodaj `mod tooltip;`;
- w `setup` dodaj `app.manage(tooltip::Tooltip::default()); tooltip::build(app.handle())?;`;
- rozszerz `invoke_handler` o `tooltip::tooltip_show, tooltip::tooltip_size, tooltip::tooltip_hide`.

- [ ] **Step 8: Najechanie `app/src/stage/hover.ts`**

```ts
import { badgeTooltip, limitsTooltip, petTooltip } from '../tooltip/text';
import type { PointerMsg, Session, Snapshot } from '../types';
import type { Bridge } from './bridge';
import { hitTest } from './hit';
import type { LayoutOut } from './layout';

interface View { out: LayoutOut; snap: Snapshot; height: number; nowMs: number }

/** Tooltip po najechaniu; treść odświeża się co sekundę (czas od ostatniej aktywności). */
export class Hover {
  private x = -1;
  private y = -1;
  private key = '';
  private sentAt = 0;

  constructor(private bridge: Bridge, private view: () => View) {}

  pointer(p: PointerMsg): void {
    if (p.kind === 'leave') { this.clear(); return; }
    if (p.kind === 'move') { this.x = p.x; this.y = p.y; this.refresh(); }
  }

  refresh(force = false): void {
    if (this.x < 0) return;
    const { out, snap, height, nowMs } = this.view();
    const t = hitTest(out, this.x, this.y, height);
    if (!t) { this.hide(); return; }
    const key = t.kind === 'pet' ? `pet:${t.id}` : t.kind;
    if (!force && key === this.key && Date.now() - this.sentAt < 1000) return;
    let content;
    if (t.kind === 'pet') {
      const s = snap.sessions.find(v => v.id === t.id);
      if (!s) { this.hide(); return; }
      content = petTooltip(s, nowMs);
    } else if (t.kind === 'limits') {
      content = limitsTooltip(snap.limits, nowMs);
    } else {
      const hidden = out.hiddenIds.map(id => snap.sessions.find(v => v.id === id)).filter((v): v is Session => !!v);
      content = badgeTooltip(hidden);
    }
    this.key = key;
    this.sentAt = Date.now();
    this.bridge.showTooltip(t.x, content);
  }

  clear(): void { this.x = this.y = -1; this.hide(); }

  private hide(): void {
    if (!this.key) return;
    this.key = '';
    this.bridge.hideTooltip();
  }
}
```

W `stage.ts`:

```ts
import { Hover } from './hover';
// ...wewnątrz startStage, po `const roster = new Roster();`:
let clockOffset = 0;
const hover = new Hover(bridge, () => ({ out, snap, height: lay.height_css, nowMs: Date.now() + clockOffset }));
handle.hover = p => hover.pointer(p);
setInterval(() => hover.refresh(), 1000);
```

Dalsze zmiany w `stage.ts`:
- w `bridge.onSnapshot` i w `start().then` ustaw `clockOffset = s.now - Date.now()` przed `relayout()`;
- na końcu `relayout()` wywołaj `hover.refresh(true)`;
- w `bridge.onVisibility` przy `v === false` wywołaj `hover.clear()`.

- [ ] **Step 9: Testy i weryfikacja ręczna**

Run: `pnpm test; pnpm typecheck; cargo test --workspace`
Expected: PASS.

Podgląd w przeglądarce (`/dev.html`): najechanie na zwierzaka pokazuje tooltip nad paskiem. Najechanie na limity pokazuje listę limitów z godziną resetu, a na „+N” listę zwiniętych sesji.

W pasku (`pnpm tauri dev`, najlepiej z nagraniem pokazowym):
1. Tooltip pojawia się nad zwierzakiem, nie kradnie fokusu (kursor w edytorze dalej miga) i znika po zjechaniu z paska.
2. Tooltip przy prawej krawędzi ekranu nie wychodzi poza ekran.
3. Czas „Ostatnia aktywność” odświeża się co sekundę bez migania.

- [ ] **Step 10: Commit**

```bash
git add app
git commit -m "feat(stage): native pointer tracking and hover tooltip window"
```

---

### Task 10: Pomiar CPU, checklista fazy 2, README

**Files:**
- Create: `tools/cpu.ps1` (uogólnienie `spikes/taskbar-embed/cpu.ps1` o nazwę procesu)
- Modify: `docs/phase2-verification.md`, `README.md`

- [ ] **Step 1: `tools/cpu.ps1`**

```powershell
# Średnie CPU (% całej maszyny) procesu i jego potomków (WebView2) przez N sekund.
# Użycie: tools\cpu.ps1 [-Name agent-pets] [-Seconds 30]
param([string]$Name = "agent-pets", [int]$Seconds = 30)
$root = Get-Process $Name -ErrorAction Stop | Select-Object -First 1
$all = Get-CimInstance Win32_Process
function Kids($ppid) { $all | Where-Object { $_.ParentProcessId -eq $ppid } | ForEach-Object { $_.ProcessId; Kids $_.ProcessId } }
$ids = @($root.Id) + @(Kids $root.Id)
$sum = { ($ids | ForEach-Object { (Get-Process -Id $_ -ErrorAction SilentlyContinue).TotalProcessorTime.TotalMilliseconds } | Measure-Object -Sum).Sum }
$t0 = & $sum
Start-Sleep -Seconds $Seconds
$t1 = & $sum
$cores = [Environment]::ProcessorCount
$pct = ($t1 - $t0) / ($Seconds * 1000) / $cores * 100
"procesy: $($ids.Count), rdzenie: $cores, CPU srednio: {0:N2}% maszyny ({1:N1}% jednego rdzenia)" -f $pct, ($pct * $cores)
```

- [ ] **Step 2: Pomiar**

Zbuduj wydanie (`cd app; pnpm tauri build`; `bundle.active` jest `false`, więc powstaje sam plik `target\release\agent-pets.exe`). Uruchom z nagraniem pokazowym (5 widocznych zwierzaków). Zmierz: `powershell -File tools\cpu.ps1 -Seconds 30`.
Expected: < 2% maszyny. Przy przekroczeniu nie zmieniaj budżetu: zgłoś wynik i zaproponuj obniżenie klatek dla `idle`/`sleep` (spec 11).

Drugi pomiar: aplikacja pełnoekranowa (np. film w przeglądarce, F11). Expected: CPU bliskie 0, bo rysowanie jest wstrzymane.

- [ ] **Step 3: Checklista `docs/phase2-verification.md`**

Uzupełnij plik z tasku 7 tabelą wyników (wiersz: sprawdzenie, jak, wynik, data). Wszystkie sprawdzenia:
1. Pierwszy zwierzak nie jest ucinany z lewej: 1, 3, 5 i 7 sesji; skala 100% i 150%.
2. Scena nie wchodzi na ikony aplikacji: dużo ikon, skala 150%, pasek wyrównany do lewej (Ustawienia → Pasek zadań, zmienia użytkownik).
3. Restart Explorera: scena wraca, tooltip działa po powrocie.
4. DPI 100 / 150 / 200%.
5. Autoukrywanie paska.
6. Aplikacja pełnoekranowa wstrzymuje rysowanie.
7. Przepełnienie: 7 sesji to 5 zwierzaków i „+2”; `needs_you` i `error` zawsze widoczne.
8. Pasek postępu: procent z listą, pulsowanie bez listy.
9. Limity: widoczne tylko z danymi; ≥ 90% na czerwono.
10. Tooltip: treść, brak kradzieży fokusu, nie wychodzi poza ekran.
11. Sesja kończy się (`/exit` w Claude Code): zwierzak macha i znika w ok. 1,5 s.
12. Sesja `compacting` (`/compact`): scena wysiłku z potem.
13. CPU < 2% (wynik z kroku 2).
14. Tray: „Zakończ Agent Pets” zamyka aplikację.
15. Kilka monitorów: scena tylko na głównym.

Wynik każdego wiersza wpisuje ten, kto sprawdzał. Punkty, których nie da się sprawdzić na tej maszynie (np. kilka monitorów), zostają oznaczone „niesprawdzone” z powodem.

- [ ] **Step 4: README**

W `README.md`:
- **Tabela „What works now”:** wiersz „Taskbar stage with live pets, tooltip, overflow” na ✅. Panel, „jump to session” i powiadomienia zostają ⏳.
- **Requirements:** Node 22 i pnpm 10 są wymagane (nie opcjonalne).
- **Nowa sekcja „Run the taskbar pets”:**

  ```powershell
  cd app
  pnpm install
  pnpm tauri dev                                   # live sessions
  $env:AGENT_PETS_REPLAY="$PWD\demo\many-sessions.jsonl"; pnpm tauri dev   # demo recording
  pnpm dev   # then open http://localhost:1420/dev.html for a browser preview with demo data
  ```

  Z uwagami:
  - zamykanie: ikona w trayu → „Zakończ Agent Pets”;
  - aplikacja i `pets-cli run` nie mogą działać naraz.
- **„See the pets”:** usuń podsekcję o spike'u. Zostaje prototyp oraz nowe polecenia.
- **Project layout:** dopisz linię `app/  Tauri app: taskbar stage, renderer, tooltip`.
- **Roadmap:** faza 2 przekreślona.

- [ ] **Step 5: Pełna weryfikacja i commit**

Run: `cargo test --workspace; cd app; pnpm test; pnpm typecheck; pnpm build`
Expected: wszystko PASS, build bez błędów.

```bash
git add tools/cpu.ps1 docs/phase2-verification.md README.md
git commit -m "docs: phase 2 verification checklist, CPU measurement, README for the taskbar app"
```
