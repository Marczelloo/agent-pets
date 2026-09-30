"""Tiny synthesizer for the Agent Pets video: every sound is generated from scratch (numpy/scipy), so the soundtrack is original
and royalty-free. Instruments return mono float arrays at 48 kHz; the mixer places them on a stereo bus with a shared reverb."""
import numpy as np
from scipy import signal
from scipy.ndimage import maximum_filter1d

SR = 48000
TWO_PI = 2 * np.pi
rng = np.random.default_rng(7)


def tt(n): return np.arange(n) / SR


def note(name: str) -> float:
    """'C5' -> Hz (A4 = 440)."""
    names = {'C': 0, 'D': 2, 'E': 4, 'F': 5, 'G': 7, 'A': 9, 'B': 11}
    k = names[name[0]]; i = 1
    if name[i] == '#': k += 1; i += 1
    elif name[i] == 'b': k -= 1; i += 1
    octave = int(name[i:])
    return 440.0 * 2 ** ((k + 12 * (octave + 1) - 69) / 12)


def lp(x, f, order=2): return signal.sosfilt(signal.butter(order, f, 'low', fs=SR, output='sos'), x)
def hp(x, f, order=2): return signal.sosfilt(signal.butter(order, f, 'high', fs=SR, output='sos'), x)
def bp(x, lo, hi, order=2): return signal.sosfilt(signal.butter(order, [lo, hi], 'band', fs=SR, output='sos'), x)


def noise(n): return rng.standard_normal(n)


def decay(n, tau, attack=0.002):
    t = tt(n)
    return np.minimum(1, t / max(attack, 1e-4)) * np.exp(-t / tau)


def norm(x, peak=1.0):
    m = np.max(np.abs(x)) or 1
    return x / m * peak


# ------------------------------------------------------------------ tuned instruments

def marimba(freq, dur=0.6, vel=1.0):
    """Wooden bar: a strong fundamental, a short-lived 4x partial, and a tiny mallet click."""
    n = int(SR * dur); t = tt(n)
    y = np.sin(TWO_PI * freq * t) * np.exp(-t / 0.22)
    y += 0.30 * np.sin(TWO_PI * freq * 3.93 * t) * np.exp(-t / 0.055)
    y += 0.07 * np.sin(TWO_PI * freq * 9.2 * t) * np.exp(-t / 0.025)
    y *= np.minimum(1, t / 0.0015)
    click = lp(hp(noise(n), 1800), 6000) * np.exp(-t / 0.004) * 0.08
    return (y + click) * vel


def bell(freq, dur=1.4, vel=1.0):
    """Glockenspiel / music-box bell: inharmonic partials that ring."""
    n = int(SR * dur); t = tt(n)
    y = np.zeros(n)
    for ratio, amp, tau in ((1, 1.0, 0.55), (2.76, 0.5, 0.28), (5.4, 0.22, 0.14), (8.93, 0.1, 0.08)):
        y += amp * np.sin(TWO_PI * freq * ratio * t) * np.exp(-t / tau)
    return y * np.minimum(1, t / 0.001) * vel * 0.6


def pluck(freq, dur=0.7, vel=1.0, bright=0.5):
    """Karplus-Strong string: a ukulele-ish pluck."""
    n = int(SR * dur); period = int(round(SR / freq))
    buf = (rng.random(period) * 2 - 1) * (0.6 + 0.4 * bright)
    out = np.zeros(n)
    damp = 0.996 - 0.02 * (1 - bright)
    for i in range(n):
        j = i % period
        out[i] = buf[j]
        buf[j] = damp * 0.5 * (buf[j] + buf[(j + 1) % period])
    return lp(out, 5200) * vel * 0.9


def strum(freqs, dur=0.6, vel=1.0, spread=0.012, up=False):
    n = int(SR * (dur + spread * len(freqs)))
    out = np.zeros(n)
    order = list(reversed(freqs)) if up else freqs
    for i, f in enumerate(order):
        p = pluck(f, dur, vel * (0.85 + 0.15 * (i % 2)), 0.6)
        s = int(SR * spread * i)
        out[s:s + len(p)] += p[:n - s]
    return out * 0.5


def bass(freq, dur=0.34, vel=1.0):
    n = int(SR * dur); t = tt(n)
    f = freq * (1 + 0.04 * np.exp(-t / 0.02))
    ph = TWO_PI * np.cumsum(f) / SR
    y = np.sin(ph) + 0.85 * np.sin(2 * ph) + 0.4 * np.sin(3 * ph) + 0.15 * np.sin(4 * ph)
    return lp(y, 1400) * np.exp(-t / 0.2) * np.minimum(1, t / 0.004) * vel * 0.6


