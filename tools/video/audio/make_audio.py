#!/usr/bin/env python3
"""Builds the Agent Pets soundtrack: an original 120 BPM score in the spirit of indie-game UI music (plucky synths, mallets, clicky
percussion, a light bass, no vocals, no big build-up) plus sound effects placed from out/cues.json, which the animation itself produces.
The cold open is just a ticking clock and a muffled beat that slowly opens; everything comes in on HEY!. Usage: make_audio.py cues.json out.wav"""
import json
import sys

import numpy as np
from scipy.io import wavfile

import synth as S
from synth import note

BPM = 120
BEAT = 60 / BPM
BAR = 4 * BEAT
INTRO_EXTRA = BEAT   # same extra beat as src/beat.ts: bar 3 starts at 4.5 s


def T(bar, beat=0.0): return (bar - 1) * BAR + beat * BEAT + (INTRO_EXTRA if bar >= 3 else 0.0)


# C minor: Cm7 | Abmaj7 | Fm7 | G7sus4, one chord per bar, looping from bar 3.
CH = {
    'Cm7':   dict(bass='C2', arp=['C4', 'Eb4', 'G4', 'Bb4']),
    'Abmaj7': dict(bass='Ab1', arp=['Ab3', 'C4', 'Eb4', 'G4']),
    'Fm7':   dict(bass='F2', arp=['F3', 'Ab3', 'C4', 'Eb4']),
    'G7sus': dict(bass='G1', arp=['G3', 'C4', 'D4', 'F4']),
}
LOOP = ['Cm7', 'Abmaj7', 'Fm7', 'G7sus']
chord_of = lambda bar: LOOP[(bar - 3) % 4]
ARP = [0, 2, 1, 3, 2, 1, 3, 2]                     # eighth-note pluck pattern over the chord tones
MOTIF = {                                          # xylophone tune, C minor pentatonic; '-' = rest, eighth-note steps
    'Cm7':   ['G5', '-', 'Bb5', '-', 'C6', 'Bb5', 'G5', '-'],
    'Abmaj7': ['Eb5', '-', 'G5', '-', 'Ab5', 'G5', 'Eb5', '-'],
    'Fm7':   ['F5', '-', 'Ab5', '-', 'C6', '-', 'Ab5', 'F5'],
    'G7sus': ['D5', 'F5', 'G5', '-', 'D6', '-', 'C6', 'Bb5'],
}
LAND_TUNE = ['C5', 'Eb5', 'F5', 'G5', 'Bb5', 'C6', 'Eb6', 'G6']

MUSIC, SFX = 0.8, 0.95
rng = np.random.default_rng(5)
human = lambda v: v * rng.uniform(0.9, 1.0)


def groove(mix, bar, level, start=0.0):
    """level 1: kick + bass feel; 2: + hats and clap; 3: + clicky percussion."""
    for b, v in ((0, 1.0), (1.5, 0.55), (2.5, 0.8)):
        if b >= start: mix.add(S.kick(human(0.85 * v)), T(bar, b), 0.55, 0.0, 0.02)
    if level >= 2:
        for b in (1, 3):
            if b >= start: mix.add(S.clap(human(0.7)), T(bar, b), 0.4, 0.05, 0.16)
        for i in range(8):
            b = i * 0.5 + 0.5 * 0
            if b >= start: mix.add(S.hat(human(0.55 if i % 2 else 0.4)), T(bar, b), 0.32, 0.25, 0.04)
    if level >= 3:
        for b, f, v in ((0.75, 1700, 0.5), (1.75, 2100, 0.55), (2.25, 1900, 0.45), (3.25, 2300, 0.55), (3.75, 1500, 0.5)):
            if b >= start: mix.add(S.woodtick(f, human(v)), T(bar, b), 0.4, -0.3, 0.06)


