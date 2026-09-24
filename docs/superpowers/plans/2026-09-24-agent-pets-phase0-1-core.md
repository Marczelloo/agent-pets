# Agent Pets: faza 0 (spike'i) i faza 1 (rdzeń danych). Plan implementacji

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Cel:** zbudować rdzeń danych, czyli jeden binarny `pets-cli` i `hook.exe`. Rdzeń na żywo zbiera zdarzenia z Claude Code i Codexa, prowadzi maszynę stanów sesji i limitów oraz pokazuje je w terminalu. Wcześniej spike'i odpowiadają na pytania S1–S5 ze specyfikacji.

**Architektura:** cała logika siedzi w bibliotece `pets-core` (model, maszyna stanów, adaptery, parsery, czytnik końcówek plików). Biblioteka nie ma zależności od UI i jest w pełni testowalna. `pets-hook` to minimalny klient HTTP wywoływany przez hooki Claude Code. `pets-cli` składa rdzeń w działający proces: serwer ingest, obserwatory plików, tick zegara, wydruk stanu, `replay`, instalacja hooków. Aplikacja Tauri z fazy 2 będzie używać `pets-core` bez zmian.

**Stos:** Rust 1.93 (edition 2021), `serde`/`serde_json`, `anyhow`, `notify` 6, `tiny_http` 0.12, `ureq` 2, `rand` 0.8, `dirs` 5, `windows-sys` 0.59, `tempfile` (tylko testy).

**Specyfikacja:** `docs/superpowers/specs/2026-09-24-agent-pets-design.md`

