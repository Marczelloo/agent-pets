# UI polish (release 0.15): design

Branch `feat/panel-redesign`. The goal is not a new product but a finished look: the panel and the Settings window should feel like one app, with Settings modelled on the settings of the Claude app. Written 2026-10-02 from the conversation with the owner; every section was approved in chat.

## Scope and order

Four independent cycles, built in this order. Each ends with a commit; the release (version bump, notes, `scripts/release.ps1`, `gh release create`) happens only on the owner's go-ahead.

1. Panel.
2. Settings window, including the theme option.
3. Installer review.
4. App icon.

Already done on this branch: `642f3aa` the bubble for a Claude question shows the question text instead of "Allow AskUserQuestion?" (the permission notification that follows `AskUserQuestion` no longer overwrites it).

## Success criteria

- The panel stays readable with 6+ sessions, several subagents and 3 agents with limits, with no section pushing the other off the screen.
- No row of look-alike buttons is left where a choice between options is meant; the style gallery stays as cards with live previews and the preview stage stays.
- Settings looks consistent in light and dark; one set of components, tokens in one place.
- The installer is correct in English and Polish, and the icon matches the banner.

## 1. Panel

Files: `app/src/panel/App.tsx`, `app/src/panel/model.ts`, `app/panel.html`, `app/src/i18n/{en,pl}.ts`.

**Header.** Left: "Agent Pets". Right: bell (with count), statistics, settings as uniform 28×28 frameless icon buttons with a hover background. The `t().sessions(n)` label ("1 session") is removed; its job moves to the tab.

**Tabs.** A segmented control under the header: `Sessions N` | `Limits`. N counts active sessions. `Limits` shows a warning dot when any limit is at 80% or more or a reading is stale. The update bar and the notification inbox stay above the tabs.

**Sessions tab.**
- The whole card is clickable and opens the agent's app (pointer cursor, visible focus, keyboard Enter/Space).
- Top-right corner: a `⋯` menu with Open, Remove (inactive sessions only) and Copy path. The always-visible Open button and the hover-only ✕ are gone.
- State, context and age go into one metadata line. The context level becomes a thin bar on the card's lower edge.
- Subagents stay as nested rows under the parent; more than three collapse to "+N subagents" (expandable).
- "Remove inactive" becomes a small text action ("Clear inactive") at the right of the tab strip, shown only when there are inactive sessions.
- Empty state: one calm line with a hint.
- The needs-you and error left accents stay.

**Limits tab.**
- One card per agent: coloured dot and name, below it the 5 h and weekly bars with percent and reset time.
- "No data" is one grey line instead of an empty bar.
- A stale reading keeps the "as of N h ago" marker and the CLI hint.
- The tab scrolls on its own, independent of Sessions.

**Logic and tests.** Counting, warning-dot rule and subagent collapsing go into `model.ts` with vitest cases. Appearance is checked in the browser pane, light and dark.

## 2. Settings window

Files: `app/settings.html` (tokens), `app/src/settings/**`, `app/src/i18n/*`, `app/src-tauri/src/settings.rs` and the Settings type (theme).

### Look and feel

Modelled on a screenshot of the Claude app's Settings → General (dark theme) sent by the owner. What it shows, and what we copy:
- **Palette.** Near-black neutral surfaces, no tint (dark: window `#1F1F1E`, sidebar a shade lighter, hairlines `rgba(255,255,255,.07)`); light theme mirrors it with warm off-white (`#FAF9F5`). Accent `#D97757` is used sparingly (links, switch on, focus), not for selection. All colours are tokens on `:root`, with `prefers-color-scheme` and `data-theme` overrides as today.
- **Navigation.** Left sidebar with small icon + label items, grouped under muted group labels (for us: *Settings* → Apps, Look, Taskbar, Notifications, Limits; *Application* → General, Diagnostics). Selected item: rounded soft-grey pill, bold label, no side bar. Close "✕" stays out (native window frame). A search box is not needed with 7 tabs.
- **Content.** No cards. Sections are a bold heading (sans, ~15 px) followed by flat rows separated by hairlines; the whole page scrolls in one column with a thin scrollbar. The page has no big serif title (the serif is only used for the chat font setting in Claude, so we do not use it).
- **Rows.** Label (medium weight) and a muted one-line description on the left; control on the right, vertically centred. Row height about 56–68 px, generous padding, 24 px between sections.
- **Controls.** Segmented control: dark track, the selected segment a raised lighter pill; icon-only variant for theme (monitor / sun / moon). Select: borderless-looking field with a chevron, right-aligned value. Switch: small, flat. Secondary button ("Manage"): small, bordered, low contrast. Links in the accent-blue-ish link colour inside descriptions.

