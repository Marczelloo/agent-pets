# Agent Pets: faza 3 (panel, limity Claude'a, „Przejdź”, powiadomienia). Plan implementacji

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Cel:** kliknięcie zwierzaka albo ikony w trayu otwiera panel nad paskiem. Panel pokazuje wszystkie sesje, ich stan i limity, a przycisk „Przejdź” zabiera do okna sesji. Windows powiadamia, gdy agent czeka na Ciebie, skończył długą turę albo zbliża się do limitu. Pasek limitów Claude'a dostaje dane z przelotki statusline.

**Architektura:**
- **Rdzeń (`pets-core`):**
  - nowy parser JSON-a statusline (`claude::statusline`) i trasa ingest `POST /v1/events/claude-statusline`;
  - `hook.exe` dostaje tryb `--agent-pets-statusline`: przekazuje dane do widżetu i uruchamia dotychczasowy statusline użytkownika bez zmiany jego wyniku.
- **Aplikacja (Rust):**
  - moduł `jump`: czysty planista kroków (deep link → fokus okna → nowy terminal → schowek) i wykonawca Win32;
  - moduł `notify`: czyste reguły powiadomień i dostarczanie toastów przez WinRT z przyciskiem „Przejdź”;
  - okno panelu z przełączaniem i chowaniem po utracie fokusu.
- **UI:** panel w React + TypeScript (tu wchodzi React, zgodnie ze specyfikacją). Zwierzaki w panelu rysuje ten sam renderer w większej skali.

**Stos:** jak w fazie 2 oraz `react`, `react-dom`, `@vitejs/plugin-react`, crate `tauri-winrt-notification` 0.8.

**Specyfikacja:** `docs/superpowers/specs/2026-09-24-agent-pets-design.md`, sekcje 2.3, 2.4, 6.1 (limity), 8, 13 („Panel”). Wyniki spike'ów: `docs/spikes/S3-S4-claude-limits-jump.md`.

## Ustalenia sprzed planu (zbadane 2026-09-24 na tej maszynie)

- **Deep link do sesji Claude desktop.** Aplikacja Claude 2.7032 obsługuje `claude://code/continue?session=<id>`, gdzie `<id>` pasuje do `^local_[A-Za-z0-9-]{1,64}$` (kod obsługi linków w `app.asar`).
  - Taki identyfikator ma pole `hostSessionId` w rejestrze `~/.claude/sessions/<pid>.json` dla sesji z `entrypoint == "claude-desktop"`, np. `local_f1d1d64e-…`.
  - Link przełącza aplikację na tę sesję.
  - Kod ma bramkę funkcji (`Gwn()`), więc na innych kontach link może być wyłączony. Wtedy łańcuch idzie dalej.
- **Deep link do wątku Codexa:** `codex://threads/<id>`. Id wątku to `session_meta.id` z rolloutu, czyli nasze `Session.id` dla sesji Codexa.
- **Statusline:** u użytkownika `statusLine` w `~/.claude/settings.json` nie jest ustawiony. Przelotka nie ma więc czego wywoływać, ale musi to obsługiwać, żeby działała też u innych.
- **Powiadomienia:** `tauri-winrt-notification` 0.8.1 ma `Toast::new(app_id)`, `add_button(content, action)`, `on_activated(Fn(Option<String>))` i `show()`.
  - Aplikacja nie jest zainstalowana, więc AUMID rejestrujemy w `HKCU\Software\Classes\AppUserModelId\dev.agentpets.app` (`DisplayName`, `IconUri`).
  - Plan awaryjny, jeśli Windows mimo to nie pokaże toastu: `Toast::POWERSHELL_APP_ID` (toast podpisany „Windows PowerShell”).
- **Lekcje z fazy 2** (obowiązują w tej fazie):
  - okno pokazane przez Win32 chowamy przez Win32, a pokazane przez Tauri chowamy przez Tauri; panel używa wyłącznie API Tauri;
  - pliki współdzielone z hookami leżą w `~/.agent-pets/` (nie w `AppData`, które Windows wirtualizuje dla pakietów MSIX);
  - `git checkout` gałęzi bez `app/` podczas działającego `pnpm tauri dev` psuje serwer Vite, więc scalamy przez fast-forward bez przełączania na starą gałąź albo przy zamkniętej aplikacji.

## Global Constraints

- Wszystko z fazy 2 nadal obowiązuje (Windows 11, `127.0.0.1`, `textContent` dla tytułów, 30 kl./s, < 2% CPU, stopka commita, kolory).
- **Panel:**
  - otwiera go kliknięcie sceny (zwierzaka, „+N”, limitów) albo lewy klik ikony w trayu;
  - chowa się po utracie fokusu i po udanym „Przejdź”;
  - lista zawiera wszystkie sesje, także zwinięte w „+N”;
  - limity: procent zużycia i godzina resetu dla okien 5h i tygodniowego, osobno Claude i Codex; brak danych to „brak danych”, nigdy 0%.
- **„Przejdź”:** kroki po kolei aż do skutku:
  1. deep link;
  2. fokus okna, w którym działa sesja;
  3. nowy terminal z `claude --resume <id>` albo `codex resume <id>` w `cwd` sesji;
  4. gdy wszystko zawiedzie: komenda wznowienia trafia do schowka, a panel to mówi.
- **Bezpieczeństwo „Przejdź”:** id sesji trafia do URL-a i do argumentów procesu tylko po walidacji `^[A-Za-z0-9_-]{1,128}$`. `cwd` przekazujemy jako osobny argument procesu, nigdy przez powłokę.
- **Powiadomienia (spec 2.4):**

  | Warunek | Kiedy wysłać |
  |---|---|
  | `needs_you` | trwa > 15 s, a okno sesji nie ma fokusu; raz na epizod |
  | `done` | tura trwała > 2 min; raz na turę |
  | limit | > 90%; raz na okno limitu, do jego resetu |

  - Stanów zastanych przy starcie aplikacji nie zgłaszamy.
  - Każdy rodzaj da się wyłączyć; w fazie 3 przez stałe w `notify::Settings` (ustawienia w UI to faza 5).
- **Statusline:**
  - przelotka nie może zmienić tego, co użytkownik widzi w statusline: wyjście oryginalnej komendy przechodzi bajt w bajt;
  - wysyłka do widżetu ma limit 150 ms na połączenie i 300 ms całości;
  - instalacja przelotki zmienia `~/.claude/settings.json` (z kopią), więc przed wykonaniem na maszynie użytkownika trzeba zapytać o zgodę.
- **Delegacja do Codexa:** kandydatami są taski 1 (parser statusline) i 4 (reguły powiadomień), bo są czyste i z testami. Review po Codeksie obowiązkowy.
- **Weryfikacja przed commitem:** `cargo test --workspace`, `pnpm --dir app test`, `pnpm --dir app typecheck`, z jawnie sprawdzanym kodem wyjścia.

## Review Focus

1. **Sesja bez danych do przejścia** (brak PID, brak `hostSessionId`, `cwd` nieistniejący albo pusty). Oczekiwane: kolejny krok łańcucha, a na końcu komenda w schowku; nigdy nic się nie dzieje po cichu. Test: task 3, planista.
2. **Id sesji z niebezpiecznymi znakami** (`&`, `"`, spacja, `..`). Oczekiwane: bez deep linku i bez terminala, tylko schowek z komunikatem. Test: task 3.
3. **Dużo zdarzeń naraz przy starcie** (odtworzone sesje w `done` i `needs_you`, limit już > 90%). Oczekiwane: zero toastów przy starcie. Test: task 4.
4. **Statusline z uszkodzonym albo niepełnym JSON-em** (brak `rate_limits`, `used_percentage: null`). Oczekiwane: żadnych fałszywych 0%, a statusline użytkownika działa dalej. Testy: task 1 i task 2.
5. **Szybkie klikanie ikony w trayu i sceny przy otwartym panelu** (utrata fokusu chowa panel tuż przed kliknięciem). Oczekiwane: klik przy otwartym panelu go zamyka, a nie zamyka i od razu otwiera. Test: task 5, `PanelToggle`.

---

## Struktura plików

```
crates/pets-core/src/claude/statusline.rs   NOWY: JSON statusline → zdarzenia (limity, kontekst, tytuł)
crates/pets-core/src/claude/mod.rs          + pub mod statusline; StatuslineEnvelope
crates/pets-core/src/ingest.rs              + trasa /v1/events/claude-statusline, Incoming::ClaudeStatusline
crates/pets-core/src/runtime.rs             + obsługa Incoming::ClaudeStatusline
crates/pets-core/src/statusline_install.rs  NOWY: instalacja/odinstalowanie przelotki w settings.json
crates/pets-core/src/lib.rs                 + pub mod statusline_install
crates/pets-core/tests/fixtures/claude/statusline.json   NOWY: próbka (klucze z raportu S3, wartości syntetyczne)
crates/pets-hook/src/main.rs                + tryb --agent-pets-statusline
crates/pets-cli/src/main.rs                 + install-statusline / uninstall-statusline
app/src-tauri/src/jump/mod.rs               NOWY: plan(Target) → Vec<Step> (czyste), JumpResult
app/src-tauri/src/jump/exec.rs              NOWY: wykonanie kroków (ShellExecute, fokus okna, wt, schowek)
app/src-tauri/src/jump/registry.rs          NOWY: dane sesji z ~/.claude/sessions (hostSessionId, pid, entrypoint)
app/src-tauri/src/notify/rules.rs           NOWY: czyste reguły powiadomień
app/src-tauri/src/notify/mod.rs             NOWY: wątek powiadomień, AUMID, toasty
app/src-tauri/src/panel.rs                  NOWY: okno panelu, PanelToggle, komendy panel_*, jump
app/src-tauri/src/core.rs                   + kanał migawek do powiadomień
app/src-tauri/src/tray.rs                   + lewy klik → panel
app/src-tauri/src/lib.rs                    + moduły, komendy, zarządzany stan
app/src-tauri/capabilities/default.json     + okno "panel"
app/panel.html                              NOWY: wejście panelu
app/src/panel/main.tsx                      NOWY: montowanie React
app/src/panel/App.tsx                       NOWY: panel (limity, lista sesji, status „Przejdź”)
app/src/panel/model.ts                      NOWY: czysty model widoku (kolejność, etykiety, limity)
app/src/panel/model.test.ts                 NOWY
app/src/panel/PetCanvas.tsx                 NOWY: zwierzak w dużej skali
app/src/panel/App.test.tsx                  NOWY: render do stringa (bez DOM)
app/src/stage/stage.ts                      + klik → panel_open
app/vite.config.ts, package.json, tsconfig.json   + React
docs/phase3-verification.md                 NOWY: ręczna checklista
README.md                                   + panel, „Przejdź”, powiadomienia, przelotka statusline
```

---

### Task 1: Parser statusline i trasa ingest

**Files:**
- Create: `crates/pets-core/src/claude/statusline.rs`, `crates/pets-core/tests/fixtures/claude/statusline.json`
- Modify: `crates/pets-core/src/claude/mod.rs`, `ingest.rs`, `runtime.rs`

**Interfaces:**
- Produces:
  - `claude::StatuslineEnvelope { ts: i64, payload: serde_json::Value }` (Serialize/Deserialize);
  - `claude::statusline::to_events(env: &StatuslineEnvelope) -> Vec<Event>`;
  - `ingest::Incoming::ClaudeStatusline(StatuslineEnvelope)`;
  - trasa `POST /v1/events/claude-statusline`.

- [ ] **Step 1: Próbka `tests/fixtures/claude/statusline.json`** (klucze z raportu S3, wartości syntetyczne)

