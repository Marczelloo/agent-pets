# Agent Pets: specyfikacja projektu

- **Data:** 2026-09-24
- **Status:** zatwierdzony projekt, czeka na plan implementacji
- **Prototyp wizualny:** `prototype/` (v6). Otwórz `prototype/index.html`. Test dymny uruchamiasz przez `node prototype/smoke-test.js`.

## 1. Cel

Agent Pets to widżet w pasku zadań Windows 11. Pokazuje, co w tej chwili robią agenci kodujący. Każda sesja albo zadanie dostaje zwierzaka (maskotkę), który na żywo odgrywa stan agenta: myśli, pisze kod, czyta plik, szuka w sieci, czeka na Ciebie, skończył, ma błąd.

- **Rzut oka na pasek:** czy agent pracuje, jak daleko jest z listą zadań i ile zostało limitów.
- **Kliknięcie:** otwiera panel ze szczegółami i przyciskiem „Przejdź” do okna, w którym działa sesja.

Wartość widżetu jest w dużej mierze wizualna i emocjonalna. Najważniejsze kryterium jakości to żywość i dopracowanie animacji.

### Odbiorcy

Najpierw jeden użytkownik (autor), później możliwe wydanie publiczne. Dlatego maskotki są wymiennymi pakietami skórek, a konfiguracja nie może zakładać jednej maszyny.

### Zakres v1

- **Źródła:**
  - Claude Code (CLI i aplikacja desktop);
  - Codex (CLI i aplikacja);
  - zadania Agent Routera.
- **Tryb pracy:** obserwator z powiadomieniami. Widżet niczego nie klika za agentów.

### Poza v1

- Akceptowanie zgód i inne działania z poziomu widżetu.
- Reakcje na aktywność bez agentów (muzyka, gry, filmy).
- Nowe stany i akcje ponad te opisane niżej.
- Publiczny sklep czy katalog skórek.
- Monitory inne niż główny.

## 2. Doświadczenie użytkownika

### 2.1 Scena w pasku zadań (mini widok)

- **Miejsce:** okno sceny osadzone w pasku zadań głównego monitora, obok zasobnika systemowego.
- **Tray:** ikona w zasobniku działa zawsze, także gdy osadzenie się nie uda (sekcja 10).
- **Zwierzaki:**
  - jeden na sesję Claude Code, sesję Codexa albo zadanie routera;
  - widocznych najwyżej 5; nadmiar zwija się w plakietkę „+N”;
  - przepełnienie nigdy nie ukrywa zwierzaka w stanie `needs_you` ani `error`; zwijane są najstarsze spośród pozostałych;
  - kolejność jest stabilna, według czasu startu sesji.
- **Pod każdym zwierzakiem:** cienki pasek postępu z listy zadań (`done/total`). Gdy listy nie ma, pasek pulsuje zamiast pokazywać procent.
- **Limity:** na krawędzi sceny są paski limitów 5h i tygodniowego, osobno dla Claude'a i Codexa. Pasek bez danych jest ukryty; nigdy nie pokazuje 0%.
- **Kontekst:** zapełnienie kontekstu pokazuje stan `compacting` oraz tooltip i panel.
- **Pełna animacja także w mini widoku:** zwierzaki mają te same animacje, rekwizyty i cząsteczki co w dużym widoku, tylko w skali u≈0,3. Upraszczanie mini widoku jest zabronione, bo zabija wrażenie życia.

### 2.2 Tooltip

Po najechaniu na zwierzaka pokazuje:
- tytuł sesji (pierwszy prompt albo tytuł zadania);
- agenta i źródło (CLI, desktop, router);
- bieżącą akcję;
- postęp;
- zapełnienie kontekstu;
- czas od ostatniej aktywności.

### 2.3 Panel

Kliknięcie sceny albo ikony w trayu otwiera wyskakujące okno nad paskiem zadań. Zawiera:
- listę wszystkich sesji, także zwiniętych w „+N”: zwierzak w dużej skali, tytuł, `cwd`, stan, postęp, kontekst i przycisk **Przejdź**;
- limity Claude'a i Codexa: procent zużycia i godzinę resetu dla okien 5h i tygodniowego;
- dostęp do diagnostyki i ustawień.

