# Agent Pets: wygląd v2, plan 1 (Szkic v2, modele naklejki i pikselowy, podgląd animacji). Plan implementacji

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Cel:** Szkic wyraźnie ołówkowy, Naklejka jako osobny model przodem jak ikona, Pixel-art jako prawdziwy model na siatce, podgląd każdej animacji w ustawieniach; bez duchów całego ciała.

**Architektura:**
- Wspólny „mózg” zwierzaka bez zmian (`SCENES`, `stepPet`, `tick`, rekwizyty, `c.parts`).
- `StyleDef.model: 'vector' | 'sticker' | 'pixel'`; `drawPet` rozdziela: `vector` → dzisiejsze rysowanie, `sticker` → `drawSticker`, `pixel` → `drawPixel`.
- Oba nowe modele korzystają z `rig()` (`renderer/models/rig.ts`): czysta funkcja zamieniająca sprężyny na płaski szkielet przodem (podstawa, skok, squash, przechył, barki, dłonie, stan oczu), która też ustawia `c.hand`/`c.aHand` jak dziś `body.ts`.
- `PetPainter` rysuje zawsze wprost; warstwa poza ekranem, próg przezroczystości i duchy znikają.

**Stos:** bez nowych zależności.

**Spec:** `docs/superpowers/specs/2026-09-25-agent-pets-looks-v2-design.md` (wiąże; sekcje 3–7 i 9 „Plan 1”), tło: `2026-09-25-agent-pets-looks-design.md`.

## Global Constraints

- Wszystko z planu `2026-09-25-agent-pets-looks.md` obowiązuje (LF, stopka commita, słowniki PL/EN dla każdego nowego tekstu, test skanu polskich literałów).
- **Parytet z prototypem v6** zostaje tylko dla stylu Czystego (obie skale) i silnika; Szkic go traci (spec 4).
- **Edycje skryptami:** Python z `newline=''`, kod z backslashami w pliku `.py` w scratchpadzie, nie w heredocu.
- **Kolejne modele nie zmieniają mózgu:** żadnych zmian w `scenes.ts`, `pose.ts`, `stepPet` w tym planie.
- Push i scalanie tylko po zgodzie użytkownika.

## Review Focus

1. **Rekwizyty i przedmioty w dłoniach w nowych modelach** (biurko, terminal, siatka, lupa, klucz, kubek, poduszka): pojawiają się przy dłoniach, nie w próżni; `c.hand` z modelu naklejki i pikselowego wskazuje tam, gdzie rysuje się dłoń. Test: task 1 (`rig` dłonie = `c.hand`), task 4 i 5 (każda scena).
2. **Pixel-art przy DPI 1,25 / 1,5** (prawdziwy pasek użytkownika): siatka w całkowitych pikselach urządzenia, bez rozmycia. Test: task 5 (współrzędne × dpr całkowite).
3. **Przełączenie stylu w trakcie** (vector → sticker → pixel): stan zwierzaka (pozy, cząsteczki) przechodzi bez skoków i błędów; brak pozostałości warstw. Test: task 2.
4. **Scena obrócona bokiem** (np. `edit`, `bash` z `th ≈ 0,55`) w Naklejce: bryła się nie obraca, rekwizyt dalej po właściwej stronie. Test: task 4.
5. **„Wszystkie po kolei” w podglądzie przy ukrytym oknie:** pętla stoi, po powrocie scena idzie dalej bez skoku. Test: task 6 (logika następnej sceny czysta i testowana), pętla już wstrzymuje się przy `document.hidden`.

---

## Struktura plików

```
app/src/styles/types.ts             ZMIANA: model, sketch v2 (passes, boilHz, hatchFill)
app/src/styles/{sketch,sticker,pixel}.ts  ZMIANA
app/src/renderer/pen.ts             ZMIANA: szkic v2 (przejścia, kreskowane wypełnienie)
app/src/renderer/draw/body.ts       ZMIANA: rozdział modeli, boil Szkicu
app/src/renderer/models/rig.ts      NOWY: płaski szkielet przodem
app/src/renderer/models/sticker.ts  NOWY: model naklejki
app/src/renderer/models/pixel.ts    NOWY: model pikselowy
app/src/renderer/models/sprites.ts  NOWY: pikselowe rekwizyty i znaczki (ASCII)
app/src/renderer/painter.ts         ZMIANA: bez warstwy, bez duchów
app/src/settings/look/{LookTab,PreviewStage}.tsx, scenes.ts  ZMIANA/NOWY: podgląd wszystkich scen
app/src/i18n/{pl,en}.ts             ZMIANA: nazwy 15 scen, „Wszystkie po kolei”, podgląd
docs/looks-verification.md          ZMIANA
```

---

### Task 1: `rig()`: płaski szkielet przodem

**Files:**
- Create: `app/src/renderer/models/rig.ts`, `app/src/renderer/models/rig.test.ts`

**Interfaces:**
- Produces:

```ts
export interface RigArm { s: -1 | 1; k: 'L' | 'R'; sx: number; sy: number; hx: number; hy: number; ah: [number, number]; ik: number; L: number; fr: number; sw: [number, number] }
export interface Rig {
  XX: number; Y: number;            // podstawa zwierzaka na scenie (po przesunięciu lx)
  oy: number;                        // przesunięcie skoku (ujemne w górę)
  sx: number; sy: number; rot: number; // squash & stretch i przechył bryły
  W: number; H: number; top: number; bot: number; legH: number; down: number; loaf: number;
  face: -1 | 0 | 1;                  // zwrot z `th`: w lewo, przód, w prawo
  gaze: [number, number];            // przesunięcie źrenic (ex, look) w jednostkach u
  eyes: { open: number; blink: number; sleep: number; happy: number; dizzy: number; squint: number };
  grey: number; alpha: number; walk: number; hopH: number;
  arms: RigArm[];                    // współrzędne względem (XX, Y), jak `arms` w body.ts
}
export function rig(c: Pet, X: number, Y: number, u: number, t: number, size: { w: number; h: number; arm: number }): Rig
```

`arms` mają pola zgodne z tym, czego oczekują `drawItems`/`drawMug` (`s`, `k`, `sw`, `ah`, `ik`, `fr`, `L`, `hx`, `hy`), więc rekwizyty rysują się bez zmian. `rig` ustawia `c.hand = arms.map(a => [a.hx/u, a.hy/u])` i `c.aHand = arms.map(a => [a.ah[0]/u, a.ah[1]/u])` (te same jednostki co `body.ts`, więc `targets()` i energia ruchu działają).

- [ ] **Step 1: Testy**

```ts
import { describe, expect, it } from 'vitest';
import { createPet, setRng, stepPet } from '../index';
import { seeded } from '../testing';
import { rig } from './rig';

setRng(seeded(2).next);
const SIZE = { w: 98, h: 58, arm: 30 };
const warm = (scene: string, f = 90) => { const c = createPet('clawd', scene); for (let i = 1; i <= f; i++) stepPet(c, 1 / 60, i / 60); return c; };

describe('rig', () => {
  it('hands in c.hand are where the rig draws them', () => {
    const c = warm('edit');
    const r = rig(c, 100, 50, 0.5, 1.5, SIZE);
    expect(c.hand).toEqual(r.arms.map(a => [a.hx / 0.5, a.hy / 0.5]));
    expect(c.aHand).toEqual(r.arms.map(a => [a.ah[0] / 0.5, a.ah[1] / 0.5]));
  });
  it('IK hands follow the scene targets (typing hands sit on the keyboard, right of the body)', () => {
    const c = warm('edit', 240);
    const r = rig(c, 0, 0, 1, 4, SIZE);
    expect(r.arms[1].ik).toBeGreaterThan(0.5);
    expect(r.arms[1].hx).toBeCloseTo(c.p.hxR.x, 5);
  });
  it('turning the scene sideways sets the face, not a rotation of the body', () => {
    const c = warm('bash', 240);
    const r = rig(c, 0, 0, 1, 4, SIZE);
    expect(r.face).toBe(1);
    expect(Math.abs(r.rot)).toBeLessThan(0.3);
  });
  it('a hop lifts the body; sleeping closes the eyes', () => {
    const hop = rig(warm('done', 200), 0, 0, 1, 3.3, SIZE);
    const sleep = rig(warm('sleep', 400), 0, 0, 1, 6.7, SIZE);
    expect(sleep.eyes.sleep).toBeGreaterThan(0.5);
    expect(sleep.eyes.open).toBeLessThan(0.5);
    expect(Number.isFinite(hop.oy)).toBe(true);
  });
});
```

- [ ] **Step 2: Run** `pnpm --dir app test rig` → FAIL (brak modułu)

- [ ] **Step 3: Implementacja** (rachunek jak w `body.ts`, bez rzutu 3D)