```json
{
  "session_id": "3746a003-5ba1-42b3-a085-009646ebcf00",
  "transcript_path": "C:\\work\\project\\t.jsonl",
  "cwd": "C:\\work\\project",
  "session_name": "Widżet w pasku",
  "model": { "id": "claude-opus-5-5", "display_name": "Opus 5.5" },
  "workspace": { "current_dir": "C:\\work\\project", "project_dir": "C:\\work\\project" },
  "version": "2.1.270",
  "cost": { "total_cost_usd": 0.5, "total_duration_ms": 1000 },
  "context_window": {
    "total_input_tokens": 1000, "total_output_tokens": 500, "context_window_size": 1000000,
    "current_usage": { "input_tokens": 1, "output_tokens": 2, "cache_creation_input_tokens": 3, "cache_read_input_tokens": 4 },
    "used_percentage": 12.5, "remaining_percentage": 87.5
  },
  "rate_limits": {
    "five_hour": { "used_percentage": 34.0, "resets_at": 1790290000 },
    "seven_day": { "used_percentage": 61.5, "resets_at": 1790700000 }
  }
}
```

- [ ] **Step 2: Testy** (na końcu nowego `statusline.rs`)

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::{Agent, Context, Kind, Window};
    use serde_json::json;

    fn fixture() -> serde_json::Value {
        serde_json::from_str(include_str!("../../tests/fixtures/claude/statusline.json")).unwrap()
    }

    #[test]
    fn limits_context_and_title() {
        let ev = to_events(&StatuslineEnvelope { ts: 5_000, payload: fixture() });
        let limits = ev.iter().find(|e| e.kind == Kind::Limits).unwrap();
        assert_eq!(limits.data.limits.len(), 2);
        let five = limits.data.limits.iter().find(|l| l.window == Window::FiveHour).unwrap();
        assert_eq!((five.agent, five.used_pct, five.resets_at), (Agent::Claude, 34.0, Some(1_790_290_000_000)));
        let meta = ev.iter().find(|e| e.kind == Kind::Meta).unwrap();
        assert_eq!(meta.session_id, "3746a003-5ba1-42b3-a085-009646ebcf00");
        assert_eq!(meta.data.context, Some(Context { used: 125_000, max: 1_000_000 }));
        assert_eq!(meta.data.title.as_deref(), Some("Widżet w pasku"));
        assert_eq!(meta.ts, 5_000);
    }

    #[test]
    fn missing_or_null_values_produce_nothing_instead_of_zeroes() {
        let ev = to_events(&StatuslineEnvelope { ts: 1, payload: json!({
            "session_id": "s", "rate_limits": { "five_hour": { "used_percentage": null } },
            "context_window": { "used_percentage": null, "context_window_size": 200000 } }) });
        assert!(ev.iter().all(|e| e.kind != Kind::Limits), "limit bez procentu to brak danych");
        assert!(ev.iter().all(|e| e.data.context.is_none()));
    }

    #[test]
    fn garbage_is_ignored() {
        assert!(to_events(&StatuslineEnvelope { ts: 1, payload: json!("x") }).is_empty());
        assert!(to_events(&StatuslineEnvelope { ts: 1, payload: json!({}) }).is_empty());
    }
}
```

- [ ] **Step 3: Test trasy ingest** (dopisz w `ingest.rs` do modułu `tests`)

```rust
    #[test]
    fn accepts_statusline_on_its_own_route() {
        let (tx, rx) = channel();
        let ing = Ingest::start("secret".into(), tx).unwrap();
        let port = ing.endpoint().port;
        let body = r#"{"ts":1,"payload":{"session_id":"s"}}"#;
        assert_eq!(post(port, "/v1/events/claude-statusline", "secret", body), 204);
        match rx.recv_timeout(Duration::from_secs(2)).unwrap() {
            Incoming::ClaudeStatusline(s) => assert_eq!(s.payload["session_id"], "s"),
            _ => panic!("zła trasa"),
        }
        assert_eq!(post(port, "/v1/events/claude-statusline", "wrong", body), 401);
        ing.stop();
    }
```

Istniejący test `accepts_valid_hook_and_rejects_bad_requests` dopasowuje `Incoming::ClaudeHook(h)` w `match`. Po dodaniu wariantu dopisz ramię `_ => panic!("zła trasa")`.

- [ ] **Step 4: Uruchom i sprawdź, że pada**

Run: `cargo test -p pets-core statusline`
Expected: błąd kompilacji (brak `StatuslineEnvelope`, `to_events`, `Incoming::ClaudeStatusline`).

- [ ] **Step 5: Implementacja**

`claude/mod.rs`: dodaj `pub mod statusline;` oraz:

```rust
/// Dane statusline Claude Code (CLI) przesłane przez `hook.exe --agent-pets-statusline`.
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct StatuslineEnvelope {
    pub ts: i64,
    pub payload: serde_json::Value,
}
```

`claude/statusline.rs` (góra pliku):

```rust
//! JSON statusline Claude Code → limity konta (5h, tydzień), kontekst i tytuł sesji (raport S3).
use super::StatuslineEnvelope;
use crate::model::*;
use serde_json::Value;

fn limit(v: &Value, window: Window) -> Option<Limit> {
    let used = v.get("used_percentage")?.as_f64()?;
    let resets_at = v.get("resets_at").and_then(Value::as_i64).map(|s| s * 1000);
    Some(Limit { agent: Agent::Claude, window, used_pct: used as f32, resets_at })
}

pub fn to_events(env: &StatuslineEnvelope) -> Vec<Event> {
    let p = &env.payload;
    let Some(sid) = p.get("session_id").and_then(Value::as_str) else { return vec![] };
    let mut out = Vec::new();
    let rl = &p["rate_limits"];
    let limits: Vec<Limit> = [(&rl["five_hour"], Window::FiveHour), (&rl["seven_day"], Window::Weekly)]
        .into_iter().filter_map(|(v, w)| limit(v, w)).collect();
    if !limits.is_empty() {
        let mut e = Event::new(Source::Claude, sid, Kind::Limits, env.ts);
        e.data.limits = limits;
        out.push(e);
    }
    let cw = &p["context_window"];
    let context = match (cw["used_percentage"].as_f64(), cw["context_window_size"].as_u64()) {
        (Some(pct), Some(max)) if max > 0 => Some(Context { used: (pct / 100.0 * max as f64).round() as u64, max }),
        _ => None,
    };
    let title = p.get("session_name").and_then(Value::as_str).filter(|s| !s.is_empty()).map(String::from);
    if context.is_some() || title.is_some() {
        let mut e = Event::new(Source::Claude, sid, Kind::Meta, env.ts);
        e.data.context = context;
        e.data.title = title;
        out.push(e);
    }
    out
}
```

`ingest.rs`:
- dodaj `Incoming::ClaudeStatusline(crate::claude::StatuslineEnvelope)`;
- w `handle_request` zamień warunek trasy na rozgałęzienie:
  - `/v1/events/claude` parsuje `HookEnvelope` i wysyła `ClaudeHook`;
  - `/v1/events/claude-statusline` parsuje `StatuslineEnvelope` i wysyła `ClaudeStatusline`;
  - inna ścieżka daje 404.

`runtime.rs`, w `step`, zamiast `while let Ok(Incoming::ClaudeHook(env)) = …`:

```rust
        while let Ok(msg) = self.hooks.try_recv() {
            changed |= match msg {
                Incoming::ClaudeHook(env) => self.on_hook(env),
                Incoming::ClaudeStatusline(s) => claude::statusline::to_events(&s).into_iter().fold(false, |c, e| self.apply(e) | c),
            };
        }
```

- [ ] **Step 6: Testy**

Run: `cargo test --workspace`
Expected: PASS (w tym 3 nowe testy statusline i 1 nowy test ingestu).

- [ ] **Step 7: Commit**

```bash
git add crates/pets-core
git commit -m "feat(core): Claude statusline parser and ingest route (account limits, exact context, session name)"
```

---

### Task 1b: Limity Claude'a z aplikacji desktopowej (dopisane przed wykonaniem)

Użytkownik zapytał, czy da się pobrać limity bez CLI, skoro aplikacja Claude je zna. Ustalenia z `app.asar` (Claude 2.7032):
- Aplikacja co 15 min (co 5 min po otwarciu jej tray) pobiera `claude.ai/api/organizations/<org>/usage` przez własną sesję przeglądarki. Pełna odpowiedź, razem z `resets_at`, żyje tylko w pamięci.
- Na dysk trafia `plan-usage-history.json` w katalogu danych aplikacji: `{"version":2,"samples":[{"t":<ms>,"org":"<uuid>","u":{"fh":<5h %>,"sd":<tydzień %>}}]}`, czyli procenty bez czasu resetu, z historią 30 dni.
- Instalacja MSIX trzyma go w `%LOCALAPPDATA%\Packages\Claude_*\LocalCache\Roaming\Claude\`, zwykła w `%APPDATA%\Claude\`.

Czytamy ten plik lokalnie i tylko do odczytu. Nie ma ruchu sieciowego ani ciasteczek, nie używamy danych logowania. Czasu resetu nie zgadujemy z historii, bo przerwy, gdy aplikacja jest zamknięta, czynią to niewiarygodnym. Dokładny reset daje przelotka statusline (task 2), gdy działa jakaś sesja CLI.

**Files:**
- Create: `crates/pets-core/src/claude/desktop_usage.rs`
- Modify: `crates/pets-core/src/claude/mod.rs`, `store.rs` (reset zachowany przy limicie bez resetu), `runtime.rs` (`RuntimeConfig.claude_usage_files`, odpytywanie co 60 s)

**Interfaces:**
- Produces:
  - `claude::desktop_usage::{FILE, MAX_AGE_MS, candidate_files(local_appdata: &Path, appdata: &Path) -> Vec<PathBuf>, latest(bytes: &[u8], now: i64) -> Option<Event>, Poller}`;
  - `Poller::new(files: Vec<PathBuf>)`, `Poller::poll(&mut self, now: i64) -> Option<Event>` (sprawdza co `POLL_MS = 60_000`, czyta tylko przy zmianie mtime);
  - `RuntimeConfig.claude_usage_files: Vec<PathBuf>` (w `from_env` z `candidate_files`).
- Zdarzenie: `Source::Claude`, `session_id = "claude-desktop-usage"`, `Kind::Limits`, `ts = t` próbki, limity `FiveHour` (`fh`) i `Weekly` (`sd`) z `resets_at: None`.

**Zasady:**
- Nieznana wersja, pusta lista, uszkodzony JSON, brak `fh` i `sd`: `None` (brak danych, nigdy 0%).
- Próbka starsza niż `MAX_AGE_MS = 30 min` (aplikacja zamknięta): `None`.
- Kilka plików (MSIX i zwykła instalacja): wygrywa najnowszy mtime.
- `Store::merge_limits`: limit bez `resets_at` zachowuje dotychczasowy `resets_at`, jeśli ten jest jeszcze w przyszłości względem `ts` zdarzenia (to wciąż to samo okno limitu). Gdy minął, zostaje `None`.

**Testy (TDD):**
- `desktop_usage`: najnowsza próbka z dwóch; mapowanie `fh`/`sd`; próbka nieaktualna → `None`; `version: 1`, śmieci, pusta lista → `None`; próbka tylko z `sd` → jeden limit; `candidate_files` znajduje katalog `Claude_*` w `Packages` i `%APPDATA%\Claude`.
- `Poller`: pierwsze `poll` czyta; drugie przed upływem 60 s nie czyta; po zmianie pliku i 60 s czyta znowu; bez zmiany mtime nie zgłasza ponownie.
- `store`: `resets_at` zachowany dla przyszłego resetu i wyzerowany dla minionego.
- `runtime`: plik w katalogu tymczasowym → po `step(now)` `store().limits()` zawiera Claude 5h z procentem z pliku.

**Commit:** `feat(core): Claude account limits from the desktop app's local usage history`

