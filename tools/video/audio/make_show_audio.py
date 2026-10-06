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
# (file, from s, to s, at s in the video, gain dB). Running Night's beat grid: 0.392 + k * 60/106.01; every cut is on a bar line.
CUTS = [(LOFI, 0.0, 5.620, 0.0, 3.0), (RUN, 69.443, 80.763, 5.620, 0.0), (RUN, 98.874, 111.0, 16.940, 0.0)]


def load(path):
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', path, '-f', 'f32le', '-ac', '2', '-ar', str(S.SR), '-'], capture_output=True, check=True).stdout
    return np.frombuffer(raw, dtype=np.float32).reshape(-1, 2).T.astype(float)


def music_bed(n):
    out = np.zeros((2, n)); files = {}
    for i, (path, a, b, at, gain) in enumerate(CUTS):
        y = files.setdefault(path, load(path))
        seg = y[:, int(a * S.SR):int(b * S.SR)] * 10 ** (gain / 20)
        # short equal-power crossfades at every splice so nothing clicks; the lofi tail gets a little longer to breathe out
        fin = int(0.012 * S.SR); fout = int((0.08 if path == LOFI else 0.012) * S.SR)
        if i > 0: seg[:, :fin] *= np.sin(np.linspace(0, np.pi / 2, fin))
        if i < len(CUTS) - 1: seg[:, -fout:] *= np.cos(np.linspace(0, np.pi / 2, fout))
        s = int(at * S.SR); m = min(seg.shape[1], n - s)
        out[:, s:s + m] += seg[:, :m]
    return out


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
