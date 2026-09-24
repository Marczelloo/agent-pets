# Agent Pets

Animated pets that live in the Windows 11 taskbar and show what your coding agents are doing: **Claude Code**, **OpenAI Codex** and **Agent Router** tasks. Each session gets its own pet. The pet codes at a desk, types commands into a terminal, reads files, catches web pages with a butterfly net, waves when it needs you, dances when it's done, and naps when idle. Progress, context usage and rate limits show up next to it.

> **Status: early development.** The data core is done and verified on real sessions. The taskbar pets themselves are **not built yet** (next phase). What you can run today is listed in [What works now](#what-works-now).

Design documents (spec, plan, spike reports) are written in Polish.

## What works now

| Piece | State | How to try it |
|---|---|---|
| **Data core** (`pets-core`, `pets-cli`, `hook.exe`) | ✅ Done, 72 tests | `pets-cli run`: live table of all agent sessions |
| Claude Code sessions (CLI and desktop) | ✅ | states from hooks; title, context and progress from transcripts |
| Codex sessions (desktop, CLI, Agent Router) | ✅ | states, tools, context and 5h/weekly limits from rollout files |
| Record and replay of session events | ✅ | `pets-cli run --record`, `pets-cli replay` |
| **Visual prototype** of the pets (animations, props, sketch style) | ✅ Prototype | open `prototype/index.html` in a browser |
| Taskbar embedding | ✅ Proven in a spike | `spikes/taskbar-embed` (static demo, not connected to live data) |
| Taskbar stage with live pets, tooltip, panel, "jump to session", notifications | ⏳ Next phases | see [Roadmap](#roadmap) |

## Requirements

- Windows 11
- [Rust](https://rustup.rs) 1.93 or newer (MSVC toolchain)
- Optional: [Node.js](https://nodejs.org) 22 and [pnpm](https://pnpm.io) 10 (only for the taskbar spike); Python 3 (only for the fixture anonymizer)
- Claude Code and/or Codex, if you want to see real sessions

## Setup

```powershell
git clone https://github.com/Marczelloo/agent-pets.git
cd agent-pets
cargo build --release --workspace
cargo test --workspace
```

### Connect Claude Code (hooks)

Claude Code reports session state through hooks. `hook.exe` is tiny: it forwards each hook payload to the local data core and always exits with code 0 within about 0.3 s, even when the core isn't running. It never blocks or slows down Claude.

Copy it somewhere stable first, so rebuilds don't lock the file while hooks are running:

```powershell
mkdir $env:LOCALAPPDATA\agent-pets -Force
copy target\release\hook.exe $env:LOCALAPPDATA\agent-pets\hook.exe
target\release\pets-cli.exe install-hooks $env:LOCALAPPDATA\agent-pets\hook.exe
```

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

### See the pets

- **Animation prototype:** open `prototype/index.html` in a browser. Buttons switch states and tools, and the bottom strip shows the real taskbar size.
- **Taskbar spike:** a static demo of the pets embedded in the real taskbar:
  ```powershell
  cd spikes\taskbar-embed
  pnpm install
  pnpm tauri dev
  ```
  Close it from Task Manager (`taskbar-embed.exe`). It has no window of its own.

## How it works

```
Claude Code ──hook.exe──HTTP (127.0.0.1 + token)──┐
Codex  ──~/.codex/sessions/**/rollout-*.jsonl──────┼─► adapters ─► state machine ─► UI (next phase)
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
- **Privacy:** everything stays on your machine. The ingest server listens only on `127.0.0.1` and requires a random token. From transcripts only titles, task progress and token counters are kept, never message content.

## Project layout

```
crates/pets-core    core library (model, state machine, adapters, ingest, watcher)
crates/pets-hook    hook.exe
crates/pets-cli     pets-cli (run / replay / install-hooks / uninstall-hooks)
prototype/          visual prototype of the pets (Canvas 2D)
spikes/             throwaway feasibility spikes (taskbar embed, statusline dump)
docs/               spec, plan, spike reports, phase 1 verification (Polish)
tools/              fixture anonymizer and its test
```

## Roadmap

1. ~~Phase 0: feasibility spikes~~ (taskbar embed, performance, Claude limits, jump to session, data formats)
2. ~~Phase 1: data core~~
3. **Phase 2:** taskbar stage in Tauri with the live pets (renderer ported from the prototype), tooltip, overflow
4. **Phase 3:** panel with sessions and limits, "jump to session", Windows notifications, Claude rate limits via statusline
5. **Phase 4:** Agent Router task state file
6. **Phase 5:** installer, settings, autostart, power-saving mode

## License

[MIT](LICENSE)
