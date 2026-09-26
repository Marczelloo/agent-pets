# Agent Pets: wygląd v2, plan 2 (Anime: choreografie, efekty, cząsteczki). Plan implementacji

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Cel:** Ruch „Anime” staje się osobną choreografią 15 scen w stylu znanych anime (seria ORA/MUDA, pieczęcie rąk, Sharingan, oddech pioruna, przywołanie, alchemia, Light Yagami, „Nice!”, Hollow Purple…), z cząsteczkami, klatkami uderzenia, wstrząsem, tłem akcji i onomatopejami, we wszystkich trzech modelach (wektor, naklejka, piksel).

**Architektura:**
- Mózg zostaje jeden, ale dostaje drugą tablicę scen: `SCENES_ANIME` (te same klucze co `SCENES`). Zwierzak pamięta `c.anime`; `setMotion(c, anime)` przełącza tablicę i restartuje scenę. `PetPainter` woła `setMotion` z ruchu wyglądu, więc reszta aplikacji (roster, podgląd) się nie zmienia.
- Akcja sceny ma opcjonalny szósty element: hak kroku `(a, c, t, dt) => void`, który emituje cząsteczki, uderzenia i onomatopeje do stanu efektów `c.fx` (`renderer/anime/state.ts`). Stan liczy się w mózgu (deterministycznie, testowalnie bez rysowania).
- Sprężyny Anime liczone analitycznie jako krytycznie tłumione (bez przestrzelenia przy każdym `dt`); flaga celu `_stiff` usztywnia je na szybkie ciosy.
- Rysowanie efektów: `motion/fx/` z dwiema implementacjami: wektorową (modele `vector` i `sticker`) i siatkową (`pixel`, same `fillRect` na komórkach). `PetPainter` składa klatkę: tło akcji → zwierzak (wstrząs, rozciągnięcie, odwrócenie kolorów w klatce uderzenia) → cząsteczki, smugi, nakładki twarzy, onomatopeje.
- Ruch Spokojny nie zmienia się ani o jedną operację rysowania (parytet z prototypem v6 zostaje).

**Stos:** bez nowych zależności.

**Spec:** `docs/superpowers/specs/2026-09-25-agent-pets-looks-v2-design.md` (wiąże; sekcje 8 i 9 „Plan 2”), tło: sekcje 3 i 6 (modele, siatka pikselowa).

## Global Constraints

- Wszystko z planów `2026-09-25-agent-pets-looks.md` i `2026-09-25-agent-pets-looks-v2-models.md` obowiązuje: LF, stopka commita `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`, słowniki PL/EN dla każdego nowego tekstu UI, test skanu polskich literałów, edycje skryptami w Pythonie z `newline=''` (kod z backslashami w pliku `.py` w scratchpadzie).
- **Spokojny bez zmian:** `SCENES`, sprężyny i rysowanie w ruchu Spokojnym dają identyczny log rysowania jak przed planem; testy parytetu z prototypem v6 zostają zielone bez zmian.
- **Ruch (spec 8.1):** zamach ≈ 0,1–0,15 s → bardzo szybka akcja → zatrzymanie w pozie; sprężyny Anime twarde i krytycznie tłumione (bez przestrzelenia); tempo 1,4; bez duchów całego ciała, zamiast nich smugi (łuk za łapką, wachlarz pięści, rozciągnięcie ciała 1–2 klatki).
- **Efekty (spec 8.2):** limit 40 cząsteczek na zwierzaka (tryb oszczędny: 20 i co druga emisja pominięta, bez tła akcji); najwyżej 3 klatki uderzenia na sekundę na zwierzaka; onomatopeje ≥ 9 px; wyłączone efekty animacji w Windows (`reduced`): bez błysków i wstrząsów, choreografia zostaje.
- **Tło akcji tylko w miejscu zwierzaka:** przycięte do prostokąta 150u × 140u wokół podstawy.
- **Piksel:** efekty modelu pikselowego to wyłącznie `fillRect` na całkowitych pikselach urządzenia (ten sam niezmiennik co model), bez tekstu; onomatopeje z bitmapowej czcionki.
- **Wydajność:** żadnych warstw poza ekranem ani `drawImage`; filtr `invert(1)` tylko na 1–2 klatki uderzenia.
- Push i scalanie tylko po zgodzie użytkownika.

## Review Focus

1. **Przełączenie Spokojny ↔ Anime w trakcie sceny** (Wygląd w ustawieniach, zwierzak w pasku pracuje): scena startuje od nowa w nowej tablicy bez skoku pozy, cząsteczki Anime po przejściu na Spokojny przestają być rysowane i nie rosną w pamięci. Test: task 1 (`setMotion` restartuje, powrót do calm), task 3 (calm po anime: log jak czysty `drawPet`, `c.fx.parts` nie rośnie).
2. **Pasek przy 10 kl./s i przy dużym `dt`** (oszczędzanie, zwierzak w tle): sprężyny analityczne nie wybuchają przy `dt = 0,1`, zdarzenia haków (`at`, `every`) nie gubią się ani nie dublują przy grubym kroku. Test: task 1 (`critStep` przy `dt` 1/60 i 0,1), task 2 (`every`/`at` przy `dt = 0,1`).
3. **Wiele zwierzaków obok siebie w pasku:** tło akcji, krąg na ziemi i błysk nie wychodzą poza miejsce zwierzaka; zwierzak w `web`/`bye` nie ucieka dalej niż ±50u. Test: task 4 (clip 150u × 140u), task 7 i 9 (zakres `lx`).
4. **Pixel-art przy DPI 1,25 / 1,5 z efektami:** cząsteczki, słowa, nakładki i wstrząs trzymają siatkę (całkowite piksele urządzenia). Test: task 5 (wszystkie prymitywy × dpr), task 3 (wstrząs zaokrąglony do komórki).
5. **Scena `needs` i `thinking` w pasku 48 px:** duże „!”, dymek snu, Sharingan i onomatopeje mieszczą się w pasku (y ≥ 0) przy u = 0,3. Test: task 10 (przegląd: górna krawędź operacji rysowania ≥ 0 dla wszystkich scen w pasku).

---

## Struktura plików

```
app/src/motion/types.ts                  ZMIANA: MotionDef.fx, spring.crit, FxEnv
app/src/motion/index.ts                  ZMIANA: MOTIONS, effective() → FxEnv
app/src/motion/tick.test.ts              ZMIANA: brak przestrzelenia w Anime
app/src/motion/fx.ts, fx.test.ts         USUNIĘTE (zastąpione przez motion/fx/)
app/src/motion/fx/index.ts               NOWY: drawFxBack/drawFxFront, flashFrame, shakeOffset, stretchOf, recordTrail
app/src/motion/fx/vector.ts              NOWY: efekty wektorowe (vector + sticker)
app/src/motion/fx/pixel.ts               NOWY: efekty na siatce pikselowej
app/src/motion/fx/glyphs.ts              NOWY: bitmapowa czcionka onomatopei
app/src/renderer/scenes.ts               ZMIANA: Act z hakiem kroku (6. element)
app/src/renderer/pet.ts                  ZMIANA: tablica scen wg c.anime, setMotion, critStep, _stiff, hak, stepFx
app/src/renderer/anime/kit.ts            NOWY: keys(), at(), every(), snapE, WORDS
app/src/renderer/anime/state.ts          NOWY: stan efektów, cząsteczki, uderzenia, słowa
app/src/renderer/anime/work.ts           NOWY: edit, bash, read, grep, web, agent, mcp
app/src/renderer/anime/states.ts         NOWY: thinking, needs, done, error, idle, sleep, compact, bye
app/src/renderer/anime/index.ts          NOWY: SCENES_ANIME
app/src/renderer/models/rig.ts           ZMIANA: squash z pen.squash, c.face
app/src/renderer/models/{sticker,pixel}.ts, draw/body.ts  ZMIANA: c.face, pen.fx
app/src/renderer/painter.ts              ZMIANA: składanie klatki z efektami
app/src/renderer/testing.ts              ZMIANA: simulate() dla testów Anime
app/src/i18n/{pl,en}.ts                  ZMIANA: opis ruchu Anime
docs/looks-verification.md               ZMIANA
```

---

### Task 1: Mózg Anime: tablica scen, sprężyny krytyczne, hak kroku, squash w `rig`

**Files:**
- Modify: `app/src/motion/types.ts`, `app/src/motion/index.ts`, `app/src/renderer/scenes.ts`, `app/src/renderer/pet.ts`, `app/src/renderer/index.ts`, `app/src/renderer/models/rig.ts`, `app/src/renderer/draw/body.ts`, `app/src/renderer/painter.ts` (tylko `effective` → nowy kształt, bez nowych efektów)
- Create: `app/src/renderer/anime/index.ts`, `app/src/renderer/anime/kit.ts`
- Test: `app/src/motion/tick.test.ts`, `app/src/renderer/anime/kit.test.ts`, `app/src/renderer/models/rig.test.ts`

**Interfaces:**
- Produces:
  - `MotionDef { id: MotionId; tempo: number; spring: { k: number; d: number; crit?: boolean }; squash: number; fx: boolean }`
  - `FxEnv { fx: boolean; bg: boolean; flash: boolean; shake: boolean; parts: number }`, `effective(m, { saving, reduced }): FxEnv`
  - `Act = [name, dur, fn, onStart?, onEnd?, hook?: (a: number, c: Pet, t: number, dt: number) => void]`
  - `setMotion(c: Pet, anime: boolean): void`, `critStep(s: {x:number; v:number}, target: number, k: number, dt: number): void`, `sceneTable(c): Record<string, Scene>`
  - `SCENES_ANIME: Record<string, Scene>` (w tym tasku kopia `SCENES`; taski 6–9 podmieniają sceny)
  - `kit.ts`: `snapE(v)`, `keys(F: [number, Pose][]): (a) => Pose`, `at(a, dt, a0)`, `every(a, dt, period, from?)`, `HIP`, `WORDS`
  - flaga celu `_stiff` (mnożnik sztywności, tylko Anime)

- [ ] **Step 1: Testy (RED)**

`app/src/motion/tick.test.ts` — zastąp test „anime springs overshoot where calm ones do not jump as far” i „saving and reduced motion switch the costly effects off”:

```ts
  it('anime springs never overshoot (critically damped), calm ones do', () => {
    const peak = (m: typeof MOTIONS.calm) => { rng.reset(9); const c = createPet('clawd', 'idle'); let T = 0, top = 0;
      c.act = ['test', 99, () => ({ armR: 0.35 })]; c.aT = 0; // cel niezależny od choreografii sceny
      c.p.armR.x = 0; c.p.armR.v = 0; for (let f = 0; f < 90; f++) { T += 1 / 60; tick(c, 1 / 60, T, m, true); top = Math.max(top, c.p.armR.x); } return top; };
    expect(peak(MOTIONS.calm)).toBeGreaterThan(0.35 * 1.02);
    expect(peak(MOTIONS.anime)).toBeLessThanOrEqual(0.35 + 1e-9);
  });
  it('critStep reaches the target without overshoot at 60 and 10 fps, for every spring', () => {
    for (const [k] of Object.values(SPR)) for (const mul of [1.8, 5.4]) for (const dt of [1 / 60, 0.1]) {
      const s = { x: 0, v: 0 };
      let top = 0;
      for (let i = 0; i < 200; i++) { critStep(s, 1, k * mul, dt); top = Math.max(top, s.x); }
      expect(top, `${k}×${mul}@${dt}`).toBeLessThanOrEqual(1 + 1e-9);
      expect(s.x).toBeCloseTo(1, 3);
    }
  });
  it('_stiff makes anime hands settle faster', () => {
    const settle = (stiff: number) => { const s = { x: 0, v: 0 }; let n = 0; while (s.x < 0.9 && n < 600) { critStep(s, 1, 170 * 1.8 * stiff, 1 / 60); n++; } return n; };
    expect(settle(3)).toBeLessThan(settle(1));
    expect(settle(3) / 60).toBeLessThan(0.1);
  });
  it('saving halves particles and drops the action background; reduced drops flashes and shake', () => {
    expect(effective(MOTIONS.anime, { saving: false, reduced: false })).toEqual({ fx: true, bg: true, flash: true, shake: true, parts: 1 });
    expect(effective(MOTIONS.anime, { saving: true, reduced: false })).toEqual({ fx: true, bg: false, flash: true, shake: true, parts: 0.5 });
    expect(effective(MOTIONS.anime, { saving: false, reduced: true })).toEqual({ fx: true, bg: true, flash: false, shake: false, parts: 1 });
    expect(effective(MOTIONS.calm, { saving: false, reduced: false }).fx).toBe(false);
  });
  it('an anime pet plays the anime table; switching back restarts the calm scene', () => {
    const c = createPet('clawd', 'edit');
    setMotion(c, true);
    expect(sceneTable(c)).toBe(SCENES_ANIME);
    expect(c.act).toBe(SCENES_ANIME.edit.seq?.[0] ?? SCENES_ANIME.edit.acts[0]);
    setMotion(c, false);
    expect(sceneTable(c)).toBe(SCENES);
    expect(c.act).toBe(SCENES.edit.acts[0]);
  });
  it('the step hook runs every step with the act time, pet clock and dt', () => {
    const seen: number[][] = [];
    const c = createPet('clawd', 'idle');
    c.act = ['test', 9, () => ({}), undefined, undefined, (a: number, _c: unknown, t: number, dt: number) => seen.push([a, t, dt])];
    c.aT = 0;
    stepPet(c, 0.1, 5);
    stepPet(c, 0.1, 5.1);
    expect(seen.map(v => v.map(n => Math.round(n * 100) / 100))).toEqual([[0.1, 5, 0.1], [0.2, 5.1, 0.1]]);
  });
```

Dopisz importy: `import { SPR } from '../renderer/pose';`, `import { SCENES_ANIME } from '../renderer/anime';`, `import { critStep, sceneTable, setMotion } from '../renderer/pet';`.

Dodaj też test, że `SCENES_ANIME` ma te same klucze co `SCENES` (w `kit.test.ts`, razem z testami kit):

`app/src/renderer/anime/kit.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { SCENES } from '../scenes';
import { SCENES_ANIME } from './index';
import { at, every, keys, snapE } from './kit';

describe('anime kit', () => {
  it('SCENES_ANIME covers exactly the calm scene keys', () => {
    expect(Object.keys(SCENES_ANIME).sort()).toEqual(Object.keys(SCENES).sort());
  });
  it('snapE covers most of the way early, then holds', () => {
    expect(snapE(0)).toBe(0);
    expect(snapE(0.3)).toBeGreaterThan(0.8);
    expect(snapE(1)).toBe(1);
  });
  it('keys carries missing keys forward, snaps numbers and switches strings when heading for the key', () => {
    const f = keys([[0, { hxR: 0, _hold: 'a' }], [0.1, { hxR: 10 }], [0.2, { _hold: 'b' }]]);
    expect(f(0).hxR).toBe(0);
    expect(f(0.03).hxR as number).toBeGreaterThan(8);
    expect(f(0.15)).toEqual({ hxR: 10, _hold: 'b' });
    expect(f(0.5)).toEqual({ hxR: 10, _hold: 'b' });
  });
  it('at fires once when the act time passes the mark, also at 10 fps', () => {
    for (const dt of [1 / 60, 0.1]) {
      let n = 0;
      for (let a = 0; a < 1; a += dt) if (at(a, dt, 0.35)) n++;
      expect(n, `dt ${dt}`).toBe(1);
    }
  });
  it('every fires once per period from the start, without doubling at coarse steps', () => {
    for (const dt of [1 / 60, 0.1]) {
      let n = 0;
      for (let i = 0; i * dt < 2 - 1e-9; i++) if (every(i * dt, dt, 0.5)) n++;
      expect(n, `dt ${dt}`).toBe(4);
    }
  });
});
```

`app/src/renderer/models/rig.test.ts` — dopisz:

```ts
  it('squash & stretch follows the motion profile (pen.squash)', () => {
    const squashAt = (k: number) => {
      const c = createPet('clawd', 'needs');
      c.hp = 0.5; c.p.hopW.x = 1; // lądowanie: faza 0,42–0,58
      pen.squash = k;
      const r = rig(c, 0, 0, 1, 0, { w: 100, h: 70, arm: 16 });
      pen.squash = 1;
      return r.sx;
    };
    expect(squashAt(1.6) - 1).toBeGreaterThan((squashAt(1) - 1) * 1.4);
  });
```

(dopisz `pen` do importów z `'../index'`).

- [ ] **Step 2: Uruchom — RED**

Run: `pnpm --dir app exec vitest run src/motion/tick.test.ts src/renderer/anime/kit.test.ts src/renderer/models/rig.test.ts`
Expected: FAIL (brak `critStep`, `setMotion`, `sceneTable`, `anime/index`, `kit`; `effective` zwraca stary kształt; `rig` ignoruje `pen.squash`).

- [ ] **Step 3: Implementacja**

`app/src/motion/types.ts`:

```ts
import type { MotionId } from '../types';

/** Profil ruchu: zegar i sprężyny (`tick`); `fx` włącza choreografie i efekty Anime (`renderer/anime`, `motion/fx`). */
export interface MotionDef {
  id: MotionId;
  /** mnożnik zegara zwierzaka */
  tempo: number;
  /** mnożniki sprężyn; `crit` = krytycznie tłumione, liczone analitycznie (bez przestrzelenia) */
  spring: { k: number; d: number; crit?: boolean };
  /** mnożnik squash & stretch przy skokach */
  squash: number;
  fx: boolean;
}

/** Co efekty Anime mogą w tej klatce: tło akcji, błyski, wstrząs, część cząsteczek (1 albo 0,5). */
export interface FxEnv { fx: boolean; bg: boolean; flash: boolean; shake: boolean; parts: number }
```

`app/src/motion/index.ts`:

```ts
import type { MotionId } from '../types';
import type { FxEnv, MotionDef } from './types';
export type { FxEnv, MotionDef } from './types';

export const MOTIONS: Record<MotionId, MotionDef> = {
  calm: { id: 'calm', tempo: 1, spring: { k: 1, d: 1 }, squash: 1, fx: false },
  anime: { id: 'anime', tempo: 1.4, spring: { k: 1.8, d: 1, crit: true }, squash: 1.6, fx: true },
};

/** Tryb oszczędny: połowa cząsteczek, bez tła akcji. Wyłączone efekty animacji w Windows: bez błysków i wstrząsów (spec 8.2). */
export function effective(m: MotionDef, env: { saving: boolean; reduced: boolean }): FxEnv {
  return { fx: m.fx, bg: m.fx && !env.saving, flash: m.fx && !env.reduced, shake: m.fx && !env.reduced, parts: env.saving ? 0.5 : 1 };
}
```