```ts
// Płaski szkielet przodem dla modeli naklejki i pikselowego: te same sprężyny co body.ts, bez obrotu 3D.
import { PI, cl } from '../math';
import type { Pet } from '../pet';

export interface RigArm { s: -1 | 1; k: 'L' | 'R'; sx: number; sy: number; hx: number; hy: number; ah: [number, number]; ik: number; L: number; fr: number; sw: [number, number] }
export interface Rig { /* jak w Interfaces */ }

export function rig(c: Pet, X: number, Y: number, u: number, t: number, size: { w: number; h: number; arm: number }): Rig {
  const P = c.p;
  const sit = cl(P.sit.x), loaf = cl(P.loaf.x), down = Math.max(sit, loaf), walk = cl(P.walkW.x), lean = cl(P.lean.x);
  const hph = c.hp % 1; let h = 0, sq = 0;
  if (hph < .42) { h = Math.sin(PI * hph / .42); sq = .07 * Math.cos(PI * hph / .42); } else if (hph < .58) sq = -.13 * Math.sin(PI * (hph - .42) / .16);
  const hw = cl(P.hopW.x); h *= hw; sq *= hw;
  const wb = Math.abs(Math.sin(t * 10)) * walk, br = Math.sin(t * (2.3 - loaf)) * .02 * (1 + cl(P.sleep.x) * 1.5);
  const oy = -(h * 24 + wb * 2.5) * u + lean * 4 * u;
  const W = size.w * u, H = size.h * u * (1 - .1 * loaf), bot = -12 * u * (1 - down), top = bot - H, legH = 17 * u;
  const wob = cl(P.wobW.x), rot = Math.sin(t * 4) * .1 * wob + loaf * .06 + P.tilt.x;
  const sx = (1 + .1 * lean) * (1 - (sq + br) * .6), sy = (1 + .1 * lean) * (1 + sq + br);
  const th = P.th.x, face: -1 | 0 | 1 = th > .25 ? 1 : th < -.25 ? -1 : 0;
  const XX = X + P.lx.x * u, shY = top + H * .52, AL = size.arm * u;
  const arms: RigArm[] = ([-1, 1] as const).map(s => {
    const k = s < 0 ? 'L' : 'R';
    const a = P['arm' + k].x + P['osc' + k].x * Math.sin(t * c.f + (s < 0 ? 1.7 : 0)), fw = walk * Math.sin(t * 10 + (s < 0 ? 0 : PI)) * .6;
    const sw: [number, number] = [s * W * .5 * sx, shY * sy + oy];
    const up = Math.max(0, -Math.cos(a)), AE = AL * (1 + .75 * up);
    const ah: [number, number] = [sw[0] + s * Math.sin(a) * AE * .92 + fw * 4 * u, sw[1] + Math.cos(a) * AE * .92];
    const ik = cl(P['ik' + k].x);
    const hx = ah[0] * (1 - ik) + P['hx' + k].x * u * ik, hy = ah[1] * (1 - ik) + P['hy' + k].x * u * ik;
    return { s, k, sx: sw[0], sy: sw[1], hx, hy, ah, ik, L: Math.hypot(hx - sw[0], hy - sw[1]), fr: 1, sw };
  });
  c.hand = arms.map(a => [a.hx / u, a.hy / u]);
  c.aHand = arms.map(a => [a.ah[0] / u, a.ah[1] / u]);
  const bl = c.blink > 0 ? Math.sin(PI * (c.blink / .16)) : 0, sl = cl(P.sleep.x), hp = cl(P.happy.x), dz = cl(P.dizzy.x), sqn = cl(P.squint.x);
  return {
    XX, Y, oy, sx, sy, rot, W, H, top, bot, legH, down, loaf, face,
    gaze: [P.ex.x * 4, P.look.x * 4.5],
    eyes: { open: Math.max(0, 1 - Math.max(bl, sl, hp, dz, sqn)), blink: bl, sleep: sl, happy: hp, dizzy: dz, squint: sqn },
    grey: cl(P.grey.x), alpha: (1 - .22 * cl(P.dim.x)) * (c.alpha ?? 1), walk, hopH: h, arms,
  };
}
```

(Uwaga dla wykonawcy: jeśli test IK pokaże, że `hx` w `body.ts` jest w innym układzie niż `P.hxR.x * u` — np. dłonie typu `toW` — to `rig` ma przyjąć ten sam układ co `body.ts`, bo od niego zależą `targets()` i rekwizyty.)

- [ ] **Step 4: Run** `pnpm --dir app test rig` → PASS; `pnpm --dir app typecheck` czysty

- [ ] **Step 5: Commit** `feat(renderer): flat front-facing rig for the sticker and pixel models`

---

### Task 2: Rozdział modeli i `PetPainter` bez warstwy

**Files:**
- Modify: `app/src/styles/types.ts`, `app/src/styles/*.ts`, `app/src/renderer/draw/body.ts`, `app/src/renderer/painter.ts`, `app/src/renderer/painter.test.ts`
- Create: `app/src/renderer/models/sticker.ts`, `app/src/renderer/models/pixel.ts` (na razie proste bryły z `rig`)

**Interfaces:**
- Consumes: `rig` (task 1).
- Produces: `StyleDef.model: 'vector' | 'sticker' | 'pixel'` (wymagane; wszystkie style dziś `vector` poza `sticker` i `pixel`); `drawSticker(x, c, X, Y, u, t, look)`, `drawPixel(x, c, X, Y, u, t, look)` o sygnaturze `drawPet`; `pen.dpr` (ustawia `PetPainter`, domyślnie 1). `StyleDef.pixel` i `crisp()` znikają; `PaintFrame` bez zmian.

- [ ] **Step 1: Testy (`painter.test.ts`)**: usunięte testy warstwy pikseli, progu i duchów; nowe:

```ts
  it('never draws earlier frames (no ghosts) and never uses an offscreen layer, in any style or motion', () => {
    for (const style of STYLE_IDS) for (const motion of ['calm', 'anime'] as const) {
      const p = new PetPainter(createPet('clawd', 'bash'), fake);
      for (let f = 0; f < 30; f++) {
        const r = recorder();
        p.frame(r.ctx, { ...frame, t0: 1 + f / 30, look: { style, motion } });
        expect(r.log.some(l => l.startsWith('drawImage(')), `${style}/${motion}`).toBe(false);
      }
    }
  });
  it('switching style mid-flight keeps the pet going', () => {
    const p = new PetPainter(createPet('kodek', 'edit'), fake);
    const styles = ['clean', 'sticker', 'pixel', 'sketch', 'sticker', 'clean'] as const;
    styles.forEach((style, f) => { const r = recorder(); p.frame(r.ctx, { ...frame, t0: 1 + f / 30, look: { style, motion: 'calm' } }); expect(r.log.some(l => l.includes('NaN'))).toBe(false); });
    expect(p.pet.hand.every((h: number[]) => h.every(Number.isFinite))).toBe(true);
  });
```

