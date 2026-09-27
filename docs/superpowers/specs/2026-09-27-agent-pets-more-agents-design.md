# Agent Pets 0.10–0.12: więcej agentów, programy i furtka

Status: projekt do przeczytania przez użytkownika (rozmowa z 2026-09-27). Program na trzy wydania; 0.10 opisany w szczegółach, 0.11 i 0.12 po spike'ach (6).

## 1. Cel

Zwierzaki dla kolejnych agentów, poprawny podpis i skok dla programów, które tylko uruchamiają agentów (t3code, edytory), oraz publiczna furtka, przez którą dowolne narzędzie zgłosi swój stan. To przygotowanie pod baner v2 i tryb ambient, które przyjdą później.

Zakres:
1. agenci: **opencode, Antigravity, GitHub Copilot, Cursor, Grok Build**;
2. oś „program” (gospodarz sesji) z wykrywaniem, podpisem i skokiem;
3. furtka: ogólna trasa w endpoincie i komenda `agent-pets report`;
4. maskotki nowych agentów (styl Clean) i uniwersalny zwierzak dla nieznanych agentów;
5. model w tooltipie i panelu.

Poza zakresem:
- kolejka „na przyszłość”, w tej kolejności: **ZCode** (Z.ai, własna pętla, open source od 09.2026), Kilo CLI, Qwen Code, Goose, Junie, Kiro, Cline. Do czasu własnych adapterów mogą używać furtki;
- limity nowych agentów (paski zostają dla Claude'a i Codexa);
- statystyki nowych agentów (okno statystyk liczy dalej `claude`, `codex`, `router`);
- dedykowane wersje nowych maskotek w stylach Pixel i Sticker (5.3);
- znaczek modelu na samym zwierzaku (decyzja: model tylko w tekście).

## 2. Zasada: agent, model, program

| Warstwa | Przykład | Co z nią robimy |
|---|---|---|
| **Agent**: kto prowadzi pętlę (pliki, narzędzia, zgody, log sesji) | Claude Code, Codex, opencode, Cursor | maskotka |
| **Model**: kogo agent odpytuje | Opus 5.5, GPT-6, GLM-5.3 | tekst w tooltipie i panelu |
| **Program**: gdzie użytkownik steruje | terminal, VS Code, t3code, Zed, JetBrains | tekst, ikonka w panelu, cel skoku |

Zwierzak należy do pętli, nie do modelu. Rozstrzyga to samo podpięcie: słuchamy hooków, pluginów i logów konkretnej pętli, więc zawsze wiemy, czyja to pętla. Przykłady:

| Sytuacja | Zwierzak | Podpis w tooltipie |
|---|---|---|
| Claude Code w terminalu | Clawd | Claude Code · Opus 5.5 |
| Claude Code na GLM przez z.ai | Clawd | Claude Code · GLM-5.3 |
| t3code uruchamia Claude'a | Clawd | Claude Code · Opus 5.5 · t3code |
| t3code uruchamia opencode z GPT | opencode | opencode · GPT-6 · t3code |
| Cursor w edytorze | Cursor | Cursor · Sonnet 5 · Cursor |
| Cursor CLI w terminalu | Cursor | Cursor · Sonnet 5 |
| nieznany agent przez furtkę | uniwersalny | nazwa zgłoszona przez narzędzie |

Program nie dostaje własnego zwierzaka: ta sama praca liczyłaby się dwa razy.

## 3. Model danych

### 3.1 Rdzeń (`model.rs`) i lustro TS (`types.ts`)

- `Agent`: `Claude, Codex, Opencode, Antigravity, Copilot, Cursor, Grok, Other`. Serde `snake_case`; zapisane dane ze starszych wersji wczytują się bez zmian.
- `Session.agent_name: Option<String>`: nazwa do wyświetlenia tylko dla `Other` (z furtki); przycinana do 40 znaków, bez znaków sterujących.
- `Session.model: Option<String>`: nazwa modelu do wyświetlenia (3.3). `#[serde(default)]`.
- `App` (program; dziś `Terminal, ClaudeDesktop, CodexApp, Vscode`) dostaje: `T3code, Cursor, Antigravity, Zed, Jetbrains, Other`. `JumpTarget.app` zostaje nośnikiem programu; nowe pole `JumpTarget.app_name: Option<String>` na nazwę programu `Other`.
- `Origin` (`cli`, `desktop`, `router`) zostaje bez zmian: opisuje sposób uruchomienia, nie program.

### 3.2 Ustawienia i integracje

- `integrations::AppId` dostaje `Opencode, Antigravity, Copilot, Cursor, Grok`. Każdy ma wykrycie, stan, włączenie i pełne odinstalowanie, jak dziś Claude Code (kopia zapasowa zmienianego pliku konfiguracyjnego, zgoda użytkownika w kreatorze albo w ustawieniach).
- `runtime.rs`: filtr włączonych aplikacji obejmuje nowych agentów; `Other` jest widoczny, gdy furtka jest włączona (3.4).
- Nadpisania wyglądu per agent (`Pets.overrides`) działają dla nowych `AppId` bez zmian w logice.
- Nowe ustawienie `integrations.generic: bool` (domyślnie `true`): czy endpoint przyjmuje zdarzenia furtki.

### 3.3 Model: skąd

- Claude: `message.model` z transkryptu (już czytany przez statystyki) albo `model.display_name` ze statusline.
- Codex: `turn_context.model` z logu sesji.
- Nowi agenci: z ich zdarzeń (4).
- Nazwa do wyświetlenia: identyfikator bez prefiksu dostawcy i daty (`claude-opus-5-5` → `Opus 5.5`, `gpt-6-sol` → `GPT-6 Sol`); nieznany format pokazujemy tak, jak przyszedł (przycięty do 32 znaków).

### 3.4 Tekst

- Tooltip, podtytuł: `<agent> · <model> · <program>`, pomijając brakujące części. Program pomijamy, gdy to terminal (jak dziś).
- Panel: ten sam podtytuł, a przed nim ikonka programu (SVG rysowane w kodzie, bez logo marek: ogólne symbole okna, edytora, przeglądarki).

## 4. Źródła stanu

### 4.1 Wspólny szkielet

- `hook.exe --agent <id>`: czyta JSON hooka z wejścia, dokleja `ts`, PID agenta i program (4.2), wysyła do `/v1/events/<id>`. Te same zasady co dziś: nigdy nie blokuje agenta, limit 300 ms, zawsze kod 0, nic nie wypisuje.
- Rdzeń: `adapters/<agent>.rs` tłumaczy zdarzenia agenta na wspólne zdarzenia sklepu (stan, narzędzie, pytanie, tytuł, cwd, model). Tłumaczenia są czystymi funkcjami, testowanymi na zapisanych przykładach (fixtures) z prawdziwych sesji, bez treści promptów i plików.
- Endpoint: trasy `/v1/events/{opencode,antigravity,copilot,cursor,grok,generic}`, ten sam token i limit rozmiaru co dziś.
- Instalacja: wpis hooka albo pliku pluginu przez `integrations`, z kopią pierwotnego pliku w `~/.agent-pets/` i przywróceniem przy odinstalowaniu.

### 4.2 Program (gospodarz)

- **Codex:** `session_meta.originator` i `source`. Dziś każdy nieznany `originator` to `CodexApp`; nowa mapa zna `codex-tui`/`cli` (terminal), `Codex Desktop` (CodexApp), `codex_vscode` (VS Code), `agent-router` (router), wartości t3code ustalone w spike'u, a resztę oznacza jako `Other` z nazwą.
- **Claude:** `hook.exe` już ustala PID agenta. Dochodzi przejście w górę po procesach-rodzicach (najwyżej 8 poziomów) do pierwszego znanego programu: `T3 Code.exe`, `Code.exe`, `Code - Insiders.exe`, `Cursor.exe`, `Antigravity.exe`, `zed.exe`, `idea64.exe` i pokrewne JetBrains, `WindowsTerminal.exe`. `entrypoint` z rejestru sesji Claude'a (już czytany) rozstrzyga Claude Desktop.
- **Nowi agenci:** ta sama ścieżka po procesach w `hook.exe`; plugin opencode przekazuje PID procesu opencode.
- **Skok:** `jump` dostaje krok „pokaż okno programu” po PID gospodarza (uogólnienie dzisiejszego `FocusProcess`). Kolejność: deep link (tylko Claude Desktop i Codex App, jak dziś) → okno gospodarza → okno terminala → schowek.

### 4.3 Agenci

| Agent | Źródło | Stany | Pewność |
|---|---|---|---|
| opencode | plugin `~/.config/opencode/plugin/agent-pets.js` (zdarzenia sesji, narzędzi, zgód, bezczynności) wysyła JSON na `/v1/events/opencode` | wszystkie, z pytaniem przy prośbie o zgodę | wysoka (opencode 1.18.25 zainstalowany) |
| Antigravity | hooki JSON (IDE i `agy`) → `hook.exe --agent antigravity` | do ustalenia w spike'u | średnia (IDE zainstalowane, CLI nie) |
| Copilot | hooki (Copilot CLI i tryb agenta w VS Code) → `hook.exe --agent copilot` | do ustalenia | średnia |
| Cursor | `~/.cursor/hooks.json` → `hook.exe --agent cursor` | do ustalenia | średnia (niezainstalowany: fixtures) |
| Grok Build | hooki albo czytanie logów | do ustalenia | niska |

Sesja bez zdarzeń zasypia i się kończy według tych samych progów co dziś. Po restarcie widżetu sesje nowych agentów nie są odtwarzane z dysku (w 0.10 tylko Claude i Codex mają `rehydrate`); wracają przy pierwszym zdarzeniu.

## 5. Maskotki

### 5.1 Postacie

Własne postacie inspirowane kształtem i kolorem marki, bez logo i bez cudzych maskotek:

| Agent | Postać | Detal |
|---|---|---|
| opencode | kanciasty klocek-terminal | oczy `>` i `_` na ekranie |
| Antigravity | okrągły stworek | lewituje nad paskiem, cień pod spodem, krążący kamyk |
| Copilot | krępy stworek | gogle pilota na czole |
| Cursor | czarno-biały kryształ-graniastosłup | ścięte krawędzie, jasna ścianka |
| Grok | ciemna kulka | ukośne cięcie przez ciało, zadziorne oczy |
| nieznany | prosty blob | kolor z nazwy (hash → barwa), wielka litera na brzuchu |

### 5.2 Technika

- Każda postać to `Skin` w `app/src/skins/` plus najwyżej jeden nowy element rysowany w `draw/` (np. lewitacja, gogle, litera). `skinFor(agent)` zwraca skórę dla każdego `Agent`.
- `SkinId` rośnie o `opencode, antigravity, copilot, cursor, grok, blob`. `ACCENT` (akcent stylu i dymków) dostaje kolor każdej postaci.
- Szkice przed wejściem do stylów: strona deweloperska z wyglądami (`looks-dev`) pokazuje wszystkie postacie we wszystkich scenach; użytkownik akceptuje je przed wydaniem.

### 5.3 Style

- Dopracowany jest **Clean**. Sketch, Neon, Ink i Pastel rysują postać z parametrów skóry bez osobnych poprawek.
- **Pixel i Sticker** mają kod pisany pod każdą postać. Nowe postacie rysują się w nich tak jak w Clean (tylko one; Clawd i Kodek bez zmian). Dedykowane wersje później.

## 6. Spike'i

Przed planem każdego wydania, zapis w `docs/0.10-spikes.md` (jak przy 0.7 i 0.8):

1. opencode: nazwy i kształt zdarzeń pluginu w wersji 1.18, czy plugin dostaje prośby o zgodę i pytania, PID procesu.
2. Claude przez Agent SDK (t3code): czy odpala hooki z `~/.claude/settings.json`; jeśli nie, zapasem jest czytanie transkryptu (już istnieje).
3. Drzewo procesów na Windows: koszt przejścia po rodzicach w limicie 300 ms, zachowanie przy zakończonym rodzicu.
4. (0.11) Antigravity i Copilot: gdzie leżą hooki, jakie zdarzenia, kształt JSON.
5. (0.12) Cursor i Grok Build: jw.; dla Groka decyzja hooki czy logi.

## 7. Wydania

| Wydanie | Zakres |
|---|---|
| **0.10** | 3 (model danych), 4.1–4.2, furtka (8), uniwersalny zwierzak, model w tekście, **opencode** z maskotką |
| **0.11** | Antigravity i Copilot z maskotkami |
| **0.12** | Cursor i Grok Build z maskotkami |

Każde wydanie działa samodzielnie i kończy się testem na żywo. Do testów 0.11 i 0.12 potrzebne będą `agy`, Copilot CLI, Cursor, Grok Build; t3code już do 0.10 (spike 2).

## 8. Furtka

- `POST /v1/events/generic`, nagłówek `Authorization: Bearer <token z ~/.agent-pets/endpoint.json>`, najwyżej 1 MiB:

```json
{ "agent": "kilo", "name": "Kilo CLI", "session": "abc", "state": "working",
  "tool": "edit", "title": "Refaktor", "cwd": "C:\\work\\x", "model": "GLM-5.3",
  "app": "vscode", "pid": 1234, "question": null }
```

- Wymagane: `agent` (`[a-z0-9-]{1,32}`), `session`, `state` (wartości `State`). Reszta opcjonalna. Nieznane pola są ignorowane, błędne dają 400.
- `agent` równy znanemu agentowi (`claude`, `codex`, `opencode`…) jest odrzucany (400): znani agenci mają własne trasy, furtka nie może się pod nich podszywać.
- Sesja furtki ma id `generic:<agent>:<session>`, `Agent::Other`, `agent_name` = `name` albo `agent`.
- `agent-pets report --agent <id> --session <id> --state <stan> [--name --tool --title --cwd --model --question]` w `pets-cli`: to samo z linii poleceń, dla skryptów.
- Dokumentacja: sekcja w README z przykładem w PowerShell i w bashu.
- Wyłączenie: `integrations.generic = false` → trasa zwraca 404.

## 9. Prywatność i bezpieczeństwo

- Nic nie wychodzi poza komputer: endpoint słucha tylko na 127.0.0.1 z tokenem, jak dziś.
- Adaptery nie przekazują treści promptów, odpowiedzi ani plików; tylko stan, rodzaj narzędzia, krótki tekst akcji, pytanie w `needs_you` i nazwę modelu (te same zasady co przy Claude'zie i Codeksie).
- Zmiany w plikach konfiguracyjnych agentów tylko za zgodą, z kopią i pełnym odinstalowaniem.
- Tekst z furtki (nazwa, tytuł, pytanie) traktowany jak niezaufany: przycinany, bez znaków sterujących, renderowany jako tekst.

## 10. Testy

- **Rust:**
  - serde: stare zapisy sesji i ustawień wczytują się; nowe warianty w obie strony;
  - adapter opencode na fixtures: każdy stan, pytanie, narzędzia, model;
  - mapa `originator` Codexa (w tym nieznany → `Other` z nazwą) i mapa programów po nazwie procesu;
  - przejście po procesach: limit poziomów, brak rodzica;
  - furtka: poprawne zdarzenie, brak pól wymaganych, zły `agent`, podszycie pod znanego agenta, za duże ciało, wyłączona trasa, zły token;
  - `report` w `pets-cli` buduje to samo ciało co przykład z 8;
  - nazwa modelu do wyświetlenia;
  - integracja opencode: instalacja, stan, odinstalowanie przywraca plik.
- **TS:**
  - `skinFor` dla każdego agenta; blob: kolor stały dla tej samej nazwy, litera;
  - każda nowa postać w każdym stylu i każdej scenie rysuje się bez NaN (jak testy dymne dziś); Pixel i Sticker używają Clean dla nowych postaci;
  - podtytuł tooltipa i panelu dla tabeli z 2;
  - i18n: nowe teksty w obu językach.
- **Ręcznie:** opencode na żywo (każdy stan, zgoda, skok do okna), Claude i Codex w t3code (podpis, skok), furtka z PowerShella, szkice postaci w obu motywach.