---

### Task 2: Przelotka statusline w `hook.exe` oraz jej instalacja

**Files:**
- Create: `crates/pets-core/src/statusline_install.rs`
- Modify: `crates/pets-core/src/lib.rs`, `crates/pets-core/src/hooks_install.rs` (udostępnij `edit_file` jako `pub(crate)`), `crates/pets-hook/src/main.rs`, `crates/pets-hook/tests/` (nowy test integracyjny), `crates/pets-cli/src/main.rs`

**Interfaces:**
- Consumes: `Endpoint`, `StatuslineEnvelope`, trasa z tasku 1.
- Produces:
  - `statusline_install::{MARK_ARG, original_path() -> PathBuf, install(settings: &mut Value, hook_exe: &str) -> Option<Value>, uninstall(settings: &mut Value, original: Option<Value>), install_file(settings: &Path, hook_exe: &str) -> io::Result<()>, uninstall_file(settings: &Path) -> io::Result<()>}`;
  - `hook.exe --agent-pets-statusline`;
  - `pets-cli install-statusline [hook.exe]` i `pets-cli uninstall-statusline`.

**Zachowanie:**
- `install` zapamiętuje dotychczasowy `statusLine` (albo `null`) w `~/.agent-pets/statusline-original.json` i ustawia `statusLine = {"type":"command","command":"\"<hook.exe>\" --agent-pets-statusline"}`.
- `install` jest idempotentne: jeśli `statusLine` już jest nasz, nie nadpisuje zapamiętanego oryginału.
- `uninstall` przywraca oryginał; gdy oryginał to `null`, usuwa klucz `statusLine`.
- **Tryb `--agent-pets-statusline` w `hook.exe`:**
  - czyta stdin;
  - wysyła `StatuslineEnvelope` na `/v1/events/claude-statusline` (limity 150/300 ms, błędy ignoruje);
  - jeśli `statusline-original.json` zawiera `{"command": "..."}`, uruchamia `cmd /C <command>` z tym samym stdin i przepisuje jego stdout na własny stdout bajt w bajt;
  - kończy się kodem 0.

- [ ] **Step 1: Testy `statusline_install.rs`**

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn install_remembers_the_original_and_is_idempotent() {
        let mut s = json!({"statusLine": {"type": "command", "command": "my-line.exe"}, "theme": "dark"});
        let orig = install(&mut s, "C:\\h\\hook.exe");
        assert_eq!(orig, Some(json!({"type": "command", "command": "my-line.exe"})));
        assert_eq!(s["statusLine"]["command"], "\"C:\\h\\hook.exe\" --agent-pets-statusline");
        assert_eq!(install(&mut s, "C:\\h\\hook.exe"), None, "drugi raz nie nadpisuje zapamiętanego oryginału");
        assert_eq!(s["theme"], "dark");
    }

    #[test]
    fn install_without_a_previous_statusline_remembers_null() {
        let mut s = json!({});
        assert_eq!(install(&mut s, "h.exe"), Some(Value::Null));
    }

    #[test]
    fn uninstall_restores_or_removes() {
        let mut s = json!({"statusLine": {"type": "command", "command": "\"h.exe\" --agent-pets-statusline"}});
        uninstall(&mut s, Some(json!({"type": "command", "command": "my-line.exe"})));
        assert_eq!(s["statusLine"]["command"], "my-line.exe");
        let mut s2 = json!({"statusLine": {"type": "command", "command": "\"h.exe\" --agent-pets-statusline"}});
        uninstall(&mut s2, Some(Value::Null));
        assert!(s2.get("statusLine").is_none());
    }

    #[test]
    fn uninstall_leaves_a_foreign_statusline_alone() {
        let mut s = json!({"statusLine": {"type": "command", "command": "someone-else.exe"}});
        uninstall(&mut s, Some(Value::Null));
        assert_eq!(s["statusLine"]["command"], "someone-else.exe");
    }
}
```

- [ ] **Step 2: Test integracyjny `crates/pets-hook/tests/statusline.rs`**

Test uruchamia zbudowany `hook.exe` z `AGENT_PETS_ENDPOINT` na pusty katalog tymczasowy (brak widżetu) oraz `AGENT_PETS_STATUSLINE_ORIGINAL` wskazującym plik z komendą `cmd /C more`, która przepisuje stdin. Oczekujemy wyjścia równego wejściu, kodu 0 i czasu < 1,5 s.

```rust
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
```

Do `crates/pets-hook/Cargo.toml` dopisz `[dev-dependencies] tempfile = "3"`. Sprawdź, jak crate nazywa binarkę (`[[bin]] name`): `CARGO_BIN_EXE_<name>` musi pasować (np. `CARGO_BIN_EXE_hook`).

- [ ] **Step 3: Uruchom i sprawdź, że pada**

Run: `cargo test -p pets-core statusline_install` i `cargo test -p pets-hook`
Expected: błąd kompilacji (brak modułu), a test integracyjny pada (hook nie zna trybu).

- [ ] **Step 4: Implementacja `statusline_install.rs`**

```rust
//! Przelotka statusline: `statusLine` w `~/.claude/settings.json` wskazuje `hook.exe --agent-pets-statusline`,
//! a dotychczasowa konfiguracja leży w `~/.agent-pets/statusline-original.json`.
use serde_json::{json, Value};
use std::path::{Path, PathBuf};

pub const MARK_ARG: &str = "--agent-pets-statusline";

pub fn original_path() -> PathBuf {
    std::env::var_os("AGENT_PETS_STATUSLINE_ORIGINAL").map(PathBuf::from).unwrap_or_else(|| {
        dirs::home_dir().unwrap_or_else(std::env::temp_dir).join(".agent-pets").join("statusline-original.json")
    })
}

fn is_ours(v: &Value) -> bool {
    v["command"].as_str().map(|c| c.ends_with(MARK_ARG)).unwrap_or(false)
}

/// Ustawia przelotkę. Zwraca poprzedni `statusLine` (albo `Null`), gdy trzeba go zapamiętać.
pub fn install(settings: &mut Value, hook_exe: &str) -> Option<Value> {
    if !settings.is_object() { *settings = json!({}); }
    let prev = settings.get("statusLine").cloned().unwrap_or(Value::Null);
    let remember = if is_ours(&prev) { None } else { Some(prev) };
    settings["statusLine"] = json!({"type": "command", "command": format!("\"{hook_exe}\" {MARK_ARG}")});
    remember
}

/// Przywraca oryginał, jeśli obecny `statusLine` jest nasz.
pub fn uninstall(settings: &mut Value, original: Option<Value>) {
    if !settings.get("statusLine").map(is_ours).unwrap_or(false) { return; }
    match original {
        Some(v) if !v.is_null() => { settings["statusLine"] = v; }
        _ => { settings.as_object_mut().map(|o| o.remove("statusLine")); }
    }
}

pub fn install_file(settings: &Path, hook_exe: &str) -> std::io::Result<()> {
    let mut remembered = None;
    crate::hooks_install::edit_file(settings, |v| remembered = install(v, hook_exe))?;
    if let Some(orig) = remembered {
        let p = original_path();
        if let Some(d) = p.parent() { std::fs::create_dir_all(d)?; }
        std::fs::write(p, serde_json::to_vec_pretty(&orig)?)?;
    }
    Ok(())
}

pub fn uninstall_file(settings: &Path) -> std::io::Result<()> {
    let original = std::fs::read(original_path()).ok().and_then(|b| serde_json::from_slice(&b).ok());
    crate::hooks_install::edit_file(settings, |v| uninstall(v, original))
}
```

W `hooks_install.rs` zmień `fn edit_file` na `pub(crate) fn edit_file`. W `lib.rs` dodaj `pub mod statusline_install;`.

- [ ] **Step 5: Tryb w `hook.exe`** (`crates/pets-hook/src/main.rs`)

```rust
fn post(path_suffix: &str, body: serde_json::Value) -> Option<()> {
    let path = std::env::var_os("AGENT_PETS_ENDPOINT").map(PathBuf::from).unwrap_or_else(Endpoint::default_path);
    let ep = Endpoint::read(&path).ok()?;
    let agent = ureq::AgentBuilder::new()
        .timeout_connect(Duration::from_millis(150))
        .timeout(Duration::from_millis(300))
        .build();
    agent.post(&format!("http://127.0.0.1:{}{path_suffix}", ep.port))
        .set("Authorization", &format!("Bearer {}", ep.token))
        .send_json(body).ok()?;
    Some(())
}