Test „rozróżnialności 7 stylów” zostaje bez zmian.

- [ ] **Step 2: Run** `pnpm --dir app test painter` → FAIL (warstwa istnieje)

- [ ] **Step 3: Implementacja**
- `StyleDef`: `model: 'vector' | 'sticker' | 'pixel'`; usunąć `pixel?`; `sticker.ts` → `model: 'sticker'`, `pixel.ts` → `model: 'pixel'`, pozostałe → `model: 'vector'`.
- `body.ts`, początek `drawPet`: po ustawieniu `pen.st`… `if (st.model === 'sticker') return drawSticker(x, c, X, Y, u, t, lk); if (st.model === 'pixel') return drawPixel(x, c, X, Y, u, t, lk);` (import z `../models/*`).
- `models/sticker.ts` i `models/pixel.ts` w tym tasku: `rig()` i prostokąt bryły (`fillRect`) z dłońmi — pełne modele w taskach 4 i 5.
- `painter.ts`: `frame()` = `tick` → `pen.dpr = f.dpr` → `drawPet(x, …)` → `measure` → `drawFx`; usunąć `Layer`, `take`, `crisp`, `ring`, `GHOST`, `BOX`, `TRAIL_SPEED`, `Surface` i `SurfaceFactory` (konstruktor przyjmuje tylko zwierzaka) i poprawić wywołania (`PetsCanvas`, `stage.ts`, `PetCanvas`, testy: `new PetPainter(pet)`).
- `MotionDef.trails` usunąć (`motion/types.ts`, `index.ts`, `effective`), testy `tick.test.ts` bez `trails`.

- [ ] **Step 4: Run** `pnpm --dir app test` i `typecheck` → PASS (smoke, rozróżnialność, parytet)

- [ ] **Step 5: Commit** `refactor(renderer): one painter path per style model; no offscreen layer, no ghost frames`

---

### Task 3: Szkic v2

**Files:**
- Modify: `app/src/styles/types.ts`, `app/src/styles/sketch.ts`, `app/src/renderer/pen.ts`, `app/src/renderer/draw/body.ts`, `app/src/renderer/styles.test.ts`, `app/src/renderer/parity.test.ts`

**Interfaces:**
- `StyleDef.sketch` = `{ jitterPx: number; offsetPx: number; hatchGapPx: number; passes: number; boilHz: number; hatchFill: boolean; lead: string }`.

- [ ] **Step 1: Testy (`styles.test.ts`)**

```ts
  it('sketch v2: jitter of at least 2 px in the taskbar', () => {
    pen.st = STYLES.sketch;
    const rec = recorder();
    let worst = 0;
    for (pen.boil = 0; pen.boil < 20; pen.boil++) {
      rec.log.length = 0;
      shp(rec.ctx, rrP(0, 0, 30, 30, 0), '#fff', 0.3, { noStroke: 0 });
      for (const l of rec.log) {
        const m = /^(?:moveTo|lineTo)\(([-\d.]+),([-\d.]+)\)$/.exec(l);
        if (m) worst = Math.max(worst, Math.min(Math.abs(+m[1]), Math.abs(+m[1] - 30)), Math.min(Math.abs(+m[2]), Math.abs(+m[2] - 30)));
      }
    }
    pen.st = STYLES.clean;
    expect(worst).toBeGreaterThan(0.95); // połowa amplitudy drgania ≥ 2 px ⇒ odchylenie > 0,95 (kreskowanie pomijane: tylko kontur zaczyna się blisko krawędzi)
  });
  it('sketch v2: fills are hatched, outlines drawn in several graphite passes', () => {
    const log = trace('sketch');
    const strokes = log.filter(l => l === 'stroke()').length, cleanStrokes = trace('clean').filter(l => l === 'stroke()').length;
    expect(strokes).toBeGreaterThan(cleanStrokes * 2.5);
    expect(log).toContain(`strokeStyle=${STYLES.sketch.ink('#D97757')}`);
    expect(log.some(l => /^globalAlpha=0\.[0-4]/.test(l))).toBe(true); // lekkie tło pod kreskowaniem
  });
  it('sketch v2 boils faster than the clean style changes (12 Hz)', () => {
    const at = (t: number) => { pen.boil = 0; const r = recorder(); drawPet(r.ctx, createPet('clawd', 'idle'), 60, 40, .3, t, { style: 'sketch', motion: 'calm' }); return r.log.join(); };
    expect(at(1.00)).not.toBe(at(1.09));
  });
```

`parity.test.ts`: pętla tylko dla `sketch === false` (sam Czysty); komentarz „Szkic v2 nie jest już zgodny z prototypem (spec v2, 4)”.