def pad(freqs, dur, vel=1.0, atk=0.25, rel=0.4):
    n = int(SR * dur); t = tt(n)
    y = np.zeros(n)
    for f in freqs:
        for det in (-0.004, 0, 0.004):
            y += np.sin(TWO_PI * f * (1 + det) * t)
    env = np.minimum(1, t / atk) * np.minimum(1, (dur - t) / rel)
    return lp(y * env, 2200) * vel * 0.08


# ------------------------------------------------------------------ drums

def kick(vel=1.0):
    n = int(SR * 0.28); t = tt(n)
    f = 62 + 110 * np.exp(-t / 0.024)
    y = np.sin(TWO_PI * np.cumsum(f) / SR) * np.exp(-t / 0.085)
    y += 0.45 * lp(noise(n), 1600) * np.exp(-t / 0.005)
    return y * vel


def clap(vel=1.0):
    n = int(SR * 0.22); t = tt(n)
    y = np.zeros(n)
    for d, a in ((0, 0.9), (0.011, 0.8), (0.023, 0.7), (0.036, 1.0)):
        s = int(SR * d)
        seg = bp(noise(n - s), 900, 3800) * np.exp(-tt(n - s) / (0.006 if d < 0.036 else 0.09))
        y[s:] += a * seg
    return y * vel * 0.9


def hat(vel=1.0, open_=False):
    n = int(SR * (0.16 if open_ else 0.05)); t = tt(n)
    return hp(noise(n), 6500) * np.exp(-t / (0.06 if open_ else 0.014)) * vel * 0.35


def shaker(vel=1.0):
    n = int(SR * 0.09); t = tt(n)
    return bp(noise(n), 4500, 9500) * np.minimum(1, t / 0.012) * np.exp(-t / 0.03) * vel * 0.5


def woodtick(freq=1400, vel=1.0):
    n = int(SR * 0.07); t = tt(n)
    return (np.sin(TWO_PI * freq * t) + 0.4 * np.sin(TWO_PI * freq * 2.4 * t)) * np.exp(-t / 0.012) * vel * 0.6


def crash(dur=1.6, vel=1.0):
    n = int(SR * dur); t = tt(n)
    return hp(noise(n), 3200) * np.exp(-t / 0.5) * np.minimum(1, t / 0.002) * vel * 0.5


def riser(dur, vel=1.0):
    """Reverse-cymbal swell."""
    n = int(SR * dur); t = tt(n)
    y = bp(noise(n), 1800, 9000) * (t / dur) ** 2.4
    return y * vel * 0.5


# ------------------------------------------------------------------ sound effects

def knock(vel=1.0, far=False):
    """Knuckles on glass-and-wood: a thump with a woody ring."""
    n = int(SR * 0.22); t = tt(n)
    f = 88 + 110 * np.exp(-t / 0.018)
    body = np.sin(TWO_PI * np.cumsum(f) / SR) * np.exp(-t / 0.05)
    ring_ = 0.4 * np.sin(TWO_PI * 342 * t) * np.exp(-t / 0.035) + 0.22 * np.sin(TWO_PI * 611 * t) * np.exp(-t / 0.022)
    tap = lp(hp(noise(n), 1200), 4200) * np.exp(-t / 0.004) * 0.5
    y = (body + ring_ + tap) * vel * np.minimum(1, t / 0.0007)
    return lp(y, 1500 if far else 3800) * (0.7 if far else 1.0)


def whoosh(dur=0.42, vel=1.0, up=True):
    n = int(SR * dur); t = tt(n)
    base = noise(n)
    out = np.zeros(n)
    centers = [350, 650, 1100, 1800, 2900, 4600]
    for i, c in enumerate(centers):
        k = i / (len(centers) - 1)
        pos = (k if up else 1 - k) * 0.75 + 0.12
        env = np.exp(-0.5 * ((t / dur - pos) / 0.16) ** 2)
        out += bp(base, c * 0.7, c * 1.4) * env
    return out * vel * 0.45


def bloop(freq, vel=1.0, dur=0.16):
    """A round little pop: pitch falls fast, like a bubble."""
    n = int(SR * dur); t = tt(n)
    f = freq * (1 + 0.9 * np.exp(-t / 0.018))
    y = np.sin(TWO_PI * np.cumsum(f) / SR) * np.exp(-t / 0.05) * np.minimum(1, t / 0.001)
    return y * vel * 0.8