/// Przelotka statusline: dane do widżetu, a użytkownik widzi dokładnie wyjście swojego statusline.
fn statusline() {
    let mut buf = Vec::new();
    let _ = std::io::stdin().take(1 << 20).read_to_end(&mut buf);
    if let Ok(payload) = serde_json::from_slice::<serde_json::Value>(&buf) {
        let env = StatuslineEnvelope { ts: time::now_ms(), payload };
        if let Ok(body) = serde_json::to_value(&env) { let _ = post("/v1/events/claude-statusline", body); }
    }
    let original: Option<serde_json::Value> = std::fs::read(statusline_install::original_path()).ok()
        .and_then(|b| serde_json::from_slice(&b).ok());
    let Some(cmd) = original.as_ref().and_then(|o| o["command"].as_str()) else { return };
    use std::io::Write;
    use std::process::{Command, Stdio};
    let Ok(mut child) = Command::new("cmd").args(["/C", cmd]).stdin(Stdio::piped()).stdout(Stdio::piped()).spawn() else { return };
    if let Some(mut si) = child.stdin.take() { let _ = si.write_all(&buf); }
    if let Ok(out) = child.wait_with_output() { let _ = std::io::stdout().write_all(&out.stdout); }
}
```

Zmiany w tym samym pliku:
- `run()` używa teraz `post("/v1/events/claude", …)`;
- `main` na początku sprawdza `std::env::args().any(|a| a == statusline_install::MARK_ARG)` i wtedy woła `statusline()` zamiast `run()` (w `catch_unwind`, kod 0 jak dotąd);
- dodaj importy `pets_core::claude::StatuslineEnvelope` i `pets_core::statusline_install`.

Zaktualizuj komentarz modułu: „nic nie wypisuje” dotyczy trybu hooka, a tryb statusline wypisuje wyłącznie wyjście oryginalnej komendy.

- [ ] **Step 6: `pets-cli`**

Dodaj gałęzie `install-statusline [hook.exe]` i `uninstall-statusline`. Są analogiczne do `install-hooks` i `uninstall-hooks`: używają `statusline_install::install_file` i `uninstall_file` z `claude_settings()`. Zaktualizuj `USAGE`.

- [ ] **Step 7: Testy**

Run: `cargo test --workspace`
Expected: PASS (4 testy instalacji, 2 integracyjne przelotki).

- [ ] **Step 8: Instalacja u użytkownika (wymaga zgody)**

Zapytaj użytkownika, czy zainstalować przelotkę (`~/.claude/settings.json` dostanie `statusLine`; kopia zapasowa jest tworzona automatycznie). Po zgodzie:

```powershell
cargo build --release -p pets-hook -p pets-cli
copy target\release\hook.exe $HOME\.agent-pets\hook.exe
target\release\pets-cli.exe install-statusline $HOME\.agent-pets\hook.exe
```

Zamknij działający `agent-pets.exe` przed kopiowaniem, jeśli `hook.exe` jest zablokowany. Statusline działa tylko w CLI: sprawdzenie polega na tym, że w sesji `claude` w terminalu pasek limitów Claude'a pojawia się w scenie. Wynik zapisz w `docs/phase3-verification.md`.

- [ ] **Step 9: Commit**

```bash
git add crates
git commit -m "feat(hook): statusline pass-through feeding Claude limits to the widget; install/uninstall in pets-cli"
```

---

### Task 3: „Przejdź”: planista i wykonawca

**Files:**
- Create: `app/src-tauri/src/jump/mod.rs`, `jump/exec.rs`, `jump/registry.rs`
- Modify: `app/src-tauri/src/lib.rs` (moduł, komenda `jump`), `app/src-tauri/Cargo.toml` (cechy `windows`: `Win32_System_Threading`, `Win32_System_DataExchange`, `Win32_System_Memory`, `Win32_System_Diagnostics_ToolHelp`)

**Interfaces:**
- Consumes: `pets_core::model::{Session, Agent, App}`, `core::Shared`.
- Produces:
  - `jump::Target { agent: Agent, session_id: String, cwd: String, pid: Option<u32>, host_session_id: Option<String>, desktop: bool }` i `jump::Target::from(&Session, Option<&registry::Entry>)`;
  - `jump::Step::{DeepLink(String), FocusProcess(u32), OpenTerminal { cwd: String, program: String, args: Vec<String> }, Clipboard(String)}`;
  - `jump::plan(&Target) -> Vec<Step>`;
  - `jump::resume_command(&Target) -> String`;
  - `jump::JumpResult { method: String, detail: String }` (Serialize);
  - `jump::exec::run(steps: &[Step]) -> JumpResult`;
  - `jump::registry::Entry { pid, session_id, entrypoint, host_session_id }` i `jump::registry::find(home: &Path, session_id: &str) -> Option<Entry>`;
  - komenda `jump(session_id: String) -> JumpResult`.

**Zasady planu** (`plan`):
- `safe_id(id)` = `^[A-Za-z0-9_-]{1,128}$`. Gdy id nie przechodzi walidacji, plan to tylko `[Clipboard(komenda)]`, z id przepuszczonym przez filtr znaków.
- **Claude desktop** (`desktop == true`):
  1. jeśli `host_session_id` pasuje do `^local_[A-Za-z0-9-]{1,64}$`: `DeepLink("claude://code/continue?session=<host>")`;
  2. jeśli jest `pid`: `FocusProcess(pid)`.
- **Claude CLI:** `pid` → `FocusProcess(pid)`.
- **Codex:** `DeepLink("codex://threads/<id>")`.
- **Potem zawsze:**
  - jeśli `cwd` niepusty i istnieje: `OpenTerminal { cwd, program, args }`, gdzie program i argumenty to `claude --resume <id>` albo `codex resume <id>`;
  - na końcu `Clipboard(resume_command)`, np. `cd "<cwd>"; claude --resume <id>`.

**Wykonawca** (`exec::run`, kroki po kolei; pierwszy udany kończy):

| Krok | Wykonanie | Sukces, gdy |
|---|---|---|
| `DeepLink` | `ShellExecuteW(open, url)` | wynik > 32 |
| `FocusProcess(pid)` | idziemy w górę drzewa procesów (do 6 poziomów) aż do procesu z widocznym oknem najwyższego poziomu z tytułem; `ShowWindow(SW_RESTORE)` dla zminimalizowanego, potem `SetForegroundWindow` | `SetForegroundWindow` zwraca prawdę |
| `OpenTerminal` | `wt.exe -d <cwd> <program> <args…>`; gdy `wt` się nie uruchomi: `cmd /C start "" /D <cwd> powershell -NoExit -Command <program> <args…>`, z argumentami jako osobne pozycje `Command::args` | proces wystartował |
| `Clipboard(text)` | `OpenClipboard` / `SetClipboardData(CF_UNICODETEXT)` | zawsze (to koniec łańcucha) |

`JumpResult.method` to jedno z `"deeplink"`, `"focus"`, `"terminal"`, `"clipboard"`. `detail` to tekst dla panelu:
- „Otworzono sesję w aplikacji”;
- „Przełączono na okno sesji”;
- „Otworzono nowy terminal”;
- „Skopiowano komendę: …”.

- [ ] **Step 1: Testy planisty** (na końcu `jump/mod.rs`)

```rust
#[cfg(test)]
mod tests {
    use super::*;

    fn t(agent: Agent, desktop: bool) -> Target {
        Target { agent, session_id: "3746a003-5ba1".into(), cwd: std::env::temp_dir().to_string_lossy().into(),
                 pid: Some(42), host_session_id: Some("local_f1d1d64e-9530".into()), desktop }
    }

    #[test]
    fn claude_desktop_deep_links_then_focuses_then_resumes() {
        let p = plan(&t(Agent::Claude, true));
        assert_eq!(p[0], Step::DeepLink("claude://code/continue?session=local_f1d1d64e-9530".into()));
        assert_eq!(p[1], Step::FocusProcess(42));
        assert!(matches!(&p[2], Step::OpenTerminal { program, args, .. } if program == "claude" && args == &vec!["--resume".to_string(), "3746a003-5ba1".into()]));
        assert!(matches!(p.last(), Some(Step::Clipboard(_))));
    }

    #[test]
    fn claude_cli_focuses_its_terminal_first() {
        let mut x = t(Agent::Claude, false);
        x.host_session_id = None;
        assert_eq!(plan(&x)[0], Step::FocusProcess(42));
    }

    #[test]
    fn codex_opens_the_thread_in_the_app() {
        let p = plan(&t(Agent::Codex, false));
        assert_eq!(p[0], Step::DeepLink("codex://threads/3746a003-5ba1".into()));
        assert!(matches!(&p[1], Step::OpenTerminal { program, args, .. } if program == "codex" && args == &vec!["resume".to_string(), "3746a003-5ba1".into()]));
    }

    #[test]
    fn missing_data_still_ends_in_the_clipboard() {
        let x = Target { agent: Agent::Claude, session_id: "abc".into(), cwd: String::new(), pid: None, host_session_id: None, desktop: false };
        let p = plan(&x);
        assert_eq!(p.len(), 1);
        assert_eq!(p[0], Step::Clipboard("claude --resume abc".into()));
    }

    #[test]
    fn unsafe_ids_never_reach_urls_or_processes() {
        let mut x = t(Agent::Claude, true);
        x.session_id = "a\" & calc".into();
        x.host_session_id = Some("local_x&y".into());
        let p = plan(&x);
        assert_eq!(p.len(), 1, "{p:?}");
        assert!(matches!(&p[0], Step::Clipboard(c) if !c.contains('&') && !c.contains('"')));
    }

    #[test]
    fn nonexistent_cwd_skips_the_terminal() {
        let mut x = t(Agent::Codex, false);
        x.cwd = "C:\\nie\\ma\\takiego\\katalogu".into();
        assert!(plan(&x).iter().all(|s| !matches!(s, Step::OpenTerminal { .. })));
    }
}
```

Test rejestru (`jump/registry.rs`): plik `7.json` z `{"pid":7,"sessionId":"s1","entrypoint":"claude-desktop","hostSessionId":"local_ab"}` w katalogu tymczasowym `sessions/`. `find(home, "s1")` zwraca `Entry { pid: 7, host_session_id: Some("local_ab"), .. }`, a `find(home, "inny")` zwraca `None`.

- [ ] **Step 2: Uruchom i sprawdź, że pada**

Run: `cargo test -p agent-pets jump`
Expected: błąd kompilacji.

- [ ] **Step 3: Implementacja `jump/mod.rs`**

```rust
//! „Przejdź”: plan kroków (czysty, testowany) i ich wykonanie (`exec`, Win32). Kolejność ze spec 8.
pub mod exec;
pub mod registry;

use pets_core::model::{Agent, App, Session};
use serde::Serialize;
use std::path::Path;

#[derive(Clone, Debug, PartialEq)]
pub struct Target {
    pub agent: Agent,
    pub session_id: String,
    pub cwd: String,
    pub pid: Option<u32>,
    pub host_session_id: Option<String>,
    pub desktop: bool,
}

impl Target {
    pub fn from(s: &Session, reg: Option<&registry::Entry>) -> Target {
        Target {
            agent: s.agent,
            session_id: s.id.clone(),
            cwd: if s.cwd.is_empty() { s.jump.cwd.clone() } else { s.cwd.clone() },
            pid: s.jump.pid.or(reg.map(|r| r.pid)),
            host_session_id: reg.and_then(|r| r.host_session_id.clone()),
            desktop: s.jump.app == Some(App::ClaudeDesktop) || reg.map(|r| r.entrypoint == "claude-desktop").unwrap_or(false),
        }
    }
}

#[derive(Clone, Debug, PartialEq)]
pub enum Step {
    DeepLink(String),
    FocusProcess(u32),
    OpenTerminal { cwd: String, program: String, args: Vec<String> },
    Clipboard(String),
}

#[derive(Serialize, Clone, Debug, PartialEq)]
pub struct JumpResult { pub method: String, pub detail: String }

fn safe_id(id: &str) -> bool {
    !id.is_empty() && id.len() <= 128 && id.chars().all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-')
}

fn host_ok(h: &str) -> bool {
    h.strip_prefix("local_").map(|r| !r.is_empty() && r.len() <= 64 && r.chars().all(|c| c.is_ascii_alphanumeric() || c == '-')).unwrap_or(false)
}

fn resume(t: &Target) -> (String, Vec<String>) {
    match t.agent {
        Agent::Claude => ("claude".into(), vec!["--resume".into(), t.session_id.clone()]),
        Agent::Codex => ("codex".into(), vec!["resume".into(), t.session_id.clone()]),
    }
}

/// Komenda wznowienia do schowka. Id spoza bezpiecznego alfabetu jest przefiltrowane.
pub fn resume_command(t: &Target) -> String {
    let id: String = t.session_id.chars().filter(|c| c.is_ascii_alphanumeric() || *c == '_' || *c == '-').collect();
    let base = match t.agent { Agent::Claude => format!("claude --resume {id}"), Agent::Codex => format!("codex resume {id}") };
    if t.cwd.is_empty() { base } else { format!("cd \"{}\"; {base}", t.cwd.replace('"', "")) }
}

pub fn plan(t: &Target) -> Vec<Step> {
    let mut out = Vec::new();
    if !safe_id(&t.session_id) { return vec![Step::Clipboard(resume_command(t))]; }
    match t.agent {
        Agent::Claude => {
            if t.desktop {
                if let Some(h) = t.host_session_id.as_deref().filter(|h| host_ok(h)) {
                    out.push(Step::DeepLink(format!("claude://code/continue?session={h}")));
                }
            }
            if let Some(pid) = t.pid { out.push(Step::FocusProcess(pid)); }
        }
        Agent::Codex => out.push(Step::DeepLink(format!("codex://threads/{}", t.session_id))),
    }
    if !t.cwd.is_empty() && Path::new(&t.cwd).is_dir() {
        let (program, args) = resume(t);
        out.push(Step::OpenTerminal { cwd: t.cwd.clone(), program, args });
    }
    out.push(Step::Clipboard(resume_command(t)));
    out
}
```

Pierwszy test „missing data” oczekuje `"claude --resume abc"` przy pustym `cwd`, co ten kod zapewnia. Test „unsafe ids” wymaga, żeby w komendzie nie było `&` ani `"`: filtr id to zapewnia, a `cwd` z tymczasowego katalogu cudzysłowów nie ma.