- [ ] **Step 2: Run** → FAIL

- [ ] **Step 3: Implementacja**
- `sketch.ts`: `ink: () => '#3B3A38'`, `sketch: { jitterPx: 2.2, offsetPx: 1.4, hatchGapPx: 2.6, passes: 3, boilHz: 12, hatchFill: true, lead: '#3B3A38' }`, `line: { minPx: 1, scale: .9 }`.
- `drawPet`: gdy `st.sketch` → `pen.boil = Math.floor(t * st.sketch.boilHz)` (zegar zwierzaka; nadpisuje wartość z wołającego).
- `shp` dla `sk`:
  - wypełnienie, gdy `sk.hatchFill`: `x.save(); x.globalAlpha *= .3; fill kolorem; x.globalAlpha = …(przywrócone)`; potem kreskowanie w kolorze bryły przyciemnionym o 25% (`darken(f,.25)`), odstęp `max(4u, hatchGapPx)`, kąt 60°, linie o długości przekątnej, lekkie drganie końców (`hr`), w klipie kształtu; ściana z `o.hatch` dostaje drugie kreskowanie w poprzek.
  - kontur: `sk.passes` przejść: pierwsze pełne (`lineWidth`), kolejne `globalAlpha *= .5`, `lineWidth *= .6`, drganie ×1,6 i inne ziarno.
- Cień pod zwierzakiem w Szkicu: zamiast `fill` — 5 poziomych kresek w elipsie (`body.ts` przy cieniu, gdy `st.sketch`).

- [ ] **Step 4: Run** `pnpm --dir app test` → PASS

- [ ] **Step 5: Zrzut** strony roboczej `looks-dev.html` (duże zwierzaki i pasek); obejrzeć; ewentualne strojenie wartości jako `style(sketch): …`

- [ ] **Step 6: Commit** `feat(styles): sketch v2 — graphite passes, hatched fills, faster boil`

---

### Task 4: Model naklejki

**Files:**
- Modify: `app/src/renderer/models/sticker.ts`, `app/src/styles/sticker.ts`
- Create: `app/src/renderer/models/sticker.test.ts`

**Interfaces:**
- Consumes: `rig`, `drawProp`, `drawItems`, `drawMug`, `drawPillow`, `shp`, `rrP`, `elP`, `pen`.
- Produces: `drawSticker(x, c, X, Y, u, t, look): void`; kształty naklejki w jednostkach u:

```ts
export const STICKER = {
  clawd: { w: 104, h: 62, r: 20, ears: { w: 14, h: 22, y: .38 }, legs: [-.3, -.1, .1, .3], legW: 11, legH: 12, arm: 26, mitt: 7 },
  kodek: { w: 92, h: 70, r: 30, screen: { m: 10, top: 12, bottom: 16, r: 16 }, phones: { rx: 8, ry: 13 }, antenna: 16, legs: [-.22, .22], legW: 16, legH: 12, arm: 24, mitt: 6.5 },
} as const;
```

- [ ] **Step 1: Testy**

```ts
import { describe, expect, it } from 'vitest';
import { SCENES, createPet, drawPet, pen, setRng, stepPet } from '../index';
import { recorder, seeded } from '../testing';

setRng(seeded(6).next);
pen.font = 'x';
const draw = (skin: 'clawd' | 'kodek', scene: string, u = 1) => {
  const c = createPet(skin, scene); for (let i = 1; i <= 200; i++) stepPet(c, 1 / 60, i / 60);
  const r = recorder(); drawPet(r.ctx, c, 150, 150, u, 3.4, { style: 'sticker', motion: 'calm' }); return { c, log: r.log };
};

describe('sticker model', () => {
  it('never rotates the body, even in sideways scenes', () => {
    for (const scene of ['edit', 'bash', 'grep']) {
      const { log } = draw('clawd', scene);
      const rot = log.filter(l => l.startsWith('rotate(')).map(l => Math.abs(+l.slice(7, -1)));
      expect(Math.max(0, ...rot), scene).toBeLessThan(0.3);
    }
  });
  it('icon features: Clawd ears and blush, Kodek headphones, antenna ball and screen', () => {
    const cl = draw('clawd', 'idle').log.join('\n'), ko = draw('kodek', 'idle').log.join('\n');
    expect(cl).toContain('#F0997B');          // rumieńce
    expect(ko).toContain('#2C2C2A');          // ekran
    expect(ko).toContain('#C9C7C1');          // nauszniki
    expect(ko).toContain('#5DCAA5');          // kulka antenki i oczy
  });
  it('thick outline in the taskbar', () => {
    const w = draw('clawd', 'idle', .3).log.filter(l => l.startsWith('lineWidth=')).map(l => +l.slice(10));
    expect(Math.max(...w)).toBeGreaterThanOrEqual(2);
  });
  it('props and held items sit at the hands in every scene', () => {
    for (const scene of Object.keys(SCENES)) for (const skin of ['clawd', 'kodek'] as const) {
      const { c, log } = draw(skin, scene);
      expect(log.some(l => l.includes('NaN')), `${skin}/${scene}`).toBe(false);
      expect(c.hand.flat().every(Number.isFinite)).toBe(true);
      expect(log.filter(l => l === 'save()').length).toBe(log.filter(l => l === 'restore()').length);
    }
  });
});
```

