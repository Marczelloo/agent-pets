#!/usr/bin/env python3
"""Builds the Agent Pets soundtrack: an original 120 BPM score in F major (pizzicato, marimba, glockenspiel, a warm plucked bass, shaker and
claps; no vocals) plus sound effects placed from out/cues.json, which the animation itself produces.
Structure: a ticking clock and a muffled motif that opens up until HEY!, a second of near silence, then the groove enters with Clawd's landing
and gains a layer for every pet that lands; it thins out for "Got your attention?", comes back with the Allow click, and rings out on the end card.
Usage: make_audio.py cues.json out.wav [sfx_only.wav]"""
import json
import sys

import numpy as np
from scipy.io import wavfile

import synth as S
from synth import note

BPM = 120
BEAT = 60 / BPM
BAR = 4 * BEAT
INTRO_EXTRA = 4 * BEAT   # same as src/beat.ts: bar 3 starts at 6.0 s


def T(bar, beat=0.0): return (bar - 1) * BAR + beat * BEAT + (INTRO_EXTRA if bar >= 3 else 0.0)


# F major, I - vi - IV - V: F | Dm | Bb | C, one chord per bar, looping from bar 3.
CH = {
    'F':  dict(bass='F2',  pz=['A3', 'C4', 'F4'],  arp=['F4', 'A4', 'C5', 'A4']),
    'Dm': dict(bass='D3',  pz=['A3', 'D4', 'F4'],  arp=['D4', 'F4', 'A4', 'F4']),
    'Bb': dict(bass='Bb2', pz=['Bb3', 'D4', 'F4'], arp=['Bb3', 'D4', 'F4', 'D4']),
    'C':  dict(bass='C3',  pz=['G3', 'C4', 'E4'],  arp=['C4', 'E4', 'G4', 'E4']),
}
LOOP = ['F', 'Dm', 'Bb', 'C']
chord_of = lambda bar: LOOP[(bar - 3) % 4]
MELODY = {   # a simple hummable tune, eighth-note steps ('-' = rest)
    'F':  ['C5', '-', 'A4', 'C5', 'F5', '-', 'E5', 'C5'],
    'Dm': ['D5', '-', 'A4', 'D5', 'F5', '-', 'D5', 'A4'],
    'Bb': ['Bb4', '-', 'D5', 'F5', 'Bb5', '-', 'A5', 'F5'],
    'C':  ['G5', '-', 'E5', 'C5', 'D5', 'E5', 'G5', '-'],
}
LAND_TUNE = ['F5', 'G5', 'A5', 'C6', 'D6', 'F6', 'G6', 'A6', 'C7']

MUSIC, SFX = 0.85, 0.95
rng = np.random.default_rng(3)
human = lambda v: v * rng.uniform(0.9, 1.0)