- [ ] **Step 4: `jump/registry.rs`**

```rust
//! Dane sesji z rejestru Claude Code (`~/.claude/sessions/<pid>.json`), czytane w chwili „Przejdź”:
//! sesje utworzone po starcie widżetu też mają tam `hostSessionId`.
use std::path::Path;

#[derive(Clone, Debug, PartialEq)]
pub struct Entry { pub pid: u32, pub session_id: String, pub entrypoint: String, pub host_session_id: Option<String> }

pub fn find(home: &Path, session_id: &str) -> Option<Entry> {
    let dir = home.join(".claude").join("sessions");
    std::fs::read_dir(dir).ok()?.flatten()
        .filter(|f| f.path().extension().and_then(|x| x.to_str()) == Some("json"))
        .filter_map(|f| serde_json::from_slice::<serde_json::Value>(&std::fs::read(f.path()).ok()?).ok())
        .find(|v| v["sessionId"].as_str() == Some(session_id))
        .map(|v| Entry {
            pid: v["pid"].as_u64().unwrap_or(0) as u32,
            session_id: session_id.to_string(),
            entrypoint: v["entrypoint"].as_str().unwrap_or("").to_string(),
            host_session_id: v["hostSessionId"].as_str().map(String::from),
        })
}
```

- [ ] **Step 5: `jump/exec.rs`** (Win32; bez testów jednostkowych, sprawdzane ręcznie w tasku 7)

```rust
//! Wykonanie kroków „Przejdź”. Pierwszy udany krok kończy łańcuch; schowek zawsze się udaje.
use super::{JumpResult, Step};
use windows::core::{HSTRING, PCWSTR};
use windows::Win32::Foundation::{HANDLE, HWND, LPARAM, BOOL};
use windows::Win32::System::DataExchange::{CloseClipboard, EmptyClipboard, OpenClipboard, SetClipboardData};
use windows::Win32::System::Memory::{GlobalAlloc, GlobalLock, GlobalUnlock, GMEM_MOVEABLE};
use windows::Win32::UI::Shell::ShellExecuteW;
use windows::Win32::UI::WindowsAndMessaging::*;

const CF_UNICODETEXT: u32 = 13;

fn deep_link(url: &str) -> bool {
    let r = unsafe { ShellExecuteW(None, &HSTRING::from("open"), &HSTRING::from(url), PCWSTR::null(), PCWSTR::null(), SW_SHOWNORMAL) };
    r.0 as isize > 32
}

/// Widoczne okno najwyższego poziomu z tytułem, należące do `pid`.
fn window_of(pid: u32) -> Option<HWND> {
    struct Find { pid: u32, found: Option<HWND> }
    unsafe extern "system" fn cb(h: HWND, l: LPARAM) -> BOOL {
        let f = &mut *(l.0 as *mut Find);
        let mut p = 0u32;
        GetWindowThreadProcessId(h, Some(&mut p));
        if p == f.pid && IsWindowVisible(h).as_bool() && GetWindowTextLengthW(h) > 0 && GetWindow(h, GW_OWNER).is_err() {
            f.found = Some(h);
            return BOOL(0);
        }
        BOOL(1)
    }
    let mut f = Find { pid, found: None };
    unsafe { let _ = EnumWindows(Some(cb), LPARAM(&mut f as *mut Find as isize)); }
    f.found
}

/// Okno sesji: sam proces albo najbliższy przodek z oknem (claude.exe ← pwsh ← WindowsTerminal).
pub fn session_window(pid: u32) -> Option<HWND> {
    let mut p = pid;
    for _ in 0..6 {
        if let Some(h) = window_of(p) { return Some(h); }
        p = pets_core::pid::process_entry(p)?.0;
        if p == 0 { return None; }
    }
    None
}

fn focus(pid: u32) -> bool {
    let Some(h) = session_window(pid) else { return false };
    unsafe {
        if IsIconic(h).as_bool() { let _ = ShowWindow(h, SW_RESTORE); }
        SetForegroundWindow(h).as_bool()
    }
}

fn terminal(cwd: &str, program: &str, args: &[String]) -> bool {
    use std::process::Command;
    if Command::new("wt.exe").arg("-d").arg(cwd).arg(program).args(args).spawn().is_ok() { return true; }
    Command::new("cmd").args(["/C", "start", "", "/D"]).arg(cwd).args(["powershell", "-NoExit", "-Command", program])
        .args(args).spawn().is_ok()
}

fn clipboard(text: &str) -> bool {
    let wide: Vec<u16> = text.encode_utf16().chain(std::iter::once(0)).collect();
    unsafe {
        if OpenClipboard(None).is_err() { return false; }
        let _ = EmptyClipboard();
        let ok = (|| -> Option<()> {
            let mem = GlobalAlloc(GMEM_MOVEABLE, wide.len() * 2).ok()?;
            let dst = GlobalLock(mem) as *mut u16;
            if dst.is_null() { return None; }
            std::ptr::copy_nonoverlapping(wide.as_ptr(), dst, wide.len());
            let _ = GlobalUnlock(mem);
            SetClipboardData(CF_UNICODETEXT, Some(HANDLE(mem.0))).ok()?;
            Some(())
        })().is_some();
        let _ = CloseClipboard();
        ok
    }
}

pub fn run(steps: &[Step]) -> JumpResult {
    for s in steps {
        let r = match s {
            Step::DeepLink(u) if deep_link(u) => Some(("deeplink", "Otworzono sesję w aplikacji".to_string())),
            Step::FocusProcess(p) if focus(*p) => Some(("focus", "Przełączono na okno sesji".to_string())),
            Step::OpenTerminal { cwd, program, args } if terminal(cwd, program, args) => Some(("terminal", "Otworzono nowy terminal".to_string())),
            Step::Clipboard(t) => Some(("clipboard", if clipboard(t) { format!("Skopiowano komendę: {t}") } else { format!("Wznów ręcznie: {t}") })),
            _ => None,
        };
        if let Some((m, d)) = r { return JumpResult { method: m.into(), detail: d }; }
    }
    JumpResult { method: "none".into(), detail: "Nie udało się przejść do sesji".into() }
}
```

Sygnatury są dla `windows` 0.61. `GetWindow` zwraca `Result<HWND>`, `SetClipboardData` przyjmuje `Option<HANDLE>`. Dopasuj wywołania do kompilatora, nie wersję crate'a.

- [ ] **Step 6: Komenda `jump`** (w `lib.rs`)

```rust
#[tauri::command]
fn jump(session_id: String, state: tauri::State<core::Shared>) -> jump::JumpResult {
    let snap = state.lock().unwrap().clone();
    let Some(s) = snap.sessions.iter().find(|s| s.id == session_id) else {
        return jump::JumpResult { method: "none".into(), detail: "Sesja już nie istnieje".into() };
    };
    let reg = dirs_home().and_then(|h| jump::registry::find(&h, &session_id));
    jump::exec::run(&jump::plan(&jump::Target::from(s, reg.as_ref())))
}
```

`dirs_home()` to `std::env::var_os("USERPROFILE").map(PathBuf::from)`. Nie dodajemy crate'a `dirs` do aplikacji, bo `pets-core` go ma, ale tu wystarczy zmienna środowiskowa. Zarejestruj `jump` w `invoke_handler`.

- [ ] **Step 7: Testy i commit**

Run: `cargo test --workspace`
Expected: PASS (6 testów planisty i 1 test rejestru).

```bash
git add app/src-tauri
git commit -m "feat(app): jump to session — deep link, focus, new terminal, clipboard fallback"
```

---

### Task 4: Reguły powiadomień

**Files:**
- Create: `app/src-tauri/src/notify/rules.rs` (oraz `notify/mod.rs` z `pub mod rules;`, reszta w tasku 5)

**Interfaces:**
- Produces:
  - `notify::rules::{Settings, Toast, ToastKind, Rules}`;
  - `Rules::new(settings)`;
  - `Rules::observe(&mut self, snap: &Snapshot, now: i64, focused: &dyn Fn(&Session) -> bool) -> Vec<Toast>`;
  - `Toast { kind: ToastKind, session_id: Option<String>, title: String, body: String }`;
  - `ToastKind::{NeedsYou, Done, Limit}`.

**Reguły:**
- Pierwsze wywołanie `observe` tylko zapamiętuje stan i zwraca pustą listę (nic zastanego przy starcie).
- **`NeedsYou`:** sesja w `needs_you` od `now - state_since > 15_000`, `!focused(s)`, klucz `(id, state_since)` jeszcze nie zgłoszony.
  - Treść: „<tytuł albo katalog> czeka na Ciebie”.
  - Wyjątek od reguły startu: epizody `needs_you` trwające już przy pierwszym `observe` są zapamiętywane jako zgłoszone, żeby nie wyskoczyły po 15 s.
- **`Done`:** sesja w `done`, `turn_started_at = Some(t)`, `state_since - t > 120_000`, klucz `(id, t)` nie zgłoszony.
  - Treść: „<tytuł> skończył (<n> min)”.
- **`Limit`:** limit `used_pct > 90`, klucz `(agent, window, resets_at)` nie zgłoszony.
  - Treść: „Claude: limit 5h 93% · reset 17:05”, a dla tygodnia z dniem tygodnia jak w tooltipie.
  - Godzina w strefie lokalnej: bez nowych zależności, z `GetTimeZoneInformation`, albo prościej z komunikatem bez godziny resetu, jeśli `resets_at` brak.
- Wyłączone rodzaje (`Settings { needs_you: bool, done: bool, limits: bool }`) nie są zgłaszane.