`app/src/renderer/scenes.ts` — typ akcji:

```ts
export type Act = [name: string, dur: number, fn: (a: number, c: Pet, t: number) => Record<string, any> | undefined, onStart?: (c: Pet) => void, onEnd?: (c: Pet) => void,
  /** hak kroku (tylko Anime): cząsteczki, uderzenia, słowa; `a` = czas akcji po tym kroku */
  hook?: (a: number, c: Pet, t: number, dt: number) => void];
```

`app/src/renderer/anime/kit.ts`:

```ts
// Narzędzia choreografii Anime (spec 8.1): klatki kluczowe z szybką akcją i pauzą, zdarzenia w czasie akcji.
export type Pose = Record<string, number | string | null>;

/** Szybka akcja: prawie cała droga w pierwszej ⅓ odcinka, potem zatrzymanie w pozie. */
export const snapE = (v: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, v)), 5);

/** Klatki kluczowe `[czas, poza]`: brakujące klucze przechodzą z poprzedniej klatki; liczby idą `snapE`, reszta przełącza się na początku odcinka do klatki. */
export function keys(F: [number, Pose][]): (a: number) => Pose {
  const R: [number, Pose][] = [];
  let acc: Pose = {};
  for (const [t, p] of F) { acc = { ...acc, ...p }; R.push([t, acc]); }
  return (a) => {
    if (a <= R[0][0]) return { ...R[0][1] };
    for (let i = 1; i < R.length; i++) if (a <= R[i][0]) {
      const [t0, p0] = R[i - 1], [t1, p1] = R[i], e = snapE((a - t0) / (t1 - t0)), o: Pose = {};
      for (const k in p1) { const v0 = p0[k], v1 = p1[k]; o[k] = typeof v1 === 'number' && typeof v0 === 'number' ? v0 + (v1 - v0) * e : v1; }
      return o;
    }
    return { ...R[R.length - 1][1] };
  };
}

/** Raz, gdy czas akcji mija `a0` w tym kroku. */
export const at = (a: number, dt: number, a0: number) => a - dt < a0 && a >= a0;
/** Raz na okres `period`, od `from` (pierwszy raz na starcie). */
export const every = (a: number, dt: number, period: number, from = 0) =>
  a >= from && Math.floor((a - from) / period + 1e-9) !== Math.floor((a - dt - from) / period + 1e-9);

/** Lewa ręka na biodrze (jak w scenach Spokojnych). */
export const HIP = { ikL: 1, hxL: -47, hyL: -25 };
/** Onomatopeje używane w scenach (czcionka pikselowa w `motion/fx/glyphs.ts` musi mieć każdy znak). */
export const WORDS = ['ドドド', 'バン', 'ボン', 'ゴゴゴ', 'シュッ', 'NICE!', '!'] as const;
```

`app/src/renderer/anime/index.ts`:

```ts
import { SCENES, type Scene } from '../scenes';

/** Choreografie Anime (spec 8.3): te same klucze co `SCENES`; sceny bez własnej choreografii grają wersję Spokojną. */
export const SCENES_ANIME: Record<string, Scene> = { ...SCENES };
```

`app/src/renderer/pet.ts` — zmiany:

```ts
import { SCENES_ANIME } from "./anime";
export const sceneTable=(c: any)=>c.anime?SCENES_ANIME:SCENES;
/** Przełącza choreografię (Spokojny ↔ Anime) i restartuje bieżącą scenę w nowej tablicy; pozy przechodzą sprężynami. */
export function setMotion(c: Pet,anime: boolean){if(!!c.anime===anime)return;c.anime=anime;setScene(c,c.st);}
/** Krytycznie tłumiona sprężyna, rozwiązanie dokładne: bez przestrzelenia i stabilna przy każdym dt. */
export function critStep(s: {x:number;v:number},target: number,k: number,dt: number){const w=Math.sqrt(k),e=s.x-target,j=s.v+w*e,ex=Math.exp(-w*dt);s.x=target+(e+j*dt)*ex;s.v=(s.v-w*j*dt)*ex;}
```

W `setScene`, `nextAct`, `targets` zamień `SCENES[...]` na `sceneTable(c)[...]`. W `stepPet`:
- sygnatura `spr?: {k:number;d:number;crit?:boolean}`;
- pętla sprężyn: `K.forEach((k: any)=>{const s=P[k],sp=SPR[k]||[90,16];if(spr?.crit)critStep(s,tg[k],sp[0]*sk*(tg._stiff||1),dt);else{s.v+=((tg[k]-s.x)*sp[0]*sk-s.v*sp[1]*sd)*dt;s.x+=s.v*dt;}});`
- zaraz po `c.tg=tg;...slot(...)`: `if(c.act[5])c.act[5](c.aT,c,t,dt);` (stan efektów podłącza task 2).

`app/src/renderer/index.ts`: eksportuj `setMotion`, `sceneTable`, `critStep` z `./pet` i `SCENES_ANIME` z `./anime`.

`app/src/renderer/models/rig.ts`: `h *= hw; sq *= hw * pen.squash;` (import `pen` z `'../pen'`).

`app/src/renderer/draw/body.ts`: `pen.fx=mo.emotes` → `pen.fx=mo.fx`.

`app/src/renderer/painter.ts`: do czasu tasku 3 — `const base = MOTIONS[f.look.motion] ?? MOTIONS.calm; setMotion(this.pet, base.id === 'anime');`, usuń wywołanie `drawFx` i `effective` (stare efekty znikają; nowe wracają w taskach 3–5), usuń `measure`/`energy`. W `app/src/looks-dev.ts` (plik lokalny, nie w repo) usuń wypisywanie `energy`. Usuń `app/src/motion/fx.ts` i `app/src/motion/fx.test.ts`.

- [ ] **Step 4: Uruchom — GREEN**

Run: `pnpm --dir app exec vitest run src/motion src/renderer`
Expected: PASS (w tym `parity.test.ts` bez zmian).

- [ ] **Step 5: Commit**

```bash
git add -A app/src/motion app/src/renderer
git commit -m "feat(motion): anime scene table, critically damped springs, act step hooks, rig squash from the motion profile"
```

---

### Task 2: Stan efektów: cząsteczki, uderzenia, słowa

**Files:**
- Create: `app/src/renderer/anime/state.ts`, `app/src/renderer/anime/state.test.ts`
- Modify: `app/src/renderer/pet.ts`, `app/src/renderer/testing.ts`

**Interfaces:**
- Consumes: `FxEnv` (task 1), hak kroku (task 1)
- Produces:
  - `type PKind = 'spark' | 'dust' | 'key' | 'page' | 'confetti' | 'bolt' | 'smoke' | 'energy' | 'note' | 'tear' | 'soul' | 'helper'`
  - `interface Particle { k: PKind; x: number; y: number; vx: number; vy: number; rot: number; vr: number; life: number; max: number; s: number; col: string }` (x, y w jednostkach u względem podstawy po `lx`)
  - `interface Word { text: string; x: number; y: number; life: number; max: number; s: number }`
  - `interface FxState { parts: Particle[]; words: Word[]; flashReq: number; flashFrames: number; flashLog: number[]; shakeAt: number; shakeAmp: number; trail: [number, number, number][][]; env: FxEnv; n: number; t: number; stats: Record<string, number> }`
  - `CAP = 40`, `PHYS: Record<PKind, { g: number; drag: number; life: number; s: number; col: string }>`
  - `fxState(c): FxState`, `emit(c, k, x, y, o?: Partial<Particle>)`, `spray(c, k, n, x, y, speed, dir?, spread?)`, `impact(c, amp, flash?)`, `word(c, text, x, y, s?)`, `stepFx(c, dt, t)`
  - `testing.ts`: `simulate(skin, scene, secs, each?)` — zwierzak w Anime liczony przez `tick` przy 60 kl./s

- [ ] **Step 1: Testy (RED)** — `app/src/renderer/anime/state.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { createPet, setRng, stepPet } from '../index';
import { seeded } from '../testing';
import { CAP, PHYS, emit, fxState, impact, spray, stepFx, word } from './state';

setRng(seeded(5).next);
const pet = () => createPet('clawd', 'idle');

describe('anime fx state', () => {
  it('caps particles per pet and drops the oldest first', () => {
    const c = pet();
    for (let i = 0; i < 100; i++) emit(c, 'spark', i, 0);
    expect(c.fx.parts.length).toBe(CAP);
    expect(c.fx.parts[0].x).toBe(100 - CAP);
    expect(c.fx.stats.spark).toBe(100);
  });
  it('power saving: half the cap and every other emission skipped', () => {
    const c = pet();
    fxState(c).env = { fx: true, bg: false, flash: true, shake: true, parts: 0.5 };
    for (let i = 0; i < 10; i++) emit(c, 'dust', 0, 0);
    expect(c.fx.parts.length).toBe(5);
    for (let i = 0; i < 100; i++) emit(c, 'dust', 0, 0);
    expect(c.fx.parts.length).toBe(CAP / 2);
  });
  it('every kind has its own physics: keys fall, smoke and souls rise, sparks slow down', () => {
    const c = pet();
    for (const k of Object.keys(PHYS) as (keyof typeof PHYS)[]) emit(c, k, 0, -50, { vx: 50, vy: 0, max: 5 });
    for (let i = 0; i < 20; i++) stepFx(c, 1 / 60, i / 60);
    const by = (k: string) => c.fx.parts.find(p => p.k === k)!;
    expect(by('key').y).toBeGreaterThan(-50);
    expect(by('smoke').y).toBeLessThan(-50);
    expect(by('soul').y).toBeLessThan(-50);
    expect(Math.abs(by('spark').vx)).toBeLessThan(50);
  });
  it('particles expire after their life', () => {
    const c = pet();
    emit(c, 'spark', 0, 0, { max: 0.2 });
    for (let i = 0; i < 13; i++) stepFx(c, 1 / 60, i / 60);
    expect(c.fx.parts.length).toBe(0);
  });
  it('spray emits n particles fanned around a direction', () => {
    const c = pet();
    spray(c, 'confetti', 12, 0, -60, 150, -Math.PI / 2, Math.PI / 2);
    expect(c.fx.parts.length).toBe(12);
    expect(c.fx.parts.every(p => p.vy < 0)).toBe(true);
  });
  it('an impact asks for a flash and starts a shake at the pet clock', () => {
    const c = pet();
    fxState(c).t = 3.2;
    impact(c, 3);
    expect(c.fx.flashReq).toBe(1);
    expect(c.fx.shakeAt).toBe(3.2);
    expect(c.fx.shakeAmp).toBe(3);
    impact(c, 1, false);
    expect(c.fx.flashReq).toBe(1);
  });
  it('words rise and fade out', () => {
    const c = pet();
    word(c, 'バン', 0, -90);
    for (let i = 0; i < 30; i++) stepFx(c, 1 / 60, i / 60);
    expect(c.fx.words[0].y).toBeLessThan(-90);
    for (let i = 0; i < 120; i++) stepFx(c, 1 / 60, i / 60);
    expect(c.fx.words.length).toBe(0);
  });
  it('stepPet steps the effects and gives hooks the pet clock', () => {
    const c = pet();
    let seen = -1;
    c.act = ['t', 9, () => ({}), undefined, undefined, (_a: number, cc: any) => { seen = cc.fx.t; emit(cc, 'spark', 0, 0, { max: 1 }); }];
    c.aT = 0;
    stepPet(c, 0.1, 7);
    expect(seen).toBe(7);
    stepPet(c, 0.1, 7.1);
    expect(c.fx.parts[0].life).toBeCloseTo(0.2, 9);
  });
});
```

- [ ] **Step 2: Uruchom — RED**

Run: `pnpm --dir app exec vitest run src/renderer/anime/state.test.ts`
Expected: FAIL (brak `./state`).

- [ ] **Step 3: Implementacja** — `app/src/renderer/anime/state.ts`:

```ts
// Stan efektów Anime liczony w mózgu (spec 8.2): cząsteczki z własną fizyką i limitem, prośby o klatkę uderzenia,
// wstrząs, onomatopeje, ślad dłoni do smug. Rysuje `motion/fx`; tu nic nie dotyka płótna.
import type { FxEnv } from '../../motion/types';
import { PI } from '../math';
import { rng } from '../rng';
import type { Pet } from '../pet';

export type PKind = 'spark' | 'dust' | 'key' | 'page' | 'confetti' | 'bolt' | 'smoke' | 'energy' | 'note' | 'tear' | 'soul' | 'helper';
export interface Particle { k: PKind; x: number; y: number; vx: number; vy: number; rot: number; vr: number; life: number; max: number; s: number; col: string }
export interface Word { text: string; x: number; y: number; life: number; max: number; s: number }
export interface FxState {
  parts: Particle[]; words: Word[];
  /** prośba o klatkę uderzenia (decyduje `PetPainter`: limit 3/s, `reduced`) i pozostałe klatki błysku */
  flashReq: number; flashFrames: number; flashLog: number[];
  shakeAt: number; shakeAmp: number;
  /** ślad dłoni [x, y, czas] do smug (zapisuje `PetPainter` po narysowaniu modelu) */
  trail: [number, number, number][][];
  env: FxEnv; n: number; t: number;
  /** liczniki próśb (testy choreografii) */
  stats: Record<string, number>;
}

export const CAP = 40;
export const CONFETTI = ['#EF9F27', '#E24B4A', '#5DCAA5', '#85B7EB', '#7F77DD', '#F0997B'];
/** g: grawitacja (u/s², ujemna = unosi się), drag: opór (1/s), life: domyślny czas życia (s), s: rozmiar (u), col: kolor */
export const PHYS: Record<PKind, { g: number; drag: number; life: number; s: number; col: string }> = {
  spark: { g: 0, drag: 5, life: 0.35, s: 7, col: '#EF9F27' },
  dust: { g: -20, drag: 3, life: 0.6, s: 6, col: '#D3CFC4' },
  key: { g: 520, drag: 0.5, life: 0.9, s: 7, col: '#F1EFE8' },
  page: { g: 30, drag: 1.2, life: 1.4, s: 12, col: '#FAF9F5' },
  confetti: { g: 160, drag: 2.5, life: 1.6, s: 4, col: '#EF9F27' },
  bolt: { g: 0, drag: 0, life: 0.18, s: 26, col: '#F5D547' },
  smoke: { g: -30, drag: 2, life: 0.8, s: 9, col: '#E8E6E0' },
  energy: { g: 0, drag: 0, life: 0.5, s: 3, col: '#7F77DD' },
  note: { g: -10, drag: 0.5, life: 1.2, s: 12, col: '#D97757' },
  tear: { g: 300, drag: 0.3, life: 0.7, s: 4, col: '#85B7EB' },
  soul: { g: -8, drag: 0.2, life: 2.6, s: 8, col: '#FFFFFF' },
  helper: { g: 0, drag: 0, life: 1.6, s: 12, col: '#D97757' },
};
const FULL: FxEnv = { fx: true, bg: true, flash: true, shake: true, parts: 1 };

export function fxState(c: Pet): FxState {
  return c.fx ??= { parts: [], words: [], flashReq: 0, flashFrames: 0, flashLog: [], shakeAt: -Infinity, shakeAmp: 0, trail: [[], []], env: FULL, n: 0, t: 0, stats: {} };
}

const count = (s: FxState, k: string) => { s.stats[k] = (s.stats[k] ?? 0) + 1; };

export function emit(c: Pet, k: PKind, x: number, y: number, o: Partial<Particle> = {}): void {
  const s = fxState(c), ph = PHYS[k];
  count(s, k);
  if (s.env.parts < 1 && s.n++ % 2) return;
  const cap = Math.round(CAP * s.env.parts);
  while (s.parts.length >= cap) s.parts.shift();
  s.parts.push({ k, x, y, vx: 0, vy: 0, rot: rng() * PI * 2, vr: 0, life: 0, max: ph.life, s: ph.s, col: ph.col, ...o });
}

/** `n` cząsteczek wachlarzem wokół kierunku `dir` (radiany, 0 = w prawo, −π/2 = w górę). */
export function spray(c: Pet, k: PKind, n: number, x: number, y: number, speed: number, dir = -PI / 2, spread = PI): void {
  for (let i = 0; i < n; i++) {
    const a = dir + (rng() - 0.5) * spread, v = speed * (0.6 + 0.4 * rng());
    emit(c, k, x, y, { vx: Math.cos(a) * v, vy: Math.sin(a) * v, vr: (rng() - 0.5) * 16, col: k === 'confetti' ? CONFETTI[i % CONFETTI.length] : PHYS[k].col });
  }
}

/** Uderzenie: wstrząs o amplitudzie `amp` (u) i — gdy `flash` — prośba o klatkę uderzenia. */
export function impact(c: Pet, amp: number, flash = true): void {
  const s = fxState(c);
  count(s, 'impact');
  s.shakeAt = s.t; s.shakeAmp = amp;
  if (flash) s.flashReq = 1;
}

export function word(c: Pet, text: string, x: number, y: number, s = 30): void {
  const f = fxState(c);
  count(f, 'word:' + text);
  f.words = f.words.filter(w => w.text !== text || w.life > 0.3).slice(-2);
  f.words.push({ text, x, y, life: 0, max: 0.9, s });
}

export function stepFx(c: Pet, dt: number, t: number): void {
  const s = fxState(c);
  s.t = t;
  for (const p of s.parts) {
    const ph = PHYS[p.k], dr = Math.exp(-ph.drag * dt);
    p.life += dt; p.vx *= dr; p.vy = p.vy * dr + ph.g * dt;
    if (p.k === 'page' || p.k === 'confetti') p.vx += Math.sin(p.life * 8 + p.rot) * 60 * dt;
    if (p.k === 'soul') p.x += Math.sin(p.life * 4) * 12 * dt;
    p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt;
  }
  s.parts = s.parts.filter(p => p.life < p.max);
  for (const w of s.words) { w.life += dt; w.y -= 18 * dt; }
  s.words = s.words.filter(w => w.life < w.max);
}
```

`app/src/renderer/pet.ts` w `stepPet`: hak `if(c.act[5]){fxState(c).t=t;c.act[5](c.aT,c,t,dt);}` i zaraz potem `if(c.fx)stepFx(c,dt,t);` (import `fxState`, `stepFx` z `./anime/state`).

`app/src/renderer/testing.ts` — dopisz:

```ts
import { createPet, setMotion, type Pet } from './pet';
import { MOTIONS } from '../motion';
import { tick } from '../motion/tick';

/** Zwierzak w ruchu Anime liczony przez `tick` przy 60 kl./s przez `secs` sekund; `each` po każdym kroku. */
export function simulate(skin: 'clawd' | 'kodek', scene: string, secs: number, each?: (c: Pet, T: number) => void): Pet {
  const c = createPet(skin, scene);
  setMotion(c, true);
  let T = 0;
  for (let i = 0; i < Math.round(secs * 60); i++) { T += 1 / 60; tick(c, 1 / 60, T, MOTIONS.anime, true); each?.(c, T); }
  return c;
}
```

