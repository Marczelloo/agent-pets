# Agent Pets: faza 4 (plik stanu zadań Agent Routera). Plan implementacji

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Cel:** zwierzak zadania Agent Routera ma tytuł zadania, znaczek routera i „zdrowie” zadania (aktywne, cisza, utknęło, zablokowane), a nieudane zadanie pokazuje błąd. Router zapisuje w tym celu mały publiczny plik stanu, a widżet go czyta.

**Architektura:**
- **Router** (repo `Marczelloo/agent-router-mcp`, lokalnie obok tego repo: `../Agent Router MCP`): przy każdym zapisie stanu wewnętrznego (`TaskStore.flush`) zapisuje też atomowo `~/.agent-router/status.json`, wyliczony czystą funkcją `publicStatus(tasks, now, stallSeconds)`.
- **Rdzeń** (`pets-core`): nowy moduł `router` z parserem pliku (plik → zdarzenia `Meta`/`Error` dla sesji o id = `threadId`) i odpytywaniem po mtime co 1 s; `Session.router_task` w modelu.
- **UI:** „zdrowie” liczone z czasu ostatniej aktywności w chwili rysowania (`routerHealth`), linia w tooltipie i panelu, znaczek routera przy zwierzaku w pasku.

**Stos:** jak w fazie 3; po stronie routera TypeScript, Node 20, własny zestaw testów `test/run-tests.mjs`.

**Specyfikacja:** `docs/superpowers/specs/2026-09-24-agent-pets-design.md`, sekcje 4 (`routerTask`), 5.1 (`error` z zadania `failed`), 6.3, 6.4, 11 (test zapisu atomowego), 13 (faza 4).

## Ustalenia sprzed planu (2026-09-25, na tej maszynie)

- **`~/.agent-router/tasks.json` już istnieje i jest zajęty.** To wewnętrzny stan routera (`{ tasks: TaskRecord[] }`, bez wersji): 1,2 MB, pełne diffy, komendy, wiadomości agenta, przepisywany co 250 ms w trakcie pracy (`TaskStore.persist` → `flush`), scalany między procesami routera z różnych sesji Claude Code.
  - **Decyzja:** publiczny plik ze specyfikacji dostaje nazwę `status.json` w tym samym katalogu. Czytanie `tasks.json` z widżetu byłoby ciężkie i wiązałoby widżet z wewnętrznym formatem.
- **„Zdrowie” liczy dziś `Router.healthOf`:** `blockedOn` → `blocked`; cisza > `stallSeconds` (domyślnie 180 s) → `stalled`; > 30 s → `quiet`; inaczej `active`. Plik zapisuje się tylko przy zmianach, więc zdrowie zapisane w pliku by się starzało.
  - **Decyzja:** plik zawiera `lastActivityAt`, `blocked` i `stallSeconds`, a zdrowie liczy konsument w chwili wyświetlania.
- **Sesje routera widżet już widzi:** rollouty z `originator: "agent-router"` mają `Origin::Router`, a id sesji to id wątku (`threadId`). Zdarzenia z `status.json` trafiają więc do tej samej sesji i nie ma dwóch zwierzaków na jedno zadanie.
- **Repo routera** ma niezacommitowane zmiany użytkownika w `CLAUDE.md` i `README.md`. Nie ruszamy ich i nie dodajemy do commitów. Pracujemy na gałęzi `pets-status-file`.
- **Po zmianie w routerze:** `npm run build`, a działający serwer MCP trzeba przeładować (Claude Code uruchamia `dist/index.js`). Przeładowanie robi użytkownik.

## Global Constraints