- [ ] **Step 1: Testy**

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use pets_core::model::*;

    fn sess(id: &str, state: State, since: i64, turn: Option<i64>) -> Session {
        Session { id: id.into(), agent: Agent::Claude, origin: Origin::Cli, title: format!("T-{id}"), cwd: String::new(),
            state, tool: None, progress: None, context: None, started_at: 0, last_activity: since, state_since: since,
            turn_started_at: turn, jump: JumpTarget::default() }
    }
    fn snap(sessions: Vec<Session>, limits: Vec<Limit>) -> Snapshot { Snapshot { sessions, limits, now: 0 } }
    const ALL: Settings = Settings { needs_you: true, done: true, limits: true };

    #[test]
    fn nothing_on_startup_even_if_everything_qualifies() {
        let mut r = Rules::new(ALL);
        let s = snap(vec![sess("a", State::NeedsYou, 0, None), sess("b", State::Done, 200_000, Some(0))],
            vec![Limit { agent: Agent::Codex, window: Window::Weekly, used_pct: 95.0, resets_at: Some(9) }]);
        assert!(r.observe(&s, 300_000, &|_| false).is_empty());
        assert!(r.observe(&s, 301_000, &|_| false).is_empty(), "zastane epizody nie wyskakują później");
    }

    #[test]
    fn needs_you_after_15_s_unless_focused_and_only_once() {
        let mut r = Rules::new(ALL);
        r.observe(&snap(vec![], vec![]), 0, &|_| false);
        let s = snap(vec![sess("a", State::NeedsYou, 1_000, None)], vec![]);
        assert!(r.observe(&s, 10_000, &|_| false).is_empty());
        assert!(r.observe(&s, 20_000, &|_| true).is_empty(), "okno sesji ma fokus");
        let t = r.observe(&s, 20_000, &|_| false);
        assert_eq!(t.len(), 1);
        assert_eq!((t[0].kind, t[0].session_id.as_deref()), (ToastKind::NeedsYou, Some("a")));
        assert!(r.observe(&s, 30_000, &|_| false).is_empty());
        let again = snap(vec![sess("a", State::NeedsYou, 50_000, None)], vec![]);
        assert_eq!(r.observe(&again, 70_000, &|_| false).len(), 1, "nowy epizod");
    }

    #[test]
    fn done_only_after_long_turns() {
        let mut r = Rules::new(ALL);
        r.observe(&snap(vec![], vec![]), 0, &|_| false);
        assert!(r.observe(&snap(vec![sess("a", State::Done, 60_000, Some(0))], vec![]), 61_000, &|_| false).is_empty());
        let t = r.observe(&snap(vec![sess("b", State::Done, 200_000, Some(0))], vec![]), 201_000, &|_| false);
        assert_eq!((t.len(), t[0].kind), (1, ToastKind::Done));
    }

    #[test]
    fn limit_once_per_window_until_reset() {
        let mut r = Rules::new(ALL);
        r.observe(&snap(vec![], vec![]), 0, &|_| false);
        let l = |pct: f32, reset: i64| Limit { agent: Agent::Claude, window: Window::FiveHour, used_pct: pct, resets_at: Some(reset) };
        assert!(r.observe(&snap(vec![], vec![l(80.0, 1)]), 1, &|_| false).is_empty());
        assert_eq!(r.observe(&snap(vec![], vec![l(91.0, 1)]), 2, &|_| false).len(), 1);
        assert!(r.observe(&snap(vec![], vec![l(95.0, 1)]), 3, &|_| false).is_empty());
        assert_eq!(r.observe(&snap(vec![], vec![l(92.0, 2)]), 4, &|_| false).len(), 1, "nowe okno po resecie");
    }

    #[test]
    fn disabled_kinds_stay_silent() {
        let mut r = Rules::new(Settings { needs_you: false, done: true, limits: true });
        r.observe(&snap(vec![], vec![]), 0, &|_| false);
        assert!(r.observe(&snap(vec![sess("a", State::NeedsYou, 0, None)], vec![]), 60_000, &|_| false).is_empty());
    }
}
```

Testy korzystają z `crate::core::Snapshot` przez `use super::*` (import jest na górze `rules.rs`).

- [ ] **Step 2: Uruchom i sprawdź, że pada**

Run: `cargo test -p agent-pets rules`
Expected: błąd kompilacji.

- [ ] **Step 3: Implementacja `rules.rs`**

```rust
//! Kiedy wysłać powiadomienie (spec 2.4). Czysta logika; dostarczanie jest w `notify/mod.rs`.
use crate::core::Snapshot;
use pets_core::model::{Agent, Session, State, Window};
use std::collections::HashSet;

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Settings { pub needs_you: bool, pub done: bool, pub limits: bool }

impl Default for Settings { fn default() -> Self { Settings { needs_you: true, done: true, limits: true } } }

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ToastKind { NeedsYou, Done, Limit }

#[derive(Clone, Debug, PartialEq)]
pub struct Toast { pub kind: ToastKind, pub session_id: Option<String>, pub title: String, pub body: String }

pub struct Rules { settings: Settings, primed: bool, sent: HashSet<String> }

const NEEDS_AFTER_MS: i64 = 15_000;
const LONG_TURN_MS: i64 = 120_000;

fn name(s: &Session) -> String {
    if !s.title.is_empty() { return s.title.chars().take(60).collect(); }
    s.cwd.rsplit(['\\', '/']).find(|p| !p.is_empty()).unwrap_or("Sesja").to_string()
}

impl Rules {
    pub fn new(settings: Settings) -> Rules { Rules { settings, primed: false, sent: HashSet::new() } }

    pub fn observe(&mut self, snap: &Snapshot, now: i64, focused: &dyn Fn(&Session) -> bool) -> Vec<Toast> {
        let mut out = Vec::new();
        let priming = !self.primed;
        self.primed = true;
        for s in &snap.sessions {
            match s.state {
                State::NeedsYou => {
                    let key = format!("needs:{}:{}", s.id, s.state_since);
                    if priming { self.sent.insert(key); continue; }
                    if self.settings.needs_you && now - s.state_since > NEEDS_AFTER_MS && !self.sent.contains(&key) && !focused(s) {
                        self.sent.insert(key);
                        out.push(Toast { kind: ToastKind::NeedsYou, session_id: Some(s.id.clone()),
                            title: "Agent czeka na Ciebie".into(), body: format!("{} czeka na Ciebie", name(s)) });
                    }
                }
                State::Done => if let Some(t) = s.turn_started_at {
                    let key = format!("done:{}:{t}", s.id);
                    if priming { self.sent.insert(key); continue; }
                    if self.settings.done && s.state_since - t > LONG_TURN_MS && self.sent.insert(key) {
                        out.push(Toast { kind: ToastKind::Done, session_id: Some(s.id.clone()), title: "Agent skończył".into(),
                            body: format!("{} skończył ({} min)", name(s), (s.state_since - t) / 60_000) });
                    }
                },
                _ => {}
            }
        }
        for l in &snap.limits {
            if l.used_pct <= 90.0 { continue; }
            let key = format!("limit:{:?}:{:?}:{:?}", l.agent, l.window, l.resets_at);
            if priming { self.sent.insert(key); continue; }
            if self.settings.limits && self.sent.insert(key) {
                let who = match l.agent { Agent::Claude => "Claude", Agent::Codex => "Codex" };
                let win = match l.window { Window::FiveHour => "5h", Window::Weekly => "tygodniowy" };
                out.push(Toast { kind: ToastKind::Limit, session_id: None, title: format!("{who}: limit {win}"),
                    body: format!("Zużyto {:.0}% limitu {win}", l.used_pct) });
            }
        }
        out
    }
}
```

Godzinę resetu w treści pomijamy: czas lokalny wymagałby nowej zależności. Toast i tak odsyła do panelu, który godzinę pokazuje. Zapisz to w ledgerze jako ruling.

- [ ] **Step 4: Testy i commit**

Run: `cargo test -p agent-pets rules`
Expected: 5 PASS.

```bash
git add app/src-tauri/src/notify
git commit -m "feat(app): notification rules (needs you, long turn done, limit over 90%)"
```

---

### Task 5: Dostarczanie powiadomień i okno panelu (Rust)

**Files:**
- Modify: `app/src-tauri/src/notify/mod.rs`, `app/src-tauri/src/core.rs`, `app/src-tauri/Cargo.toml` (`tauri-winrt-notification = "0.8"`, cechy `windows`: `Win32_System_Registry`)
- Create: `app/src-tauri/src/panel.rs`
- Modify: `app/src-tauri/src/tray.rs`, `app/src-tauri/src/lib.rs`, `app/src-tauri/capabilities/default.json` (`"windows": ["stage*", "tooltip", "panel"]`)

**Interfaces:**
- Consumes: `Rules`, `jump::exec::session_window`, `jump::{plan, Target}`, `core::Snapshot`.
- Produces:
  - `core::spawn(app, shared, mode, snaps: Option<std::sync::mpsc::Sender<Snapshot>>)` (każda publikacja trafia też do kanału);
  - `notify::start(app: AppHandle) -> Sender<Snapshot>`;
  - `panel::PanelToggle` (czyste, testowane);
  - `panel::build(&AppHandle)`, `panel::open(&AppHandle, focus: Option<String>)`, `panel::toggle(&AppHandle)`;
  - komendy `panel_open(focus: Option<String>)`, `panel_hide()`;
  - zdarzenie `panel://focus` z id sesji do podświetlenia.

**Przełączanie panelu:** panel chowa się, gdy traci fokus. Kliknięcie ikony w trayu albo sceny samo zabiera fokus, więc panel zdążyłby się schować tuż przed obsługą kliknięcia i zaraz otworzyć ponownie. `PanelToggle` pamięta chwilę schowania: „przełącz” w ciągu 400 ms od schowania przez utratę fokusu nic nie robi (panel ma zostać zamknięty).

- [ ] **Step 1: Test `PanelToggle`** (w `panel.rs`)

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn click_that_caused_the_blur_closes_instead_of_reopening() {
        let mut t = PanelToggle::default();
        assert!(t.toggle(1_000), "zamknięty → otwórz");
        t.shown();
        t.blurred(2_000);
        assert!(!t.toggle(2_100), "klik zaraz po utracie fokusu: zostaje zamknięty");
        assert!(t.toggle(3_000), "późniejszy klik otwiera");
    }

    #[test]
    fn toggle_closes_an_open_panel() {
        let mut t = PanelToggle::default();
        t.shown();
        assert!(!t.toggle(5_000));
    }
}
```

`toggle(now) -> bool` zwraca, czy panel ma być widoczny po kliknięciu. Wywołujący pokazuje go albo chowa.

- [ ] **Step 2: Uruchom i sprawdź, że pada**

Run: `cargo test -p agent-pets panel`
Expected: błąd kompilacji.

- [ ] **Step 3: `panel.rs`**

```rust
//! Panel nad paskiem: lista sesji, limity, „Przejdź”. Okno pokazywane i chowane wyłącznie przez API Tauri.
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager, PhysicalPosition, WebviewUrl, WebviewWindowBuilder, WindowEvent};

const W: f64 = 400.0;
const H: f64 = 540.0;
const BLUR_GRACE_MS: i64 = 400;

#[derive(Default)]
pub struct PanelToggle { visible: bool, blurred_at: Option<i64> }

impl PanelToggle {
    pub fn shown(&mut self) { self.visible = true; self.blurred_at = None; }
    pub fn blurred(&mut self, now: i64) { self.visible = false; self.blurred_at = Some(now); }
    pub fn hidden(&mut self) { self.visible = false; }
    /// Czy po kliknięciu panel ma być widoczny.
    pub fn toggle(&mut self, now: i64) -> bool {
        if self.visible { return false; }
        !matches!(self.blurred_at, Some(t) if now - t < BLUR_GRACE_MS)
    }
}

#[derive(Default)]
pub struct Panel(pub Mutex<PanelToggle>);

pub fn build(app: &AppHandle) -> tauri::Result<()> {
    let w = WebviewWindowBuilder::new(app, "panel", WebviewUrl::App("panel.html".into()))
        .title("Agent Pets").inner_size(W, H).decorations(false).transparent(true).always_on_top(true)
        .skip_taskbar(true).resizable(false).shadow(true).visible(false).build()?;
    let a = app.clone();
    w.on_window_event(move |e| if let WindowEvent::Focused(false) = e {
        if let Some(win) = a.get_webview_window("panel") { let _ = win.hide(); }
        a.state::<Panel>().0.lock().unwrap().blurred(pets_core::time::now_ms());
    });
    Ok(())
}

fn place(app: &AppHandle) {
    let Some(win) = app.get_webview_window("panel") else { return };
    let Ok(Some(mon)) = win.primary_monitor() else { return };
    let scale = mon.scale_factor();
    let (sw, sh) = (mon.size().width as f64, mon.size().height as f64);
    let (w, h) = (W * scale, H * scale);
    // nad paskiem (48 CSS px) przy prawej krawędzi, jak wysuwane panele Windows 11
    let x = sw - w - 12.0 * scale;
    let y = sh - 48.0 * scale - h - 12.0 * scale;
    let _ = win.set_position(PhysicalPosition::new(x.round() as i32, y.round() as i32));
}

pub fn open(app: &AppHandle, focus: Option<String>) {
    let Some(win) = app.get_webview_window("panel") else { return };
    place(app);
    let _ = win.show();
    let _ = win.set_focus();
    app.state::<Panel>().0.lock().unwrap().shown();
    if let Some(id) = focus { let _ = app.emit_to("panel", "panel://focus", id); }
}