- [ ] **Step 2: Run** → FAIL

- [ ] **Step 3: Implementacja** (kolejność rysowania, w przestrzeni `translate(XX, Y)`):
1. cień pod bryłą (elipsa, `rgba(0,0,0,.16)`), poduszka (`drawPillow`);
2. `rig` z rozmiarem `STICKER[skin]`; `x.translate(0, oy); x.rotate(rot*.5); x.scale(sx, sy)` dla bryły (bez obrotu 3D);
3. nóżki: zaokrąglone prostokąty `legW × legH` pod bryłą (znikają przy `down`), kolor bryły ciemniejszy o 12%;
4. łapki za bryłą, gdy dłoń za nią (`hy < top + H*.3` i `|hx| < W*.4`), inaczej po bryle: kapsuła `lineCap round` grubości `mitt*1.6*u` od barku do dłoni w kolorze bryły z konturem (`seg`), rękawica `elP` na końcu;
5. bryła: Clawd — `rrP(-W/2, top, W, H, r)` z gradientem (styl `sticker` ma `fill: 'gradient'`), uszka `rrP` po bokach na `y` przed bryłą (za nią w kolejności rysowania), refleks: biały pasek `globalAlpha .5` u góry; Kodek — kask `rrP` biały `#F4F2EC`, ekran `rrP` `#2C2C2A` z marginesem, nauszniki `elP(±W/2, top+H*.5, rx, ry)` `#C9C7C1` z wewnętrzną elipsą `#A5A298`, antenka: kreska z pozycji `top` i kulka `elP` `#5DCAA5` z białym błyskiem;
6. twarz (przesunięta o `gaze` i o `face*6u` w stronę zwrotu):
   - Clawd: oczy — ciemne owale `7×11u` ×`open`, biały błysk `2.2u`; sen — łuki; radość — łuki odwrócone; zawroty — krzyżyki; zmrużenie — kreski; uśmiech — łuk pod oczami; rumieńce `#F0997B` alfa `.55` zawsze;
   - Kodek: na ekranie oczy w `#5DCAA5`: zaokrąglone prostokąty `6×10u`, przy radości łuki „^^”, sen — poziome kreski, zawroty — krzyżyki; wygaszacz przy `loaf>.5` jak w `body.ts`;
7. `drawProp`, `drawItems(arms)`, kubek (`tg._mug`), rękawice na wierzchu;
8. nakładki jak w `body.ts`: dymek „!”, spinner myślenia, gwiazdki zawrotów, cząsteczki (`c.parts`) — wydzielić z `body.ts` funkcje `drawBubble`, `drawThink`, `drawDizzy`, `drawParts` do `draw/overlay.ts` i wołać je z obu modeli w tej samej kolejności (parytet Czystego pilnuje, że `body.ts` nie zmienił zapisu).
- Szarość (`grey`) i przygaszenie (`alpha`) jak w `body.ts` (`lerpC` do `pal.g`, `globalAlpha`).

- [ ] **Step 4: Run** `pnpm --dir app test` → PASS (w tym parytet Czystego po wydzieleniu nakładek)

- [ ] **Step 5: Zrzuty** porównawcze z `app-icon.png` (strona robocza: duży Clawd i Kodek obok ikony, scena `idle`, `edit`, `done`); poprawki proporcji i kolorów jako osobne commity `style(sticker): …`

- [ ] **Step 6: Commit** `feat(renderer): sticker model — front-facing, shaped like the app icon`

---

### Task 5: Model pikselowy

**Files:**
- Modify: `app/src/renderer/models/pixel.ts`, `app/src/styles/pixel.ts`
- Create: `app/src/renderer/models/sprites.ts`, `app/src/renderer/models/pixel.test.ts`

**Interfaces:**
- Consumes: `rig`, `pen.dpr`.
- Produces: `drawPixel(x, c, X, Y, u, t, look)`; `gridPx(u, dpr)` = `Math.max(1, Math.round(5 * u * dpr))` pikseli urządzenia na komórkę (komórka ≈ 5 jednostek u); `SPRITES: Record<string, string[]>` (rekwizyty i znaczki jako ASCII: `.` pusto, litery = kolory palety); `PIXEL_PAL` na skórkę (6–8 kolorów).

```ts
// przykład formatu (sprites.ts)
export const SPRITES = {
  monitor: [
    'kkkkkkkk',
    'kssssssk',
    'ksggsssk',
    'kssssssk',
    'kkkkkkkk',
    '...kk...',
    '..kkkk..',
  ],
  // desk, crt, board, machine, pillow, lens, net, paper, sheet, wrench, mug, z, spark, dot
} as const;
```

- [ ] **Step 1: Testy**