- [ ] **Step 4: Uruchom — GREEN**

Run: `pnpm --dir app exec vitest run src/renderer src/motion`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/src/renderer
git commit -m "feat(renderer): anime effect state (particles with physics and a per-pet cap, impacts, onomatopoeia)"
```

---

### Task 3: `PetPainter` z efektami: klatka uderzenia, wstrząs, rozciągnięcie, ślad dłoni, kotwica twarzy

**Files:**
- Create: `app/src/motion/fx/index.ts`
- Modify: `app/src/renderer/painter.ts`, `app/src/renderer/models/rig.ts`, `app/src/renderer/models/sticker.ts`, `app/src/renderer/models/pixel.ts`, `app/src/renderer/draw/body.ts`
- Test: `app/src/renderer/painter.test.ts`, `app/src/motion/fx/index.test.ts`

**Interfaces:**
- Consumes: `FxState`, `fxState`, `impact` (task 2), `effective`, `setMotion` (task 1), `gridPx` (`models/pixel.ts`)
- Produces:
  - `c.face: [x, y, gap]` — środek oczu i połowa rozstawu, w u względem `(XX, Y)` (jak `c.hand`), ustawiane przez każdy model
  - `interface FxCtx { X: number; Y: number; u: number; t: number; dpr: number; env: FxEnv; model: 'vector' | 'sticker' | 'pixel'; flash: boolean; accent: string; alpha: number }`
  - `flashFrame(s: FxState, now: number, env: FxEnv): boolean`, `FLASH_MAX = 3`
  - `shakeOffset(s: FxState, t: number, env: FxEnv, u: number, cell: number): [number, number]`
  - `stretchOf(c: Pet): number` (0…0,3)
  - `recordTrail(s: FxState, c: Pet, now: number): void`, `TRAIL_S = 0.12`
  - `drawFxBack(x, c, g)`, `drawFxFront(x, c, g)` — w tym tasku rozdzielacze, które nic nie rysują; wypełniają je taski 4 i 5

- [ ] **Step 1: Testy (RED)**

`app/src/motion/fx/index.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { createPet } from '../../renderer';
import { fxState } from '../../renderer/anime/state';
import { FLASH_MAX, TRAIL_S, flashFrame, recordTrail, shakeOffset, stretchOf } from './index';

const ENV = { fx: true, bg: true, flash: true, shake: true, parts: 1 };

describe('anime frame composition', () => {
  it('a flash lasts two frames and at most 3 start in any second', () => {
    const s = fxState(createPet('clawd', 'edit'));
    const starts: number[] = [];
    let prev = false;
    for (let f = 0; f < 300; f++) { // 5 s przy 60 kl./s, prośba co klatkę
      s.flashReq = 1;
      const on = flashFrame(s, f / 60, ENV);
      if (on && !prev) starts.push(f / 60);
      prev = on;
    }
    for (const a of starts) expect(starts.filter(b => b >= a && b < a + 1).length).toBeLessThanOrEqual(FLASH_MAX);
    expect(starts.length).toBeGreaterThanOrEqual(12);
  });
  it('reduced motion: no flash, no shake', () => {
    const s = fxState(createPet('clawd', 'edit'));
    const env = { ...ENV, flash: false, shake: false };
    s.flashReq = 1;
    expect(flashFrame(s, 1, env)).toBe(false);
    s.shakeAt = 1; s.shakeAmp = 4;
    expect(shakeOffset(s, 1.03, env, 0.3, 0)).toEqual([0, 0]);
  });
  it('the shake decays within 0.3 s and snaps to the pixel grid', () => {
    const s = fxState(createPet('clawd', 'edit'));
    s.shakeAt = 1; s.shakeAmp = 4;
    const [dx] = shakeOffset(s, 1.02, ENV, 1, 0);
    expect(Math.abs(dx)).toBeGreaterThan(0.5);
    expect(shakeOffset(s, 1.4, ENV, 1, 0)).toEqual([0, 0]);
    const [px, py] = shakeOffset(s, 1.02, ENV, 1, 2);
    expect(px % 2).toBe(0); expect(py % 2).toBe(0);
  });
  it('the body stretches only in fast horizontal motion', () => {
    const c = createPet('clawd', 'idle');
    c.p.lx.v = 0; expect(stretchOf(c)).toBe(0);
    c.p.lx.v = 600; expect(stretchOf(c)).toBeGreaterThan(0.2);
    c.p.lx.v = 5000; expect(stretchOf(c)).toBeLessThanOrEqual(0.3);
  });
  it('the hand trail keeps only the last 0.12 s', () => {
    const c = createPet('clawd', 'idle'), s = fxState(c);
    for (let f = 0; f < 30; f++) { c.hand = [[f, 0], [-f, 0]]; recordTrail(s, c, f / 60); }
    expect(s.trail[0].every(p => 29 / 60 - p[2] <= TRAIL_S + 1e-9)).toBe(true);
    expect(s.trail[0].at(-1)).toEqual([29, 0, 29 / 60]);
  });
});
```

`app/src/renderer/painter.test.ts` — dopisz:

```ts
  it('calm draws exactly like drawPet alone, even after anime', () => {
    setRng(seeded(4).next);
    const a = new PetPainter(createPet('clawd', 'edit'));
    a.frame(recorder().ctx, { ...frame, look: { style: 'clean', motion: 'anime' } });
    const n = a.pet.fx?.parts.length ?? 0;
    const r = recorder();
    a.frame(r.ctx, { ...frame, t0: 1.1, look: { style: 'clean', motion: 'calm' } });
    const d = recorder();
    drawPet(d.ctx, a.pet, frame.X, frame.Y, frame.u, a.pet.clk, { style: 'clean', motion: 'calm' });
    expect(r.log).toEqual(d.log);
    for (let f = 0; f < 60; f++) a.frame(recorder().ctx, { ...frame, t0: 1.2 + f / 30, look: { style: 'clean', motion: 'calm' } });
    expect(a.pet.fx?.parts.length ?? 0).toBeLessThanOrEqual(n);
  });
  it('an impact inverts the pet for its frame; reduced motion never does', () => {
    for (const reduced of [false, true]) {
      const p = new PetPainter(createPet('clawd', 'idle'));
      p.frame(recorder().ctx, { ...frame, look: { style: 'sticker', motion: 'anime' } });
      p.pet.fx.flashReq = 1;
      const r = recorder();
      p.frame(r.ctx, { ...frame, t0: 1.05, reduced, look: { style: 'sticker', motion: 'anime' } });
      expect(r.log.includes('filter=invert(1)'), `reduced ${reduced}`).toBe(!reduced);
    }
  });
  it('fast horizontal motion stretches vector and sticker pets, never pixel ones', () => {
    for (const style of ['clean', 'sticker', 'pixel'] as const) {
      const p = new PetPainter(createPet('clawd', 'idle'));
      p.frame(recorder().ctx, { ...frame, look: { style, motion: 'anime' } });
      p.pet.p.lx.v = 800;
      const r = recorder();
      p.frame(r.ctx, { ...frame, t0: 1.05, animate: false, look: { style, motion: 'anime' } });
      const sx = r.log.filter(l => l.startsWith('scale(')).map(l => +l.slice(6, -1).split(',')[0]);
      expect(sx.some(v => v > 1.1), style).toBe(style !== 'pixel');
    }
  });
  it('every model sets a finite face anchor at head height', () => {
    for (const style of ['clean', 'sticker', 'pixel'] as const) for (const skin of ['clawd', 'kodek'] as const) {
      const p = new PetPainter(createPet(skin, 'idle'));
      p.frame(recorder().ctx, { ...frame, look: { style, motion: 'anime' } });
      const [fx, fy, gap] = p.pet.face as number[];
      expect([fx, fy, gap].every(Number.isFinite), `${style}/${skin}`).toBe(true);
      expect(fy).toBeLessThan(-20); expect(fy).toBeGreaterThan(-90);
      expect(gap).toBeGreaterThan(4); expect(gap).toBeLessThan(30);
    }
  });
```

(importy: `drawPet` z `'./index'`.)

- [ ] **Step 2: Uruchom — RED**

Run: `pnpm --dir app exec vitest run src/motion/fx src/renderer/painter.test.ts`
Expected: FAIL (brak `motion/fx/index`, brak `c.face`, brak filtra i skali w malarzu).

- [ ] **Step 3: Implementacja**

`app/src/motion/fx/index.ts`:

```ts
// Składanie klatki Anime (spec 8.1–8.2): klatka uderzenia z limitem, wstrząs, rozciągnięcie ciała, ślad dłoni,
// rozdział rysowania efektów na model wektorowy i pikselowy.
import type { FxState } from '../../renderer/anime/state';
import { cl } from '../../renderer/math';
import type { Pet } from '../../renderer/pet';
import type { FxEnv } from '../types';

export interface FxCtx { X: number; Y: number; u: number; t: number; dpr: number; env: FxEnv; model: 'vector' | 'sticker' | 'pixel'; flash: boolean; accent: string; alpha: number }

export const FLASH_MAX = 3;
export const TRAIL_S = 0.12;

/**
 * Czy ta klatka jest klatką uderzenia: 2 klatki na uderzenie, najwyżej 3 uderzenia w ciągu sekundy (czas `now` = zegar sceny).
 * Prośby w trakcie błysku i bliżej niż 1/3 s od poprzedniego przepadają (błyski nie zlewają się w jeden długi).
 */
export function flashFrame(s: FxState, now: number, env: FxEnv): boolean {
  if (s.flashReq) {
    s.flashReq = 0;
    s.flashLog = s.flashLog.filter(v => now - v < 1 && v <= now);
    const last = s.flashLog.at(-1) ?? -Infinity;
    if (env.flash && s.flashFrames === 0 && s.flashLog.length < FLASH_MAX && now - last >= 1 / FLASH_MAX - 1e-9) { s.flashLog.push(now); s.flashFrames = 2; }
  }
  if (s.flashFrames > 0 && env.flash) { s.flashFrames--; return true; }
  s.flashFrames = 0;
  return false;
}

/** Przesunięcie wstrząsu w px; `cell` > 0 zaokrągla do komórki siatki pikselowej. */
export function shakeOffset(s: FxState, t: number, env: FxEnv, u: number, cell: number): [number, number] {
  const e = t - s.shakeAt;
  if (!env.shake || !(e >= 0 && e < 0.3)) return [0, 0];
  const a = s.shakeAmp * u * Math.exp(-e * 14), dx = a * Math.sin(e * 90), dy = a * 0.5 * Math.cos(e * 70);
  return cell > 0 ? [Math.round(dx / cell) * cell, Math.round(dy / cell) * cell] : [dx, dy];
}

/** Rozciągnięcie ciała w kierunku szybkiego ruchu poziomego (smuga zamiast duchów). */
export const stretchOf = (c: Pet) => cl((Math.abs(c.p.lx.v) - 150) / 1500, 0, 0.3);

export function recordTrail(s: FxState, c: Pet, now: number): void {
  const hands: number[][] = c.hand ?? [];
  hands.forEach((h, i) => {
    const tr = (s.trail[i] ??= []);
    tr.push([h[0], h[1], now]);
    while (tr.length && (now - tr[0][2] > TRAIL_S || tr[0][2] > now)) tr.shift();
    if (tr.length > 8) tr.splice(0, tr.length - 8);
  });
}

export function drawFxBack(_x: CanvasRenderingContext2D, _c: Pet, _g: FxCtx): void {}
export function drawFxFront(_x: CanvasRenderingContext2D, _c: Pet, _g: FxCtx): void {}
```

`app/src/renderer/painter.ts`:

```ts
import { MOTIONS, effective } from '../motion';
import { drawFxBack, drawFxFront, flashFrame, recordTrail, shakeOffset, stretchOf, type FxCtx } from '../motion/fx';
import { tick } from '../motion/tick';
import { ACCENT, STYLES } from '../styles';
import type { Look } from '../types';
import { fxState } from './anime/state';
import { drawPet } from './draw/body';
import { gridPx } from './models/pixel';
import { pen } from './pen';
import { setMotion, type Pet } from './pet';

export interface PaintFrame { dt: number; t0: number; X: number; Y: number; u: number; look: Look; animate: boolean; saving: boolean; reduced: boolean; dpr: number }

/**
 * Jedno wejście rysowania zwierzaka: zegar ruchu, model stylu i efekty Anime. Zawsze wprost na scenę,
 * bez warstwy poza ekranem i bez duchów (spec wyglądu v2, 3 i 8).
 */
export class PetPainter {
  constructor(readonly pet: Pet) {}

  frame(x: CanvasRenderingContext2D, f: PaintFrame): void {
    const pet = this.pet, base = MOTIONS[f.look.motion] ?? MOTIONS.calm, env = effective(base, f);
    setMotion(pet, base.fx);
    const t = tick(pet, f.dt, f.t0, base, f.animate);
    pen.dpr = f.dpr;
    if (!env.fx) { drawPet(x, pet, f.X, f.Y, f.u, t, f.look); return; }
    const st = STYLES[f.look.style] ?? STYLES.clean, s = fxState(pet), pixel = st.model === 'pixel';
    s.env = env;
    const flash = flashFrame(s, f.t0, env);
    const [dx, dy] = shakeOffset(s, t, env, f.u, pixel ? gridPx(f.u, f.dpr) / f.dpr : 0);
    const g: FxCtx = { X: f.X + dx, Y: f.Y + dy, u: f.u, t, dpr: f.dpr, env, model: st.model, flash, accent: ACCENT[pet.type], alpha: pet.alpha ?? 1 };
    drawFxBack(x, pet, g);
    const k = pixel ? 0 : stretchOf(pet);
    x.save();
    if (flash) x.filter = 'invert(1)';
    if (k > 0) { const cx = g.X + pet.p.lx.x * f.u, cy = g.Y - 35 * f.u; x.translate(cx, cy); x.scale(1 + k, 1 - k * 0.5); x.translate(-cx, -cy); }
    drawPet(x, pet, g.X, g.Y, f.u, t, f.look);
    x.restore();
    recordTrail(s, pet, f.t0);
    drawFxFront(x, pet, g);
  }
}
```

Kotwica twarzy `c.face = [x, y, gap]` (u, względem `(XX, Y)`, z przesunięciem skoku):
- `draw/body.ts` zaraz po `const ey=...,exs=...;`: `{const q=toW(fcx+exs,ey);c.face=[q[0]/u,q[1]/u,Math.max(4,sk.eyeX*W*Math.abs(co)/u)];}`
- `models/sticker.ts` po narysowaniu oczu (dla Clawda `fx ± W*.18` na `ey`, dla Kodka `fx ± W*.16` na `sy0 + sh*.45 + gaze`): `c.face = [fx * r.sx / u, (eyeY * r.sy + r.oy) / u, gap * r.sx / u]`, gdzie `eyeY`, `gap` to wartości użyte dla oczu danej skórki.
- `models/pixel.ts` w `build()` po wyliczeniu `fx`, `fy`, `eo`, `eW`, `eH`: `c.face = [(fx + .5) * g / u, (fy + eH / 2) * g / u, (eo + eW / 2) * g / u]` (komórki → u; ustawiane raz na krok 0,1 s, tak jak wygląd).

- [ ] **Step 4: Uruchom — GREEN**

Run: `pnpm --dir app exec vitest run src/motion src/renderer`
Expected: PASS (w tym parytet i test „no ghosts”).

- [ ] **Step 5: Commit**

```bash
git add app/src/motion/fx app/src/renderer
git commit -m "feat(renderer): anime frame composition (rate-limited impact frames, shake, body stretch, hand trail, face anchor in every model)"
```

---

### Task 4: Efekty wektorowe (modele `vector` i `sticker`)

**Files:**
- Create: `app/src/motion/fx/vector.ts`, `app/src/motion/fx/vector.test.ts`
- Modify: `app/src/motion/fx/index.ts` (rozdział: `pixel` → task 5, reszta → `vectorBack`/`vectorFront`)

**Interfaces:**
- Consumes: `FxCtx` (task 3), `FxState`, `Particle`, `PHYS` (task 2), `c.face`, `c.hand`, `c.tg`
- Produces: `vectorBack(x, c, g)`, `vectorFront(x, c, g)`; flagi celu, które rysuje (używane w taskach 6–9):
  - `_bg: 'speed' | 'rays' | 'purple' | 'wind' | 'dark'`, `_bgK` (0…1, domyślnie 1)
  - `_ground: 'seal' | 'circle'`, `_groundK` (0…1), `_groundX` (u, domyślnie 0)
  - `_face: 'glasses' | 'sharingan' | 'shadow' | 'sparkle' | 'teeth'`, `_faceK` (0…1), `_scan` (0…1, Sharingan), `_smile` (Light Yagami)
  - `_barrage` (wachlarz pięści), `_orbs: 1 | 2` + `_orbK`, `_thumb`, `_shock`, `_bang`, `_snot` (0…1), `_dream` (czas snu)
  - `SLOT = { w: 150, h: 140 }` (u)

- [ ] **Step 1: Testy (RED)** — `app/src/motion/fx/vector.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { createPet, pen, setRng } from '../../renderer';
import { PHYS, emit, fxState, word, type PKind } from '../../renderer/anime/state';
import { recorder, seeded } from '../../renderer/testing';
import type { FxCtx } from './index';
import { SLOT, vectorBack, vectorFront } from './vector';

setRng(seeded(2).next);
pen.font = 'x';
const ENV = { fx: true, bg: true, flash: true, shake: true, parts: 1 };
const G = (o: Partial<FxCtx> = {}): FxCtx => ({ X: 60, Y: 40, u: 0.3, t: 1, dpr: 1, env: ENV, model: 'vector', flash: false, accent: '#D97757', alpha: 1, ...o });
const pet = (tg: Record<string, unknown> = {}) => { const c = createPet('clawd', 'idle'); c.tg = { ...c.tg, ...tg }; c.face = [0, -45, 12]; c.hand = [[-30, -30], [30, -30]]; fxState(c); return c; };
const ok = (log: string[]) => { expect(log.some(l => l.includes('NaN'))).toBe(false); expect(log.filter(l => l === 'save()').length).toBe(log.filter(l => l === 'restore()').length); };