- Wszystko z faz 2–3 nadal obowiązuje (stopka commita, testy przed commitem, `textContent`/JSX dla tekstów, brak prywatnych danych w commitach).
- **Router działa tak samo bez widżetu** (spec 6.3): błąd zapisu `status.json` jest logowany i ignorowany, nigdy nie psuje zapisu stanu wewnętrznego ani zadania.
- **Zapis atomowy:** plik tymczasowy z PID procesu w nazwie, potem `rename` (jak `tasks.json`).
- **Prywatność i rozmiar:** `status.json` nie zawiera treści zadania poza tytułem (pierwsza niepusta linia `originalTask`, do 80 znaków), ani diffów, komend, wiadomości.
- **Zakres pliku:** zadania `running`/`pending` zawsze, zakończone tylko z `updatedAt` z ostatnich 2 h; najwyżej 50 zadań, od najnowszych.
- **Format v1** (`version: 1`); widżet ignoruje plik o innej wersji (brak danych o zadaniach, nic się nie psuje).
- **Push do `Marczelloo/agent-router-mcp`** i scalenie gałęzi routera tylko po zgodzie użytkownika.

## Review Focus

1. **Dwa procesy routera naraz** (dwie sesje Claude Code): oba zapisują `status.json`. Oczekiwane: plik zawiera zadania obu (bo powstaje ze scalonego zbioru), żaden zapis nie zostawia `.tmp`. Test: task 1 (istniejący scenariusz „shared state” rozszerzony o `status.json`).
2. **Zadanie bez `threadId`** (np. `pending` przed startem wątku). Oczekiwane: jest w pliku, widżet je pomija (brak sesji do połączenia), nic nie pada. Test: task 2.
3. **Uszkodzony, pusty albo z innej wersji `status.json`** (zapis w trakcie, przyszła wersja). Oczekiwane: brak zdarzeń, poprzedni stan zostaje. Test: task 2.
4. **Stare zakończone zadanie** (`failed` sprzed godziny) przy starcie widżetu. Oczekiwane: nie pojawia się zwierzak z błędem (sesja dawno cicha znika bez machania, zasada z fazy 3). Test: task 3.
5. **Zadanie cicho utknęło** (brak zapisów pliku przez 5 min). Oczekiwane: tooltip i panel pokazują „utknęło”, choć plik się nie zmienił. Test: task 4 (`routerHealth` liczone z czasu).

---

## Struktura plików

```
Agent Router MCP/src/status.ts          NOWY: publicStatus(tasks, now, stallSeconds) i writeStatus(file, status)
Agent Router MCP/src/config.ts          + statusFile (AGENT_ROUTER_STATUS_FILE, domyślnie obok stateFile)
Agent Router MCP/src/tasks.ts           flush() zapisuje też status.json
Agent Router MCP/test/run-tests.mjs     + testy publicStatus i pliku po zadaniu
crates/pets-core/src/model.rs           + RouterTask, Session.router_task, EventData.router_task
crates/pets-core/src/store.rs           merge router_task
crates/pets-core/src/router.rs          NOWY: to_events(bytes) i Poller
crates/pets-core/src/runtime.rs         + RuntimeConfig.router_status, odpytywanie
crates/pets-core/tests/fixtures/router/status.json   NOWY: próbka (wartości syntetyczne)
app/src/types.ts                        + RouterTask
app/src/stage/router.ts                 NOWY: routerHealth, etykiety
app/src/stage/router.test.ts            NOWY
app/src/tooltip/text.ts, app/src/panel/model.ts, App.tsx   + linia zadania routera
app/src/stage/hud.ts, stage.ts          + znaczek routera przy zwierzaku
docs/phase4-verification.md, README.md, spec (6.3: nazwa pliku)
```

---

### Task 1: Router zapisuje `status.json`

**Files:** Create `src/status.ts`; Modify `src/config.ts`, `src/tasks.ts`, `test/run-tests.mjs` (repo routera).

**Interfaces:**
- Produces: format pliku v1 (poniżej), czytany w tasku 2.

```json
{
  "version": 1,
  "updatedAt": "2026-09-25T12:00:00.000Z",
  "stallSeconds": 180,
  "tasks": [
    { "taskId": "t_1", "threadId": "01a0…", "kind": "delegation", "title": "Count Rust files",
      "status": "running", "model": "gpt-6-sol", "workingDirectory": "C:\\work\\p",
      "startedAt": "…", "updatedAt": "…", "lastActivityAt": "…", "blocked": false }
  ]
}
```

