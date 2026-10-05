# Changelog

## Unreleased

### Added

- A toast when a limit that went past 90% resets (needs the limit notifications on). It also comes when the reading has gone stale or the usage simply drops.

### Fixed

- The session cost in the panel follows the UI language (0,42 $ in Polish, $0.42 in English).

## 0.16.1

### Changed

- The terminal pet and the nudges are switched in Settings → Apps, under Claude Code mod, instead of in `/pets`. The terminal pet is now off by default.
- Session cards in the panel no longer repeat the limit bars; they stay on the Limits tab.
- CI fails when the mod does not validate or its tests fail.

## 0.16.0

### Added

- **Claude Code mod.** A plugin for Claude Code's new mod API, installed by the app into `~/.claude/skills/agent-pets` and available from the repo marketplace (`/plugin marketplace add Marczelloo/agent-pets`, then `/plugin install agent-pets@agent-pets`).
  - Live Claude 5-hour and weekly limits with exact reset times after every turn, in terminal and Claude app sessions, without reading your login.
  - `/pets`: a pane with the sessions and limits of every agent, and switches for the pet and the nudges.
  - Nudges when another agent needs you or fails.
  - A pixel Clawd with a status line above the prompt.
  - Context, cost and model per session, and an interrupted, refused or failed turn ends the pet's animation at once.
- **Claude Code mod** switch in Settings → Apps (on by default; takes effect in new Claude Code sessions).
- `POST /v1/events/claude-mod` and `GET /v1/state` on the local connection (localhost only, with the token).
- Seven more Claude Code hook events: `PermissionRequest`, `PostToolUseFailure`, `SubagentStart`, `StopFailure`, `PostCompact` and `Elicitation`/`ElicitationResult`. Existing installs are repaired on update.

### Changed

- Claude limits come first from the mod, then from opt-in plan polling (skipped while the mod reports), then from the Claude app's samples.
- Permission prompts show their bubble immediately, and a failed tool no longer leaves the pet "working".
- The release script and CI validate and test the mod; its version must equal the app's.

### Fixed

- The pet no longer keeps "thinking" after a finished turn when a later measure arrived before the Stop hook.
- An error calms down to idle after two minutes, like a finished turn, instead of staying until the session ends.
- Every card's ⋯ menu in the panel can remove the pet, not only cards of finished sessions.

### Removed

- The statusline pass-through and its switch. On the first start of 0.16 the app restores your own statusline if the pass-through was installed. `pets-cli uninstall-statusline` remains for restoring one by hand.