### 2.4 Powiadomienia (toasty Windows)

| Warunek | Treść |
|---|---|
| `needs_you` trwa ponad 15 s, a okno sesji nie ma fokusu | agent czeka na Ciebie, z przyciskiem „Przejdź” |
| `done` po turze trwającej ponad 2 minuty | agent skończył |
| limit przekracza 90% (raz na okno limitu, do jego resetu) | którego agenta i którego okna dotyczy, godzina resetu |

Każdy rodzaj toastu da się wyłączyć w ustawieniach.

## 3. Architektura

- **Stos:** Tauri 2. Rdzeń w Rust, UI w React + TypeScript w WebView2.
- **Renderer maskotek:** osobny moduł TS bez frameworka, rysujący na Canvas 2D.

```
Claude Code ──hook.exe──HTTP──┐
Codex  ──pliki rollout (watch)─┼─► adaptery ─► store + maszyna stanów ─► zdarzenia do UI
Router ──tasks.json (watch)────┘                         │
                                                         └─► shell (pasek, tray, toasty, przejście do sesji)
```

### 3.1 Moduły Rust (`src-tauri`)

| Moduł | Odpowiedzialność |
|---|---|
| `ingest` | Serwer HTTP na `127.0.0.1` (losowy port) z tokenem. Zapisuje `~\.agent-pets\endpoint.json` z portem i tokenem (katalog domowy, bo Windows wirtualizuje `AppData` dla procesów z pakietów MSIX, np. aplikacji Claude). Przyjmuje `POST /v1/events`. |
| `hook` (osobny binarny `hook.exe`) | Wywoływany przez hooki Claude Code. Czyta JSON ze stdin, wysyła go do `ingest` z limitem 300 ms i zawsze kończy się kodem 0. Gdy widżet nie działa, porzuca zdarzenie. |
| `adapters::claude` | Normalizuje zdarzenia hooków. Czyta końcówkę transkryptu (lista zadań, tokeny, tytuł). |
| `adapters::codex` | Obserwuje `~/.codex/sessions/**/rollout-*.jsonl` i czyta dopisywane linie. |
| `adapters::router` | Obserwuje `~/.agent-router/tasks.json` i łączy zadania z wątkami Codexa. |
| `store` | Sesje i limity. Maszyna stanów (sekcja 5), progi czasowe, sprawdzanie PID. Odtwarza stan po starcie. |
| `shell` | Osadzanie w pasku (`SetParent` do `Shell_TrayWnd`), obsługa `TaskbarCreated`, DPI, autoukrywanie paska, główny monitor. Tray, toasty, przejście do sesji. |
| `replay` | Narzędzie dewelopera: odtwarza nagrany plik zdarzeń z zadaną prędkością. |

### 3.2 UI (`src`)

| Część | Opis |
|---|---|
| `Stage` | Okno sceny (przezroczyste, wysokości paska). Układ zwierzaków, „+N”, paski limitów. |
| `Pet` | Jeden zwierzak. Łączy stan z `store` z rendererem. |
| `Tooltip` | Osobne wyskakujące okno, bo scena ma wysokość paska. |
| `Panel` | Wyskakujące okno nad paskiem (sekcja 2.3). |
| `renderer/` | Silnik animacji przeniesiony z prototypu v6 (sekcja 7). |
| `skins/` | Pakiety skórek: Clawd (Claude) i Kodek (Codex), każdy w stylu rysowanym i czystym. |

Jedna pętla `requestAnimationFrame` obsługuje wszystkie zwierzaki na scenie.

## 4. Model danych