- [ ] **Step 1: Testy** (w `test/run-tests.mjs`, nowa sekcja przed podsumowaniem; import czystej funkcji z `dist/status.js`):
  - `publicStatus` na trzech rekordach (running sprzed 3 h, completed sprzed 1 h, failed sprzed 3 h) zwraca running i completed, bez failed; `version === 1`; `stallSeconds` przekazane dalej.
  - tytuł to pierwsza niepusta linia `originalTask` przycięta do 80 znaków; w wyniku nie ma kluczy `originalTask`, `diff`, `commands`, `agentMessages`.
  - `blocked === true` dla rekordu z `blockedOn`.
  - limit 50 zadań, od najnowszego `createdAt`.
  - e2e: po scenariuszu `success` obok pliku stanu leży `status.json` z zadaniem `completed`, które ma `threadId`, i nie ma plików `.tmp`.
  - e2e (Review Focus 1): w scenariuszu z dwoma procesami na wspólnym pliku stanu `status.json` zawiera zadania obu.
- [ ] **Step 2:** `npm run build && npm test`. Expected: nowe testy FAIL (brak `dist/status.js`), stare PASS.
- [ ] **Step 3: Implementacja**
  - `config.ts`: `statusFile: process.env.AGENT_ROUTER_STATUS_FILE ?? path.join(path.dirname(stateFile), "status.json")` (w testach obok tymczasowego pliku stanu).
  - `status.ts`:

```ts
import fs from "node:fs";
import path from "node:path";
import type { TaskRecord } from "./tasks.js";

const RECENT_MS = 2 * 60 * 60 * 1000;
const MAX_TASKS = 50;

export interface PublicTask {
  taskId: string; threadId: string | null; kind: string; title: string; status: string;
  model: string | null; workingDirectory: string; startedAt: string | null; updatedAt: string;
  lastActivityAt: string | null; blocked: boolean;
}
export interface PublicStatus { version: 1; updatedAt: string; stallSeconds: number; tasks: PublicTask[] }

export function titleOf(text: string): string {
  const line = text.split(/\r?\n/).map((l) => l.trim()).find((l) => l.length > 0) ?? "";
  return [...line].length <= 80 ? line : [...line].slice(0, 79).join("") + "…";
}

/** Mały, publiczny obraz zadań dla innych programów (np. Agent Pets). Bez treści zadań poza tytułem. */
export function publicStatus(tasks: TaskRecord[], now: number, stallSeconds: number): PublicStatus {
  const live = (t: TaskRecord) => t.status === "running" || t.status === "pending";
  const picked = tasks
    .filter((t) => live(t) || now - Date.parse(t.updatedAt) <= RECENT_MS)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, MAX_TASKS);
  return {
    version: 1, updatedAt: new Date(now).toISOString(), stallSeconds,
    tasks: picked.map((t) => ({
      taskId: t.taskId, threadId: t.threadId, kind: t.kind, title: titleOf(t.originalTask), status: t.status,
      model: t.model, workingDirectory: t.workingDirectory, startedAt: t.startedAt, updatedAt: t.updatedAt,
      lastActivityAt: t.lastActivityAt, blocked: t.blockedOn != null,
    })),
  };
}

/** Zapis atomowy; plik tymczasowy z PID, bo kilka procesów routera zapisuje ten sam plik. */
export function writeStatus(file: string, status: PublicStatus): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(status), "utf8");
  fs.renameSync(tmp, file);
}
```

  - `tasks.ts` w `flush()`, po `renameSync` stanu wewnętrznego, w osobnym `try` (błąd statusu nie psuje stanu):

```ts
      try {
        writeStatus(config.statusFile, publicStatus(tasks, Date.now(), config.stallSeconds));
      } catch (err) {
        debugLog("could not write the public status file:", (err as Error).message);
      }
```

  Sprawdź, czy `TaskRecord` ma `startedAt: string | null` i `model: string | null`; dopasuj typy do rzeczywistych.
