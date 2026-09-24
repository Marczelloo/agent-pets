# Agent Pets

Animated pets that live in the Windows 11 taskbar and show what your coding agents are doing: **Claude Code**, **OpenAI Codex** and **Agent Router** tasks. Each session gets its own pet. The pet codes at a desk, types commands into a terminal, reads files, catches web pages with a butterfly net, waves when it needs you, dances when it's done, and naps when idle. Progress, context usage and rate limits show up next to it.

> **Status: early development.** The data core and the taskbar stage with live pets work. The panel, "jump to session" and notifications come next. What you can run today is listed in [What works now](#what-works-now).

Design documents (spec, plan, spike reports) are written in Polish.

## What works now

| Piece | State | How to try it |
|---|---|---|
| **Taskbar stage** (`app/`): live pets, progress, rate limits, "+N" overflow, tooltip | ✅ | [Run the taskbar pets](#run-the-taskbar-pets) |
| **Data core** (`pets-core`, `pets-cli`, `hook.exe`) | ✅ Done | `pets-cli run`: live table of all agent sessions |
| Claude Code sessions (CLI and desktop) | ✅ | states from hooks; title, context and progress from transcripts |
| Codex sessions (desktop, CLI, Agent Router) | ✅ | states, tools, context and 5h/weekly limits from rollout files |
| Record and replay of session events | ✅ | `pets-cli run --record`, `pets-cli replay` |
| **Visual prototype** of the pets (animations, props, sketch style) | ✅ Prototype | open `prototype/index.html` in a browser |
| Panel, "jump to session", notifications, Claude rate limits | ⏳ Next phases | see [Roadmap](#roadmap) |

## Requirements

- Windows 11
- [Rust](https://rustup.rs) 1.93 or newer (MSVC toolchain)
- [Node.js](https://nodejs.org) 22 and [pnpm](https://pnpm.io) 10 (for the taskbar app)
- Optional: Python 3 (only for the fixture anonymizer)
- Claude Code and/or Codex, if you want to see real sessions

## Setup

```powershell
git clone https://github.com/Marczelloo/agent-pets.git
cd agent-pets
cargo build --release --workspace
cargo test --workspace
cd app
pnpm install
pnpm test
```

### Connect Claude Code (hooks)

Claude Code reports session state through hooks. `hook.exe` is tiny: it forwards each hook payload to the local data core and always exits with code 0 within about 0.3 s, even when the core isn't running. It never blocks or slows down Claude.

Copy it somewhere stable first, so rebuilds don't lock the file while hooks are running. Use your home directory, not `AppData`: Windows virtualizes `AppData` for apps installed as MSIX packages (such as the Claude desktop app and its built-in terminal), so a hook started by Claude could see different files there than the widget does.

```powershell
mkdir $HOME\.agent-pets -Force
copy target\release\hook.exe $HOME\.agent-pets\hook.exe
target\release\pets-cli.exe install-hooks $HOME\.agent-pets\hook.exe
```

Claude Code reads hooks when a session starts, so restart running sessions after installing or moving the hooks.

`install-hooks` merges nine entries into `~/.claude/settings.json` and keeps a backup as `settings.json.agent-pets.bak`. To remove only the Agent Pets entries:

```powershell
target\release\pets-cli.exe uninstall-hooks
```

Codex needs no setup. Its session files in `~/.codex/sessions` are read directly.

## Usage

```powershell
target\release\pets-cli.exe run                          # live table of sessions and limits (Ctrl+C to quit)
target\release\pets-cli.exe run --record session.jsonl   # also record normalized events
target\release\pets-cli.exe replay session.jsonl --speed 10
```

Example output:

```
agent   źródło   stan              postęp kontekst   cisza  tytuł
claude  desktop  working:bash         2/5      63%      0s  Taskbar widget for agents
codex   router   done                   -       7%      7s  Count Rust files in crates
claude  cli      sleep                  -       5%   1162s  Weather and date tasks

Limity:
  codex 5h: 0% (reset za 299 min)
  codex tydzień: 15% (reset za 7579 min)
```

To try replay without any agents: `target\release\pets-cli.exe replay crates\pets-cli\tests\data\sample.jsonl --speed 4`.

### Run the taskbar pets

```powershell
cd app
pnpm tauri dev                                                         # live sessions
$env:AGENT_PETS_REPLAY="$PWD\demo\many-sessions.jsonl"; pnpm tauri dev  # demo recording with 7 sessions
pnpm dev                                                               # browser preview: http://localhost:1420/dev.html
```

- The pets sit in the taskbar next to the tray and take only the free space after your app icons. When space runs out, the oldest pets collapse into a "+N" badge; a pet that waits for you or hit an error always stays visible.
- Hover a pet, the rate-limit bars or the "+N" badge for details.
- Quit from the tray icon: **Zakończ Agent Pets**.
- The app and `pets-cli run` cannot run at the same time (both own the hook endpoint).
- `pnpm tauri build` produces `target\release\agent-pets.exe`.

### See the prototype

Open `prototype/index.html` in a browser. Buttons switch states and tools, and the bottom strip shows the real taskbar size.

## How it works

```
Claude Code ──hook.exe──HTTP (127.0.0.1 + token)──┐
Codex  ──~/.codex/sessions/**/rollout-*.jsonl──────┼─► adapters ─► state machine ─► taskbar stage
Claude transcripts + ~/.claude/sessions registry ──┘
```

- **`pets-core`** is the library. It holds:
  - the data model;
  - the state machine: `thinking`, `working:<tool>`, `needs_you`, `done`, `error`, `idle`, `sleep`, `compacting` and `ended`, with a minimum time per state and inactivity timeouts;
  - the Claude hook, transcript and registry adapters;
  - the Codex rollout parser;
  - an incremental file tailer, a file watcher, the local ingest server and the hooks installer.
- **`hook.exe`** is the Claude Code hook client.
- **`pets-cli`** runs everything as a terminal app, with record and replay.
- **`app/`** is the Tauri app. Rust embeds the stage window in the taskbar (`SetParent` into `Shell_TrayWnd`), measures the free space with UI Automation, follows DPI and Explorer restarts, reads the mouse natively and shows the tooltip window. The TypeScript side draws the pets on a Canvas at 30 fps and pauses while the taskbar is hidden or a fullscreen app runs. The renderer is a 1:1 port of the prototype, checked call-by-call against it in tests.
- **Privacy:** everything stays on your machine. The ingest server listens only on `127.0.0.1` and requires a random token, stored with its port in `~/.agent-pets/endpoint.json`. From transcripts only titles, task progress and token counters are kept, never message content.

## Project layout

```
crates/pets-core    core library (model, state machine, adapters, ingest, watcher)
crates/pets-hook    hook.exe
crates/pets-cli     pets-cli (run / replay / install-hooks / uninstall-hooks)
app/                Tauri app: taskbar stage, renderer, skins, tooltip
prototype/          visual prototype of the pets (Canvas 2D)
spikes/             throwaway feasibility spikes (taskbar embed, statusline dump)
docs/               spec, plans, spike reports, verification checklists (Polish)
tools/              fixture anonymizer and its test, CPU measurement
```

## Roadmap

1. ~~Phase 0: feasibility spikes~~ (taskbar embed, performance, Claude limits, jump to session, data formats)
2. ~~Phase 1: data core~~
3. ~~Phase 2: taskbar stage in Tauri with the live pets, tooltip, overflow~~
4. **Phase 3:** panel with sessions and limits, "jump to session", Windows notifications, Claude rate limits via statusline
5. **Phase 4:** Agent Router task state file
6. **Phase 5:** installer, settings, autostart, power-saving mode

## License

[MIT](LICENSE)