describe('vector anime effects', () => {
  it('every particle kind draws finite and balanced', () => {
    for (const k of Object.keys(PHYS) as PKind[]) {
      const c = pet(); emit(c, k, 10, -40, { vx: 30, vy: -20, life: 0.1 });
      const r = recorder(); vectorFront(r.ctx, c, G());
      expect(r.log.length, k).toBeGreaterThan(3); ok(r.log);
    }
  });
  it('onomatopoeia are at least 9 px in the taskbar', () => {
    const c = pet(); word(c, 'ドドド', 0, -90);
    const r = recorder(); vectorFront(r.ctx, c, G());
    const px = r.log.filter(l => l.startsWith('font=')).map(l => parseFloat(l.split(' ')[1]));
    expect(px.length).toBeGreaterThan(0);
    expect(Math.min(...px)).toBeGreaterThanOrEqual(9);
  });
  it('the action background is clipped to the pet slot and skipped in power saving', () => {
    for (const bg of ['speed', 'rays', 'purple', 'wind', 'dark']) {
      const r = recorder(); vectorBack(r.ctx, pet({ _bg: bg }), G());
      expect(SLOT).toEqual({ w: 150, h: 140 });
      expect(r.log, bg).toContain('rect(37.5,-0.5,45,42)'); // 150u × 140u wokół podstawy (60, 40) przy u = 0,3
      expect(r.log).toContain('clip()'); ok(r.log);
      const s = recorder(); vectorBack(s.ctx, pet({ _bg: bg }), G({ env: { ...ENV, bg: false } }));
      expect(s.log, bg).toEqual([]);
    }
  });
  it('an impact frame puts a white disc and radial lines behind the pet', () => {
    const r = recorder(); vectorBack(r.ctx, pet(), G({ flash: true }));
    expect(r.log).toContain('fillStyle=#FFFFFF');
    expect(r.log.filter(l => l.startsWith('moveTo(')).length).toBeGreaterThanOrEqual(12);
  });
  it('ground seals draw under the pet in their colour', () => {
    const r = recorder(); vectorBack(r.ctx, pet({ _ground: 'circle', _groundK: 1 }), G());
    expect(r.log.some(l => l.startsWith('ellipse('))).toBe(true); ok(r.log);
  });
  it('face overlays sit at the face anchor', () => {
    for (const face of ['glasses', 'sharingan', 'shadow', 'sparkle', 'teeth']) {
      const r = recorder(); vectorFront(r.ctx, pet({ _face: face, _faceK: 1, _smile: 1 }), G());
      const xs = r.log.filter(l => /^(arc|ellipse|moveTo|rect|fillRect)\(/.test(l)).map(l => +l.slice(l.indexOf('(') + 1).split(',')[0]);
      expect(xs.length, face).toBeGreaterThan(0);
      for (const v of xs) expect(Math.abs(v - 60), face).toBeLessThan(40 * 0.3 + 12);
      ok(r.log);
    }
  });
  it('a fast hand leaves a smear, a still one does not', () => {
    const still = pet(); still.fx.trail = [[[30, -30, 0.9], [30, -30, 1]], []];
    const a = recorder(); vectorFront(a.ctx, still, G());
    const fast = pet(); fast.fx.trail = [[[-10, -60, 0.9], [10, -40, 0.95], [30, -30, 1]], []];
    const b = recorder(); vectorFront(b.ctx, fast, G());
    expect(b.log.length).toBeGreaterThan(a.log.length);
    expect(b.log.some(l => l.startsWith('closePath('))).toBe(true);
  });
  it('a barrage fans at least 4 fists per hand', () => {
    const r = recorder(); vectorFront(r.ctx, pet({ _barrage: 1 }), G());
    expect(r.log.filter(l => l.startsWith('arc(')).length).toBeGreaterThanOrEqual(8);
  });
  it('orbs, thumb, shock lines, bouncing "!", snot bubble and dream bubble all draw', () => {
    for (const tg of [{ _orbs: 1 }, { _orbs: 2, _orbK: 0.5 }, { _thumb: 1 }, { _shock: 1 }, { _bang: 1 }, { _snot: 0.8 }, { _dream: 1.2 }]) {
      const r = recorder(); vectorFront(r.ctx, pet(tg), G());
      expect(r.log.length, JSON.stringify(tg)).toBeGreaterThan(3); ok(r.log);
    }
  });
});
```

- [ ] **Step 2: Uruchom — RED**

Run: `pnpm --dir app exec vitest run src/motion/fx/vector.test.ts`
Expected: FAIL (brak `./vector`).

- [ ] **Step 3: Implementacja** — `app/src/motion/fx/vector.ts`:

```ts
// Efekty Anime dla modeli wektorowego i naklejki: tło akcji, krąg na ziemi, błysk za zwierzakiem (tył);
// cząsteczki, smugi, wachlarz pięści, nakładki twarzy, kule, onomatopeje (przód). Tylko geometria bieżącej klatki.
import { PI, TAU, cl, hr } from '../../renderer/math';
import { pen } from '../../renderer/pen';
import type { Particle } from '../../renderer/anime/state';
import type { Pet } from '../../renderer/pet';
import type { FxCtx } from './index';

export const SLOT = { w: 150, h: 140 };
const AMBER = '#EF9F27', WHITE = '#FFFFFF', RED = '#E24B4A', BLUE = '#5B8DEF', PURPLE = '#7F77DD', TEAL = '#5DCAA5';

const rays = (x: CanvasRenderingContext2D, cx: number, cy: number, r0: number, r1: number, n: number, seed: number) => {
  x.beginPath();
  for (let i = 0; i < n; i++) {
    const a = TAU * (i + hr(i + seed) * 0.6) / n, k = 0.8 + 0.4 * hr(i * 3.1 + seed);
    x.moveTo(cx + Math.cos(a) * r0 * k, cy + Math.sin(a) * r0 * k); x.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1);
  }
  x.stroke();
};

export function vectorBack(x: CanvasRenderingContext2D, c: Pet, g: FxCtx): void {
  const tg = c.tg || {}, u = g.u, XX = g.X + c.p.lx.x * u, Y = g.Y;
  const bg = g.env.bg ? tg._bg : null, gr = tg._ground && cl(tg._groundK ?? 1) > 0.02 ? tg._ground : null;
  if (!bg && !gr && !g.flash) return;
  x.save();
  x.globalAlpha = g.alpha;
  x.beginPath(); x.rect(XX - 75 * u, Y - 135 * u, SLOT.w * u, SLOT.h * u); x.clip();
  const cx = XX, cy = Y - 40 * u, seed = Math.floor(g.t * 12), k = cl(tg._bgK ?? 1);
  x.lineCap = 'round';
  if (g.flash) {
    x.fillStyle = WHITE; x.beginPath(); x.arc(cx, cy, 70 * u, 0, TAU); x.fill();
    x.strokeStyle = pen.ol; x.lineWidth = Math.max(1, 2 * u); rays(x, cx, cy, 34 * u, 78 * u, 14, seed);
  } else if (bg === 'speed' || bg === 'purple' || bg === 'dark') {
    x.globalAlpha = g.alpha * k * (bg === 'dark' ? 0.5 : 0.35);
    x.strokeStyle = bg === 'purple' ? PURPLE : bg === 'dark' ? '#3B2A4A' : pen.ol; x.lineWidth = Math.max(1, 1.6 * u);
    rays(x, cx, cy, 52 * u, 80 * u, 18, seed);
  } else if (bg === 'rays') {
    x.globalAlpha = g.alpha * k * 0.3; x.fillStyle = AMBER;
    for (let i = 0; i < 10; i++) { const a = TAU * i / 10 + g.t * 0.3; x.beginPath(); x.moveTo(cx, cy); x.arc(cx, cy, 90 * u, a, a + TAU / 20); x.closePath(); x.fill(); }
  } else if (bg === 'wind') {
    x.globalAlpha = g.alpha * k * 0.4; x.strokeStyle = pen.ol; x.lineWidth = Math.max(1, 1.4 * u); x.beginPath();
    for (let i = 0; i < 6; i++) { const yy = cy - 40 * u + i * 14 * u, off = ((g.t * 160 + i * 37) % 150) * u; x.moveTo(XX - 75 * u + off, yy); x.lineTo(XX - 75 * u + off + 22 * u, yy); }
    x.stroke();
  }
  if (gr) {
    const gx = XX + (tg._groundX ?? 0) * u, col = gr === 'seal' ? RED : TEAL, gk = cl(tg._groundK ?? 1);
    x.globalAlpha = g.alpha * gk; x.strokeStyle = col; x.lineWidth = Math.max(1, 1.8 * u);
    for (const r of [34, 26]) { x.beginPath(); x.ellipse(gx, Y, r * u, r * 0.26 * u, 0, 0, TAU); x.stroke(); }
    x.beginPath();
    for (let i = 0; i < 8; i++) { const a = TAU * i / 8 + g.t * (gr === 'seal' ? 1 : -2); x.moveTo(gx + Math.cos(a) * 26 * u, Y + Math.sin(a) * 6.8 * u); x.lineTo(gx + Math.cos(a) * 34 * u, Y + Math.sin(a) * 8.8 * u); }
    x.stroke();
  }
  x.restore();
}

function particle(x: CanvasRenderingContext2D, p: Particle, u: number, XX: number, Y: number) {
  const k = p.life / p.max, px = XX + p.x * u, py = Y + p.y * u, s = p.s * u;
  x.save(); x.globalAlpha *= 1 - k * k; x.translate(px, py); x.fillStyle = p.col; x.strokeStyle = pen.ol; x.lineWidth = Math.max(0.8, 1.2 * u);
  switch (p.k) {
    case 'spark': { const r = s * (1 - k * 0.6); x.strokeStyle = p.col; x.lineWidth = Math.max(1, 1.8 * u); x.beginPath(); x.moveTo(-r, 0); x.lineTo(r, 0); x.moveTo(0, -r); x.lineTo(0, r); x.stroke(); break; }
    case 'dust': case 'smoke': x.beginPath(); x.arc(0, 0, s * (0.6 + k), 0, TAU); x.fill(); if (p.k === 'smoke') { x.strokeStyle = '#B4B2A9'; x.stroke(); } break;
    case 'key': x.rotate(p.rot); x.beginPath(); x.rect(-s / 2, -s / 2, s, s); x.fill(); x.stroke(); x.fillStyle = '#B4B2A9'; x.fillRect(-s / 4, -s / 4, s / 2, s / 2); break;
    case 'page': x.rotate(p.rot); x.scale(Math.cos(p.life * 7), 1); x.beginPath(); x.rect(-s * 0.4, -s / 2, s * 0.8, s); x.fill(); x.stroke();
      x.beginPath(); for (let i = 0; i < 3; i++) { x.moveTo(-s * 0.25, -s * 0.25 + i * s * 0.25); x.lineTo(s * 0.25, -s * 0.25 + i * s * 0.25); } x.strokeStyle = '#B4B2A9'; x.stroke(); break;
    case 'confetti': x.rotate(p.rot); x.fillRect(-s * 0.3, -s * 0.6, s * 0.6, s * 1.2); break;
    case 'bolt': { x.rotate(p.rot); x.strokeStyle = p.col; x.lineWidth = Math.max(1.2, 2.4 * u); x.beginPath(); x.moveTo(0, 0);
      for (let i = 1; i <= 4; i++) x.lineTo(s * i / 4, (i % 2 ? -1 : 1) * s * 0.18); x.stroke(); x.strokeStyle = WHITE; x.lineWidth = Math.max(0.6, u); x.stroke(); break; }
    case 'energy': x.beginPath(); x.arc(0, 0, s, 0, TAU); x.fill(); x.globalAlpha *= 0.4; x.beginPath(); x.arc(0, 0, s * 2, 0, TAU); x.fill(); break;
    case 'note': x.font = `${Math.max(9, s)}px ${pen.font}`; x.textAlign = 'center'; x.fillText('♪', 0, 0); break;
    case 'tear': x.beginPath(); x.moveTo(0, -s); x.quadraticCurveTo(s * 0.9, s * 0.3, 0, s * 0.6); x.quadraticCurveTo(-s * 0.9, s * 0.3, 0, -s); x.fill(); x.stroke(); break;
    case 'soul': x.globalAlpha *= 0.85; x.beginPath(); x.arc(0, 0, s, PI, 0); x.lineTo(s, s * 1.2); x.quadraticCurveTo(0, s * (0.8 + 0.3 * Math.sin(p.life * 9)), -s, s * 1.2); x.closePath(); x.fill(); x.strokeStyle = '#B4B2A9'; x.stroke();
      x.fillStyle = pen.ol; x.fillRect(-s * 0.4, -s * 0.2, s * 0.18, s * 0.3); x.fillRect(s * 0.22, -s * 0.2, s * 0.18, s * 0.3); break;
    case 'helper': { const hop = Math.abs(Math.sin(p.life * 18)) * 3 * u; x.fillStyle = p.col; x.beginPath(); x.rect(-s / 2, -s * 0.75 - hop, s, s * 0.75); x.fill(); x.stroke();
      x.beginPath(); for (const lx of [-0.25, 0.25]) { const sw = Math.sin(p.life * 18 + lx * 9) * 2 * u; x.moveTo(lx * s, -hop); x.lineTo(lx * s + sw, 0); } x.stroke(); break; }
  }
  x.restore();
}

function smear(x: CanvasRenderingContext2D, tr: [number, number, number][], u: number, XX: number, Y: number, col: string) {
  if (tr.length < 2) return;
  const a = tr[0], b = tr[tr.length - 1], d = Math.hypot(b[0] - a[0], b[1] - a[1]), span = b[2] - a[2];
  if (span <= 0 || d / span < 150) return;
  const nx = -(b[1] - a[1]) / d, ny = (b[0] - a[0]) / d;
  x.save(); x.globalAlpha *= 0.45; x.fillStyle = col; x.beginPath();
  tr.forEach((p, i) => { const w = 6 * u * i / (tr.length - 1); const px = XX + p[0] * u + nx * w, py = Y + p[1] * u + ny * w; if (i) x.lineTo(px, py); else x.moveTo(px, py); });
  for (let i = tr.length - 1; i >= 0; i--) { const p = tr[i], w = 6 * u * i / (tr.length - 1); x.lineTo(XX + p[0] * u - nx * w, Y + p[1] * u - ny * w); }
  x.closePath(); x.fill(); x.restore();
}

function face(x: CanvasRenderingContext2D, c: Pet, g: FxCtx, XX: number, Y: number) {
  const tg = c.tg || {}, u = g.u, kind = tg._face, K = cl(tg._faceK ?? 1);
  const [fx0, fy0, gp] = (c.face as number[]) ?? [0, -45, 12], fx = XX + fx0 * u, fy = Y + fy0 * u, gap = gp * u;
  x.save(); x.globalAlpha *= K; x.lineWidth = Math.max(1, 1.6 * u); x.strokeStyle = pen.ol;
  if (kind === 'glasses') {
    for (const s of [-1, 1]) { x.beginPath(); x.arc(fx + s * gap, fy, 7 * u, 0, TAU); x.stroke(); }
    x.beginPath(); x.moveTo(fx - gap + 7 * u, fy); x.lineTo(fx + gap - 7 * u, fy); x.stroke();
    const gl = (g.t * 1.2) % 1;
    if (gl < 0.3) { x.strokeStyle = WHITE; x.lineWidth = Math.max(1, 2 * u); x.beginPath(); for (const s of [-1, 1]) { const o = (gl / 0.3 - 0.5) * 10 * u; x.moveTo(fx + s * gap + o - 3 * u, fy + 4 * u); x.lineTo(fx + s * gap + o + 3 * u, fy - 4 * u); } x.stroke(); }
  } else if (kind === 'sharingan') {
    const r = 14 * u * (0.5 + 0.5 * K), cy = fy - 4 * u;
    x.fillStyle = WHITE; x.beginPath(); x.ellipse(fx, cy, r * 1.5, r, 0, 0, TAU); x.fill(); x.stroke();
    x.fillStyle = RED; x.beginPath(); x.arc(fx, cy, r * 0.8, 0, TAU); x.fill(); x.stroke();
    x.fillStyle = pen.ol; x.beginPath(); x.arc(fx, cy, r * 0.22, 0, TAU); x.fill();
    for (let i = 0; i < 3; i++) { const a = g.t * 6 + TAU * i / 3; x.beginPath(); x.arc(fx + Math.cos(a) * r * 0.5, cy + Math.sin(a) * r * 0.5, r * 0.13, 0, TAU); x.fill(); }
    x.strokeStyle = RED; x.globalAlpha *= 0.6; x.beginPath(); const sy = cy - r + 2 * r * cl(tg._scan ?? 0); x.moveTo(fx - r * 1.5, sy); x.lineTo(fx + r * 1.5, sy); x.stroke();
  } else if (kind === 'shadow') {
    x.fillStyle = 'rgba(24,14,20,0.85)'; x.fillRect(fx - gap * 2.2, fy - 10 * u, gap * 4.4, 13 * u);
    x.fillStyle = RED; for (const s of [-1, 1]) x.fillRect(fx + s * gap - 1.5 * u, fy - 2 * u, 3 * u, 1.6 * u);
    if (tg._smile) { x.lineWidth = Math.max(1.2, 2.2 * u); x.beginPath(); x.arc(fx, fy + 4 * u, 9 * u, 0.15 * PI, 0.85 * PI); x.stroke(); }
  } else if (kind === 'sparkle') {
    for (const s of [-1, 1]) {
      x.fillStyle = '#1E1410'; x.beginPath(); x.ellipse(fx + s * gap, fy, 6 * u, 8 * u, 0, 0, TAU); x.fill();
      x.fillStyle = WHITE; x.beginPath(); x.arc(fx + s * gap + 2 * u, fy - 3 * u, 2.4 * u, 0, TAU); x.fill();
      x.beginPath(); x.arc(fx + s * gap - 2 * u, fy + 3 * u, 1.2 * u, 0, TAU); x.fill();
    }
  } else if (kind === 'teeth') {
    x.fillStyle = WHITE; x.beginPath(); x.rect(fx - 6 * u, fy + 7 * u, 12 * u, 4 * u); x.fill(); x.stroke();
    const tw = 0.6 + 0.4 * Math.abs(Math.sin(g.t * 9)), sx = fx + 10 * u, sy = fy + 6 * u;
    x.strokeStyle = AMBER; x.lineWidth = Math.max(1, 1.8 * u); x.beginPath(); x.moveTo(sx - 5 * u * tw, sy); x.lineTo(sx + 5 * u * tw, sy); x.moveTo(sx, sy - 5 * u * tw); x.lineTo(sx, sy + 5 * u * tw); x.stroke();
  }
  x.restore();
}