pub fn hide(app: &AppHandle) {
    if let Some(win) = app.get_webview_window("panel") { let _ = win.hide(); }
    app.state::<Panel>().0.lock().unwrap().hidden();
}

pub fn toggle(app: &AppHandle, focus: Option<String>) {
    let show = app.state::<Panel>().0.lock().unwrap().toggle(pets_core::time::now_ms());
    if show { open(app, focus) } else { hide(app) }
}

#[tauri::command]
pub fn panel_open(app: AppHandle, focus: Option<String>) { toggle(&app, focus); }

#[tauri::command]
pub fn panel_hide(app: AppHandle) { hide(&app); }
```

Wysokość paska 48 px w `place` to uproszczenie. Panel i tak ma odstęp 12 px. Przy innym pasku (np. małym) panel stoi odrobinę wyżej, co jest nieszkodliwe. Zapisz to jako ruling.

- [ ] **Step 4: Tray** (`tray.rs`): lewy klik przełącza panel, menu zostaje pod prawym.

```rust
use tauri::tray::{MouseButton, MouseButtonState, TrayIconEvent};
// w build():
    let mut b = TrayIconBuilder::with_id("main").tooltip("Agent Pets").menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, e| if e.id() == "quit" { app.exit(0) })
        .on_tray_icon_event(|tray, e| if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = e {
            crate::panel::toggle(tray.app_handle(), None);
        });
```

Jeśli w Tauri 2.11 metoda nazywa się `menu_on_left_click`, użyj jej.

- [ ] **Step 5: Powiadomienia** (`notify/mod.rs`)

```rust
//! Dostarczanie toastów Windows (WinRT) z przyciskiem „Przejdź”. Reguły są w `rules`.
pub mod rules;

use crate::core::Snapshot;
use pets_core::model::Session;
use std::sync::mpsc::{channel, Sender};
use tauri::{AppHandle, Manager};
use tauri_winrt_notification::Toast;

pub const AUMID: &str = "dev.agentpets.app";

/// Rejestracja AUMID dla niezainstalowanej aplikacji (HKCU), żeby toasty były podpisane „Agent Pets”.
fn register_aumid() -> bool {
    use windows::core::HSTRING;
    use windows::Win32::System::Registry::*;
    let key = HSTRING::from(format!("Software\\Classes\\AppUserModelId\\{AUMID}"));
    unsafe {
        let mut h = HKEY::default();
        if RegCreateKeyExW(HKEY_CURRENT_USER, &key, None, None, REG_OPTION_NON_VOLATILE, KEY_WRITE, None, &mut h, None).is_err() { return false; }
        let name: Vec<u16> = "Agent Pets".encode_utf16().chain(std::iter::once(0)).collect();
        let bytes = std::slice::from_raw_parts(name.as_ptr() as *const u8, name.len() * 2);
        let ok = RegSetValueExW(h, &HSTRING::from("DisplayName"), None, REG_SZ, Some(bytes)).is_ok();
        let _ = RegCloseKey(h);
        ok
    }
}

fn focused(s: &Session) -> bool {
    use windows::Win32::UI::WindowsAndMessaging::{GetAncestor, GetForegroundWindow, GA_ROOTOWNER};
    let Some(pid) = s.jump.pid else { return false };
    let Some(win) = crate::jump::exec::session_window(pid) else { return false };
    unsafe { GetAncestor(GetForegroundWindow(), GA_ROOTOWNER) == win }
}

pub fn start(app: AppHandle) -> Sender<Snapshot> {
    let (tx, rx) = channel::<Snapshot>();
    let app_id = if register_aumid() { AUMID } else { Toast::POWERSHELL_APP_ID };
    std::thread::spawn(move || {
        let mut rules = rules::Rules::new(rules::Settings::default());
        let mut last = Snapshot::default();
        loop {
            // nowa migawka albo co sekundę (próg 15 s dla `needs_you` mija bez nowych zdarzeń)
            if let Ok(s) = rx.recv_timeout(std::time::Duration::from_secs(1)) { last = s; }
            let now = last.now.max(pets_core::time::now_ms());
            for t in rules.observe(&last, now, &focused) {
                let a = app.clone();
                let sid = t.session_id.clone();
                let mut toast = Toast::new(app_id).title(&t.title).text1(&t.body);
                if sid.is_some() { toast = toast.add_button("Przejdź", "jump"); }
                let _ = toast.on_activated(move |action| {
                    match (action.as_deref(), &sid) {
                        (Some("jump"), Some(id)) => { let _ = crate::jump_to(&a, id); }
                        _ => crate::panel::open(&a, sid.clone()),
                    }
                    Ok(())
                }).show();
            }
        }
    });
    tx
}
```

W `lib.rs` wydziel z komendy `jump` funkcję `pub fn jump_to(app: &AppHandle, id: &str) -> jump::JumpResult`, która bierze `core::Shared` z `app.state()`. Komenda i toast używają jej obie.

**Uwaga o czasie:** w trybie odtwarzania `last.now` to zegar nagrania, więc bierzemy `max` z zegarem ściennym. Nagranie pokazowe ma czasy z 1970 r., więc powiadomień w nim praktycznie nie będzie. To akceptowalne, bo tryb odtwarzania służy do wyglądu.

**`core::spawn`:** dodaj parametr `snaps: Option<Sender<Snapshot>>`. `publish` wysyła klona migawki, jeśli kanał jest.

- [ ] **Step 6: `lib.rs`:**
- moduły `jump`, `notify`, `panel`;
- `app.manage(panel::Panel::default())`, `panel::build(app.handle())?`;
- `let snaps = notify::start(app.handle().clone());` i `core::spawn(…, Some(snaps))`;
- komendy `jump`, `panel::panel_open`, `panel::panel_hide`.

- [ ] **Step 7: Testy i ręczna weryfikacja**

Run: `cargo test --workspace`
Expected: PASS (w tym 2 testy `PanelToggle`).

Ręcznie (panel będzie pusty do tasku 6, bo `panel.html` jeszcze nie istnieje):
- lewy klik ikony w trayu pokazuje i chowa okno panelu nad paskiem przy prawej krawędzi;
- klik poza panelem go chowa;
- prawy klik pokazuje menu z „Zakończ”.

Powiadomienia: w sesji Claude Code poproś o coś, co wymaga zgody (tryb z pytaniem o zgodę), i nie odpowiadaj przez 15 s, z fokusem na innym oknie. Oczekiwane: toast „Agent czeka na Ciebie” z przyciskiem „Przejdź”, a przycisk przełącza na sesję. Jeśli toast się nie pojawia, sprawdź Ustawienia → Powiadomienia (wpis „Agent Pets”). Gdy wpisu brak, zmień `app_id` na `Toast::POWERSHELL_APP_ID` i zapisz ruling.

- [ ] **Step 8: Commit**

```bash
git add app/src-tauri
git commit -m "feat(app): Windows notifications with Przejdź, panel window with tray and blur handling"
```

---

### Task 6: Panel w React

**Files:**
- Modify: `app/package.json` (zależności), `app/tsconfig.json` (`"jsx": "react-jsx"`), `app/vite.config.ts` (plugin React, wejście `panel`)
- Create: `app/panel.html`, `app/src/panel/main.tsx`, `App.tsx`, `PetCanvas.tsx`, `model.ts`, `model.test.ts`, `App.test.tsx`
- Modify: `app/src/stage/stage.ts` (klik → `panel_open`), `app/src/stage/bridge.ts` (`openPanel(focus?)`)

**Interfaces:**
- Consumes: `Snapshot`, `Session`, `Limit`, `actionLabel`, `formatAgo`, `formatReset`, `clampPct`, `progressFraction`, `createPet`, `stepPet`, `drawPet`, `pen`, `sceneFor`, `skinFor`, komendy `snapshot`, `jump`, `panel_hide`, zdarzenia `pets://snapshot`, `panel://focus`.
- Produces:
  - `model.ts`: `panelSessions(sessions): Session[]` (kolejność: `needs_you` i `error` na górze, potem według `last_activity` malejąco), `limitRows(limits, nowMs): LimitRow[]` (zawsze 4 wiersze: Claude 5h, Claude tydzień, Codex 5h, Codex tydzień; `pct: number | null`, `reset: string`), `sessionSubtitle(s)`, `contextText(s)`, `progressText(s)`;
  - `Bridge.openPanel(focus?: string)`.

- [ ] **Step 1: Zależności**

```powershell
cd app
pnpm add react react-dom
pnpm add -D @vitejs/plugin-react @types/react @types/react-dom
```

`vite.config.ts`: `import react from '@vitejs/plugin-react';`, `plugins: [react()]`, wejście `panel: page('panel.html')`, a w `test.include` dodaj `'src/**/*.test.tsx'`. W `tsconfig.json` dodaj `"jsx": "react-jsx"`.

- [ ] **Step 2: Testy modelu `model.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import type { Session, State } from '../types';
import { contextText, limitRows, panelSessions, progressText, sessionSubtitle } from './model';

const s = (id: string, state: State, last: number): Session => ({
  id, agent: 'claude', origin: 'cli', title: id, cwd: 'C:\\work\\' + id, state, tool: null, progress: null, context: null,
  started_at: 0, last_activity: last, state_since: 0, turn_started_at: null, jump: { pid: null, session_id: id, cwd: '', app: null },
});

describe('panel model', () => {
  it('puts sessions that need you first, then the most recently active', () => {
    const out = panelSessions([s('a', 'working', 10), s('b', 'needs_you', 1), s('c', 'idle', 30), s('d', 'error', 2)]);
    expect(out.map(x => x.id)).toEqual(['d', 'b', 'c', 'a']);
  });
  it('always shows four limit rows and never invents 0%', () => {
    const now = new Date(2026, 8, 24, 12, 0).getTime();
    const rows = limitRows([{ agent: 'codex', window: 'weekly', used_pct: 91, resets_at: null }], now);
    expect(rows.map(r => `${r.agent}/${r.window}`)).toEqual(['claude/five_hour', 'claude/weekly', 'codex/five_hour', 'codex/weekly']);
    expect(rows[0].pct).toBeNull();
    expect(rows[3].pct).toBe(91);
  });
  it('describes a session', () => {
    const x = { ...s('a', 'working', 0), tool: 'bash' as const, origin: 'desktop' as const, progress: { done: 2, total: 5 }, context: { used: 50, max: 200 } };
    expect(sessionSubtitle(x)).toBe('Claude Code · aplikacja · a');
    expect(progressText(x)).toBe('2/5');
    expect(contextText(x)).toBe('25%');
    expect(progressText({ ...x, progress: { done: 0, total: 0 } })).toBeNull();
    expect(contextText({ ...x, context: { used: 1, max: 0 } })).toBeNull();
  });
});
```

- [ ] **Step 3: Test renderowania `App.test.tsx`** (bez DOM, przez `react-dom/server`)

```tsx
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { PanelView } from './App';
import type { Session } from '../types';

const sess: Session = {
  id: 'a', agent: 'claude', origin: 'cli', title: '<img src=x onerror=alert(1)>', cwd: 'C:\\work\\a', state: 'needs_you',
  tool: null, progress: null, context: null, started_at: 0, last_activity: 0, state_since: 0, turn_started_at: null,
  jump: { pid: null, session_id: 'a', cwd: '', app: null },
};

describe('PanelView', () => {
  it('escapes prompt text and shows a jump button per session', () => {
    const html = renderToString(<PanelView snap={{ sessions: [sess], limits: [], now: 0 }} nowMs={0} status={null} focusId={null} onJump={() => {}} />);
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;img');
    expect(html).toContain('Przejdź');
    expect(html).toContain('Czeka na Ciebie');
  });
  it('has an empty state', () => {
    const html = renderToString(<PanelView snap={{ sessions: [], limits: [], now: 0 }} nowMs={0} status={null} focusId={null} onJump={() => {}} />);
    expect(html).toContain('Brak aktywnych sesji');
  });
});
```

