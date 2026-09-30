#!/usr/bin/env python3
"""Builds the Agent Pets soundtrack: an original 108 BPM score (dark electronic over a dusty lo-fi beat, in A minor) plus dry sound
effects placed from out/cues.json, which the animation itself produces. Usage: make_audio.py cues.json out.wav"""
import json
import sys

import numpy as np
from scipy.io import wavfile

import synth as S
from synth import note

BPM = 108
BEAT = 60 / BPM
BAR = 4 * BEAT
SWING = 0.13   # off-beats land a little late, like a drummer who is not in a hurry


def T(bar, beat=0.0): return (bar - 1) * BAR + beat * BEAT


# i - VI - iv - v in A minor. Each chord: bass root, pad voicing, keys voicing.
CH = {
    'Am9':   dict(bass='A2', pad=['A2', 'E3', 'G3', 'B3'], keys=['A3', 'C4', 'E4', 'G4', 'B4']),
    'Fmaj7': dict(bass='F2', pad=['F2', 'C3', 'E3', 'A3'], keys=['F3', 'A3', 'C4', 'E4', 'G4']),
    'Dm9':   dict(bass='D2', pad=['D3', 'A3', 'C4', 'E4'], keys=['D3', 'F3', 'A3', 'C4', 'E4']),
    'Em7':   dict(bass='E2', pad=['E3', 'B3', 'D4', 'G3'], keys=['E3', 'G3', 'B3', 'D4', 'A4']),
}
LOOP = ['Am9', 'Fmaj7', 'Dm9', 'Em7']
chord_of = lambda bar: LOOP[(bar - 3) % 4]
MELODY = {   # two-bar motif in A minor pentatonic, eighth-note steps ('-' rests)
    'Am9':   ['E5', '-', 'G5', '-', 'A5', '-', 'G5', 'E5'],
    'Fmaj7': ['C5', '-', 'E5', '-', 'G5', '-', 'E5', '-'],
    'Dm9':   ['D5', '-', 'F5', '-', 'A5', '-', 'G5', '-'],
    'Em7':   ['B4', '-', 'D5', 'E5', '-', 'D5', 'B4', '-'],
}

MUSIC, SFX = 0.8, 0.9
rng = np.random.default_rng(11)


def human(vel): return vel * rng.uniform(0.88, 1.0)


def strum(stem, t, chord, vel=1.0, gain=0.3, pan=-0.1, dur=1.4, send=0.25, bright=0.5):
    for i, n in enumerate(CH[chord]['keys']):
        stem.add(S.ep(note(n), dur, human(vel) * (0.9 + 0.1 * (i % 2)), bright), t + i * 0.014, gain, pan + 0.04 * i, send)


def beat_lofi(mix, bar, vel=1.0, kick_ghost=True):
    """Half-time: kick on 1 and the 'and' of 2, snare on 3, swung hats."""
    for b, v in ((0, 1.0), (1.5, 0.7)): mix.add(S.lkick(human(vel * v)), T(bar, b), 0.7, 0.0, 0.02)
    if kick_ghost: mix.add(S.lkick(human(vel * 0.45)), T(bar, 2.75), 0.5, 0.0, 0.02)
    mix.add(S.lsnare(human(vel)), T(bar, 2), 0.5, 0.05, 0.18)
    for i in range(8):
        b = i * 0.5 + (SWING if i % 2 else 0)
        mix.add(S.lhat(human(vel * (0.9 if i % 2 else 0.6)), open_=(i == 7)), T(bar, b), 0.42, 0.25, 0.05)