```ts
import { describe, expect, it } from 'vitest';
import { SCENES, createPet, drawPet, pen, setRng, stepPet } from '../index';
import { recorder, seeded } from '../testing';
import { gridPx } from './pixel';

setRng(seeded(4).next);
const draw = (scene: string, t: number, dpr: number, u = .3) => {
  const c = createPet('clawd', scene); for (let i = 1; i <= 120; i++) stepPet(c, 1 / 60, i / 60);
  pen.dpr = dpr; const r = recorder(); drawPet(r.ctx, c, 61.3, 40.2, u, t, { style: 'pixel', motion: 'calm' }); pen.dpr = 1; return r.log;
};

describe('pixel model', () => {
  it('only integer device-pixel rectangles: no paths, arcs, text or images', () => {
    for (const dpr of [1, 1.25, 1.5]) for (const scene of Object.keys(SCENES)) {
      const log = draw(scene, 2, dpr);
      expect(log.some(l => /^(moveTo|lineTo|arc|ellipse|quadraticCurveTo|fillText|drawImage|stroke)\(/.test(l)), `${scene}@${dpr}`).toBe(false);
      for (const l of log.filter(v => v.startsWith('fillRect('))) {
        const n = l.slice(9, -1).split(',').map(Number);
        for (const v of n) expect(Math.abs(v * dpr - Math.round(v * dpr)), `${l}@${dpr}`).toBeLessThan(1e-3);
      }
    }
  });
  it('grid cell is a whole number of device pixels, at least 2 in the taskbar', () => {
    expect(gridPx(.3, 1)).toBe(2); expect(gridPx(.3, 1.25)).toBe(2); expect(gridPx(.3, 1.5)).toBe(2); expect(gridPx(.7, 1.25)).toBe(4);
  });
  it('moves in steps of 0.1 s (same frame within a step)', () => {
    expect(draw('edit', 2.01, 1)).toEqual(draw('edit', 2.06, 1));
    expect(draw('edit', 2.01, 1)).not.toEqual(draw('edit', 2.31, 1));
  });
  it('a small palette per pet', () => {
    const cols = new Set(draw('edit', 2, 1).filter(l => l.startsWith('fillStyle=')));
    expect(cols.size).toBeLessThanOrEqual(12); // paleta zwierzaka + rekwizyt
  });
});
```

- [ ] **Step 2: Run** → FAIL

- [ ] **Step 3: Implementacja**
- `drawPixel`: `const g = gridPx(u, pen.dpr) / pen.dpr` (px CSS na komórkę); `ts = Math.floor(t * 10) / 10` (ruch skokowy: `rig` liczony dla `ts`); początek siatki wyrównany: `ox = Math.round(XX * dpr) / dpr`, `oy0 = Math.round(Y * dpr) / dpr`; funkcja `cell(cx, cy, w, h, col)` = `fillRect(ox + cx*g, oy0 + cy*g, w*g, h*g)` dla całkowitych `cx, cy, w, h`.
- Bryła: Clawd 20×12 komórek (kolor, cień dolny rząd, refleks górny rząd, kontur 1 komórka), oczy 2×3 (mruganie: 2×1; sen: 3×1 niżej; radość: „^” z 3 komórek), nóżki 2×3 (4 sztuki); Kodek 18×13 z ekranem, oczy morskie 2×3, antenka 1×3 + kulka 2×2, nauszniki 2×4.
- Pozycja bryły: `round(rig.oy/ (g))` komórek w pionie, przechył pomijany, squash jako ±1 rząd wysokości.
- Łapki: linia Bresenhama komórek od barku do dłoni (`rig.arms`, zaokrąglone do komórek), grubość 2 komórki, dłoń 3×3.
- Rekwizyty: `SPRITES[c.prop]` przy pozycji rekwizytu z `props.ts` (lewy górny róg w jednostkach u zaokrąglony do komórek), przedmiot w dłoni `SPRITES[c.hold]` przy `hand[1]`; `propA/holdA` < 0,5 → nie rysuj.
- Cząsteczki: `c.parts` jako `SPRITES.z` / `spark` / `dot` w kolorze cząsteczki.
- Nakładki: dymek „!” jako sprite `bubble`, myślenie jako 3 kropki krążące po komórkach, zawroty jako 3 gwiazdki `spark`.
- Paleta: `PIXEL_PAL.clawd = { k:'#2B1D16', m:'#D97757', s:'#B25D3D', h:'#F2AE92', e:'#1E1410', w:'#FFFFFF', g:'#8C887E' }`, `kodek = { k:'#2B1D16', m:'#F1EFE8', s:'#CBC6B8', h:'#FFFFFF', e:'#5DCAA5', d:'#2C2C2A', g:'#A5A298' }`; szarość przy błędzie (`grey>.5` → kolory `g`).

- [ ] **Step 4: Run** `pnpm --dir app test` → PASS

- [ ] **Step 5: Zrzuty** w skali paska przy dpr 1, 1,25 i 1,5 (puppeteer `deviceScaleFactor`) oraz duże; obejrzeć ostrość i czytelność; strojenie jako `style(pixel): …`

- [ ] **Step 6: Commit** `feat(renderer): pixel-art model on a device-pixel grid with stepped motion and pixel props`

---

### Task 6: Podgląd wszystkich animacji