```ts
type Agent = 'claude' | 'codex';
type Origin = 'cli' | 'desktop' | 'router';
type State = 'thinking' | 'working' | 'needs_you' | 'done' | 'error'
           | 'idle' | 'sleep' | 'compacting' | 'ended';
type Tool = 'edit' | 'bash' | 'read' | 'grep' | 'web' | 'agent' | 'mcp' | 'other';

interface Session {
  id: string;                 // session_id (Claude) albo id wątku (Codex)
  agent: Agent;
  origin: Origin;
  title: string;
  cwd: string;
  state: State;
  tool?: Tool;                // gdy state === 'working'
  progress?: { done: number; total: number };
  context?: { used: number; max: number };
  startedAt: number;
  lastActivity: number;
  turnStartedAt?: number;     // do reguły toastu „done po >2 min”
  jumpTarget: { pid?: number; sessionId: string; cwd: string; app?: 'terminal' | 'claude-desktop' | 'codex-app' | 'vscode' };
  routerTask?: { taskId: string; health: 'active' | 'quiet' | 'stalled' | 'blocked' };
}

interface Limit {
  agent: Agent;
  window: '5h' | 'weekly';
  usedPct: number;            // 0–100
  resetsAt?: number;
}

interface NormalizedEvent {
  source: 'claude' | 'codex' | 'router';
  sessionId: string;
  kind: 'session_start' | 'prompt' | 'tool_start' | 'tool_end' | 'needs_input'
      | 'turn_end' | 'error' | 'compact' | 'session_end' | 'meta' | 'limits';
  tool?: Tool;
  ts: number;
  data?: Record<string, unknown>;
}
```

## 5. Stany i maszyna stanów

### 5.1 Przejścia

| Stan | Wejście | Wyjście |
|---|---|---|
| `thinking` | `prompt`; `tool_end` | kolejne zdarzenie |
| `working` (+`tool`) | `tool_start` | `tool_end` → `thinking` |
| `needs_you` | `needs_input` (Claude `Notification`, prośba o zgodę w Codexie) | następne zdarzenie aktywności |
| `done` | `turn_end` | po 2 min bez zdarzeń → `idle`; `prompt` → `thinking` |
| `error` | `error` (błąd tury lub API, zadanie routera `failed`) | następne zdarzenie aktywności |
| `compacting` | `compact` (Claude `PreCompact`) albo kontekst > 90% | następne zdarzenie aktywności |
| `idle` | 10 min bez zdarzeń w stanie `thinking` lub `working`; wyjście z `done` | 10 min bez zdarzeń → `sleep` |
| `sleep` | 10 min w `idle` | dowolne zdarzenie aktywności |
| `ended` | `session_end`; 30 min bez zdarzeń; martwy PID | zwierzak macha i schodzi ze sceny (ok. 1,5 s), potem jest usuwany |

### 5.2 Zasady wspólne

- **Minimalny czas stanu to ok. 600 ms.** Szybsze zmiany trafiają do kolejki i ostatnia wygrywa. Dzięki temu animacje nie migają przy seriach krótkich narzędzi.
- **Zdarzenia z jednej sesji są porządkowane po czasie.** Duplikaty są idempotentne.
- **Mapowanie narzędzi:**

  | Narzędzie Claude Code | Codex (do potwierdzenia w S5) | `Tool` |
  |---|---|---|
  | `Edit`, `Write`, `MultiEdit`, `NotebookEdit` | `apply_patch` | `edit` |
  | `Bash`, `PowerShell` | `exec` / wywołanie powłoki | `bash` |
  | `Read` | odczyt pliku | `read` |
  | `Grep`, `Glob` | wyszukiwanie w plikach | `grep` |
  | `WebSearch`, `WebFetch` | `web_search` | `web` |
  | `Task` / `Agent` (subagent) | nie dotyczy | `agent` |
  | `mcp__*` | wywołanie narzędzia MCP | `mcp` |
  | pozostałe | pozostałe | `other` (ogólna animacja „pracuje”) |

## 6. Źródła danych

### 6.1 Claude Code

- **Instalacja hooków:** instalator dopisuje je do `~/.claude/settings.json` na poziomie użytkownika. Przed zapisem robi kopię pliku, a zmiany scala, zamiast go nadpisywać. Odinstalowanie usuwa tylko wpisy widżetu.
- **Obsługiwane zdarzenia:**

  | Zdarzenie hooka | Rodzaj zdarzenia |
  |---|---|
  | `SessionStart` | `session_start` |
  | `UserPromptSubmit` | `prompt` |
  | `PreToolUse` | `tool_start` |
  | `PostToolUse` | `tool_end` |
  | `Notification` | `needs_input` |
  | `Stop` | `turn_end` |
  | `SubagentStop` | koniec akcji subagenta |
  | `PreCompact` | `compact` |
  | `SessionEnd` | `session_end` |