def bass(mix, bar, chord, gain=0.8, start=0.0, busy=True):
    r = note(CH[chord]['bass'])
    pat = [(0, 1, 1.0, 1), (1.5, 0.5, 0.7, 1), (2, 0.5, 0.8, 1), (2.75, 0.5, 0.7, 2), (3.5, 0.5, 0.65, 1)] if busy else [(0, 1.5, 1.0, 1), (2.5, 1, 0.7, 1)]
    for b, d, v, o in pat:
        if b >= start: mix.add(S.pluck_bass(r * o, d * BEAT, v), T(bar, b), gain, 0.0, 0.03)


def arp(mix, bar, chord, gain=0.3, start=0.0, bright=1.0):
    tones = [note(n) for n in CH[chord]['arp']]
    for i, k in enumerate(ARP):
        b = i * 0.5
        if b >= start: mix.add(S.psyn(tones[k], 0.28, human((0.9 if i % 2 == 0 else 0.6) * bright)), T(bar, b), gain, -0.2 + 0.08 * (i % 3), 0.28)


def motif(mix, bar, chord, gain=0.5, start=0.0):
    for i, n in enumerate(MOTIF[chord]):
        b = i * 0.5
        if n == '-' or b < start: continue
        mix.add(S.xylo(note(n), 0.5, human(0.9 if i % 2 == 0 else 0.65)), T(bar, b), gain, 0.3, 0.3)