export function vectorFront(x: CanvasRenderingContext2D, c: Pet, g: FxCtx): void {
  const tg = c.tg || {}, s = c.fx, u = g.u, XX = g.X + c.p.lx.x * u, Y = g.Y;
  if (!s) return;
  const hands: number[][] = c.hand ?? [];
  const [fx0, fy0] = (c.face as number[]) ?? [0, -45], fx = XX + fx0 * u, fy = Y + fy0 * u;
  x.save(); x.globalAlpha = g.alpha; x.lineCap = 'round'; x.lineJoin = 'round';
  s.trail.forEach(tr => smear(x, tr, u, XX, Y, g.accent));
  if (tg._barrage) hands.forEach(([hx, hy], i) => {
    for (let k = 1; k <= 4; k++) {
      const px = XX + (hx + Math.sin(g.t * 37 + k * 1.9 + i) * 9) * u, py = Y + (hy - k * 6) * u;
      x.save(); x.globalAlpha *= 0.55 - k * 0.1; x.fillStyle = g.accent; x.strokeStyle = pen.ol; x.lineWidth = Math.max(0.8, 1.2 * u);
      x.beginPath(); x.arc(px, py, 5.5 * u, 0, TAU); x.fill(); x.stroke(); x.restore();
    }
  });
  if (tg._orbs === 1 && hands.length === 2) {
    [[hands[0], BLUE], [hands[1], RED]].forEach(([h, col]) => { const [hx, hy] = h as number[]; x.fillStyle = col as string;
      x.save(); x.globalAlpha *= 0.35; x.beginPath(); x.arc(XX + hx * u, Y + (hy - 4) * u, 10 * u, 0, TAU); x.fill(); x.restore();
      x.beginPath(); x.arc(XX + hx * u, Y + (hy - 4) * u, 6 * u, 0, TAU); x.fill(); });
  } else if (tg._orbs === 2) {
    const r = (4 + 10 * cl(tg._orbK ?? 1)) * u; x.fillStyle = PURPLE;
    x.save(); x.globalAlpha *= 0.35; x.beginPath(); x.arc(XX, Y - 50 * u, r * 1.6, 0, TAU); x.fill(); x.restore();
    x.beginPath(); x.arc(XX, Y - 50 * u, r, 0, TAU); x.fill(); x.strokeStyle = WHITE; x.lineWidth = Math.max(1, 1.4 * u); x.stroke();
  }
  if (tg._thumb && hands[1]) { const [hx, hy] = hands[1]; x.fillStyle = g.accent; x.strokeStyle = pen.ol; x.lineWidth = Math.max(0.8, 1.2 * u);
    x.beginPath(); x.rect(XX + (hx - 1.5) * u, Y + (hy - 12) * u, 3.5 * u, 8 * u); x.fill(); x.stroke(); }
  face(x, c, g, XX, Y);
  if (tg._snot != null) { const r = (2 + 8 * cl(tg._snot)) * u, bx = fx + 4 * u + r * 0.6, by = fy + 8 * u;
    x.fillStyle = 'rgba(170,220,255,0.5)'; x.strokeStyle = '#85B7EB'; x.lineWidth = Math.max(0.8, 1.2 * u);
    x.beginPath(); x.arc(bx, by, r, 0, TAU); x.fill(); x.stroke(); x.fillStyle = WHITE; x.beginPath(); x.arc(bx - r * 0.35, by - r * 0.35, r * 0.2, 0, TAU); x.fill(); }
  if (tg._dream != null) { const cx = XX + 38 * u, cy = Y - 104 * u; x.fillStyle = WHITE; x.strokeStyle = pen.ol; x.lineWidth = Math.max(0.8, 1.2 * u);
    for (const [ox, oy, r] of [[-8, 2, 9], [0, -3, 11], [9, 1, 9]]) { x.beginPath(); x.arc(cx + ox * u, cy + oy * u, r * u, 0, TAU); x.fill(); x.stroke(); }
    for (const [ox, oy, r] of [[-22, 18, 2.5], [-28, 26, 1.6]]) { x.beginPath(); x.arc(cx + ox * u, cy + oy * u, r * u, 0, TAU); x.fill(); x.stroke(); }
    const ph = (tg._dream * 0.8) % 1, jx = cx + (-10 + 20 * ph) * u, jy = cy + 4 * u - Math.sin(ph * PI) * 8 * u;
    x.beginPath(); x.moveTo(cx, cy + 6 * u); x.lineTo(cx, cy); x.stroke();
    x.fillStyle = g.accent; x.beginPath(); x.rect(jx - 3 * u, jy - 4 * u, 6 * u, 4 * u); x.fill(); x.stroke(); }
  if (tg._shock) { x.strokeStyle = pen.ol; x.lineWidth = Math.max(1, 1.6 * u); x.beginPath();
    for (let i = 0; i < 6; i++) { const a = -PI * (0.1 + 0.8 * i / 5), j = Math.floor(g.t * 12) % 2 ? 2 : 0; x.moveTo(fx + Math.cos(a) * (24 + j) * u, fy - 14 * u + Math.sin(a) * (24 + j) * u); x.lineTo(fx + Math.cos(a) * (32 + j) * u, fy - 14 * u + Math.sin(a) * (32 + j) * u); }
    x.stroke(); }
  for (const p of s.parts) particle(x, p, u, XX, Y);
  if (tg._bang) { const yy = fy - 30 * u - Math.abs(Math.sin(g.t * 8)) * 8 * u;
    x.fillStyle = AMBER; x.strokeStyle = pen.ol; x.lineWidth = Math.max(1, 2 * u); x.font = `900 ${Math.max(12, 34 * u)}px ${pen.font}`; x.textAlign = 'center'; x.textBaseline = 'bottom';
    x.strokeText('!', fx + 34 * u, yy); x.fillText('!', fx + 34 * u, yy); }
  for (const w of s.words) {
    const pop = w.life < 0.08 ? 1.4 - w.life * 5 : 1, fade = w.life > w.max * 0.7 ? (w.max - w.life) / (w.max * 0.3) : 1;
    x.save(); x.globalAlpha *= fade; x.font = `900 ${Math.max(9, w.s * u * pop)}px ${pen.font}`; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.lineWidth = Math.max(1.5, 3 * u); x.strokeStyle = pen.ol; x.strokeText(w.text, XX + w.x * u, Y + w.y * u);
    x.fillStyle = AMBER; x.fillText(w.text, XX + w.x * u, Y + w.y * u); x.restore();
  }
  x.restore();
}
```

`app/src/motion/fx/index.ts` — rozdzielacze:

```ts
import { vectorBack, vectorFront } from './vector';
export function drawFxBack(x: CanvasRenderingContext2D, c: Pet, g: FxCtx): void { if (g.env.fx && g.model !== 'pixel') vectorBack(x, c, g); }
export function drawFxFront(x: CanvasRenderingContext2D, c: Pet, g: FxCtx): void { if (g.env.fx && g.model !== 'pixel') vectorFront(x, c, g); }
```

- [ ] **Step 4: Uruchom — GREEN**

Run: `pnpm --dir app exec vitest run src/motion src/renderer`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/src/motion/fx
git commit -m "feat(motion): vector anime effects (slot-clipped action backgrounds, ground seals, impact backdrop, particles, smears, fist fans, face overlays, onomatopoeia)"
```

---

### Task 5: Efekty na siatce pikselowej i bitmapowa czcionka onomatopei

**Files:**
- Create: `app/src/motion/fx/pixel.ts`, `app/src/motion/fx/glyphs.ts`, `app/src/motion/fx/pixel.test.ts`
- Modify: `app/src/motion/fx/index.ts` (gałąź `pixel`)

**Interfaces:**
- Consumes: `FxCtx`, flagi celu z tasku 4, `gridPx` (`models/pixel.ts`), `WORDS` (task 1)
- Produces: `pixelBack(x, c, g)`, `pixelFront(x, c, g)`; `GLYPHS: Record<string, string[]>` (7 wierszy, `#` = piksel), `glyphWidth(ch)`

- [ ] **Step 1: Testy (RED)** — `app/src/motion/fx/pixel.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { createPet, setRng } from '../../renderer';
import { WORDS } from '../../renderer/anime/kit';
import { PHYS, emit, fxState, word, type PKind } from '../../renderer/anime/state';
import { recorder, seeded } from '../../renderer/testing';
import { GLYPHS } from './glyphs';
import type { FxCtx } from './index';
import { pixelBack, pixelFront } from './pixel';

setRng(seeded(2).next);
const ENV = { fx: true, bg: true, flash: true, shake: true, parts: 1 };
const G = (dpr: number, o: Partial<FxCtx> = {}): FxCtx => ({ X: 61.3, Y: 40.2, u: 0.3, t: 1.37, dpr, env: ENV, model: 'pixel', flash: false, accent: '#D97757', alpha: 1, ...o });
const TGS: Record<string, unknown>[] = [
  { _bg: 'speed' }, { _bg: 'rays' }, { _bg: 'purple' }, { _bg: 'wind' }, { _bg: 'dark' }, { _ground: 'seal' }, { _ground: 'circle', _groundK: 0.6 },
  { _face: 'glasses' }, { _face: 'sharingan', _scan: 0.4 }, { _face: 'shadow', _smile: 1 }, { _face: 'sparkle' }, { _face: 'teeth' },
  { _barrage: 1 }, { _orbs: 1 }, { _orbs: 2, _orbK: 0.4 }, { _thumb: 1 }, { _shock: 1 }, { _bang: 1 }, { _snot: 0.7 }, { _dream: 2 },
];
const pet = (tg: Record<string, unknown>) => {
  const c = createPet('clawd', 'idle'); c.tg = { ...c.tg, ...tg }; c.face = [1.3, -44.7, 12.2]; c.hand = [[-31.4, -29.6], [29.2, -33.3]]; fxState(c);
  for (const k of Object.keys(PHYS) as PKind[]) emit(c, k, 10.3, -40.7, { life: 0.13 });
  for (const w of WORDS) word(c, w, 3.3, -91.1);
  c.fx.trail = [[[-10, -60, 1.2], [10, -40, 1.3], [30, -30, 1.37]], []];
  return c;
};

describe('pixel anime effects', () => {
  it('only integer device-pixel rectangles for every effect at 100/125/150 %', () => {
    for (const dpr of [1, 1.25, 1.5]) for (const tg of TGS) for (const flash of [false, true]) {
      const r = recorder(), c = pet(tg);
      pixelBack(r.ctx, c, G(dpr, { flash })); pixelFront(r.ctx, c, G(dpr, { flash }));
      const tag = `${JSON.stringify(tg)}@${dpr}`;
      expect(r.log.some(l => /^(moveTo|lineTo|arc|ellipse|quadraticCurveTo|fillText|strokeText|drawImage|stroke|fill)\(/.test(l)), tag).toBe(false);
      expect(r.log.some(l => l.startsWith('fillRect(')), tag).toBe(true);
      for (const l of r.log.filter(v => v.startsWith('fillRect('))) for (const v of l.slice(9, -1).split(',').map(Number))
        expect(Math.abs(v * dpr - Math.round(v * dpr)), `${tag}: ${l}`).toBeLessThan(2e-3);
      expect(r.log.filter(l => l === 'save()').length).toBe(r.log.filter(l => l === 'restore()').length);
    }
  });
  it('the bitmap font has every character the scenes use, 7 rows each', () => {
    for (const w of WORDS) for (const ch of w) { expect(GLYPHS[ch], ch).toBeDefined(); expect(GLYPHS[ch].length).toBe(7); }
  });
  it('onomatopoeia are at least 9 device px tall in the taskbar', () => {
    const c = createPet('clawd', 'idle'); fxState(c); word(c, 'バン', 0, -90);
    const r = recorder(); pixelFront(r.ctx, c, G(1));
    const ys = r.log.filter(l => l.startsWith('fillRect(')).map(l => l.slice(9, -1).split(',').map(Number)).map(v => [v[1], v[1] + v[3]]);
    expect(Math.max(...ys.map(v => v[1])) - Math.min(...ys.map(v => v[0]))).toBeGreaterThanOrEqual(9);
  });
  it('power saving skips the action background on the grid too', () => {
    const r = recorder(); pixelBack(r.ctx, pet({ _bg: 'speed' }), G(1, { env: { ...ENV, bg: false } }));
    expect(r.log).toEqual([]);
  });
});
```

- [ ] **Step 2: Uruchom — RED**

Run: `pnpm --dir app exec vitest run src/motion/fx/pixel.test.ts`
Expected: FAIL (brak `./pixel`, `./glyphs`).

- [ ] **Step 3: Implementacja**

`app/src/motion/fx/glyphs.ts`:

```ts
// Bitmapowa czcionka onomatopei modelu pikselowego: 7 wierszy, szerokość wg najdalszego piksela, odstęp 1 komórka.
export const GLYPHS: Record<string, string[]> = {
  'ド': ['.#..##', '.#....', '.###..', '.#..#.', '.#....', '.#....', '.#....'],
  'ゴ': ['....##', '####..', '...#..', '...#..', '...#..', '####..', '......'],
  'バ': ['....##', '.#.#..', '.#..#.', '#...#.', '#....#', '#....#', '......'],
  'ボ': ['..#.##', '#####.', '..#...', '.###..', '#.#.#.', '..#...', '..#...'],
  'ン': ['#.....', '.#...#', '.....#', '....#.', '...#..', '.##...', '#.....'],
  'シ': ['##...#', '.....#', '##..#.', '....#.', '...#..', '..#...', '##....'],
  'ュ': ['......', '......', '.###..', '...#..', '...#..', '#####.', '......'],
  'ッ': ['......', '......', '#.#.#.', '#.#.#.', '....#.', '...#..', '.##...'],
  'N': ['#...#', '##..#', '#.#.#', '#..##', '#...#', '#...#', '#...#'],
  'I': ['###', '.#.', '.#.', '.#.', '.#.', '.#.', '###'],
  'C': ['.###.', '#...#', '#....', '#....', '#....', '#...#', '.###.'],
  'E': ['#####', '#....', '#....', '####.', '#....', '#....', '#####'],
  '!': ['#', '#', '#', '#', '#', '.', '#'],
};
export const glyphWidth = (ch: string) => Math.max(...(GLYPHS[ch] ?? ['#']).map(r => r.lastIndexOf('#') + 1));
```

`app/src/motion/fx/pixel.ts`:

```ts
// Efekty Anime na siatce modelu pikselowego (spec 8.2 + 6): te same warstwy co wektorowe, ale każda figura to
// komórki siatki — linie Bresenhamem, koła i elipsy na komórkach, cząsteczki i słowa jako bitmapy.
import { PI, TAU, cl, hr } from '../../renderer/math';
import { gridPx } from '../../renderer/models/pixel';
import { pen } from '../../renderer/pen';
import type { Particle } from '../../renderer/anime/state';
import type { Pet } from '../../renderer/pet';
import { GLYPHS, glyphWidth } from './glyphs';
import type { FxCtx } from './index';

const AMBER = '#EF9F27', WHITE = '#FFFFFF', RED = '#E24B4A', BLUE = '#5B8DEF', PURPLE = '#7F77DD', TEAL = '#5DCAA5', GREY = '#B4B2A9';

/** Siatka: komórka `g` px (całkowite piksele urządzenia), początek przyciągnięty do piksela urządzenia. */
function grid(x: CanvasRenderingContext2D, g: FxCtx, c: Pet) {
  const G = gridPx(g.u, g.dpr) / g.dpr, snap = (v: number) => Math.round(v * g.dpr) / g.dpr;
  const X0 = snap(g.X + c.p.lx.x * g.u), Y0 = snap(g.Y), U = (v: number) => Math.round(v * g.u / G);
  const cell = (cx: number, cy: number, w: number, h: number, col: string) => { if (w > 0 && h > 0) { x.fillStyle = col; x.fillRect(X0 + cx * G, Y0 + cy * G, w * G, h * G); } };
  const line = (x0: number, y0: number, x1: number, y1: number, col: string) => {
    let dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), e = dx + dy, n = 0; const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    for (;;) { cell(x0, y0, 1, 1, col); if ((x0 === x1 && y0 === y1) || n++ > 400) break; const e2 = 2 * e; if (e2 >= dy) { e += dy; x0 += sx; } if (e2 <= dx) { e += dx; y0 += sy; } }
  };
  const ring = (cx: number, cy: number, rx: number, ry: number, col: string, fill = false) => {
    for (let j = -ry; j <= ry; j++) { const w = Math.round(rx * Math.sqrt(Math.max(0, 1 - (j / (ry || 1)) ** 2)));
      if (fill) cell(cx - w, cy + j, 2 * w + 1, 1, col); else { cell(cx - w, cy + j, 1, 1, col); cell(cx + w, cy + j, 1, 1, col); } }
    if (!fill) for (let i = -rx; i <= rx; i++) { const h = Math.round(ry * Math.sqrt(Math.max(0, 1 - (i / (rx || 1)) ** 2))); cell(cx + i, cy - h, 1, 1, col); cell(cx + i, cy + h, 1, 1, col); }
  };
  return { G, U, cell, line, ring };
}

export function pixelBack(x: CanvasRenderingContext2D, c: Pet, g: FxCtx): void {
  const tg = c.tg || {}, bg = g.env.bg ? tg._bg : null, gr = tg._ground && cl(tg._groundK ?? 1) > 0.02 ? tg._ground : null;
  if (!bg && !gr && !g.flash) return;
  const { U, cell, line, ring } = grid(x, g, c), cy = U(-40), seed = Math.floor(g.t * 12);
  x.save(); x.globalAlpha = g.alpha;
  const rays = (n: number, r0: number, r1: number, col: string) => { for (let i = 0; i < n; i++) { const a = TAU * (i + hr(i + seed) * 0.6) / n;
    line(Math.round(Math.cos(a) * U(r0)), cy + Math.round(Math.sin(a) * U(r0) * 0.8), Math.round(Math.cos(a) * U(r1)), cy + Math.round(Math.sin(a) * U(r1) * 0.8), col); } };
  if (g.flash) { ring(0, cy, U(60), U(50), WHITE, true); rays(12, 36, 62, pen.ol); }
  else if (bg === 'speed' || bg === 'purple' || bg === 'dark') { x.globalAlpha = g.alpha * 0.4; rays(14, 52, 72, bg === 'purple' ? PURPLE : bg === 'dark' ? '#3B2A4A' : pen.ol); }
  else if (bg === 'rays') { x.globalAlpha = g.alpha * 0.35; rays(10, 10, 75, AMBER); }
  else if (bg === 'wind') { x.globalAlpha = g.alpha * 0.45; for (let i = 0; i < 6; i++) { const off = Math.round(((g.t * 160 + i * 37) % 150) / 150 * U(150)); cell(U(-75) + off, cy + U(-40 + i * 14), U(22), 1, pen.ol); } }
  if (gr) { x.globalAlpha = g.alpha * cl(tg._groundK ?? 1); const col = gr === 'seal' ? RED : TEAL, gx = U(tg._groundX ?? 0);
    ring(gx, 0, U(34), Math.max(1, U(9)), col); ring(gx, 0, U(26), Math.max(1, U(7)), col); }
  x.restore();
}

const SPR: Partial<Record<Particle['k'], string[]>> = {
  spark: ['.a.', 'aaa', '.a.'], dust: ['gg', 'gg'], key: ['kkk', 'klk', 'kkk'], page: ['www', 'wkw', 'www', 'wkw'],
  energy: ['pp', 'pp'], note: ['.kk', '.k.', 'kk.'], tear: ['.b', 'bb', 'bb'], soul: ['.ww.', 'wkkw', 'wwww', 'w.ww'], helper: ['.cc.', 'cccc', 'c..c'],
};
const PAL: Record<string, string> = { a: AMBER, g: GREY, k: '#2B1D16', l: '#F1EFE8', w: WHITE, p: PURPLE, b: '#85B7EB', c: '#D97757' };

export function pixelFront(x: CanvasRenderingContext2D, c: Pet, g: FxCtx): void {
  const s = c.fx; if (!s) return;
  const tg = c.tg || {}, { U, cell, line, ring } = grid(x, g, c), hands: number[][] = c.hand ?? [];
  const [fx0, fy0, gp] = (c.face as number[]) ?? [0, -45, 12], fx = U(fx0), fy = U(fy0), gap = Math.max(2, U(gp));
  const sprite = (rows: string[], cx: number, cy: number, col?: string) => rows.forEach((r, j) => { for (let i = 0; i < r.length; i++) if (r[i] !== '.') cell(cx + i, cy + j, 1, 1, col && r[i] === 'c' ? col : PAL[r[i]]); });
  x.save(); x.globalAlpha = g.alpha;
  s.trail.forEach(tr => { if (tr.length < 2) return; const a = tr[0], b = tr[tr.length - 1];
    if (b[2] > a[2] && Math.hypot(b[0] - a[0], b[1] - a[1]) / (b[2] - a[2]) >= 150) { x.save(); x.globalAlpha *= 0.5; line(U(a[0]), U(a[1]), U(b[0]), U(b[1]), g.accent); x.restore(); } });
  if (tg._barrage) hands.forEach(([hx, hy], i) => { for (let k = 1; k <= 4; k++) { x.save(); x.globalAlpha *= 0.6 - k * 0.1; cell(U(hx + Math.sin(g.t * 37 + k * 1.9 + i) * 9) - 1, U(hy - k * 6) - 1, 2, 2, g.accent); x.restore(); } });
  if (tg._orbs === 1 && hands.length === 2) { ring(U(hands[0][0]), U(hands[0][1] - 4), 2, 2, BLUE, true); ring(U(hands[1][0]), U(hands[1][1] - 4), 2, 2, RED, true); }
  else if (tg._orbs === 2) { const r = Math.max(1, U(4 + 10 * cl(tg._orbK ?? 1))); ring(0, U(-50), r, r, PURPLE, true); ring(0, U(-50), r, r, WHITE); }
  if (tg._thumb && hands[1]) cell(U(hands[1][0]), U(hands[1][1] - 12), Math.max(1, U(3.5)), Math.max(2, U(8)), g.accent);
  const K = cl(tg._faceK ?? 1);
  if (K > 0.3) switch (tg._face) {
    case 'glasses': for (const sd of [-1, 1]) ring(fx + sd * gap, fy, 2, 2, pen.ol); if ((g.t * 1.2) % 1 < 0.3) for (const sd of [-1, 1]) cell(fx + sd * gap, fy - 1, 1, 1, WHITE); break;
    case 'sharingan': { const r = Math.max(3, U(12)); ring(fx, fy - 1, Math.round(r * 1.4), r, WHITE, true); ring(fx, fy - 1, r - 1, r - 1, RED, true); cell(fx, fy - 1, 1, 1, pen.ol);
      for (let i = 0; i < 3; i++) { const a = g.t * 6 + TAU * i / 3; cell(fx + Math.round(Math.cos(a) * r * 0.5), fy - 1 + Math.round(Math.sin(a) * r * 0.5), 1, 1, pen.ol); }
      cell(fx - Math.round(r * 1.4), fy - 1 - r + Math.round(2 * r * cl(tg._scan ?? 0)), Math.round(r * 2.8), 1, RED); break; }
    case 'shadow': cell(fx - gap * 2, fy - U(10), gap * 4, Math.max(2, U(13)), '#1A0E14'); for (const sd of [-1, 1]) cell(fx + sd * gap, fy - 1, 1, 1, RED);
      if (tg._smile) { cell(fx - 3, fy + U(10), 7, 1, pen.ol); cell(fx - 4, fy + U(10) - 1, 1, 1, pen.ol); cell(fx + 4, fy + U(10) - 1, 1, 1, pen.ol); } break;
    case 'sparkle': for (const sd of [-1, 1]) { cell(fx + sd * gap - 1, fy - 2, 3, 4, '#1E1410'); cell(fx + sd * gap, fy - 2, 1, 1, WHITE); } break;
    case 'teeth': cell(fx - 2, fy + U(8), 5, Math.max(1, U(3)), WHITE); if (Math.floor(g.t * 9) % 2) sprite(SPR.spark!, fx + 4, fy + U(5)); break;
  }
  if (tg._snot != null) { const r = Math.max(1, U(2 + 8 * cl(tg._snot))); ring(fx + 2 + r, fy + U(8), r, r, '#85B7EB'); }
  if (tg._dream != null) { const cx = U(38), cy = U(-104); ring(cx, cy, U(16), U(10), WHITE, true); ring(cx, cy, U(16), U(10), pen.ol);
    const ph = (tg._dream * 0.8) % 1; cell(cx - U(10) + Math.round(ph * U(20)), cy - Math.round(Math.sin(ph * PI) * U(8)), 2, 2, g.accent); cell(cx, cy + 1, 1, 2, pen.ol); }
  if (tg._shock && Math.floor(g.t * 12) % 2) for (let i = 0; i < 6; i++) { const a = -PI * (0.1 + 0.8 * i / 5);
    line(fx + Math.round(Math.cos(a) * U(24)), fy - U(14) + Math.round(Math.sin(a) * U(24)), fx + Math.round(Math.cos(a) * U(32)), fy - U(14) + Math.round(Math.sin(a) * U(32)), pen.ol); }
  for (const p of s.parts) {
    const px = U(p.x), py = U(p.y), k = p.life / p.max;
    x.save(); x.globalAlpha *= 1 - k * k;
    if (p.k === 'confetti') cell(px, py, 1, 2, p.col);
    else if (p.k === 'bolt') { let ax = px, ay = py; for (let i = 1; i <= 4; i++) { const bx = px + Math.round(Math.cos(p.rot) * U(p.s) * i / 4), by = py + Math.round(Math.sin(p.rot) * U(p.s) * i / 4) + (i % 2 ? -1 : 1); line(ax, ay, bx, by, p.col); ax = bx; ay = by; } }
    else if (p.k === 'smoke') ring(px, py, 1 + Math.round(k * 2), 1 + Math.round(k * 2), '#E8E6E0', true);
    else sprite(SPR[p.k]!, px - 1, py - 1, p.k === 'helper' ? g.accent : undefined);
    x.restore();
  }
  if (tg._bang) sprite(GLYPHS['!'].map(r => r.replace(/#/g, 'a')), fx + U(34), fy - U(30) - Math.round(Math.abs(Math.sin(g.t * 8)) * 3) - 7);
  for (const w of s.words) {
    const chars = [...w.text], width = chars.reduce((a, ch) => a + glyphWidth(ch) + 1, -1);
    let cx = U(w.x) - (width >> 1); const cy = U(w.y) - 3;
    for (const ch of chars) { const rows = GLYPHS[ch] ?? GLYPHS['!'];
      for (const [ox, oy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) sprite(rows.map(r => r.replace(/#/g, 'k')), cx + ox, cy + oy);
      sprite(rows.map(r => r.replace(/#/g, 'a')), cx, cy); cx += glyphWidth(ch) + 1; }
  }
  x.restore();
}
```

`app/src/motion/fx/index.ts` — rozdzielacze: `g.model === 'pixel' ? pixelBack(...) : vectorBack(...)`, tak samo dla przodu.

- [ ] **Step 4: Uruchom — GREEN**

Run: `pnpm --dir app exec vitest run src/motion src/renderer`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/src/motion/fx
git commit -m "feat(motion): anime effects on the pixel grid (grid lines, rings, particle sprites, bitmap onomatopoeia)"
```

---

### Task 6: Choreografie pracy A: `edit`, `bash`, `read`, `grep`

**Files:**
- Create: `app/src/renderer/anime/work.ts`, `app/src/renderer/anime/work.test.ts`
- Modify: `app/src/renderer/anime/index.ts` (`{ ...SCENES, ...WORK }`)

**Interfaces:**
- Consumes: `keys`, `at`, `every`, `HIP`, `snapE` (task 1); `emit`, `spray`, `impact`, `word` (task 2); flagi rysowane w taskach 4–5; rekwizyty i flagi Spokojne (`_prop`, `_hold`, `_scr`, `_prog`, `_run`, `typeW`); `simulate` (task 2)
- Produces: `WORK: Record<string, Scene>` z kluczami `edit`, `bash`, `read`, `grep` (task 7 dopisuje `web`, `agent`, `mcp` w tym samym pliku)

- [ ] **Step 1: Testy (RED)** — `app/src/renderer/anime/work.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { setRng } from '../index';
import { seeded, simulate } from '../testing';

setRng(seeded(11).next);
const flags = (skin: 'clawd' | 'kodek', scene: string, secs: number) => {
  const seen: Record<string, unknown>[] = [];
  const c = simulate(skin, scene, secs, cc => seen.push({ ...cc.tg, hxL: cc.p.hxL.x, hyL: cc.p.hyL.x, hxR: cc.p.hxR.x, hyR: cc.p.hyR.x, lx: cc.p.lx.x, act: cc.act[0] }));
  return { c, seen, stats: c.fx?.stats ?? {} };
};

describe('anime work scenes', () => {
  it('edit: ORA barrage into the keyboard with flying keys, sparks, ドドド and a final punch with an impact frame', () => {
    const { seen, stats } = flags('clawd', 'edit', 7);
    expect(seen.some(s => s._barrage)).toBe(true);
    const hits = seen.filter(s => s._barrage).map(s => Math.max(s.hyL as number, s.hyR as number));
    expect(Math.max(...hits)).toBeGreaterThan(-36); // pięść dochodzi do klawiatury (y ≈ −30)
    expect(stats.key).toBeGreaterThanOrEqual(15);
    expect(stats.spark).toBeGreaterThanOrEqual(5);
    expect(stats['word:ドドド']).toBeGreaterThanOrEqual(2);
    expect(stats.impact).toBeGreaterThanOrEqual(1);
    expect(seen.some(s => s._prop === 'desk')).toBe(true);
  });
  it('edit: the final punch winds up (hand up and back) before it strikes', () => {
    const { seen } = flags('clawd', 'edit', 7);
    const fin = seen.filter(s => s.act === 'finałowy cios');
    const top = Math.min(...fin.map(s => s.hyR as number)), bottom = Math.max(...fin.map(s => s.hyR as number));
    expect(top).toBeLessThan(-70);
    expect(bottom).toBeGreaterThan(-34);
    expect(fin.findIndex(s => (s.hyR as number) === top)).toBeLessThan(fin.findIndex(s => (s.hyR as number) === bottom));
  });
  it('bash: at least 4 distinct hand seals, then a poof of smoke and the command runs', () => {
    const { seen, stats } = flags('kodek', 'bash', 4.5);
    const seals = seen.filter(s => s.act === 'pieczęcie rąk');
    const poses: number[][] = [];
    for (const s of seals) { const p = [s.hxL as number, s.hyL as number, s.hxR as number, s.hyR as number];
      if (!poses.some(q => Math.hypot(q[0] - p[0], q[1] - p[1], q[2] - p[2], q[3] - p[3]) < 6)) poses.push(p); }
    expect(poses.length).toBeGreaterThanOrEqual(4);
    expect(stats.smoke).toBeGreaterThanOrEqual(6);
    expect(stats['word:ボン']).toBeGreaterThanOrEqual(1);
    expect(seen.some(s => s._scr === 'run')).toBe(true);
  });
  it('read: glasses glint, pages fly off in the wind', () => {
    const { seen, stats } = flags('clawd', 'read', 5);
    expect(seen.some(s => s._face === 'glasses')).toBe(true);
    expect(seen.some(s => s._bg === 'wind')).toBe(true);
    expect(stats.page).toBeGreaterThanOrEqual(3);
    expect(seen.some(s => s._hold === 'sheet')).toBe(true);
  });
  it('grep: the Sharingan zooms in fast, scans, and a hit gets "!" and an impact frame', () => {
    const { seen, stats } = flags('kodek', 'grep', 5);
    const scan = seen.filter(s => s._face === 'sharingan');
    expect(scan.length).toBeGreaterThan(0);
    const firstFull = seen.findIndex(s => (s._faceK as number) >= 1);
    expect(firstFull).toBeGreaterThanOrEqual(0);
    expect(firstFull - seen.findIndex(s => s._face === 'sharingan')).toBeLessThanOrEqual(15); // ≤ 0,25 s
    expect(new Set(scan.map(s => Math.round((s._scan as number) * 10))).size).toBeGreaterThan(3);
    expect(stats['word:!']).toBeGreaterThanOrEqual(1);
    expect(stats.impact).toBeGreaterThanOrEqual(1);
  });
});
```

- [ ] **Step 2: Uruchom — RED**

Run: `pnpm --dir app exec vitest run src/renderer/anime/work.test.ts`
Expected: FAIL (sceny Anime to jeszcze kopie Spokojnych: brak `_barrage`, statystyk, nazw akcji).

- [ ] **Step 3: Implementacja** — `app/src/renderer/anime/work.ts`:

```ts
// Choreografie Anime scen pracy (spec 8.3). Współrzędne w jednostkach mózgu jak w scenes.ts: podstawa (0, 0),
// y w górę ujemny, klawiatura biurka ≈ (−2…18, −30), ekran terminala ≈ (70…100, −60).
import { PI, hr } from '../math';
import { rng } from '../rng';
import type { Scene } from '../scenes';
import { HIP, at, every, keys, snapE } from './kit';
import { emit, impact, spray, word } from './state';

const PUNCH = 1 / 14;
const kx = (i: number, k: number) => (i ? 18 : -2) + 8 * (hr(k * 1.37 + i) - 0.5);

/** Seria ORA/MUDA: pięści na przemian w klawiaturę, 14 ciosów na sekundę zegara zwierzaka. */
const barrage = (_a: number, _c: unknown, t: number) => {
  const k = Math.floor(t / PUNCH), p = (t / PUNCH) % 1, left = k % 2 === 0;
  const down = p < 0.5 ? snapE(p * 2) : 1 - snapE((p - 0.5) * 2);
  return { ikL: 1, ikR: 1, hxL: kx(0, k), hyL: left ? -46 + 16 * down : -44, hxR: kx(1, k), hyR: left ? -44 : -46 + 16 * down,
    typeW: 1, lean: 0.25, squint: 0.6, look: 0.4, _barrage: 1, _bg: 'speed', _stiff: 3 };
};
const FINAL = keys([
  [0, { ikL: 1, hxL: -2, hyL: -40, ikR: 1, hxR: 18, hyR: -44, lean: 0.2, squint: 0.6, tilt: 0, _stiff: 3 }],
  [0.14, { hxR: 34, hyR: -84, lean: -0.35, tilt: -0.08 }],
  [0.2, { hxR: 12, hyR: -29, lean: 0.7, tilt: 0.1 }],
  [0.75, {}],
  [1, { hxR: 18, hyR: -34, lean: 0.2, tilt: 0 }],
]);

const SEALS = keys([
  [0, { ikL: 1, ikR: 1, hxL: -8, hyL: -38, hxR: 8, hyR: -38, _stiff: 3 }],
  [0.1, { hxL: -3, hyL: -44, hxR: 3, hyR: -44 }], [0.3, {}],
  [0.4, { hxL: -6, hyL: -52, hxR: 6, hyR: -36 }], [0.6, {}],
  [0.7, { hxL: 2, hyL: -40, hxR: 10, hyR: -48 }], [0.9, {}],
  [1.0, { hxL: -10, hyL: -34, hxR: -2, hyR: -46 }], [1.2, {}],
  [1.3, { hxL: -2, hyL: -56, hxR: 2, hyR: -56 }], [1.6, {}],
]);
const SEAL_AT = [0.1, 0.4, 0.7, 1.0, 1.3];

const SHEET = { ikL: 1, hxL: -22, hyL: -19, ikR: 1, hxR: 22, hyR: -19 };
const FLICK = keys([[0, { ...SHEET }], [0.1, { hxR: 14, hyR: -24 }], [0.16, { hxR: 40, hyR: -40 }], [0.45, {}], [0.6, { hxR: 22, hyR: -19 }]]);

