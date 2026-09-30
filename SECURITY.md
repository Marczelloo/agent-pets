# Security

## Reporting a problem

Please do not report security problems in public issues. Report them privately through
[GitHub security advisories](https://github.com/Marczelloo/agent-pets/security/advisories/new).
Include the Agent Pets version, what an attacker could do, and the steps to reproduce it.

You should get an answer within a week. Once a fix is released, the advisory is published and
you are credited, unless you prefer not to be.

## Supported versions

Only the latest release gets security fixes. Agent Pets updates itself, and every update is
signed; see [docs/building.md](docs/building.md).

## What counts

Agent Pets listens on `127.0.0.1` for events from agent hooks, edits the hook settings of the
agents you turn on, and reads their local session files. Problems we want to hear about include:

- another program or user reaching the hook server, or getting past its token;
- the app or `hook.exe` changing agent settings it should not touch, or breaking them;
- tokens, prompts or other private data ending up in logs, the diagnostics report or the network;
- an update that could be installed without a valid signature.
