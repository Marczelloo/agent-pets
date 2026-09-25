# Agent Pets: faza 5 (instalator, kreator, ustawienia, autostart, tryb oszczędny). Plan implementacji

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Cel:** publiczny instalator Windows; po instalacji kreator pierwszego uruchomienia (aplikacje, zgoda na limity Claude'a, powiadomienia i autostart, skórka); okno ustawień z zakładkami; autostart; tryb oszczędny na baterii; odinstalowanie usuwające integracje.

**Architektura:**
- **Rdzeń:** `settings` (plik `~/.agent-pets/settings.json`, czysty, testowany), `integrations` (Claude Code, Codex, Agent Router: wykrycie, stan, włączenie, wyłączenie), filtr aplikacji w `Runtime`.
- **Aplikacja (Rust):** stan ustawień rozsyłany zdarzeniem `pets://settings`; okno `settings` (kreator albo zakładki); tray „Ustawienia”; jedna instancja; autostart w `HKCU\...\Run`; stan zasilania → `pets://power`; `--uninstall-integrations`.
- **UI:** `settings.html` z kreatorem i zakładkami w React; scena i panel reagują na skórkę, limit zwierzaków i tryb oszczędny.
- **Wydanie:** NSIS dla bieżącego użytkownika, `hook.exe` w zasobach, hook odinstalowania, ikona, GitHub Actions, README.

**Stos:** jak w fazie 4, plus `tauri-plugin-single-instance` 2.

**Specyfikacja:** `docs/superpowers/specs/2026-09-25-agent-pets-phase5-design.md` (wiąże), tło: `2026-09-24-agent-pets-design.md`.

## Global Constraints

- Wszystko z faz 2–4 obowiązuje (testy przed commitem, stopka commita, teksty przez JSX/`textContent`, pliki współdzielone w `~/.agent-pets`, okno pokazane przez Win32 chowane przez Win32).
- **Zgoda na sieć:** `claude_plan_usage` domyślnie `false`; wątek limitów Anthropic nie wysyła nic bez zgody.
- **Pliki użytkownika:** zapisy w `~/.claude/settings.json` zawsze z kopią (`hooks_install::edit_file`); uszkodzony plik nie jest nadpisywany.
- **Prywatność:** raport diagnostyczny bez tokenów, treści sesji i tytułów sesji.
- **Push i publikacja wydania** tylko po zgodzie użytkownika; skan prywatnych danych i push w osobnych krokach.
- **Ikona:** generuje Codex (`codex_generate_image`); przed użyciem pokazać użytkownikowi i poczekać na akceptację.
- Nie przełączać gałęzi z plikami innymi niż `main` podczas działającego `pnpm tauri dev` użytkownika (gałąź tworzona przez `checkout -b`, scalanie przez fast-forward bez zmiany plików).

## Review Focus

1. **Hooki już zainstalowane** (maszyna dewelopera, ponowny kreator): `enable` jest idempotentne, bez duplikatów wpisów. Test: task 2.
2. **Uszkodzony `~/.agent-pets/settings.json`:** wartości domyślne, komunikat w Diagnostyce, plik nienadpisany do pierwszej zmiany w UI. Test: task 1.
3. **Wyłączenie aplikacji w trakcie pracy:** jej zwierzaki i limity znikają od razu, zdarzenia są ignorowane; po włączeniu wracają przy następnych zdarzeniach. Test: task 3.
4. **Odinstalowanie przy zainstalowanej przelotce statusline i cudzych hookach:** przywrócony oryginalny `statusLine`, usunięte tylko nasze hooki. Test: task 2.
5. **Drugie uruchomienie aplikacji:** nie startuje drugi rdzeń (nie nadpisuje `endpoint.json`), otwiera się okno ustawień. Sprawdzenie ręczne w tasku 8.

---

## Struktura plików

```
crates/pets-core/src/settings.rs          NOWY: Settings, load/save, domyślne, nieznane pola
crates/pets-core/src/integrations.rs      NOWY: AppId, Detected, Status, detect/status/enable/disable, uninstall_all
crates/pets-core/src/hooks_install.rs     + is_installed(settings)
crates/pets-core/src/runtime.rs           + Apps filtr, set_apps, last_seen dla diagnostyki
crates/pets-core/src/store.rs             + retain_sessions(pred)
app/src-tauri/src/settings.rs             NOWY: stan, komendy settings_*, integrations_*, diagnostics, okno ustawień
app/src-tauri/src/system.rs               NOWY: autostart (Run), zasilanie (GetSystemPowerStatus), decide_power_saving
app/src-tauri/src/lib.rs, core.rs, notify/mod.rs, usage.rs, tray.rs, panel.rs, main.rs
app/settings.html, app/src/settings/{main.tsx, Wizard.tsx, SettingsView.tsx, model.ts, model.test.ts, views.test.tsx}
app/src/stage/stage.ts, bridge.ts, layout.ts (maxPets z ustawień), app/src/panel/App.tsx (⚙), PetCanvas.tsx (fps)
app/src-tauri/tauri.conf.json, capabilities/default.json, nsis/hooks.nsh, icons/*
.github/workflows/release.yml, README.md, docs/phase5-verification.md
```

---

### Task 1: Ustawienia w rdzeniu

**Files:** Create `crates/pets-core/src/settings.rs`; Modify `lib.rs`.

**Interfaces (Produces):**
- `settings::Settings { version: u32, apps: Apps, claude_statusline: bool, claude_plan_usage: bool, notifications: Notifications, pets: Pets, power_saving: PowerSaving, autostart: bool, extra: serde_json::Map }` (Serialize/Deserialize; `#[serde(default)]`; `extra` przez `#[serde(flatten)]` zachowuje nieznane pola);
- `Apps { claude_code: bool, codex: bool, agent_router: bool }` (domyślnie `true`), `Notifications { needs_you, done, limits: bool }` (`true`), `Pets { skin: Skin, max_visible: u8 }` (`Sketch`, 5), `enum Skin { Sketch, Clean }`, `enum PowerSaving { Auto, Always, Never }` (snake_case), `claude_plan_usage` domyślnie `false`, `autostart` domyślnie `true`;
- `settings::path(home) -> PathBuf` (`~/.agent-pets/settings.json`);
- `settings::load(path) -> Loaded { settings: Settings, first_run: bool, error: Option<String> }`: brak pliku → `first_run: true`; uszkodzony → domyślne, `first_run: false`, `error: Some(..)`;
- `settings::save(path, &Settings) -> io::Result<()>`: atomowo, `max_visible` przycięte do 1–8.

- [ ] **Testy:** domyślne wartości (w tym `claude_plan_usage == false`); plik z samym `{"version":1,"pets":{"skin":"clean"}}` → reszta domyślna, `skin == Clean`; nieznane pole `"future": 1` przetrwa `load`→`save`; `{bad` → `error` i plik bez zmian po `load`; brak pliku → `first_run`; `max_visible: 99` zapisane jako 8; zapis atomowy (brak `.tmp`).
- [ ] RED (`cargo test -p pets-core settings`), implementacja, GREEN, commit `feat(core): settings file with defaults, unknown-field preservation and safe load`.

### Task 2: Integracje

**Files:** Create `crates/pets-core/src/integrations.rs`; Modify `hooks_install.rs`, `lib.rs`.

**Interfaces (Produces):**
- `enum AppId { ClaudeCode, Codex, AgentRouter }` (snake_case, `ALL`);
- `Detected { found: bool, path: Option<String>, note: Option<String> }`, `Status { enabled_in_tool: bool, detail: String }` (dla Claude Code: czy hooki są w `settings.json`; dla pozostałych zawsze `true`, „nic do instalowania”);
- `detect(id, home) -> Detected` (Claude Code: `~/.claude` istnieje; Codex: `~/.codex`; Router: `~/.agent-router`);
- `status(id, home) -> Status`;
- `enable(id, home, hook_src: Option<&Path>) -> Result<String, String>` (Claude Code: kopiuje `hook_src` do `~/.agent-pets/hook.exe` tylko gdy zawartość różna albo brak; instaluje hooki; komunikat „Hooki zainstalowane. Uruchom ponownie otwarte sesje Claude Code.”; bez `hook_src` i bez istniejącego `hook.exe` → `Err`);
- `disable(id, home) -> Result<String, String>` (Claude Code: usuwa hooki i przelotkę statusline, przywraca oryginał);
- `uninstall_all(home, remove_data: bool) -> Vec<String>`: `disable` dla wszystkich; usuwa `~/.agent-pets/hook.exe` i `endpoint.json`; przy `remove_data` cały `~/.agent-pets`; zwraca listę wykonanych kroków;
- `hooks_install::is_installed(settings: &Value) -> bool`.

Ścieżki w `statusline_install` biorą `original_path()` z env albo domu; dla testów integracji podaj `AGENT_PETS_STATUSLINE_ORIGINAL` w katalogu tymczasowym albo dodaj wariant `*_in(home)`; wybierz wariant z parametrem `home` (bez zmiennych środowiskowych w testach równoległych) i zapisz ruling.

- [ ] **Testy** (tymczasowy katalog domowy): wykrycie po katalogach; `enable(ClaudeCode)` dwa razy → jeden zestaw hooków (Review Focus 1), `hook.exe` skopiowany, drugi raz niekopiowany (mtime bez zmian); `status` przed/po; `disable` zostawia cudzy hook w `settings.json`; `uninstall_all` przy zainstalowanej przelotce przywraca oryginalny `statusLine` (Review Focus 4) i usuwa `hook.exe`, `endpoint.json`, a `settings.json` widżetu zostaje; `remove_data` usuwa `~/.agent-pets`; uszkodzony `~/.claude/settings.json` → `Err` i plik bez zmian.
- [ ] RED, implementacja, GREEN, commit `feat(core): integrations for Claude Code, Codex and Agent Router (detect, status, enable, disable, uninstall)`.

### Task 3: Filtr aplikacji i diagnostyka w runtime

**Files:** Modify `crates/pets-core/src/runtime.rs`, `store.rs`.

**Interfaces (Produces):**
- `Runtime::set_apps(&mut self, apps: settings::Apps) -> bool` (usuwa ze store sesje i limity wyłączonych aplikacji; zwraca, czy coś się zmieniło);
- przynależność zdarzenia: `Source::Claude` → Claude Code, `Source::Codex` → Codex, `Source::Router` → Agent Router (także sesje z `origin == Router`); limity: `Agent::Claude` → Claude Code, `Agent::Codex` → Codex;
- `apply` odrzuca zdarzenia wyłączonych aplikacji; `poll_file` pomija pliki wyłączonych źródeł (bez parsowania); `on_hook` nic nie robi przy wyłączonym Claude Code; `status.json` nieczytany przy wyłączonym routerze;
- `Store::retain_sessions(pred)` i `Store::retain_limits_pub(pred)` (lub wspólna metoda) zwracające zmiany;
- `Runtime::last_seen() -> BTreeMap<&'static str, i64>` (`"claude_code"`, `"codex"`, `"agent_router"`, `"claude_usage"`): czas ostatniego zdarzenia z każdego źródła.
- [ ] **Testy:** zdarzenie Claude'a przy wyłączonym Claude Code nie tworzy sesji; `set_apps` z wyłączonym Codexem usuwa sesje Codexa i limity Codexa, a zostawia Claude'a (Review Focus 3); sesja routera znika po wyłączeniu routera, choć jest z rolloutu Codexa; `last_seen` aktualizowane.
- [ ] RED, implementacja, GREEN, commit `feat(core): turn apps off and on at runtime; last event per source for diagnostics`.

### Task 4: Ustawienia w aplikacji (Rust): stan, okno, tray, jedna instancja, odinstalowanie

**Files:** Create `app/src-tauri/src/settings.rs`; Modify `lib.rs`, `main.rs`, `tray.rs`, `panel.rs`, `Cargo.toml`, `capabilities/default.json`.

**Interfaces (Produces):**
- stan `settings::State(RwLock<Settings>)` + `first_run`, `load_error`;
- komendy: `settings_get() -> SettingsView { settings, first_run, load_error }`, `settings_set(settings) -> Result<(), String>` (zapis, `pets://settings` do wszystkich okien, zastosowanie skutków z tasku 5), `integrations_list() -> Vec<AppRow { id, detected, status, enabled }>`, `integration_set(id, on) -> Result<String, String>` (zasób `hook.exe` z `app.path().resource_dir()`, w dev: obok exe albo `target/release/hook.exe`), `wizard_finish(settings) -> Vec<String>` (zapis + enable/disable), `diagnostics() -> Diagnostics`, `settings_open()`;
- okno `settings` (`settings.html`, 760×560, dekoracje systemowe, jedno), otwierane: przy `first_run` na starcie, z traya, z panelu (⚙), przy drugim uruchomieniu aplikacji;
- `main.rs`: argument `--uninstall-integrations [--remove-data]` → `integrations::uninstall_all` + usunięcie autostartu i klucza AUMID, bez startu Tauri, kod 0;
- `tauri-plugin-single-instance`: drugie uruchomienie → `settings_open` w pierwszej instancji.
- [ ] **Testy:** czysta funkcja wyboru ścieżki `hook.exe` (zasób → obok exe → `target/release`) na atrapach ścieżek; `Diagnostics` bez pól z tokenem ani tytułami (test serializacji: brak kluczy `title`, `token`); reszta ręcznie w tasku 8.
- [ ] Implementacja, `cargo test --workspace`, commit `feat(app): settings state, settings window, tray entry, single instance, --uninstall-integrations`.

### Task 5: Skutki ustawień i tryb oszczędny (Rust)

**Files:** Create `app/src-tauri/src/system.rs`; Modify `core.rs`, `notify/mod.rs`, `notify/rules.rs`, `usage.rs`, `settings.rs`.

**Interfaces (Produces):**
- `core`: pętla na żywo odbiera nowe `Apps` kanałem i woła `Runtime::set_apps`; publikuje `Diagnostics` (port endpointu, `last_seen`);
- `notify`: `Rules::set_settings(rules::Settings)` z `Notifications`;
- `usage`: wątek czyta `claude_plan_usage` przed każdym zapytaniem (bez zgody: brak zapytania, brak czekania na start);
- `system::decide_power_saving(mode, on_battery, saver_on) -> bool` (czyste), `system::power_status() -> (bool, bool)` (`GetSystemPowerStatus`), wątek co 30 s emitujący `pets://power { saving }` przy zmianie; `system::set_autostart(on) -> io::Result<()>` (`HKCU\Software\Microsoft\Windows\CurrentVersion\Run`, wartość `Agent Pets` = `"<exe>"`), `system::autostart_enabled() -> bool`;
- rejestracja AUMID dostaje `IconUri` (ścieżka do `icon.png` w zasobach, gdy istnieje).
- [ ] **Testy:** `decide_power_saving` (tabela 3×2×2); reguły powiadomień po `set_settings` (wyłączony rodzaj milczy); `set_autostart` na kluczu testowym (parametr ścieżki klucza, `HKCU\Software\AgentPetsTest\Run`, sprzątany w teście).
- [ ] RED, implementacja, GREEN, commit `feat(app): settings take effect live (apps, notifications, plan usage consent, autostart); power saving from the power status`.

### Task 6: Okno ustawień i kreator (React)

**Files:** Create `app/settings.html`, `app/src/settings/{main.tsx, Wizard.tsx, SettingsView.tsx, model.ts, model.test.ts, views.test.tsx}`; Modify `vite.config.ts` (wejście `settings`), `types.ts` (`Settings`, `AppRow`, `Diagnostics`), `panel/App.tsx` (przycisk ⚙ → `settings_open`).

**Interfaces:** komendy z tasku 4; zdarzenie `pets://settings`.

- **Kreator** (spec 5): cztery kroki, „Wstecz/Dalej/Zakończ”; krok Aplikacje: wykryte z przełącznikiem (domyślnie włączone), niewykryte wyszarzone z podpowiedzią; krok Limity: tekst zgody (co, dokąd, po co) i przełącznik domyślnie wyłączony; krok Powiadomienia i autostart; krok Wygląd z podglądem (`PetCanvas` z sesją pokazową, skórka przez `pen.sketch`); „Zakończ” → `wizard_finish`, ekran wyniku z komunikatami.
- **Zakładki** (spec 6): Aplikacje, Zwierzaki, Powiadomienia, Limity, Ogólne, Diagnostyka („Skopiuj raport” → schowek przez `navigator.clipboard`, treść z `model.reportText(diag)`).
- `model.ts`: `wizardSteps`, `defaultAppChoice(rows)`, `reportText(diag)`, `clampMaxVisible`.
- Styl: tokeny jak w `panel.html` (jasny i ciemny), układ Ustawień Windows 11 (lewa kolumna zakładek).
- [ ] **Testy** (`renderToString`): kreator zaczyna od kroku Aplikacje; niewykryta aplikacja wyszarzona; krok Limity ma przełącznik wyłączony i nazwę `api.anthropic.com`; zakładki renderują się z ustawień; `reportText` nie zawiera tokenów ani tytułów; ⚙ w panelu.
- [ ] RED, implementacja, GREEN, podgląd w przeglądarce (tryb bez Tauri z danymi pokazowymi, oba motywy), commit `feat(ui): first-run wizard and settings window`.

### Task 7: Scena i panel według ustawień

**Files:** Modify `app/src/stage/stage.ts`, `bridge.ts`, `app/src/panel/PetCanvas.tsx`, `App.tsx`.

- `bridge.onSettings`, `bridge.onPower`; scena: `layout({... maxPets: settings.pets.max_visible})`, `pen.sketch = skin === 'sketch'`, w trybie oszczędnym FPS 10 i brak `stepPet` dla `idle`/`sleep`/`done`; panel: ta sama skórka i limit FPS.
- Czysta funkcja `frameBudget(saving) -> { fps, animate(state) }` w `stage/power.ts` z testem.
- [ ] RED (`power.test.ts`), implementacja, GREEN, podgląd `dev.html`, commit `feat(ui): skin, pet limit and power saving applied to the stage and panel`.

### Task 8: Instalator, ikona, wydanie, weryfikacja

**Files:** Modify `tauri.conf.json` (`bundle.active`, `targets: ["nsis"]`, `nsis.installMode: "currentUser"`, `nsis.installerHooks: "nsis/hooks.nsh"`, `resources`: `hook.exe`, wersja 0.5.0), `package.json` (skrypt `build:hook`), Create `app/src-tauri/nsis/hooks.nsh`, `.github/workflows/release.yml`, `docs/phase5-verification.md`; Modify `README.md`, ikony.

- [ ] **Ikona:** `codex_generate_image` (prompt: głowy Clawda (pomarańczowy, kanciasty) i Kodeka (biały robot z turkusowymi oczami) w stylu prototypu, nieprzezroczyste tło zaokrąglonego kwadratu, czytelne w 16 px); pokaż użytkownikowi, po akceptacji `pnpm tauri icon <plik>`.
- [ ] **`hooks.nsh`:** `!macro NSIS_HOOK_PREUNINSTALL` → `ExecWait '"$INSTDIR\agent-pets.exe" --uninstall-integrations'` (z `--remove-data`, gdy zaznaczono usuwanie danych aplikacji).
- [ ] **Build:** `beforeBuildCommand` buduje `pets-hook` w release i kopiuje `hook.exe` do `app/src-tauri/resources/`; `pnpm tauri build` → instalator w `target/release/bundle/nsis/`.
- [ ] **CI:** `release.yml` na tag `v*`, `windows-latest`: Rust, Node 22, pnpm, `cargo test --workspace`, `pnpm --dir app test`, `tauri-apps/tauri-action` ze szkicem wydania.
- [ ] **README:** „Install” (pobranie, SmartScreen, kreator, odinstalowanie), obecna instrukcja jako „Build from source”, tabela „What works now”, roadmapa (faza 5 przekreślona).
- [ ] **Weryfikacja na żywo** (za zgodą użytkownika, bo zmienia instalację na jego maszynie): zamknij `pnpm tauri dev`, zainstaluj z instalatora, kreator, ustawienia bez restartu, druga instancja → okno ustawień, autostart po ponownym zalogowaniu (użytkownik), tryb oszczędny przez „zawsze”, odinstalowanie (hooki usunięte, kopia `settings.json` Claude'a), ponowna instalacja z włączeniem Claude Code; wyniki w `docs/phase5-verification.md`.
- [ ] Pełne testy, commit `feat: NSIS installer, app icon, release workflow; docs for install and phase 5 checks`.