def boing(freq=260, vel=1.0, dur=0.42, wobble=1.0):
    n = int(SR * dur); t = tt(n)
    f = freq * (1 + 1.6 * np.exp(-t / 0.06)) * (1 + 0.07 * wobble * np.sin(TWO_PI * 24 * t) * np.exp(-t / 0.22))
    ph = np.cumsum(f) / SR * TWO_PI
    y = (np.sin(ph) + 0.3 * np.sin(2 * ph)) * np.exp(-t / 0.16) * np.minimum(1, t / 0.002)
    return lp(y, 3200) * vel * 0.7


def slide(f0, f1, dur, vel=1.0, vib=6.0, vibd=0.012):
    n = int(SR * dur); t = tt(n)
    f = f0 * (f1 / f0) ** (t / dur) * (1 + vibd * np.sin(TWO_PI * vib * t))
    y = np.sin(np.cumsum(f) / SR * TWO_PI)
    env = np.minimum(1, t / 0.04) * np.minimum(1, (dur - t) / 0.06)
    return y * env * vel * 0.3


def thump(freq=70, vel=1.0, dur=0.22):
    n = int(SR * dur); t = tt(n)
    f = freq * (1 + 0.8 * np.exp(-t / 0.03))
    return np.sin(TWO_PI * np.cumsum(f) / SR) * np.exp(-t / 0.08) * vel


def click(vel=1.0):
    n = int(SR * 0.05); t = tt(n)
    y = hp(noise(n), 2000) * np.exp(-t / 0.0015) + 0.5 * np.sin(TWO_PI * 1500 * t) * np.exp(-t / 0.004)
    y += 0.5 * np.sin(TWO_PI * 180 * t) * np.exp(-t / 0.012)
    return y * vel * 0.7


def shutter(vel=1.0):
    n = int(SR * 0.16); y = np.zeros(n)
    for d, tau, lo, hi in ((0.0, 0.006, 900, 5200), (0.055, 0.009, 600, 3800)):
        s = int(SR * d); m = n - s
        y[s:] += bp(noise(m), lo, hi) * np.exp(-tt(m) / tau)
    return y * vel * 0.8


def cricket(vel=1.0):
    out = np.zeros(int(SR * 0.42))
    for burst in range(3):
        for chirp in range(4):
            s = int(SR * (burst * 0.13 + chirp * 0.022)); n = int(SR * 0.014); t = tt(n)
            seg = np.sin(TWO_PI * 4300 * t) * np.sin(np.pi * t / t[-1])
            out[s:s + n] += seg
    return out * vel * 0.16


def snore(vel=1.0, dur=1.6):
    n = int(SR * dur); t = tt(n)
    breath = lp(noise(n), 260) * (0.5 + 0.5 * np.sin(TWO_PI * 0.62 * t - 1.2)) ** 2
    return breath * np.minimum(1, t / 0.2) * np.minimum(1, (dur - t) / 0.3) * vel * 0.9


def sparkle_run(base='G6', n=4, gap=0.045, vel=1.0):
    seq = [note(base) * r for r in (1, 1.25, 1.5, 2, 2.5, 3)][:n]
    out = np.zeros(int(SR * (gap * n + 1.2)))
    for i, f in enumerate(seq):
        b = bell(f, 1.0, vel * (0.6 + 0.4 * i / max(1, n - 1)))
        s = int(SR * gap * i); out[s:s + len(b)] += b[:len(out) - s]
    return out


# ------------------------------------------------------------------ v2: dark electronic / lo-fi instruments

def ep(freq, dur=1.2, vel=1.0, bright=0.6):
    """Warm Rhodes-like electric piano: soft FM tine that dies fast, a rounded body, drunk tape wobble."""
    n = int(SR * dur); t = tt(n)
    wob = 1 + 0.0035 * np.sin(TWO_PI * 0.55 * t + freq) + 0.0012 * np.sin(TWO_PI * 5.1 * t)
    ph = TWO_PI * freq * t * wob
    idx = (0.35 + 0.9 * bright) * np.exp(-t / 0.18)
    y = np.sin(ph + idx * np.sin(ph)) * np.exp(-t / 0.8)
    y += 0.12 * np.sin(2 * ph) * np.exp(-t / 0.3)
    y *= np.minimum(1, t / 0.006) * np.minimum(1, (dur - t) / 0.1)
    return lp(y, 2300) * vel * 0.55