export const WORK: Record<string, Scene> = {
  edit: { cycle: 1, base: { th: 0.3, look: 0.2, ex: 0.75, _prop: 'desk' }, acts: [
    ['seria ORA', 3.2, barrage, undefined, undefined, (a, c, _t, dt) => {
      if (every(a, dt, PUNCH)) {
        const P = c.p, left = Math.floor(a / PUNCH) % 2 === 0, hx = left ? P.hxL.x : P.hxR.x;
        emit(c, 'key', hx, -32, { vx: (rng() - 0.5) * 140, vy: -150 - rng() * 90, vr: (rng() - 0.5) * 20 });
        if (rng() < 0.5) spray(c, 'spark', 1, hx, -30, 90);
      }
      if (every(a, dt, 0.7)) word(c, 'ドドド', -34 + rng() * 20, -104);
    }],
    ['finałowy cios', 1, (a) => ({ ...FINAL(a), typeW: 1, _bg: a > 0.18 && a < 0.5 ? 'speed' : null }), undefined, undefined, (a, c, _t, dt) => {
      if (at(a, dt, 0.2)) { impact(c, 3); spray(c, 'spark', 10, 12, -30, 160); spray(c, 'key', 4, 12, -30, 180); word(c, 'バン', 34, -96); }
    }],
  ] },
  bash: { cycle: 1, base: { th: 0.55, look: -0.1, ex: 0.8, _prop: 'crt' }, acts: [
    ['pieczęcie rąk', 1.6, (a) => ({ ...SEALS(a), squint: 0.5, _scr: 'type', _prog: a / 1.6 }), undefined, undefined, (a, c, _t, dt) => {
      for (const s of SEAL_AT) if (at(a, dt, s)) spray(c, 'spark', 3, (c.p.hxL.x + c.p.hxR.x) / 2, (c.p.hyL.x + c.p.hyR.x) / 2 - 4, 110);
    }],
    ['puf!', 0.5, keys([[0, { ...HIP, ikR: 1, hxR: 2, hyR: -56, _stiff: 3 }], [0.08, { hxR: 64, hyR: -52, lean: 0.4 }], [0.5, {}]]), undefined, undefined, (a, c, _t, dt) => {
      if (at(a, dt, 0.08)) { spray(c, 'smoke', 8, 84, -60, 60, -PI / 2, 2 * PI); word(c, 'ボン', 84, -104); impact(c, 1.5, false); }
    }],
    ['komenda działa', 1.8, (a) => ({ ...HIP, ikR: 1, hxR: 68, hyR: -47, look: -0.4, ex: 0.85, _scr: 'run', _run: a, _prog: 1 })],
  ] },
  read: { cycle: 1, base: { th: 0.12, look: 0.85, tilt: -0.06, _hold: 'sheet' }, acts: [
    ['czyta z błyskiem okularów', 3, (a) => ({ ...SHEET, hyL: -19 + Math.sin(a * 1.7), hyR: -19 + Math.sin(a * 1.7 + 0.4), ex: -0.8 + 1.6 * ((a / 1.3) % 1), _face: 'glasses', _faceK: 1, _bg: 'wind' }), undefined, undefined, (a, c, _t, dt) => {
      if (every(a, dt, 0.9, 0.3)) emit(c, 'page', 30, -30, { vx: 160 + rng() * 60, vy: -60 - rng() * 40, vr: 6 });
    }],
    ['przerzuca stronę', 0.6, (a) => ({ ...FLICK(a), _face: 'glasses', _faceK: 1, _bg: 'wind' }), undefined, undefined, (a, c, _t, dt) => {
      if (at(a, dt, 0.16)) for (let i = 0; i < 3; i++) emit(c, 'page', 34, -36, { vx: 180 + i * 40, vy: -90 + i * 20, vr: 8 });
    }],
  ] },
  grep: { cycle: 1, base: { th: 0.45, tilt: 0.04, _prop: 'board' }, acts: [
    ['Sharingan: skanuje', 2.6, (a) => ({ ...HIP, ikR: 1, hxR: 40, hyR: -40, ex: 0.9, look: -0.2, squint: 0.3, _face: 'sharingan', _faceK: snapE(a / 0.15), _scan: (a * 1.6) % 1, _bg: 'dark', _bgK: snapE(a / 0.3) })],
    ['trafienie!', 1, keys([[0, { ...HIP, ikR: 1, hxR: 40, hyR: -40, armL: 0.35, hopW: 0, _face: 'sharingan', _faceK: 1, _stiff: 3 }], [0.06, { hxR: 74, hyR: -58, hopW: 0.8, lean: 0.4 }], [0.6, { hopW: 0 }], [1, { hxR: 40, hyR: -40, lean: 0 }]]), undefined, undefined, (a, c, _t, dt) => {
      if (at(a, dt, 0.06)) { impact(c, 2.5); word(c, '!', 30, -100, 40); spray(c, 'spark', 6, 74, -58, 120); }
    }],
  ] },
};
```

`app/src/renderer/anime/index.ts`: `export const SCENES_ANIME: Record<string, Scene> = { ...SCENES, ...WORK };`

Uwaga: nazwy akcji są po polsku jak w `SCENES` (te napisy nie trafiają do UI; test skanu literałów obejmuje tylko UI i Rust Tauri — jeśli złapie `anime/`, dopisz katalog do wyjątków razem z `scenes.ts`).

- [ ] **Step 4: Uruchom — GREEN**

Run: `pnpm --dir app exec vitest run src/renderer src/motion`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/src/renderer/anime
git commit -m "feat(anime): ORA barrage, hand seals, glasses glint and Sharingan choreographies"
```

---

### Task 7: Choreografie pracy B: `web`, `agent`, `mcp`

**Files:**
- Modify: `app/src/renderer/anime/work.ts`, `app/src/renderer/anime/work.test.ts`

**Interfaces:**
- Consumes: jak task 6
- Produces: `WORK.web`, `WORK.agent`, `WORK.mcp`

- [ ] **Step 1: Testy (RED)** — dopisz do `work.test.ts`:

```ts
  it('web: thunder-breathing zigzag dash with lightning, catches the page, comes back within the slot', () => {
    const { seen, stats } = flags('clawd', 'web', 4);
    const lx = seen.map(s => s.lx as number);
    expect(Math.max(...lx)).toBeGreaterThanOrEqual(30);
    expect(Math.max(...lx.map(Math.abs))).toBeLessThanOrEqual(50);
    let turns = 0; for (let i = 2; i < lx.length; i++) if (Math.sign(lx[i] - lx[i - 1]) * Math.sign(lx[i - 1] - lx[i - 2]) < 0) turns++;
    expect(turns).toBeGreaterThanOrEqual(3);
    expect(stats.bolt).toBeGreaterThanOrEqual(5);
    expect(stats['word:シュッ']).toBeGreaterThanOrEqual(1);
    expect(seen.some(s => s._hold === 'sheet')).toBe(true);
    expect(Math.abs(lx.at(-1)!)).toBeLessThan(8);
  });
  it('agent: a seal on the ground, a cloud of smoke and a mini helper running off', () => {
    const { c, seen, stats } = flags('kodek', 'agent', 3);
    expect(seen.some(s => s._ground === 'seal')).toBe(true);
    expect(stats.smoke).toBeGreaterThanOrEqual(8);
    expect(stats.helper).toBeGreaterThanOrEqual(1);
    expect(stats['word:ボン']).toBeGreaterThanOrEqual(1);
    const h = c.fx.parts.find(p => p.k === 'helper');
    if (h) expect(h.vx).toBeGreaterThan(0);
  });
  it('mcp: clap (hands meet), glowing transmutation circle, the tool rises from sparks', () => {
    const { seen, stats } = flags('clawd', 'mcp', 3);
    const clap = seen.filter(s => s.act === 'klaśnięcie');
    expect(Math.min(...clap.map(s => Math.abs((s.hxR as number) - (s.hxL as number))))).toBeLessThan(12);
    expect(seen.some(s => s._ground === 'circle')).toBe(true);
    expect(seen.some(s => s._hold === 'wrench')).toBe(true);
    expect(stats.spark).toBeGreaterThanOrEqual(10);
    expect(stats.energy).toBeGreaterThanOrEqual(5);
  });
```

- [ ] **Step 2: Uruchom — RED**

Run: `pnpm --dir app exec vitest run src/renderer/anime/work.test.ts`
Expected: FAIL (3 nowe testy; `web`/`agent`/`mcp` grają wersję Spokojną).

- [ ] **Step 3: Implementacja** — dopisz do `WORK` w `work.ts`:

```ts
const ZIG = keys([[0, { lx: 0, th: PI / 2, walkW: 0, _stiff: 3 }], [0.1, { lx: 34 }], [0.2, { lx: 6 }], [0.3, { lx: 38 }], [0.4, { lx: 12 }], [0.5, { lx: 40 }]]);
const BACK = keys([[0, { lx: 40, th: -PI / 2, _stiff: 3 }], [0.25, { lx: 0 }], [0.6, { th: 0 }]]);

  web: { cycle: 1, base: {}, acts: [
    ['oddech pioruna: zamach', 0.35, () => ({ th: PI / 2, sit: 0.35, squint: 0.8, lean: -0.3, ...HIP, ikR: 1, hxR: 20, hyR: -30, _bg: 'speed' }), undefined, undefined, (a, c, _t, dt) => {
      if (at(a, dt, 0.3)) word(c, 'シュッ', -20, -96);
    }],
    ['zygzak', 0.5, (a) => ({ ...ZIG(a), squint: 0.8, ikR: 1, hxR: 30, hyR: -60, _bg: 'speed' }), undefined, undefined, (a, c, _t, dt) => {
      if (every(a, dt, 0.05)) emit(c, 'bolt', c.p.lx.x - 10, -40 + (rng() - 0.5) * 30, { rot: PI + (rng() - 0.5) * 0.8, s: 22 });
      if (every(a, dt, 0.1)) spray(c, 'spark', 2, c.p.lx.x, -30, 80);
    }],
    ['łapie stronę', 0.4, keys([[0, { lx: 40, th: 0, ikR: 1, hxR: 30, hyR: -60, _stiff: 3 }], [0.08, { hxR: 34, hyR: -86, happy: 0.6 }], [0.4, {}]]), undefined, undefined, (a, c, _t, dt) => {
      if (at(a, dt, 0.08)) { spray(c, 'spark', 5, c.p.lx.x + 34, -86, 110); impact(c, 1, false); }
    }],
    ['wraca z iskrami', 0.6, (a) => ({ ...BACK(a), ...SHEET, _hold: 'sheet', walkW: a < 0.3 ? 1 : 0 }), undefined, undefined, (a, c, _t, dt) => {
      if (every(a, dt, 0.06) && a < 0.3) spray(c, 'spark', 2, c.p.lx.x + 10, -20, 70);
    }],
    ['ogląda stronę', 1.2, () => ({ ...SHEET, _hold: 'sheet', look: 0.8, happy: 0.5 })],
  ] },
  agent: { cycle: 1, base: {}, acts: [
    ['składa pieczęć', 0.5, (a) => ({ ikL: 1, hxL: -4, hyL: -46, ikR: 1, hxR: 4, hyR: -46, squint: 0.7, _stiff: 3, _ground: 'seal', _groundK: snapE(a / 0.3), _groundX: 45 })],
    ['uderza w ziemię', 0.35, keys([[0, { ikL: 1, hxL: -4, hyL: -46, ikR: 1, hxR: 4, hyR: -46, _stiff: 3, _ground: 'seal', _groundK: 1, _groundX: 45 }], [0.12, { hyL: -70, hyR: -70, lean: -0.3 }], [0.18, { hxL: 20, hyL: -6, hxR: 34, hyR: -6, lean: 0.8, sit: 0.4 }], [0.35, {}]]), undefined, undefined, (a, c, _t, dt) => {
      if (at(a, dt, 0.18)) { spray(c, 'smoke', 10, 45, -12, 70, -PI / 2, 2 * PI); word(c, 'ボン', 45, -90); impact(c, 2, false); }
    }],
    ['pomocnik wybiega', 1.6, () => ({ ...HIP, armR: 2.3, oscR: 0.55, _f: 11, look: -0.3, ex: 0.9, th: 0.3, happy: 0.5, _ground: 'seal', _groundK: 0, _groundX: 45 }), (c) => {
      emit(c, 'helper', 45, 0, { vx: 90, max: 1.6 });
    }],
  ] },
  mcp: { cycle: 1, base: { th: 0 }, acts: [
    ['klaśnięcie', 0.45, keys([[0, { ikL: 1, ikR: 1, hxL: -26, hyL: -42, hxR: 26, hyR: -42, _stiff: 3 }], [0.15, { hxL: -42, hxR: 42, hyL: -48, hyR: -48, lean: -0.2 }], [0.22, { hxL: -4, hxR: 4, hyL: -45, hyR: -45, lean: 0.2 }], [0.45, {}]]), undefined, undefined, (a, c, _t, dt) => {
      if (at(a, dt, 0.22)) { spray(c, 'spark', 6, 0, -45, 120); word(c, 'バン', 0, -100); impact(c, 1.5, false); }
    }],
    ['krąg transmutacji', 0.9, (a) => ({ ikL: 1, ikR: 1, hxL: -18, hyL: -6, hxR: 18, hyR: -6, lean: 0.5, sit: 0.4, squint: 0.6, _ground: 'circle', _groundK: snapE(a / 0.2), _stiff: 3 }), undefined, undefined, (a, c, _t, dt) => {
      if (every(a, dt, 0.08)) { const an = rng() * PI * 2; emit(c, 'energy', Math.cos(an) * 30, Math.sin(an) * 8, { vy: -60, col: '#5DCAA5' }); }
    }],
    ['narzędzie wyłania się', 1.2, keys([[0, { ikL: 1, ikR: 1, hxL: -18, hyL: -6, hxR: 30, hyR: -6, _hold: 'wrench', _ground: 'circle', _groundK: 1, _stiff: 3 }], [0.12, { hxR: 34, hyR: -72, lean: 0, sit: 0, happy: 0.7, ...HIP }], [0.9, { _groundK: 0 }], [1.2, {}]]), undefined, undefined, (a, c, _t, dt) => {
      if (at(a, dt, 0)) spray(c, 'spark', 10, 30, -6, 140);
      if (at(a, dt, 0.12)) spray(c, 'energy', 6, 34, -72, 60, -PI / 2, 2 * PI);
    }],
  ] },
```

(stała `SHEET` jest już zdefiniowana w pliku z tasku 6).

- [ ] **Step 4: Uruchom — GREEN**

Run: `pnpm --dir app exec vitest run src/renderer src/motion`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/src/renderer/anime
git commit -m "feat(anime): thunder-breathing dash, summoning and alchemy choreographies"
```

---

### Task 8: Choreografie stanów A: `thinking`, `needs`, `done`, `error`

**Files:**
- Create: `app/src/renderer/anime/states.ts`, `app/src/renderer/anime/states.test.ts`
- Modify: `app/src/renderer/anime/index.ts` (`{ ...SCENES, ...WORK, ...STATES }`)

**Interfaces:**
- Consumes: jak task 6
- Produces: `STATES: Record<string, Scene>` z kluczami `thinking`, `needs`, `done`, `error` (task 9 dopisuje resztę)

- [ ] **Step 1: Testy (RED)** — `app/src/renderer/anime/states.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { setRng } from '../index';
import { seeded, simulate } from '../testing';

setRng(seeded(12).next);
const flags = (skin: 'clawd' | 'kodek', scene: string, secs: number) => {
  const seen: Record<string, unknown>[] = [];
  const c = simulate(skin, scene, secs, cc => seen.push({ ...cc.tg, th: cc.p.th.x, lx: cc.p.lx.x, sit: cc.p.sit.x, loaf: cc.p.loaf.x, act: cc.act[0], parts: cc.fx?.parts.map(p => ({ ...p })) ?? [] }));
  return { c, seen, stats: c.fx?.stats ?? {} };
};

describe('anime state scenes', () => {
  it('thinking: shadow over the eyes, dramatic smile, a page falling in slow motion, ゴゴゴ', () => {
    const { seen, stats } = flags('clawd', 'thinking', 5);
    expect(seen.some(s => s._face === 'shadow')).toBe(true);
    expect(seen.some(s => s._face === 'shadow' && s._smile)).toBe(true);
    expect(stats['word:ゴゴゴ']).toBeGreaterThanOrEqual(2);
    const pages = seen.flatMap(s => (s.parts as { k: string; vy: number }[]).filter(p => p.k === 'page'));
    expect(pages.length).toBeGreaterThan(0);
    expect(Math.max(...pages.map(p => Math.abs(p.vy)))).toBeLessThan(40); // zwolnione tempo
  });
  it('needs: big sparkly eyes, bouncing "!" with shock lines, waving', () => {
    const { seen } = flags('kodek', 'needs', 3);
    expect(seen.some(s => s._face === 'sparkle' && s._bang && s._shock)).toBe(true);
    expect(seen.some(s => (s.oscR as number) > 0.3)).toBe(true);
  });
  it('done: Might Guy "Nice!" — thumbs up, teeth sparkle, sunset rays, confetti, an impact frame', () => {
    const { seen, stats } = flags('clawd', 'done', 3);
    expect(seen.some(s => s._thumb && s._face === 'teeth' && s._bg === 'rays')).toBe(true);
    expect(stats['word:NICE!']).toBeGreaterThanOrEqual(1);
    expect(stats.confetti).toBeGreaterThanOrEqual(12);
    expect(stats.impact).toBeGreaterThanOrEqual(1);
  });
  it('error: the soul leaves through the mouth, grey, a sweat drop', () => {
    const { c, seen, stats } = flags('kodek', 'error', 4);
    expect(stats.soul).toBeGreaterThanOrEqual(1);
    expect(stats.tear).toBeGreaterThanOrEqual(2);
    expect(c.p.grey.x).toBeGreaterThan(0.8);
    const soul = seen.flatMap(s => (s.parts as { k: string; y: number }[]).filter(p => p.k === 'soul'));
    expect(Math.min(...soul.map(p => p.y))).toBeLessThan(soul[0].y - 10);
  });
});
```

- [ ] **Step 2: Uruchom — RED**

Run: `pnpm --dir app exec vitest run src/renderer/anime/states.test.ts`
Expected: FAIL (brak `./states`).

- [ ] **Step 3: Implementacja** — `app/src/renderer/anime/states.ts`:

```ts
// Choreografie Anime scen stanów (spec 8.3). Współrzędne jak w scenes.ts.
import { rng } from '../rng';
import type { Pet } from '../pet';
import type { Scene } from '../scenes';
import { at, every, keys, snapE } from './kit';
import { emit, impact, spray, word } from './state';

/** Twarz zwierzaka z ostatniej klatki modelu (albo środek głowy, gdy jeszcze nie rysowany). */
const faceOf = (c: Pet): number[] => (c.face as number[]) ?? [0, -45, 12];

const THUMB = keys([[0, { ikR: 1, hxR: 20, hyR: -30, lean: -0.3, squint: 0.8, _stiff: 3 }], [0.12, { hxR: 36, hyR: -62, lean: 0.2, squint: 0, happy: 1 }], [1.6, {}]]);

