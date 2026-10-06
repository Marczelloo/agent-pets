# Promo video

A 28-second showcase of Agent Pets for social media, cut to music. It uses the **real Agent Pets renderer** for every pet (skins, poses, scenes and styles come straight from `app/src`) and the **real app windows** (panel, limits, statistics), recorded from the app's own demo mode. The video only adds the stage, the camera, the motion design and the words.

Output: `docs/video/agent-pets-16x9.mp4` (1920×1080, 60 fps, H.264 + AAC).

## The cut

The picture is timed to two tracks, cut on their bar lines (`src/show/time.ts`):

| Video | Music | Scene |
|---|---|---|
| 0 – 4.9 s | Lofi Vlog, first 7 beats | The whole crew chilling on the taskbar, the camera panning along: *Your coding agents, now living on your taskbar.* |
| 4.9 – 5.6 s | the break | The record is stopped: everyone freezes, turns to us (!) and crouches |
| 5.6 – 7.9 s | Running Night from 87.6 s, uncut to its end | *Meet the crew.* Everyone jumps, confetti, name tags; then a dive into Clawd |
| 7.9 – 12.4 s | | One pet per beat, each in a different state: *See what every agent is doing.* |
| 12.4 – 14.7 s | | Clawd needs you: a bubble, a Windows notification, Open |
| 14.7 – 16.9 s | | Click Clawd: the real panel opens, then the Limits tab |
| 16.9 – 21.5 s | | *7 styles.* Clawd and Kodek (the two with every look) change look on every beat for two bars |
| 21.5 – 23.7 s | | The real statistics window |
| 23.7 – 26.0 s | | *Now inside Claude Code too:* pixel Clawd above the prompt and the `/pets` pane |
| 26.0 – 28.3 s | the final hit | The crew drops onto the end card |

The hand-over from the lofi: on its last beat the lofi stops dead under a record scratch, a beat of silence, then Running Night is simply there at full speed, from a bar deep in its drop section, and plays on uncut to its final hit.

## How it works

```
app/src (renderer, skins, styles, stage/hud)     the app's real drawing code, unchanged
tools/video
  capture.mjs        records the real panel and statistics windows from the app's dev server, frame by frame with a controlled clock
  public/ui/         those recordings (PNG frames + meta.json)
  src/show/time.ts   the beat grid of the cut
  src/show/show.ts   the scenes
  src/show/cues.ts   the sound effects as data, from the same times as the picture
  audio/make_show_audio.py   cuts the two tracks and adds the effects (5 ms fade in, 10 ms fade out each)
  render.mjs         headless Chromium frame by frame -> ffmpeg (H.264, BT.709)
  build.mjs          the whole pipeline
```

## Music

Both tracks are from Pixabay and used under the [Pixabay Content License](https://pixabay.com/service/license-summary/) (free to use in videos, no attribution required; the license does not allow redistributing the audio on its own, so the files are not in this repository):

- "Running Night" by alex_makemusic (Pixabay ID 393139)
- "Lofi Vlog" by velariomusic (Pixabay ID 600937)

Download them and save them as `tools/video/music/running-night.mp3` and `tools/video/music/lofi-vlog.mp3`.

## Building it

Needs Node 22 with pnpm, Python 3 with `numpy` and `scipy` (`pip install -r audio/requirements.txt`), `ffmpeg` on `PATH`, and a Chromium (`CHROMIUM=/path/to/chrome` if it is not at `/opt/pw-browsers/chromium`).

```sh
pnpm install
# once, or after the app's windows change: record them from the app's demo mode
pnpm --dir ../../app exec vite --port 1420     # terminal 1
node capture.mjs                                # terminal 2
# then
pnpm dev                                        # terminal 1: the page that draws the video (http://localhost:1421)
node build.mjs                                  # terminal 2  (--quick for a draft)
```

Useful while editing: `node render.mjs --format=16x9 --grab=8.2,12.7 --sheet=out/sheet.png --cols=2` renders chosen moments into a contact sheet.

## Credits and licenses

- Pets, poses, styles and app windows: Agent Pets (GPL-3.0, see the repository [LICENSE](../../LICENSE) and [NOTICE](../../NOTICE)).
- Fonts: [Fredoka](https://fonts.google.com/specimen/Fredoka) and [Nunito](https://fonts.google.com/specimen/Nunito) (stands in for Segoe UI), both SIL Open Font License 1.1, from npm.
- The Antigravity pet is the Android robot, reproduced or modified from work created and shared by Google under [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/); the end card says so, along with the README's non-affiliation line.