- **Transkrypt** (`transcript_path` z danych hooka) jest czytany od końca, przyrostowo:
  - ostatnia lista zadań (`TodoWrite`) daje `progress`;
  - `usage` ostatniej odpowiedzi daje `context.used`, a `context.max` wynika z modelu;
  - pierwszy prompt daje `title`.
- **Cel przejścia:** `session_id`, `cwd` i PID procesu rodzica, zapisane przez `hook.exe`. Stąd wiadomo, czy to terminal, VS Code czy aplikacja desktop.
- **Limity:** zależą od spike'a S3. Jeśli dane dla statusline zawierają limity, widżet instaluje przelotkę statusline: przekazuje dane do `ingest` i wywołuje dotychczasowy statusline użytkownika bez zmiany jego wyniku. Jeśli nie, pasek limitów Claude'a jest ukryty w v1.

### 6.2 Codex

- **Źródło:** obserwacja katalogu `~/.codex/sessions/**/rollout-*.jsonl` (`ReadDirectoryChangesW` przez crate `notify`) i odczyt dopisywanych linii od zapamiętanej pozycji.
- **Mapowanie** (dokładne nazwy zdarzeń potwierdza spike S5):

  | Zdarzenie w pliku | Rodzaj zdarzenia |
  |---|---|
  | metadane sesji (id, `cwd`) | `session_start` + `meta` |
  | wiadomość użytkownika | `prompt` |
  | wywołania narzędzi | `tool_start` / `tool_end` |
  | prośba o zgodę | `needs_input` |
  | koniec zadania | `turn_end` |
  | błąd tury | `error` |
  | `token_count` | `context` oraz `limits`: `rate_limits` z oknem głównym (5h) i drugorzędnym (tydzień), procent i czas resetu |

- **Format to nie jest oficjalne API.** Parser jest wersjonowany i pomija nieznane zdarzenia. Testy działają na prawdziwych próbkach.

### 6.3 Agent Router

- **Zmiana w repo routera** (`Marczelloo/agent-router-mcp`): router przy każdej zmianie stanu zadania zapisuje atomowo (plik tymczasowy + `rename`) plik `~/.agent-router/tasks.json`:

```json
{
  "version": 1,
  "updatedAt": "2026-09-24T12:00:00Z",
  "tasks": [
    {
      "taskId": "…",
      "threadId": "…",
      "title": "…",
      "status": "running | completed | failed | interrupted | quota_exhausted",
      "health": "active | quiet | stalled | blocked",
      "model": "gpt-6-sol",
      "workingDirectory": "…",
      "startedAt": "…",
      "updatedAt": "…"
    }
  ]
}
```

- **Łączenie z Codexem:** widżet łączy zadania z sesjami Codexa po `threadId`. Taki zwierzak ma `origin: 'router'`, tytuł zadania i znaczek routera, a więc nie ma dwóch zwierzaków na jedno zadanie.
- **Niezależność:** router działa tak samo, gdy widżet jest wyłączony.

### 6.4 Odtwarzanie stanu po starcie

Widżet przegląda:
- transkrypty Claude'a i rollouty Codexa zmienione w ciągu ostatnich 30 minut;
- plik `tasks.json`.

Z nich buduje sesje z ostatnim znanym stanem. Sesje z martwym PID od razu dostają `ended`.

## 7. Warstwa wizualna

Wzorcem jest prototyp v6 w `prototype/pets.js`. Implementacja przenosi go do modułów TS, zachowując zachowanie 1:1.

### 7.1 Styl

- **Rysunek:** kreskówkowy, rysowany w kodzie na Canvas 2D (bez WebGL i bez pixel artu), odniesienie do stylu Claude'a.
- **Styl rysowany (domyślny):**
  - kontur „gotuje się” w 8 kl./s dzięki roztrzęsionym punktom wielokąta;
  - podwójna kreska;
  - wypełnienie lekko przesunięte względem konturu;
  - kreskowane ściany boczne.