class Score:
    """Places events on the music stem; `on(t)` tells which layers are in at time t (they come in with the landings)."""
    def __init__(self, mix, lands): self.m, self.lands = mix, lands
    def layer(self, t, n): return len(self.lands) >= n and t >= self.lands[n - 1] - 1e-6

    def bass(self, bar, chord, t0=0.0, gain=0.8, busy=True):
        r = note(CH[chord]['bass'])
        pat = [(0, 1, 1.0), (1.5, 0.5, 0.7), (2, 0.75, 0.85), (3.5, 0.5, 0.65)] if busy else [(0, 1.5, 0.9), (2, 1, 0.6)]
        for b, d, v in pat:
            t = T(bar, b)
            if t >= t0: self.m.add(S.warm_bass(r, d * BEAT, v), t, gain, 0.0, 0.03)

    def kick(self, bar, t0=0.0, four=False, gain=0.5):
        for b, v in ((0, 1.0), (1, 0.85 if four else 0), (1.5, 0.45), (2, 0.9), (3, 0.85 if four else 0), (3.5, 0.0 if four else 0.45)):
            t = T(bar, b)
            if v and t >= t0: self.m.add(S.kick_soft(human(v)), t, gain, 0.0, 0.02)

    def claps(self, bar, t0=0.0, gain=0.38):
        for b in (1, 3):
            t = T(bar, b)
            if t >= t0: self.m.add(S.snapclap(human(0.8)), t, gain, 0.05, 0.16)

    def shaker(self, bar, t0=0.0, sixteenth=False, gain=0.3):
        for i in range(16 if sixteenth else 8):
            b = i * (0.25 if sixteenth else 0.5); t = T(bar, b)
            if t >= t0: self.m.add(S.shaker(human(0.5 if i % 2 else 0.75)), t, gain, -0.3, 0.05)

    def hats(self, bar, t0=0.0, gain=0.22):
        for i in range(8):
            t = T(bar, i * 0.5 + 0.25 * 0)
            if i % 2 == 1 and t >= t0: self.m.add(S.hat(human(0.6)), t, gain, 0.25, 0.04)

    def ticks(self, bar, t0=0.0, gain=0.34):
        for b, f, v in ((0.75, 1700, 0.5), (1.75, 2100, 0.55), (2.25, 1900, 0.45), (3.25, 2300, 0.55), (3.75, 1500, 0.5)):
            t = T(bar, b)
            if t >= t0: self.m.add(S.woodtick(f, human(v)), t, gain, -0.3, 0.06)

    def pizz(self, bar, chord, t0=0.0, gain=0.32):
        tones = [note(n) for n in CH[chord]['pz']]
        for b, v in ((0.5, 0.8), (1.5, 0.65), (2.5, 0.8), (3.5, 0.65)):
            t = T(bar, b)
            if t < t0: continue
            for i, f in enumerate(tones): self.m.add(S.pizz(f, 0.3, human(v) * (0.9 + 0.1 * (i % 2))), t + i * 0.012, gain, -0.25 + 0.2 * i, 0.22)

    def arp(self, bar, chord, t0=0.0, gain=0.22):
        tones = [note(n) for n in CH[chord]['arp']]
        for i in range(8):
            t = T(bar, i * 0.5 + 0.25)
            if t >= t0: self.m.add(S.pizz(tones[i % 4] * 2, 0.22, human(0.55)), t, gain, 0.3, 0.25)

    def melody(self, bar, chord, t0=0.0, gain=0.5):
        for i, n in enumerate(MELODY[chord]):
            t = T(bar, i * 0.5)
            if n != '-' and t >= t0: self.m.add(S.marimba(note(n), 0.5, human(0.9 if i % 2 == 0 else 0.65)), t, gain, 0.2, 0.3)

    def glock(self, bar, chord, t0=0.0, gain=0.3, beats=(0,)):
        top = {'F': 'C6', 'Dm': 'D6', 'Bb': 'F6', 'C': 'G6'}[chord]
        for b in beats:
            t = T(bar, b)
            if t >= t0: self.m.add(S.bell(note(top), 1.2, 0.9), t, gain, 0.35, 0.4)