- [ ] **Step 4: Uruchom i sprawdź, że pada**

Run: `pnpm test`
Expected: FAIL (brak `./model`, `./App`).

- [ ] **Step 5: `model.ts`**

```ts
import { clampPct, progressFraction } from '../stage/hud';
import { formatReset } from '../tooltip/text';
import type { Limit, Session } from '../types';

const URGENT = new Set(['needs_you', 'error']);
const AGENT: Record<string, string> = { claude: 'Claude Code', codex: 'Codex' };
const ORIGIN: Record<string, string> = { cli: 'CLI', desktop: 'aplikacja', router: 'Agent Router' };

export function panelSessions(sessions: Session[]): Session[] {
  return [...sessions].sort((a, b) =>
    Number(URGENT.has(b.state)) - Number(URGENT.has(a.state)) || b.last_activity - a.last_activity || (a.id < b.id ? -1 : 1));
}

export interface LimitRow { agent: 'claude' | 'codex'; window: 'five_hour' | 'weekly'; label: string; pct: number | null; reset: string }

export function limitRows(limits: Limit[], nowMs: number): LimitRow[] {
  const rows: LimitRow[] = [];
  for (const agent of ['claude', 'codex'] as const) for (const window of ['five_hour', 'weekly'] as const) {
    const l = limits.find(v => v.agent === agent && v.window === window);
    const ok = l != null && Number.isFinite(l.used_pct);
    rows.push({ agent, window, label: `${agent === 'claude' ? 'Claude' : 'Codex'} · ${window === 'five_hour' ? '5h' : 'tydzień'}`,
      pct: ok ? clampPct(l!.used_pct) : null, reset: ok ? formatReset(l!.resets_at, nowMs) : '' });
  }
  return rows;
}

const basename = (p: string) => p.split(/[\\/]/).filter(Boolean).pop() ?? '';

export function sessionSubtitle(s: Session): string {
  return [AGENT[s.agent] ?? s.agent, ORIGIN[s.origin] ?? s.origin, basename(s.cwd)].filter(Boolean).join(' · ');
}

export function progressText(s: Session): string | null {
  return progressFraction(s.progress) == null || !s.progress ? null : `${s.progress.done}/${s.progress.total}`;
}

export function contextText(s: Session): string | null {
  return s.context && s.context.max > 0 ? `${Math.round(clampPct(s.context.used * 100 / s.context.max))}%` : null;
}
```

- [ ] **Step 6: `App.tsx`, `PetCanvas.tsx`, `main.tsx`, `panel.html`**

`App.tsx` eksportuje:
- `PanelView` (czysty widok z propsami `snap`, `nowMs`, `status`, `focusId`, `onJump`);
- domyślnie `App`, który pobiera migawkę (`invoke('snapshot')` + `listen('pets://snapshot')`), słucha `panel://focus` (przewija do wiersza i podświetla go przez 2 s) i obsługuje „Przejdź”: `invoke<JumpResult>('jump', { sessionId })`, pokazuje `detail` w pasku statusu, a przy metodzie innej niż `clipboard` i `none` chowa panel przez `invoke('panel_hide')`.

```tsx
import { useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { actionLabel, formatAgo, petTooltip } from '../tooltip/text';
import type { Snapshot } from '../types';
import { contextText, limitRows, panelSessions, progressText, sessionSubtitle } from './model';
import { PetCanvas } from './PetCanvas';

interface JumpResult { method: string; detail: string }
interface ViewProps { snap: Snapshot; nowMs: number; status: string | null; focusId: string | null; onJump: (id: string) => void }

export function PanelView({ snap, nowMs, status, focusId, onJump }: ViewProps) {
  const sessions = panelSessions(snap.sessions);
  return (
    <div className="panel">
      <header><h1>Agent Pets</h1><span className="count">{sessions.length} sesji</span></header>
      <section className="limits" aria-label="Limity">
        {limitRows(snap.limits, nowMs).map(r => (
          <div className="limit" key={`${r.agent}-${r.window}`}>
            <span className="label">{r.label}</span>
            {r.pct == null ? <span className="none">brak danych</span> : <>
              <span className={`bar ${r.agent}`}><i style={{ width: `${r.pct}%` }} className={r.pct >= 90 ? 'hot' : ''} /></span>
              <span className="pct">{Math.round(r.pct)}%</span>
              <span className="reset">{r.reset}</span>
            </>}
          </div>
        ))}
      </section>
      <section className="sessions" aria-label="Sesje">
        {sessions.length === 0 && <p className="empty">Brak aktywnych sesji</p>}
        {sessions.map(s => (
          <article key={s.id} id={`s-${s.id}`} className={`session ${s.state}${focusId === s.id ? ' focus' : ''}`}>
            <PetCanvas session={s} />
            <div className="info">
              <div className="title">{petTooltip(s, nowMs).title}</div>
              <div className="sub">{sessionSubtitle(s)}</div>
              <div className="meta">
                <span className="state">{actionLabel(s)}</span>
                {progressText(s) && <span>Zadania {progressText(s)}</span>}
                {contextText(s) && <span>Kontekst {contextText(s)}</span>}
                <span>{formatAgo(nowMs - s.last_activity)}</span>
              </div>
            </div>
            <button type="button" onClick={() => onJump(s.id)}>Przejdź</button>
          </article>
        ))}
      </section>
      {status && <footer className="status" role="status">{status}</footer>}
    </div>
  );
}

export default function App() {
  const [snap, setSnap] = useState<Snapshot>({ sessions: [], limits: [], now: 0 });
  const [offset, setOffset] = useState(0);
  const [status, setStatus] = useState<string | null>(null);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [, tick] = useState(0);
  const take = useRef((s: Snapshot) => { setSnap(s); setOffset(s.now - Date.now()); });
  useEffect(() => {
    const un = [listen<Snapshot>('pets://snapshot', e => take.current(e.payload)),
      listen<string>('panel://focus', e => { setFocusId(e.payload); document.getElementById(`s-${e.payload}`)?.scrollIntoView({ block: 'nearest' });
        setTimeout(() => setFocusId(null), 2000); })];
    void invoke<Snapshot>('snapshot').then(s => take.current(s));
    const t = setInterval(() => tick(n => n + 1), 1000);
    return () => { clearInterval(t); un.forEach(p => void p.then(f => f())); };
  }, []);
  const onJump = async (sessionId: string) => {
    const r = await invoke<JumpResult>('jump', { sessionId });
    setStatus(r.detail);
    if (r.method !== 'clipboard' && r.method !== 'none') { setStatus(null); void invoke('panel_hide'); }
  };
  return <PanelView snap={snap} nowMs={Date.now() + offset} status={status} focusId={focusId} onJump={onJump} />;
}
```

`PetCanvas.tsx`: płótno 96×72 CSS px, własny `Pet` w `useRef` (`createPet(skinFor(s.agent), sceneFor(s))`), zmiana sceny przez `setScene` przy zmianie `sceneFor(s)`, pętla `requestAnimationFrame` ograniczona do 30 kl./s, `drawPet(x, pet, 34, 64, 0.55, t)`, a `pen.font` z `getComputedStyle(document.body)`. W środowisku bez `canvas.getContext` (test `renderToString`) nic nie rysuje, bo `useEffect` nie działa przy renderze na serwerze.

`main.tsx`:

```tsx
import { createRoot } from 'react-dom/client';
import App from './App';
createRoot(document.getElementById('root')!).render(<App />);
```

`panel.html`: pełna strona z tokenami kolorów jak `tooltip.html` (jasny i ciemny motyw), tło panelu `var(--bg)` z zaokrągleniem 12 px, `<div id="root">` i skrypt `/src/panel/main.tsx`. Style:
- `.limit` to siatka 4 kolumn;
- `.bar` ma 6 px wysokości z kolorem agenta (`#D97757` / `#5DCAA5`), a `.hot` jest czerwone `#E24B4A`;
- `.session` to siatka `96px 1fr auto`, przycisk „Przejdź” w stylu przycisku Windows 11;
- `.focus` podświetla wiersz;
- lista sesji przewija się w panelu (`overflow:auto`).

- [ ] **Step 7: Klik w scenie otwiera panel**

- `bridge.ts`: w `Bridge` dodaj `openPanel(focus?: string): void`. `tauriBridge` robi `invoke('panel_open', { focus: focus ?? null })`, a `fakeBridge` robi `console.info`.
- `stage.ts`: w `bridge.onPointer` dla `p.kind === 'click'` policz `hitTest(out, p.x, p.y, lay.height_css)`. Dla zwierzaka wywołaj `bridge.openPanel(t.id)`, dla limitów i „+N” `bridge.openPanel()`.

- [ ] **Step 8: Testy**

Run: `pnpm test; pnpm typecheck; cargo test --workspace`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add app
git commit -m "feat(panel): React panel with sessions, limits and Przejdź; click on the stage opens it"
```

---

### Task 7: Weryfikacja, dokumentacja, przegląd

**Files:**
- Create: `docs/phase3-verification.md`
- Modify: `README.md`

- [ ] **Step 1: Ręczna checklista** (z działającym `pnpm tauri dev`, bez przełączania gałęzi w trakcie)

| # | Sprawdzenie |
|---|---|
| 1 | Klik w zwierzaka otwiera panel z podświetloną jego sesją; klik w „+N” i limity otwiera panel |
| 2 | Lewy klik ikony w trayu otwiera i zamyka panel; drugi klik przy otwartym panelu go zamyka (nie mruga) |
| 3 | Klik poza panelem go chowa |
| 4 | „Przejdź” dla sesji z aplikacji Claude otwiera tę sesję w aplikacji (`claude://code/continue`) |
| 5 | „Przejdź” dla sesji CLI w Windows Terminal przełącza na okno terminala |
| 6 | „Przejdź” dla sesji Codexa otwiera wątek w aplikacji Codex |
| 7 | Sesja z zamkniętym terminalem: otwiera się nowy terminal z `claude --resume` |
| 8 | Toast „czeka na Ciebie” po 15 s bez fokusu; przycisk „Przejdź” działa; brak toastów przy starcie aplikacji |
| 9 | Toast „skończył” po turze > 2 min |
| 10 | Limity w panelu: Codex z rolloutów; Claude po instalacji przelotki i uruchomieniu sesji `claude` w terminalu; „brak danych” zamiast 0% |
| 11 | Statusline użytkownika (jeśli był ustawiony) wygląda tak samo z przelotką |
| 12 | Panel w motywie jasnym i ciemnym Windows |

- [ ] **Step 2: README**

Opisz:
- panel i klik;
- „Przejdź” i jego łańcuch;
- powiadomienia i jak je wyłączyć w ustawieniach Windows (ustawienia w aplikacji w fazie 5);
- przelotkę statusline (`pets-cli install-statusline`, działa tylko w CLI) i jak ją cofnąć.

Tabela „What works now”: panel, „Przejdź”, powiadomienia i limity Claude'a na ✅. Roadmap: faza 3 przekreślona.

- [ ] **Step 3: Pełna weryfikacja i commit**

Run: `cargo test --workspace; pnpm --dir app test; pnpm --dir app typecheck; pnpm --dir app build`

```bash
git add docs/phase3-verification.md README.md
git commit -m "docs: phase 3 verification checklist and README for the panel, jump and notifications"
```