- **Styl czysty:** zapasowa skórka wektorowa.
- **Kolory:** kontur `#2B1D16`, papier `#FAF9F5`, glina `#D97757`, teal `#1D9E75` / `#5DCAA5`, bursztyn `#EF9F27`.

### 7.2 Postacie

- **Clawd** (Claude): kanciasty prostopadłościan (promień rogów 3,5u), kolor gliny `#D97757`, 4 nóżki, duże oczy z odblaskiem, rumieńce przy radości.
- **Kodek** (Codex): zaokrąglony terminal w kolorze złamanej bieli. Twarzą jest ciemny ekran z oczami i kursorem w kolorze teal. Ma sprężynującą antenę (fizyka tłumionej sprężyny), kratki na plecach, a w czasie snu wygaszacz ekranu.

### 7.3 Głębia 2.5D

- **Projekcja:** `pj(lx, lz) = [lx·cos θ + lz·sin θ, −lx·sin θ + lz·cos θ]`. Widać przód, tył i boki, więc możliwe są pełne obroty (piruet).
- **Ręce:**
  - są „gumowe” (rubber hose): krzywa kwadratowa od barku do dłoni;
  - liczone w 3D razem z ciałem;
  - kolejność rysowania (za lub przed ciałem) wynika z głębi, z płynnym przenikaniem w wąskim przedziale, więc nic nie przeskakuje;
  - bark dalszej ręki sięgającej do przodu przesuwa się do krawędzi sylwetki;
  - ręce uniesione wyciągają się nad głowę jak w kreskówce, zamiast zawijać się w ciele;
  - skrócone perspektywicznie ręce nie wyginają się w pętle.
- **Dłonie:** mają dwa tryby, sterowanie kątem (`armL/R`, `oscL/R`) i cel IK (`ikL/R`, `hxL/hyL/hxR/hyR` w jednostkach świata). Tryby się przenikają.
- **Przedmioty:** doczepione do rzeczywistej pozycji dłoni.
- **Rekwizyty:** nigdy nie stoją między widzem a dłońmi.

### 7.4 Architektura animacji

- **Sprężyny:** każdy parametr pozy (`th`, `look`, `ex`, `lx`, `sit`, `loaf`, `lean`, `tilt`, ręce, ekspresje, `propA`/`holdA` itd.) jest sprężyną z tabeli `SPR` (sztywność, tłumienie).
- **Stan** ma pozę bazową i pulę akcji. Pula może być losowa z wagą akcji głównej, cykliczna (`cycle`) albo sekwencyjna (`seq`), np. radość: wiwat → piruet → taniec → kroczki.
- **Akcja** to `[nazwa, czas, fn(a, c, t) → cele, onStart, onEnd]`. Cele trafiają do sprężyn. `pend()` planuje zdarzenia w czasie akcji (wyrzut, klik, iskry).
- **Sloty `_prop` i `_hold`** wygaszają rekwizyty i przedmioty płynnie przy zmianie.
- **Cząsteczki** pojawiają się tylko tam, gdzie mają sens: kod przy edycji, `$ >_` przy bashu, „puk” przy pukaniu, zzz przy spaniu, nuty przy tańcu, krople potu przy wysiłku.

### 7.5 Akcje według stanu