export const STATES: Record<string, Scene> = {
  thinking: { cycle: 1, base: { th: 0, look: 0.3 }, acts: [
    ['cień na oczach', 2.4, (a) => ({ ikL: 1, hxL: -8, hyL: -38, ikR: 1, hxR: 8, hyR: -38, _face: 'shadow', _faceK: snapE(a / 0.4), _bg: 'dark', _bgK: snapE(a / 0.6) }), undefined, undefined, (a, c, _t, dt) => {
      if (every(a, dt, 0.8, 0.4)) word(c, 'ゴゴゴ', rng() < 0.5 ? -44 : 44, -96, 26);
    }],
    ['dramatyczny uśmiech', 1.6, () => ({ ikL: 1, hxL: -8, hyL: -38, ikR: 1, hxR: 8, hyR: -38, tilt: -0.08, _face: 'shadow', _faceK: 1, _smile: 1, _bg: 'dark' }), (c) => {
      emit(c, 'page', 34, -118, { vx: 8, vy: 12, vr: 1.2, max: 1.6, s: 14 });
    }, undefined, (a, c, _t, dt) => { if (at(a, dt, 0.1)) word(c, 'ゴゴゴ', -44, -96, 26); }],
  ] },
  needs: { base: { th: 0, look: 0 }, acts: [
    ['błyszczące oczy', 2.2, () => ({ hopW: 0.6, armR: 2.3, oscR: 0.55, _f: 11, _face: 'sparkle', _faceK: 1, _bang: 1, _shock: 1 })],
    ['puka w szybę', 1.6, (_a, _c, t) => ({ lean: 1, ikR: 1, hxR: 47 + 5 * Math.max(0, Math.sin(t * 16)), hyR: -44, _f: 16, _knock: 1, _big: 1, _face: 'sparkle', _faceK: 1, _bang: 1 })],
  ] },
  done: { base: { happy: 1, look: -0.3 }, seq: [
    ['Nice!', 1.6, (a) => ({ ...THUMB(a), _thumb: a > 0.1 ? 1 : 0, _face: a > 0.1 ? 'teeth' : null, _faceK: 1, _bg: 'rays', _bgK: snapE(a / 0.3) }), undefined, undefined, (a, c, _t, dt) => {
      if (at(a, dt, 0.12)) { impact(c, 1.5); word(c, 'NICE!', 0, -104, 28); spray(c, 'confetti', 16, 0, -70, 190); }
    }],
  ], acts: [
    ['cieszy się', 3, (a) => ({ armL: 2.5 + 0.3 * Math.sin(a * 9), armR: 2.5 - 0.3 * Math.sin(a * 9), hopW: 0.6, happy: 1 }), undefined, undefined, (a, c, _t, dt) => {
      if (every(a, dt, 0.6)) spray(c, 'confetti', 4, (rng() - 0.5) * 60, -90, 90);
    }],
    ['kciuk znowu', 1.6, (a) => ({ ...THUMB(a), _thumb: a > 0.1 ? 1 : 0, _face: a > 0.1 ? 'teeth' : null, _faceK: 1, _bg: 'rays' }), undefined, undefined, (a, c, _t, dt) => {
      if (at(a, dt, 0.12)) { word(c, 'NICE!', 0, -104, 28); spray(c, 'confetti', 8, 0, -70, 170); }
    }],
  ] },
  error: { base: { sit: 1, grey: 1 }, acts: [
    ['dusza wylatuje', 3, () => ({ look: 0.6, tilt: 0.12, sleep: 0.5, dizzy: 0.2 }), undefined, undefined, (a, c, _t, dt) => {
      if (at(a, dt, 0.1)) { const [fx, fy] = faceOf(c); emit(c, 'soul', fx, fy + 10, { vy: -14, max: 2.6 }); }
      if (every(a, dt, 1.1, 0.4)) { const [fx, fy, gp] = faceOf(c); emit(c, 'tear', fx + gp + 8, fy - 10, { vx: 10, vy: -30 }); }
    }],
    ['wraca do siebie', 1.2, () => ({ shake: 1, dizzy: 0.6 }), undefined, undefined, (a, c, _t, dt) => {
      if (at(a, dt, 0)) { const [fx, fy, gp] = faceOf(c); emit(c, 'tear', fx + gp + 8, fy - 10, { vx: 10, vy: -30 }); }
    }],
  ] },
};
```

`app/src/renderer/anime/index.ts`: `export const SCENES_ANIME: Record<string, Scene> = { ...SCENES, ...WORK, ...STATES };`

- [ ] **Step 4: Uruchom — GREEN**

Run: `pnpm --dir app exec vitest run src/renderer src/motion`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/src/renderer/anime
git commit -m "feat(anime): Light Yagami, sparkly-eyed call, Might Guy \"Nice!\" and soul-leaving choreographies"
```

---

### Task 9: Choreografie stanów B: `idle`, `sleep`, `compact`, `bye`

**Files:**
- Modify: `app/src/renderer/anime/states.ts`, `app/src/renderer/anime/states.test.ts`

**Interfaces:**
- Consumes: jak task 8
- Produces: `STATES.idle`, `STATES.sleep`, `STATES.compact`, `STATES.bye`

- [ ] **Step 1: Testy (RED)** — dopisz do `states.test.ts`:

```ts
  it('idle: alternates a chibi spin with humming and training (push-ups, squats)', () => {
    const { seen, stats } = flags('clawd', 'idle', 9);
    expect(Math.max(...seen.map(s => Math.abs(s.th as number)))).toBeGreaterThan(Math.PI);
    expect(stats.note).toBeGreaterThanOrEqual(3);
    const acts = new Set(seen.map(s => s.act));
    expect(acts.has('trening: pompki') && acts.has('trening: przysiady')).toBe(true);
    const loaf = seen.filter(s => s.act === 'trening: pompki').map(s => s.loaf as number);
    expect(Math.max(...loaf) - Math.min(...loaf)).toBeGreaterThan(0.4);
    const sit = seen.filter(s => s.act === 'trening: przysiady').map(s => s.sit as number);
    expect(Math.max(...sit) - Math.min(...sit)).toBeGreaterThan(0.4);
  });
  it('sleep: a snot bubble grows and shrinks, then a dream bubble with a little scene', () => {
    const { seen } = flags('kodek', 'sleep', 9);
    const snot = seen.filter(s => s._snot != null).map(s => s._snot as number);
    expect(Math.min(...snot)).toBeLessThan(0.3);
    expect(Math.max(...snot)).toBeGreaterThan(0.7);
    expect(seen.some(s => s._dream != null)).toBe(true);
    expect(seen.every(s => s._prop === 'pillow')).toBe(true);
  });
  it('compact: two energy balls merge with an impact, then implode (energy pulled inward)', () => {
    const { seen, stats } = flags('clawd', 'compact', 3.5);
    expect(seen.some(s => s._orbs === 1)).toBe(true);
    expect(seen.some(s => s._orbs === 2)).toBe(true);
    expect(stats.impact).toBeGreaterThanOrEqual(1);
    expect(stats['word:ゴゴゴ']).toBeGreaterThanOrEqual(1);
    const inward = seen.flatMap(s => (s.parts as { k: string; x: number; y: number; vx: number; vy: number; life: number }[])
      .filter(p => p.k === 'energy' && p.life < 0.03)).filter(p => p.x * p.vx + (p.y + 50) * p.vy < 0);
    expect(inward.length).toBeGreaterThanOrEqual(5);
  });
  it('bye: a roadrunner escape — wind-up back, dash with a dust cloud and シュッ, gone within the slot', () => {
    const { seen, stats } = flags('clawd', 'bye', 3);
    const lx = seen.map(s => s.lx as number);
    expect(Math.min(...lx)).toBeLessThan(-3);        // zamach w tył
    expect(lx.at(-1)!).toBeGreaterThanOrEqual(45);
    expect(Math.max(...lx)).toBeLessThanOrEqual(50);
    expect(stats.dust).toBeGreaterThanOrEqual(6);
    expect(stats['word:シュッ']).toBeGreaterThanOrEqual(1);
  });
```

- [ ] **Step 2: Uruchom — RED**

Run: `pnpm --dir app exec vitest run src/renderer/anime/states.test.ts`
Expected: FAIL (4 nowe testy).

- [ ] **Step 3: Implementacja** — dopisz do `STATES`:

```ts
  idle: { cycle: 1, base: { th: 0.1 }, acts: [
    ['chibi kręci się i nuci', 2.4, (a) => ({ th: a < 0.5 ? TAU * snapE(a / 0.5) : TAU, happy: 0.7, armL: 1.2, armR: 1.2, hopW: a < 0.5 ? 0.4 : 0 }), undefined, undefined, (a, c, _t, dt) => { // nextAct sam zdejmuje pełny obrót z th
      if (a > 0.5 && every(a, dt, 0.35, 0.5)) emit(c, 'note', (rng() - 0.5) * 60, -80, { vx: (rng() - 0.5) * 20, vy: -30 });
    }],
    ['trening: pompki', 2.4, (a) => ({ loaf: 0.45 + 0.45 * Math.sin(a * TAU * 1.25), ikL: 1, hxL: -34, hyL: -4, ikR: 1, hxR: 34, hyR: -4, squint: 0.5, _stiff: 2 }), undefined, undefined, (a, c, _t, dt) => {
      if (every(a, dt, 0.8, 0.4)) { const [fx, fy, gp] = faceOf(c); emit(c, 'tear', fx - gp - 6, fy - 8, { vx: -15, vy: -25 }); }
    }],
    ['trening: przysiady', 2.4, (a) => ({ sit: 0.45 + 0.45 * Math.sin(a * TAU * 1.25), armL: 1.6, armR: 1.6, squint: 0.4, _stiff: 2 }), undefined, undefined, (a, c, _t, dt) => {
      if (every(a, dt, 0.8, 0.4)) spray(c, 'dust', 2, 0, -2, 30, -PI / 2, PI);
    }],
  ] },
  sleep: { cycle: 1, base: { loaf: 1, sleep: 1, dim: 1, th: 0.3, _prop: 'pillow', armL: 0.15, armR: 0.15 }, acts: [
    ['bąbel z nosa', 4, (a) => ({ _snot: 0.5 - 0.5 * Math.cos(a * TAU / 2) })],
    ['dymek snu', 4, (a) => ({ _dream: a })],
  ] },
  compact: { cycle: 1, base: { th: 0, look: 0.3 }, acts: [
    ['dwie kule', 1, (a) => ({ ikL: 1, hxL: -40, hyL: -50, ikR: 1, hxR: 40, hyR: -50, squint: 0.5, _orbs: 1, _bg: 'purple', _bgK: snapE(a / 0.5), _stiff: 2 })],
    ['łączy', 0.6, keys([[0, { ikL: 1, hxL: -40, hyL: -50, ikR: 1, hxR: 40, hyR: -50, _orbs: 1, _bg: 'purple', _stiff: 3 }], [0.15, { hxL: -52, hxR: 52, lean: -0.2 }], [0.35, { hxL: -3, hxR: 3, lean: 0.3 }], [0.6, {}]]), undefined, undefined, (a, c, _t, dt) => {
      if (at(a, dt, 0.35)) { impact(c, 3); word(c, 'ゴゴゴ', 0, -104, 26); }
    }],
    ['implozja', 0.9, (a) => ({ ikL: 1, hxL: -3, hyL: -50, ikR: 1, hxR: 3, hyR: -50, squint: 0.9, _orbs: 2, _orbK: 1 - a / 0.9, _bg: 'purple' }), undefined, undefined, (a, c, _t, dt) => {
      if (every(a, dt, 0.06)) { const an = rng() * TAU; emit(c, 'energy', Math.cos(an) * 40, -50 + Math.sin(an) * 30, { vx: -Math.cos(an) * 70, vy: -Math.sin(an) * 50 }); }
    }],
    ['ociera czoło', 1, (a) => ({ ikL: 1, hxL: -26 + 34 * snapE(a / 0.6), hyL: -64, ikR: 1, hxR: 30, hyR: -34, look: 0.1 }), undefined, undefined, (a, c, _t, dt) => {
      if (at(a, dt, 0.5)) emit(c, 'tear', -30, -62, { vx: -25, vy: -20 });
    }],
  ] },
  bye: { base: {}, seq: [
    ['macha na pożegnanie', 0.5, () => ({ th: 0, look: 0, happy: 0.8, armR: 2.3, oscR: 0.55, _f: 11 })],
    ['zamach do biegu', 0.25, () => ({ th: PI / 2, lx: -6, lean: -0.4, squint: 0.8, sit: 0.3, _stiff: 3 })],
    ['ucieczka', 0.35, () => ({ th: PI / 2, lx: 50, walkW: 1, squint: 0.8, _stiff: 3, _bg: 'speed' }), undefined, undefined, (a, c, _t, dt) => {
      if (at(a, dt, 0)) { spray(c, 'dust', 8, -6, -2, 60, PI, PI / 2); word(c, 'シュッ', -20, -84); }
      if (every(a, dt, 0.05)) spray(c, 'dust', 1, c.p.lx.x - 12, -2, 30, PI, PI / 3);
    }],
  ], acts: [['odszedł', 5, () => ({ th: PI / 2, lx: 50 })]] },
```

Dopisz `import { PI, TAU } from '../math';` na górze `states.ts`.

- [ ] **Step 4: Uruchom — GREEN**

Run: `pnpm --dir app exec vitest run src/renderer src/motion`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/src/renderer/anime
git commit -m "feat(anime): chibi spin and training, snot bubble and dream, Hollow Purple and roadrunner choreographies"
```

---

### Task 10: Przegląd całości, opis ruchu, weryfikacja

**Files:**
- Create: `app/src/renderer/anime/sweep.test.ts`
- Modify: `app/src/i18n/pl.ts`, `app/src/i18n/en.ts`, `docs/looks-verification.md`

**Interfaces:**
- Consumes: wszystko powyżej; `STYLE_IDS` (`look.ts`), `PetPainter`

- [ ] **Step 1: Testy (RED/GREEN)** — `app/src/renderer/anime/sweep.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { STYLE_IDS } from '../../look';
import { createPet, pen, setRng } from '../index';
import { PetPainter } from '../painter';
import { recorder, seeded } from '../testing';
import { SCENES_ANIME } from './index';
import { CAP } from './state';

setRng(seeded(21).next);
pen.font = 'x';
const run = (style: string, skin: 'clawd' | 'kodek', scene: string, o: { saving?: boolean; reduced?: boolean } = {}, secs = 3, fps = 15) => {
  const p = new PetPainter(createPet(skin, scene)), frames: string[][] = [];
  for (let f = 0; f < secs * fps; f++) {
    const r = recorder();
    p.frame(r.ctx, { dt: 1 / fps, t0: 1 + f / fps, X: 60, Y: 40, u: 0.3, animate: true, saving: !!o.saving, reduced: !!o.reduced, dpr: 1, look: { style: style as never, motion: 'anime' } });
    frames.push(r.log);
    expect(p.pet.fx?.parts.length ?? 0, `${style}/${skin}/${scene}`).toBeLessThanOrEqual(o.saving ? CAP / 2 : CAP);
  }
  return { p, frames };
};

describe('anime sweep', () => {
  it('every anime scene in every style and skin: finite, balanced, capped, ≤ 3 impact frames per second', () => {
    for (const scene of Object.keys(SCENES_ANIME)) for (const style of STYLE_IDS) for (const skin of ['clawd', 'kodek'] as const) {
      const { frames } = run(style, skin, scene);
      const tag = `${style}/${skin}/${scene}`;
      frames.forEach(l => {
        expect(l.some(v => v.includes('NaN')), tag).toBe(false);
        expect(l.filter(v => v === 'save()').length, tag).toBe(l.filter(v => v === 'restore()').length);
      });
      const starts = frames.map((l, i) => l.includes('filter=invert(1)') && !(frames[i - 1] ?? []).includes('filter=invert(1)') ? i / 15 : -1).filter(v => v >= 0);
      for (const a of starts) expect(starts.filter(b => b >= a && b < a + 1).length, tag).toBeLessThanOrEqual(3);
    }
  }, 180_000);
  it('power saving halves the particle cap; reduced motion never flashes', () => {
    for (const scene of ['edit', 'done', 'compact', 'grep']) {
      run('clean', 'clawd', scene, { saving: true });
      const { frames } = run('sticker', 'kodek', scene, { reduced: true });
      expect(frames.some(l => l.includes('filter=invert(1)')), scene).toBe(false);
    }
  }, 60_000);
  it('everything stays inside the 48 px taskbar (y ≥ 0) at u = 0.3', () => {
    for (const scene of Object.keys(SCENES_ANIME)) for (const style of ['clean', 'sticker', 'pixel']) {
      const { frames } = run(style, 'clawd', scene, {}, 3, 10);
      const ys = frames.flat().filter(l => /^(fillRect|rect|moveTo|lineTo|arc|ellipse|fillText|strokeText)\(/.test(l))
        .map(l => { const a = l.slice(l.indexOf('(') + 1, -1).split(','); return /Text\(/.test(l) ? +a[2] - 5 : l.startsWith('arc') ? +a[1] - +a[2] : l.startsWith('ellipse') ? +a[1] - +a[3] : +a[1]; })
        .filter(Number.isFinite);
      expect(Math.min(...ys), `${style}/${scene}`).toBeGreaterThanOrEqual(-1);
    }
  }, 120_000);
});
```

Run: `pnpm --dir app exec vitest run src/renderer/anime/sweep.test.ts`
Expected: PASS. Jeśli coś wystaje ponad pasek albo przekracza limit — to znalezisko dla tasku, który jest właścicielem sceny lub efektu: popraw współrzędne tam (RED→GREEN tym testem), zapisz decyzję w ledgerze.

- [ ] **Step 2: Opis ruchu Anime (i18n)**

`app/src/i18n/pl.ts`: `motionDesc: 'Anime: sceny jak z anime — serie ciosów, pieczęcie, błyski i cząsteczki'`
`app/src/i18n/en.ts`: `motionDesc: 'Anime: scenes straight out of anime — punch barrages, hand seals, impact flashes and particles'`

Run: `pnpm --dir app test`
Expected: PASS (w tym test skanu literałów i zgodności słowników).

- [ ] **Step 3: Commit**

```bash
git add app/src/renderer/anime/sweep.test.ts app/src/i18n
git commit -m "test(anime): every scene in every style within caps, flash limit and the taskbar; anime motion description"
```

- [ ] **Step 4: Weryfikacja i build**
  - `cargo test --workspace`, `pnpm --dir app test`, `pnpm --dir app typecheck` → PASS
  - zrzuty i klatki z `looks-dev.html?motion=anime&scene=<scena>` (skrypt `looks.mjs` w scratchpadzie) dla 15 scen × 3 modele w pasku (u 0,3, dpr 1 i 1,5) i w dużym podglądzie; obejrzeć każdą scenę: zamach → szybka akcja → pauza, smugi zamiast duchów, efekty w miejscu zwierzaka
  - `pnpm --dir app tauri build` → instalator; ścieżka dla użytkownika

- [ ] **Step 5:** `docs/looks-verification.md`: sekcja „Wygląd v2, plan 2 (Anime)” z wierszami: 15 choreografii (co widać w każdej), sprężyny bez przestrzelenia, limit cząsteczek i błysków, tryb oszczędny, `reduced-motion`, piksel na siatce, testy. Commit `docs: looks v2 plan 2 verification`.

Po tym: przegląd całej gałęzi od początku planu 2 (świeży recenzent na najmocniejszym modelu), jedna runda poprawek (TDD), test użytkownika na żywo, potem wersja 0.6.0, README i notatki wydania, scalenie `looks` → `main` i push tylko po zgodzie.