- [ ] **Step 4:** `npm run build && npm test`. Expected: PASS wszystkie.
- [ ] **Step 5: Commit** (w repo routera, na gałęzi `pets-status-file`, bez `CLAUDE.md`/`README.md` użytkownika):

```bash
git checkout -b pets-status-file
git add src/status.ts src/config.ts src/tasks.ts test/run-tests.mjs
git commit -m "Write a small public status file (~/.agent-router/status.json) for other tools such as Agent Pets"
```

  Dopisz akapit do `CHANGELOG.md` (sekcja Unreleased) w tym samym commicie.

---

### Task 2: Rdzeń czyta `status.json`

**Files:** Create `crates/pets-core/src/router.rs`, `tests/fixtures/router/status.json`; Modify `model.rs`, `store.rs`, `lib.rs`.

**Interfaces:**
- Consumes: format v1 z tasku 1.
- Produces:
  - `model::RouterTask { task_id: String, status: String, last_activity_at: Option<i64>, blocked: bool, stall_ms: i64 }` (Serialize/Deserialize, snake_case);
  - `Session.router_task: Option<RouterTask>`, `EventData.router_task: Option<RouterTask>`;
  - `router::FILE = "status.json"`, `router::to_events(bytes: &[u8]) -> Vec<Event>`, `router::Poller::new(path)`, `Poller::poll(now) -> Vec<Event>` (co `POLL_MS = 1000`, czyta tylko przy zmianie mtime).

**Mapowanie** (dla każdego zadania z `threadId`):
- `Meta`, `source: Router`, `session_id = threadId`, `ts = updatedAt`, `data.title = title` (niepusty), `data.origin = Router`, `data.cwd = workingDirectory`, `data.router_task`;
- `status` `failed` albo `quota_exhausted`: dodatkowo `Error` z `ts = updatedAt` (spec 5.1);
- pozostałe statusy nie zmieniają stanu (stan prowadzi rollout).

- [ ] **Step 1: Testy** (`router.rs`): próbka → dwa zadania z `threadId` dają `Meta` z tytułem, `origin`, `cwd` i `router_task` (`last_activity_at` w ms, `stall_ms = stallSeconds * 1000`); `failed` daje też `Error`; zadanie bez `threadId` pominięte; `version: 2`, pusty plik, `{bad` → pusta lista; `Poller` czyta raz na zmianę mtime i nie częściej niż co 1 s. W `store.rs`: `merge` przepisuje `router_task`.
- [ ] **Step 2:** `cargo test -p pets-core router` → FAIL (brak modułu).
- [ ] **Step 3: Implementacja** wg mapowania; `rfc3339_ms` dla dat. `merge` w `store.rs`: `if d.router_task.is_some() { s.router_task = d.router_task.clone(); }`. `new_session` ustawia `router_task: None`. Serializacja sesji w aplikacji (`core::snapshot_of`) przenosi pole bez zmian.
- [ ] **Step 4:** `cargo test --workspace` → PASS (w tym test serializacji migawki z `router_task: null`).
- [ ] **Step 5: Commit** `feat(core): Agent Router task status (title, health inputs, failed → error) from ~/.agent-router/status.json`.

---

### Task 3: Odpytywanie w runtime i odtworzenie po starcie

**Files:** Modify `crates/pets-core/src/runtime.rs`.

- `RuntimeConfig.router_status: Option<PathBuf>` (w `from_env`: `~/.agent-router/status.json`; w testach katalog tymczasowy).
- `Runtime::start`: jedno `poll` przed taktem startowym (zadania trafiają do pierwszej migawki); `step`: `poll(now)` co krok (sam `Poller` pilnuje 1 s).
- [ ] **Step 1: Testy** (`runtime.rs`):
  - plik z zadaniem `running`, `updatedAt` = teraz, `threadId` = id świeżego rolloutu (`fresh(...)`) → po `start` sesja ma `origin: Router`, tytuł zadania i `router_task`;
  - Review Focus 4: plik z zadaniem `failed` sprzed 2 h i bez rolloutu → po `start` brak sesji.