def sub(freq, dur=0.5, vel=1.0):
    """Round sub bass with enough saturation to be heard on small speakers."""
    n = int(SR * dur); t = tt(n)
    y = np.sin(TWO_PI * freq * t) + 0.35 * np.sin(TWO_PI * 2 * freq * t) * np.exp(-t / 0.25) + 0.12 * np.sin(TWO_PI * 3 * freq * t)
    env = np.minimum(1, t / 0.012) * np.minimum(1, (dur - t) / 0.07) * np.exp(-t / (dur * 1.6))
    return np.tanh(1.15 * lp(y, 500) * env) * vel * 0.7


def saw_bl(freq, t, cutoff):
    """Band-limited saw by additive synthesis (no aliasing)."""
    K = max(1, int(cutoff / freq)); y = np.zeros_like(t)
    for k in range(1, K + 1): y += np.sin(TWO_PI * freq * k * t) / k
    return y


def dpad(freqs, dur, vel=1.0, atk=0.7, rel=0.9, cut=1100):
    """Dark pad: detuned saws under a low cutoff, slow attack."""
    n = int(SR * dur); t = tt(n); y = np.zeros(n)
    for f in freqs:
        for det in (-0.004, 0.004): y += np.sin(TWO_PI * f * (1 + det) * t) + 0.25 * np.sin(TWO_PI * 2 * f * (1 + det) * t)
    env = np.minimum(1, t / atk) * np.minimum(1, (dur - t) / rel)
    return lp(y * env, min(cut, 900), 2) * vel * 0.06


def stab(freqs, dur=0.45, vel=1.0, cut=2400):
    n = int(SR * dur); t = tt(n); y = np.zeros(n)
    for f in freqs:
        for det in (-0.004, 0.004): y += saw_bl(f * (1 + det), t, cut * 1.4)
    sweep = np.exp(-t / 0.09)
    out = np.zeros(n); blocks = 8; step = n // blocks
    for b in range(blocks):
        a, e = b * step, n if b == blocks - 1 else (b + 1) * step
        c = 500 + (cut - 500) * float(np.exp(-(a / SR) / 0.09))
        out[a:e] = lp(y, c, 2)[a:e]
    return out * np.exp(-t / 0.24) * np.minimum(1, t / 0.003) * vel * 0.09


def lkick(vel=1.0):
    n = int(SR * 0.34); t = tt(n)
    f = 46 + 100 * np.exp(-t / 0.028)
    y = np.sin(TWO_PI * np.cumsum(f) / SR) * np.exp(-t / 0.17) + 0.22 * lp(noise(n), 900) * np.exp(-t / 0.004)
    return np.tanh(1.2 * lp(y, 520)) * vel * 1.05


def lsnare(vel=1.0):
    n = int(SR * 0.32); t = tt(n)
    tone = 0.6 * np.sin(TWO_PI * 188 * t) * np.exp(-t / 0.05) + 0.3 * np.sin(TWO_PI * 331 * t) * np.exp(-t / 0.03)
    nz = 0.7 * bp(noise(n), 1100, 7000) * np.exp(-t / 0.1)
    return lp(tone + nz, 3600) * np.minimum(1, t / 0.002) * vel * 0.8


def rim(vel=1.0):
    n = int(SR * 0.09); t = tt(n)
    return (np.sin(TWO_PI * 1650 * t) * np.exp(-t / 0.009) + 0.45 * bp(noise(n), 800, 3200) * np.exp(-t / 0.006)) * vel * 0.55


def lhat(vel=1.0, open_=False):
    n = int(SR * (0.2 if open_ else 0.06)); t = tt(n)
    return lp(hp(noise(n), 5200), 7500) * np.exp(-t / (0.06 if open_ else 0.02)) * vel * 0.26


def vinyl(dur):
    n = int(SR * dur); y = np.zeros(n)
    idx = np.nonzero(rng.random(n) < 5 / SR)[0]
    for i in idx:
        a = rng.uniform(0.25, 1.0) * rng.choice([-1, 1]); L = int(SR * rng.uniform(0.0008, 0.004)); m = min(L, n - i)
        y[i:i + m] += a * np.exp(-tt(m) / (L / SR / 3))
    return lp(y, 4500) * 0.05


def uiblip(freq=880, vel=1.0):
    n = int(SR * 0.09); t = tt(n)
    y = np.sin(TWO_PI * freq * t) * np.exp(-t / 0.022) + 0.3 * np.sin(TWO_PI * freq * 2 * t) * np.exp(-t / 0.01)
    return y * np.minimum(1, t / 0.002) * vel * 0.5


