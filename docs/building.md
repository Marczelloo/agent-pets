# Building

- [Requirements](#requirements)
- [Build and test](#build-and-test)
- [Run in development](#run-in-development)
- [pets-cli](#pets-cli)
- [Connect Claude Code without the wizard](#connect-claude-code-without-the-wizard)
- [How it works](#how-it-works)
- [Project layout](#project-layout)
- [README media](#readme-media)
- [Releases](#releases)

## Requirements

- Windows 11
- [Rust](https://rustup.rs) 1.93 or newer (MSVC toolchain)
- [Node.js](https://nodejs.org) 22 and [pnpm](https://pnpm.io) 10
- Optional: Python 3, only for the fixture anonymizer in `tools/`

## Build and test

```powershell
git clone https://github.com/Marczelloo/agent-pets.git
cd agent-pets\app
pnpm install
pnpm build:hook      # builds hook.exe into src-tauri/resources; the app bundles it and needs it to compile
pnpm test
cd ..
cargo build --release --workspace
cargo test --workspace
```

To build the installer, run in `app/`:

```powershell
pnpm tauri build --config '{"bundle":{"createUpdaterArtifacts":false}}'
```

It lands in `target\release\bundle\nsis\`. The config override turns off signing the update files, which needs the release key only the maintainer has.

## Run in development

```powershell
cd app
pnpm tauri dev                                                         # live sessions
$env:AGENT_PETS_REPLAY="$PWD\demo\many-sessions.jsonl"; pnpm tauri dev  # a demo recording with 7 sessions
pnpm dev                                                               # browser previews with demo data
```

`pnpm dev` serves previews at `http://localhost:1420/`: `dev.html` (the taskbar stage), `panel.html`, `bubbles.html`, `stats.html` and `settings.html`.

The app and `pets-cli run` cannot run at the same time: both own the local endpoint.

`prototype/index.html` is the original visual prototype of the pets. Open it in a browser; buttons switch states and tools, and the bottom strip shows the real taskbar size.

## pets-cli

`pets-cli` runs the data core in a terminal:

```powershell
target\release\pets-cli.exe run                          # live table of sessions and limits (Ctrl+C to quit)
target\release\pets-cli.exe run --record session.jsonl   # also record normalized events
target\release\pets-cli.exe replay session.jsonl --speed 10
```

To try replay without any agents: `target\release\pets-cli.exe replay crates\pets-cli\tests\data\sample.jsonl --speed 4`.

## Connect Claude Code without the wizard

Copy `hook.exe` somewhere stable first, so rebuilds don't lock the file while hooks run. Use your home directory, not `AppData`: Windows virtualizes `AppData` for apps installed as MSIX packages (such as the Claude desktop app), so a hook started by Claude could see different files there than Agent Pets does.

```powershell
mkdir $HOME\.agent-pets -Force
copy target\release\hook.exe $HOME\.agent-pets\hook.exe
target\release\pets-cli.exe install-hooks $HOME\.agent-pets\hook.exe
target\release\pets-cli.exe uninstall-hooks   # removes only the Agent Pets entries
```

`install-hooks` merges its entries into `~/.claude/settings.json` and keeps a backup as `settings.json.agent-pets.bak`. Claude Code reads hooks when a session starts, so restart running sessions afterwards.

### The Claude Code mod

The mod lives in `claude-plugin/` and is embedded in the app, which places it in `~/.claude/skills/agent-pets` (see [Agents](agents.md#the-claude-code-mod)). Its version must equal the app's: a test in `pets-core` and `scripts/release.ps1` both check it. To work on the mod:

```powershell
cd claude-plugin
claude plugin validate .   # manifest and hooks
claude plugin test .       # the *.test.ts files, no Claude login needed
```

The repo root has a marketplace (`.claude-plugin/marketplace.json`) for manual installs: `claude plugin validate .` checks it. The statusline pass-through of 0.15 is retired; `pets-cli uninstall-statusline` restores a statusline that it replaced.

## How it works

```
Claude Code ──hook.exe──HTTP (127.0.0.1 + token)──┐
opencode ──plugin──HTTP (127.0.0.1 + token)───────┤
Copilot, Antigravity ──hook.exe──HTTP (127.0.0.1)──┤
Cursor, Grok, ZCode ──hook.exe──HTTP (127.0.0.1)───┤
any tool ──hook.exe report / HTTP (door)──────────┤
Codex  ──~/.codex/sessions/**/rollout-*.jsonl──────┼─► adapters ─► state machine ─► taskbar stage
Claude transcripts + ~/.claude/sessions registry ──┤
Agent Router ──~/.agent-router/status.json─────────┘
```

- **`pets-core`** is the library: the data model; the state machine (`thinking`, `working:<tool>`, `needs_you`, `done`, `error`, `idle`, `sleep`, `compacting`, `ended`, with a minimum time per state and inactivity timeouts); the adapters for every agent and the door; the process-tree walk that finds the program hosting an agent; a read-only reader of opencode's database; a file tailer and watcher, the local ingest server and the hooks installer.
- **`hook.exe`** (`pets-hook`) is the hook client. With `report` it is the command-line side of the door; the retired `--agent-pets-statusline` mode only prints your own statusline until the app has restored it.
- **`pets-cli`** runs everything as a terminal app, with record and replay.
- **`app/`** is the Tauri app. The Rust side embeds the stage window in the taskbar (`SetParent` into `Shell_TrayWnd`), measures the free space with UI Automation, follows DPI and Explorer restarts, reads the mouse natively and shows the tooltip window. The TypeScript side draws the pets on a canvas at 30 fps and pauses while the taskbar is hidden or a full-screen app runs. The panel, settings and statistics are React.

## Project layout

```
crates/pets-core    core library: model, state machine, adapters, ingest, watcher, settings, integrations
crates/pets-hook    hook.exe
crates/pets-cli     pets-cli: run, replay, install-hooks, uninstall-hooks, uninstall-statusline
app/                Tauri app: taskbar stage, renderer, skins, tooltip, panel, settings, statistics, installer
prototype/          the original visual prototype of the pets (canvas 2D)
scripts/            release script
claude-plugin/      the Claude Code mod (function-hook plugin, embedded in the app)
.claude-plugin/     marketplace for manual mod installs
tools/              fixture anonymizer, CPU measurement, README media recorder (showcase/)
docs/               documentation and README images
```

## README media

The GIFs and the banner in `docs/images` are recorded from the real renderer, frame by frame, so every recording comes out the same. It needs ffmpeg on `PATH` and Microsoft Edge.

```powershell
cd app; pnpm dev                    # serves app/showcase.html
cd tools\showcase; pnpm install
node record.mjs                     # all four: pets, states, styles, dynamic
node record.mjs states --zoom=2     # one board, twice as sharp
node record.mjs banner              # docs/images/banner.png, a still at twice the size
node screens.mjs                    # docs/images/{panel,wizard,settings}.png from the demo data (needs the dev server on :1420)
```

`app/showcase.html?mode=gallery|states|styles|dynamic|banner&live=1` shows a board live in the browser.

## Releases

Maintainer only. Since 0.7 the app reads `latest.json` from the latest GitHub release and installs only an installer with a valid signature. Releases are built and signed locally, because the key exists only on the maintainer's computer; the `ci` workflow only runs the tests.

### Signing key

Updates are signed with a key in `~/.tauri/agent-pets.key` (no password). It is never in the repository. The public key is in `app/src-tauri/tauri.conf.json` under `plugins.updater.pubkey`. Keep a backup of the key: without it, installed copies cannot be updated.

If the key is lost, generate a new one:

```powershell
pnpm --dir app exec tauri signer generate --ci -w ~/.tauri/agent-pets.key
```

Put the new public key in `tauri.conf.json` and ask users to install the next version by hand once.

### Steps

1. Set the same version in `Cargo.toml`, `app/src-tauri/tauri.conf.json`, `app/package.json` and `claude-plugin/.claude-plugin/plugin.json` (tests in `version::tests` and `integrations::tests` check that they match).
2. Run the tests: `cargo test --workspace` and `pnpm --dir app test`.
3. Write the release notes to a file. The first line that is not a heading appears in the "update available" notification.
4. Run `pwsh scripts/release.ps1 -Notes <file>`. It checks the versions, runs `claude plugin validate` and `claude plugin test` on the mod (the `claude` CLI must be installed), builds the signed installer, copies it to `target/release/upload/`, writes `latest.json` and prints the `gh release create` command.
5. Run that command to publish the release. Attach both the installer and `latest.json`.

### Testing an update locally

`AGENT_PETS_UPDATE_URL` points the updater at another address, but only in a dev build or a build with the `update-test` feature; a release always asks GitHub, and the signature is always checked. The release build of the updater accepts only `https`, so test builds need an extra config. Never use it for a real release:

```powershell
pnpm --dir app tauri build --features update-test --config '{"plugins":{"updater":{"dangerousInsecureTransportProtocol":true}}}'
```

1. Build and install version N this way, with the signing variables set as in `scripts/release.ps1`.
2. Build version N+1 with `scripts/release.ps1` and serve `target/release/upload` with `python -m http.server 8765 --bind 127.0.0.1`; set `url` in `latest.json` to `http://127.0.0.1:8765/<installer>`.
3. Start version N with `AGENT_PETS_UPDATE_URL=http://127.0.0.1:8765/latest.json` and click **Check now** in Settings → General.
4. Change one character of the signature in `latest.json` and check that the update is rejected.
