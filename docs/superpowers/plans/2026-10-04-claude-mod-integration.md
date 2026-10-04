# Claude Code mod integration (0.16) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship release 0.16.0: an Agent Pets Claude Code mod (live limits, context, cost, turn-end reason, `/pets`, nudges,
terminal pet), seven new classic hook events, and the removal of the statusline pass-through.

**Architecture:** Classic hooks stay the source of session state. A plugin in `claude-plugin/` (embedded in the app and
placed in `~/.claude/skills/agent-pets/`) POSTs extras to a new ingest route `/v1/events/claude-mod` and reads a filtered
board from `GET /v1/state`. Pure mapping lives in `pets-core` (`claude/plugin.rs`, `mod_state.rs`); the app only wires it.

**Tech Stack:** Rust (pets-core, pets-hook, Tauri 2 app, tiny_http, serde), React/TS (settings UI, vitest), Claude Code
mods API build 2.1.288 (TS/TSX hooks module, `claude plugin validate` / `claude plugin test`).

**Spec:** `docs/superpowers/specs/2026-10-04-claude-mod-integration-design.md`

**Mod API reference:** grep `C:/Users/moskw/AppData/Local/Temp/claude/bundled-skills/2.1.286/0adeb58d614d9122b650912019e28053/plugin-authoring/types/claude-code.d.ts`
(and `reference.md`, `examples/` beside it) for every `$` call before writing it. That folder is regenerated per Claude
process; if it is gone, load the `plugin-authoring` skill and use the path it prints.

## Global Constraints

