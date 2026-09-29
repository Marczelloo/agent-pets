# Features

## Pets

Each agent session gets its own pet, and its pose follows the session: thinking, editing, running commands, reading, searching, browsing, delegating to subagents, waiting for you, done, error, idle, asleep.

| Agent | Pet |
|---|---|
| Claude Code | Clawd |
| Codex | Kodek |
| opencode | a square near-black cyclops whose eye is the "o" from the opencode logo |
| GitHub Copilot | a pilot in a brown leather helmet with blue goggles |
| Antigravity | the green Android robot, floating above the taskbar |
| Cursor | a dark faceted block |
| Grok Build | a small white robot with a black visor and the Grok logo on its chest |
| ZCode | a panda with a blue “Z” headband |
| any other agent | a round blob in its own colour with the first letter of its name |

The tooltip and the panel name the agent, the model it talks to and the program you drive it from, for example "Claude Code · Opus 5.5 · t3code" or "opencode · GPT-6 Sol · VS Code". Programs such as t3code, VS Code, Cursor, Zed and JetBrains IDEs are found by walking up the agent's process tree.

## Taskbar

- The pets sit next to the tray and use only the free space after your app icons. When space runs out, the oldest pets fold into a "+N" badge; a pet that waits for you or hit an error always stays visible.
- Under each pet: task progress. Next to them: 5-hour and weekly limit bars for Claude, Codex and Antigravity.
- Hover a pet, the limit bars or "+N" for details; click to open the panel.
- **Layout** (Settings → Taskbar): next to the tray, on the left, anywhere you drag them, or in a floating window on the desktop. Pick the monitor, a glass or solid background, pet size, spacing, order (by start, by agent, or those that need you first) and which bars show.
- **Tidy up by hand.** Right-click a pet to remove it from the taskbar, or use ✕ and "Remove inactive" in the panel, with undo. A session comes back as soon as its agent does something new.
- Quit from the tray icon's menu: **Quit Agent Pets**.

## Panel and jump to session

Click a pet (the panel opens on its session), the "+N" badge, the limit bars or the tray icon. The panel lists every session, including the ones under "+N", with those waiting for you or failing on top, and shows the limits with their reset times. It hides when you click elsewhere or press Esc.

**Open** takes you back to the session. It tries these steps in order and stops at the first one that works:

1. a deep link: the session in the Claude app or the thread in the Codex app;
2. the window the session runs in, for example its terminal or editor;
3. a new terminal in the session's folder that resumes it (`claude --resume <id>`, `codex resume <id>`);
4. the resume command copied to the clipboard; the panel says so.

## Notifications

Windows notifications with an **Open** button. Turn each kind on or off in Settings → Notifications.

| When | Condition |
|---|---|
| Waiting for you | a session waits for you for more than 15 s and its window is not in front |
| Done | a turn that took more than 2 minutes finished |
| Limit | a 5-hour or weekly limit passed 90%, once per limit window |

Nothing already going on when the app starts is reported.

## Speech bubbles

A pet that waits for you shows what the agent asks ("Allow Bash? npm test", "Question: Which option…"), and a new action pops up for 3 s ("Editing App.tsx", "npm test"). Bubbles stay short; hover the pet or the bubble to see the full text. Click a question to jump to the session, an action to open the panel. Settings → Taskbar → Bubbles and subagents.

## Subagents

Claude Code subagents, Codex subagent threads and Agent Router tasks started by a session are its children. After 5 s of work a mini pet stands next to its parent, and the panel lists them under the parent with their task, action, time and router health.

## Looks and motion

Seven styles, all readable at taskbar size: **Sticker** (like the app icon), **Sketch**, **Clean**, **Pixel art**, **Neon**, **Ink** and **Pastel**. Pick one for every pet or a different one per agent in Settings → Look.

**Dynamic** motion swaps the calm animations for anime-inspired scenes: a punch barrage on the keyboard with a final BAM!, ninja hand seals before a command, a detective with a giant magnifier, shadow-style thinking, a thunder dash for the web, a summoning seal for subagents and Hollow Purple while compacting, with particles, impact frames and speed lines. Settings → Look lets you preview every animation.

## Statistics

A podium of your projects (by agent work time or tokens) with the winner jumping in a crown, counters for tokens, cache hits, work time and sessions, a race of your agents, a 26-week activity calendar and badges such as Token glutton, Cache master, Night owl and Marathoner. Today, this week, this month or all time. It is counted from the transcripts already on your disk, so the history is there from the first start. Open it with 📊 in the panel or from the tray menu.

## Music break

When Spotify, a browser or any other player is playing in Windows, idle pets put on headphones and dance, and sleeping ones doze on in them. Grey EQ bars replace the progress bar, so a dance never looks like work, and the headphones fly off when the agent starts working. Track titles are never read. Turn it off in Settings → Look.

## Updates

Agent Pets checks GitHub for a new version 15 seconds after start and every 6 hours. It tells you, or installs the update by itself at a quiet moment (no agent working, no full-screen app), or does nothing: Settings → General. Updates are signed and checked before they run.

## Power saving

On battery or with Windows energy saver on, pets draw at 10 frames per second and only busy pets move. Set it to always or never in Settings → Look. Drawing stops under full-screen apps and while the taskbar is hidden.

## Languages

English and Polish. The interface, notifications and installer follow your Windows language; change it in Settings → General.