def tock(vel=1.0):
    n = int(SR * 0.12); t = tt(n)
    return (np.sin(TWO_PI * 760 * t) + 0.5 * np.sin(TWO_PI * 1250 * t)) * np.exp(-t / 0.016) * vel * 0.5


def swipe(dur=0.3, vel=1.0, up=True):
    """Filtered-noise swipe: a dry transition sound."""
    n = int(SR * dur); t = tt(n); base = noise(n); out = np.zeros(n); blocks = 12; step = n // blocks
    for b in range(blocks):
        k = b / (blocks - 1); c = 300 * (12 ** (k if up else 1 - k))
        a, e = b * step, n if b == blocks - 1 else (b + 1) * step
        out[a:e] = bp(base, c * 0.6, c * 1.6)[a:e]
    env = np.sin(np.pi * t / dur) ** 1.5
    return out * env * vel * 0.4


# ------------------------------------------------------------------ mixing

class Mix:
    def __init__(self, dur, tail=1.5):
        self.n = int(SR * (dur + tail))
        self.L = np.zeros(self.n); self.R = np.zeros(self.n)
        self.rL = np.zeros(self.n); self.rR = np.zeros(self.n)
        self.bus = 1.0  # level of whatever is being placed right now (music sections and sound effects use different levels)

    def add(self, x, t, gain=1.0, pan=0.0, send=0.0):
        s = int(round(t * SR))
        if s >= self.n or s + len(x) <= 0: return
        a = max(0, -s); b = min(len(x), self.n - s)
        seg = x[a:b] * gain * self.bus
        lg, rg = np.cos((pan + 1) * np.pi / 4), np.sin((pan + 1) * np.pi / 4)
        self.L[s + a:s + b] += seg * lg; self.R[s + a:s + b] += seg * rg
        if send:
            self.rL[s + a:s + b] += seg * lg * send; self.rR[s + a:s + b] += seg * rg * send

    def absorb(self, other, curve=None):
        """Add another mix (a stem), optionally multiplied by a gain curve, e.g. a sidechain duck."""
        c = 1.0 if curve is None else curve[:self.n]
        self.L += other.L * c; self.R += other.R * c; self.rL += other.rL * c; self.rR += other.rR * c

    def reverb(self, decay_s=0.55, wet=1.0):
        n = int(SR * decay_s * 2.2); t = tt(n)
        irs = []
        for _ in range(2):
            ir = lp(noise(n), 7000) * np.exp(-t / (decay_s / 2.4))
            ir *= np.minimum(1, t / 0.004)
            irs.append(ir / np.sqrt(np.sum(ir ** 2)))
        self.L += signal.fftconvolve(self.rL, irs[0])[:self.n] * wet * 0.5
        self.R += signal.fftconvolve(self.rR, irs[1])[:self.n] * wet * 0.5

    def master(self, ceiling=0.89):
        hp_sos = signal.butter(2, 48, 'high', fs=SR, output='sos')
        y = np.stack([signal.sosfilt(hp_sos, self.L), signal.sosfilt(hp_sos, self.R)])
        # gentle glue compression on the sum, then a look-ahead limiter
        env = np.maximum(np.abs(y[0]), np.abs(y[1]))
        env = signal.sosfilt(signal.butter(1, 12, 'low', fs=SR, output='sos'), env)
        gain = 1.0 / np.maximum(1.0, (env / 0.35) ** 0.35)
        y = y * gain
        peak = maximum_filter1d(np.maximum(np.abs(y[0]), np.abs(y[1])), size=int(SR * 0.006))
        g = np.minimum(1.0, ceiling / np.maximum(peak, 1e-9))
        g = signal.sosfilt(signal.butter(1, 220, 'low', fs=SR, output='sos'), g)
        g = np.minimum(g, 1.0)
        y = y * g
        y = np.tanh(y * 1.0)
        return y


def lofi(y, sr=SR):
    """Tape treatment on a finished stereo mix: wow and flutter, a rolled-off top, a little warmth from soft saturation."""
    n = y.shape[1]; t = np.arange(n) / sr
    delay = (0.0016 * np.sin(2 * np.pi * 0.42 * t) + 0.0004 * np.sin(2 * np.pi * 6.3 * t + 1.0)) * sr + 0.003 * sr
    idx = np.arange(n) - delay
    out = np.stack([np.interp(idx, np.arange(n), c) for c in y])
    out = np.stack([signal.sosfilt(signal.butter(2, 5600, 'low', fs=sr, output='sos'), c) for c in out])
    return np.tanh(1.1 * out) / 1.05