| Stan / narzędzie | Scena |
|---|---|
| `thinking` | ręka pod brodą; chodzi w tę i z powrotem; rozgląda się; obraca się gwiazdka ✻ |
| `edit` | biurko z nóżkami, klawiatura, monitor z boku z przewijanym kolorowym kodem; pisze oburącz; przeciąga się; drapie się po głowie; zerka na Ciebie; popija kawę z kubka (bierze za ucho, paruje) |
| `bash` | szafa z terminalem CRT, lampkami i wysuniętą klawiaturą; pisze jednym palcem z ręką na biodrze; zamach i uderzenie w pomarańczowy Enter (błysk ekranu, ↵); czeka na wynik, wodząc wzrokiem za przewijanym wyjściem |
| `read` | trzyma dużą kartkę; podświetlenie czytanej linii zsynchronizowane z oczami; odrzuca przeczytaną kartkę przez ramię |
| `grep` | lupa sunie po tablicy z kodem i pokazuje powiększoną treść; „znalazł!” z podświetloną linią |
| `web` | siatka na motyle: opuszcza ją, zgarnia lecącą stronę ruchem w górę, strona wpada otworem do worka wiszącego w obręczy; zagląda do siatki. Siatka jest sztywna, bez fizyki sznurków. |
| `agent` | składa papierowy samolocik w 3 krokach, bierze zamach, rzuca, macha na pożegnanie |
| `mcp` / `other` | duży klucz dokręca śrubę maszyny (łuk ok. 110°, obraca się śruba i zębatka, „klik”, pot); ociera czoło |
| `needs_you` | dymek „!”, macha do Ciebie albo puka w szybę (promienie uderzenia, „puk”) |
| `done` | wiwat, piruet, taniec, kroczki, potem siedzi zadowolony |
| `error` | siedzi zszarzały, kręci mu się w głowie (gwiazdki), otrząsa się |
| `idle` | siedzi i macha nogami, rozgląda się, ziewa |
| `sleep` | leży na poduszce, zzz; Kodek pokazuje wygaszacz ekranu |
| `compacting` | reużywa sceny bez nowego rekwizytu: pocenie się i wysiłek (jak przy `mcp`, bez maszyny). Nowa scena powstanie po v1. |

### 7.6 Pakiety skórek

Skórka to moduł TS, który dostarcza:
- geometrię ciała (proporcje, nóżki, twarz);
- paletę;
- dodatki (antena, wygaszacz);
- metadane.

Silnik akcji i rekwizytów jest wspólny. Wersja v1 ma skórki Clawd i Kodek, każdą w stylu rysowanym i czystym.

## 8. Przejście do sesji

Przycisk „Przejdź” próbuje po kolei aż do skutku:

1. Deep link lub fokus konkretnej sesji (aplikacja desktop Claude, aplikacja Codex, karta Windows Terminal po PID). Dostępność zależy od spike'a S4.
2. Fokus okna aplikacji lub terminala, w którym działa sesja.
3. Nowy terminal z `claude --resume <id>` albo `codex resume <id>` w `cwd` sesji.

Gdy wszystko zawiedzie, widżet pokazuje toast i kopiuje komendę wznowienia do schowka.

## 9. Ingest i bezpieczeństwo

- Serwer słucha wyłącznie na `127.0.0.1`. Każde żądanie wymaga tokenu z `endpoint.json`, a plik ma uprawnienia tylko dla bieżącego użytkownika.
- Widżet nie wysyła niczego do sieci.
- Z transkryptów przechowuje tylko tytuł, listę zadań i liczniki. Treść rozmów nie jest zapisywana.
- `hook.exe` nie może zablokować ani spowolnić agenta: limit 300 ms, zawsze kod 0, brak wyjścia na stdout.

## 10. Obsługa błędów

- **Gdy widżet nie działa:** zdarzenia hooków przepadają. Stan wraca przez odtworzenie po starcie (6.4).
- **Port zajęty:** widżet wybiera nowy losowy port i aktualizuje `endpoint.json`.
- **Parsery:** zepsutą linię pomijają i liczą w diagnostyce. Przy skróceniu albo podmianie pliku zerują pozycję odczytu.
- **Brak zdarzenia końcowego:** zamykają je progi czasowe i sprawdzanie PID (5.1).
- **Pasek zadań:**
  - komunikat `TaskbarCreated` po restarcie Explorera → ponowne osadzenie;
  - nieudane osadzenie → pływające okno tuż nad paskiem plus tray;
  - zmiana DPI albo monitora → ponowny układ.
- **Przejście do sesji:** łańcuch awaryjny z sekcji 8.
- **Diagnostyka w panelu:** ostatnie zdarzenia z każdego źródła, liczniki błędów parserów, stan osadzenia i przycisk „Wyślij testowe zdarzenie”.