**Files:**
- Create: `app/src/settings/look/scenes.ts`, `app/src/settings/look/scenes.test.ts`, `app/src/settings/look/PreviewStage.tsx`
- Modify: `app/src/settings/look/LookTab.tsx`, `app/src/i18n/{pl,en}.ts`, `app/src/settings/views.test.tsx`, `app/settings.html`

**Interfaces:**
- Produces: `PREVIEW_GROUPS: { id: 'work' | 'states'; scenes: SceneKey[] }[]` (praca: `thinking, edit, bash, read, grep, web, agent, mcp, compact`; stany: `needs, done, error, idle, sleep, bye`); `nextScene(cur: SceneKey): SceneKey` (kolejność grup, zawijanie); `CYCLE_MS = 6000`; `t().look.sceneName[key]` dla 15 scen, `t().look.allInOrder`, `t().look.groups.work/states`, `t().look.preview`.

- [ ] **Step 1: Testy**

```ts
import { describe, expect, it } from 'vitest';
import { PREVIEW_GROUPS, nextScene } from './scenes';
import { SCENES } from '../../renderer';
import { en } from '../../i18n/en';
import { pl } from '../../i18n/pl';

describe('preview scenes', () => {
  it('lists every scene exactly once, named in both languages', () => {
    const all = PREVIEW_GROUPS.flatMap(g => g.scenes);
    expect([...all].sort()).toEqual(Object.keys(SCENES).sort());
    for (const k of all) { expect(pl.look.sceneName[k]).toBeTruthy(); expect(en.look.sceneName[k]).toBeTruthy(); }
  });
  it('cycles through all of them and wraps', () => {
    const all = PREVIEW_GROUPS.flatMap(g => g.scenes);
    let k = all[0];
    for (let i = 1; i < all.length; i++) { k = nextScene(k); expect(k).toBe(all[i]); }
    expect(nextScene(k)).toBe(all[0]);
  });
});
```

`views.test.tsx`: zakładka `look` zawiera „Wszystkie po kolei”, nazwy „Komendy” i „Pożegnanie”, duże płótno (`class="preview-stage"`).

- [ ] **Step 2: Run** → FAIL

- [ ] **Step 3: Implementacja**
- `scenes.ts`: grupy, `nextScene`, `CYCLE_MS`.
- `PreviewStage.tsx`: `PetsCanvas` 460×150, u = 0,7, Clawd i Kodek w bieżącym wyglądzie, klasa `preview-stage`; pod nim wybór sceny: dwie grupy chipów (`role="radiogroup"`), osobny chip „Wszystkie po kolei”; tryb cyklu: `setInterval(CYCLE_MS)` → `nextScene` (interwał w efekcie, sprzątany; pętla rysowania i tak stoi przy ukrytym oknie).
- `LookTab`: `PreviewStage` na górze (zamiast pięciu chipów), galeria i pasek dostają tę samą scenę.
- Słowniki: `look.sceneName` (PL: Myśli, Pisze, Komendy, Czyta, Szuka, Sieć, Subagent, Narzędzie MCP, Kompaktuje, Czeka, Skończył, Błąd, Bezczynny, Śpi, Pożegnanie; EN: Thinking, Writing, Commands, Reading, Searching, Web, Subagent, MCP tool, Compacting, Waiting, Done, Error, Idle, Asleep, Goodbye), `allInOrder` (Wszystkie po kolei / All in order), `groups` (Praca/Work, Stany/States), `preview` (Podgląd/Preview); `look.scene` (5 starych) usunąć.
- CSS: `.preview-stage{display:block;border-radius:8px;background:var(--card);border:1px solid var(--line);margin:8px 0}`, `.chip-group{display:flex;flex-wrap:wrap;gap:4px;align-items:center}` z etykietą grupy.

- [ ] **Step 4: Run** `pnpm --dir app test` i `typecheck` → PASS

- [ ] **Step 5: Zrzut** zakładki Wygląd (PL i EN)

- [ ] **Step 6: Commit** `feat(settings): preview every animation (grouped scenes, all in order)`

---

### Task 7: Weryfikacja i build

**Files:**
- Modify: `docs/looks-verification.md`

- [ ] **Step 1:** `cargo test --workspace`, `pnpm --dir app test`, `pnpm --dir app typecheck` → PASS
- [ ] **Step 2:** zrzuty: wszystkie style × obie skórki w 5 scenach, pasek przy dpr 1/1,25/1,5, podgląd PL/EN; obejrzeć każdy
- [ ] **Step 3:** `pnpm --dir app tauri build` → instalator; ścieżka dla użytkownika
- [ ] **Step 4:** `docs/looks-verification.md`: sekcja „Wygląd v2 (plan 1)” z wierszami: Szkic v2, Naklejka (porównanie z ikoną), Pixel-art (ostrość przy DPI), brak duchów, podgląd wszystkich scen, testy
- [ ] **Step 5: Commit** `docs: looks v2 plan 1 verification`

Po tym: przegląd całej gałęzi od `a8f3729` (świeży recenzent), poprawki, test użytkownika na żywo, potem plan 2 (Anime).
