<p align="center">
  <img src="docs/images/banner.png" alt="Agent Pets banner: all nine pets as one happy bunch on a Windows 11 taskbar: the ZCode panda and a blob high-five on the heads of Kodek and Clawd, the Copilot pilot catches hearts in a net, opencode throws a paper plane, the Android robot cheers, the Grok robot says hi and the Cursor block claps" width="100%">
</p>

<p align="center">
  <a href="https://github.com/Marczelloo/agent-pets/releases/latest"><img alt="Latest release" src="https://img.shields.io/github/v/release/Marczelloo/agent-pets?include_prereleases&color=D97757"></a>
  <img alt="Windows 11" src="https://img.shields.io/badge/Windows-11-5DCAA5">
  <a href="LICENSE"><img alt="License: GPL-3.0-or-later" src="https://img.shields.io/badge/license-GPL--3.0-8C887E"></a>
</p>

# Agent Pets

Animated pets in the Windows 11 taskbar that show what your coding agents are doing. Every session of **Claude Code**, **Codex**, **opencode**, **GitHub Copilot**, **Antigravity**, **Cursor**, **Grok Build** or **ZCode** gets its own pet: it codes at a desk, types commands, reads files, catches web pages with a butterfly net, waves when it needs you and naps when idle. Progress, context and rate limits sit right next to it.

<p align="center">
  <img src="docs/images/pets.gif" alt="Animated gallery of all pets: Clawd editing, Kodek browsing, the opencode cyclops running a command, the Copilot pilot reading, the Android robot thinking, the Cursor block searching, the Grok robot delegating, the ZCode panda done and a blob pet that needs you" width="900">
</p>

<p align="center">
  <img src="docs/images/taskbar.png" alt="Five pets in the taskbar: a knocked-out Codex robot after an error, a Codex robot presenting a web page, Clawd waving because it needs you, a Codex robot with the Agent Router badge, Clawd typing at a desk; a +2 badge and rate-limit bars" width="900">
</p>

## Features

- **One pet per session**, posed by what the agent does: thinking, editing, running a command, reading, searching, browsing, delegating, waiting for you, done, error, asleep.
- **Limits at a glance.** 5-hour and weekly bars for Claude, Codex and Antigravity, task progress under each pet, a "+N" badge when the taskbar runs out of room.
- **One click back to the session.** The panel lists every session; **Open** brings back the Claude or Codex app, the editor, the terminal, or resumes the session in a new one.
- **Speech bubbles and subagents.** See the question an agent asks or the command it runs; subagents show up as mini pets next to their parent.
- **Seven looks, two ways to move.** Sticker, Sketch, Clean, Pixel art, Neon, Ink and Pastel, plus a Dynamic mode with anime-inspired scenes.
- **Statistics for fun.** A podium of your projects, token and time counters, an agent race, an activity calendar and badges.
- **Your layout.** Next to the tray, on the left, anywhere you drag them or in a floating window; any monitor, any size.
- **Private and light.** Everything is read from local files and hooks; drawing pauses under full-screen apps and slows down on battery.

More in [docs/features.md](docs/features.md).

### Every state

<p align="center">
  <img src="docs/images/states.gif" alt="Clawd in twelve states: thinking, editing, running a command, reading, searching, browsing, delegating, needs you, done, error, compacting and asleep" width="900">
</p>

### Seven looks

<p align="center">
  <img src="docs/images/styles.gif" alt="Kodek thinking and Clawd editing in the seven looks: Sticker, Sketch, Clean, Pixel art, Neon, Ink and Pastel" width="900">
</p>

### Dynamic motion

<p align="center">
  <img src="docs/images/dynamic.gif" alt="Dynamic motion scenes: a punch barrage, ninja hand seals, a detective with a magnifier, shadow thinking, a thunder dash, a summoning seal and Hollow Purple while compacting" width="900">
</p>

## Install

1. Download `Agent.Pets_<version>_x64-setup.exe` from [Releases](https://github.com/Marczelloo/agent-pets/releases/latest) and run it. It installs for your user, without administrator rights. The installer is not code-signed yet, so SmartScreen may ask: **More info → Run anyway**.
2. The first-run wizard finds your agents and connects them, and lets you pick notifications, autostart and a look.
3. Restart open agent sessions so they pick up the hooks.

Change anything later in **Settings** (right-click the tray icon, or ⚙ in the panel). Updates are signed and install from GitHub; uninstall from Windows Settings → Apps, which also removes the hooks.

## Supported agents

| Agent | Pet | Status | Limits |
|---|---|---|---|
| Claude Code | Clawd | ✅ core | 5h and weekly |
| Codex, incl. [Agent Router](https://github.com/Marczelloo/agent-router-mcp) tasks | Kodek | ✅ core | 5h and weekly |
| opencode | a near-black cyclops | ✅ core | tokens, cost, account bars |
| GitHub Copilot | a pilot in a leather helmet | 🧪 experimental | – |
| Antigravity | the Android robot | 🧪 experimental | Gemini 5h and weekly |
| Cursor | a dark faceted block | 🧪 experimental | – |
| Grok Build | a white robot with a visor | 🧪 experimental | – |
| ZCode | a panda with a “Z” headband | 🧪 experimental | – |
| Anything else | a blob with its first letter | ✅ [the door](docs/door.md) | – |

Claude Code, Codex and opencode get the most care and testing; the experimental ones work through their hooks and were not checked in every detail against a live session. Setup details, what each integration writes and how to undo it: [docs/agents.md](docs/agents.md).

| Panel | First-run wizard | Settings |
|---|---|---|
| <img src="docs/images/panel.png" alt="Panel with limits and sessions" width="260"> | <img src="docs/images/wizard.png" alt="Wizard step: choose the pets' look, with a live preview" width="340"> | <img src="docs/images/settings.png" alt="Settings window, Apps tab" width="340"> |

## Privacy

Session data never leaves your computer: states come from local hooks and files, and only titles, progress and counters are kept, never message content. The only network calls are the update check on GitHub (can be turned off) and, if you allow it, fetching your Claude plan limits from `api.anthropic.com`. Details in [docs/privacy.md](docs/privacy.md).

## Documentation

- [Features](docs/features.md): panel, notifications, bubbles, subagents, statistics, layout
- [Agents](docs/agents.md): setup and behaviour of every integration, rate limits
- [Door for other agents](docs/door.md): give any tool a pet with one HTTP call
- [Privacy](docs/privacy.md): what is read, sent and stored
- [Building](docs/building.md): build from source, `pets-cli`, architecture, releases
- [Contributing](CONTRIBUTING.md)

## License

Agent Pets © 2026 [Marczelloo](https://github.com/Marczelloo), licensed under the [GNU General Public License v3.0 or later](LICENSE). You may use, study, change and share it, also commercially; if you share a changed version, it must stay open source under the same license. Versions up to 0.12.2 were released under the MIT License; see [NOTICE](NOTICE) for earlier terms, contributors, trademarks and third-party artwork.

The Antigravity pet is based on the Android robot, which is reproduced or modified from work created and shared by Google and used according to terms described in the [Creative Commons 3.0 Attribution License](https://creativecommons.org/licenses/by/3.0/).

Agent Pets is not affiliated with Anthropic, OpenAI, GitHub, Google, Cursor, xAI, Z.ai or opencode.
