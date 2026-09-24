# Spike S3 + S4: limity i postęp Claude'a, przejście do sesji

- **Data:** 2026-09-24
- **Claude Code:** 2.1.270
- **Kod:** `spikes/statusline-dump/` (skrypty nagrywające, wyrzucane)
- **Metoda:** `~/.claude/settings.json` zmieniony na czas nagrania (z kopią zapasową), potem przywrócony. Plik po przywróceniu jest bajt w bajt identyczny z oryginałem.

## S3: limity z danych statusline — tak

Statusline dostaje na stdin JSON z limitami konta. Klucze najwyższego poziomu (bez wartości prywatnych):

```
session_id, transcript_path, cwd, scratchpad_dir, prompt_id, session_name,
effort.level, model.{id, display_name}, workspace.{current_dir, project_dir, added_dirs},
version, output_style.name, cost.{total_cost_usd, total_duration_ms, total_api_duration_ms,
total_lines_added, total_lines_removed},
context_window.{total_input_tokens, total_output_tokens, context_window_size,
  current_usage.{input_tokens, output_tokens, cache_creation_input_tokens, cache_read_input_tokens},
  used_percentage, remaining_percentage},
exceeds_200k_tokens, prompt_cache.{…}, fast_mode, thinking.enabled,
rate_limits.five_hour.{used_percentage, resets_at},
rate_limits.seven_day.{used_percentage, resets_at}
```

- **Limity:** `rate_limits.five_hour` i `rate_limits.seven_day` (procent 0–100 i `resets_at` w sekundach epoki). Pasek limitów Claude'a w v1 jest więc możliwy.
- **Kontekst:** `context_window.used_percentage` i `context_window_size` (np. 1 000 000) dokładnie. To lepsze niż heurystyka z transkryptu (`[1m]` → 1M, w pozostałych przypadkach 200k); w badanej sesji model bez `[1m]` miał okno 1M.
- **Tytuł:** `session_name`.
- **Ograniczenie:** statusline działa tylko w CLI. Aplikacja desktop go nie uruchamia, więc dla sesji desktop limity i kontekst przychodzą wyłącznie wtedy, gdy równolegle działa jakaś sesja CLI. Limity są kontowe, więc jedna sesja CLI wystarcza do odświeżenia paska limitów.

## S3: źródło postępu — `TaskCreate` / `TaskUpdate`, nie `TodoWrite`

W Claude Code 2.1.270 lista zadań to odroczone narzędzia `TaskCreate`, `TaskUpdate`, `TaskList` i `TaskGet`. `TodoWrite` nie występuje. Nagrane hooki `PostToolUse`:

```
TaskCreate {"subject":"A","description":"…"}      => {"task":{"id":"1","subject":"A"}}
TaskCreate {"subject":"B","description":"…"}      => {"task":{"id":"2","subject":"B"}}
TaskUpdate {"taskId":"1","status":"completed"}     => {"success":true,"taskId":"1","statusChange":{"from":"pending","to":"completed"}}
```

`TaskUpdate.status` ∈ `pending | in_progress | completed | deleted`.

**Wniosek:** postęp wymaga stanu per sesja. `TaskCreate` (id z `tool_response.task.id`) dodaje zadanie. `TaskUpdate` zmienia jego status, a `deleted` usuwa je z listy. Wynik to `done` = liczba `completed`, `total` = liczba zadań. `TodoWrite` zostaje jako obsługa starszych wersji.

## Hooki — ustalenia dodatkowe

- **Wspólne pola wszystkich hooków:** `session_id`, `transcript_path`, `cwd`, `hook_event_name`. Poza tym `PreToolUse` i `PostToolUse` mają `tool_name`, `tool_input`, `tool_use_id` (a `PostToolUse` także `tool_response` i `duration_ms`); `UserPromptSubmit` ma `prompt`; `SessionStart` ma `source` (`startup`) i `model`; `Stop` ma `last_assistant_message`.
- **`Notification` ma `notification_type`.** Nagrano `idle_prompt` z komunikatem „Claude is waiting for your input”, który przychodzi po skończeniu tury. **Rekomendacja:** `permission_prompt` → `needs_you`; `idle_prompt` nie zmienia stanu (sesja zostaje w `done`), bo inaczej każda skończona sesja przechodziłaby w `needs_you`.
- **Moja sesja desktop też wywołuje hooki** z `~/.claude/settings.json`, więc `hook.exe` obsłuży sesje desktop i CLI tym samym mechanizmem.
- **Nie nagrano:** `PreCompact`, `SubagentStop`, `Notification` z `permission_prompt` (sesja działała w trybie `auto`). Ich obsługa zostaje zgodna z planem; próbki uzupełnimy przy weryfikacji w tasku 15.

## S4: przejście do sesji

| Mechanizm | Wynik |
|---|---|
| Protokół aplikacji desktop | `claude://` zarejestrowany (`Claude.exe "%1"`). Format linku do konkretnej sesji jest nieudokumentowany; do sprawdzenia w fazie 3. |
| Protokół CLI | `claude-cli://` → `claude.exe --handle-uri "%1"`. Format nieznany; do sprawdzenia w fazie 3. |
| Protokół Codexa | `codex://` zarejestrowany (aplikacja AppX). Format nieznany. |
| Łańcuch procesów CLI | `claude.exe` ← `pwsh.exe` ← `WindowsTerminal.exe`. `pid::agent_pid()` (pomija powłoki) trafi w `claude.exe`; do fokusu trzeba iść dalej w górę, do procesu z oknem. |
| Fokus okna terminala | **Działa.** `SetForegroundWindow(MainWindowHandle)` z procesu w tle przełączył fokus od razu, bez sztuczki z Alt. Tytuł okna WT zawiera nazwę sesji Claude'a. |
| Konkretna karta WT | Brak bezpośredniego API. `wt -w 0 focus-tab -t <index>` wymaga numeru karty. Do rozważenia w fazie 3: UI Automation po tytule karty (nazwa sesji). |
| VS Code | `code` jest w PATH; `code --reuse-window <cwd>`. Fokus terminala w VS Code tylko przez okno. |

## Rekomendacja

1. **Limity i kontekst Claude'a:** przelotka statusline (faza 3) czyta `rate_limits.*`, `context_window.*` i `session_name`, wysyła je do `ingest` (nowa ścieżka `POST /v1/events/claude-statusline`) i wywołuje dotychczasowy statusline użytkownika. Dla sesji desktop kontekst zostaje z transkryptu.
2. **Postęp:** zmiana w planie fazy 1 (task 7). Postęp liczy śledzenie `TaskCreate`/`TaskUpdate` per sesja na podstawie hooków `PostToolUse`.
3. **`Notification`:** zmiana w planie (task 7). Tylko `notification_type == "permission_prompt"` albo brak typu daje `needs_you`; `idle_prompt` jest ignorowany.
4. **Łańcuch przejścia (faza 3):**
   1. deep link `claude://` lub `codex://`, jeśli uda się ustalić format;
   2. fokus okna przodka z oknem (`WindowsTerminal`, `Code`, `Claude`) przez `SetForegroundWindow`;
   3. nowy terminal z `claude --resume <id>` lub `codex resume <id>`.