- [ ] **Step 2:** FAIL; **Step 3:** implementacja; **Step 4:** `cargo test --workspace` PASS.
- [ ] **Step 5: Commit** `feat(core): poll the Agent Router status file and rehydrate router tasks at startup`.

---

### Task 4: Zdrowie zadania i znaczek routera w UI

**Files:** Create `app/src/stage/router.ts`, `router.test.ts`; Modify `types.ts`, `tooltip/text.ts`, `panel/model.ts`, `panel/App.tsx`, `stage/hud.ts`, `stage/stage.ts`, `stage/demo.ts`.

**Interfaces:**
- `types.ts`: `interface RouterTask { task_id: string; status: string; last_activity_at: number | null; blocked: boolean; stall_ms: number }`, `Session.router_task: RouterTask | null`.
- `router.ts`:
  - `type RouterHealth = 'active' | 'quiet' | 'stalled' | 'blocked'`;
  - `routerHealth(rt, nowMs): RouterHealth` (jak `Router.healthOf`: `blocked` → `blocked`; cisza > `stall_ms` → `stalled`; > 30 s → `quiet`; inaczej `active`; `last_activity_at == null` → `active`);
  - `routerLine(rt, nowMs): string | null`: dla `running`/`pending` „Zadanie routera: aktywne | cisza | utknęło | zablokowane”; dla innych statusów „Zadanie routera: zakończone | nieudane | przerwane | brak limitu”.
- [ ] **Step 1: Testy** (`router.test.ts`): wszystkie cztery stany zdrowia na granicach (30 s, `stall_ms`), Review Focus 5 (plik niezmieniony, czas płynie → `stalled`), `blocked` wygrywa, etykiety statusów; `petTooltip` i `PanelView` pokazują linię routera dla sesji z `router_task` i nie pokazują dla zwykłej.
- [ ] **Step 2:** `pnpm test` → FAIL.
- [ ] **Step 3: Implementacja**
  - tooltip: `routerLine` jako dodatkowa linia; panel: w `.meta`, klasa `router-hot` dla `stalled`/`blocked` (kolor `--needs`);
  - `hud.ts`: `drawRouterBadge(x, cx, y)`: mały znaczek (kółko 7 px w kolorze Codexa z dwiema strzałkami „⇄” w 6 px), w lewym górnym rogu slotu zwierzaka; rysowany w `stage.ts` dla sesji z `origin === 'router'`; test zakresu rysowania jak dla `drawProgress`;
  - `demo.ts`: sesje `router` dostają `router_task`, żeby podgląd (`dev.html`, `/panel.html`) je pokazywał.
- [ ] **Step 4:** `pnpm test; pnpm typecheck` → PASS; podgląd `dev.html` i `/panel.html` w przeglądarce (oba motywy).
- [ ] **Step 5: Commit** `feat(ui): Agent Router task health in the tooltip and panel, router badge on the pet`.

---

### Task 5: Weryfikacja na żywo i dokumentacja

**Files:** Create `docs/phase4-verification.md`; Modify `README.md`, spec 6.3 (nazwa pliku `status.json`, zdrowie liczone przez konsumenta).

- [ ] **Step 1:** w repo routera `npm run build`; poproś użytkownika o przeładowanie serwera MCP `agent-router` (albo nową sesję Claude Code).
- [ ] **Step 2:** zleć Codexowi przez router małe zadanie tylko do odczytu (np. policzenie plików `.rs` w `crates`), `isolation: none`, model `luna`.
- [ ] **Step 3:** sprawdź `~/.agent-router/status.json` (zadanie z `threadId`, bez treści) i w widżecie: zwierzak Kodek ze znaczkiem routera, tytuł zadania, w tooltipie „Zadanie routera: aktywne”, po końcu „zakończone”; brak drugiego zwierzaka dla tego samego wątku.
- [ ] **Step 4:** checklista w `docs/phase4-verification.md`; README (sekcja „How it works” i tabela „What works now”: router ✅, roadmapa: faza 4 przekreślona); spec 6.3.
- [ ] **Step 5:** pełne testy obu repo; commit `docs: phase 4 verification and README for Agent Router tasks`.
