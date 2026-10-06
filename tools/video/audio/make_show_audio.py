#!/usr/bin/env python3
"""The showcase soundtrack: Running Night (Pixabay) cut on its beat grid (see src/show/time.ts) plus light sound effects from the cues the
animation produces. The track is not in the repository: put it in tools/video/music/ (see README).
Usage: make_show_audio.py cues.json out.wav [sfx_only.wav]"""
import json
import os
import subprocess
import sys

import numpy as np
from scipy.io import wavfile

import synth as S

MUSIC = 'music'
RUN = f'{MUSIC}/running-night.mp3'
# Running Night: 106.01 BPM, beats at 0.392 + k * 60/106.01 s. Its bars start on the beat its chords change on, the drop's at 73.405 s
# (the bass pushes in half a beat early, at 73.09 s); it loops four chords, one per bar: A (the drop), F#, G#, C#. It plays uncut from
# the first frame: the video's bar lines are the track's.
RBAR = 4 * 60 / 106.01
DROP = 73.405                      # the drop's bar line in the track
HIT = 5.620                        # time.ts HIT (the C# riser bar before the drop)
TOUR = HIT + RBAR                  # time.ts TOUR: the drop, as Clawd appears
START = DROP - TOUR                # the track is never cut: video t plays the track at START + t (65.52 s, its build, drums already in)
T_END = TOUR + 8 * RBAR            # time.ts T_END: the end card, on an A bar; the music plays on under it and fades out
FADE_AT = T_END + 0.5
# How the intro eases in (INTRO=drums, the default, or INTRO=volume): either only the drums start low and come up to full by the hit,
# split from the rest of the mix by harmonic/percussive separation, or the whole track does.
INTRO = os.environ.get('INTRO', 'drums')
RAMP_DB = {'drums': -24.0, 'volume': -14.0}[INTRO]   # how far down the ramp starts


def load(path):
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', path, '-f', 'f32le', '-ac', '2', '-ar', str(S.SR), '-'], capture_output=True, check=True).stdout
    return np.frombuffer(raw, dtype=np.float32).reshape(-1, 2).T.astype(float)


def ramp(n_samples):
    """Gain from RAMP_DB at the first frame up to 1 at the hit, rising faster towards the end (in dB, so it sounds even)."""
    u = np.clip(np.arange(n_samples) / S.SR / HIT, 0, 1)
    return 10 ** (RAMP_DB * (1 - u) ** 1.5 / 20)


def drums_of(seg):
    """The percussive part of `seg` (2 x n): soft complementary masks, so harmonic + percussive add back up to `seg`."""
    import librosa
    out = np.zeros_like(seg)
    for c in range(2):
        D = librosa.stft(seg[c], n_fft=2048, hop_length=512)    # short enough windows to catch the drum hits whole
        _, P = librosa.decompose.hpss(D, kernel_size=17, power=2.0, margin=1.0)
        out[c] = librosa.istft(P, hop_length=512, length=seg.shape[1])
    return out


def music_bed(n):
    y = load(RUN)
    out = y[:, int(START * S.SR):int(START * S.SR) + n].copy()
    k = int((HIT + 0.3) * S.SR)                                 # the stretch that is eased in, plus a little to blend back
    head = out[:, :k]; g = ramp(k)
    if INTRO == 'volume': eased = head * g
    else: p = drums_of(head); eased = (head - p) + p * g       # the rest of the mix at full level, the drums coming up
    w = np.clip((np.arange(k) / S.SR - HIT) / 0.3, 0, 1)       # past the hit, blend back into the untouched track over 0.3 s
    out[:, :k] = eased * (1 - w) + head * w
    fin = int(0.05 * S.SR); out[:, :fin] *= np.sin(np.linspace(0, np.pi / 2, fin)) ** 2
    # under the end card the music fades out with the picture
    f0 = int(FADE_AT * S.SR); m = n - f0
    if m > 0: out[:, f0:] *= np.cos(np.linspace(0, np.pi / 2, m)) ** 1.5
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
        elif n == 'impact': m.add(S.impact(1.0), t, 0.3 * v, 0.0, 0.25)
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
