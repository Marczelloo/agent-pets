# Spike S5: formaty Codexa i Claude Code oraz próbki testowe

- **Data:** 2026-09-24
- **Wersje:** Codex CLI 0.155.1 (rollouty z wersji 0.155.0-alpha), Claude Code 2.1.270
- **Próbki:** `crates/pets-core/tests/fixtures/` (zanonimizowane przez `tools/anonymize.py`; test anonimizatora: `python tools/test_anonymize.py`)

## Codex: tabela z planu potwierdzona, z jedną poprawką

Tabela „Co już wiadomo o formatach” w planie zgadza się z plikami. Poprawka:

- **`rate_limits.primary` i `rate_limits.secondary` nie mają stałego znaczenia.** W starszej sesji `primary` miało `window_minutes: 10080` (tydzień). Okno trzeba rozpoznawać po `window_minutes` (300 → 5h, 10080 → tydzień), a nie po nazwie klucza. Parser z tasku 9 już tak robi.

**Próbki:**

| Plik | Zawartość |
|---|---|
| `codex/desktop-tools.jsonl` | Codex Desktop, 71 linii, najwyżej 4 zdarzenia każdego rodzaju: `session_meta`, `task_started`/`task_complete`/`turn_aborted`, `token_count` z limitami, `item_completed` (`UserMessage`, `AgentMessage`, `FileChange`, `CommandExecution`, `McpToolCall`, `WebSearch`, `ContextCompaction`), `compacted`, `custom_tool_call` `exec` (`tools.shell_command(`, `tools.update_plan(`), `function_call` `wait`, wyjścia narzędzi |
| `codex/router-task.jsonl` | `originator: "agent-router"`, bez `thread_source` |
| `codex/aborted.jsonl` | `turn_aborted` (`originator: "probe"`) |

Linie `world_state`, `turn_context`, `token_usage_record` i `reasoning` są pomijane: parser ich nie potrzebuje, a są duże.

## Claude Code

- **Hooki:** struktura opisana w `S3-S4-claude-limits-jump.md`.
  - **Próbki** (`claude/hooks/`): `SessionStart`, `UserPromptSubmit`, `PreToolUse-Write`, `PostToolUse-Write`, `PreToolUse-TaskCreate`, `PostToolUse-TaskCreate`, `PostToolUse-TaskUpdate`, `Notification` (`idle_prompt`), `Stop`, `SessionEnd`.
- **Transkrypt:** `claude/desktop-session.jsonl`, 18 linii: `entrypoint: "claude-desktop"`, `custom-title`, `assistant.message.usage`.

## Zmiany w planie wynikające z S3–S5

1. **Task 7, postęp:** nowy `claude::hook::TaskTracker`, który śledzi `TaskCreate` (id z `tool_response.task.id`) i `TaskUpdate` (`status`: `completed`, `pending`, `in_progress`, `deleted`) per sesja i zwraca `Meta` z postępem. `TodoWrite` zostaje dla starszych wersji.
2. **Task 7, narzędzia listy zadań** (`TaskCreate`, `TaskUpdate`, `TaskList`, `TaskGet`): to księgowość, nie praca, więc nie dają `ToolStart` ani `ToolEnd`.
3. **Task 7, `Notification`:** `notification_type == "idle_prompt"` jest ignorowany.
4. **Task 14:** `on_hook` wywołuje też `TaskTracker::observe`.
