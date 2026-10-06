#!/usr/bin/env python3
"""The showcase soundtrack: two Pixabay tracks cut on their beat grids (see src/show/time.ts) plus light sound effects from the cues the
animation produces. The tracks are not in the repository: put them in tools/video/music/ (see README).
Usage: make_show_audio.py cues.json out.wav [sfx_only.wav]"""
import json
import subprocess
import sys

import numpy as np
from scipy.io import wavfile

import synth as S

MUSIC = 'music'
LOFI, RUN = f'{MUSIC}/lofi-vlog.mp3', f'{MUSIC}/running-night.mp3'
# (file, from s, to s, at s in the video, gain dB). Running Night's beat grid: 0.392 + k * 60/106.01; every cut is on a bar line
# except the half-beat pickup into the drop.
SCRATCH = 0.104 + 7 * 60 / 87.02   # the lofi's last beat: the record is stopped here (time.ts SCRATCH)
HIT = 5.620                        # Running Night's drop (time.ts HIT)
PICKUP = 0.5 * 60 / 106.01         # Running Night comes in this early: the last half beat of its build, already at full speed
RBAR = 4 * 60 / 106.01
# Running Night from its drop: bars 0-2, then bars 10-15 (bar 10 plays the part bar 2 does a phrase earlier, so the only repeat is a
# middle bar, under the band at 12.4 s; from there it runs on untouched through the styles to its final hit).
CUTS = [(LOFI, 0.0, SCRATCH, 0.0, 3.0), (RUN, 71.707 - PICKUP, 71.707 + 3 * RBAR, HIT - PICKUP, 0.0), (RUN, 71.707 + 10 * RBAR, 111.0, HIT + 3 * RBAR, 0.0)]
XF = 0.020                         # the jump between the two Running Night pieces is a 20 ms equal-power crossfade centred on the bar line
# The hand-over (87 -> 106 BPM, so the two never play together): the lofi is yanked back like a record under a DJ's hand, a breath of
# silence, then Running Night is simply there, mid-run, half a beat before its drop.
SPIN = 0.30                        # how long the spin-back lasts


def load(path):
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', path, '-f', 'f32le', '-ac', '2', '-ar', str(S.SR), '-'], capture_output=True, check=True).stdout
    return np.frombuffer(raw, dtype=np.float32).reshape(-1, 2).T.astype(float)


def spin_back(y, at, length):
    """The record at `at` s pulled backwards: the speed swings from +1 to -3.5 in 25 ms, then slows to a stop over `length` s."""
    m = int(length * S.SR); t = np.arange(m) / S.SR
    v = np.where(t < 0.025, 1 - 4.5 * t / 0.025, -3.5 * (1 - (t - 0.025) / (length - 0.025)) ** 1.6)
    pos = at + np.cumsum(v) / S.SR
    idx = np.clip(pos * S.SR, 0, y.shape[1] - 2); i0 = np.floor(idx).astype(int); f = idx - i0
    seg = y[:, i0] * (1 - f) + y[:, i0 + 1] * f
    # a scratched record is never bright: the low-pass fades in over 40 ms, so the hand-over from the plain lofi has no step in it
    w = np.minimum(1, t / 0.04); seg = seg * (1 - w) + np.stack([S.lp(ch, 5000, 2) for ch in seg]) * w
    return seg * (1 - t / length) ** 0.7


def music_bed(n):
    out = np.zeros((2, n)); files = {}
    for i, (path, a, b, at, gain) in enumerate(CUTS):
        y = files.setdefault(path, load(path))
        g = 10 ** (gain / 20)
        if i == 1: b += XF / 2                                     # run on past the bar line into the crossfade
        if i == 2: a -= XF / 2; at -= XF / 2                       # and start the next piece just before it
        seg = y[:, int(a * S.SR):int(b * S.SR)] * g
        if i == 0:
            sp = spin_back(y, b, SPIN) * g                         # carries straight on from the last sample played
            seg = np.concatenate([seg, sp], axis=1)
        else:
            fin = int((0.006 if i == 1 else XF) * S.SR); seg[:, :fin] *= np.sin(np.linspace(0, np.pi / 2, fin))
            if i == 1:                                             # the pickup swells from -9 dB so the drop, not the pickup, is the hit
                k = int(PICKUP * S.SR); seg[:, :k] *= 10 ** (np.linspace(-9, 0, k) / 20)
        if i < len(CUTS) - 1:
            fout = int((XF if i == 1 else 0.012) * S.SR); seg[:, -fout:] *= np.cos(np.linspace(0, np.pi / 2, fout))
        s = int(at * S.SR); m = min(seg.shape[1], n - s)
        out[:, s:s + m] += seg[:, :m]
    return out