class SoftMix(S.Mix):
    """A mix whose every event gets a raised-cosine fade in (5 ms) and out (10 ms), so nothing clicks at its edges."""
    def add(self, x, t, gain=1.0, pan=0.0, send=0.0):
        x = np.array(x, dtype=float); n = len(x); a = min(n // 2, int(0.005 * S.SR)); b = min(n // 2, int(0.010 * S.SR))
        if a > 1: x[:a] *= 0.5 - 0.5 * np.cos(np.pi * np.arange(a) / a)
        if b > 1: x[-b:] *= 0.5 + 0.5 * np.cos(np.pi * np.arange(b) / b)
        super().add(x, t, gain, pan, send)


def true_peak(y):
    from scipy.signal import resample_poly
    return float(np.max(np.abs(resample_poly(y, 4, 1, axis=1))))


def build(cues_path, out_path, sfx_path=None):
    data = json.load(open(cues_path))
    cues, dur = data['cues'], data['duration']
    by = lambda name: [c for c in cues if c['name'] == name]
    hey = by('hey')[0]['t']; catch = by('catch')[0]['t']; click = by('click')[0]['t']; title = by('ta-da')[0]['t']
    hi = by('ping')[0]['t']; lands = sorted(c['t'] for c in by('land'))[:9]
    party = by('drop')[0]['t']
    music, sfx, pre = S.Mix(dur), S.Mix(dur), S.Mix(dur)
    sc = Score(music, lands)

    # ============================================================ 0 - 4.5 s: a clock and a muffled motif that opens up ============================================================
    n_beats = int(hey / BEAT + 1e-6)
    motif = ['F4', 'A4', 'C5', 'A4', 'D5', 'C5', 'A4', 'F4']
    for k in range(n_beats):
        if k % 2 == 0: pre.add(S.marimba(note(motif[(k // 2) % len(motif)]), 0.55, 0.6 + 0.4 * k / n_beats), k * BEAT, 0.7, 0.0, 0.0)
        if k % 2 == 1: pre.add(S.pizz(note('F3'), 0.3, 0.4 + 0.5 * k / n_beats), k * BEAT, 0.6, 0.0, 0.0)
    pre.L = S.opening_filter(pre.L, 0.0, hey, 220, 9000); pre.R = S.opening_filter(pre.R, 0.0, hey, 220, 9000)
    gate = np.ones(pre.n); m = int(0.03 * S.SR); k0 = int(hey * S.SR)
    gate[k0:k0 + m] = np.linspace(1, 0, m); gate[k0 + m:] = 0
    music.absorb(pre, gate * 0.9)

    # ============================================================ from Clawd's landing: one layer per pet ============================================================
    music.bus = MUSIC
    for bar in (3, 4, 5):
        ch = chord_of(bar); stop = hi   # thins out at Kilo's hello, well before "Got your attention?"
        for fn, n_layer, kw in ((sc.kick, 1, {}), (sc.shaker, 2, {}), (sc.pizz, 3, {'chord': ch}), (sc.claps, 4, {}), (sc.melody, 5, {'chord': ch}), (sc.hats, 7, {}), (sc.arp, 8, {'chord': ch})):
            t0 = lands[n_layer - 1] if len(lands) >= n_layer else 1e9
            fn(bar, t0=t0, **kw) if bar < 5 else None
        if bar < 5:
            sc.bass(bar, ch, t0=lands[0], gain=0.85, busy=(bar > 3))
            sc.glock(bar, ch, t0=lands[5], beats=(0, 2))
            sc.ticks(bar, t0=lands[6])
    # bar 5 up to the hello: everything still there; then the breakdown
    ch = chord_of(5)
    for fn, kw in ((sc.kick, {}), (sc.shaker, {}), (sc.pizz, {'chord': ch}), (sc.claps, {}), (sc.melody, {'chord': ch}), (sc.bass, {'chord': ch, 'gain': 0.85})):
        pass
    # build bar 5 events only before the hello
    sc.kick(5, t0=lands[0]); sc.shaker(5, t0=lands[1]); sc.pizz(5, ch, t0=lands[2]); sc.claps(5, t0=lands[3]); sc.melody(5, ch, t0=lands[4]); sc.bass(5, ch, t0=lands[0], gain=0.85)
    sc.glock(5, ch, beats=(0,)); sc.hats(5, t0=lands[6]); sc.arp(5, ch, t0=lands[7])
    # cut everything in bar 5 that falls after the hello (the breakdown): rebuild by masking the stem
    cut = np.ones(music.n); k1 = int(hi * S.SR)
    cut[k1:] = 0
    music.L *= cut; music.R *= cut; music.rL *= cut; music.rR *= cut
    for i, c in enumerate(lands):
        music.add(S.marimba(note(LAND_TUNE[min(i, len(LAND_TUNE) - 1)]), 0.6, 1.0), c + 0.004, 0.45, -0.25 + 0.06 * i, 0.3)

    # ============================================================ breakdown: "Got your attention?" - a few soft plucks and nothing else ============================================================
    music.bus = MUSIC * 0.7
    for bar, ch in ((5, 'Bb'), (6, 'C')):
        for b in (2, 3) if bar == 5 else (0, 1):
            t = T(bar, b)
            if hi <= t < click - 0.2:
                for i, f in enumerate([note(n) for n in CH[ch]['pz']]): music.add(S.pizz(f, 0.35, 0.5), t + i * 0.015, 0.3, -0.2 + 0.2 * i, 0.4)
    for i, nn in enumerate(['G5', 'E5', 'C5']):
        t = catch + 0.45 * (i + 1)
        if t < click - 0.15: music.add(S.bell(note(nn), 1.0, 0.7), t, 0.25, 0.0, 0.4)
    # the click: a bright chord accent (glockenspiel + marimba), then the groove is back with the party
    music.bus = MUSIC
    for j, nn in enumerate(['C6', 'E6', 'G6', 'C7']): music.add(S.bell(note(nn), 1.6, 1.0), click + 0.01 * j, 0.3, -0.3 + 0.2 * j, 0.45)
    music.add(S.marimba(note('C5'), 0.6, 1.0), click, 0.4, 0.0, 0.3)

    # ============================================================ the party and the looks (bars 7-10) ============================================================
    music.bus = MUSIC * 1.05
    for bar in (7, 8, 9, 10):
        ch = chord_of(bar); t0 = party if bar == 7 else 0.0
        sc.kick(bar, t0=t0, four=(bar >= 9), gain=0.55)
        sc.claps(bar, t0=t0); sc.shaker(bar, t0=t0, sixteenth=True); sc.ticks(bar, t0=t0); sc.hats(bar, t0=t0)
        sc.bass(bar, ch, t0=t0, gain=0.9); sc.pizz(bar, ch, t0=t0, gain=0.3); sc.arp(bar, ch, t0=t0)
        sc.melody(bar, ch, t0=t0, gain=0.52); sc.glock(bar, ch, t0=t0, beats=(0, 1.5, 2.5))
    climb = ['C6', 'D6', 'E6', 'F6', 'G6', 'A6', 'C7', 'D7']
    for c in by('look'): music.add(S.bell(note(climb[c['p']]), 0.5, 0.8), c['t'] + 0.004, 0.3, -0.3 + 0.085 * c['p'], 0.3)

    # ============================================================ group photo and the card (bars 11-13), then a chord that rings out ============================================================
    music.bus = MUSIC * 0.95
    chime = T(13, 1)
    for bar in (11, 12, 13):
        ch = chord_of(bar)
        if bar == 13:
            sc.kick(bar, t0=T(13, 0), gain=0.45) if False else None
            music.add(S.kick_soft(0.9), T(13, 0), 0.5, 0.0, 0.02)
            music.add(S.marimba(note('A5'), 0.5, 0.9), T(13, 0), 0.4, 0.2, 0.3)
            continue
        sc.kick(bar, gain=0.45); sc.claps(bar, gain=0.3); sc.shaker(bar, gain=0.26); sc.bass(bar, ch, gain=0.8, busy=False); sc.pizz(bar, ch, gain=0.28); sc.melody(bar, ch, gain=0.44); sc.glock(bar, ch, beats=(0,))
    for nn in ('F5', 'A5', 'C6'): music.add(S.bell(note(nn), 1.0, 0.9), title, 0.26, 0.0, 0.4)
    # the last chord: F major, plucked and bowed-soft, ringing for 1.5 s and fading with the tail
    for j, nn in enumerate(['F3', 'A3', 'C4', 'F4', 'A4']): music.add(S.pizz(note(nn), 1.4, 0.9), chime + 0.012 * j, 0.3, -0.3 + 0.15 * j, 0.5)
    music.add(S.warm_bass(note('F2'), 1.4, 0.9), chime, 0.7, 0.0, 0.05)
    for nn in ('F6', 'A6', 'C7'): music.add(S.bell(note(nn), 1.9, 0.8), chime + 0.02, 0.22, 0.2, 0.6)
    fade = np.ones(music.n); a, b = int((chime + 0.35) * S.SR), int(dur * S.SR)
    fade[a:b] = np.linspace(1, 0, b - a) ** 1.3; fade[b:] = 0

    # ============================================================ sound effects: dry and present, they carry the picture ============================================================
    def place_sfx(mx):
        mx.bus = SFX
        # the clock in the cold open: one tick or tock per beat, getting a little louder
        for k in range(int(hey / BEAT + 1e-6)):
            mx.add(S.clock_tick(0.4 + 0.3 * k / int(hey / BEAT + 1e-6), tock=(k % 2 == 1)), k * BEAT, 1.0, 0.0, 0.0)
        # the knock's own echo after HEY!, the only thing in the room
        for d, v in ((0.32, 0.4), (0.78, 0.25), (1.25, 0.14)): mx.add(S.knock(1.0, True), hey + d, v, 0.0, 0.8)
        tick_pitch = [1100, 1250, 1400, 1600, 1800, 2000]
        for c in cues:
            n, t, v, p = c['name'], c['t'], c.get('v', 1.0), c.get('p')
            if n == 'knock':
                far = v < 0.35
                mx.add(S.knock(1.0, far), t, (0.35 + 0.65 * v) * 0.95, 0.0, 0.3 if far else 0.14)
            elif n == 'hey': mx.add(S.impact(1.0), t, 1.0 * v, 0.0, 0.2); mx.add(S.pop(700, 1.0), t + 0.01, 0.5 * v, 0.0, 0.2)
            elif n == 'pop': mx.add(S.pop(520 * (1.09 ** (p or 0)), 1.0), t, 0.55 * v, 0.1, 0.2)
            elif n == 'whoosh': mx.add(S.swipe(0.4, 1.0, True), t - 0.05, 0.5 * v, 0.0, 0.2)
            elif n == 'fall': mx.add(S.swipe(0.5, 1.0, False), t, 0.18 * v, -0.3 + 0.1 * (p or 0), 0.2)
            elif n == 'land':
                mx.add(S.thump(90 + 4 * (p or 0), 1.0, 0.14), t, 0.45 * v, 0.0, 0.08); mx.add(S.pop(380 * (1.08 ** (p or 0)), 1.0), t, 0.6 * v, -0.2 + 0.07 * (p or 0), 0.2)
            elif n == 'snore': mx.add(S.snore(1.0, 1.7), t, 0.35 * v, 0.4, 0.2)
            elif n == 'ping': mx.add(S.pop(880, 1.0), t, 0.5 * v, -0.3, 0.3)
            elif n == 'miss': mx.add(S.whoosh(0.16, 1.0, False), t, 0.35 * v, 0.0, 0.15)
            elif n == 'plane':
                m = int(S.SR * 0.42); tt_ = S.tt(m)
                mx.add(S.bp(S.noise(m), 1800, 6500) * np.sin(np.pi * tt_ / tt_[-1]) ** 1.5, t, 0.28 * v, 0.2, 0.2)
            elif n == 'bonk': mx.add(S.tock(1.0), t, 0.8 * v, 0.0, 0.25); mx.add(S.thump(110, 1.0, 0.14), t, 0.4, 0.0, 0.15)
            elif n == 'catch': mx.add(S.impact(1.0), t, 0.9 * v, 0.0, 0.25); mx.add(S.click(1.0), t, 0.5, 0.0, 0.1)
            elif n == 'ding': mx.add(S.pop(1100, 1.0), t, 0.35 * v, 0.0, 0.3)
            elif n == 'hop': mx.add(S.pop(300, 1.0), t, 0.55 * v, 0.0, 0.2)
            elif n == 'thud': mx.add(S.thump(110, 1.0, 0.12), t, 0.4 * v, 0.0, 0.1)
            elif n == 'press': mx.add(S.click(0.5), t, 0.5 * v, 0.0, 0.08)
            elif n == 'click': mx.add(S.click(1.0), t, 1.0 * v, 0.0, 0.1)
            elif n == 'burst': mx.add(S.softburst(1.0), t, 0.5 * v, 0.0, 0.3)
            elif n == 'drop': mx.add(S.thump(100, 1.0, 0.2), t, 0.6 * v, 0.0, 0.1)
            elif n == 'confetti':
                for side in (-1, 1): mx.add(S.softburst(1.0), t + (0.012 if side > 0 else 0), 0.45 * v, 0.8 * side, 0.3)
            elif n == 'phones': mx.add(S.slide(420, 1500, 0.2, 1.0, 5, 0.005), t, 0.12 * v, 0.0, 0.2)
            elif n == 'wake': mx.add(S.slide(300, 430, 0.26, 1.0, 5, 0.03), t, 0.3 * v, 0.4, 0.3); mx.add(S.slide(430, 290, 0.32, 1.0, 5, 0.03), t + 0.26, 0.3 * v, 0.4, 0.3)
            elif n == 'look': mx.add(S.snap(1.0), t, 0.7 * v, 0.0, 0.15); mx.add(S.woodtick(2600, 1.0), t + 0.012, 0.3, 0.0, 0.1)
            elif n == 'shutter': mx.add(S.shutter(1.0), t, 0.6 * v, 0.0, 0.15)
            elif n == 'ta-da': mx.add(S.pop(900, 1.0), t + 0.02, 0.4, 0.0, 0.3)
            elif n == 'tick': mx.add(S.woodtick(tick_pitch[(p or 0) % 6], 1.0), t, 0.3 * v, 0.0, 0.15)

    sfx = S.Mix(dur); place_sfx(sfx)

    if sfx_path:
        # the effects on their own: soft edges, the same reverb, no compression or clipping, scaled to a true peak of -1.6 dBTP (the AAC encode stays under -1)
        soft = SoftMix(dur); place_sfx(soft)
        only = S.Mix(dur); only.absorb(soft); only.reverb(0.55, 0.8)
        z = np.stack([only.L, only.R]); z = np.stack([S.hp(c, 60) for c in z])[:, :int(S.SR * (dur + 0.05))]
        z *= 10 ** (-1.6 / 20) / true_peak(z)
        wavfile.write(sfx_path, S.SR, np.round(z.T * 32767).astype(np.int16))
        print('wrote', sfx_path, 'true peak', round(20 * np.log10(true_peak(z)), 2), 'dBTP')
    final = S.Mix(dur)
    final.absorb(music, fade); final.absorb(sfx)
    final.reverb(0.55, 0.8)
    y = final.master()
    y = np.stack([S.hp(c, 75) for c in y])
    keep = int(S.SR * (dur + 0.05))
    y = y[:, :keep]
    n = int(S.SR * 0.15); y[:, -n:] *= np.linspace(1, 0, n)
    wavfile.write(out_path, S.SR, (np.clip(y.T, -1, 1) * 32767).astype(np.int16))
    print('wrote', out_path, f'{y.shape[1] / S.SR:.2f} s', 'peak', float(np.max(np.abs(y))))


if __name__ == '__main__':
    build(sys.argv[1], sys.argv[2], sys.argv[3] if len(sys.argv) > 3 else None)