**Kolejne plany** (pisane po spike'ach): faza 2 (scena i maskotki w Tauri), faza 3 (panel, przejście do sesji, toasty), faza 4 (Agent Router), faza 5 (wykończenie).

## Global Constraints

- Tylko Windows 11. Ścieżki domowe przez `dirs::home_dir()`, dane aplikacji w `%APPDATA%\agent-pets\` (`dirs::config_dir()`).
- Ingest słucha wyłącznie na `127.0.0.1`, na losowym porcie. Każde żądanie wymaga nagłówka `Authorization: Bearer <token>`. Port i token leżą w `%APPDATA%\agent-pets\endpoint.json`.
- `hook.exe`: limit 300 ms na całe wysłanie, zawsze kod wyjścia 0, nic nie wypisuje na stdout ani stderr.
- Bez żadnego ruchu sieciowego poza `127.0.0.1`.
- Z transkryptów przechowujemy tylko tytuł, postęp i liczniki tokenów. Nigdy treść wiadomości.
- Czasy w milisekundach epoki Unix (`i64`).
- Minimalny czas stanu: 600 ms.
- Progi czasowe:

  | Przejście | Próg |
  |---|---|
  | `done` → `idle` | 2 min |
  | `thinking`/`working` bez zdarzeń → `idle` | 10 min |
  | `idle` → `sleep` | 10 min |
  | brak zdarzeń → `ended` | 30 min |
  | `ended` → usunięcie | 1,5 s |

- Codex: wątki z `thread_source == "subagent"` nie dostają własnego zwierzaka. Ich aktywność to akcja `agent` wątku rodzica, jeśli rodzic jest znany; w przeciwnym razie są pomijane.
- Codex: `originator == "agent-router"` oznacza `Origin::Router`.
- Każdy task kończy się `cargo test --workspace` bez błędów i commitem. Stopka commita: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Kandydaci do delegacji Codexowi (według CLAUDE.md: mechaniczne, dobrze opisane) to taski 7–9 i 12. Review po Codeksie jest obowiązkowy.

## Struktura plików

```
Cargo.toml                         workspace
crates/pets-core/
  Cargo.toml
  src/lib.rs                       eksporty modułów
  src/model.rs                     Agent, Origin, State, Tool, Session, Limit, Event, EventData
  src/tools.rs                     mapowanie nazw narzędzi Claude/Codex → Tool
  src/store.rs                     Store: apply(event), tick(now), zmiany; maszyna stanów
  src/tail.rs                      TailReader: przyrostowy odczyt linii z pliku (offset, reset przy skróceniu)
  src/claude/mod.rs
  src/claude/hook.rs               JSON hooka → Event
  src/claude/transcript.rs         linie transkryptu → Event (tytuł, kontekst, postęp, entrypoint)
  src/codex/mod.rs
  src/codex/rollout.rs             linie rolloutu → Event
  src/endpoint.rs                  Endpoint {port, token}: zapis/odczyt endpoint.json
  src/ingest.rs                    serwer HTTP (tiny_http) → kanał zdarzeń
  src/watch.rs                     obserwacja katalogów (notify) + TailReader per plik
  src/rehydrate.rs                 skan plików z ostatnich 30 min przy starcie
  src/pid.rs                       czy PID żyje (Win32)
  src/hooks_install.rs             scalanie/usuwanie wpisów hooków w ~/.claude/settings.json
  tests/fixtures/                  zanonimizowane próbki (task 3)
crates/pets-hook/
  Cargo.toml
  src/main.rs                      hook.exe
crates/pets-cli/
  Cargo.toml
  src/main.rs                      run | replay | install-hooks | uninstall-hooks
  src/render.rs                    wydruk tabeli sesji i limitów
spikes/                            kod spike'ów (wyrzucany, nie wchodzi do workspace)
docs/spikes/                       wyniki spike'ów S1–S5
tools/anonymize.py                 anonimizacja próbek do fixtures
```

## Co już wiadomo o formatach (zbadane 2026-09-24 na tej maszynie)

**Codex 0.155** (`~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl`). Każda linia to `{"timestamp", "ordinal", "type", "payload"}`.

| `type` | `payload` | Znaczenie |
|---|---|---|
| `session_meta` | `id`, `cwd`, `originator` (`"Codex Desktop"`, `"codex-tui"`, `"agent-router"`, …), `source` (`"vscode"`, `"cli"`, `"exec"` albo obiekt `{"subagent": …}`), `thread_source` (`"user"`, `"subagent"`, brak) | start sesji |
| `event_msg` / `task_started` | `turn_id`, `model_context_window` | początek tury |
| `event_msg` / `task_complete` | `last_agent_message` | koniec tury |
| `event_msg` / `turn_aborted` | `reason` | przerwanie → `turn_end` |
| `event_msg` / `token_count` | `info.last_token_usage.input_tokens`, `info.model_context_window`, `rate_limits.primary`/`secondary` = `{used_percent, window_minutes (300 / 10080), resets_at (sekundy epoki)}` | kontekst i limity |
| `event_msg` / `item_completed` | `item.type` ∈ `UserMessage`, `AgentMessage`, `Reasoning`, `FileChange`, `CommandExecution`, `McpToolCall`, `WebSearch`, `ImageView`, `ContextCompaction`, `SubAgentActivity`, `CollabAgentToolCall`, `Plan` | koniec elementu |
| `response_item` / `custom_tool_call` | `name` = `"exec"` (w `input` kod JS z wywołaniami `tools.<nazwa>(`) albo `"apply_patch"` | start narzędzia |
| `response_item` / `function_call` | `name` (+ opcjonalne `namespace`), `arguments` (JSON jako string) | start narzędzia |
| `compacted` | – | kompaktowanie |

Nazwy narzędzi widziane w praktyce: `shell_command`, `exec_command`, `write_stdin`, `apply_patch`, `web__run`, `mcp__*`, `update_plan`, `view_image`, `request_user_input`, `request_user_input_async`, `request_permissions`, `spawn_agent`, `wait_agent`, `wait`, `sleep`.

**Claude Code 2.1.270** (`~/.claude/projects/<projekt>/<sessionId>.jsonl`). Linie mają `type`, `sessionId`, `timestamp`, `cwd`, `entrypoint` (`"claude-desktop"` | `"cli"`), `message`.
- Tytuł: `{"type":"custom-title","customTitle":…}` albo `{"type":"ai-title","aiTitle":…}`.
- Użycie tokenów: `assistant.message.usage` = `input_tokens + cache_creation_input_tokens + cache_read_input_tokens`; model w `message.model`.
- W ostatnich transkryptach nie ma `TodoWrite` ani `TaskCreate`. Źródło postępu dla Claude'a to otwarte pytanie spike'a S3.

---

## Faza 0: spike'i

Spike to badanie, nie TDD. Kod ląduje w `spikes/` i nie jest utrzymywany. Wynikiem każdego spike'a jest plik w `docs/spikes/` z odpowiedzią tak/nie, dowodami (komendy, zrzuty, liczby) i rekomendacją dla faz 2–3.

### Task 1: Spike S1 + S2, osadzenie w pasku i wydajność

**Pliki:**
- Utwórz: `spikes/taskbar-embed/` (projekt Tauri 2, `pnpm create tauri-app`, szablon `vanilla-ts`)
- Utwórz: `docs/spikes/S1-S2-taskbar-embed.md`

- [ ] **Krok 1: Utwórz projekt spike'a**

```bash
cd spikes && pnpm create tauri-app taskbar-embed --template vanilla-ts --manager pnpm --yes && cd taskbar-embed && pnpm install
```

- [ ] **Krok 2: Ustaw okno jako przezroczyste i bez ramek.** W `src-tauri/tauri.conf.json`, w `app.windows[0]`, ustaw: `"decorations": false, "transparent": true, "alwaysOnTop": true, "skipTaskbar": true, "width": 400, "height": 48, "resizable": false`.

- [ ] **Krok 3: Osadź okno w pasku.** W `src-tauri/Cargo.toml` dodaj `windows = { version = "0.58", features = ["Win32_UI_WindowsAndMessaging", "Win32_Foundation", "Win32_Graphics_Gdi", "Win32_UI_HiDpi"] }`. W `src-tauri/src/lib.rs`, w `setup`:

```rust
use windows::Win32::Foundation::{HWND, RECT};
use windows::Win32::UI::WindowsAndMessaging::*;
use windows::core::w;

fn embed(hwnd: HWND) -> windows::core::Result<()> {
    unsafe {
        let tray = FindWindowW(w!("Shell_TrayWnd"), None)?;
        let mut r = RECT::default();
        GetWindowRect(tray, &mut r)?;
        let style = GetWindowLongW(hwnd, GWL_STYLE) as u32;
        SetWindowLongW(hwnd, GWL_STYLE, ((style & !WS_POPUP.0) | WS_CHILD.0) as i32);
        SetParent(hwnd, tray)?;
        // na razie: 400 px od prawej krawędzi paska, pełna wysokość paska
        let h = r.bottom - r.top;
        let x = (r.right - r.left) - 400 - 320;
        SetWindowPos(hwnd, HWND_TOP, x, 0, 400, h, SWP_SHOWWINDOW)?;
    }
    Ok(())
}
```

Wywołanie w `setup`: `let w = app.get_webview_window("main").unwrap(); embed(HWND(w.hwnd()?.0 as _))?;`

- [ ] **Krok 4: Wklej scenę z prototypu.** Skopiuj `prototype/pets.js` do `spikes/taskbar-embed/src/`. W `index.html` ustaw `<body style="margin:0;background:transparent">` z kanwą `<canvas id="tb" style="width:100%;height:100%">` oraz ukrytymi elementami `cv`, `btns`, `tools`, `sty`, `lbl`, `slow`, których oczekuje prototyp. Uruchom `pnpm tauri dev`.

- [ ] **Krok 5: Sprawdź i zapisz wyniki.** W `docs/spikes/S1-S2-taskbar-embed.md` zapisz odpowiedzi tak/nie z opisem:
  1. Czy okno widać w pasku z przezroczystym tłem? Dołącz zrzut.
  2. Czy przetrwa restart Explorera (`taskkill /f /im explorer.exe & start explorer`)? Jeśli nie, zapisz, czy nasłuch `RegisterWindowMessageW("TaskbarCreated")` i ponowne `embed` pomagają; sprawdź to w kodzie.
  3. Zachowanie przy DPI 100, 150 i 200% (Ustawienia → Ekran → Skala).
  4. Zachowanie przy autoukrywaniu paska.
  5. Czy kliknięcia trafiają do okna?
  6. CPU procesu WebView2 przy 5 zwierzakach: odczyt z Menedżera zadań po 60 s, średnia. Cel: poniżej 2%.
  7. CPU przy ograniczeniu do 30 kl./s (w `frame` pomijaj co drugą klatkę).
  8. Rekomendacja: osadzenie czy pływające okno jako forma główna.

- [ ] **Krok 6: Commit**

```bash
git add spikes/taskbar-embed docs/spikes/S1-S2-taskbar-embed.md
git commit -m "spike: taskbar embed and render performance (S1, S2)"
```

### Task 2: Spike S3 + S4, limity i postęp Claude'a oraz przejście do sesji

**Pliki:**
- Utwórz: `spikes/statusline-dump/dump.cmd`
- Utwórz: `docs/spikes/S3-S4-claude-limits-jump.md`

- [ ] **Krok 1: Zrzuć dane, które statusline dostaje na stdin.** `spikes/statusline-dump/dump.cmd`:

```bat
@echo off
more > "%TEMP%\statusline-dump.json"
echo dump
```

Tymczasowo w `~/.claude/settings.json` ustaw `"statusLine": {"type": "command", "command": "<absolutna ścieżka>\\dump.cmd"}`. Przedtem zrób kopię pliku: `copy %USERPROFILE%\.claude\settings.json %USERPROFILE%\.claude\settings.json.bak`. Uruchom `claude` w terminalu, wyślij jeden prompt, przywróć kopię.

- [ ] **Krok 2: Sprawdź zrzut.** Otwórz `%TEMP%\statusline-dump.json` i zapisz jego klucze najwyższego poziomu. Kluczowe pytanie: czy są tam limity 5h i tygodniowe (szukaj `rate_limit`, `limits`, `usage`, `resets`) albo kontekst? Przed zapisaniem przykładu do dokumentu usuń z niego ścieżki i identyfikatory.

- [ ] **Krok 3: Znajdź źródło postępu.** W `claude` poproś o zadanie wieloetapowe, np. „zaplanuj w 3 krokach listę zadań i ją wykonaj”. Potem sprawdź nazwy narzędzi w nowym transkrypcie:

```bash
grep -o '"name":"[A-Za-z]*"' ~/.claude/projects/*/<sessionId>.jsonl | sort | uniq -c
```

Zapisz, które narzędzie niesie listę zadań (`TodoWrite`, `TaskCreate`/`TaskUpdate` czy inne) i jak wygląda jego `input`.

- [ ] **Krok 4: Sprawdź mechanizmy przejścia do sesji i zapisz każdy z odpowiedzią działa/nie działa:**
  1. Czy istnieje deep link aplikacji Claude desktop do sesji? Sprawdź rejestr: `reg query HKCU\Software\Classes\claude` oraz `reg query HKCR\claude /s`.
  2. To samo dla Codexa: `reg query HKCR /f codex /k`.
  3. Windows Terminal: czy da się aktywować kartę po PID procesu powłoki? Sprawdź `wt -w 0 focus-tab` i ustal, czy trzeba szukać okna przez `EnumWindows` po PID rodzica.
  4. Fokus okna po PID: `AllowSetForegroundWindow` + `SetForegroundWindow`. Zapisz, czy Windows pozwala na to z procesu w tle.
  5. VS Code: `code --reuse-window <cwd>`.

- [ ] **Krok 5: Zapisz wyniki i rekomendację** w `docs/spikes/S3-S4-claude-limits-jump.md`: źródło limitów Claude'a (albo „brak w v1”), narzędzie postępu i kolejność łańcucha przejścia.

- [ ] **Krok 6: Commit**

```bash
git add spikes/statusline-dump docs/spikes/S3-S4-claude-limits-jump.md
git commit -m "spike: Claude limits/progress source and jump mechanisms (S3, S4)"
```

### Task 3: Spike S5 i próbki testowe

**Pliki:**
- Utwórz: `tools/anonymize.py`
- Utwórz: `crates/pets-core/tests/fixtures/codex/*.jsonl`, `crates/pets-core/tests/fixtures/claude/*.jsonl`, `crates/pets-core/tests/fixtures/claude/hooks/*.json`
- Utwórz: `docs/spikes/S5-formats.md`

- [ ] **Krok 1: Napisz skrypt anonimizujący.** Skrypt zachowuje strukturę i nazwy narzędzi, a treść i ścieżki zastępuje. `tools/anonymize.py`:

```python
"""Anonimizuje pliki JSONL: zachowuje strukturę, typy i nazwy narzędzi, zastępuje treść i ścieżki."""
import json, re, sys

KEEP_KEYS = {"type", "name", "namespace", "status", "role", "originator", "source", "thread_source",
             "entrypoint", "model", "reason", "window_minutes", "limit_id", "plan_type", "hook_event_name",
             "tool_name", "subtype", "level", "operation"}
PATH_RE = re.compile(r"[A-Za-z]:\\\\?[^\"']*")

def scrub(v, key=None):
    if isinstance(v, dict):
        return {k: scrub(x, k) for k, x in v.items()}
    if isinstance(v, list):
        return [scrub(x, key) for x in v]
    if isinstance(v, str):
        if key in KEEP_KEYS:
            return v
        if key in ("input", "arguments", "command"):
            # zachowaj tylko wywołania narzędzi, np. tools.apply_patch(
            calls = re.findall(r"tools\.\w+\s*\(", v)
            return " ".join(calls) if calls else "<redacted>"
        if key in ("cwd",) or PATH_RE.match(v):
            return "C:\\work\\project"
        return "<redacted>" if len(v) > 40 else v
    return v

for line in open(sys.argv[1], encoding="utf-8"):
    line = line.strip()
    if not line:
        continue
    try:
        print(json.dumps(scrub(json.loads(line)), ensure_ascii=False))
    except json.JSONDecodeError:
        print(line)
```

- [ ] **Krok 2: Zbierz próbki Codexa.** Wybierz 3 rollouty z `~/.codex/sessions`: zwykłą sesję Codex Desktop z `FileChange`, `CommandExecution` i `WebSearch`; sesję routera (`originator == "agent-router"`); sesję z `turn_aborted`. Skróć każdą do najwyżej 200 linii i zanonimizuj:

```bash
PYTHONUTF8=1 python tools/anonymize.py <rollout>.jsonl | head -200 > crates/pets-core/tests/fixtures/codex/desktop-tools.jsonl
```

Tak samo powstają `router-task.jsonl` i `aborted.jsonl`.

- [ ] **Krok 3: Zbierz próbki Claude'a.**
  1. Zanonimizuj jeden transkrypt z `custom-title` lub `ai-title` i zapisz go jako `claude/desktop-session.jsonl`.
  2. Nagraj JSON-y hooków: w `~/.claude/settings.json` tymczasowo dodaj hook dla każdego zdarzenia (`SessionStart`, `UserPromptSubmit`, `PreToolUse`, `PostToolUse`, `Notification`, `Stop`, `SubagentStop`, `PreCompact`, `SessionEnd`), zapisujący stdin do `%TEMP%\hook-<event>.json`. Komenda hooka: `cmd /c more > %TEMP%\hook-%CLAUDE_HOOK_EVENT%.json`. Jeśli ta zmienna nie istnieje, dodaj osobny wpis na każde zdarzenie.
  3. Wykonaj krótką sesję, przywróć `settings.json` z kopii i zanonimizuj pliki do `claude/hooks/<Event>.json`.

- [ ] **Krok 4: Zapisz `docs/spikes/S5-formats.md`.** Potwierdź albo popraw tabele z sekcji „Co już wiadomo o formatach”. Dopisz przykładowy JSON każdego hooka: tylko klucze, bez wartości.

- [ ] **Krok 5: Commit**

```bash
git add tools/anonymize.py crates/pets-core/tests/fixtures docs/spikes/S5-formats.md
git commit -m "spike: confirm Codex/Claude formats and add anonymized fixtures (S5)"
```

**Bramka:** jeśli S5 pokaże inne nazwy pól niż tabela „Co już wiadomo o formatach”, popraw stałe w taskach 8 i 9 przed ich wykonaniem. Jeśli S3 wskaże narzędzie postępu inne niż `TodoWrite`, popraw `progress_from_tool_use` w tasku 8.

---

## Faza 1: rdzeń danych

### Task 4: Workspace, model danych i mapowanie narzędzi

**Pliki:**
- Utwórz: `Cargo.toml`, `.gitignore`, `crates/pets-core/Cargo.toml`, `crates/pets-core/src/lib.rs`, `crates/pets-core/src/model.rs`, `crates/pets-core/src/tools.rs`

**Interfejsy:**
- Produkuje: typy `Agent`, `Origin`, `App`, `State`, `Tool`, `Progress`, `Context`, `JumpTarget`, `Session`, `Window`, `Limit`, `Source`, `Kind`, `EventData`, `Event` (wszystkie `Serialize + Deserialize + Clone + Debug + PartialEq`) oraz `tools::from_claude(name: &str) -> Tool`, `tools::from_codex(name: &str) -> Option<Tool>`.

- [ ] **Krok 1: Utwórz workspace.** `Cargo.toml`:

```toml
[workspace]
resolver = "2"
members = ["crates/pets-core", "crates/pets-hook", "crates/pets-cli"]

[workspace.package]
edition = "2021"
version = "0.1.0"

[workspace.dependencies]
serde = { version = "1", features = ["derive"] }
serde_json = "1"
anyhow = "1"
```

`.gitignore`:

```
/target
spikes/*/node_modules
spikes/*/src-tauri/target
```

Na razie w `members` zostaw tylko `"crates/pets-core"`. Pozostałe dwa crate'y dopisują taski 12 i 13.

`crates/pets-core/Cargo.toml`:

```toml
[package]
name = "pets-core"
edition.workspace = true
version.workspace = true

[dependencies]
serde.workspace = true
serde_json.workspace = true
anyhow.workspace = true

[dev-dependencies]
tempfile = "3"
```

`crates/pets-core/src/lib.rs`:

```rust
pub mod model;
pub mod tools;
```

- [ ] **Krok 2: Napisz test mapowania narzędzi, który na razie nie przejdzie.** `crates/pets-core/src/tools.rs`:

```rust
use crate::model::Tool;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn claude_tools_map_to_actions() {
        assert_eq!(from_claude("Edit"), Tool::Edit);
        assert_eq!(from_claude("MultiEdit"), Tool::Edit);
        assert_eq!(from_claude("Write"), Tool::Edit);
        assert_eq!(from_claude("NotebookEdit"), Tool::Edit);
        assert_eq!(from_claude("Bash"), Tool::Bash);
        assert_eq!(from_claude("PowerShell"), Tool::Bash);
        assert_eq!(from_claude("Read"), Tool::Read);
        assert_eq!(from_claude("Grep"), Tool::Grep);
        assert_eq!(from_claude("Glob"), Tool::Grep);
        assert_eq!(from_claude("WebSearch"), Tool::Web);
        assert_eq!(from_claude("WebFetch"), Tool::Web);
        assert_eq!(from_claude("Task"), Tool::Agent);
        assert_eq!(from_claude("Agent"), Tool::Agent);
        assert_eq!(from_claude("mcp__agent-router__codex_delegate"), Tool::Mcp);
        assert_eq!(from_claude("AskUserQuestion"), Tool::Other);
    }

    #[test]
    fn codex_tools_map_to_actions() {
        assert_eq!(from_codex("shell_command"), Some(Tool::Bash));
        assert_eq!(from_codex("exec_command"), Some(Tool::Bash));
        assert_eq!(from_codex("write_stdin"), Some(Tool::Bash));
        assert_eq!(from_codex("apply_patch"), Some(Tool::Edit));
        assert_eq!(from_codex("web__run"), Some(Tool::Web));
        assert_eq!(from_codex("view_image"), Some(Tool::Read));
        assert_eq!(from_codex("spawn_agent"), Some(Tool::Agent));
        assert_eq!(from_codex("mcp__node_repl__js"), Some(Tool::Mcp));
        assert_eq!(from_codex("js"), Some(Tool::Mcp));
        // narzędzia pomocnicze nie zmieniają animacji
        assert_eq!(from_codex("update_plan"), None);
        assert_eq!(from_codex("wait"), None);
        assert_eq!(from_codex("sleep"), None);
        assert_eq!(from_codex("request_user_input"), None);
        assert_eq!(from_codex("something_new"), Some(Tool::Other));
    }
}
```

- [ ] **Krok 3: Napisz model.** `crates/pets-core/src/model.rs`:

```rust
use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq, Hash)]
#[serde(rename_all = "snake_case")]
pub enum Agent { Claude, Codex }

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum Origin { Cli, Desktop, Router }

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum App { Terminal, ClaudeDesktop, CodexApp, Vscode }

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum State { Thinking, Working, NeedsYou, Done, Error, Idle, Sleep, Compacting, Ended }

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum Tool { Edit, Bash, Read, Grep, Web, Agent, Mcp, Other }

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq)]
pub struct Progress { pub done: u32, pub total: u32 }

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq)]
pub struct Context { pub used: u64, pub max: u64 }

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Default)]
pub struct JumpTarget {
    pub pid: Option<u32>,
    pub session_id: String,
    pub cwd: String,
    pub app: Option<App>,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct Session {
    pub id: String,
    pub agent: Agent,
    pub origin: Origin,
    pub title: String,
    pub cwd: String,
    pub state: State,
    pub tool: Option<Tool>,
    pub progress: Option<Progress>,
    pub context: Option<Context>,
    pub started_at: i64,
    pub last_activity: i64,
    /// czas wejścia w bieżący stan (do minimalnego czasu stanu i progów)
    pub state_since: i64,
    pub turn_started_at: Option<i64>,
    pub jump: JumpTarget,
}

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum Window { FiveHour, Weekly }

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq)]
pub struct Limit {
    pub agent: Agent,
    pub window: Window,
    pub used_pct: f32,
    pub resets_at: Option<i64>,
}

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum Source { Claude, Codex, Router }

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum Kind {
    SessionStart, Prompt, ToolStart, ToolEnd, NeedsInput, TurnEnd,
    Error, Compact, SessionEnd, Meta, Limits,
}

/// Dane opcjonalne niesione przez zdarzenie. Puste pola nie nadpisują stanu sesji.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Default)]
#[serde(default)]
pub struct EventData {
    pub title: Option<String>,
    pub cwd: Option<String>,
    pub origin: Option<Origin>,
    pub progress: Option<Progress>,
    pub context: Option<Context>,
    pub limits: Vec<Limit>,
    pub pid: Option<u32>,
    pub app: Option<App>,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct Event {
    pub source: Source,
    pub session_id: String,
    pub kind: Kind,
    pub tool: Option<Tool>,
    pub ts: i64,
    #[serde(default)]
    pub data: EventData,
}

impl Event {
    pub fn new(source: Source, session_id: impl Into<String>, kind: Kind, ts: i64) -> Self {
        Event { source, session_id: session_id.into(), kind, tool: None, ts, data: EventData::default() }
    }
    pub fn agent(&self) -> Agent {
        match self.source { Source::Claude => Agent::Claude, Source::Codex | Source::Router => Agent::Codex }
    }
}
```

- [ ] **Krok 4: Uruchom test i sprawdź, że nie przechodzi.** Uruchom `cargo test -p pets-core tools`. Oczekiwany wynik: błąd kompilacji `cannot find function from_claude`.

- [ ] **Krok 5: Napisz mapowanie.** W `tools.rs`, powyżej `mod tests`:

```rust
pub fn from_claude(name: &str) -> Tool {
    match name {
        "Edit" | "MultiEdit" | "Write" | "NotebookEdit" => Tool::Edit,
        "Bash" | "PowerShell" | "BashOutput" => Tool::Bash,
        "Read" => Tool::Read,
        "Grep" | "Glob" => Tool::Grep,
        "WebSearch" | "WebFetch" => Tool::Web,
        "Task" | "Agent" => Tool::Agent,
        n if n.starts_with("mcp__") => Tool::Mcp,
        _ => Tool::Other,
    }
}

/// `None` oznacza narzędzie pomocnicze, które nie zmienia animacji.
pub fn from_codex(name: &str) -> Option<Tool> {
    match name {
        "shell_command" | "exec_command" | "write_stdin" | "shell" | "local_shell" => Some(Tool::Bash),
        "apply_patch" => Some(Tool::Edit),
        "web__run" | "web_search" | "run" => Some(Tool::Web),
        "view_image" => Some(Tool::Read),
        "spawn_agent" | "followup_task" | "send_message" => Some(Tool::Agent),
        "update_plan" | "wait" | "wait_agent" | "sleep" | "list_agents" | "close_agent" | "get_goal"
        | "create_goal" | "curr_time" | "request_user_input" | "request_user_input_async"
        | "request_permissions" => None,
        n if n.starts_with("mcp__") || n == "js" => Some(Tool::Mcp),
        _ => Some(Tool::Other),
    }
}
```

- [ ] **Krok 6: Uruchom testy.** Uruchom `cargo test -p pets-core`. Oczekiwany wynik: 2 testy przechodzą.

- [ ] **Krok 7: Commit**

```bash
git add Cargo.toml .gitignore crates/pets-core
git commit -m "feat(core): data model and tool mapping"
```

---

### Task 5: Maszyna stanów (`Store`)

**Pliki:**
- Utwórz: `crates/pets-core/src/store.rs`
- Zmień: `crates/pets-core/src/lib.rs` (dodaj `pub mod store;`)

**Interfejsy:**
- Korzysta z: `model::*` (task 4)
- Produkuje:
  - `Timing` (pola `dwell_ms`, `done_to_idle_ms`, `stale_to_idle_ms`, `idle_to_sleep_ms`, `to_ended_ms`, `exit_ms`; `Default` zgodny z Global Constraints);
  - `enum Change { Upsert(Session), Removed(String), Limits(Vec<Limit>) }`;
  - `Store::new(Timing)`, `Store::apply(&mut self, &Event) -> Vec<Change>`, `Store::tick(&mut self, now: i64, alive: &dyn Fn(u32) -> bool) -> Vec<Change>`, `Store::session(&self, &str) -> Option<&Session>`, `Store::sessions(&self) -> Vec<&Session>` (posortowane po `started_at`), `Store::limits(&self) -> &[Limit]`.

**Zasady** (ze specyfikacji, sekcja 5):

| Zdarzenie | Stan docelowy |
|---|---|
| `Prompt` | `Thinking` (i ustawia `turn_started_at`) |
| `ToolStart` | `Working(tool)` |
| `ToolEnd` | `Thinking` |
| `NeedsInput` | `NeedsYou` |
| `TurnEnd` | `Done` |
| `Error` | `Error` |
| `Compact` | `Compacting` |
| `SessionEnd` | `Ended` (natychmiast, z pominięciem minimalnego czasu) |
| `Meta` | `Compacting` tylko wtedy, gdy stan to `Thinking`, a kontekst przekracza 90% |

- **Minimalny czas stanu:** zmiana wcześniejsza niż `state_since + dwell_ms` trafia do `pending` i ostatnia wygrywa. Jeśli oczekująca zmiana równa się bieżącemu stanowi, jest kasowana.
- **Kolejność:** zdarzenie z `ts < last_activity` scala dane, ale nie zmienia stanu.

- [ ] **Krok 1: Napisz testy, które na razie nie przejdą.** `crates/pets-core/src/store.rs`:

```rust
use std::collections::BTreeMap;
use crate::model::*;

#[cfg(test)]
mod tests {
    use super::*;

    fn ev(kind: Kind, ts: i64) -> Event { Event::new(Source::Claude, "s1", kind, ts) }
    fn tool(t: Tool, ts: i64) -> Event { let mut e = ev(Kind::ToolStart, ts); e.tool = Some(t); e }
    fn alive(_: u32) -> bool { true }
    fn st(s: &Store) -> (State, Option<Tool>) { let x = s.session("s1").unwrap(); (x.state, x.tool) }

    #[test]
    fn new_session_starts_idle_then_thinks_on_prompt() {
        let mut s = Store::new(Timing::default());
        s.apply(&ev(Kind::SessionStart, 0));
        assert_eq!(st(&s).0, State::Idle);
        s.apply(&ev(Kind::Prompt, 1000));
        assert_eq!(st(&s).0, State::Thinking);
        assert_eq!(s.session("s1").unwrap().turn_started_at, Some(1000));
    }

    #[test]
    fn dwell_defers_fast_changes_and_last_wins() {
        let mut s = Store::new(Timing::default());
        s.apply(&ev(Kind::Prompt, 0));
        s.apply(&tool(Tool::Bash, 100));
        assert_eq!(st(&s), (State::Thinking, None));
        s.tick(700, &alive);
        assert_eq!(st(&s), (State::Working, Some(Tool::Bash)));
    }

    #[test]
    fn pending_equal_to_current_is_dropped() {
        let mut s = Store::new(Timing::default());
        s.apply(&ev(Kind::Prompt, 0));
        s.apply(&tool(Tool::Read, 100));
        s.apply(&ev(Kind::ToolEnd, 200));
        s.tick(700, &alive);
        assert_eq!(st(&s), (State::Thinking, None));
    }

    #[test]
    fn done_goes_idle_after_2_min_then_sleep_after_10() {
        let mut s = Store::new(Timing::default());
        s.apply(&ev(Kind::TurnEnd, 0));
        s.tick(119_000, &alive);
        assert_eq!(st(&s).0, State::Done);
        s.tick(120_000, &alive);
        assert_eq!(st(&s).0, State::Idle);
        s.tick(720_000, &alive);
        assert_eq!(st(&s).0, State::Sleep);
    }

    #[test]
    fn stale_working_goes_idle_after_10_min() {
        let mut s = Store::new(Timing::default());
        s.apply(&tool(Tool::Edit, 0));
        s.tick(600_000, &alive);
        assert_eq!(st(&s).0, State::Idle);
    }

    #[test]
    fn silence_30_min_ends_and_removes_after_exit_animation() {
        let mut s = Store::new(Timing::default());
        s.apply(&ev(Kind::Prompt, 0));
        s.tick(1_800_000, &alive);
        assert_eq!(st(&s).0, State::Ended);
        let ch = s.tick(1_801_500, &alive);
        assert!(ch.contains(&Change::Removed("s1".into())));
        assert!(s.session("s1").is_none());
    }

    #[test]
    fn dead_pid_ends_session() {
        let mut s = Store::new(Timing::default());
        let mut e = ev(Kind::SessionStart, 0);
        e.data.pid = Some(42);
        s.apply(&e);
        s.tick(1000, &|_| false);
        assert_eq!(st(&s).0, State::Ended);
    }

    #[test]
    fn session_end_is_immediate() {
        let mut s = Store::new(Timing::default());
        s.apply(&ev(Kind::Prompt, 0));
        s.apply(&ev(Kind::SessionEnd, 10));
        assert_eq!(st(&s).0, State::Ended);
    }

    #[test]
    fn out_of_order_event_merges_data_but_not_state() {
        let mut s = Store::new(Timing::default());
        s.apply(&ev(Kind::TurnEnd, 5000));
        let mut old = ev(Kind::Prompt, 1000);
        old.data.title = Some("Tytuł".into());
        s.apply(&old);
        assert_eq!(st(&s).0, State::Done);
        assert_eq!(s.session("s1").unwrap().title, "Tytuł");
    }

    #[test]
    fn none_fields_do_not_overwrite() {
        let mut s = Store::new(Timing::default());
        let mut a = ev(Kind::SessionStart, 0);
        a.data.title = Some("A".into());
        a.data.cwd = Some("C:\\p".into());
        s.apply(&a);
        s.apply(&ev(Kind::Prompt, 1000));
        let x = s.session("s1").unwrap();
        assert_eq!((x.title.as_str(), x.cwd.as_str()), ("A", "C:\\p"));
    }

    #[test]
    fn high_context_while_thinking_means_compacting() {
        let mut s = Store::new(Timing::default());
        s.apply(&ev(Kind::Prompt, 0));
        let mut m = ev(Kind::Meta, 1000);
        m.data.context = Some(Context { used: 190_000, max: 200_000 });
        s.apply(&m);
        assert_eq!(st(&s).0, State::Compacting);
    }

    #[test]
    fn limits_merge_by_agent_and_window() {
        let mut s = Store::new(Timing::default());
        let lim = |p: f32| Limit { agent: Agent::Codex, window: Window::FiveHour, used_pct: p, resets_at: None };
        let mut e = Event::new(Source::Codex, "c1", Kind::Limits, 0);
        e.data.limits = vec![lim(10.0)];
        s.apply(&e);
        e.data.limits = vec![lim(20.0)];
        let ch = s.apply(&e);
        assert_eq!(s.limits(), &[lim(20.0)]);
        assert!(matches!(ch.as_slice(), [Change::Limits(_)]));
        assert!(s.session("c1").is_none(), "samo zdarzenie limitów nie tworzy sesji");
    }
}
```

W `lib.rs` dodaj `pub mod store;`.

- [ ] **Krok 2: Uruchom testy i sprawdź, że nie przechodzą.** Uruchom `cargo test -p pets-core store`. Oczekiwany wynik: błąd kompilacji (brak `Store`, `Timing`, `Change`).

- [ ] **Krok 3: Napisz `Store`.** W `store.rs`, powyżej `mod tests`:

```rust
#[derive(Clone, Copy, Debug)]
pub struct Timing {
    pub dwell_ms: i64,
    pub done_to_idle_ms: i64,
    pub stale_to_idle_ms: i64,
    pub idle_to_sleep_ms: i64,
    pub to_ended_ms: i64,
    pub exit_ms: i64,
}

impl Default for Timing {
    fn default() -> Self {
        Timing { dwell_ms: 600, done_to_idle_ms: 120_000, stale_to_idle_ms: 600_000,
                 idle_to_sleep_ms: 600_000, to_ended_ms: 1_800_000, exit_ms: 1_500 }
    }
}

#[derive(Clone, Debug, PartialEq)]
pub enum Change { Upsert(Session), Removed(String), Limits(Vec<Limit>) }

pub struct Store {
    pub timing: Timing,
    sessions: BTreeMap<String, Session>,
    pending: BTreeMap<String, (State, Option<Tool>)>,
    ended_at: BTreeMap<String, i64>,
    limits: Vec<Limit>,
}

fn new_session(e: &Event) -> Session {
    let origin = e.data.origin.unwrap_or(match e.source {
        Source::Claude => Origin::Cli,
        Source::Codex => Origin::Desktop,
        Source::Router => Origin::Router,
    });
    Session {
        id: e.session_id.clone(),
        agent: e.agent(),
        origin,
        title: String::new(),
        cwd: String::new(),
        state: State::Idle,
        tool: None,
        progress: None,
        context: None,
        started_at: e.ts,
        last_activity: e.ts,
        state_since: e.ts,
        turn_started_at: None,
        jump: JumpTarget { session_id: e.session_id.clone(), ..Default::default() },
    }
}

fn merge(s: &mut Session, d: &EventData) {
    if let Some(t) = &d.title { if !t.is_empty() { s.title = t.clone(); } }
    if let Some(c) = &d.cwd { s.cwd = c.clone(); s.jump.cwd = c.clone(); }
    if let Some(o) = d.origin { s.origin = o; }
    if let Some(p) = d.progress { s.progress = Some(p); }
    if let Some(c) = d.context { s.context = Some(c); }
    if let Some(p) = d.pid { s.jump.pid = Some(p); }
    if let Some(a) = d.app { s.jump.app = Some(a); }
}

fn set(s: &mut Session, st: State, tool: Option<Tool>, now: i64) {
    s.state = st;
    s.tool = if st == State::Working { tool } else { None };
    s.state_since = now;
}

impl Store {
    pub fn new(timing: Timing) -> Self {
        Store { timing, sessions: BTreeMap::new(), pending: BTreeMap::new(),
                ended_at: BTreeMap::new(), limits: Vec::new() }
    }

    pub fn session(&self, id: &str) -> Option<&Session> { self.sessions.get(id) }

    pub fn sessions(&self) -> Vec<&Session> {
        let mut v: Vec<&Session> = self.sessions.values().collect();
        v.sort_by_key(|s| (s.started_at, s.id.clone()));
        v
    }

    pub fn limits(&self) -> &[Limit] { &self.limits }

    fn merge_limits(&mut self, new: &[Limit]) {
        for l in new {
            match self.limits.iter_mut().find(|x| x.agent == l.agent && x.window == l.window) {
                Some(x) => *x = *l,
                None => self.limits.push(*l),
            }
        }
    }

    pub fn apply(&mut self, e: &Event) -> Vec<Change> {
        let mut out = Vec::new();
        if !e.data.limits.is_empty() {
            self.merge_limits(&e.data.limits);
            out.push(Change::Limits(self.limits.clone()));
        }
        if e.kind == Kind::Limits { return out; }

        let dwell = self.timing.dwell_ms;
        // nowa sesja przyjmuje pierwszy stan od razu, bez czekania na minimalny czas
        let is_new = !self.sessions.contains_key(&e.session_id);
        let s = self.sessions.entry(e.session_id.clone()).or_insert_with(|| new_session(e));
        merge(s, &e.data);
        if e.ts < s.last_activity {
            out.push(Change::Upsert(s.clone()));
            return out;
        }
        s.last_activity = e.ts;

        let target: Option<(State, Option<Tool>)> = match e.kind {
            Kind::Prompt => { s.turn_started_at = Some(e.ts); Some((State::Thinking, None)) }
            Kind::ToolStart => Some((State::Working, e.tool.or(Some(Tool::Other)))),
            Kind::ToolEnd => Some((State::Thinking, None)),
            Kind::NeedsInput => Some((State::NeedsYou, None)),
            Kind::TurnEnd => Some((State::Done, None)),
            Kind::Error => Some((State::Error, None)),
            Kind::Compact => Some((State::Compacting, None)),
            Kind::SessionStart => if s.state == State::Ended { Some((State::Idle, None)) } else { None },
            Kind::Meta => match (s.state, s.context) {
                (State::Thinking, Some(c)) if c.max > 0 && c.used as f64 / c.max as f64 > 0.9 =>
                    Some((State::Compacting, None)),
                _ => None,
            },
            Kind::SessionEnd | Kind::Limits => None,
        };

        if e.kind == Kind::SessionEnd {
            set(s, State::Ended, None, e.ts);
            self.pending.remove(&e.session_id);
            self.ended_at.insert(e.session_id.clone(), e.ts);
        } else if let Some((st, tool)) = target {
            if s.state == State::Ended { self.ended_at.remove(&e.session_id); }
            if (s.state, s.tool) == (st, if st == State::Working { tool } else { None }) {
                self.pending.remove(&e.session_id);
            } else if is_new || e.ts - s.state_since >= dwell || s.state == State::Ended {
                set(s, st, tool, e.ts);
                self.pending.remove(&e.session_id);
            } else {
                self.pending.insert(e.session_id.clone(), (st, tool));
            }
        }
        out.push(Change::Upsert(s.clone()));
        out
    }

    pub fn tick(&mut self, now: i64, alive: &dyn Fn(u32) -> bool) -> Vec<Change> {
        let t = self.timing;
        let mut out = Vec::new();
        let mut removed = Vec::new();
        for (id, s) in self.sessions.iter_mut() {
            if s.state == State::Ended {
                let at = *self.ended_at.get(id).unwrap_or(&s.state_since);
                if now - at >= t.exit_ms { removed.push(id.clone()); }
                continue;
            }
            let before = (s.state, s.tool);
            if let Some((st, tool)) = self.pending.get(id).copied() {
                if now - s.state_since >= t.dwell_ms {
                    set(s, st, tool, now);
                    self.pending.remove(id);
                }
            }
            let quiet = now - s.last_activity;
            let dead = s.jump.pid.map(|p| !alive(p)).unwrap_or(false);
            if quiet >= t.to_ended_ms || dead {
                set(s, State::Ended, None, now);
                self.ended_at.insert(id.clone(), now);
            } else {
                match s.state {
                    State::Done if now - s.state_since >= t.done_to_idle_ms => set(s, State::Idle, None, now),
                    State::Thinking | State::Working | State::Compacting if quiet >= t.stale_to_idle_ms =>
                        set(s, State::Idle, None, now),
                    State::Idle if now - s.state_since >= t.idle_to_sleep_ms => set(s, State::Sleep, None, now),
                    _ => {}
                }
            }
            if (s.state, s.tool) != before { out.push(Change::Upsert(s.clone())); }
        }
        for id in removed {
            self.sessions.remove(&id);
            self.ended_at.remove(&id);
            self.pending.remove(&id);
            out.push(Change::Removed(id));
        }
        out
    }
}
```

- [ ] **Krok 4: Uruchom testy.** Uruchom `cargo test -p pets-core`. Oczekiwany wynik: wszystkie testy przechodzą (14: 2 z `tools` i 12 ze `store`).

- [ ] **Krok 5: Commit**

```bash
git add crates/pets-core
git commit -m "feat(core): session state machine with dwell and timeouts"
```

---

### Task 6: Czytnik końcówek plików i parsowanie czasu

**Pliki:**
- Utwórz: `crates/pets-core/src/tail.rs`, `crates/pets-core/src/time.rs`
- Zmień: `crates/pets-core/src/lib.rs` (dodaj `pub mod tail; pub mod time;`)

**Interfejsy:**
- Produkuje:
  - `TailReader::new(path: impl Into<PathBuf>) -> TailReader` (od początku pliku);
  - `TailReader::from_end(path) -> std::io::Result<TailReader>` (od bieżącego końca);
  - `TailReader::read_lines(&mut self) -> std::io::Result<Vec<String>>` (tylko pełne linie, bez `\r\n`; niepełna końcówka czeka na następny odczyt; plik krótszy niż offset oznacza reset do 0);
  - `time::rfc3339_ms(s: &str) -> Option<i64>` (format `YYYY-MM-DDTHH:MM:SS[.fff]Z`);
  - `time::now_ms() -> i64`.

- [ ] **Krok 1: Napisz testy, które na razie nie przejdą.** `crates/pets-core/src/tail.rs`:

```rust
use std::fs::File;
use std::io::{Read, Seek, SeekFrom};
use std::path::PathBuf;

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    #[test]
    fn reads_only_complete_lines_and_resumes() {
        let dir = tempfile::tempdir().unwrap();
        let p = dir.path().join("a.jsonl");
        let mut f = File::create(&p).unwrap();
        write!(f, "one\r\ntwo\nthr").unwrap();
        let mut t = TailReader::new(&p);
        assert_eq!(t.read_lines().unwrap(), vec!["one", "two"]);
        write!(f, "ee\n").unwrap();
        assert_eq!(t.read_lines().unwrap(), vec!["three"]);
        assert!(t.read_lines().unwrap().is_empty());
    }

    #[test]
    fn from_end_skips_existing_content() {
        let dir = tempfile::tempdir().unwrap();
        let p = dir.path().join("b.jsonl");
        std::fs::write(&p, "old\n").unwrap();
        let mut t = TailReader::from_end(&p).unwrap();
        std::fs::OpenOptions::new().append(true).open(&p).unwrap().write_all(b"new\n").unwrap();
        assert_eq!(t.read_lines().unwrap(), vec!["new"]);
    }

    #[test]
    fn truncation_resets_offset() {
        let dir = tempfile::tempdir().unwrap();
        let p = dir.path().join("c.jsonl");
        std::fs::write(&p, "aaaaaaaa\nbbbbbbbb\n").unwrap();
        let mut t = TailReader::new(&p);
        t.read_lines().unwrap();
        std::fs::write(&p, "x\n").unwrap();
        assert_eq!(t.read_lines().unwrap(), vec!["x"]);
    }
}
```

`crates/pets-core/src/time.rs`:

```rust
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn parses_rfc3339_utc() {
        assert_eq!(rfc3339_ms("1970-01-01T00:00:00Z"), Some(0));
        assert_eq!(rfc3339_ms("2026-09-23T19:25:19.386Z"), Some(1_790_191_519_386));
        assert_eq!(rfc3339_ms("2026-09-23T19:25:19Z"), Some(1_790_191_519_000));
        assert_eq!(rfc3339_ms("nonsense"), None);
    }
}
```

W `lib.rs` dodaj `pub mod tail; pub mod time;`.

- [ ] **Krok 2: Uruchom testy i sprawdź, że nie przechodzą.** Uruchom `cargo test -p pets-core`. Oczekiwany wynik: błędy kompilacji.

- [ ] **Krok 3: Napisz implementację.** W `tail.rs`, powyżej `mod tests`:

```rust
pub struct TailReader {
    path: PathBuf,
    offset: u64,
    partial: String,
}

impl TailReader {
    pub fn new(path: impl Into<PathBuf>) -> Self {
        TailReader { path: path.into(), offset: 0, partial: String::new() }
    }

    pub fn from_end(path: impl Into<PathBuf>) -> std::io::Result<Self> {
        let path = path.into();
        let offset = std::fs::metadata(&path)?.len();
        Ok(TailReader { path, offset, partial: String::new() })
    }

    pub fn path(&self) -> &std::path::Path { &self.path }

    pub fn read_lines(&mut self) -> std::io::Result<Vec<String>> {
        let len = std::fs::metadata(&self.path)?.len();
        if len < self.offset {
            self.offset = 0;
            self.partial.clear();
        }
        if len == self.offset { return Ok(Vec::new()); }
        let mut f = File::open(&self.path)?;
        f.seek(SeekFrom::Start(self.offset))?;
        let mut buf = Vec::with_capacity((len - self.offset) as usize);
        f.take(len - self.offset).read_to_end(&mut buf)?;
        self.offset += buf.len() as u64;
        let mut text = std::mem::take(&mut self.partial);
        text.push_str(&String::from_utf8_lossy(&buf));
        let mut lines: Vec<String> = text.split('\n').map(|l| l.trim_end_matches('\r').to_string()).collect();
        self.partial = lines.pop().unwrap_or_default();
        Ok(lines.into_iter().filter(|l| !l.is_empty()).collect())
    }
}
```

W `time.rs`, powyżej `mod tests`:

```rust
pub fn now_ms() -> i64 {
    std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_millis() as i64).unwrap_or(0)
}

/// Dni od 1970-01-01 dla daty kalendarza gregoriańskiego (algorytm H. Hinnanta).
fn days_from_civil(y: i64, m: i64, d: i64) -> i64 {
    let y = if m <= 2 { y - 1 } else { y };
    let era = (if y >= 0 { y } else { y - 399 }) / 400;
    let yoe = y - era * 400;
    let mp = (m + 9) % 12;
    let doy = (153 * mp + 2) / 5 + d - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    era * 146_097 + doe - 719_468
}

pub fn rfc3339_ms(s: &str) -> Option<i64> {
    let b = s.as_bytes();
    if b.len() < 20 || b[4] != b'-' || b[7] != b'-' || b[10] != b'T' || b[13] != b':' || b[16] != b':' {
        return None;
    }
    let n = |a: usize, z: usize| s.get(a..z)?.parse::<i64>().ok();
    let (y, mo, d, h, mi, se) = (n(0, 4)?, n(5, 7)?, n(8, 10)?, n(11, 13)?, n(14, 16)?, n(17, 19)?);
    let rest = &s[19..];
    let ms = if let Some(frac) = rest.strip_prefix('.') {
        let digits: String = frac.chars().take_while(|c| c.is_ascii_digit()).collect();
        let padded = format!("{:0<3}", &digits[..digits.len().min(3)]);
        padded.parse::<i64>().ok()?
    } else { 0 };
    if !s.ends_with('Z') { return None; }
    Some(((days_from_civil(y, mo, d) * 86_400 + h * 3600 + mi * 60 + se) * 1000) + ms)
}
```

- [ ] **Krok 4: Uruchom testy.** Uruchom `cargo test -p pets-core`. Oczekiwany wynik: wszystkie testy przechodzą.

- [ ] **Krok 5: Commit**

```bash
git add crates/pets-core
git commit -m "feat(core): incremental tail reader and RFC3339 parsing"
```

---

### Task 7: Adapter hooków Claude Code

**Pliki:**
- Utwórz: `crates/pets-core/src/claude/mod.rs`, `crates/pets-core/src/claude/hook.rs`
- Zmień: `crates/pets-core/src/lib.rs` (dodaj `pub mod claude;`)

**Interfejsy:**
- Korzysta z: `model::*`, `tools::from_claude`
- Produkuje:
  - `claude::HookEnvelope { ts: i64, ppid: Option<u32>, payload: serde_json::Value }` (Serialize/Deserialize). `hook.exe` wysyła go w treści `POST /v1/events/claude`.
  - `claude::hook::to_events(env: &HookEnvelope) -> Vec<Event>`;
  - `claude::hook::transcript_path(env: &HookEnvelope) -> Option<std::path::PathBuf>`;
  - `claude::progress_from_tool_use(name: &str, input: &serde_json::Value) -> Option<Progress>` (`TodoWrite`, starsze wersje), używane też w tasku 8;
  - `claude::hook::TaskTracker::default()` i `tracker.observe(env: &HookEnvelope) -> Option<Event>`: postęp z `TaskCreate`/`TaskUpdate` w Claude Code 2.1+ (wynik S3/S5, `docs/spikes/S5-formats.md`).

**Mapowanie** (`payload.hook_event_name`):

| Zdarzenie | Wynik |
|---|---|
| `SessionStart` | `SessionStart` |
| `UserPromptSubmit` | `Prompt` |
| `PreToolUse` | `ToolStart(from_claude(tool_name))`, z wyjątkami: `TodoWrite` → `Meta` z postępem; `AskUserQuestion` → `NeedsInput`; `TaskCreate`, `TaskUpdate`, `TaskList`, `TaskGet` → nic |
| `PostToolUse` | `ToolEnd`, z wyjątkiem `TodoWrite` i narzędzi `Task*` → nic (ich postęp obsługuje `TaskTracker`) |
| `Notification` | `NeedsInput`, z wyjątkiem `notification_type == "idle_prompt"` → nic |
| `Stop` | `TurnEnd` |
| `PreCompact` | `Compact` |
| `SessionEnd` | `SessionEnd` |
| `SubagentStop` i nieznane | nic |

Każde zdarzenie niesie `data.cwd` z `payload.cwd` oraz `data.pid = ppid`.

- [ ] **Krok 1: Napisz testy, które na razie nie przejdą.** `crates/pets-core/src/claude/mod.rs`:

```rust
pub mod hook;

use serde::{Deserialize, Serialize};
use crate::model::Progress;

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct HookEnvelope {
    pub ts: i64,
    pub ppid: Option<u32>,
    pub payload: serde_json::Value,
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn todo_progress_counts_completed() {
        let input = json!({"todos": [
            {"content": "a", "status": "completed"},
            {"content": "b", "status": "in_progress"},
            {"content": "c", "status": "pending"}]});
        assert_eq!(progress_from_tool_use("TodoWrite", &input), Some(Progress { done: 1, total: 3 }));
        assert_eq!(progress_from_tool_use("Bash", &input), None);
    }
}
```

`crates/pets-core/src/claude/hook.rs`:

```rust
use std::path::PathBuf;
use crate::claude::{progress_from_tool_use, HookEnvelope};
use crate::model::*;
use crate::tools::from_claude;

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn env(v: serde_json::Value) -> HookEnvelope { HookEnvelope { ts: 1000, ppid: Some(77), payload: v } }

    #[test]
    fn pre_tool_use_becomes_tool_start_with_mapped_tool() {
        let e = to_events(&env(json!({"hook_event_name": "PreToolUse", "session_id": "s", "cwd": "C:\\p",
            "transcript_path": "C:\\t.jsonl", "tool_name": "Edit", "tool_input": {}})));
        assert_eq!(e.len(), 1);
        assert_eq!((e[0].kind, e[0].tool), (Kind::ToolStart, Some(Tool::Edit)));
        assert_eq!(e[0].session_id, "s");
        assert_eq!(e[0].data.pid, Some(77));
        assert_eq!(e[0].data.cwd.as_deref(), Some("C:\\p"));
        assert_eq!(e[0].ts, 1000);
    }

    #[test]
    fn todo_write_is_progress_not_tool() {
        let e = to_events(&env(json!({"hook_event_name": "PreToolUse", "session_id": "s", "tool_name": "TodoWrite",
            "tool_input": {"todos": [{"status": "completed"}, {"status": "pending"}]}})));
        assert_eq!(e[0].kind, Kind::Meta);
        assert_eq!(e[0].data.progress, Some(Progress { done: 1, total: 2 }));
        let post = to_events(&env(json!({"hook_event_name": "PostToolUse", "session_id": "s", "tool_name": "TodoWrite"})));
        assert!(post.is_empty());
    }

    #[test]
    fn lifecycle_events_map() {
        let k = |name: &str| to_events(&env(json!({"hook_event_name": name, "session_id": "s"}))).first().map(|e| e.kind);
        assert_eq!(k("SessionStart"), Some(Kind::SessionStart));
        assert_eq!(k("UserPromptSubmit"), Some(Kind::Prompt));
        assert_eq!(k("Notification"), Some(Kind::NeedsInput));
        assert_eq!(k("Stop"), Some(Kind::TurnEnd));
        assert_eq!(k("PreCompact"), Some(Kind::Compact));
        assert_eq!(k("SessionEnd"), Some(Kind::SessionEnd));
        assert_eq!(k("SubagentStop"), None);
        assert_eq!(k("Whatever"), None);
    }

    #[test]
    fn ask_user_question_needs_input() {
        let e = to_events(&env(json!({"hook_event_name": "PreToolUse", "session_id": "s", "tool_name": "AskUserQuestion"})));
        assert_eq!(e[0].kind, Kind::NeedsInput);
    }

    #[test]
    fn idle_prompt_notification_is_ignored_permission_is_not() {
        let n = |t: &str| to_events(&env(json!({"hook_event_name": "Notification", "session_id": "s", "notification_type": t})));
        assert!(n("idle_prompt").is_empty());
        assert_eq!(n("permission_prompt")[0].kind, Kind::NeedsInput);
    }

    #[test]
    fn task_list_tools_do_not_animate() {
        for ev in ["PreToolUse", "PostToolUse"] {
            for t in ["TaskCreate", "TaskUpdate", "TaskList", "TaskGet"] {
                assert!(to_events(&env(json!({"hook_event_name": ev, "session_id": "s", "tool_name": t}))).is_empty(), "{ev} {t}");
            }
        }
    }

    #[test]
    fn task_tracker_counts_created_completed_and_deleted() {
        let mut tr = TaskTracker::default();
        let create = |id: &str| env(json!({"hook_event_name": "PostToolUse", "session_id": "s", "tool_name": "TaskCreate",
            "tool_input": {"subject": "x"}, "tool_response": {"task": {"id": id, "subject": "x"}}}));
        let update = |id: &str, st: &str| env(json!({"hook_event_name": "PostToolUse", "session_id": "s", "tool_name": "TaskUpdate",
            "tool_input": {"taskId": id, "status": st}}));
        tr.observe(&create("1"));
        let e = tr.observe(&create("2")).unwrap();
        assert_eq!((e.kind, e.data.progress), (Kind::Meta, Some(Progress { done: 0, total: 2 })));
        let e = tr.observe(&update("1", "completed")).unwrap();
        assert_eq!(e.data.progress, Some(Progress { done: 1, total: 2 }));
        let e = tr.observe(&update("2", "deleted")).unwrap();
        assert_eq!(e.data.progress, Some(Progress { done: 1, total: 1 }));
        assert!(tr.observe(&env(json!({"hook_event_name": "PostToolUse", "session_id": "s", "tool_name": "TaskUpdate",
            "tool_input": {"taskId": "1", "subject": "tylko zmiana nazwy"}}))).is_none());
        assert!(tr.observe(&env(json!({"hook_event_name": "PreToolUse", "session_id": "s", "tool_name": "TaskCreate"}))).is_none());
    }

    #[test]
    fn missing_session_id_yields_nothing() {
        assert!(to_events(&env(json!({"hook_event_name": "Stop"}))).is_empty());
    }

    #[test]
    fn extracts_transcript_path() {
        let p = transcript_path(&env(json!({"transcript_path": "C:\\t.jsonl"})));
        assert_eq!(p, Some(PathBuf::from("C:\\t.jsonl")));
    }
}
```

W `lib.rs` dodaj `pub mod claude;`.

- [ ] **Krok 2: Uruchom testy i sprawdź, że nie przechodzą.** Uruchom `cargo test -p pets-core claude`. Oczekiwany wynik: błędy kompilacji (brak `progress_from_tool_use`, `to_events`, `transcript_path`).

- [ ] **Krok 3: Napisz implementację.** W `claude/mod.rs`, powyżej `mod tests`:

```rust
pub fn progress_from_tool_use(name: &str, input: &serde_json::Value) -> Option<Progress> {
    if name != "TodoWrite" { return None; }
    let todos = input.get("todos")?.as_array()?;
    let done = todos.iter().filter(|t| t.get("status").and_then(|s| s.as_str()) == Some("completed")).count();
    Some(Progress { done: done as u32, total: todos.len() as u32 })
}
```

W `claude/hook.rs`, powyżej `mod tests`:

```rust
pub fn transcript_path(env: &HookEnvelope) -> Option<PathBuf> {
    env.payload.get("transcript_path")?.as_str().map(PathBuf::from)
}

pub fn to_events(env: &HookEnvelope) -> Vec<Event> {
    let p = &env.payload;
    let Some(sid) = p.get("session_id").and_then(|v| v.as_str()) else { return vec![] };
    let name = p.get("hook_event_name").and_then(|v| v.as_str()).unwrap_or("");
    let tool_name = p.get("tool_name").and_then(|v| v.as_str()).unwrap_or("");
    let null = serde_json::Value::Null;
    let tool_input = p.get("tool_input").unwrap_or(&null);

    let mut e = Event::new(Source::Claude, sid, Kind::Meta, env.ts);
    e.data.cwd = p.get("cwd").and_then(|v| v.as_str()).map(String::from);
    e.data.pid = env.ppid;

    let task_tool = matches!(tool_name, "TaskCreate" | "TaskUpdate" | "TaskList" | "TaskGet");
    match name {
        "SessionStart" => e.kind = Kind::SessionStart,
        "UserPromptSubmit" => e.kind = Kind::Prompt,
        "PreToolUse" if task_tool => return vec![],
        "PostToolUse" if task_tool => return vec![],
        "Notification" if p.get("notification_type").and_then(|v| v.as_str()) == Some("idle_prompt") => return vec![],
        "PreToolUse" => {
            if let Some(pr) = progress_from_tool_use(tool_name, tool_input) {
                e.kind = Kind::Meta;
                e.data.progress = Some(pr);
            } else if tool_name == "AskUserQuestion" {
                e.kind = Kind::NeedsInput;
            } else {
                e.kind = Kind::ToolStart;
                e.tool = Some(from_claude(tool_name));
            }
        }
        "PostToolUse" => {
            if tool_name == "TodoWrite" { return vec![]; }
            e.kind = Kind::ToolEnd;
        }
        "Notification" => e.kind = Kind::NeedsInput,
        "Stop" => e.kind = Kind::TurnEnd,
        "PreCompact" => e.kind = Kind::Compact,
        "SessionEnd" => e.kind = Kind::SessionEnd,
        _ => return vec![],
    }
    vec![e]
}

/// Postęp z narzędzi listy zadań Claude Code 2.1+ (TaskCreate/TaskUpdate), śledzony per sesja.
#[derive(Default)]
pub struct TaskTracker {
    sessions: std::collections::HashMap<String, std::collections::BTreeMap<String, bool>>,
}

fn id_str(v: Option<&serde_json::Value>) -> Option<String> {
    match v? {
        serde_json::Value::String(s) => Some(s.clone()),
        serde_json::Value::Number(n) => Some(n.to_string()),
        _ => None,
    }
}

impl TaskTracker {
    pub fn observe(&mut self, env: &HookEnvelope) -> Option<Event> {
        let p = &env.payload;
        if p.get("hook_event_name").and_then(|v| v.as_str()) != Some("PostToolUse") { return None; }
        let sid = p.get("session_id")?.as_str()?;
        let tasks = self.sessions.entry(sid.to_string()).or_default();
        match p.get("tool_name").and_then(|v| v.as_str())? {
            "TaskCreate" => {
                let id = id_str(p.pointer("/tool_response/task/id"))?;
                tasks.insert(id, false);
            }
            "TaskUpdate" => {
                let id = id_str(p.pointer("/tool_input/taskId"))?;
                match p.pointer("/tool_input/status").and_then(|v| v.as_str())? {
                    "completed" => { tasks.insert(id, true); }
                    "pending" | "in_progress" => { tasks.insert(id, false); }
                    "deleted" => { tasks.remove(&id); }
                    _ => return None,
                }
            }
            _ => return None,
        }
        let done = tasks.values().filter(|d| **d).count() as u32;
        let mut e = Event::new(Source::Claude, sid, Kind::Meta, env.ts);
        e.data.progress = Some(Progress { done, total: tasks.len() as u32 });
        Some(e)
    }
}
```

- [ ] **Krok 4: Uruchom testy.** Uruchom `cargo test -p pets-core`. Oczekiwany wynik: wszystkie testy przechodzą.

- [ ] **Krok 5: Sprawdź na prawdziwych próbkach.** Dopisz na końcu `mod tests` w `hook.rs` test, który parsuje każdy plik z `tests/fixtures/claude/hooks/` z zadania 3:

```rust
    #[test]
    fn real_hook_fixtures_parse() {
        let dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/claude/hooks");
        let Ok(rd) = std::fs::read_dir(&dir) else { return };
        for f in rd.flatten() {
            let v: serde_json::Value = serde_json::from_str(&std::fs::read_to_string(f.path()).unwrap()).unwrap();
            let name = v.get("hook_event_name").and_then(|x| x.as_str()).unwrap_or("").to_string();
            let tool = v.get("tool_name").and_then(|x| x.as_str()).unwrap_or("").to_string();
            let idle = v.get("notification_type").and_then(|x| x.as_str()) == Some("idle_prompt");
            let ev = to_events(&env(v));
            if name != "SubagentStop" && name != "PostToolUse" && !tool.starts_with("Task") && !idle {
                assert!(!ev.is_empty(), "brak zdarzenia dla {:?}", f.path());
            }
        }
    }
```

Uruchom `cargo test -p pets-core`. Oczekiwany wynik: przechodzi.

- [ ] **Krok 6: Commit**

```bash
git add crates/pets-core
git commit -m "feat(core): Claude Code hook adapter"
```

---

### Task 8: Parser transkryptów Claude Code

**Pliki:**
- Utwórz: `crates/pets-core/src/claude/transcript.rs`
- Zmień: `crates/pets-core/src/claude/mod.rs` (dodaj `pub mod transcript;`)

**Interfejsy:**
- Korzysta z: `model::*`, `time::rfc3339_ms`, `claude::progress_from_tool_use`
- Produkuje:
  - `TranscriptParser::new() -> TranscriptParser`;
  - `TranscriptParser::parse_line(&mut self, line: &str) -> Vec<Event>`: zwraca najwyżej jedno zdarzenie `Kind::Meta` z tym, co z linii wynika (tytuł, kontekst, postęp, pochodzenie);
  - `claude::transcript::context_max(model: &str) -> u64`.

**Zasady:**
- **Tytuł** ma rangi: pierwszy prompt użytkownika = 1 (skrócony do 80 znaków), `ai-title` = 2, `custom-title` = 3. Tytuł jest wysyłany tylko wtedy, gdy ranga jest większa lub równa bieżącej.
- **Pierwszy prompt** to linia `type == "user"` bez `isMeta`, której `message.content` jest tekstem (string albo element `{"type":"text"}`) i nie zaczyna się od `<`. Wyniki narzędzi (`tool_result`) są pomijane.
- **Kontekst** z `assistant.message.usage`: `input_tokens + cache_creation_input_tokens + cache_read_input_tokens`. `max` to 1 000 000, gdy nazwa modelu zawiera `[1m]`, w pozostałych przypadkach 200 000.
- **Pochodzenie:** `entrypoint == "claude-desktop"` → `Origin::Desktop` + `App::ClaudeDesktop`; `"cli"` → `Origin::Cli` + `App::Terminal`. Wysyłane raz.
- **Sidechain:** linie z `isSidechain == true` (subagenci) są pomijane.
- **Czas zdarzenia:** z pola `timestamp`. Linie bez `timestamp` (np. `custom-title`) odkładają dane do najbliższej linii z czasem.

- [ ] **Krok 1: Napisz testy, które na razie nie przejdą.** `crates/pets-core/src/claude/transcript.rs`:

```rust
use crate::claude::progress_from_tool_use;
use crate::model::*;
use crate::time::rfc3339_ms;

#[cfg(test)]
mod tests {
    use super::*;

    const TS: &str = "2026-09-24T10:00:00.000Z";

    fn line(v: serde_json::Value) -> String { v.to_string() }

    #[test]
    fn first_prompt_then_ai_then_custom_title() {
        let mut p = TranscriptParser::new();
        let e = p.parse_line(&line(serde_json::json!({"type": "user", "sessionId": "s", "timestamp": TS,
            "entrypoint": "claude-desktop", "message": {"role": "user", "content": "Zrób widżet do paska zadań"}})));
        assert_eq!(e[0].data.title.as_deref(), Some("Zrób widżet do paska zadań"));
        assert_eq!(e[0].data.origin, Some(Origin::Desktop));
        assert_eq!(e[0].data.app, Some(App::ClaudeDesktop));
        // ai-title bez timestamp jest odkładany do następnej linii z czasem
        assert!(p.parse_line(&line(serde_json::json!({"type": "ai-title", "aiTitle": "Widżet", "sessionId": "s"}))).is_empty());
        let e = p.parse_line(&line(serde_json::json!({"type": "assistant", "sessionId": "s", "timestamp": TS,
            "message": {"model": "claude-opus-5", "content": [], "usage": {"input_tokens": 2,
            "cache_creation_input_tokens": 100, "cache_read_input_tokens": 900, "output_tokens": 5}}})));
        assert_eq!(e[0].data.title.as_deref(), Some("Widżet"));
        assert_eq!(e[0].data.context, Some(Context { used: 1002, max: 200_000 }));
        p.parse_line(&line(serde_json::json!({"type": "custom-title", "customTitle": "Agent Pets", "sessionId": "s"})));
        p.parse_line(&line(serde_json::json!({"type": "ai-title", "aiTitle": "Gorszy", "sessionId": "s"})));
        let e = p.parse_line(&line(serde_json::json!({"type": "user", "sessionId": "s", "timestamp": TS,
            "message": {"role": "user", "content": "drugi prompt"}})));
        assert_eq!(e[0].data.title.as_deref(), Some("Agent Pets"));
    }

    #[test]
    fn tool_results_and_tags_are_not_titles() {
        let mut p = TranscriptParser::new();
        let e = p.parse_line(&line(serde_json::json!({"type": "user", "sessionId": "s", "timestamp": TS,
            "message": {"role": "user", "content": [{"type": "tool_result", "content": "x"}]}})));
        assert!(e.is_empty() || e[0].data.title.is_none());
        let e = p.parse_line(&line(serde_json::json!({"type": "user", "sessionId": "s", "timestamp": TS,
            "message": {"role": "user", "content": "<command-name>/model</command-name>"}})));
        assert!(e.is_empty() || e[0].data.title.is_none());
    }

    #[test]
    fn long_prompt_is_truncated_to_80_chars() {
        let mut p = TranscriptParser::new();
        let long = "ą".repeat(100);
        let e = p.parse_line(&line(serde_json::json!({"type": "user", "sessionId": "s", "timestamp": TS,
            "message": {"role": "user", "content": long}})));
        assert_eq!(e[0].data.title.as_ref().unwrap().chars().count(), 80);
    }

    #[test]
    fn todo_tool_use_sets_progress() {
        let mut p = TranscriptParser::new();
        let e = p.parse_line(&line(serde_json::json!({"type": "assistant", "sessionId": "s", "timestamp": TS,
            "message": {"model": "m", "content": [{"type": "tool_use", "name": "TodoWrite",
            "input": {"todos": [{"status": "completed"}, {"status": "completed"}, {"status": "pending"}]}}]}})));
        assert_eq!(e[0].data.progress, Some(Progress { done: 2, total: 3 }));
    }

    #[test]
    fn million_context_models() {
        assert_eq!(context_max("claude-opus-5[1m]"), 1_000_000);
        assert_eq!(context_max("claude-sonnet-5"), 200_000);
    }

    #[test]
    fn sidechain_lines_are_ignored() {
        let mut p = TranscriptParser::new();
        let e = p.parse_line(&line(serde_json::json!({"type": "user", "sessionId": "s", "timestamp": TS, "isSidechain": true,
            "message": {"role": "user", "content": "prompt subagenta"}})));
        assert!(e.is_empty());
    }

    #[test]
    fn garbage_lines_are_ignored() {
        let mut p = TranscriptParser::new();
        assert!(p.parse_line("{not json").is_empty());
    }

    #[test]
    fn real_transcript_fixture_yields_title() {
        let f = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/claude/desktop-session.jsonl");
        let Ok(text) = std::fs::read_to_string(&f) else { return };
        let mut p = TranscriptParser::new();
        let evs: Vec<Event> = text.lines().flat_map(|l| p.parse_line(l)).collect();
        assert!(evs.iter().any(|e| e.data.title.is_some()));
        assert!(evs.iter().any(|e| e.data.context.is_some()));
    }
}
```

W `claude/mod.rs` dodaj `pub mod transcript;`.

- [ ] **Krok 2: Uruchom testy i sprawdź, że nie przechodzą.** Uruchom `cargo test -p pets-core transcript`. Oczekiwany wynik: błędy kompilacji.

- [ ] **Krok 3: Napisz implementację.** W `transcript.rs`, powyżej `mod tests`:

```rust
pub fn context_max(model: &str) -> u64 {
    if model.contains("[1m]") { 1_000_000 } else { 200_000 }
}

#[derive(Default)]
pub struct TranscriptParser {
    session_id: Option<String>,
    title_rank: u8,
    origin_sent: bool,
    acc: EventData,
    dirty: bool,
}

fn prompt_text(msg: &serde_json::Value) -> Option<String> {
    let c = msg.get("content")?;
    let text = if let Some(s) = c.as_str() {
        s.to_string()
    } else {
        let arr = c.as_array()?;
        arr.iter().find(|x| x.get("type").and_then(|t| t.as_str()) == Some("text"))?
            .get("text")?.as_str()?.to_string()
    };
    let t = text.trim();
    if t.is_empty() || t.starts_with('<') { return None; }
    Some(t.chars().take(80).collect())
}

impl TranscriptParser {
    pub fn new() -> Self { Self::default() }

    fn set_title(&mut self, title: &str, rank: u8) {
        if rank >= self.title_rank && !title.is_empty() {
            self.title_rank = rank;
            self.acc.title = Some(title.to_string());
            self.dirty = true;
        }
    }

    pub fn parse_line(&mut self, line: &str) -> Vec<Event> {
        let Ok(d) = serde_json::from_str::<serde_json::Value>(line) else { return vec![] };
        // linie subagentów (sidechain) nie mogą nadpisać kontekstu ani tytułu sesji głównej
        if d.get("isSidechain").and_then(|v| v.as_bool()) == Some(true) { return vec![]; }
        let s = |k: &str| d.get(k).and_then(|v| v.as_str());
        if let Some(sid) = s("sessionId") { self.session_id = Some(sid.to_string()); }
        if !self.origin_sent {
            match s("entrypoint") {
                Some("claude-desktop") => { self.acc.origin = Some(Origin::Desktop); self.acc.app = Some(App::ClaudeDesktop); self.origin_sent = true; self.dirty = true; }
                Some("cli") => { self.acc.origin = Some(Origin::Cli); self.acc.app = Some(App::Terminal); self.origin_sent = true; self.dirty = true; }
                _ => {}
            }
        }
        if let Some(cwd) = s("cwd") { if self.acc.cwd.is_none() { self.acc.cwd = Some(cwd.to_string()); self.dirty = true; } }
        match s("type") {
            Some("custom-title") => if let Some(t) = s("customTitle") { self.set_title(t, 3) },
            Some("ai-title") => if let Some(t) = s("aiTitle") { self.set_title(t, 2) },
            Some("user") if d.get("isMeta").and_then(|v| v.as_bool()) != Some(true) && self.title_rank < 1 => {
                if let Some(t) = d.get("message").and_then(prompt_text) { self.set_title(&t, 1) }
            }
            Some("assistant") => {
                if let Some(m) = d.get("message") {
                    if let Some(u) = m.get("usage") {
                        let n = |k: &str| u.get(k).and_then(|v| v.as_u64()).unwrap_or(0);
                        let used = n("input_tokens") + n("cache_creation_input_tokens") + n("cache_read_input_tokens");
                        let model = m.get("model").and_then(|v| v.as_str()).unwrap_or("");
                        self.acc.context = Some(Context { used, max: context_max(model) });
                        self.dirty = true;
                    }
                    for c in m.get("content").and_then(|v| v.as_array()).into_iter().flatten() {
                        if c.get("type").and_then(|v| v.as_str()) == Some("tool_use") {
                            let name = c.get("name").and_then(|v| v.as_str()).unwrap_or("");
                            if let Some(p) = progress_from_tool_use(name, c.get("input").unwrap_or(&serde_json::Value::Null)) {
                                self.acc.progress = Some(p);
                                self.dirty = true;
                            }
                        }
                    }
                }
            }
            _ => {}
        }
        let (Some(ts), Some(sid)) = (s("timestamp").and_then(rfc3339_ms), self.session_id.clone()) else { return vec![] };
        if !self.dirty { return vec![]; }
        self.dirty = false;
        let mut e = Event::new(Source::Claude, sid, Kind::Meta, ts);
        e.data = std::mem::take(&mut self.acc);
        vec![e]
    }
}
```

- [ ] **Krok 4: Uruchom testy.** Uruchom `cargo test -p pets-core`. Oczekiwany wynik: wszystkie testy przechodzą.

- [ ] **Krok 5: Commit**

```bash
git add crates/pets-core
git commit -m "feat(core): Claude transcript parser for title, context and progress"
```

---

### Task 9: Parser rolloutów Codexa

**Pliki:**
- Utwórz: `crates/pets-core/src/codex/mod.rs` (`pub mod rollout;`), `crates/pets-core/src/codex/rollout.rs`
- Zmień: `crates/pets-core/src/lib.rs` (dodaj `pub mod codex;`)

**Interfejsy:**
- Korzysta z: `model::*`, `tools::from_codex`, `time::rfc3339_ms`
- Produkuje:
  - `RolloutParser::new() -> RolloutParser` (jeden na plik; ma stan);
  - `RolloutParser::parse_line(&mut self, line: &str) -> Vec<Event>`;
  - `codex::rollout::js_tool_calls(src: &str) -> Vec<String>`.

**Mapowanie** (tabela formatów z nagłówka planu):

| Wejście | Wynik |
|---|---|
| `session_meta` | `SessionStart` z `cwd`. Pochodzenie: `originator == "agent-router"` → `Source::Router`, `Origin::Router`; `originator == "codex-tui"` lub `source == "cli"` → `Origin::Cli`, `App::Terminal`; w pozostałych przypadkach `Origin::Desktop`, `App::CodexApp`. |
| `session_meta` z `thread_source == "subagent"` | Własnego zwierzaka nie ma. Jeśli `source.subagent.thread_spawn.parent_thread_id` istnieje, wątek rodzica dostaje `ToolStart(Agent)`, a koniec tury subagenta daje `ToolEnd` na rodzicu. Pozostałe linie są pomijane. |
| `event_msg/task_started` | `Prompt` |
| `event_msg/task_complete`, `event_msg/turn_aborted` | `TurnEnd` |
| `event_msg/error`, `event_msg/stream_error` | `Error` |
| `event_msg/token_count` | `Meta`: `context = {last_token_usage.input_tokens, model_context_window}`, a `limits` z `rate_limits.primary/secondary` (`window_minutes` 300 → `FiveHour`, 10080 → `Weekly`, `resets_at` × 1000) |
| `event_msg/item_completed` z `UserMessage` | `Meta` z tytułem (pierwsze 80 znaków), tylko raz |
| `event_msg/item_completed` z `ContextCompaction`; linia typu `compacted` | `Compact` |
| `response_item/custom_tool_call` | `apply_patch` → `ToolStart(Edit)`. `exec` → pierwsze `tools.X(` z `from_codex(X) == Some(_)` daje `ToolStart`; jeśli wśród wywołań jest `request_user_input*`, wynik to `NeedsInput`. |
| `response_item/function_call` | `request_user_input`, `request_user_input_async`, `request_permissions` → `NeedsInput`; `update_plan` → `Meta` z postępem (`arguments.plan[].status == "completed"`); `namespace` zaczynający się od `mcp__` → `ToolStart(Mcp)`; w pozostałych przypadkach `from_codex(name)` |
| `response_item/web_search_call` | `ToolStart(Web)` |
| `response_item/custom_tool_call_output`, `response_item/function_call_output` | `ToolEnd` |

- [ ] **Krok 1: Napisz testy, które na razie nie przejdą.** `crates/pets-core/src/codex/rollout.rs`:

```rust
use serde_json::Value;
use crate::model::*;
use crate::time::rfc3339_ms;
use crate::tools::from_codex;

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    const TS: &str = "2026-09-23T19:25:19.386Z";
    fn l(ty: &str, payload: Value) -> String { json!({"timestamp": TS, "type": ty, "payload": payload}).to_string() }
    fn meta(originator: &str, source: Value, thread_source: Value) -> String {
        l("session_meta", json!({"id": "t1", "cwd": "C:\\p", "originator": originator, "source": source, "thread_source": thread_source}))
    }
    fn started(p: &mut RolloutParser) { p.parse_line(&meta("Codex Desktop", json!("vscode"), json!("user"))); }

    #[test]
    fn desktop_session_meta() {
        let mut p = RolloutParser::new();
        let e = p.parse_line(&meta("Codex Desktop", json!("vscode"), json!("user")));
        assert_eq!((e[0].kind, e[0].source, e[0].session_id.as_str()), (Kind::SessionStart, Source::Codex, "t1"));
        assert_eq!((e[0].data.origin, e[0].data.app), (Some(Origin::Desktop), Some(App::CodexApp)));
        assert_eq!(e[0].data.cwd.as_deref(), Some("C:\\p"));
        assert_eq!(e[0].ts, 1_790_191_519_386);
    }

    #[test]
    fn router_and_cli_origins() {
        let mut p = RolloutParser::new();
        let e = p.parse_line(&meta("agent-router", json!("vscode"), Value::Null));
        assert_eq!((e[0].source, e[0].data.origin), (Source::Router, Some(Origin::Router)));
        let mut p = RolloutParser::new();
        let e = p.parse_line(&meta("codex-tui", json!("cli"), json!("user")));
        assert_eq!((e[0].data.origin, e[0].data.app), (Some(Origin::Cli), Some(App::Terminal)));
    }

    #[test]
    fn subagent_is_agent_action_on_parent() {
        let mut p = RolloutParser::new();
        let src = json!({"subagent": {"thread_spawn": {"parent_thread_id": "parent1", "depth": 1}}});
        let e = p.parse_line(&meta("Codex Desktop", src, json!("subagent")));
        assert_eq!((e[0].session_id.as_str(), e[0].kind, e[0].tool), ("parent1", Kind::ToolStart, Some(Tool::Agent)));
        assert!(p.parse_line(&l("response_item", json!({"type": "custom_tool_call", "name": "apply_patch", "input": ""}))).is_empty());
        let e = p.parse_line(&l("event_msg", json!({"type": "task_complete"})));
        assert_eq!((e[0].session_id.as_str(), e[0].kind), ("parent1", Kind::ToolEnd));
    }

    #[test]
    fn guardian_subagent_without_parent_is_ignored() {
        let mut p = RolloutParser::new();
        assert!(p.parse_line(&meta("Codex Desktop", json!({"subagent": {"other": "guardian"}}), json!("subagent"))).is_empty());
        assert!(p.parse_line(&l("event_msg", json!({"type": "task_started"}))).is_empty());
    }

    #[test]
    fn turn_lifecycle() {
        let mut p = RolloutParser::new();
        started(&mut p);
        let k = |p: &mut RolloutParser, t: &str| p.parse_line(&l("event_msg", json!({"type": t})))[0].kind;
        assert_eq!(k(&mut p, "task_started"), Kind::Prompt);
        assert_eq!(k(&mut p, "task_complete"), Kind::TurnEnd);
        assert_eq!(k(&mut p, "turn_aborted"), Kind::TurnEnd);
        assert_eq!(k(&mut p, "error"), Kind::Error);
    }

    #[test]
    fn exec_js_input_picks_first_meaningful_tool() {
        let mut p = RolloutParser::new();
        started(&mut p);
        let input = "await tools.update_plan({plan:[]}); const r = await tools.exec_command({cmd:\"ls\"})";
        let e = p.parse_line(&l("response_item", json!({"type": "custom_tool_call", "name": "exec", "input": input})));
        assert_eq!((e[0].kind, e[0].tool), (Kind::ToolStart, Some(Tool::Bash)));
        let e = p.parse_line(&l("response_item", json!({"type": "custom_tool_call", "name": "exec", "input": "tools.apply_patch(x)"})));
        assert_eq!(e[0].tool, Some(Tool::Edit));
        let e = p.parse_line(&l("response_item", json!({"type": "custom_tool_call", "name": "exec", "input": "tools.request_user_input({})"})));
        assert_eq!(e[0].kind, Kind::NeedsInput);
        let e = p.parse_line(&l("response_item", json!({"type": "custom_tool_call_output", "output": []})));
        assert_eq!(e[0].kind, Kind::ToolEnd);
    }

    #[test]
    fn function_calls() {
        let mut p = RolloutParser::new();
        started(&mut p);
        let fc = |p: &mut RolloutParser, v: Value| p.parse_line(&l("response_item", v));
        let e = fc(&mut p, json!({"type": "function_call", "name": "js", "namespace": "mcp__node_repl", "arguments": "{}"}));
        assert_eq!(e[0].tool, Some(Tool::Mcp));
        let e = fc(&mut p, json!({"type": "function_call", "name": "run", "namespace": "web", "arguments": "{}"}));
        assert_eq!(e[0].tool, Some(Tool::Web));
        let e = fc(&mut p, json!({"type": "function_call", "name": "request_user_input", "arguments": "{}"}));
        assert_eq!(e[0].kind, Kind::NeedsInput);
        let e = fc(&mut p, json!({"type": "function_call", "name": "update_plan",
            "arguments": "{\"plan\":[{\"step\":\"a\",\"status\":\"completed\"},{\"step\":\"b\",\"status\":\"in_progress\"}]}"}));
        assert_eq!((e[0].kind, e[0].data.progress), (Kind::Meta, Some(Progress { done: 1, total: 2 })));
        assert!(fc(&mut p, json!({"type": "function_call", "name": "sleep", "namespace": "clock", "arguments": "{}"})).is_empty());
    }

    #[test]
    fn token_count_gives_context_and_limits() {
        let mut p = RolloutParser::new();
        started(&mut p);
        let e = p.parse_line(&l("event_msg", json!({"type": "token_count",
            "info": {"last_token_usage": {"input_tokens": 28370}, "model_context_window": 258400},
            "rate_limits": {"primary": {"used_percent": 12.5, "window_minutes": 300, "resets_at": 1790209519},
                            "secondary": {"used_percent": 6.0, "window_minutes": 10080, "resets_at": 1790711013}}})));
        assert_eq!(e[0].data.context, Some(Context { used: 28370, max: 258400 }));
        assert_eq!(e[0].data.limits, vec![
            Limit { agent: Agent::Codex, window: Window::FiveHour, used_pct: 12.5, resets_at: Some(1_790_209_519_000) },
            Limit { agent: Agent::Codex, window: Window::Weekly, used_pct: 6.0, resets_at: Some(1_790_711_013_000) }]);
    }

    #[test]
    fn user_message_titles_once_and_compaction() {
        let mut p = RolloutParser::new();
        started(&mut p);
        let um = |t: &str| l("event_msg", json!({"type": "item_completed", "item": {"type": "UserMessage", "content": [{"type": "text", "text": t}]}}));
        assert_eq!(p.parse_line(&um("Pierwszy"))[0].data.title.as_deref(), Some("Pierwszy"));
        assert!(p.parse_line(&um("Drugi")).is_empty());
        let e = p.parse_line(&l("event_msg", json!({"type": "item_completed", "item": {"type": "ContextCompaction"}})));
        assert_eq!(e[0].kind, Kind::Compact);
    }

    #[test]
    fn js_tool_call_scanner() {
        assert_eq!(js_tool_calls("a tools.exec_command ({}) tools.x tools.apply_patch("), vec!["exec_command", "apply_patch"]);
    }

    #[test]
    fn real_rollout_fixtures_parse() {
        let dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/codex");
        let Ok(rd) = std::fs::read_dir(&dir) else { return };
        for f in rd.flatten() {
            let mut p = RolloutParser::new();
            let text = std::fs::read_to_string(f.path()).unwrap();
            let evs: Vec<Event> = text.lines().flat_map(|x| p.parse_line(x)).collect();
            assert!(evs.iter().any(|e| e.kind == Kind::SessionStart), "brak SessionStart w {:?}", f.path());
            assert!(evs.iter().any(|e| e.kind == Kind::Prompt), "brak Prompt w {:?}", f.path());
        }
    }
}
```

W `lib.rs` dodaj `pub mod codex;`. Utwórz `codex/mod.rs` z treścią `pub mod rollout;`.

- [ ] **Krok 2: Uruchom testy i sprawdź, że nie przechodzą.** Uruchom `cargo test -p pets-core rollout`. Oczekiwany wynik: błędy kompilacji.

- [ ] **Krok 3: Napisz implementację.** W `rollout.rs`, powyżej `mod tests`:

```rust
pub fn js_tool_calls(src: &str) -> Vec<String> {
    let mut out = Vec::new();
    let mut rest = src;
    while let Some(i) = rest.find("tools.") {
        rest = &rest[i + 6..];
        let name: String = rest.chars().take_while(|c| c.is_ascii_alphanumeric() || *c == '_').collect();
        let after = rest[name.len()..].trim_start();
        if !name.is_empty() && after.starts_with('(') { out.push(name); }
    }
    out
}

const ASK: [&str; 3] = ["request_user_input", "request_user_input_async", "request_permissions"];

fn limits_from(rl: &Value) -> Vec<Limit> {
    ["primary", "secondary"].iter().filter_map(|k| {
        let w = rl.get(*k)?;
        let window = match w.get("window_minutes")?.as_u64()? { 300 => Window::FiveHour, 10080 => Window::Weekly, _ => return None };
        Some(Limit {
            agent: Agent::Codex,
            window,
            used_pct: w.get("used_percent")?.as_f64()? as f32,
            resets_at: w.get("resets_at").and_then(|v| v.as_i64()).map(|s| s * 1000),
        })
    }).collect()
}

#[derive(Default)]
pub struct RolloutParser {
    sid: Option<String>,
    parent: Option<String>,
    skip: bool,
    router: bool,
    titled: bool,
}

impl RolloutParser {
    pub fn new() -> Self { Self::default() }

    fn ev(&self, kind: Kind, ts: i64) -> Option<Event> {
        let src = if self.router { Source::Router } else { Source::Codex };
        Some(Event::new(src, self.sid.clone()?, kind, ts))
    }

    fn one(&self, ts: i64, kind: Kind) -> Vec<Event> {
        self.ev(kind, ts).map(|e| vec![e]).unwrap_or_default()
    }

    fn tool_start(&self, tool: Tool, ts: i64) -> Vec<Event> {
        self.ev(Kind::ToolStart, ts).map(|mut e| { e.tool = Some(tool); vec![e] }).unwrap_or_default()
    }

    pub fn parse_line(&mut self, line: &str) -> Vec<Event> {
        let Ok(d) = serde_json::from_str::<Value>(line) else { return vec![] };
        let Some(ts) = d.get("timestamp").and_then(|v| v.as_str()).and_then(rfc3339_ms) else { return vec![] };
        let ty = d.get("type").and_then(|v| v.as_str()).unwrap_or("");
        let null = Value::Null;
        let p = d.get("payload").unwrap_or(&null);
        let pt = p.get("type").and_then(|v| v.as_str()).unwrap_or("");
        let ps = |k: &str| p.get(k).and_then(|v| v.as_str());

        if ty == "session_meta" {
            let id = ps("id").or(ps("session_id")).unwrap_or("").to_string();
            if ps("thread_source") == Some("subagent") {
                self.skip = true;
                self.parent = p.pointer("/source/subagent/thread_spawn/parent_thread_id").and_then(|v| v.as_str()).map(String::from);
                return match &self.parent {
                    Some(par) => { let mut e = Event::new(Source::Codex, par.clone(), Kind::ToolStart, ts); e.tool = Some(Tool::Agent); vec![e] }
                    None => vec![],
                };
            }
            let originator = ps("originator").unwrap_or("");
            self.router = originator == "agent-router";
            self.sid = Some(id);
            let (origin, app) = if self.router { (Origin::Router, None) }
                else if originator == "codex-tui" || ps("source") == Some("cli") { (Origin::Cli, Some(App::Terminal)) }
                else { (Origin::Desktop, Some(App::CodexApp)) };
            let mut e = self.ev(Kind::SessionStart, ts).unwrap();
            e.data.cwd = ps("cwd").map(String::from);
            e.data.origin = Some(origin);
            e.data.app = app;
            return vec![e];
        }

        if self.skip {
            if ty == "event_msg" && (pt == "task_complete" || pt == "turn_aborted") {
                if let Some(par) = &self.parent { return vec![Event::new(Source::Codex, par.clone(), Kind::ToolEnd, ts)]; }
            }
            return vec![];
        }
        if self.sid.is_none() { return vec![]; }

        match (ty, pt) {
            ("event_msg", "task_started") => self.one(ts, Kind::Prompt),
            ("event_msg", "task_complete") | ("event_msg", "turn_aborted") => self.one(ts, Kind::TurnEnd),
            ("event_msg", "error") | ("event_msg", "stream_error") => self.one(ts, Kind::Error),
            ("event_msg", "token_count") => {
                let mut e = self.ev(Kind::Meta, ts).unwrap();
                if let (Some(used), Some(max)) = (
                    p.pointer("/info/last_token_usage/input_tokens").and_then(|v| v.as_u64()),
                    p.pointer("/info/model_context_window").and_then(|v| v.as_u64()),
                ) { e.data.context = Some(Context { used, max }); }
                if let Some(rl) = p.get("rate_limits") { e.data.limits = limits_from(rl); }
                if e.data.context.is_none() && e.data.limits.is_empty() { vec![] } else { vec![e] }
            }
            ("event_msg", "item_completed") => match p.pointer("/item/type").and_then(|v| v.as_str()) {
                Some("UserMessage") if !self.titled => {
                    let text = p.pointer("/item/content/0/text").and_then(|v| v.as_str()).unwrap_or("").trim();
                    if text.is_empty() { return vec![]; }
                    self.titled = true;
                    let mut e = self.ev(Kind::Meta, ts).unwrap();
                    e.data.title = Some(text.chars().take(80).collect());
                    vec![e]
                }
                Some("ContextCompaction") => self.one(ts, Kind::Compact),
                _ => vec![],
            },
            ("compacted", _) => self.one(ts, Kind::Compact),
            ("response_item", "custom_tool_call") => match ps("name") {
                Some("apply_patch") => self.tool_start(Tool::Edit, ts),
                Some("exec") => {
                    let calls = js_tool_calls(ps("input").unwrap_or(""));
                    if calls.iter().any(|c| ASK.contains(&c.as_str())) { return self.one(ts, Kind::NeedsInput); }
                    match calls.iter().find_map(|c| from_codex(c)) {
                        Some(t) => self.tool_start(t, ts),
                        None => vec![],
                    }
                }
                _ => vec![],
            },
            ("response_item", "function_call") => {
                let name = ps("name").unwrap_or("");
                let ns = ps("namespace").unwrap_or("");
                if ASK.contains(&name) { return self.one(ts, Kind::NeedsInput); }
                if name == "update_plan" {
                    let args: Value = serde_json::from_str(ps("arguments").unwrap_or("{}")).unwrap_or(Value::Null);
                    let Some(plan) = args.get("plan").and_then(|v| v.as_array()) else { return vec![] };
                    let done = plan.iter().filter(|s| s.get("status").and_then(|v| v.as_str()) == Some("completed")).count();
                    let mut e = self.ev(Kind::Meta, ts).unwrap();
                    e.data.progress = Some(Progress { done: done as u32, total: plan.len() as u32 });
                    return vec![e];
                }
                let tool = if ns.starts_with("mcp__") { Some(Tool::Mcp) } else { from_codex(name) };
                tool.map(|t| self.tool_start(t, ts)).unwrap_or_default()
            }
            ("response_item", "web_search_call") => self.tool_start(Tool::Web, ts),
            ("response_item", "custom_tool_call_output") | ("response_item", "function_call_output") => self.one(ts, Kind::ToolEnd),
            _ => vec![],
        }
    }
}
```

- [ ] **Krok 4: Uruchom testy.** Uruchom `cargo test -p pets-core`. Oczekiwany wynik: wszystkie testy przechodzą, łącznie z `real_rollout_fixtures_parse` na próbkach z zadania 3.

- [ ] **Krok 5: Commit**

```bash
git add crates/pets-core
git commit -m "feat(core): Codex rollout parser for tools, turns, context and limits"
```

---

### Task 10: Endpoint i serwer ingest

**Pliki:**
- Utwórz: `crates/pets-core/src/endpoint.rs`, `crates/pets-core/src/ingest.rs`
- Zmień: `crates/pets-core/Cargo.toml`, `crates/pets-core/src/lib.rs` (dodaj `pub mod endpoint; pub mod ingest;`)

**Interfejsy:**
- Korzysta z: `claude::HookEnvelope`
- Produkuje:
  - `Endpoint { port: u16, token: String }` z metodami `Endpoint::default_path() -> PathBuf` (`%APPDATA%\agent-pets\endpoint.json`), `Endpoint::new_token() -> String`, `endpoint.write(&Path) -> io::Result<()>` (atomowo) i `Endpoint::read(&Path) -> io::Result<Endpoint>`;
  - `enum Incoming { ClaudeHook(HookEnvelope) }`;
  - `Ingest::start(token: String, tx: std::sync::mpsc::Sender<Incoming>) -> anyhow::Result<Ingest>`, `ingest.endpoint() -> &Endpoint` oraz `ingest.stop()`.
- Protokół: `POST /v1/events/claude`, nagłówek `Authorization: Bearer <token>`, treść JSON z `HookEnvelope` (najwyżej 1 MiB). Odpowiedzi: 204 (przyjęte), 401 (zły token), 404 (zła ścieżka lub metoda), 400 (zły JSON), 413 (za duża treść).

- [ ] **Krok 1: Dodaj zależności.** W `crates/pets-core/Cargo.toml`, w `[dependencies]`: `tiny_http = "0.12"`, `rand = "0.8"`, `dirs = "5"`. W `[dev-dependencies]`: `ureq = "2"`.

- [ ] **Krok 2: Napisz testy, które na razie nie przejdą.** `crates/pets-core/src/endpoint.rs`:

```rust
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn roundtrip_and_token_shape() {
        let dir = tempfile::tempdir().unwrap();
        let p = dir.path().join("sub").join("endpoint.json");
        let e = Endpoint { port: 4242, token: Endpoint::new_token() };
        assert_eq!(e.token.len(), 64);
        assert!(e.token.chars().all(|c| c.is_ascii_hexdigit()));
        e.write(&p).unwrap();
        assert_eq!(Endpoint::read(&p).unwrap(), e);
    }
}
```

`crates/pets-core/src/ingest.rs`:

```rust
use std::io::Read;
use std::sync::mpsc::Sender;
use std::sync::Arc;
use std::thread::JoinHandle;
use crate::claude::HookEnvelope;
use crate::endpoint::Endpoint;

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::mpsc::channel;
    use std::time::Duration;

    fn post(port: u16, path: &str, token: &str, body: &str) -> u16 {
        match ureq::post(&format!("http://127.0.0.1:{port}{path}"))
            .set("Authorization", &format!("Bearer {token}"))
            .timeout(Duration::from_secs(2))
            .send_string(body) {
            Ok(r) => r.status(),
            Err(ureq::Error::Status(c, _)) => c,
            Err(e) => panic!("{e}"),
        }
    }

    #[test]
    fn accepts_valid_hook_and_rejects_bad_requests() {
        let (tx, rx) = channel();
        let ing = Ingest::start("secret".into(), tx).unwrap();
        let port = ing.endpoint().port;
        let body = r#"{"ts":1,"ppid":5,"payload":{"hook_event_name":"Stop","session_id":"s"}}"#;
        assert_eq!(post(port, "/v1/events/claude", "secret", body), 204);
        match rx.recv_timeout(Duration::from_secs(2)).unwrap() {
            Incoming::ClaudeHook(h) => assert_eq!(h.ppid, Some(5)),
        }
        assert_eq!(post(port, "/v1/events/claude", "wrong", body), 401);
        assert_eq!(post(port, "/nope", "secret", body), 404);
        assert_eq!(post(port, "/v1/events/claude", "secret", "{bad"), 400);
        ing.stop();
    }
}
```

W `lib.rs` dodaj `pub mod endpoint; pub mod ingest;`.

- [ ] **Krok 3: Uruchom testy i sprawdź, że nie przechodzą.** Uruchom `cargo test -p pets-core`. Oczekiwany wynik: błędy kompilacji.

- [ ] **Krok 4: Napisz implementację.** W `endpoint.rs`, powyżej `mod tests`:

```rust
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct Endpoint {
    pub port: u16,
    pub token: String,
}

impl Endpoint {
    pub fn default_path() -> PathBuf {
        dirs::config_dir().unwrap_or_else(std::env::temp_dir).join("agent-pets").join("endpoint.json")
    }

    pub fn new_token() -> String {
        use rand::RngCore;
        let mut b = [0u8; 32];
        rand::thread_rng().fill_bytes(&mut b);
        b.iter().map(|x| format!("{x:02x}")).collect()
    }

    /// Zapis atomowy: plik tymczasowy obok, potem rename. %APPDATA% ma domyślnie uprawnienia tylko dla użytkownika.
    pub fn write(&self, path: &Path) -> std::io::Result<()> {
        if let Some(dir) = path.parent() { std::fs::create_dir_all(dir)?; }
        let tmp = path.with_extension("json.tmp");
        std::fs::write(&tmp, serde_json::to_vec(self)?)?;
        std::fs::rename(&tmp, path)
    }

    pub fn read(path: &Path) -> std::io::Result<Endpoint> {
        let data = std::fs::read(path)?;
        serde_json::from_slice(&data).map_err(|e| std::io::Error::new(std::io::ErrorKind::InvalidData, e))
    }
}
```

W `ingest.rs`, powyżej `mod tests`:

```rust
pub enum Incoming {
    ClaudeHook(HookEnvelope),
}

pub struct Ingest {
    endpoint: Endpoint,
    server: Arc<tiny_http::Server>,
    handle: Option<JoinHandle<()>>,
}

const MAX_BODY: u64 = 1 << 20;

impl Ingest {
    pub fn start(token: String, tx: Sender<Incoming>) -> anyhow::Result<Ingest> {
        let server = Arc::new(tiny_http::Server::http("127.0.0.1:0").map_err(|e| anyhow::anyhow!(e))?);
        let port = server.server_addr().to_ip().map(|a| a.port()).ok_or_else(|| anyhow::anyhow!("brak portu"))?;
        let endpoint = Endpoint { port, token: token.clone() };
        let srv = server.clone();
        let handle = std::thread::spawn(move || {
            let expected = format!("Bearer {token}");
            for mut req in srv.incoming_requests() {
                let status = handle_request(&mut req, &expected, &tx);
                let _ = req.respond(tiny_http::Response::empty(status));
            }
        });
        Ok(Ingest { endpoint, server, handle: Some(handle) })
    }

    pub fn endpoint(&self) -> &Endpoint { &self.endpoint }

    pub fn stop(mut self) {
        self.server.unblock();
        if let Some(h) = self.handle.take() { let _ = h.join(); }
    }
}

fn handle_request(req: &mut tiny_http::Request, expected: &str, tx: &Sender<Incoming>) -> u16 {
    if *req.method() != tiny_http::Method::Post || req.url() != "/v1/events/claude" { return 404; }
    let auth = req.headers().iter().find(|h| h.field.equiv("Authorization")).map(|h| h.value.as_str().to_string());
    if auth.as_deref() != Some(expected) { return 401; }
    if req.body_length().map(|l| l as u64 > MAX_BODY).unwrap_or(false) { return 413; }
    let mut body = Vec::new();
    if req.as_reader().take(MAX_BODY + 1).read_to_end(&mut body).is_err() { return 400; }
    if body.len() as u64 > MAX_BODY { return 413; }
    match serde_json::from_slice::<HookEnvelope>(&body) {
        Ok(env) => { let _ = tx.send(Incoming::ClaudeHook(env)); 204 }
        Err(_) => 400,
    }
}
```

- [ ] **Krok 5: Uruchom testy.** Uruchom `cargo test -p pets-core`. Oczekiwany wynik: wszystkie testy przechodzą.

- [ ] **Krok 6: Commit**

```bash
git add crates/pets-core
git commit -m "feat(core): endpoint file and authenticated localhost ingest server"
```

---

### Task 11: Procesy (PID) i `hook.exe`

**Pliki:**
- Utwórz: `crates/pets-core/src/pid.rs`, `crates/pets-hook/Cargo.toml`, `crates/pets-hook/src/main.rs`, `crates/pets-hook/tests/hook.rs`
- Zmień: `Cargo.toml` (dopisz `"crates/pets-hook"` do `members`), `crates/pets-core/Cargo.toml`, `crates/pets-core/src/lib.rs` (dodaj `pub mod pid;`)

**Interfejsy:**
- Korzysta z: `Endpoint`, `HookEnvelope`, `time::now_ms`, `Ingest` (w teście)
- Produkuje:
  - `pid::is_alive(pid: u32) -> bool`;
  - `pid::process_entry(pid: u32) -> Option<(u32 /*rodzic*/, String /*nazwa exe*/)>`;
  - `pid::agent_pid() -> Option<u32>`: PID procesu agenta, czyli pierwszego przodka `hook.exe`, który nie jest powłoką (`cmd.exe`, `bash.exe`, `sh.exe`, `pwsh.exe`, `powershell.exe`, `conhost.exe`);
  - binarny `hook.exe`. Czyta ścieżkę endpointu z `AGENT_PETS_ENDPOINT` (dla testów), a gdy jej nie ma, z `Endpoint::default_path()`.

- [ ] **Krok 1: Dodaj zależność do `pets-core`.** W `crates/pets-core/Cargo.toml`:

```toml
[target.'cfg(windows)'.dependencies]
windows-sys = { version = "0.59", features = ["Win32_Foundation", "Win32_System_Threading", "Win32_System_Diagnostics_ToolHelp"] }
```

- [ ] **Krok 2: Napisz testy PID, które na razie nie przejdą.** `crates/pets-core/src/pid.rs`:

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn own_process_is_alive_and_has_entry() {
        assert!(is_alive(std::process::id()));
        let (_, name) = process_entry(std::process::id()).unwrap();
        assert!(name.to_lowercase().ends_with(".exe"));
    }

    #[test]
    fn exited_child_is_dead() {
        let mut c = std::process::Command::new("cmd").args(["/c", "exit", "0"]).spawn().unwrap();
        let id = c.id();
        c.wait().unwrap();
        assert!(!is_alive(id));
    }
}
```

W `lib.rs` dodaj `pub mod pid;`. Uruchom `cargo test -p pets-core pid`. Oczekiwany wynik: błędy kompilacji.

- [ ] **Krok 3: Napisz `pid.rs`.** Powyżej `mod tests`:

```rust
#[cfg(windows)]
pub fn is_alive(pid: u32) -> bool {
    use windows_sys::Win32::Foundation::{CloseHandle, GetLastError, ERROR_ACCESS_DENIED, STILL_ACTIVE};
    use windows_sys::Win32::System::Threading::{GetExitCodeProcess, OpenProcess, PROCESS_QUERY_LIMITED_INFORMATION};
    unsafe {
        let h = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, pid);
        if h.is_null() {
            // chroniony proces istnieje, ale nie wolno go otworzyć
            return GetLastError() == ERROR_ACCESS_DENIED;
        }
        let mut code = 0u32;
        let ok = GetExitCodeProcess(h, &mut code);
        CloseHandle(h);
        ok != 0 && code == STILL_ACTIVE as u32
    }
}

#[cfg(windows)]
pub fn process_entry(pid: u32) -> Option<(u32, String)> {
    use windows_sys::Win32::Foundation::{CloseHandle, INVALID_HANDLE_VALUE};
    use windows_sys::Win32::System::Diagnostics::ToolHelp::*;
    unsafe {
        let snap = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0);
        if snap == INVALID_HANDLE_VALUE { return None; }
        let mut e: PROCESSENTRY32W = std::mem::zeroed();
        e.dwSize = std::mem::size_of::<PROCESSENTRY32W>() as u32;
        let mut ok = Process32FirstW(snap, &mut e);
        let mut out = None;
        while ok != 0 {
            if e.th32ProcessID == pid {
                let len = e.szExeFile.iter().position(|&c| c == 0).unwrap_or(e.szExeFile.len());
                out = Some((e.th32ParentProcessID, String::from_utf16_lossy(&e.szExeFile[..len])));
                break;
            }
            ok = Process32NextW(snap, &mut e);
        }
        CloseHandle(snap);
        out
    }
}

const SHELLS: [&str; 6] = ["cmd.exe", "bash.exe", "sh.exe", "pwsh.exe", "powershell.exe", "conhost.exe"];

#[cfg(windows)]
pub fn agent_pid() -> Option<u32> {
    let (mut pid, _) = process_entry(std::process::id())?;
    for _ in 0..4 {
        let (parent, name) = process_entry(pid)?;
        if SHELLS.contains(&name.to_lowercase().as_str()) { pid = parent; } else { return Some(pid); }
    }
    Some(pid)
}
```

Uruchom `cargo test -p pets-core pid`. Oczekiwany wynik: 2 testy przechodzą.

- [ ] **Krok 4: Utwórz crate `pets-hook` z testem integracyjnym.** W `Cargo.toml` workspace ustaw `members = ["crates/pets-core", "crates/pets-hook"]`. `crates/pets-hook/Cargo.toml`:

```toml
[package]
name = "pets-hook"
edition.workspace = true
version.workspace = true

[[bin]]
name = "hook"
path = "src/main.rs"

[dependencies]
pets-core = { path = "../pets-core" }
serde_json.workspace = true
ureq = { version = "2", default-features = false, features = ["json"] }
```

W głównym `Cargo.toml` dopisz (mały plik exe, bo hook uruchamia się przy każdym zdarzeniu):

```toml
[profile.release.package.pets-hook]
opt-level = "z"
```

`crates/pets-hook/tests/hook.rs`:

```rust
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
    let Incoming::ClaudeHook(env) = rx.recv_timeout(Duration::from_secs(2)).unwrap();
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
    assert!(t.elapsed() < Duration::from_millis(1500));
    let out = run_hook(&dir.path().join("missing.json"), "not json");
    assert!(out.status.success());
}
```

Dodaj do `crates/pets-hook/Cargo.toml` sekcję `[dev-dependencies]` z `tempfile = "3"`.

Uruchom `cargo test -p pets-hook`. Oczekiwany wynik: błąd kompilacji (brak `src/main.rs`).

- [ ] **Krok 5: Napisz `hook.exe`.** `crates/pets-hook/src/main.rs`:

```rust
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
    let agent = ureq::AgentBuilder::new().timeout(Duration::from_millis(300)).build();
    agent.post(&format!("http://127.0.0.1:{}/v1/events/claude", ep.port))
        .set("Authorization", &format!("Bearer {}", ep.token))
        .send_json(serde_json::to_value(&env).ok()?)
        .ok()?;
    Some(())
}

fn main() {
    let _ = std::panic::catch_unwind(run);
    std::process::exit(0);
}
```

Ustaw cichy hook paniki, żeby panika nie wypisała nic na stderr: pierwsza linia `main` to `std::panic::set_hook(Box::new(|_| {}));`.

- [ ] **Krok 6: Uruchom testy.** Uruchom `cargo test --workspace`. Oczekiwany wynik: wszystkie testy przechodzą.

- [ ] **Krok 7: Commit**

```bash
git add Cargo.toml crates/pets-core crates/pets-hook
git commit -m "feat(hook): silent hook.exe forwarding Claude Code hook payloads"
```

---

### Task 12: Obserwacja plików i odtwarzanie stanu

**Pliki:**
- Utwórz: `crates/pets-core/src/watch.rs`, `crates/pets-core/src/rehydrate.rs`
- Zmień: `crates/pets-core/Cargo.toml` (`notify = "6"`), `crates/pets-core/src/lib.rs` (dodaj `pub mod watch; pub mod rehydrate;`)

**Interfejsy:**
- Korzysta z: `TailReader`, `TranscriptParser`, `RolloutParser`
- Produkuje:
  - `enum FileKind { ClaudeTranscript, CodexRollout }` oraz `watch::kind_of(path: &Path) -> Option<FileKind>`. Pliki `rollout-*.jsonl` to `CodexRollout`; inne `*.jsonl`, których ścieżka zawiera segment `projects`, to `ClaudeTranscript`.
  - `Sources::new()`;
  - `sources.track(path: &Path, from_start: bool) -> bool`: `false`, gdy rodzaj pliku jest nieznany; ponowne wywołanie dla śledzonego pliku nic nie robi;
  - `sources.poll(path: &Path) -> Vec<Event>`: nieśledzony plik znanego rodzaju zaczyna być śledzony od początku;
  - `sources.poll_all() -> Vec<Event>`;
  - `watch::watch(roots: &[PathBuf], tx: Sender<PathBuf>) -> notify::Result<notify::RecommendedWatcher>`: rekurencyjnie; przekazuje ścieżki plików `.jsonl` utworzonych lub zmienionych; watcher trzeba trzymać przy życiu;
  - `rehydrate::recent_files(root: &Path, max_age: Duration) -> Vec<PathBuf>`: pliki `*.jsonl` zmodyfikowane w podanym oknie, rekurencyjnie, posortowane po czasie modyfikacji.

- [ ] **Krok 1: Napisz testy, które na razie nie przejdą.** `crates/pets-core/src/watch.rs`:

```rust
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::mpsc::Sender;
use crate::claude::transcript::TranscriptParser;
use crate::codex::rollout::RolloutParser;
use crate::model::Event;
use crate::tail::TailReader;

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;
    use std::time::Duration;

    const META: &str = r#"{"timestamp":"2026-09-24T10:00:00.000Z","type":"session_meta","payload":{"id":"t1","cwd":"C:\\p","originator":"Codex Desktop","source":"vscode","thread_source":"user"}}"#;
    const START: &str = r#"{"timestamp":"2026-09-24T10:00:01.000Z","type":"event_msg","payload":{"type":"task_started"}}"#;

    #[test]
    fn kinds_by_path() {
        assert_eq!(kind_of(Path::new(r"C:\u\.codex\sessions\2026\09\24\rollout-x.jsonl")), Some(FileKind::CodexRollout));
        assert_eq!(kind_of(Path::new(r"C:\u\.claude\projects\p\abc.jsonl")), Some(FileKind::ClaudeTranscript));
        assert_eq!(kind_of(Path::new(r"C:\u\notes.txt")), None);
    }

    #[test]
    fn sources_track_and_poll_incrementally() {
        let dir = tempfile::tempdir().unwrap();
        let p = dir.path().join("rollout-a.jsonl");
        std::fs::write(&p, format!("{META}\n")).unwrap();
        let mut s = Sources::new();
        assert!(s.track(&p, true));
        let e = s.poll(&p);
        assert_eq!(e.len(), 1);
        std::fs::OpenOptions::new().append(true).open(&p).unwrap().write_all(format!("{START}\n").as_bytes()).unwrap();
        assert_eq!(s.poll_all().len(), 1);
    }

    #[test]
    fn watcher_reports_changed_jsonl() {
        let dir = tempfile::tempdir().unwrap();
        let (tx, rx) = std::sync::mpsc::channel();
        let _w = watch(&[dir.path().to_path_buf()], tx).unwrap();
        std::thread::sleep(Duration::from_millis(200));
        let p = dir.path().join("rollout-b.jsonl");
        std::fs::write(&p, format!("{META}\n")).unwrap();
        let got = rx.recv_timeout(Duration::from_secs(3)).unwrap();
        assert_eq!(got.file_name(), p.file_name());
    }
}
```

`crates/pets-core/src/rehydrate.rs`:

```rust
use std::path::{Path, PathBuf};
use std::time::{Duration, SystemTime};

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn finds_recent_jsonl_recursively() {
        let dir = tempfile::tempdir().unwrap();
        let sub = dir.path().join("2026").join("09");
        std::fs::create_dir_all(&sub).unwrap();
        std::fs::write(sub.join("a.jsonl"), "x\n").unwrap();
        std::fs::write(sub.join("b.txt"), "x\n").unwrap();
        let found = recent_files(dir.path(), Duration::from_secs(60));
        assert_eq!(found.len(), 1);
        assert!(recent_files(&dir.path().join("missing"), Duration::from_secs(60)).is_empty());
    }
}
```

W `lib.rs` dodaj `pub mod watch; pub mod rehydrate;`. W `Cargo.toml` pets-core dodaj `notify = "6"`.

- [ ] **Krok 2: Uruchom testy i sprawdź, że nie przechodzą.** Uruchom `cargo test -p pets-core`. Oczekiwany wynik: błędy kompilacji.

- [ ] **Krok 3: Napisz implementację.** W `watch.rs`, powyżej `mod tests`:

```rust
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum FileKind { ClaudeTranscript, CodexRollout }

pub fn kind_of(path: &Path) -> Option<FileKind> {
    if path.extension().and_then(|e| e.to_str()) != Some("jsonl") { return None; }
    let name = path.file_name()?.to_str()?;
    if name.starts_with("rollout-") { return Some(FileKind::CodexRollout); }
    if path.components().any(|c| c.as_os_str() == "projects") { return Some(FileKind::ClaudeTranscript); }
    None
}

enum Parser { Claude(TranscriptParser), Codex(RolloutParser) }

pub struct Sources { tails: HashMap<PathBuf, (TailReader, Parser)> }

impl Sources {
    pub fn new() -> Self { Sources { tails: HashMap::new() } }

    pub fn track(&mut self, path: &Path, from_start: bool) -> bool {
        if self.tails.contains_key(path) { return true; }
        let Some(kind) = kind_of(path) else { return false };
        let tail = if from_start { TailReader::new(path) } else {
            match TailReader::from_end(path) { Ok(t) => t, Err(_) => return false }
        };
        let parser = match kind {
            FileKind::ClaudeTranscript => Parser::Claude(TranscriptParser::new()),
            FileKind::CodexRollout => Parser::Codex(RolloutParser::new()),
        };
        self.tails.insert(path.to_path_buf(), (tail, parser));
        true
    }

    pub fn poll(&mut self, path: &Path) -> Vec<Event> {
        if !self.tails.contains_key(path) && !self.track(path, true) { return vec![]; }
        let (tail, parser) = self.tails.get_mut(path).unwrap();
        let lines = tail.read_lines().unwrap_or_default();
        lines.iter().flat_map(|l| match parser {
            Parser::Claude(p) => p.parse_line(l),
            Parser::Codex(p) => p.parse_line(l),
        }).collect()
    }

    pub fn poll_all(&mut self) -> Vec<Event> {
        let paths: Vec<PathBuf> = self.tails.keys().cloned().collect();
        paths.iter().flat_map(|p| self.poll(p)).collect()
    }
}

pub fn watch(roots: &[PathBuf], tx: Sender<PathBuf>) -> notify::Result<notify::RecommendedWatcher> {
    use notify::{EventKind, RecursiveMode, Watcher};
    let mut w = notify::recommended_watcher(move |res: notify::Result<notify::Event>| {
        if let Ok(ev) = res {
            if matches!(ev.kind, EventKind::Create(_) | EventKind::Modify(_)) {
                for p in ev.paths {
                    if p.extension().and_then(|e| e.to_str()) == Some("jsonl") { let _ = tx.send(p); }
                }
            }
        }
    })?;
    for r in roots {
        if r.exists() { w.watch(r, RecursiveMode::Recursive)?; }
    }
    Ok(w)
}
```

W `rehydrate.rs`, powyżej `mod tests`:

```rust
pub fn recent_files(root: &Path, max_age: Duration) -> Vec<PathBuf> {
    let now = SystemTime::now();
    let mut out: Vec<(SystemTime, PathBuf)> = Vec::new();
    let mut stack = vec![root.to_path_buf()];
    while let Some(dir) = stack.pop() {
        let Ok(rd) = std::fs::read_dir(&dir) else { continue };
        for e in rd.flatten() {
            let p = e.path();
            let Ok(md) = e.metadata() else { continue };
            if md.is_dir() { stack.push(p); continue; }
            if p.extension().and_then(|x| x.to_str()) != Some("jsonl") { continue; }
            if let Ok(m) = md.modified() {
                if now.duration_since(m).map(|a| a <= max_age).unwrap_or(true) { out.push((m, p)); }
            }
        }
    }
    out.sort();
    out.into_iter().map(|(_, p)| p).collect()
}
```

- [ ] **Krok 4: Uruchom testy.** Uruchom `cargo test -p pets-core`. Oczekiwany wynik: wszystkie testy przechodzą.

- [ ] **Krok 5: Commit**

```bash
git add crates/pets-core
git commit -m "feat(core): file sources with incremental parsing, watcher and rehydration"
```

---

### Task 13: Instalacja i odinstalowanie hooków Claude Code

**Pliki:**
- Utwórz: `crates/pets-core/src/hooks_install.rs`
- Zmień: `crates/pets-core/src/lib.rs` (dodaj `pub mod hooks_install;`)

**Interfejsy:**
- Produkuje:
  - `hooks_install::EVENTS: [&str; 9]`;
  - `hooks_install::install(settings: &mut serde_json::Value, hook_exe: &str)`: idempotentne;
  - `hooks_install::uninstall(settings: &mut serde_json::Value)`;
  - `hooks_install::install_file(path: &Path, hook_exe: &str) -> std::io::Result<()>` i `hooks_install::uninstall_file(path: &Path) -> std::io::Result<()>`. Obie przed zapisem robią kopię `settings.json.agent-pets.bak`, a zapisują atomowo.

**Format wpisu** (schemat hooków Claude Code):

```json
{"hooks": {"PreToolUse": [{"matcher": "*", "hooks": [{"type": "command", "command": "\"C:\\...\\hook.exe\" --agent-pets", "timeout": 2}]}]}}
```

- `matcher: "*"` dostają tylko `PreToolUse` i `PostToolUse`.
- Wpisy widżetu rozpoznaje się po tym, że `command` kończy się na ` --agent-pets`.
- Odinstalowanie usuwa tylko te wpisy, a potem puste grupy i puste tablice zdarzeń. Inne hooki użytkownika zostają nietknięte.

- [ ] **Krok 1: Napisz testy, które na razie nie przejdą.** `crates/pets-core/src/hooks_install.rs`:

```rust
use serde_json::{json, Value};
use std::path::Path;

#[cfg(test)]
mod tests {
    use super::*;

    fn ours(v: &Value, ev: &str) -> usize {
        v["hooks"][ev].as_array().map(|groups| groups.iter()
            .flat_map(|g| g["hooks"].as_array().cloned().unwrap_or_default())
            .filter(|h| h["command"].as_str().unwrap_or("").ends_with(MARK)).count()).unwrap_or(0)
    }

    #[test]
    fn install_into_empty_settings() {
        let mut v = json!({});
        install(&mut v, r"C:\a\hook.exe");
        for ev in EVENTS { assert_eq!(ours(&v, ev), 1, "{ev}"); }
        assert_eq!(v["hooks"]["PreToolUse"][0]["matcher"], "*");
        assert!(v["hooks"]["Stop"][0].get("matcher").is_none());
        assert_eq!(v["hooks"]["Stop"][0]["hooks"][0]["command"], "\"C:\\a\\hook.exe\" --agent-pets");
    }

    #[test]
    fn install_is_idempotent_and_keeps_user_hooks() {
        let mut v = json!({"model": "opus", "hooks": {"Stop": [{"hooks": [{"type": "command", "command": "notify.exe"}]}]}});
        install(&mut v, "h.exe");
        install(&mut v, "h.exe");
        assert_eq!(ours(&v, "Stop"), 1);
        assert_eq!(v["model"], "opus");
        let all: Vec<String> = v["hooks"]["Stop"].as_array().unwrap().iter()
            .flat_map(|g| g["hooks"].as_array().unwrap().iter().map(|h| h["command"].as_str().unwrap().to_string())).collect();
        assert!(all.contains(&"notify.exe".to_string()));
    }

    #[test]
    fn uninstall_removes_only_ours_and_empty_containers() {
        let mut v = json!({"hooks": {"Stop": [{"hooks": [{"type": "command", "command": "notify.exe"}]}]}});
        install(&mut v, "h.exe");
        uninstall(&mut v);
        assert_eq!(v, json!({"hooks": {"Stop": [{"hooks": [{"type": "command", "command": "notify.exe"}]}]}}));
        let mut e = json!({});
        install(&mut e, "h.exe");
        uninstall(&mut e);
        assert_eq!(e, json!({}));
    }

    #[test]
    fn file_roundtrip_makes_backup() {
        let dir = tempfile::tempdir().unwrap();
        let p = dir.path().join("settings.json");
        std::fs::write(&p, r#"{"model":"opus"}"#).unwrap();
        install_file(&p, "h.exe").unwrap();
        assert!(dir.path().join("settings.json.agent-pets.bak").exists());
        let v: Value = serde_json::from_str(&std::fs::read_to_string(&p).unwrap()).unwrap();
        assert_eq!(ours(&v, "PreToolUse"), 1);
        uninstall_file(&p).unwrap();
        let v: Value = serde_json::from_str(&std::fs::read_to_string(&p).unwrap()).unwrap();
        assert_eq!(v, json!({"model": "opus"}));
        let missing = dir.path().join("none.json");
        install_file(&missing, "h.exe").unwrap();
        assert!(missing.exists());
    }
}
```

W `lib.rs` dodaj `pub mod hooks_install;`.

- [ ] **Krok 2: Uruchom testy i sprawdź, że nie przechodzą.** Uruchom `cargo test -p pets-core hooks_install`. Oczekiwany wynik: błędy kompilacji.

- [ ] **Krok 3: Napisz implementację.** Powyżej `mod tests`:

```rust
pub const EVENTS: [&str; 9] = ["SessionStart", "UserPromptSubmit", "PreToolUse", "PostToolUse", "Notification",
                              "Stop", "SubagentStop", "PreCompact", "SessionEnd"];
const MARK: &str = " --agent-pets";

fn is_ours(h: &Value) -> bool { h["command"].as_str().map(|c| c.ends_with(MARK)).unwrap_or(false) }

pub fn uninstall(settings: &mut Value) {
    let Some(hooks) = settings.get_mut("hooks").and_then(|h| h.as_object_mut()) else { return };
    for groups in hooks.values_mut() {
        if let Some(arr) = groups.as_array_mut() {
            for g in arr.iter_mut() {
                if let Some(inner) = g.get_mut("hooks").and_then(|h| h.as_array_mut()) { inner.retain(|h| !is_ours(h)); }
            }
            arr.retain(|g| g.get("hooks").and_then(|h| h.as_array()).map(|a| !a.is_empty()).unwrap_or(true));
        }
    }
    hooks.retain(|_, g| g.as_array().map(|a| !a.is_empty()).unwrap_or(true));
    if hooks.is_empty() { settings.as_object_mut().unwrap().remove("hooks"); }
}

pub fn install(settings: &mut Value, hook_exe: &str) {
    uninstall(settings);
    if !settings.is_object() { *settings = json!({}); }
    let obj = settings.as_object_mut().unwrap();
    let hooks = obj.entry("hooks").or_insert_with(|| json!({}));
    for ev in EVENTS {
        let entry = json!({"type": "command", "command": format!("\"{hook_exe}\"{MARK}"), "timeout": 2});
        let group = if ev == "PreToolUse" || ev == "PostToolUse" {
            json!({"matcher": "*", "hooks": [entry]})
        } else {
            json!({"hooks": [entry]})
        };
        let arr = hooks.as_object_mut().unwrap().entry(ev).or_insert_with(|| json!([]));
        arr.as_array_mut().unwrap().push(group);
    }
}

fn edit_file(path: &Path, f: impl FnOnce(&mut Value)) -> std::io::Result<()> {
    let mut v: Value = match std::fs::read_to_string(path) {
        Ok(s) => {
            std::fs::write(path.with_file_name(format!(
                "{}.agent-pets.bak", path.file_name().unwrap().to_string_lossy())), &s)?;
            serde_json::from_str(&s).map_err(|e| std::io::Error::new(std::io::ErrorKind::InvalidData, e))?
        }
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => json!({}),
        Err(e) => return Err(e),
    };
    f(&mut v);
    if let Some(dir) = path.parent() { std::fs::create_dir_all(dir)?; }
    let tmp = path.with_extension("json.agent-pets.tmp");
    std::fs::write(&tmp, serde_json::to_string_pretty(&v)?)?;
    std::fs::rename(&tmp, path)
}

pub fn install_file(path: &Path, hook_exe: &str) -> std::io::Result<()> { edit_file(path, |v| install(v, hook_exe)) }
pub fn uninstall_file(path: &Path) -> std::io::Result<()> { edit_file(path, uninstall) }
```

Zepsuty `settings.json` kończy się błędem `InvalidData` i plik nie jest zmieniany. To celowe: niczego nie nadpisujemy w ciemno.

- [ ] **Krok 4: Uruchom testy.** Uruchom `cargo test -p pets-core`. Oczekiwany wynik: wszystkie testy przechodzą.

- [ ] **Krok 5: Commit**

```bash
git add crates/pets-core
git commit -m "feat(core): reversible Claude Code hooks installer"
```

---

### Task 14: `pets-cli` (run, replay, instalacja hooków)

**Pliki:**
- Utwórz: `crates/pets-cli/Cargo.toml`, `crates/pets-cli/src/main.rs`, `crates/pets-cli/src/render.rs`
- Zmień: `Cargo.toml` (members: dopisz `"crates/pets-cli"`)

**Interfejsy:**
- Korzysta z: wszystkiego z `pets-core` (taski 4–13)
- Produkuje:
  - `render::render(store: &Store, now: i64) -> String`;
  - komendy:

    | Komenda | Działanie |
    |---|---|
    | `pets-cli run [--record <plik.jsonl>]` | Zapisuje `endpoint.json`, odtwarza stan z plików z ostatnich 30 min, obserwuje `~/.claude/projects` i `~/.codex/sessions`, przyjmuje hooki, co 250 ms wykonuje `tick` i odświeża tabelę. `--record` dopisuje każde znormalizowane `Event` jako linię JSON. |
    | `pets-cli replay <plik.jsonl> [--speed N]` | Odtwarza nagrane zdarzenia; zegarem jest `ts` zdarzeń; domyślna prędkość to 10×. |
    | `pets-cli install-hooks [<ścieżka hook.exe>]` / `pets-cli uninstall-hooks` | Domyślnie `hook.exe` z katalogu `pets-cli.exe`. Plik docelowy to `~/.claude/settings.json`. |

- [ ] **Krok 1: Utwórz crate z testem rendera, który na razie nie przejdzie.** `crates/pets-cli/Cargo.toml`:

```toml
[package]
name = "pets-cli"
edition.workspace = true
version.workspace = true

[dependencies]
pets-core = { path = "../pets-core" }
serde.workspace = true
serde_json.workspace = true
anyhow.workspace = true
dirs = "5"
```

`crates/pets-cli/src/render.rs`:

```rust
use pets_core::model::*;
use pets_core::store::Store;
use serde::Serialize;

#[cfg(test)]
mod tests {
    use super::*;
    use pets_core::store::Timing;

    #[test]
    fn renders_sessions_and_limits() {
        let mut s = Store::new(Timing::default());
        let mut e = Event::new(Source::Claude, "s1", Kind::ToolStart, 0);
        e.tool = Some(Tool::Bash);
        e.data.title = Some("Widżet w pasku".into());
        e.data.progress = Some(Progress { done: 2, total: 5 });
        e.data.context = Some(Context { used: 50_000, max: 200_000 });
        s.apply(&e);
        let mut l = Event::new(Source::Codex, "c", Kind::Limits, 0);
        l.data.limits = vec![Limit { agent: Agent::Codex, window: Window::FiveHour, used_pct: 42.0, resets_at: Some(3_600_000) }];
        s.apply(&l);
        let out = render(&s, 10_000);
        assert!(out.contains("Widżet w pasku"));
        assert!(out.contains("working:bash"));
        assert!(out.contains("2/5"));
        assert!(out.contains("25%"));
        assert!(out.contains("codex 5h: 42%"));
    }
}
```

`crates/pets-cli/src/main.rs` (na razie tylko to, żeby test się kompilował):

```rust
mod render;
fn main() {}
```

W głównym `Cargo.toml` dopisz `"crates/pets-cli"` do `members`. Uruchom `cargo test -p pets-cli`. Oczekiwany wynik: błąd kompilacji (brak `render`).

- [ ] **Krok 2: Napisz `render`.** W `render.rs`, powyżej `mod tests`:

```rust
fn name<T: Serialize>(v: T) -> String {
    serde_json::to_value(v).ok().and_then(|v| v.as_str().map(String::from)).unwrap_or_default()
}

fn cut(s: &str, n: usize) -> String {
    if s.chars().count() <= n { s.to_string() } else { format!("{}…", s.chars().take(n - 1).collect::<String>()) }
}

pub fn render(store: &Store, now: i64) -> String {
    let mut out = String::from("Agent Pets · rdzeń danych (Ctrl+C kończy)\n\n");
    out += &format!("{:<7} {:<8} {:<16} {:>7} {:>8} {:>7}  {}\n", "agent", "źródło", "stan", "postęp", "kontekst", "cisza", "tytuł");
    for x in store.sessions() {
        let state = match x.tool { Some(t) => format!("{}:{}", name(x.state), name(t)), None => name(x.state) };
        let progress = x.progress.map(|p| format!("{}/{}", p.done, p.total)).unwrap_or_else(|| "-".into());
        let ctx = x.context.map(|c| format!("{}%", c.used * 100 / c.max.max(1))).unwrap_or_else(|| "-".into());
        let quiet = format!("{}s", (now - x.last_activity).max(0) / 1000);
        let title = if x.title.is_empty() { cut(&x.cwd, 50) } else { cut(&x.title, 50) };
        out += &format!("{:<7} {:<8} {:<16} {:>7} {:>8} {:>7}  {}\n",
            name(x.agent), name(x.origin), state, progress, ctx, quiet, title);
    }
    out += "\nLimity:\n";
    for l in store.limits() {
        let w = match l.window { Window::FiveHour => "5h", Window::Weekly => "tydzień" };
        let reset = l.resets_at.map(|r| format!(" (reset za {} min)", ((r - now) / 60_000).max(0))).unwrap_or_default();
        out += &format!("  {} {}: {:.0}%{}\n", name(l.agent), w, l.used_pct, reset);
    }
    out
}
```

Uruchom `cargo test -p pets-cli`. Oczekiwany wynik: test przechodzi.

- [ ] **Krok 3: Napisz `main.rs`.**

```rust
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
        .filter_map(|l| l.ok()).filter_map(|l| serde_json::from_str(&l).ok()).collect();
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
```

- [ ] **Krok 4: Zbuduj i uruchom testy.** Uruchom `cargo build --workspace` i `cargo test --workspace`. Oczekiwany wynik: kompilacja bez ostrzeżeń o błędach, wszystkie testy przechodzą.

- [ ] **Krok 5: Sprawdź `replay` na sztucznym nagraniu.** Utwórz `crates/pets-cli/tests/data/sample.jsonl`:

```json
{"source":"claude","session_id":"s1","kind":"session_start","tool":null,"ts":0,"data":{"title":"Demo","cwd":"C:\\demo","origin":"cli","progress":null,"context":null,"limits":[],"pid":null,"app":"terminal"}}
{"source":"claude","session_id":"s1","kind":"prompt","tool":null,"ts":1000,"data":{"title":null,"cwd":null,"origin":null,"progress":null,"context":null,"limits":[],"pid":null,"app":null}}
{"source":"claude","session_id":"s1","kind":"tool_start","tool":"edit","ts":2500,"data":{"title":null,"cwd":null,"origin":null,"progress":{"done":1,"total":3},"context":null,"limits":[],"pid":null,"app":null}}
{"source":"claude","session_id":"s1","kind":"turn_end","tool":null,"ts":6000,"data":{"title":null,"cwd":null,"origin":null,"progress":null,"context":null,"limits":[],"pid":null,"app":null}}
```

Uruchom `cargo run -p pets-cli -- replay crates/pets-cli/tests/data/sample.jsonl --speed 4`. Oczekiwany wynik: w ok. 1,5 s tabela przechodzi przez stany `thinking` → `working:edit` (postęp `1/3`) → `done`, z tytułem „Demo”.

- [ ] **Krok 6: Commit**

```bash
git add Cargo.toml crates/pets-cli
git commit -m "feat(cli): pets-cli with live run, replay and hook installation"
```

---

### Task 15: Weryfikacja end-to-end na żywych agentach

**Pliki:**
- Utwórz: `docs/phase1-verification.md`, `README.md`
- Utwórz: `crates/pets-cli/tests/data/live-session.jsonl` (nagranie do pracy nad UI w fazie 2)

- [ ] **Krok 1: Zbuduj wersję release i zainstaluj hooki.**

```bash
cargo build --release --workspace
target/release/pets-cli.exe install-hooks
```

Oczekiwany wynik: komunikat „Zainstalowano hooki…”. W `~/.claude/settings.json` jest 9 wpisów z ` --agent-pets`, a obok leży `settings.json.agent-pets.bak`.

- [ ] **Krok 2: Uruchom rdzeń z nagrywaniem.** W osobnym terminalu:

```bash
target/release/pets-cli.exe run --record crates/pets-cli/tests/data/live-session.jsonl
```

- [ ] **Krok 3: Przejdź checklistę i zapisz wynik każdego punktu (tak/nie + uwagi) w `docs/phase1-verification.md`:**
  1. Nowa sesja `claude` w terminalu pojawia się w tabeli jako `claude cli`. Po promptcie ma stan `thinking`, przy narzędziach `working:<narzędzie>`, po odpowiedzi `done`.
  2. Sesja w aplikacji Claude desktop ma źródło `desktop`, a tytuł z `ai-title` lub `custom-title`.
  3. Pytanie o zgodę albo `AskUserQuestion` w Claude daje `needs_you`.
  4. Kontekst Claude'a (%) rośnie wraz z rozmową.
  5. Sesja Codex Desktop pojawia się jako `codex desktop`, ze stanami `working:edit`, `working:bash` i `working:web` przy odpowiednich narzędziach.
  6. Limity Codexa (5h i tydzień) pokazują procent i czas do resetu zgodne z `codex_get_limits()` routera.
  7. Zadanie delegowane przez Agent Router pojawia się jako `codex router`. Jego subagenci (`review`) nie tworzą osobnych wierszy.
  8. Zamknięcie terminala z `claude` daje `ended`, a wiersz znika po ok. 1,5 s.
  9. Po restarcie `pets-cli run` sesje z ostatnich 30 minut wracają z tytułami.
  10. Po zamknięciu `pets-cli` Claude Code działa bez opóźnień i bez komunikatów o błędach hooków.
  11. `replay` nagrania z kroku 2 odtwarza te same przejścia.

- [ ] **Krok 4: Napraw rozbieżności.** Każdy punkt „nie” to osobny błąd do naprawy według superpowers:systematic-debugging: najpierw test, który go odtwarza (w parserze albo w `store`), potem poprawka. Checklistę powtarzaj, aż wszystkie punkty będą „tak” albo świadomie odłożone z uzasadnieniem w dokumencie.

- [ ] **Krok 5: Zdecyduj o hookach.** Zostaw je zainstalowane na czas fazy 2 albo usuń: `target/release/pets-cli.exe uninstall-hooks`. Zapisz decyzję w `docs/phase1-verification.md`.

- [ ] **Krok 6: Napisz krótki `README.md`.**

```markdown
# Agent Pets

Zwierzaki w pasku zadań Windows 11 pokazujące stan agentów kodujących (Claude Code, Codex, Agent Router).

- Specyfikacja: `docs/superpowers/specs/2026-09-24-agent-pets-design.md`
- Prototyp wizualny: `prototype/index.html` (test: `node prototype/smoke-test.js`)

## Rdzeń danych (faza 1)

    cargo build --release --workspace
    target/release/pets-cli.exe install-hooks     # hooki Claude Code (kopia settings.json obok)
    target/release/pets-cli.exe run               # tabela sesji na żywo
    target/release/pets-cli.exe replay plik.jsonl --speed 10
    target/release/pets-cli.exe uninstall-hooks

Testy: `cargo test --workspace`.
```

- [ ] **Krok 7: Commit**

```bash
git add README.md docs/phase1-verification.md crates/pets-cli/tests/data/live-session.jsonl
git commit -m "docs: phase 1 end-to-end verification and README"
```

Przed commitem przejrzyj `live-session.jsonl`. Nagrywane są tylko znormalizowane zdarzenia (tytuły, `cwd`, liczniki), bez treści rozmów. Jeśli któryś tytuł lub `cwd` jest prywatny, zanonimizuj go ręcznie.

---

## Po tym planie

Następny plan (faza 2: scena i maskotki w Tauri) powstaje po wykonaniu tego planu i korzysta z:
- wyników spike'ów S1 i S2 (osadzenie czy pływające okno, budżet klatek);
- `pets-core` jako biblioteki w `src-tauri`;
- nagrania `live-session.jsonl` do pracy nad UI przez `replay`.

Limity Claude'a: jeśli spike S3 potwierdzi, że statusline dostaje limity 5h i tygodniowe, przelotka statusline (sekcja 6.1 specyfikacji) trafia do planu fazy 3 razem z panelem limitów. Jeśli nie, pasek limitów Claude'a zostaje ukryty w v1.
