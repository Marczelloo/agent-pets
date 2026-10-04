# Claude Code mod integration (release 0.16): design

Written 2026-10-04 from the conversation with the owner; every section was approved in chat. Goal: use the new Claude Code
mods (function-hook plugins) to get live Claude limits everywhere, fix the gaps of the classic-hook integration, and add
Agent Pets features inside Claude Code itself.

## Decisions

- **Approach A, the mod is an enhancer.** Classic hooks stay the source of session state. The mod sends only what hooks
  cannot (limits, context, cost, turn-end reason, model) and draws the UI inside Claude Code. The mod API is early access:
  a Claude Code update that breaks the mod may take away the extras, never the core.
- **Distribution: both.** The app installs the plugin into `~/.claude/skills/agent-pets/` when Claude Code is enabled
  (auto-loads as `agent-pets@skills-dir`); the repo also carries a marketplace for manual installs (Mac/Linux users
  without the widget get the terminal pet and `/pets` for the current session).
- **In-Claude features in this release:** live limits, `/pets` pane, nudges about other agents, pixel pet above the prompt.
- **Old limit sources:** the statusline pass-through is removed (with restore of the user's statusline); oauth/usage
  polling (opt-in) and the Claude desktop samples stay as fallbacks for when no Claude session runs.

## Success criteria

- Claude 5h/weekly limits with exact reset times update after every turn, in terminal and desktop-app sessions, without
  reading `.credentials.json`.
- An interrupted, failed or limit-hit turn ends the pet's animation within a second, without transcript parsing.
- A permission request shows its bubble immediately; a failed tool no longer leaves the pet "working".
- No duplicate events and no ghost sessions when hooks and mod both run.
- With the mod broken or absent, everything that works in 0.15.1 still works.

## 1. Components

### Plugin (`claude-plugin/` in the repo, versioned with the app)

- `.claude-plugin/plugin.json` (`name: "agent-pets"`, `version` = app version, `types` when `$.state` is used),
  `hooks/hooks.json` → `{ "modules": ["./register.tsx"] }`.
- `hooks/register.tsx`: wires the parts below.
- `hooks/bridge.ts`: finds the widget (`$.env.get("USERPROFILE")` or `HOME` → `~/.agent-pets/endpoint.json`, re-read after
  a failed request), `send(payload)` and `state()`. Token kept in memory only; requests only to `127.0.0.1`.
- `hooks/report.ts`: `session.start`, `session.measure`, `turn.complete`, `session.end` → payloads.
- `hooks/pane.tsx`: `/pets`.
- `hooks/nudge.ts`: toasts and status-line text about other agents.
- `hooks/pet.tsx` + `hooks/sprites.ts`: the Raster pet.
- `*.test.ts` for `claude plugin test`.
- Repo root `.claude-plugin/marketplace.json` listing the plugin (`/plugin marketplace add Marczelloo/agent-pets`).

### App (Rust)

- `ingest.rs`: `POST /v1/events/claude-mod` (Bearer as the other routes, `Incoming::ClaudeMod`, gated by
  `apps.claude_code` like the hook route) and `GET /v1/state` (Bearer).
- `claude/plugin.rs` (new): payload → `Vec<Event>`, pure and unit-tested (pattern of `claude/statusline.rs`).
- `integrations.rs`: enabling Claude Code also places the plugin (write only when contents differ, like `place_hook`);
  a separate setting `claude_mod` (default on) removes or restores it; `claude_needs_repair` also checks the plugin
  version; `uninstall_all` removes it. Plugin files are embedded in the binary at build time.
- Settings window: a "Claude Code mod" switch under Claude Code; the statusline switch is removed (UI, wizard, i18n).

## 2. Protocol

### Mod → widget: `POST /v1/events/claude-mod`

```json
{ "v": 1, "kind": "start" | "measure" | "turn_end" | "end",
  "session_id": "<$.session.id>", "ts": 1790000000000,
  "cwd": "C:/...", "model": "claude-opus-5-5",
  "context": { "tokens": 81234, "window": 1000000, "percent": 8 },
  "rate_limits": [{ "kind": "five_hour", "percent_used": 23.5, "resets_at": "2026-10-04T18:00:00Z" }],
  "cost_usd": 1.42, "reason": "answer" | "aborted" | "refusal" | "error" }
```

Fields absent when the engine has no figure (never zeroed). Responses: 204, 400 (bad JSON or `v` not 1), 401, 413.
On 400 the mod stops sending for the session (an old app with a newer mod).

Mapping in `claude/plugin.rs`:

- `measure.rate_limits` → `Kind::Limits` on a dedicated session id `claude-mod-usage` (mapped to "claude_usage" like
  `account_usage::SESSION_ID`): `five_hour` → `Window::FiveHour`, `seven_day` → `Window::Weekly`, `resets_at` ISO → ms,
  `spend_limit` ignored. Limits apply even when the session is unknown (they are per account). Newest reading wins as today.
- `measure.context` / `cost_usd` → `Meta` for the session (`Context { used: tokens, max: window }`, cost into `Usage`).
- `turn_end`: `aborted` → `TurnEnd`; `error` and `refusal` → `Error`; `answer` → nothing (the `Stop` hook covers it).
- `start`: `model` → `Meta`.
- Any non-limits event for a session id the runtime does not know is dropped (no ghost pets; hooks create sessions).
- The plan's first step confirms on a live session that `$.session.id` equals the hooks' `session_id`. If it differs,
  the plan adds a mapping by `cwd` + start time before anything else is built on it.

### Widget → mod: `GET /v1/state`

```json
{ "v": 1, "app_version": "0.16.0",
  "sessions": [{ "id": "...", "agent": "codex", "state": "needs_input", "title": "...", "question": "...",
                 "cwd": "...", "since": 1790000000000 }],
  "limits": [{ "agent": "claude", "window": "five_hour", "used_pct": 23.5, "resets_at": 1790000000000,
               "stale_since": null }] }
```

Only these fields: no transcript paths, pids, tokens or settings. Hidden and dismissed sessions are left out.
The mod polls every 3 s, only in an interactive session (`session.start` gave a surface); on failure it backs off to 30 s
and the UI falls back to the current session.

## 3. UI inside Claude Code (terminal surface only)

Desktop-app and `-p` sessions only report.

**`/pets`.** Registered in `session.start`; opens a read-only pane "Agent Pets", Esc closes:
- sessions from `/v1/state` grouped by agent: state, title, the question when waiting;
- 5h and weekly bars with reset time for every agent that has limits;
- without the widget: the current session and its limits, plus the line "Agent Pets widget not running";
- two toggles at the bottom, **Pet** and **Nudges**, kept in `$.store` (so they work without the widget).

**Nudges.** When another session (not this one) enters needs-input or error: `$.ui.toast("Codex waits: <question>")`,
question clipped to one line. Never for the current session, never twice for the same session+question, never for "done".
While anything waits, `$.ui.status("⏳ N waiting")`; cleared at zero.

**Pet.** An `AbovePrompt` band with one `Raster`: pixel Clawd about 16×8 cells, right-aligned, with a one-line status
beside it. State from the mod's own events (no widget needed): idle, thinking (turn running), working (`tool.call`),
waiting (permission or question), done (waves 3 s), error, sleeping (5 min idle). 2–4 frames per state at 5 fps through
`$.clock.every` + `$.ui.blit`. Hidden below 60 columns. On by default. Sprites are hand-drawn in `sprites.ts` in the
colours of `PIXEL_PAL.clawd` (`app/src/renderer/models/pixel.ts`).

## 4. Classic hooks, limits migration, errors, tests

### New classic hook events

`hooks_install::EVENTS` grows from 9 to 15; `installed_count`/`status` compare against `EVENTS.len()`. Mapping in
`claude/hook.rs` (exact payload fields confirmed against real events in the plan's first step):

| Event | Today | After |
|---|---|---|
| `PermissionRequest` | bubble waits for `Notification` | `NeedsInput` at once, question "Allow <action>?" (same text as today) |
| `PostToolUseFailure` | no `ToolEnd`, pet stays "working" | `ToolEnd`; `is_interrupt` → `TurnEnd` |
| `SubagentStart` | mini pet after the first subagent tool | child `SessionStart` at once |
| `StopFailure` | errors and limit hits read from the transcript | `Error`; transcript stays as fallback |
| `PostCompact` | compact state until the next event | ends the compact state |
| `Elicitation` / `ElicitationResult` | not seen | `NeedsInput` with the MCP question / back to working |

Existing installs read as incomplete (9/15); the existing `claude_needs_repair` path reinstalls them after the update.
Check that `hook.exe` forwards the new events unfiltered.

### Limits migration

- First start of 0.16: if the statusline pass-through is installed, remove it and restore the user's original statusline
  (`set_statusline(false)`); drop the setting and its UI.
- `hook.exe --agent-pets-statusline` keeps working for this release as pass-through only (prints the original statusline,
  sends nothing), so a config the migration missed does not break; the route and `claude/statusline.rs` are removed.
- oauth/usage polling stays opt-in but skips a request when a mod limits reading arrived in the last 10 min.
- Claude desktop samples unchanged.

### Errors

- Every mod hook calls `next(e)` first and does its work after, inside try/catch; a mod error never blocks or slows a turn.
- `fetch` is fire-and-forget for reports; 30 s backoff while the widget does not answer.
- The app never trusts mod data beyond the schema: unknown fields ignored, percent clamped 0–100 for display,
  bodies over 1 MiB refused.

### Tests

- Rust: `claude/plugin.rs` mapping; the two routes (401, 400 on `v`, 204, `/v1/state` carries no sensitive fields and
  no hidden sessions); the six new hook mappings; plugin place/remove/repair; statusline migration; polling skip.
- Mod: `claude plugin validate` and `claude plugin test` for bridge without widget, payload mapping, nudge dedupe,
  pet state machine. Run in `scripts/release.ps1`; in CI when the `claude` CLI installs on the runner (the plan checks).
- Tests must not assume Polish UI or the local timezone (CI runs English Windows in UTC).
- Docs: `docs/agents.md` (Claude section, limits), `docs/privacy.md` (new routes, no credentials), README, CHANGELOG.
  Version 0.16.0.

## Later (not in this release)

- `spend_limit` windows for Claude gateways.
- A terminal pet with other skins, and pets for other agents inside their own tools.
- Approach B (the mod replaces classic hooks) once the mod API is stable.
- Nudge and pet settings in the widget's Settings window instead of `/pets`.

## Spike findings (2026-10-04)

Claude Code 2.1.288, a throwaway mod plus capture hooks in a headless `claude -p` run. A child `claude -p` started from
the desktop app cannot log in (its OAuth is host-refreshed), so the run ended at the first API call with an
authentication error; the rest comes from the engine's own type declarations for this build.

1. **Gate passed.** `$.session.id()` equals the classic hooks' `session_id` (same UUID in `SessionStart`,
   `UserPromptSubmit`, `StopFailure` and every mod event). It is a function returning a promise, not a property.
   `session.end` also carries `sessionId`. No pairing by `cwd` is needed.
2. **Payloads** (base fields on all: `session_id`, `transcript_path`, `cwd`, `prompt_id?`, `permission_mode?`,
   `agent_id?`, `agent_type?`):
   - `PermissionRequest`: `tool_name`, `tool_input`, `permission_suggestions?`, `mcp_server?`.
   - `PostToolUseFailure`: `tool_name`, `tool_input`, `tool_use_id`, `error`, `is_interrupt?`, `duration_ms?`.
   - `SubagentStart`: `agent_id`, `agent_type` (both required).
   - `StopFailure` (seen live): `error` (`authentication_failed`, `rate_limit`, `overloaded`, `billing_error`,
     `server_error`, `max_output_tokens`, `unknown`, …), `error_details?`, `last_assistant_message?`.
   - `PostCompact`: `trigger` (`manual` | `auto`), `compact_summary`.
   - `Elicitation`: `mcp_server_name`, `message`, `mode?`, `url?`, `elicitation_id?`, `requested_schema?`.
   - `ElicitationResult`: `mcp_server_name`, `elicitation_id?`, `mode?`, `action` (`accept` | `decline` | `cancel`),
     `content?`.
   Fixtures in `crates/pets-core/tests/fixtures/claude/hooks/`; only `StopFailure` was observed live, the other six
   follow the declarations.
3. **`session.measure`**: `{ context: { window, tokens?, percent? }, rateLimits: [{ kind, percentUsed, resetsAt? }],
   cost?: { usd }, changed }`. `resetsAt` is an ISO 8601 string, `percentUsed` camelCase with one decimal, `kind`
   `five_hour` | `seven_day` | `spend_limit`. `rateLimits` is empty off a subscription and before the first reading.
   It fires after `turn.complete` also in `-p` runs. `turn.complete.reason` was `error` for the auth failure.
   `session.start` under `-p`: `surface: null`, `isInteractive: false`.
4. **`on()` needs literal event names**: `claude plugin validate` refuses `on(ev, …)` with a computed name.
   `$.fs.write` to an absolute path outside the working directory works.
5. **Duplicate copies** (not tried live): `$.plugin` gives `name` and `root`. Guard for Task 7: a copy whose
   `$.plugin.root` is not `~/.claude/skills/agent-pets` stays silent (no reports, no UI) when
   `~/.claude/skills/agent-pets/.claude-plugin/plugin.json` exists, so the app-installed copy, matching the app
   version, wins.
6. **CI**: `claude plugin validate` and `claude plugin test` run without a login (checked with an expired one). The
   runner install (`npm i -g @anthropic-ai/claude-code`) is unchecked: the CI step is non-blocking until it passes
   once; `scripts/release.ps1` runs both checks blocking.
