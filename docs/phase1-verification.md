# Faza 1: weryfikacja end-to-end

- **Data:** 2026-09-24
- **Build:** release, gałąź `feat/phase0-1-core`
- **Hooki:** zainstalowane przez `pets-cli install-hooks`. `hook.exe` skopiowany do `%LOCALAPPDATA%\agent-pets\hook.exe`, żeby przebudowy nie blokowały pliku używanego przez hooki.

## Checklista

| # | Punkt | Wynik | Dowód / uwagi |
|---|---|---|---|
| 1 | Sesja CLI: `thinking`, `working:<narzędzie>`, `done` | **Tak** | Krótka sesja `claude -p`: `session_start` → `prompt` → `tool_start(bash)` → `tool_end` → `turn_end` → `session_end`, z PID procesu. Hooki interaktywnej sesji CLI nagrane w S3. |
| 2 | Sesja desktop: źródło `desktop`, tytuł z `ai-title`/`custom-title` | **Tak** | Ta sesja: `claude desktop working:bash … Widget paska zadań dla agenta`. |
| 3 | Zgoda lub `AskUserQuestion` → `needs_you` | **Częściowo** | Mapowanie pokryte testami jednostkowymi. Na żywo nie wystąpiła prośba o zgodę (tryby `auto`/`bypass`). Do potwierdzenia przy pierwszej takiej sytuacji. |
| 4 | Kontekst Claude'a rośnie | **Tak** | 62% → 65% w trakcie pracy (okno 1M). |
| 5 | Codex Desktop: `working:edit`/`bash`/`web` | **Częściowo** | Parser sprawdzony na prawdziwym rolloucie Codex Desktop (próbka `desktop-tools.jsonl`). Na żywo w czasie testu nie działała sesja Codex Desktop. |
| 6 | Limity Codexa zgodne z `codex_get_limits()` | **Tak** | Rdzeń: 5h 0% (reset za 299 min), tydzień 15% (reset za 7579 min). Router: 0% / 15%, reset za 300 / 7580 min. |
| 7 | Zadanie routera jako `codex router`, subagenci bez osobnych wierszy | **Tak (subagenci: nie sprawdzono)** | Zadanie testowe (luna, tylko odczyt): `thinking` → `working:bash` → `done`, z tytułem zadania. W teście nie było subagenta `review`. |
| 8 | Zamknięcie sesji → `ended`, zniknięcie po ok. 1,5 s | **Tak** | Po `session_end` sesja testowa pokazała `ended`, w kolejnej klatce zniknęła. |
| 9 | Restart rdzenia przywraca sesje z tytułami | **Tak, po poprawce** | Pierwsza wersja przywracała też zakończone sesje. Poprawka: rejestr `~/.claude/sessions/<pid>.json` (niżej). |
| 10 | Claude Code bez opóźnień i komunikatów przy wyłączonym rdzeniu | **Tak** | `hook.exe` przy wyłączonym rdzeniu: 260–380 ms (start procesu + 150 ms limitu łączenia), zawsze kod 0, bez wyjścia. |
| 11 | `replay` nagrania odtwarza przejścia | **Tak** | `live-session.jsonl` (54 zdarzenia, zanonimizowane): `thinking`, `working:bash`/`mcp`/`other`, `done`, `idle`, `ended` dla Claude desktop, CLI i Codex router. |

## Błędy znalezione i naprawione podczas weryfikacji

Każdy najpierw odtworzony testem, potem poprawiony.

1. **`hook.exe` wisiał ok. 2,1 s przy wyłączonym rdzeniu.** Windows ponawia połączenie z zamkniętym portem na localhoście, a ogólny limit `ureq` nie obejmuje łączenia. Poprawka: osobny `timeout_connect(150 ms)`; test zaostrzony do < 800 ms.
2. **Wszystkie odtworzone sesje w `sleep`, także aktywna.** Progi „bez zdarzeń” liczyły się od wejścia w stan. Teraz liczą się od późniejszego z: wejścia w stan, ostatniej aktywności.
3. **Kontekst 309%.** Modele Claude 5 mają okno 1M (S3); heurystyka zakładała 200k. Dodatkowo użycie powyżej zakładanego okna podnosi okno, więc nigdy nie ma > 100%.
4. **Zakończone sesje Claude'a wracały po restarcie.** Transkrypt nie ma znacznika końca. Poprawka: `claude::registry` czyta `~/.claude/sessions/<pid>.json` (rejestr żywych sesji Claude Code: `pid`, `sessionId`, `cwd`, `entrypoint`, `name`, `status`, `hostSessionId`). Odtwarzane są tylko sesje z żywym PID.
5. **Aktualizacje z transkryptu nie budziły śpiącej sesji.** `Meta` w stanie `sleep` przenosi teraz do `idle`.
6. **`replay` blokował się na starych znacznikach czasu.** Zegar odtwarzania jest monotoniczny, a pojedyncza przerwa trwa najwyżej 250 ms.

## Do decyzji

- **Otwarte, ale bezczynne sesje.** Sesje Claude'a otwarte, lecz bez aktywności od ponad 30 minut, są ukrywane (`ended`), zgodnie ze specyfikacją. Rejestr pozwala jednak wiedzieć, że proces żyje, więc można je zamiast tego pokazywać jako śpiące. Obecny wybór ogranicza tłok na pasku przy wielu otwartych sesjach desktop.
- **Sesje `claude -p` uruchomione z aplikacji desktop** dziedziczą `entrypoint: "claude-desktop"`, więc pokazują się jako `desktop`. To drobne i dotyczy tylko sesji skryptowych.

## Nowe fakty dla faz 2–3

- **`~/.claude/sessions/<pid>.json`** to lepsze źródło listy sesji i nazw niż transkrypty. Pole `status` (`busy`/`idle`) może zasilać stan bez hooków. `hostSessionId` (`local_…`) to prawdopodobnie identyfikator sesji w aplikacji desktop, przydatny do przejścia w fazie 3.

## Hooki

Zostają zainstalowane na czas fazy 2 (decyzja użytkownika). Usunięcie: `target/release/pets-cli.exe uninstall-hooks`.