- Version 0.16.0 everywhere: `Cargo.toml` workspace, `app/package.json`, `app/src-tauri/tauri.conf.json`, `claude-plugin/.claude-plugin/plugin.json`.
- Classic hooks remain the baseline: with the mod absent or broken every 0.15.1 behaviour still works.
- No credentials: the mod never reads `~/.claude/.credentials.json`; tokens never in URLs or logs; the endpoint token is held in memory only.
- `/v1/state` carries only `v, app_version, sessions[id, agent, state, title, question, cwd, since], limits[agent, window, used_pct, resets_at, stale_since]`; no hidden/dismissed sessions, transcript paths, pids, tokens or settings.
- Mod requests only to `http://127.0.0.1:<port>`; every mod hook calls `next(e)` first, then works inside try/catch; report fetches are fire-and-forget; 30 s backoff while the widget does not answer.
- Request bodies over 1 MiB → 413 (existing `MAX_BODY`); percent values clamped 0–100 before they reach the store.
- Tests must not assume Polish UI or the local timezone (CI: English Windows, UTC). Use `Lang::En` or both languages explicitly.
- Rust code style: the repo's terse one-line helpers, `tr(lang, pl, en)` for user-facing strings, comments only where the surrounding code has them.
- Windows scripted edits: Python with `newline=''` (LF); no backslashes in bash heredocs.
- Commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` (subagents on Sonnet use their own model name).

## Review Focus

1. **Plugin installed twice** (app copy in `skills/agent-pets` + marketplace copy): users expect one pet, one report stream. Task 0 records what the engine does with two plugins named `agent-pets`; Task 7's bridge test pins the guard chosen there.
2. **Old app, new mod / new app, old mod**: a `v` mismatch must answer 400 and the mod must stop sending for that session, not retry every turn (Task 3 test for 400, Task 7 test for stop-after-400).
3. **Widget restarted mid-session** (new port and token in `endpoint.json`): the mod re-reads the endpoint after a failed request and recovers within one backoff period (Task 7 test).
4. **Limits from a session the widget never saw** (mod loaded, hooks not yet installed, or a desktop-app session): limits still apply, nothing else creates a pet (Task 3 runtime test).
5. **Narrow terminal / non-terminal surface**: below 60 columns or on desktop/vscode/mobile the pet band draws nothing and never throws (Task 10 test over all surfaces).

---

## File map

| Path | Task | Responsibility |
|---|---|---|
| `crates/pets-core/src/hooks_install.rs` | 1 | `EVENTS` 9 → 16, matcher `*` for the new tool-scoped events |
| `crates/pets-core/src/integrations.rs` | 1, 6, 11 | status by `EVENTS.len()`; statusline helpers kept only for migration; plugin place/remove/repair |
| `crates/pets-core/src/claude/hook.rs` | 1 | mappings of the new events |
| `crates/pets-core/tests/fixtures/claude/hooks/*.json` | 0, 1 | real payloads of the new events |
| `crates/pets-core/src/claude/plugin.rs` (new) | 2 | `ModPayload` → events + cost |
| `crates/pets-core/src/ingest.rs` | 3, 6 | `/v1/events/claude-mod`, `GET /v1/state`, replies with a body; statusline route removed |
| `crates/pets-core/src/runtime.rs` | 3, 6 | `Incoming::ClaudeMod` handling, `StateBoard`, `source_key` |
| `crates/pets-core/src/mod_state.rs` (new) | 4 | board JSON from visible sessions + limits |
| `app/src-tauri/src/core.rs` | 4, 5 | write the board after every publish; poll skip wiring |
| `app/src-tauri/src/usage.rs` | 5 | `mod_reading_recent` |
| `crates/pets-core/src/claude/statusline.rs` | 6 | deleted |
| `crates/pets-hook/src/main.rs` | 6 | statusline mode = pass-through only |
| `crates/pets-core/src/settings.rs`, `app/src-tauri/src/settings.rs`, `app/src-tauri/src/lib.rs` | 6, 11 | drop `claude_statusline`, migration, `claude_mod` |
| `app/src/settings/{SettingsView,Wizard,model}.tsx/ts`, `app/src/types.ts`, `app/src/main.tsx`, i18n | 6, 11 | statusline UI out, mod switch in |
| `app/src/panel/model.ts` | 11 | `usageLine` hides 0 tokens |
| `claude-plugin/**` (new) | 7–10 | the mod |
| `.claude-plugin/marketplace.json` (new) | 12 | marketplace entry |
| `scripts/release.ps1`, `.github/workflows/ci.yml`, docs, versions | 12 | release wiring |

Task order: 0 → 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9 → 10 → 11 → 12. Tasks 1, 5 and 6 are independent of 2–4 once 0 is done.

---

### Task 0: Live spike (main session only, not delegated)

Needs a real Claude Code session on this machine; produces facts the later tasks depend on. Nothing here ships.

**Files:**
- Create (throwaway): `C:\Users\moskw\.claude\dev-mods\<session>\ap-spike\` (`.claude-plugin/plugin.json`, `hooks/hooks.json`, `hooks/register.ts`)
- Create: `crates/pets-core/tests/fixtures/claude/hooks/{PermissionRequest,PostToolUseFailure,SubagentStart,StopFailure,PostCompact,Elicitation,ElicitationResult}.json`
- Modify: spec, new section `## Spike findings (2026-10-04)`

- [ ] **Step 1: Spike mod.** `register.ts` hooks `session.start`, `session.measure`, `turn.complete`, `session.end`, `tool.call`; each does `const r = await next(e)` then appends `JSON.stringify({ev, sid: $.session.id, e})` to `<USERPROFILE>/.agent-pets/spike.jsonl` via `$.fs.read` + `$.fs.write` (absolute path from `$.env.get("USERPROFILE")`). Validate with `claude plugin validate <dir>`.
- [ ] **Step 2: Classic capture.** Temporarily add to `~/.claude/settings.json` a hook for each of the 7 new events with command `powershell -NoProfile -Command "$input | Out-File -Append -Encoding utf8 $env:USERPROFILE\.agent-pets\spike-hooks.jsonl"` (back up settings first, restore after).
- [ ] **Step 3: Drive a session** in a terminal (`claude` in a scratch dir): trigger a permission prompt, a failing Bash command, an interrupted tool (Esc), a Task subagent, `/compact`, and if available an MCP elicitation. Ask the user to run it if an interactive TTY is needed.
- [ ] **Step 4: Record answers** in the spec's new section:
  1. `$.session.id` == classic `session_id`? (**gate:** if not, stop and redesign pairing by `cwd` + start time with the user before Task 2).
  2. Exact field names of the 7 payloads (`is_interrupt`, `trigger`, `agent_id`, `agent_type`, `message`, `error`…).
  3. Shape of `session.measure.rateLimits[].resetsAt` (ISO string vs ms) and `context.window`.
  4. Do two plugins named `agent-pets` (skills-dir + `--plugin-dir`) both load? Pick the guard for Task 7 (e.g. the copy whose `plugin.json` path is not under `~/.claude/skills/agent-pets` disables itself when that one exists).
  5. Does `npm i -g @anthropic-ai/claude-code` + `claude plugin validate`/`claude plugin test` run without login? (decides CI in Task 12).
- [ ] **Step 5:** Save one representative payload per event (session ids replaced by `"s"`, paths by `C:/p`) as the fixture files above. Remove the spike mod, the temp hooks and both jsonl files.
- [ ] **Step 6: Commit** `docs: spike findings for the Claude mod` (spec + fixtures).

---

### Task 1: New classic hook events

**Files:** Modify `crates/pets-core/src/hooks_install.rs:4`, `crates/pets-core/src/integrations.rs` (`status` for ClaudeCode), `crates/pets-core/src/claude/hook.rs:47-122` + tests module.

**Interfaces:**
- Produces: `hooks_install::EVENTS: [&str; 16]` = the 9 existing + `"PermissionRequest", "PostToolUseFailure", "SubagentStart", "StopFailure", "PostCompact", "Elicitation", "ElicitationResult"` (the spec says 15; Elicitation and ElicitationResult are two events, so 16).
- `install` gives `"matcher": "*"` to `PermissionRequest` and `PostToolUseFailure` as it does for Pre/PostToolUse.
- `integrations::status(ClaudeCode)` reads installed when `installed_count == EVENTS.len()`, else `"n/{EVENTS.len()}"`.

Mapping in `to_events` (field names as confirmed in Task 0):

| Event | Result |
|---|---|
| `PermissionRequest` | `NeedsInput` on the parent; `question` = `question_text(None, act.map(|a| (tool_name, a)).or(last), None, lang)` where `act = action_text(tool_name, tool_input, lang)`; `from_child = agent_id.is_some()` |
| `PostToolUseFailure` | `is_interrupt == true` → `TurnEnd` on the parent; else `ToolEnd`, in the child when `agent_id` is set (add it to `in_child`) |
| `SubagentStart` | `child(sid, agent_id, p, Kind::SessionStart, ts)`; no `agent_id` → nothing |
| `StopFailure` | `Error` |
| `PostCompact` | `trigger == "manual"` → `TurnEnd`; otherwise `ToolEnd` |
| `Elicitation` | `NeedsInput`, `question` = `message` clipped to one line (reuse the clipping `question_text` uses) |
| `ElicitationResult` | `ToolEnd` |

- [ ] **Step 1: Failing tests** in `hook.rs` tests (use `Lang::En`, `fixture(...)` from Task 0 plus inline `env(json!(...))` cases):

```rust
#[test]
fn new_hook_events_map() {
    let k = |v| to_events(&env(v), Lang::En, None).iter().map(|e| (e.session_id.clone(), e.kind)).collect::<Vec<_>>();
    assert_eq!(k(json!({"session_id":"s","hook_event_name":"StopFailure"})), [("s".into(), Kind::Error)]);
    assert_eq!(k(json!({"session_id":"s","hook_event_name":"PostCompact","trigger":"manual"})), [("s".into(), Kind::TurnEnd)]);
    assert_eq!(k(json!({"session_id":"s","hook_event_name":"PostCompact","trigger":"auto"})), [("s".into(), Kind::ToolEnd)]);
    assert_eq!(k(json!({"session_id":"s","hook_event_name":"PostToolUseFailure","tool_name":"Bash"})), [("s".into(), Kind::ToolEnd)]);
    assert_eq!(k(json!({"session_id":"s","hook_event_name":"PostToolUseFailure","tool_name":"Bash","is_interrupt":true})), [("s".into(), Kind::TurnEnd)]);
    assert_eq!(k(json!({"session_id":"s","hook_event_name":"PostToolUseFailure","tool_name":"Bash","agent_id":"a"})), [("s/a".into(), Kind::ToolEnd)]);
    assert_eq!(k(json!({"session_id":"s","hook_event_name":"SubagentStart","agent_id":"a","agent_type":"Explore"})), [("s/a".into(), Kind::SessionStart)]);
    assert_eq!(k(json!({"session_id":"s","hook_event_name":"ElicitationResult"})), [("s".into(), Kind::ToolEnd)]);
}

#[test]
fn permission_request_asks_at_once_with_the_tool_action() {
    let e = &to_events(&env(json!({"session_id":"s","hook_event_name":"PermissionRequest","tool_name":"Bash",
        "tool_input":{"command":"cargo test"}})), Lang::En, None)[0];
    assert_eq!(e.kind, Kind::NeedsInput);
    assert!(e.data.question.as_deref().unwrap().contains("cargo test"));
}

#[test]
fn elicitation_carries_the_mcp_question_on_one_line() {
    let e = &to_events(&env(json!({"session_id":"s","hook_event_name":"Elicitation","message":"Pick a repo\nplease"})), Lang::En, None)[0];
    assert_eq!(e.kind, Kind::NeedsInput);
    assert!(!e.data.question.as_deref().unwrap().contains('\n'));
}

#[test]
fn subagent_start_names_the_child_type() {
    let e = &to_events(&env(json!({"session_id":"s","hook_event_name":"SubagentStart","agent_id":"a","agent_type":"Explore"})), Lang::En, None)[0];
    assert_eq!(e.data.parent.as_deref(), Some("s"));
    assert_eq!(e.data.sub.as_ref().unwrap().agent_type.as_deref(), Some("Explore"));
}
```

Extend `real_hook_fixtures_parse` to iterate the 7 new fixture files and assert each yields at least one event. In `hooks_install.rs` tests: `install` then `installed_count == EVENTS.len()`; a settings file with only the old 9 → `installed_count == 9` and `integrations::claude_needs_repair` true (temp home).

- [ ] **Step 2:** `cargo test -p pets-core claude::hook hooks_install integrations` → new tests FAIL.
- [ ] **Step 3: Implement** the mapping arms and the `EVENTS`/matcher/status changes. In `HookState::events`, record the `PermissionRequest` action as the session's last action like `PreToolUse` does, so the `Notification` that follows asks the same question.
- [ ] **Step 4:** Check `crates/pets-hook/src/main.rs` `run()` forwards these events unfiltered and prints nothing for them (no decision on `PermissionRequest`); add a test there if `run` has a caller filter that would drop them.
- [ ] **Step 5:** `cargo test -p pets-core -p pets-hook` → PASS.
- [ ] **Step 6: Commit** `feat(claude): permission, failure, subagent-start, stop-failure, compact and elicitation hooks`.

---

### Task 2: `claude/plugin.rs` mapping

**Files:** Create `crates/pets-core/src/claude/plugin.rs`; modify `crates/pets-core/src/claude/mod.rs` (`pub mod plugin;`).

**Interfaces (produces):**

```rust
pub const USAGE_SESSION_ID: &str = "claude-mod-usage";

#[derive(Deserialize, Debug, Clone, Default, PartialEq)] #[serde(default)]
pub struct ModPayload {
    pub v: u32, pub kind: String, pub session_id: String, pub ts: i64,
    pub cwd: Option<String>, pub model: Option<String>, pub context: Option<ModContext>,
    pub rate_limits: Vec<ModLimit>, pub cost_usd: Option<f64>, pub reason: Option<String>,
}
#[derive(Deserialize, Debug, Clone, Default, PartialEq)] #[serde(default)]
pub struct ModContext { pub tokens: Option<u64>, pub window: Option<u64>, pub percent: Option<f64> }
#[derive(Deserialize, Debug, Clone, Default, PartialEq)] #[serde(default)]
pub struct ModLimit { pub kind: String, pub percent_used: f64, pub resets_at: Option<String> }

pub struct ModUpdate { pub events: Vec<Event>, pub cost: Option<f64> }
pub fn to_update(p: &ModPayload) -> ModUpdate;
```

Rules:
- `rate_limits` (any `kind` of payload): one `Kind::Limits` event on `USAGE_SESSION_ID`, `Source::Claude`, `ts = p.ts`, `data.limits` = mapped entries: `five_hour` → `Window::FiveHour`, `seven_day` → `Window::Weekly`, others skipped; `used_pct = clamp(percent_used, 0, 100) as f32`; `resets_at` via `crate::time::rfc3339_ms` (if Task 0 found ms numbers instead, accept both: deserialize into `serde_json::Value` and branch); `agent: Agent::Claude`, `stale_since: None`. No mapped entry → no Limits event.
- `measure` with `context.tokens` and `context.window` → `Meta` on `session_id` with `Context { used: tokens, max: window }`; only `percent` + `window` → `used = percent/100 * window`.
- `start` with `model` → `Meta` with `data.model`, and `data.cwd` when present.
- `turn_end`: `aborted` → `TurnEnd`; `error` | `refusal` → `Error`; anything else → nothing.
- `cost` = `cost_usd` (negative or non-finite → `None`).
- Empty `session_id` → only the Limits event.

- [ ] **Step 1: Failing tests** in `plugin.rs`:

```rust
fn p(v: serde_json::Value) -> ModPayload { serde_json::from_value(v).unwrap() }

#[test]
fn rate_limits_become_one_limits_event_on_the_usage_session() {
    let u = to_update(&p(json!({"v":1,"kind":"measure","session_id":"s","ts":5,"rate_limits":[
        {"kind":"five_hour","percent_used":23.5,"resets_at":"2026-10-04T18:00:00Z"},
        {"kind":"seven_day","percent_used":140.0},
        {"kind":"spend_limit","percent_used":10.0}]})));
    let e = u.events.iter().find(|e| e.kind == Kind::Limits).unwrap();
    assert_eq!(e.session_id, USAGE_SESSION_ID);
    assert_eq!(e.data.limits.len(), 2);
    assert_eq!(e.data.limits[0].window, Window::FiveHour);
    assert_eq!(e.data.limits[0].resets_at, crate::time::rfc3339_ms("2026-10-04T18:00:00Z"));
    assert_eq!(e.data.limits[1].used_pct, 100.0);
}

#[test]
fn context_and_cost_go_to_the_session() {
    let u = to_update(&p(json!({"v":1,"kind":"measure","session_id":"s","ts":5,
        "context":{"tokens":81234,"window":1000000,"percent":8},"cost_usd":1.42})));
    let m = u.events.iter().find(|e| e.kind == Kind::Meta).unwrap();
    assert_eq!(m.session_id, "s");
    assert_eq!(m.data.context, Some(Context { used: 81234, max: 1000000 }));
    assert_eq!(u.cost, Some(1.42));
}

#[test]
fn turn_end_reasons_map() {
    let k = |r: &str| to_update(&p(json!({"v":1,"kind":"turn_end","session_id":"s","ts":5,"reason":r}))).events.iter().map(|e| e.kind).collect::<Vec<_>>();
    assert_eq!(k("aborted"), [Kind::TurnEnd]);
    assert_eq!(k("error"), [Kind::Error]);
    assert_eq!(k("refusal"), [Kind::Error]);
    assert!(k("answer").is_empty());
}

#[test]
fn start_carries_the_model_and_unknown_fields_are_ignored() {
    let u = to_update(&p(json!({"v":1,"kind":"start","session_id":"s","ts":5,"model":"claude-opus-5-5","extra":{"x":1}})));
    assert_eq!(u.events[0].data.model.as_deref(), Some("claude-opus-5-5"));
}

#[test]
fn missing_figures_send_nothing() {
    let u = to_update(&p(json!({"v":1,"kind":"measure","session_id":"s","ts":5})));
    assert!(u.events.is_empty() && u.cost.is_none());
}
```

(Check `rfc3339_ms`'s return type; adjust the `resets_at` assert to it.)

- [ ] **Step 2:** `cargo test -p pets-core claude::plugin` → FAIL (module missing).
- [ ] **Step 3:** Implement `to_update` per the rules (pattern: `claude/account_usage.rs::to_event`).
- [ ] **Step 4:** Tests PASS.
- [ ] **Step 5: Commit** `feat(claude): mod payload mapping`.

---

### Task 3: Ingest routes and runtime handling

**Files:** Modify `crates/pets-core/src/ingest.rs`, `crates/pets-core/src/runtime.rs`.

**Interfaces:**
- Consumes: `claude::plugin::{ModPayload, to_update, USAGE_SESSION_ID}` (Task 2).
- Produces:
  - `pub type StateBoard = Arc<RwLock<Vec<u8>>>;` in `ingest.rs`.
  - `Incoming::ClaudeMod(ModPayload)`.
  - `Ingest::start(token, tx, doors, board: StateBoard)`.
  - `Runtime::state_board(&self) -> StateBoard` (Runtime creates it, initialised to `mod_state::empty(app_version)` from Task 4; until Task 4 lands use `b"{\"v\":1,\"sessions\":[],\"limits\":[]}".to_vec()`).
  - `source_key`: `USAGE_SESSION_ID` → `"claude_mod_usage"`.

Ingest behaviour:
- `handle_request` returns `(u16, Option<Vec<u8>>)`; the server loop sends `Response::from_data(body).with_header(Content-Type: application/json)` when a body is present, else `Response::empty(status)`.
- `GET /v1/state` with valid Bearer → 200 + board bytes; bad token → 401. Any other GET → 404. POST to `/v1/state` → 404.
- `POST /v1/events/claude-mod` (not door-gated; the runtime gates by `apps.claude_code` like hooks): parse `ModPayload`; parse error or `v != 1` → 400; else send and 204.

Runtime `Incoming::ClaudeMod(p)` → `on_mod(p)`:
- `!self.apps.claude_code` → `false`.
- For each event of `to_update(&p).events`: apply when `kind == Kind::Limits` or `self.store.session(&e.session_id).is_some()`; otherwise drop.
- `cost` and a known session → `self.store.set_usage(&p.session_id, Some(Usage { tokens: 0, cost, account: Some(Agent::Claude) }))`.
- Returns whether anything changed.

- [ ] **Step 1: Failing ingest tests** (existing `post` helper; add a `get(port, path, token) -> (u16, String)` helper with `std::net::TcpStream` like `post`):

```rust
#[test]
fn claude_mod_route_checks_auth_and_version() {
    let (port, rx, _) = start_test();             // reuse the module's existing setup
    assert_eq!(post(port, "/v1/events/claude-mod", "bad", r#"{"v":1,"kind":"measure","session_id":"s","ts":1}"#), 401);
    assert_eq!(post(port, "/v1/events/claude-mod", TOKEN, r#"{"v":2,"kind":"measure","session_id":"s","ts":1}"#), 400);
    assert_eq!(post(port, "/v1/events/claude-mod", TOKEN, "not json"), 400);
    assert_eq!(post(port, "/v1/events/claude-mod", TOKEN, r#"{"v":1,"kind":"measure","session_id":"s","ts":1}"#), 204);
    assert!(matches!(rx.recv_timeout(Duration::from_secs(2)).unwrap(), Incoming::ClaudeMod(p) if p.session_id == "s"));
}

#[test]
fn state_route_serves_the_board_to_the_token_holder_only() {
    let (port, _rx, board) = start_test();
    *board.write().unwrap() = br#"{"v":1}"#.to_vec();
    assert_eq!(get(port, "/v1/state", "bad").0, 401);
    assert_eq!(get(port, "/v1/state", TOKEN), (200, r#"{"v":1}"#.to_string()));
    assert_eq!(get(port, "/v1/events/claude", TOKEN).0, 404);
}
```

(Adapt `start_test`/`TOKEN` to whatever the module's tests already use to start `Ingest`; add the `board` return.)

- [ ] **Step 2: Failing runtime tests** (follow the existing runtime test setup; feed `Incoming` through the channel or call a `#[cfg(test)]` helper that runs `on_mod` directly):
  - limits from an unknown session id are applied (`store.limits()` has `FiveHour` at 23.5) and no session is created;
  - `Meta`/`TurnEnd` for an unknown session are dropped (no session appears);
  - for a session created by a classic `SessionStart` hook: `turn_end`/`aborted` moves it to `State::Done`, `cost_usd` sets `usage == Some(Usage{tokens:0, cost:1.42, account:Some(Agent::Claude)})`;
  - with `apps.claude_code = false` nothing changes;
  - `last_seen()` gets key `"claude_mod_usage"` after a limits reading.
- [ ] **Step 3:** `cargo test -p pets-core ingest runtime` → FAIL.
- [ ] **Step 4:** Implement. Keep `MAX_BODY`/413 handling shared by both POST routes. Update every `Ingest::start` caller.
- [ ] **Step 5:** `cargo test -p pets-core` → PASS (the known flaky `Runtime::start` hang under `--workspace` is pre-existing; rerun once before investigating).
- [ ] **Step 6: Commit** `feat(ingest): claude-mod route and state board`.

---

### Task 4: State board rendering and publishing

**Files:** Create `crates/pets-core/src/mod_state.rs` (+ `pub mod mod_state;` in `lib.rs`); modify `crates/pets-core/src/runtime.rs` (initial board), `app/src-tauri/src/core.rs` (`live`).

**Interfaces:**
- Produces: `pub fn render(sessions: &[Session], limits: &[Limit], app_version: &str) -> Vec<u8>` and `pub fn empty(app_version: &str) -> Vec<u8>` (= `render(&[], &[], v)`).
- Output JSON: `{"v":1,"app_version":..,"sessions":[{"id","agent","state","title","question","cwd","since"}],"limits":[{"agent","window","used_pct","resets_at","stale_since"}]}`.
  - `agent`: the serde snake_case name of `Agent`; `window`: `"five_hour"` / `"weekly"`.
  - `state`: Thinking→`thinking`, Working→`working`, NeedsYou→`needs_input`, Done→`done`, Error→`error`, Idle→`idle`, Sleep→`sleeping`, Compacting→`compacting`; `Ended` sessions are left out.
  - `since` = `state_since`; `question` only when `NeedsYou`; `used_pct` clamped 0–100.
  - Built from private `#[derive(Serialize)]` structs so no other field can leak.
- `core.rs` `live`: `let board = rt.state_board();` and after every `publish(...)` call `*board.write().unwrap() = mod_state::render(&snap.sessions, &snap.limits, env!("CARGO_PKG_VERSION"))` with `snap = snapshot_of(rt.store(), now, &mut hidden)` (same filtering as the widget, hidden sessions and orphaned children out).

- [ ] **Step 1: Failing tests** in `mod_state.rs`: build a `Session` with a `JumpTarget` carrying a transcript path and pid, `usage`, `router_task`; render; parse back with `serde_json::Value`; assert the session object's keys are exactly `["cwd","id","agent","question","since","state","title"]` (sorted), that the raw bytes contain neither the transcript path nor the pid, that `Ended` sessions are absent, that `NeedsYou` → `"needs_input"` with the question, that a limit at 130 renders 100, and `empty("0.16.0")` parses with empty arrays.
- [ ] **Step 2:** FAIL → implement → PASS (`cargo test -p pets-core mod_state`).
- [ ] **Step 3:** Wire `core.rs`; Runtime initialises the board with `mod_state::empty(env!("CARGO_PKG_VERSION"))`. `cargo build -p agent-pets` (or the app crate's package name) compiles.
- [ ] **Step 4:** Add a `core.rs` test (or extend an existing `snapshot_of` test) that a dismissed session is absent from `render(&snapshot_of(..).sessions, ..)`.
- [ ] **Step 5: Commit** `feat(core): serve the visible sessions and limits to the Claude mod`.

---

### Task 5: oauth polling skips while the mod reports

**Files:** Modify `app/src-tauri/src/usage.rs`, `app/src-tauri/src/core.rs:135`.

**Interfaces:**
- Produces: `pub fn mod_reading_recent(last_seen: &BTreeMap<String, i64>, now: i64) -> bool` = `last_seen.get("claude_mod_usage")` within `10 * 60_000` ms of `now`.
- Wiring: the `allowed` closure passed to `usage::spawn` becomes `claude_plan_usage && !mod_reading_recent(&LastSeen, now_ms())` (read `app.state::<settings::LastSeen>()`). `has_token` at start keeps reading `claude_plan_usage` only.

- [ ] **Step 1: Failing tests** in `usage.rs`: empty map → false; reading 9 min ago → true; 11 min ago → false; only `"claude_usage"` present → false.
- [ ] **Step 2:** FAIL → implement → PASS (`cargo test -p <app crate> usage`).
- [ ] **Step 3: Commit** `feat(usage): skip Anthropic polling while the Claude mod reports limits`.

---

### Task 6: Remove the statusline pass-through, with migration

**Files:**
- Delete: `crates/pets-core/src/claude/statusline.rs` (+ its `mod.rs` line, `StatuslineEnvelope` export).
- Modify: `ingest.rs` (route + `Incoming::ClaudeStatusline` gone), `runtime.rs:156`, `crates/pets-hook/src/main.rs:94-105` (no POST), `crates/pets-core/src/settings.rs` (drop `claude_statusline`), `app/src-tauri/src/settings.rs` (`merge_user_settings`, `statusline_set` command at :185, `wizard_finish` :204), `app/src-tauri/src/lib.rs` (command list, migration), `app/src/settings/SettingsView.tsx:105`, `app/src/settings/Wizard.tsx:80`, `app/src/main.tsx:115`, `app/src/settings/model.ts:36`, `app/src/types.ts:80`, i18n keys `limits.statusline`/`statuslineDesc` (all languages).
- Keep: `statusline_install.rs`, `integrations::set_statusline(.., false, ..)` path and `disable`'s statusline cleanup (migration and uninstall need them). Turn `set_statusline` into `pub fn remove_statusline(home, lang) -> Result<String, String>` (the `on == false` branch only).

**Interfaces:**
- Produces: `pub fn migrate_statusline(home: &Path) -> bool` in `integrations.rs`: if `statusline_install::is_installed(claude settings)` → `remove_statusline` and return true. Called once at startup in `lib.rs` before `repair_integrations` (idempotent, so no flag needed).
- hook.exe `--agent-pets-statusline`: reads stdin with the existing deadline, prints the original statusline's output byte for byte, sends nothing.

- [ ] **Step 1: Failing tests:**
  - `integrations`: temp home with `settings.json` holding our statusline + the saved original → `migrate_statusline` returns true, `statusLine` equals the original, the original file is removed; second call returns false.
  - `pets-core settings`: old JSON with `"claude_statusline": true` still deserialises (unknown field ignored) — confirm no `deny_unknown_fields`.
  - `ingest`: POST `/v1/events/claude-statusline` → 404.
- [ ] **Step 2:** FAIL → implement the removals listed above → `cargo test --workspace`, `pnpm exec tsc --noEmit`, `pnpm test` (in `app/`) PASS. Fix `model.test.ts`/settings tests that referenced the field.
- [ ] **Step 3:** `rg -n "statusline" crates app/src app/src-tauri/src` shows only `statusline_install`, migration, uninstall and hook.exe pass-through.
- [ ] **Step 4: Commit** `refactor!: drop the statusline pass-through (limits come from the Claude mod)`.

---

### Task 7: Plugin scaffold, bridge and report

**Files:** Create `claude-plugin/.claude-plugin/plugin.json`, `claude-plugin/hooks/hooks.json`, `claude-plugin/hooks/register.tsx`, `claude-plugin/hooks/bridge.ts`, `claude-plugin/hooks/report.ts`, `claude-plugin/hooks/bridge.test.ts`, `claude-plugin/hooks/report.test.ts`, `claude-plugin/types/index.d.ts` (if `$.state` is used by later tasks; declare `agent-pets` values there as each task adds them).

`plugin.json`: `{ "name": "agent-pets", "version": "0.16.0", "description": "Agent Pets: live limits for the Agent Pets widget, /pets, nudges about other agents and a pixel pet above the prompt.", "types": "./types/index.d.ts" }`. `hooks.json`: `{ "modules": ["./register.tsx"] }`.

**Interfaces (produces, TS):**

```ts
// bridge.ts
export type Endpoint = { port: number; token: string }
export type Board = { v: 1; app_version: string; sessions: BoardSession[]; limits: BoardLimit[] }
export type BoardSession = { id: string; agent: string; state: string; title: string; question?: string | null; cwd: string; since: number }
export type BoardLimit = { agent: string; window: 'five_hour' | 'weekly'; used_pct: number; resets_at?: number | null; stale_since?: number | null }
export function createBridge($: Api): {
  send(payload: ModPayload): void          // fire-and-forget; never throws
  state(): Promise<Board | null>           // null when the widget is unreachable or in backoff
  stopped(sessionId: string): boolean      // true after a 400 for that session
}
export type Bridge = ReturnType<typeof createBridge>   // Api, On: the `$` and `on` types from 'claude-code'
// report.ts
export type ModPayload = { v: 1; kind: 'start' | 'measure' | 'turn_end' | 'end'; session_id: string; ts: number;
  cwd?: string; model?: string; context?: { tokens?: number; window?: number; percent?: number };
  rate_limits?: { kind: string; percent_used: number; resets_at?: string }[]; cost_usd?: number; reason?: string }
export function toPayload(kind: ModPayload['kind'], sessionId: string, ts: number, e: unknown): ModPayload
export function registerReport(on: On, bridge: Bridge): void
```

Bridge rules: endpoint read with `$.fs.read(<home>/.agent-pets/endpoint.json)` where home = `$.env.get("USERPROFILE") ?? $.env.get("HOME")`; cached; dropped and re-read after any failed request; requests go to `http://127.0.0.1:${port}` with `Authorization: Bearer ${token}`; after a network failure or non-2xx other than 400 every call returns early for 30 s (`$.clock.now()`); 400 marks the session stopped. The Task 0 duplicate-copy guard lives here (`createBridge` returns a no-op bridge when it decides this copy is the duplicate).

Report rules: `session.start` → `start` (`cwd`, model from `$.session` if exposed); `session.measure` → `measure` (`context`, `rateLimits` → `rate_limits` with `percentUsed`/`resetsAt` renamed, `cost.usd` → `cost_usd`); `turn.complete` → `turn_end` with `reason`; `session.end` → `end`. Fields absent stay absent (never `0`). Each hook: `const r = await next(e); try { bridge.send(...) } catch {} return r`.

- [ ] **Step 1: Failing tests** (`claude-code/testing`: `test`, `expect`, `mock`; mock `$.http.fetch`, `$.fs.read`, `$.env.get`, clock):
  - `bridge.test.ts`: no endpoint file → `state()` resolves `null`, `send` does not throw; fetch rejects once → next call within 30 s does not fetch, after advancing 30 s it re-reads `endpoint.json` (new port used); a 400 → `stopped(sid)` true and no further fetch for that session; the URL is always `http://127.0.0.1:…` and the token never appears in the URL; duplicate-copy guard from Task 0.
  - `report.test.ts`: `toPayload('measure', …)` maps a full `session.measure` input (rate limits renamed, `spend_limit` passed through untouched, the app drops it) and omits `context`/`cost_usd` when the input lacks them; a hook still returns `next`'s result when `send` throws.
- [ ] **Step 2:** `claude plugin validate claude-plugin` and `claude plugin test claude-plugin` → tests FAIL.
- [ ] **Step 3:** Implement `bridge.ts`, `report.ts`, `register.tsx` (`export const register: Register = (on) => { const bridge = createBridge(...); registerReport(on, bridge) }` — create the bridge lazily from the first hook's `$` if `register` has no `$`).
- [ ] **Step 4:** validate + test → PASS.
- [ ] **Step 5: Live check (main session):** with the app built from this branch running, load the plugin via `claude --plugin-dir claude-plugin`, run a turn, confirm the widget shows Claude 5h/weekly limits with reset times and the session's context; `GET /v1/state` via `curl -H "Authorization: Bearer <token>"` returns the board.
- [ ] **Step 6: Commit** `feat(mod): Claude Code plugin reports limits, context, cost and turn ends`.

---

### Task 8: `/pets` pane

**Files:** Create `claude-plugin/hooks/pane.tsx`, `claude-plugin/hooks/pane.test.ts`; modify `register.tsx`, `types/index.d.ts`.

**Interfaces:**
- Consumes: `createBridge(...).state()`, `Board` (Task 7).
- Produces: `registerPane(on, bridge)`; `$.store` keys `pet` and `nudges` (booleans, default `true`), read via `export async function prefs($): Promise<{ pet: boolean; nudges: boolean }>` in `pane.tsx` (Tasks 9–10 import it).

Behaviour (pattern: `examples/pane.tsx`): `session.start` → if `e.surface === 'terminal'` and interactive, `$.command.register({ name: 'pets', description: 'Agent Pets: sessions and limits' })`. `command.run` for `pets` → `$.ui.open({ id: 'agent-pets', title: 'Agent Pets', focus: true, closeOnEscape: true })`, return `{ text: '' }`-equivalent per the d.ts. `ui.render` on `{ component: 'Pane', requestId: 'agent-pets' }`:
- board available → sessions grouped by agent (`state`, `title`, question when `needs_input`), then per-agent limit bars `5h ██████░░░░ 23% · resets 18:00` (time formatted with `Intl.DateTimeFormat(undefined, {hour:'2-digit',minute:'2-digit'})`, never a hard-coded zone);
- board `null` → current session's limits from `$.session.usage()` and the line `Agent Pets widget not running`;
- bottom: two Buttons `Pet: on/off`, `Nudges: on/off` toggling the `$.store` keys (and the `$.state` atoms that redraw the pane).

- [ ] **Step 1: Failing tests** (`ui.mount` with surface `terminal`): pane with a mocked board lists a Codex session's question; with fetch failing shows `Agent Pets widget not running`; pressing `Pet` flips `$.store.get('pet')` to `false`; `prefs` defaults to both `true` on an empty store.
- [ ] **Step 2:** FAIL → implement → validate + test PASS.
- [ ] **Step 3: Commit** `feat(mod): /pets pane with sessions, limits and toggles`.

---

### Task 9: Nudges

**Files:** Create `claude-plugin/hooks/nudge.ts`, `claude-plugin/hooks/nudge.test.ts`; modify `register.tsx`.

**Interfaces:**
- Consumes: `bridge.state()`, `prefs($)` (Task 8), `$.session.id`.
- Produces: `export function diff(prev: Set<string>, board: Board, self: string): { toasts: string[]; seen: Set<string>; waiting: number }` (pure) and `registerNudges(on, bridge)`.

Rules: key = `${id}|${state}|${question ?? ''}` for sessions in `needs_input` or `error`, excluding `self` and its children (`id` starting with `${self}/`). A key not in `prev` → toast `"<Agent> waits: <question clipped to one line, 80 chars>"` (`needs_input`) or `"<Agent> hit an error: <title>"` (`error`); `Agent` = capitalised `agent`. `waiting` = count of `needs_input` sessions (not self). Polling: in `session.start` when interactive, `$.clock.every(3000, tick)`; `tick` skips when `prefs().nudges` is false; while `bridge.state()` is `null` the bridge's 30 s backoff applies. `$.ui.status(waiting ? `⏳ ${waiting} waiting` : undefined)`. The first tick seeds `seen` without toasting (no burst for sessions already waiting when Claude starts).

- [ ] **Step 1: Failing tests** for `diff`: own session never toasts; same session+question twice → one toast; new question on the same session → toast again; `done` never toasts; waiting count; first-tick seeding via `registerNudges` with a mocked clock and `$.ui.toast` mock.
- [ ] **Step 2:** FAIL → implement → PASS.
- [ ] **Step 3: Commit** `feat(mod): nudges about other agents waiting or failing`.

---

### Task 10: Pixel pet above the prompt

**Files:** Create `claude-plugin/hooks/sprites.ts`, `claude-plugin/hooks/pet.tsx`, `claude-plugin/hooks/pet.test.ts`; modify `register.tsx`, `types/index.d.ts`.

**Interfaces:**
- Produces:
  - `sprites.ts`: `export type PetState = 'idle' | 'thinking' | 'working' | 'waiting' | 'done' | 'error' | 'sleeping'`; `export const COLS = 16, ROWS = 8`; `export const FRAMES: Record<PetState, string[][]>` (2–4 frames each, each frame 16 rows × 16 chars of palette letters `k m s h e w x .` = the `PIXEL_PAL.clawd` keys from `app/src/renderer/models/pixel.ts:20`, `.` transparent); `export function encode(frame: string[]): string` packing two pixel rows per cell row with `▀` (U+2580, fg = top pixel, bg = bottom pixel, `0x01000000` for transparent) into the base64 `cells` format of `RasterProps`.
  - `pet.tsx`: `export function step(state: PetState, ev: PetEvent, now: number): PetState` (pure state machine) with `PetEvent = 'prompt' | 'tool' | 'tool_done' | 'ask' | 'answer' | 'aborted' | 'error' | 'tick'`; `registerPet(on)`.
- Palette: `k #2B1D16, m #D97757, s #B25D3D, h #F2AE92, e #1E1410, w #FFFFFF, x #F0997B`.

State machine: `prompt.submit` → thinking; `tool.call` → working, its completion → thinking; permission/question prompt (the event Task 0 identified, or `tool.call` for `AskUserQuestion`) → waiting; `turn.complete` answer → done for 3 s then idle, `aborted` → idle, `error`/`refusal` → error until the next prompt; 5 min without events → sleeping. Animation: `$.clock.every(200, …)` blits the next frame with `$.ui.blit({ requestId: <band id>, key: 'pet', cells })` only while the band is mounted; the band (`ui.render` on `{ component: 'AbovePrompt' }`) returns `next(e)` when `e.surface !== 'terminal'`, `e.props.bodyColumns < 60`, `e.props.hasSurvey`, or `prefs().pet` is false; otherwise a `Box` with the status text (`thinking…`, `waiting for you`, …) and `<Raster key="pet" columns={16} rows={8} cells={…} />` right-aligned.

- [ ] **Step 1: Failing tests:** `step` table (every transition above, sleep after 300 000 ms of `tick`s, done → idle after 3 s); every frame of every state is 16×16 and uses only palette letters; `encode` returns base64 of exactly `16*8*12` bytes; the band mounted on `['terminal','desktop','vscode','mobile']` draws the Raster only on terminal and never throws; terminal at `bodyColumns: 50` draws nothing.
- [ ] **Step 2:** FAIL → draw the sprites (Clawd: orange rounded body `m` with darker shade `s`, highlight `h`, eyes `e`/`w`, small legs; thinking = eyes up + dots, working = arms moving, waiting = `?` above, done = wave, error = `x` eyes, sleeping = closed eyes + `z`) → implement → PASS.
- [ ] **Step 3: Live check (main session):** load via `--plugin-dir`, look at the pet once with a screenshot at `scale: 0.5`; fix proportions if needed.
- [ ] **Step 4: Commit** `feat(mod): pixel Clawd above the prompt`.

---

### Task 11: App places the plugin; `claude_mod` setting

**Files:** Modify `crates/pets-core/src/integrations.rs`, `crates/pets-core/src/settings.rs`, `app/src-tauri/src/settings.rs`, `app/src-tauri/src/lib.rs`, `app/src/settings/SettingsView.tsx` (Claude Code card), `app/src/settings/model.ts`, `app/src/types.ts`, `app/src/main.tsx`, i18n, `app/src/panel/model.ts` (`usageLine`) + its test.

**Interfaces:**
- Produces in `integrations.rs`:
  - `pub fn claude_plugin_dir(home: &Path) -> PathBuf` = `home/.claude/skills/agent-pets`.
  - `const PLUGIN_FILES: &[(&str, &[u8])]` = every non-test file under `claude-plugin/` via `include_bytes!(concat!(env!("CARGO_MANIFEST_DIR"), "/../../claude-plugin/<path>"))` (relative paths with `/`).
  - `pub fn place_plugin(home, lang) -> Result<(), String>`: writes each file only when contents differ; deletes files in the dir that are not in `PLUGIN_FILES` only if the dir's `plugin.json` has `"name": "agent-pets"`.
  - `pub fn remove_plugin(home) -> Result<(), String>`: `remove_dir_all` only when that `plugin.json` names `agent-pets`; otherwise leaves it.
  - `pub fn plugin_needs_repair(home) -> bool`: any embedded file missing or different.
  - `disable(ClaudeCode)` and `uninstall_all` also call `remove_plugin`.
- `Settings.claude_mod: bool` (`#[serde(default = "yes")]`, default `true`; TS default `true`).
- App: wherever ClaudeCode is enabled (`settings.rs:170` toggle, `lib.rs:141` repair, `wizard_finish`) also `place_plugin` when `claude_mod`; `repair_integrations` adds `if apps.claude_code && s.claude_mod && plugin_needs_repair(..) { place_plugin }`; new command `claude_mod_set(on)` → set the flag, then `place_plugin`/`remove_plugin` (only when Claude Code is enabled). `merge_user_settings` keeps `claude_mod` from the incoming settings as usual.
- UI: under the Claude Code integration, a `Toggle` "Claude Code mod" with description "Live limits, /pets, nudges and a pixel pet inside Claude Code. Takes effect in new Claude Code sessions." (Polish strings via the i18n file's existing pattern).
- `usageLine`: omit the token part when `tokens === 0` (cost-only Claude usage).

- [ ] **Step 1: Failing tests:**
  - Rust (temp home): `place_plugin` creates `skills/agent-pets/.claude-plugin/plugin.json` whose `version` equals `env!("CARGO_PKG_VERSION")`; second call writes nothing (mtime unchanged); a stray file is removed; `plugin_needs_repair` false after placing, true after editing one file; `remove_plugin` on a dir whose `plugin.json` names something else leaves it; `disable(ClaudeCode)` removes ours; `Settings` from JSON without `claude_mod` → `true`.
  - TS: `usageLine` with `{tokens:0,cost:1.42}` contains the cost and no token text; `defaultSettings().claude_mod === true`.
- [ ] **Step 2:** FAIL → implement → `cargo test --workspace`, `pnpm exec tsc --noEmit`, `pnpm test` PASS.
- [ ] **Step 3: Live check (main session):** `pnpm tauri dev`, toggle the switch, confirm the folder appears/disappears in `~/.claude/skills/agent-pets` and a new `claude` session lists `agent-pets@skills-dir`.
- [ ] **Step 4: Commit** `feat(integrations): install the Agent Pets Claude Code mod`.

---

### Task 12: Marketplace, release wiring, docs, version

**Files:** Create `.claude-plugin/marketplace.json`; modify `scripts/release.ps1`, `.github/workflows/ci.yml`, `docs/agents.md`, `docs/privacy.md`, `README.md`, `CHANGELOG.md`, `Cargo.toml`, `app/package.json`, `app/src-tauri/tauri.conf.json`, `Cargo.lock`.

- [ ] **Step 1:** `marketplace.json` per the d.ts/reference marketplace schema: name `agent-pets`, owner `Marczelloo`, one plugin `{ "name": "agent-pets", "source": "./claude-plugin", "description": … }`. Validate with `claude plugin validate .` (or the marketplace validate command the reference names).
- [ ] **Step 2:** `release.ps1`: add `claude-plugin/.claude-plugin/plugin.json` version to the existing mismatch check (line 13); run `claude plugin validate claude-plugin` and `claude plugin test claude-plugin` before building, failing the release on error.
- [ ] **Step 3:** CI, per Task 0 finding 5: if the CLI runs without login, add after `pnpm test`: `npm i -g @anthropic-ai/claude-code` and the two plugin commands; otherwise add a comment in `ci.yml` saying the mod tests run in `release.ps1` only.
- [ ] **Step 4:** Docs: `agents.md` Claude section (mod: what it adds, `/pets`, nudges, pet, the switch, manual install via `/plugin marketplace add Marczelloo/agent-pets`, limits sources order: mod → oauth polling (opt-in) → desktop samples; statusline removed); `privacy.md` (new routes `/v1/events/claude-mod`, `/v1/state`: localhost only, Bearer, what the board contains, the mod never reads credentials); README feature list; CHANGELOG `## 0.16.0` (added / changed / removed).
- [ ] **Step 5:** Bump to 0.16.0 in the three version files (plugin.json already 0.16.0); `cargo build` to refresh `Cargo.lock`; `cargo test --workspace`, `pnpm exec tsc --noEmit`, `pnpm test` PASS.
- [ ] **Step 6: Commit** `chore: 0.16.0 Claude Code mod release wiring and docs`.