def beat_groove(mix, bar, vel=1.0, start=0):
    """The party: kicks pushed forward, snare on 2 and 4, sixteenth hats."""
    for b, v in ((0, 1.0), (0.75, 0.5), (2, 0.95), (2.75, 0.55)):
        if b >= start: mix.add(S.lkick(human(vel * v)), T(bar, b), 0.72, 0.0, 0.02)
    for b in (1, 3):
        if b >= start: mix.add(S.lsnare(human(vel)), T(bar, b), 0.52, 0.05, 0.2)
    for i in range(16):
        b = i * 0.25 + (SWING * 0.5 if i % 2 else 0)
        if b >= start: mix.add(S.lhat(human(vel * (0.75 if i % 4 == 2 else 0.4 if i % 2 else 0.55)), open_=(i == 14)), T(bar, b), 0.38, 0.25, 0.05)
    mix.add(S.rim(human(0.7 * vel)), T(bar, 3.5), 0.3, -0.25, 0.1)


def bass_line(mix, bar, chord, party, gain=0.8):
    r = note(CH[chord]['bass'])
    pat = [(0, 1, 0.95), (1.5, 0.5, 0.7), (2.75, 0.5, 0.75), (3.5, 0.5, 0.65)] if party else [(0, 1.5, 0.95), (2.5, 0.75, 0.6)]
    for b, d, v in pat: mix.add(S.sub(r * (2 if (b == 3.5 and party) else 1), d * BEAT, v), T(bar, b), gain, 0.0, 0.02)


def duck_curve(n, kicks, depth=0.3, tau=0.14):
    """Sidechain: pull the pads and keys down on every kick, then let them swell back."""
    t = np.arange(n) / S.SR; g = np.ones(n)
    for k in kicks:
        m = t >= k
        g[m] = np.minimum(g[m], 1 - depth * np.exp(-(t[m] - k) / tau))
    return g