## 11. Wydajność

- **Cel:** poniżej 2% CPU przy 5 aktywnych zwierzakach.
- Rysowanie jest wstrzymane, gdy pasek jest ukryty albo działa aplikacja pełnoekranowa (gra, film).
- Zwierzaki w stanach `idle` i `sleep` mogą odświeżać się rzadziej.

## 12. Testy

- **Rust, testy jednostkowe:**
  - parsery Claude'a i Codexa na zanonimizowanych, prawdziwych próbkach w `fixtures/`;
  - maszyna stanów sprawdzana tabelą „sekwencja zdarzeń → oczekiwane stany”, z udawanym zegarem (minimalny czas stanu, progi czasowe, `ended`);
  - normalizacja limitów;
  - odczyt `tasks.json` i łączenie po `threadId`.
- **Integracja:** `hook.exe` → HTTP → `store` → zdarzenie do UI, także ścieżka „widżet wyłączony” (hook kończy się szybko kodem 0).
- **Narzędzie `replay`:** nagrane sesje odtwarzane z przyspieszeniem, do testów i pracy nad UI.
- **Renderer:**
  - test headless: każdy stan, każda akcja i każda skórka przez N klatek, bez NaN i wyjątków; wzorzec to `prototype/smoke-test.js`;
  - testy wizualne klatek z ustalonym ziarnem, porównywane ze wzorcami z tolerancją; wzorzec to tryb filmstrip w `prototype/debug.html`.
- **Powłoka Windows (ręczna checklista):**
  - osadzenie na Win11;
  - restart Explorera;
  - DPI 100, 150 i 200%;
  - autoukrywanie paska;
  - kilka monitorów;
  - aplikacja pełnoekranowa.
- **Router:** test zapisu atomowego `tasks.json` w repo routera.

## 13. Fazy

### Faza 0: spike'i

Kod ze spike'ów wyrzucamy. Każdy odpowiada na jedno pytanie.

| # | Pytanie | Plan B |
|---|---|---|
| S1 | Czy przezroczyste okno Tauri/WebView2 osadzone przez `SetParent` w `Shell_TrayWnd` działa na Win11 i przetrwa restart Explorera oraz zmianę DPI? | Pływające okno nad paskiem jako forma główna, plus tray |
| S2 | Czy 5 zwierzaków w osadzonym oknie działa płynnie przy CPU < 2%? | Niższy klatkaż mini widoku, pomijanie niezmienionych klatek |
| S3 | Czy dane dla statusline Claude Code zawierają limity 5h i tygodniowy? | Brak paska limitów Claude'a w v1 |
| S4 | Jakie są mechanizmy przejścia do sesji (deep linki aplikacji desktop, fokus karty Windows Terminal po PID, aplikacja Codex, VS Code)? | Kroki 2–3 z sekcji 8 |
| S5 | Czy rollouty Codexa 0.155.1 zawierają `rate_limits`, prośby o zgodę i nazwy narzędzi? Zebrać próbki do `fixtures/`. | Parser ograniczony do dostępnych zdarzeń |

### Kolejne fazy

1. **Rdzeń danych:** `ingest`, `hook.exe`, adaptery Claude i Codex, `store` z maszyną stanów, `replay`, okno debugowania z listą sesji.
2. **Scena i maskotki:** przeniesienie prototypu v6 do `renderer/` i `skins/`, scena w pasku, tooltip, zasady przepełnienia.
3. **Panel:** panel, limity, „Przejdź” z łańcuchem awaryjnym, toasty.
4. **Agent Router:** zapis `tasks.json` w repo routera, łączenie zadań ze zwierzakami Codexa.
5. **Wykończenie:** instalator z instalacją i odinstalowaniem hooków, ustawienia, diagnostyka, autostart, tryb oszczędny.

## 14. Po v1

- Akceptowanie zgód z panelu.
- Więcej stanów i akcji, w tym dedykowana scena `compacting`.
- Reakcje na aktywność bez agentów: muzyka, gry, filmy.
- Wydanie publiczne z paczkami skórek.
- Obsługa wielu monitorów.
