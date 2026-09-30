#!/usr/bin/env python3
"""Builds the Agent Pets soundtrack: an original 108 BPM score (the tempo the app's own music-dance uses) plus sound effects
placed from out/cues.json, which the animation itself produces. Usage: make_audio.py cues.json out.wav"""
import functools
import json
import sys

import numpy as np
from scipy.io import wavfile

import synth as S
from synth import note

BPM = 108
BEAT = 60 / BPM
BAR = 4 * BEAT


def T(bar, beat=0.0): return (bar - 1) * BAR + beat * BEAT


# C major: the tune only ever uses C D E G A, the chords are I, IV, V and vi, so nothing can clash.
CHORDS = {
    'C': dict(root='C3', uke=['C4', 'E4', 'G4', 'C5'], tones=['C3', 'G3', 'E4'], hook='E5'),
    'G': dict(root='G2', uke=['B3', 'D4', 'G4', 'B4'], tones=['G3', 'D4', 'B4'], hook='D5'),
    'Am': dict(root='A2', uke=['A3', 'C4', 'E4', 'A4'], tones=['A3', 'E4', 'C5'], hook='C5'),
    'F': dict(root='F2', uke=['F4', 'A4', 'C5', 'F5'], tones=['F3', 'C4', 'A4'], hook='A4'),
}
POP = ['C5', 'E5', 'G5', 'C6', 'E6', 'G6', 'C7']

pluck_cached = functools.lru_cache(maxsize=None)(lambda f, v, b: S.pluck(f, 0.7, v, b))


def uke(mix, t, chord, vel=1.0, up=False, gain=0.3, pan=-0.25):
    fs = [note(n) for n in CHORDS[chord]['uke']]
    if up: fs = list(reversed(fs))
    n = int(S.SR * 1.2); out = np.zeros(n)
    for i, f in enumerate(fs):
        p = pluck_cached(round(f, 2), 1.0, 0.6) * (0.85 + 0.15 * (i % 2)) * vel
        s = int(S.SR * 0.011 * i); out[s:s + len(p)] += p[:n - s]
    out = out[:int(S.SR * 0.7)] * np.exp(-S.tt(int(S.SR * 0.7)) / 0.3)
    mix.add(out, t, gain, pan, send=0.18)


def bass_pat(mix, bar, chord, party=True, gain=0.8):
    r = note(CHORDS[chord]['root']); f5 = r * 1.5; oct_ = r * 2
    pat = [(0, r, 0.36), (0.75, r, 0.2), (1.5, f5, 0.3), (2, r, 0.36), (2.75, r, 0.2), (3.5, oct_, 0.3)] if party else [(0, r, 0.5), (1.5, r, 0.3), (2, r, 0.5), (3.5, f5, 0.3)]
    for b, f, d in pat: mix.add(S.bass(f, d + 0.1, 1.0), T(bar, b), gain, 0.0, 0.02)


def drums(mix, bar, beat_from=0, kick_all=True, clap=True, hats=True, vel=1.0):
    for b in range(beat_from, 4):
        if kick_all or b % 2 == 0: mix.add(S.kick(0.9 * vel), T(bar, b), 0.62, 0.0, 0.03)
        if clap and b in (1, 3): mix.add(S.clap(0.9 * vel), T(bar, b), 0.55, 0.05, 0.22)
        if hats:
            mix.add(S.hat(0.7 * vel), T(bar, b + 0.5), 0.5, 0.25, 0.05)
            if b == 3: mix.add(S.hat(0.6 * vel, True), T(bar, b + 0.5), 0.35, 0.25, 0.08)
            mix.add(S.shaker(0.5 * vel), T(bar, b + 0.25), 0.28, -0.3, 0.04)
            mix.add(S.shaker(0.65 * vel), T(bar, b + 0.75), 0.28, -0.3, 0.04)


