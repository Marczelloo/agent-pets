# Privacy

Agent Pets reads what your agents do from local files and hooks, and keeps it on your computer.

## Network

Agent Pets makes only these connections to the internet:

- **Update check.** It downloads `latest.json` and, when you install an update, the installer from this repository's GitHub releases. Nothing is sent. Turn it off in Settings → General.
- **Claude plan limits** (opt-in, off by default). Every 5 minutes it asks `api.anthropic.com` for your plan usage with the login Claude Code keeps on your disk. The token is read for each request, sent only to Anthropic and never stored or logged. See [Claude rate limits](agents.md#claude-rate-limits).

It never asks any other agent's servers for anything. With Antigravity on, it asks Antigravity's own local server on `127.0.0.1` for the Gemini limits; how Antigravity gets those numbers is up to Antigravity.

## Local connection

The app listens only on `127.0.0.1` and requires a random token, stored with its port in `~/.agent-pets/endpoint.json`. The hooks, the opencode plugin and the [door](door.md) send over it only session states, tool kinds, short action texts (a file name, a command, a search pattern), the question an agent asks, and model names. Never prompts, answers, tool results or file contents. Text from the door is treated as untrusted, cut to size and shown as plain text.

## What is read

- **Claude transcripts:** only titles, task progress and token counters. Never message content.
- **Codex session files:** states, tools, context, limits and token counters.
- **opencode's database:** read-only, numbers and names only. Never messages or login data. Not opened with opencode off.
- **Agent Router's status file:** a short title and health per task.

## What is stored

- **In memory only:** the file names, commands, search patterns and questions shown in bubbles, tooltips and the panel. They are never written to disk, logs, the diagnostics report or a `pets-cli --record` file.
- **`~/.agent-pets/stats.json`:** numbers only (tokens, work time, questions, tool calls per hour and model), project folder names, model names and the paths of transcripts already read. Never message content, commands, file names or session titles.
- **`~/.agent-pets/links.json`:** which Agent Router task belongs to which session (ids only), kept for 7 days.
- **Settings** and backups of the agent config files Agent Pets edited.

Uninstalling removes the hooks, the autostart entry and the files in `~/.agent-pets`; tick "delete app data" to remove your settings as well.
