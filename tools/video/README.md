# Promo video

A 30-second silly-and-cute video for social media, made with the **real Agent Pets renderer**: the pets, their poses, the speech bubbles and the taskbar HUD are the app's own drawing code, imported straight from `app/src`. Nothing is re-drawn or faked; the video only adds a stage, a camera, a timeline and a few video-only poses (the same trick `app/src/showcaseBanner.ts` uses for the README banner).

Outputs (in `docs/video/`):

| File | For | Notes |
|---|---|---|
| `agent-pets-16x9.mp4` | X, GitHub, website, YouTube | 1920×1080, 60 fps, with sound |
| `agent-pets-9x16.mp4` | Reels, Shorts, TikTok, X on phones | 1080×1920, 60 fps, with sound |
| `agent-pets-16x9-silent.mp4`, `agent-pets-9x16-silent.mp4` | muted autoplay, your own music | same picture, no audio track |

All text is on screen, so the silent cuts tell the whole story.

## The story (108 BPM, 14¾ bars)

1. **Cold open.** Clawd knocks on the glass of your screen: *Your coding agent has been waiting… for 20 minutes.* The camera pulls back: you are right there, browsing, not looking.
2. **The crew steps in.** Clawd calls for help and the crew drops out of the sky, one pet per beat, onto a pyramid. Every landing pops a name tag: Clawd, opencode, Copilot, Cursor, Grok, Kodek, Kilo, ZCode (asleep) and Antigravity (floating).
3. **Got your attention?** Kilo waves, Kodek's net misses, Grok's paper plane bonks the cursor dizzy, the net scoops it up (in the app's Dynamic look: impact frame, sparks) and it hops down to Clawd's question. Click.
4. **Party.** *Never keep them waiting.* Headphones on (the music break), the whole pyramid bops, the panda finally wakes up, then the **seven looks** flip on the beat.
5. **Group photo.** Flash, the headphones fly off, *Agent Pets: your coding agents, but tiny*, the offer, and one last knock that rhymes with the first frame.

## How it works

```
app/src/renderer, skins, styles, stage/hud ...   the app's real drawing code (unchanged)
        │  imported by
tools/video/src
  actors.ts     wraps a real PetPainter; adds a "puppet" scene so the timeline can drive any pose parameter per frame
  camera.ts     stateless camera (pure function of time): world units are pet units
  world.ts      cream backdrop, the user's desktop windows, the taskbar, the mouse cursor
  tower.ts      the pyramid and the rain of pets: falling, squashing, swaying, all pure functions of time
  act1..act5.ts the story; each act owns a stretch of time and writes into the shared context (ctx.ts)
  cues.ts       every sound effect as data, computed from the same time constants as the animation
  main.ts       browser entry: window.video.step() renders the next frame
render.mjs      drives headless Chromium frame by frame and pipes PNGs into ffmpeg (H.264, BT.709)
audio/          synth.py + make_audio.py: an original score and sound effects, synthesized from scratch (numpy/scipy)
build.mjs       the whole pipeline in one command
```

Because the sound cues come from the same constants as the animation (`beat.ts` and the acts' exported times), picture and sound cannot drift apart. Retime anything in the acts and the audio follows on the next build.

Frames are deterministic (the renderer's random numbers are seeded), and the story is a function of time, so every run produces the same video.

## Building it

Needs Node 22 with pnpm, Python 3 with `numpy` and `scipy` (`pip install -r audio/requirements.txt`), an `ffmpeg` with libx264 and AAC on `PATH`, and a Chromium (set `CHROMIUM=/path/to/chrome` if it is not at `/opt/pw-browsers/chromium`).

```sh
pnpm install
pnpm dev                      # terminal 1: serves the page that draws the pets (http://localhost:1421)
node build.mjs                # terminal 2: cues -> soundtrack -> both formats -> docs/video/
node build.mjs --quick        # same, at draft quality (about a third of the time)
```

Useful while editing (all write to `out/`, which is git-ignored):

```sh
# contact sheet of chosen moments (seconds), e.g. every half second of the first ten
node render.mjs --format=16x9 --to=10 --grab=0,0.5,1,1.5 --sheet=out/sheet.png --cols=4
# the sound cues the animation produces
node render.mjs --cues=out/cues.json
# a single format, silent
node render.mjs --format=9x16 --out=out/test.mp4 --crf=28 --preset=veryfast
```

`lab.html` (`src/lab.ts`) is a small bench for posing pets from JSON and grabbing frames when you are authoring a new pose.

## Sound

The soundtrack is original and synthesized in `audio/`; there are no samples, so there is nothing to license. The tune only uses C, D, E, G and A over I–IV–V–vi chords. Levels are normalised to −14 LUFS with a −1.5 dBTP ceiling. To use your own track instead, take the `*-silent.mp4` files and add it in any editor.

## Credits and licenses

- Pets, poses and styles: Agent Pets (see the repository [LICENSE](../../LICENSE) and [NOTICE](../../NOTICE)).
- Fonts: [Fredoka](https://fonts.google.com/specimen/Fredoka) (titles) and [Nunito](https://fonts.google.com/specimen/Nunito) (bubbles and small text), both SIL Open Font License 1.1, installed from npm (`@fontsource-variable/*`).
- The Antigravity pet is the Android robot, reproduced or modified from work created and shared by Google under [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/); the video's end card says so.
- The end card also repeats the README's disclaimer: Agent Pets is not affiliated with Anthropic, OpenAI, GitHub, Google, Cursor, xAI, Z.ai or opencode.