def build(cues_path, out_path):
    data = json.load(open(cues_path))
    cues, dur = data['cues'], data['duration']
    mix = S.Mix(dur)
    keys, pads = S.Mix(dur), S.Mix(dur)
    by = lambda name: [c for c in cues if c['name'] == name]
    click = by('click')[0]['t']; drop = by('drop')[0]['t']; catch = by('catch')[0]['t']; title = by('ta-da')[0]['t']
    end_bar = T(14, 0)
    kicks = []   # times the sidechain reacts to

    def kick_track(bar, fn, *a, **k):
        fn(mix, bar, *a, **k)

    # ============================================================ bed: vinyl dust all the way through ============================================================
    mix.bus = 1.0
    mix.add(S.vinyl(dur + 0.5), 0.0, 0.9, 0.0, 0.0)

    # ============================================================ bars 1-2: the knocks, a low drone, nothing else ============================================================
    mix.bus = MUSIC
    mix.add(S.sub(note('A1'), 4.6, 0.7), 0.0, 0.5, 0.0, 0.1)
    pads.bus = MUSIC * 0.8
    pads.add(S.dpad([note('A2'), note('E3'), note('A3')], T(3) - 0.3, 1.0, 1.6, 0.5, 700), 0.3, 0.6, 0.0, 0.25)

    # ============================================================ bars 3-5: the crew arrives, one layer per landing ============================================================
    for bar in (3, 4, 5):
        ch = chord_of(bar)
        # the beat comes in a piece at a time: hats, then the rim, then the whole half-time pattern
        if bar == 3:
            for i in range(8): mix.add(S.lhat(human(0.5 if i % 2 == 0 else 0.35)), T(bar, i * 0.5 + (SWING if i % 2 else 0)), 0.34, 0.25, 0.05)
            mix.add(S.rim(0.7), T(bar, 2), 0.3, -0.2, 0.1)
        else:
            beat_lofi(mix, bar, vel=0.7 + 0.1 * (bar - 4))
        bass_line(mix, bar, ch, False, 0.7)
        pads.add(S.dpad([note(n) for n in CH[ch]['pad']], BAR + 0.2, 1.0, 0.5, 0.7, 900 + 150 * (bar - 3)), T(bar) - 0.05, 0.75, 0.0, 0.3)
        keys.bus = MUSIC * 0.8
        strum(keys, T(bar, 0), ch, 0.7, gain=0.2)
        if bar > 3: strum(keys, T(bar, 2.5), ch, 0.5, gain=0.14, dur=0.9)
    keys.bus = MUSIC
    melody = ['A3', 'C4', 'D4', 'E4', 'G4', 'A4', 'C5', 'D5']
    for i, c in enumerate(by('land')):
        f = note(melody[min(i, len(melody) - 1)])
        keys.add(S.ep(f, 1.2, 1.0, 0.7), c['t'] + 0.01, 0.34, -0.2 + 0.06 * i, 0.4)

    # ============================================================ bar 6 to the catch: no kick, a held chord, a slow arpeggio ============================================================
    t0 = T(6, 0)
    pads.bus = MUSIC * 0.9
    pads.add(S.dpad([note(n) for n in CH['Em7']['pad']], catch - t0, 1.0, 0.8, 0.1, 1200), t0, 0.8, 0.0, 0.3)
    mix.bus = MUSIC * 0.9
    mix.add(S.sub(note('E2'), catch - t0, 0.9), t0, 0.6, 0.0, 0.05)
    keys.bus = MUSIC * 0.85
    arp = ['E4', 'G4', 'B4', 'D5', 'B4', 'G4']
    steps = int((catch - 0.05 - T(5, 3)) / (BEAT / 2))
    for i in range(steps):
        tt_ = T(5, 3) + i * BEAT / 2 + (SWING if i % 2 else 0)
        keys.add(S.ep(note(arp[i % len(arp)]), 0.5, 0.55 + 0.02 * i, 0.5 + 0.02 * i), tt_, 0.2, 0.25, 0.35)
        if i % 2: mix.add(S.lhat(0.35), tt_, 0.3, 0.25, 0.05)

    # the catch: one heavy hit, then almost nothing until the click
    mix.bus = MUSIC
    pads.add(S.dpad([note('A2'), note('E3'), note('B3')], click - catch - 0.02, 1.0, 0.3, 0.05, 800), catch, 0.6, 0.0, 0.3)
    mix.add(S.riser(drop - click - 0.2, 1.0), click + 0.18, 0.45, 0.0, 0.25)

    # ============================================================ bars 7-10: the party. Dark electronic groove ============================================================
    keys_pl, pad_pl = MUSIC * 1.0, MUSIC * 0.85
    for bar in (7, 8, 9, 10):
        ch = chord_of(bar); start = 1 if bar == 7 else 0
        mix.bus = MUSIC * 1.05
        beat_groove(mix, bar, 1.0, start=start)
        bass_line(mix, bar, ch, True, 0.85)
        for b in (0, 0.75, 2, 2.75):
            if b >= start: kicks.append(T(bar, b))
        pads.bus = pad_pl
        pads.add(S.dpad([note(n) for n in CH[ch]['pad']], BAR + 0.15, 1.0, 0.05, 0.4, 1500), T(bar) + (BEAT if bar == 7 else 0), 0.75, 0.0, 0.3)
        keys.bus = keys_pl
        for b in (0.75, 1.75, 3.25):
            if b >= start: strum(keys, T(bar, b), ch, 0.55, gain=0.16, dur=0.7, bright=0.6)
        # the motif, on top, with a long shadow
        for i, n in enumerate(MELODY[ch]):
            if n == '-' or i * 0.5 < start: continue
            keys.add(S.ep(note(n), 0.6, 0.85 if i % 2 == 0 else 0.6, 0.85), T(bar, i * 0.5), 0.22, 0.3, 0.6)

    # the looks: a low stab on each flip, climbing the scale
    mix.bus = MUSIC
    climb = ['A2', 'C3', 'D3', 'E3', 'G3', 'A3', 'C4', 'E4']
    for c in by('look'):
        i = c['p']
        keys.add(S.ep(note(climb[i]) * 2, 0.7, 0.9, 0.5), c['t'], 0.3, 0.0, 0.4)

    # ============================================================ bars 11-14: the group photo, a calmer beat, the last knock ============================================================
    for bar in (11, 12, 13):
        ch = chord_of(bar)
        mix.bus = MUSIC * 0.95
        if bar == 11: mix.add(S.lkick(1.0), T(bar, 0), 0.9, 0.0, 0.02)
        else: beat_lofi(mix, bar, vel=0.75)
        bass_line(mix, bar, ch, False, 0.75)
        pads.bus = MUSIC * 0.85
        pads.add(S.dpad([note(n) for n in CH[ch]['pad']], BAR + 0.3, 1.0, 0.4, 0.8, 1400 - 200 * (bar - 11)), T(bar) - 0.02, 0.8, 0.0, 0.3)
        keys.bus = MUSIC * 0.85
        strum(keys, T(bar, 0), ch, 0.8, gain=0.2)
        if bar > 11: strum(keys, T(bar, 2.5), ch, 0.5, gain=0.14, dur=0.9)
    mix.bus = MUSIC * 1.0
    mix.add(S.sub(note('A1'), 2.0, 1.0), title, 0.9, 0.0, 0.05)
    mix.add(S.crash(1.8, 0.6), title, 0.28, 0.0, 0.3)
    pads.bus = MUSIC * 0.95
    pads.add(S.dpad([note('A2'), note('E3'), note('G3'), note('B3'), note('E4')], T(14, 0) - title + 0.4, 1.0, 0.1, 1.0, 1600), title, 0.9, 0.0, 0.4)
    # the resolution: one last Am9 that rings out
    keys.bus = MUSIC * 0.95
    strum(keys, end_bar, 'Am9', 1.0, gain=0.26, dur=2.4, send=0.4)
    mix.add(S.sub(note('A2'), 1.8, 1.0), end_bar, 0.85, 0.0, 0.05)
    mix.add(S.lkick(0.9), end_bar, 0.7, 0.0, 0.03)
    pads.add(S.dpad([note('A2'), note('E3'), note('G3'), note('B3')], dur - end_bar + 0.6, 1.0, 0.3, 1.0, 1000), end_bar, 0.8, 0.0, 0.4)

    # sidechain the pads and keys under the party's kicks, then fold the stems into the mix
    duck = duck_curve(mix.n, kicks)
    mix.absorb(pads, duck); mix.absorb(keys, (duck ** 0.5) * 1.4)
    # tame the sub: felt more than heard, so the mids carry the tune on phone speakers
    for ch in (mix.L, mix.R): ch -= 0.42 * S.lp(ch, 120, 2)

    # ============================================================ sound effects: dry, close, no cartoon ============================================================
    mix.bus = SFX
    tick_pitch = [1100, 1250, 1400, 1600, 1800, 2000]
    for c in cues:
        n, t, v, p = c['name'], c['t'], c.get('v', 1.0), c.get('p')
        if n == 'knock':
            far = v < 0.7
            mix.add(S.knock(1.0, far), t, 0.9 * v, 0.0, 0.35 if far else 0.16)
        elif n == 'whoosh': mix.add(S.swipe(0.42, 1.0, True), t - 0.05, 0.6 * v, 0.0, 0.2)
        elif n == 'pop': mix.add(S.uiblip(620 * (1.12 ** (p or 0)), 1.0), t, 0.45 * v, 0.1, 0.2)
        elif n == 'cricket': mix.add(S.cricket(1.0), t, v, -0.35, 0.25)
        elif n == 'sigh': mix.add(S.slide(520, 320, 0.5, 1.0, 5.5, 0.01), t, 0.55 * v, 0.0, 0.3)
        elif n == 'whistle':   # the call for help: a system alert, two falling blips
            mix.add(S.uiblip(880, 1.0), t, 0.55 * v, 0.0, 0.25); mix.add(S.uiblip(660, 1.0), t + 0.16, 0.55 * v, 0.0, 0.25)
        elif n == 'fall': mix.add(S.swipe(0.5, 1.0, False), t, 0.22 * v, -0.3 + 0.1 * (p or 0), 0.2)
        elif n == 'land':
            mix.add(S.thump(58 + 3 * (p or 0), 1.0, 0.24), t, 0.6 * v, 0.0, 0.08); mix.add(S.click(0.6), t, 0.25 * v, 0.0, 0.1)
        elif n == 'snore': mix.add(S.snore(1.0, 1.7), t, 0.4 * v, 0.4, 0.2)
        elif n == 'ping': mix.add(S.uiblip(1046, 1.0), t, 0.5 * v, -0.3, 0.3)
        elif n == 'miss': mix.add(S.whoosh(0.16, 1.0, False), t, 0.35 * v, 0.0, 0.15)
        elif n == 'plane':
            m = int(S.SR * 0.42); tt_ = S.tt(m)
            mix.add(S.bp(S.noise(m), 1800, 6500) * np.sin(np.pi * tt_ / tt_[-1]) ** 1.5, t, 0.28 * v, 0.2, 0.2)
        elif n == 'bonk':
            mix.add(S.tock(1.0), t, 0.8 * v, 0.0, 0.25); mix.add(S.thump(90, 1.0, 0.2), t, 0.5, 0.0, 0.15)
        elif n == 'catch':
            mix.add(S.thump(50, 1.0, 0.55), t, 1.0 * v, 0.0, 0.1); mix.add(S.click(1.0), t, 0.5, 0.0, 0.1); mix.add(S.crash(1.0, 0.7), t, 0.32 * v, 0.0, 0.3)
        elif n == 'ding': mix.add(S.uiblip(440, 1.0), t, 0.4 * v, 0.0, 0.4)
        elif n == 'hop': mix.add(S.thump(130, 1.0, 0.12), t, 0.5 * v, 0.0, 0.15); mix.add(S.click(0.5), t, 0.3, 0.0, 0.1)
        elif n == 'thud': mix.add(S.thump(95, 1.0, 0.16), t, 0.5 * v, 0.0, 0.1)
        elif n == 'press': mix.add(S.click(0.5), t, 0.5 * v, 0.0, 0.08)
        elif n == 'click': mix.add(S.click(1.0), t, 0.9 * v, 0.0, 0.1)
        elif n == 'burst':
            m = int(S.SR * 0.1); mix.add(S.bp(S.noise(m), 2200, 8500) * np.exp(-S.tt(m) / 0.03), t, 0.3 * v, 0.0, 0.25)
        elif n == 'drop': mix.add(S.thump(46, 1.0, 0.95), t, 1.0 * v, 0.0, 0.12)
        elif n == 'confetti':
            for side in (-1, 1):
                m = int(S.SR * 0.1); mix.add(S.bp(S.noise(m), 700, 4200) * np.exp(-S.tt(m) / 0.03), t + (0.012 if side > 0 else 0), 0.35 * v, 0.8 * side, 0.3)
        elif n == 'phones': mix.add(S.slide(420, 1500, 0.2, 1.0, 5, 0.005), t, 0.14 * v, 0.0, 0.2)
        elif n == 'wake': mix.add(S.slide(300, 430, 0.26, 1.0, 5, 0.03), t, 0.35 * v, 0.4, 0.3); mix.add(S.slide(430, 290, 0.32, 1.0, 5, 0.03), t + 0.26, 0.35 * v, 0.4, 0.3)
        elif n == 'look': mix.add(S.swipe(0.2, 1.0, True), t - 0.05, 0.3 * v, 0.0, 0.15)
        elif n == 'shutter': mix.add(S.shutter(1.0), t, 0.6 * v, 0.0, 0.15)
        elif n == 'tick': mix.add(S.woodtick(tick_pitch[(p or 0) % 6], 1.0), t, 0.3 * v, 0.0, 0.15)

    mix.reverb(0.7, 1.0)
    y = S.lofi(mix.master())
    keep = int(S.SR * (dur + 0.05))
    y = y[:, :keep]
    n = int(S.SR * 0.25); y[:, -n:] *= np.linspace(1, 0, n)
    wavfile.write(out_path, S.SR, (np.clip(y.T, -1, 1) * 32767).astype(np.int16))
    print('wrote', out_path, f'{y.shape[1] / S.SR:.2f} s', 'peak', float(np.max(np.abs(y))))


if __name__ == '__main__':
    build(sys.argv[1], sys.argv[2])