def build(cues_path, out_path):
    data = json.load(open(cues_path))
    cues, dur = data['cues'], data['duration']
    mix = S.Mix(dur)
    by = lambda name: [c for c in cues if c['name'] == name]
    hey = by('hey')[0]['t']; catch = by('catch')[0]['t']; click = by('click')[0]['t']; drop = by('drop')[0]['t']; title = by('ta-da')[0]['t']
    end_bar = T(14, 0)

    # ============================================================ cold open: a clock and a muffled beat that slowly opens ============================================================
    pre = S.Mix(dur)
    n_beats = int(hey / BEAT + 1e-6)
    for k in range(n_beats):
        pre.add(S.clock_tick(0.45 + 0.25 * k / n_beats, tock=(k % 2 == 1)), k * BEAT, 1.0, 0.0, 0.0)
    for k in range(n_beats):
        v = 0.35 + 0.65 * k / n_beats
        if k % 2 == 0: pre.add(S.kick(v * 0.9), k * BEAT, 0.7, 0.0, 0.0)
        pre.add(S.hat(v * 0.7), k * BEAT + BEAT / 2, 0.55, 0.15, 0.0)
        if k % 4 == 3: pre.add(S.clap(v * 0.7), k * BEAT, 0.4, 0.0, 0.0)
    pre.add(S.sub(note('C2'), hey - 0.4, 0.6), 0.3, 0.35, 0.0, 0.0)
    ticks_only = int(0.35 * S.SR)
    pre.L = S.opening_filter(pre.L, 0.0, hey, 220, 9000); pre.R = S.opening_filter(pre.R, 0.0, hey, 220, 9000)
    fade = np.ones(pre.n); m = int(0.04 * S.SR); k0 = int(hey * S.SR)
    fade[k0:k0 + m] = np.linspace(1, 0, m); fade[k0 + m:] = 0
    mix.absorb(pre, fade * MUSIC * 1.1)

    # ============================================================ bars 3-5: the crew arrives, one layer per bar ============================================================
    mix.bus = MUSIC
    for bar in (3, 4, 5):
        ch = chord_of(bar)
        groove(mix, bar, level=bar - 2)
        bass(mix, bar, ch, 0.85, busy=(bar > 3))
        arp(mix, bar, ch, 0.3 + 0.03 * (bar - 3), bright=0.8 + 0.1 * (bar - 3))
    for i, c in enumerate(by('land')):
        mix.add(S.xylo(note(LAND_TUNE[min(i, len(LAND_TUNE) - 1)]), 0.6, 1.0), c['t'] + 0.005, 0.5, -0.15 + 0.06 * i, 0.3)

    # ============================================================ bar 6 up to the catch: no drums, a nervous tick and a held note ============================================================
    t0 = T(5, 3)
    steps = int((catch - t0) / (BEAT / 4))
    for i in range(steps):
        t = t0 + i * BEAT / 4
        mix.add(S.woodtick(1300 + 55 * i, human(0.5 + 0.03 * i)), t, 0.36, 0.2, 0.05)
    for j, nn in enumerate(['G4', 'Bb4', 'D5']):
        mix.add(S.psyn(note(nn), 0.5, 0.8), T(5, 3) + j * 0.25, 0.3, 0.2, 0.3)
    # after the catch: nearly nothing (SFX only) until the click
    for i, nn in enumerate(['G5', 'F5', 'Eb5']):
        t = catch + 0.3 * (i + 1)
        if t < click - 0.1: mix.add(S.xylo(note(nn), 0.5, 0.8), t, 0.4, 0.0, 0.3)

    # ============================================================ bars 7-10: the party, the full groove with the tune on top ============================================================
    mix.bus = MUSIC * 1.05
    for bar in (7, 8, 9, 10):
        ch = chord_of(bar); start = 1.0 if bar == 7 else 0.0
        groove(mix, bar, level=3, start=start)
        bass(mix, bar, ch, 0.9, start=start)
        arp(mix, bar, ch, 0.34, start=start, bright=1.0)
        motif(mix, bar, ch, 0.5, start=start)
    climb = ['C6', 'D6', 'Eb6', 'F6', 'G6', 'Bb6', 'C7', 'D7']
    for c in by('look'):
        mix.add(S.xylo(note(climb[c['p']]), 0.4, 0.8), c['t'] + 0.004, 0.32, -0.3 + 0.085 * c['p'], 0.3)

    # ============================================================ bars 11-13: the group photo, the same tune with more air ============================================================
    mix.bus = MUSIC * 0.95
    for bar in (11, 12, 13):
        ch = chord_of(bar)
        groove(mix, bar, level=2)
        bass(mix, bar, ch, 0.8, busy=False)
        arp(mix, bar, ch, 0.26, bright=0.8)
        if bar > 11: motif(mix, bar, ch, 0.36)
    for nn in ('C6', 'G6', 'C7'): mix.add(S.xylo(note(nn), 1.0, 0.9), title, 0.3, 0.0, 0.4)
    mix.add(S.pluck_bass(note('C2'), 1.0, 1.0), title, 0.9, 0.0, 0.05)
    # the resolution: a last Cm chord and the knock that follows
    mix.bus = MUSIC
    for j, nn in enumerate(['C4', 'Eb4', 'G4', 'C5']):
        mix.add(S.psyn(note(nn), 1.4, 0.9), end_bar + 0.02 * j, 0.32, -0.2 + 0.13 * j, 0.45)
    mix.add(S.pluck_bass(note('C2'), 1.6, 1.0), end_bar, 0.9, 0.0, 0.05)
    mix.add(S.kick(0.8), end_bar, 0.55, 0.0, 0.03)

    # ============================================================ sound effects: dry and present, they carry the picture ============================================================
    mix.bus = SFX
    tick_pitch = [1100, 1250, 1400, 1600, 1800, 2000]
    for c in cues:
        n, t, v, p = c['name'], c['t'], c.get('v', 1.0), c.get('p')
        if n == 'knock':
            far = v < 0.35
            mix.add(S.knock(1.0, far), t, (0.35 + 0.65 * v) * 0.95, 0.0, 0.3 if far else 0.14)
        elif n == 'hey':
            mix.add(S.impact(1.0), t, 1.0 * v, 0.0, 0.2); mix.add(S.pop(700, 1.0), t + 0.01, 0.5 * v, 0.0, 0.2)
        elif n == 'pop': mix.add(S.pop(520 * (1.09 ** (p or 0)), 1.0), t, 0.55 * v, 0.1, 0.2)
        elif n == 'whoosh': mix.add(S.swipe(0.4, 1.0, True), t - 0.05, 0.5 * v, 0.0, 0.2)
        elif n == 'fall': mix.add(S.swipe(0.5, 1.0, False), t, 0.18 * v, -0.3 + 0.1 * (p or 0), 0.2)
        elif n == 'land':
            mix.add(S.thump(60 + 3 * (p or 0), 1.0, 0.2), t, 0.5 * v, 0.0, 0.08); mix.add(S.pop(380 * (1.08 ** (p or 0)), 1.0), t, 0.55 * v, -0.2 + 0.07 * (p or 0), 0.2)
        elif n == 'snore': mix.add(S.snore(1.0, 1.7), t, 0.4 * v, 0.4, 0.2)
        elif n == 'ping': mix.add(S.pop(880, 1.0), t, 0.5 * v, -0.3, 0.3)
        elif n == 'miss': mix.add(S.whoosh(0.16, 1.0, False), t, 0.35 * v, 0.0, 0.15)
        elif n == 'plane':
            m = int(S.SR * 0.42); tt_ = S.tt(m)
            mix.add(S.bp(S.noise(m), 1800, 6500) * np.sin(np.pi * tt_ / tt_[-1]) ** 1.5, t, 0.28 * v, 0.2, 0.2)
        elif n == 'bonk': mix.add(S.tock(1.0), t, 0.8 * v, 0.0, 0.25); mix.add(S.thump(90, 1.0, 0.2), t, 0.5, 0.0, 0.15)
        elif n == 'catch':
            mix.add(S.impact(1.0), t, 0.9 * v, 0.0, 0.25); mix.add(S.click(1.0), t, 0.5, 0.0, 0.1)
        elif n == 'ding': mix.add(S.pop(1100, 1.0), t, 0.35 * v, 0.0, 0.3)
        elif n == 'hop': mix.add(S.pop(300, 1.0), t, 0.55 * v, 0.0, 0.2)
        elif n == 'thud': mix.add(S.thump(95, 1.0, 0.14), t, 0.5 * v, 0.0, 0.1)
        elif n == 'press': mix.add(S.click(0.5), t, 0.5 * v, 0.0, 0.08)
        elif n == 'click': mix.add(S.click(1.0), t, 1.0 * v, 0.0, 0.1)
        elif n == 'burst': mix.add(S.softburst(1.0), t, 0.5 * v, 0.0, 0.3)
        elif n == 'drop': mix.add(S.thump(46, 1.0, 0.7), t, 0.9 * v, 0.0, 0.1)
        elif n == 'confetti':
            for side in (-1, 1): mix.add(S.softburst(1.0), t + (0.012 if side > 0 else 0), 0.45 * v, 0.8 * side, 0.3)
        elif n == 'phones': mix.add(S.slide(420, 1500, 0.2, 1.0, 5, 0.005), t, 0.12 * v, 0.0, 0.2)
        elif n == 'wake': mix.add(S.slide(300, 430, 0.26, 1.0, 5, 0.03), t, 0.3 * v, 0.4, 0.3); mix.add(S.slide(430, 290, 0.32, 1.0, 5, 0.03), t + 0.26, 0.3 * v, 0.4, 0.3)
        elif n == 'look': mix.add(S.snap(1.0), t, 0.7 * v, 0.0, 0.15); mix.add(S.woodtick(2600, 1.0), t + 0.012, 0.3, 0.0, 0.1)
        elif n == 'shutter': mix.add(S.shutter(1.0), t, 0.6 * v, 0.0, 0.15)
        elif n == 'ta-da': mix.add(S.pop(900, 1.0), t + 0.02, 0.4, 0.0, 0.3)
        elif n == 'tick': mix.add(S.woodtick(tick_pitch[(p or 0) % 6], 1.0), t, 0.3 * v, 0.0, 0.15)

    mix.reverb(0.55, 0.8)
    y = mix.master()
    keep = int(S.SR * (dur + 0.05))
    y = y[:, :keep]
    n = int(S.SR * 0.25); y[:, -n:] *= np.linspace(1, 0, n)
    wavfile.write(out_path, S.SR, (np.clip(y.T, -1, 1) * 32767).astype(np.int16))
    print('wrote', out_path, f'{y.shape[1] / S.SR:.2f} s', 'peak', float(np.max(np.abs(y))))


if __name__ == '__main__':
    build(sys.argv[1], sys.argv[2])