# the party hook, two bars per phrase, in eighth notes ('-' rests). Bars follow C | G | Am | F.
HOOK = {
    'C': ['E5', '-', 'G5', '-', 'A5', 'G5', 'E5', '-'],
    'G': ['D5', '-', 'E5', 'D5', 'B4', '-', 'D5', '-'],
    'Am': ['C5', '-', 'E5', '-', 'A5', 'G5', 'E5', 'D5'],
    'F': ['C5', '-', 'F5' if False else 'E5', '-', 'A5', '-', 'G5', '-'],
}


def hook_bar(mix, bar, chord, gain=0.55, start=0):
    for i, n in enumerate(HOOK[chord]):
        if n == '-' or i < start * 2: continue
        f = note(n)
        mix.add(S.marimba(f, 0.5, 1.0), T(bar, i * 0.5), gain * (1.0 if i % 2 == 0 else 0.75), 0.18, 0.2)
        if i % 4 == 0: mix.add(S.bell(f * 2, 1.0, 0.5), T(bar, i * 0.5), gain * 0.3, 0.3, 0.3)


MUSIC = 0.72   # music bus level
SFX = 0.95     # sound-effect bus level


def build(cues_path, out_path):
    data = json.load(open(cues_path))
    cues, dur = data['cues'], data['duration']
    mix = S.Mix(dur)
    by = lambda name: [c for c in cues if c['name'] == name]

    # ============================================================ score ============================================================
    mix.bus = MUSIC * 0.8
    # bars 1-2: nothing but the knocks and a whisper of drone, so the first sound is the first knock
    mix.add(S.pad([note('C2'), note('G2')], 4.6, 1.0, 0.8, 0.9), 0.0, 0.5, 0.0, 0.2)

    # bars 3-5: the crew arrives. A light groove that grows, and every landing is a note of the tune.
    prog = {3: 'C', 4: 'F', 5: 'G'}
    for bar, ch in prog.items():
        drums(mix, bar, kick_all=(bar >= 4), clap=(bar >= 4), hats=True, vel=0.55 + 0.15 * (bar - 3))
        bass_pat(mix, bar, ch, party=False, gain=0.62)
        for b in (1.5, 3.5): uke(mix, T(bar, b), ch, 0.9, up=(b == 3.5), gain=0.22)
    tune = ['C5', 'D5', 'E5', 'G5', 'A5', 'C6']
    for i, c in enumerate(by('land')[:6]):
        f = note(tune[i]); mix.add(S.marimba(f, 0.7, 1.0), c['t'], 0.75, -0.15 + 0.06 * i, 0.22)
        mix.add(S.bell(f * 2, 1.2, 0.6), c['t'], 0.22, 0.2, 0.3)

    mix.bus = MUSIC * 0.85
    # bar 5 (second half) to the catch: tension. A staccato marimba ostinato over a held G, no kick.
    t0 = T(5, 2)
    steps = int((T(6, 1) - t0) / (BEAT / 2)) + 1
    osc = ['G4', 'B4', 'D5', 'B4']
    for i in range(steps):
        t = t0 + i * BEAT / 2
        mix.add(S.marimba(note(osc[i % 4]), 0.25, 1.0), t, 0.36 + 0.005 * i, 0.1, 0.12)
        if i % 2 == 1: mix.add(S.hat(0.5), t, 0.28, 0.2, 0.04)
    mix.add(S.pad([note('G2'), note('D3'), note('B3')], T(6, 1) - T(5, 2), 1.0, 0.4, 0.15), T(5, 2), 1.0, 0.0, 0.2)

    # the catch: crash, then almost nothing. Two suspended notes, a rising hum, then the click cuts everything.
    click = by('click')[0]['t']; drop = by('drop')[0]['t']; catch = by('catch')[0]['t']
    mix.add(S.pad([note('C3'), note('G3'), note('D4')], click - catch - 0.02, 1.0, 0.25, 0.05), catch, 1.0, 0.0, 0.3)
    for i, n in enumerate(['E5', 'D5', 'C5']):
        t = catch + 0.55 * (i + 1)
        if t < click - 0.1: mix.add(S.marimba(note(n), 0.5, 1.0), t, 0.32, 0.0, 0.2)
    # silence, with a swelling riser, then the drop
    mix.add(S.riser(drop - click - 0.2, 1.0), click + 0.18, 0.5, 0.0, 0.25)

    mix.bus = MUSIC * 1.1
    # the party: bars 7-10, C | G | Am | F. Four on the floor, claps, bass, uke chops, and the hook.
    party_bars = [(7, 'C', 1), (8, 'G', 0), (9, 'Am', 0), (10, 'F', 0)]
    for bar, ch, start in party_bars:
        drums(mix, bar, beat_from=start, vel=1.0)
        bass_pat(mix, bar, ch, party=True, gain=0.85)
        for b in (0.5, 1.5, 2.5, 3.5):
            if bar == 7 and b < 1: continue
            uke(mix, T(bar, b), ch, 0.9, up=(b in (1.5, 3.5)), gain=0.34)
        hook_bar(mix, bar, ch, 0.72, start=start)
        if not (bar == 7): mix.add(S.bell(note(CHORDS[ch]['hook']) * 2, 1.4, 0.5), T(bar, 0), 0.22, 0.3, 0.35)
    mix.add(S.marimba(note('C5'), 0.6, 1.0), drop, 0.7, 0.0, 0.25)
    # the seven looks: a bell for every one, climbing, each on its own beat
    climb = ['C6', 'D6', 'E6', 'G6', 'A6', 'C7', 'D7', 'E7']
    for c in by('look'):
        i = c['p']; f = note(climb[i])
        mix.add(S.bell(f, 1.2, 1.0), c['t'], 0.34, -0.3 + 0.085 * i, 0.4)
        mix.add(S.marimba(f / 2, 0.3, 1.0), c['t'], 0.3, 0.0, 0.2)

    mix.bus = MUSIC * 0.95
    # the group photo and the card: a big C, then a calmer version of the groove
    title = by('ta-da')[0]['t']
    for n in ('C6', 'E6', 'G6', 'C7'): mix.add(S.bell(note(n), 2.2, 1.0), title, 0.22, 0.0, 0.5)
    for n in ('C4', 'E4', 'G4'): mix.add(S.marimba(note(n), 0.9, 1.0), title, 0.28, 0.0, 0.3)
    mix.add(S.pad([note('C3'), note('E3'), note('G3'), note('D4')], T(14, 0) - title + 0.25, 1.0, 0.1, 0.5), title, 1.0, 0.0, 0.35)
    mix.add(S.crash(2.2, 0.8), title, 0.42, 0.0, 0.3)
    end_bar = T(14, 0)
    for bar, ch in ((11, 'C'), (12, 'G'), (13, 'F')):
        drums(mix, bar, kick_all=True, clap=(bar != 11), hats=True, vel=0.62)
        bass_pat(mix, bar, ch, party=True, gain=0.66)
        for b in (0.5, 1.5, 2.5, 3.5): uke(mix, T(bar, b), ch, 0.85, up=(b in (1.5, 3.5)), gain=0.2)
        hook_bar(mix, bar, ch, 0.44)
    # the resolution: a last C chord that rings out
    uke(mix, end_bar, 'C', 1.0, gain=0.36, pan=-0.15)
    mix.add(S.bass(note('C2'), 1.6, 1.0), end_bar, 0.85, 0.0, 0.05)
    mix.add(S.kick(0.9), end_bar, 0.8, 0.0, 0.03)
    for n in ('E5', 'G5', 'C6'): mix.add(S.marimba(note(n), 1.0, 1.0), end_bar, 0.3, 0.1, 0.35)
    mix.add(S.bell(note('C7'), 2.4, 1.0), end_bar + 0.02, 0.3, 0.2, 0.5)
    mix.add(S.pad([note('C3'), note('G3'), note('E4')], dur - end_bar + 0.6, 1.0, 0.3, 1.0), end_bar, 1.0, 0.0, 0.4)

    # ============================================================ sound effects ============================================================
    mix.bus = SFX
    tick_pitch = [1100, 1250, 1400, 1600, 1800, 2000]
    for c in cues:
        n, t, v, p = c['name'], c['t'], c.get('v', 1.0), c.get('p')
        if n == 'knock':
            far = v < 0.7
            mix.add(S.knock(1.0, far), t, 0.9 * v, 0.0, 0.35 if far else 0.16)
        elif n == 'whoosh': mix.add(S.whoosh(0.44, 1.0, True), t, 0.5 * v, 0.0, 0.2)
        elif n == 'pop':
            f = note(POP[p or 0])
            mix.add(S.bloop(f / 1.5, 1.0), t, 0.5 * v, 0.0, 0.15); mix.add(S.marimba(f, 0.4, 1.0), t, 0.28 * v, 0.1, 0.2)
        elif n == 'cricket': mix.add(S.cricket(1.0), t, v, -0.35, 0.25)
        elif n == 'sigh': mix.add(S.slide(520, 320, 0.5, 1.0, 5.5, 0.01), t, 0.7 * v, 0.0, 0.3)
        elif n == 'whistle':
            mix.add(S.slide(1300, 2200, 0.15, 1.0, 5, 0.005), t, 0.4 * v, 0.0, 0.25); mix.add(S.slide(2200, 1450, 0.3, 1.0, 8, 0.02), t + 0.15, 0.4 * v, 0.0, 0.25)
        elif n == 'fall': mix.add(S.slide(1700 - 60 * (p or 0), 480, 0.5, 1.0, 9, 0.02), t, 0.16 * v, -0.3 + 0.1 * (p or 0), 0.2)
        elif n == 'land':
            mix.add(S.thump(62 + 3 * (p or 0), 1.0, 0.24), t, 0.55 * v, 0.0, 0.08); mix.add(S.boing(200 + 20 * (p or 0), 1.0, 0.36), t, 0.16 * v, 0.0, 0.15)
        elif n == 'snore': mix.add(S.snore(1.0, 1.7), t, 0.45 * v, 0.4, 0.2)
        elif n == 'float': mix.add(S.slide(700, 470, 1.4, 1.0, 4, 0.01), t, 0.16 * v, 0.3, 0.3)
        elif n == 'sparkle': mix.add(S.sparkle_run('G6', 5), t, 0.3 * v, 0.25, 0.4)
        elif n == 'ping': mix.add(S.bell(note('E6'), 1.0, 1.0), t, 0.45 * v, -0.4, 0.3)
        elif n == 'miss': mix.add(S.whoosh(0.16, 1.0, False), t, 0.35 * v, 0.0, 0.15); mix.add(S.boing(420, 1.0, 0.3), t + 0.04, 0.16 * v, 0.2, 0.2)
        elif n == 'plane':
            m = int(S.SR * 0.42); tt_ = S.tt(m)
            sw = S.bp(S.noise(m), 1800, 6500) * np.sin(np.pi * tt_ / tt_[-1]) ** 1.5
            mix.add(sw, t, 0.3 * v, 0.2, 0.2)
        elif n == 'bonk':
            mix.add(S.boing(520, 1.0, 0.36), t, 0.7 * v, 0.0, 0.25); mix.add(S.bell(note('D6'), 0.6, 1.0), t, 0.28, 0.0, 0.3); mix.add(S.slide(400, 900, 0.55, 1.0, 11, 0.05), t + 0.08, 0.22, 0.0, 0.3)
        elif n == 'catch':
            mix.add(S.crash(1.4, 1.0), t, 0.5 * v, 0.0, 0.3); mix.add(S.thump(52, 1.0, 0.55), t, 0.95 * v, 0.0, 0.1); mix.add(S.click(1.0), t, 0.5, 0.0, 0.1); mix.add(S.sparkle_run('C6', 5), t + 0.02, 0.4, 0.0, 0.4)
        elif n == 'ding': mix.add(S.bell(note('C7'), 1.6, 1.0), t, 0.28 * v, 0.2, 0.4); mix.add(S.bell(note('G6'), 1.6, 1.0), t + 0.03, 0.22 * v, -0.2, 0.4)
        elif n == 'hop': mix.add(S.boing(240, 1.0, 0.36), t, 0.5 * v, 0.0, 0.2)
        elif n == 'thud': mix.add(S.thump(95, 1.0, 0.16), t, 0.5 * v, 0.0, 0.1)
        elif n == 'press': mix.add(S.click(0.5), t, 0.5 * v, 0.0, 0.08)
        elif n == 'click': mix.add(S.click(1.0), t, 0.9 * v, 0.0, 0.1)
        elif n == 'burst':
            m = int(S.SR * 0.1); nz = S.bp(S.noise(m), 2200, 8500) * np.exp(-S.tt(m) / 0.03)
            mix.add(nz, t, 0.4 * v, 0.0, 0.25); mix.add(S.sparkle_run('E6', 4), t + 0.02, 0.28, 0.0, 0.4)
        elif n == 'drop':
            mix.add(S.thump(46, 1.0, 0.95), t, 1.0 * v, 0.0, 0.12); mix.add(S.crash(1.1, 0.8), t, 0.3, 0.0, 0.3)
        elif n == 'confetti':
            for side in (-1, 1):
                m = int(S.SR * 0.1); nz = S.bp(S.noise(m), 700, 4200) * np.exp(-S.tt(m) / 0.03)
                mix.add(nz, t + (0.012 if side > 0 else 0), 0.5 * v, 0.8 * side, 0.3); mix.add(S.thump(140, 1.0, 0.1), t + (0.012 if side > 0 else 0), 0.3, 0.6 * side, 0.1)
            mix.add(S.sparkle_run('G6', 6, 0.04), t + 0.05, 0.3, 0.0, 0.5)
        elif n == 'phones': mix.add(S.slide(420, 1500, 0.2, 1.0, 5, 0.005), t, 0.18 * v, 0.0, 0.2)
        elif n == 'wake':
            mix.add(S.slide(300, 430, 0.26, 1.0, 5, 0.03), t, 0.4 * v, 0.4, 0.3); mix.add(S.slide(430, 290, 0.32, 1.0, 5, 0.03), t + 0.26, 0.4 * v, 0.4, 0.3); mix.add(S.bloop(note('G5'), 1.0), t + 0.75, 0.3, 0.4, 0.2)
        elif n == 'look':
            mix.add(S.whoosh(0.2, 1.0, True), t - 0.02, 0.32 * v, 0.0, 0.15)
        elif n == 'shutter': mix.add(S.shutter(1.0), t, 0.6 * v, 0.0, 0.15)
        elif n == 'ta-da': mix.add(S.sparkle_run('C6', 6, 0.05), t + 0.05, 0.4, 0.0, 0.5)
        elif n == 'tick': mix.add(S.woodtick(tick_pitch[(p or 0) % 6], 1.0), t, 0.32 * v, 0.0, 0.15)

    mix.reverb(0.6, 1.0)
    y = mix.master()
    keep = int(S.SR * (dur + 0.05))
    y = y[:, :keep]
    # fade the very end so the tail never clicks
    n = int(S.SR * 0.25); y[:, -n:] *= np.linspace(1, 0, n)
    wavfile.write(out_path, S.SR, (np.clip(y.T, -1, 1) * 32767).astype(np.int16))
    print('wrote', out_path, f'{y.shape[1] / S.SR:.2f} s', 'peak', float(np.max(np.abs(y))))


if __name__ == '__main__':
    build(sys.argv[1], sys.argv[2])