def scratch(vel=1.0):
    """The scratch itself: a short burst of noise whose band sweeps down and back up, like a stylus dragged across the groove."""
    n = int(S.SR * 0.26); t = np.arange(n) / S.SR
    f = 2600 * np.exp(-t / 0.05) + 500 + 1500 * np.clip((t - 0.11) / 0.12, 0, 1)
    x = S.noise(n); out = np.zeros(n); wsum = np.zeros(n)
    for c in (500, 800, 1300, 2100, 3400):                    # fixed bands, crossfaded along the sweep: smooth, no filter resets
        w = np.exp(-0.5 * (np.log(f / c) / 0.35) ** 2); out += S.bp(x, c * 0.7, c * 1.4) * w; wsum += w
    out /= np.maximum(wsum, 1e-3)
    env = np.minimum(1, t / 0.004) * np.exp(-t / 0.12)
    return np.tanh(out * env * 2.5) * vel * 0.6


class Soft(S.Mix):
    """Every effect gets a 5 ms fade in and a 10 ms fade out so none of them clicks."""
    def add(self, x, t, gain=1.0, pan=0.0, send=0.0):
        x = np.array(x, dtype=float); n = len(x); a = min(n // 2, int(0.005 * S.SR)); b = min(n // 2, int(0.010 * S.SR))
        if a > 1: x[:a] *= 0.5 - 0.5 * np.cos(np.pi * np.arange(a) / a)
        if b > 1: x[-b:] *= 0.5 + 0.5 * np.cos(np.pi * np.arange(b) / b)
        super().add(x, t, gain, pan, send)


def sfx(cues, dur):
    m = Soft(dur); m.bus = 0.55
    for c in cues:
        n, t, v, p = c['name'], c['t'], c.get('v', 1.0), c.get('p') or 0
        if n == 'pop': m.add(S.pop(420 * 1.06 ** p, 1.0), t, 0.5 * v, -0.4 + 0.1 * p, 0.2)
        elif n == 'tag': m.add(S.woodtick(1500 + 90 * p, 1.0), t, 0.5 * v, -0.4 + 0.1 * p, 0.1)
        elif n == 'whoosh': m.add(S.swipe(0.4, 1.0, True), t, 0.7 * v, 0.0, 0.2)
        elif n == 'swish': m.add(S.swipe(0.22, 1.0, False), t - 0.05, 0.45 * v, 0.2, 0.1)
        elif n == 'band': m.add(S.swipe(0.34, 1.0, True), t, 0.6 * v, 0.0, 0.15)
        elif n == 'bubble': m.add(S.pop(700, 1.0), t, 0.6 * v, -0.1, 0.2)
        elif n == 'toast': m.add(S.bell(S.note('E6'), 0.9, 0.8), t, 0.35 * v, 0.5, 0.3); m.add(S.bell(S.note('A6'), 0.9, 0.8), t + 0.09, 0.3 * v, 0.5, 0.3)
        elif n == 'click': m.add(S.click(1.0), t, 0.9 * v, 0.2, 0.08)
        elif n == 'tick': m.add(S.woodtick(1900, 1.0), t, 0.45 * v, 0.2, 0.08)
        elif n == 'snap': m.add(S.snap(1.0), t, 0.55 * v, 0.0, 0.1)
        elif n == 'confetti':
            for side in (-1, 1): m.add(S.softburst(1.0), t + (0.01 if side > 0 else 0), 0.45 * v, 0.8 * side, 0.3)
        elif n == 'key': m.add(S.click(0.5), t, 0.4 * v, 0.1, 0.05)
        elif n == 'phones': m.add(S.slide(500, 1400, 0.18, 1.0, 5, 0.005), t, 0.18 * v, 0.0, 0.2)
        elif n == 'scratch': m.add(scratch(1.0), t, 0.55 * v, 0.0, 0.1)
        elif n == 'impact': m.add(S.impact(1.0), t, 0.6 * v, 0.0, 0.25)
        elif n == 'shutter': m.add(S.shutter(1.0), t, 0.5 * v, 0.0, 0.15)
    return m


def true_peak(y):
    from scipy.signal import resample_poly
    return float(np.max(np.abs(resample_poly(y, 4, 1, axis=1))))


def build(cues_path, out_path, sfx_path=None):
    data = json.load(open(cues_path)); dur = data['duration']
    n = int(S.SR * (dur + 0.05))
    bed = music_bed(n)
    fx = sfx(data['cues'], dur); fx.reverb(0.45, 0.6)
    fxs = np.stack([fx.L, fx.R])[:, :n]
    y = bed + fxs
    # fade the last 0.35 s with the picture
    k = int(0.35 * S.SR); y[:, -k:] *= np.linspace(1, 0, k) ** 1.5
    y *= 10 ** (-1.6 / 20) / max(true_peak(y), 1e-9) if true_peak(y) > 10 ** (-1.6 / 20) else 1.0
    wavfile.write(out_path, S.SR, np.round(np.clip(y.T, -1, 1) * 32767).astype(np.int16))
    print('wrote', out_path, f'{y.shape[1] / S.SR:.2f} s')
    if sfx_path:
        z = fxs.copy(); z[:, -k:] *= np.linspace(1, 0, k) ** 1.5; z *= 10 ** (-1.6 / 20) / max(true_peak(z), 1e-9)
        wavfile.write(sfx_path, S.SR, np.round(np.clip(z.T, -1, 1) * 32767).astype(np.int16)); print('wrote', sfx_path)


if __name__ == '__main__':
    build(sys.argv[1], sys.argv[2], sys.argv[3] if len(sys.argv) > 3 else None)