### Shared components (`app/src/settings/ui/`)

`Section`, `Row`, `Segmented`, `OptionCards`, `Stepper`, `Switch`, `Select`. All tabs, the wizard included, use only these. `Toggle.tsx` becomes a thin wrapper around `Row` and `Switch` or is replaced by them.

### Theme

New setting `theme: "system" | "light" | "dark"` (default `system`) in `settings.json`. In General, a new Appearance section with a segmented control and icons. Applied by `data-theme` on `<html>` in every window (panel, settings, statistics, tooltip, bubbles); a change in Settings reaches the open windows through the existing settings-changed event. The `system` value removes the attribute and the media query takes over.

### Apps

Three sections:
- **Main agents**: Claude Code, Codex, opencode.
- A clear gap with a line, then **Experimental**: Copilot, Antigravity, Cursor, Grok Build, ZCode, with one sentence that they work on a best-effort basis.
- **Other**: the door (any agent).

A row: pet thumbnail, name, one status line ("Detected · hooks active"), switch on the right. Path, hints, notes and "Reinstall" move under an expandable "Details". Agents that are not detected are dimmed with the reason.

### Look

Order: **Preview** (stage at full width; the pet to preview as a row of small tiles with a thumbnail, radio behaviour; animation states as grouped segments Work / State / Reactions plus a "Play all" toggle) → **Style** (cards with live previews, unchanged) → **Motion** (segmented Calm / Dynamic in a row) → **Bubbles** (preview) → **Taskbar** at actual size → **Per agent** (collapsible overrides) → reaction to media (switch). Each section has a heading and flat rows (the preview stage and the style cards are the only boxed elements).

### Taskbar

- **Position** is option cards with a mini diagram of the bar (Right / Left / Custom / Floating).
- With Custom, a row in the same card as the position: icon, "Drag the widget along the taskbar", button "Move…" on the right. The lonely button is gone.
- **Agents in the bar**: a `Stepper` (`−  4  +`) with theme-coloured buttons, 1–8 as today, typing allowed, native spin arrows removed.
- Alignment and order are segments. Sections keep their order (Where, Window, Pets, Elements, Bubbles). "Restore defaults" moves to the bottom as a quiet text button.

### General, Notifications, Limits, Diagnostics

- General: Appearance (theme, language), then autostart and updates; "Check now" gets a row with the result at its right.
- Notifications and Limits stay switches in the new rows; Limits gets a "Claude" heading and the CLI-login note.
- Diagnostics: report in a dark code block, "Copy" and "Report a problem" side by side above it.

### Tests

Vitest for pure logic: theme resolution, `Stepper` clamping, grouping of apps into main/experimental, the new `settings.json` field (default and round trip, Rust test in `settings.rs`). Visual check in the browser pane in both themes at the real window width.

## 3. Installer review

Files: `app/src-tauri/nsis/{hooks.nsh,Polish.nsh}`, `app/src-tauri/tauri.conf.json` (bundle section).

Checked already: English and Polish language files have the same 27 strings; the pre-uninstall hook runs `--uninstall-integrations` (with `--remove-data` when the box is ticked) and skips both on an update, so integrations survive an update.

To do:
- Run the installer silently and interactively in both languages (install, update over an older version, uninstall with and without "remove data"); confirm shortcuts, the autostart entry and `~/.agent-pets` end up as expected.
- Check that the uninstall also works when the app is running (the installer closes it first).
- Check the installer and uninstaller icons after the new icon is in (cycle 4), and that `icon.ico` contains all sizes (16 to 256).
- Fix whatever the run turns up; list it in the commit message.

## 4. App icon

Files: `app/src-tauri/icons/*` (`icon.ico`, `icon.icns`, `32x32.png`, `128x128.png`, `128x128@2x.png`, `Square*Logo.png`, `StoreLogo.png`, `app-icon.png`).

The banner's rules, taken as the guideline: cream background with a warm glow, thick dark outline (about `#2A2320`), flat fills, no gradients on the figures, eyes as simple arcs, the terracotta brick `#D97757` and the white robot as the two main characters. The current icon is close in spirit but has a thinner outline and a flatter background.

Plan: generate a raster master with `codex_generate_image` (opaque background, outline thickness fixed in the prompt), look at the preview, regenerate if it adds unrequested elements, then export all sizes. At 16 and 32 px the outline must stay visible, so a simplified small variant (two faces, no accessories) is used if the master turns to mud.

## Out of scope

Cloud sessions and regular chats, new agents, changes to pet artwork, the tray menu.

## Open points

- None blocking. (The Claude settings screenshot arrived and is folded into "Look and feel".)
- Release as 0.15 after the owner's go-ahead.
