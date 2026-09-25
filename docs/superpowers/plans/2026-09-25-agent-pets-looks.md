# Agent Pets: style, ruch Anime i galeria wyglądu. Plan implementacji

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Cel:** (A) 7 stylów rysowania (Szkic, Czysty, Naklejka, Pixel-art, Neon, Tusz, Pastel) rozróżnialnych w pasku, ruch Spokojny/Anime, nadpisania per agent i galeria z żywym podglądem w ustawieniach i kreatorze. (B) interfejs po angielsku i polsku (taski 14–17).

**Architektura:**
- **Styl** (`app/src/styles/`) to dane i kilka flag czytanych przez `pen.ts` i `draw/body.ts`. `drawPet(..., look)` ustawia `pen.st` na czas wywołania; brak `look` = Czysty/Spokojny, czyli dokładnie dzisiejsze rysowanie (parytet z prototypem v6).
- **Ruch** (`app/src/motion/`) to parametry zegara i sprężyn (`tick`) oraz efekty (`fx.ts`). Spokojny = dzisiejszy silnik.
- **`PetPainter`** (`app/src/renderer/painter.ts`) to jedno wejście dla sceny, panelu i galerii: zegar zwierzaka, warstwa poza ekranem (Pixel-art, smugi), energia ruchu, efekty.
- **Ustawienia:** `pets.style`, `pets.motion`, `pets.overrides` w Rust (tolerancyjne wczytanie, migracja `skin`) i TS (`lookFor`).
- **UI:** zakładka „Wygląd” z galerią (`app/src/settings/look/`), kreator z galerią kompaktową.

**Stos:** bez nowych zależności (Canvas 2D, React, serde).

**Spec:** `docs/superpowers/specs/2026-09-25-agent-pets-looks-design.md` (wiąże), tło: `2026-09-24-agent-pets-design.md`, `2026-09-25-agent-pets-phase5-design.md`.

## Global Constraints

- Wszystko z faz 2–5 obowiązuje: testy przed commitem, stopka commita `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`, teksty tylko przez JSX, pliki współdzielone w `~/.agent-pets`.
- **Parytet:** `stepPet` bez parametrów ruchu i `drawPet` bez `look` (albo z `clean/calm`) dają zapis identyczny z prototypem v6 dla wszystkich scen, skórek i obu skal. Szkic zgodny przy `u = 1`.
- **Domyślne:** nowe ustawienia `style: "sticker"`, `motion: "calm"`, `overrides: {}`.
- **Migracja:** `skin` wczytuje się jako `style`; zapis pisze `style`, nigdy `skin`.
- **Tolerancja:** nieznany styl/ruch → domyślny; nieznana wartość w nadpisaniu → to pole nadpisania znika; reszta pliku się wczytuje.
- **Oszczędzanie:** tryb oszczędny i `prefers-reduced-motion: reduce` wyłączają smugi i linie prędkości; `reduced-motion` wyłącza też impakty.
- **Push** tylko po zgodzie użytkownika; skan prywatnych danych i push w osobnych krokach.
- Nie przełączać gałęzi bez `app/` podczas `pnpm tauri dev` użytkownika. Praca na gałęzi `looks`.

## Review Focus

1. **Plik ustawień z nowszej wersji** (styl `"hologram"`, ruch `"warp"`, nadpisanie z nieznaną wartością): reszta ustawień zostaje, zwierzaki rysują się w domyślnym stylu, zapis nie gubi innych pól. Test: task 1.
2. **Zmiana stylu lub ruchu w trakcie pracy:** zwierzaki nie znikają i nie witają się ponownie, zegar zwierzaka nie skacze (brak skoku fazy przy przełączeniu tempa). Test: task 7 (`tick` jest ciągły przy zmianie ruchu).
3. **Niska liczba klatek (tryb oszczędny, 10 kl./s, `dt` do 0,05 s) w Anime:** sprężyny nie eksplodują (brak NaN, wartości ograniczone). Test: task 7.
4. **Przywracanie stanu płótna:** style z poświatą, gradientem i pędzlem nie zostawiają `shadowBlur`, `filter` ani przesunięć dla kolejnego zwierzaka czy HUD. Test: task 6 (po `drawPet` stan kontekstu jak przed).
5. **Różne style obok siebie w pasku** (nadpisania per agent): wygląd jednego zwierzaka nie przecieka na następnego (`pen.st` ustawiany przy każdym `drawPet`). Test: task 4.

---

## Struktura plików

```
crates/pets-core/src/settings.rs      ZMIANA: Style, Motion, Overrides, LookOverride, or_default/or_none
app/src/types.ts                      ZMIANA: StyleId, MotionId, Look, pets
app/src/look.ts                       NOWY: STYLE_IDS, MOTION_IDS, defaultPets, appFor, lookFor, withOverride
app/src/renderer/color.ts             NOWY: parseColor, mix, lighten, darken, luma
app/src/renderer/testing.ts           ZMIANA: recorder obsługuje gradient i zwraca stan
app/src/styles/types.ts, index.ts     NOWY: StyleDef, STYLES, ACCENT
app/src/styles/{sketch,clean,sticker,pixel,neon,ink,pastel}.ts  NOWY
app/src/renderer/pen.ts               ZMIANA: pen.st, pen.ol, pen.accent, pen.fx, pen.squash; shp wg stylu
app/src/renderer/draw/{body,props,items}.ts  ZMIANA: OL → pen.ol, lw, kształt, twarz, dodatki
app/src/motion/types.ts, calm.ts, anime.ts, index.ts  NOWY: MotionDef, MOTIONS, effective
app/src/motion/tick.ts                NOWY: zegar zwierzaka, podkroki, mnożniki sprężyn
app/src/motion/fx.ts                  NOWY: linie prędkości, impakty, emotki poza ciałem
app/src/renderer/pet.ts               ZMIANA: stepPet(c, dt, t, spr?)
app/src/renderer/painter.ts           NOWY: PetPainter (warstwa, pixel, smugi, energia)
app/src/stage/stage.ts                ZMIANA: painter per wpis, lookFor, reduced-motion
app/src/panel/PetCanvas.tsx, App.tsx  ZMIANA: look, painter
app/src/settings/look/{loop.ts,PetsCanvas.tsx,LookGallery.tsx,LookTab.tsx}  NOWY
app/src/settings/SettingsView.tsx, Wizard.tsx, main.tsx, model.ts  ZMIANA
app/settings.html                     ZMIANA: CSS galerii
docs/looks-verification.md            NOWY
```

---

### Task 1: Ustawienia w rdzeniu (styl, ruch, nadpisania, migracja)

**Files:**
- Modify: `crates/pets-core/src/settings.rs`

**Interfaces:**
- Produces: JSON `pets: { style, motion, overrides: { claude_code?, codex?, agent_router? : { style?, motion? } }, max_visible }`; wartości stylu `sketch|clean|sticker|pixel|neon|ink|pastel`, ruchu `calm|anime`.

- [ ] **Step 1: Testy (na końcu modułu `tests`)**

```rust
    #[test]
    fn new_settings_look_like_the_app_icon() {
        let p = Settings::default().pets;
        assert_eq!((p.style, p.motion, p.overrides), (Style::Sticker, Motion::Calm, Overrides::default()));
    }

    fn load_str(json: &str) -> Loaded {
        let (_d, p) = tmp();
        std::fs::create_dir_all(p.parent().unwrap()).unwrap();
        std::fs::write(&p, json).unwrap();
        load(&p)
    }

    #[test]
    fn the_old_skin_field_becomes_the_style() {
        let l = load_str(r#"{"version":1,"pets":{"skin":"sketch","max_visible":4}}"#);
        assert!(l.error.is_none());
        assert_eq!((l.settings.pets.style, l.settings.pets.max_visible), (Style::Sketch, 4));
    }

    #[test]
    fn unknown_style_and_motion_fall_back_without_losing_the_rest() {
        let l = load_str(r#"{"version":1,"autostart":false,"pets":{"style":"hologram","motion":"warp","max_visible":3}}"#);
        assert!(l.error.is_none());
        assert_eq!((l.settings.pets.style, l.settings.pets.motion, l.settings.pets.max_visible), (Style::Sticker, Motion::Calm, 3));
        assert!(!l.settings.autostart);
    }

    #[test]
    fn an_unknown_override_value_drops_only_that_field() {
        let l = load_str(r#"{"version":1,"pets":{"overrides":{"codex":{"style":"x","motion":"anime"},"claude_code":{"style":"neon"}}}}"#);
        assert!(l.error.is_none());
        let o = l.settings.pets.overrides;
        assert_eq!(o.codex, Some(LookOverride { style: None, motion: Some(Motion::Anime) }));
        assert_eq!(o.claude_code, Some(LookOverride { style: Some(Style::Neon), motion: None }));
        assert_eq!(o.agent_router, None);
    }

    #[test]
    fn save_writes_style_never_skin_and_omits_empty_overrides() {
        let (_d, p) = tmp();
        let mut s = Settings::default();
        s.pets.style = Style::Clean;
        save(&p, &s).unwrap();
        let v: serde_json::Value = serde_json::from_slice(&std::fs::read(&p).unwrap()).unwrap();
        assert_eq!(v["pets"]["style"], "clean");
        assert_eq!(v["pets"]["motion"], "calm");
        assert!(v["pets"].get("skin").is_none());
        assert_eq!(v["pets"]["overrides"], serde_json::json!({}));
    }
```

W istniejących testach: `defaults_ask_nothing_of_the_network` porównuje `(s.pets.style, s.pets.max_visible, …)` z `(Style::Sticker, 5, …)`; `missing_fields_get_defaults` porównuje `l.settings.pets.style` z `Style::Clean` (plik nadal ma `"skin":"clean"` i sprawdza alias).

- [ ] **Step 2: Uruchom, oczekuj błędów kompilacji** (`Style`, `Motion`, `Overrides`, `LookOverride` nie istnieją)

Run: `cargo test -p pets-core settings`
Expected: FAIL (error[E0412]/E0433: cannot find type `Style`)

- [ ] **Step 3: Implementacja** (zastępuje `Pets`, `Skin` i `impl Default for Pets`)

```rust
#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq)]
#[serde(default)]
pub struct Pets {
    /// `skin` to nazwa z wersji 0.5 (tylko `sketch`/`clean`).
    #[serde(alias = "skin", deserialize_with = "or_default")]
    pub style: Style,
    #[serde(deserialize_with = "or_default")]
    pub motion: Motion,
    pub overrides: Overrides,
    pub max_visible: u8,
}

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq, Default)]
#[serde(rename_all = "snake_case")]
pub enum Style { Sketch, Clean, #[default] Sticker, Pixel, Neon, Ink, Pastel }

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq, Default)]
#[serde(rename_all = "snake_case")]
pub enum Motion { #[default] Calm, Anime }

/// Wygląd agenta inny niż domyślny; brak pola = „jak domyślny”.
#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq, Default)]
#[serde(default)]
pub struct Overrides {
    #[serde(skip_serializing_if = "Option::is_none")] pub claude_code: Option<LookOverride>,
    #[serde(skip_serializing_if = "Option::is_none")] pub codex: Option<LookOverride>,
    #[serde(skip_serializing_if = "Option::is_none")] pub agent_router: Option<LookOverride>,
}

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq, Default)]
#[serde(default)]
pub struct LookOverride {
    #[serde(skip_serializing_if = "Option::is_none", deserialize_with = "or_none")] pub style: Option<Style>,
    #[serde(skip_serializing_if = "Option::is_none", deserialize_with = "or_none")] pub motion: Option<Motion>,
}

impl Default for Pets {
    fn default() -> Self { Pets { style: Style::Sticker, motion: Motion::Calm, overrides: Overrides::default(), max_visible: 5 } }
}

/// Wartość z nowszej wersji (nieznany wariant) nie psuje wczytania całego pliku.
fn or_default<'de, D: serde::Deserializer<'de>, T: serde::de::DeserializeOwned + Default>(d: D) -> Result<T, D::Error> {
    let v = serde_json::Value::deserialize(d)?;
    Ok(serde_json::from_value(v).unwrap_or_default())
}

fn or_none<'de, D: serde::Deserializer<'de>, T: serde::de::DeserializeOwned>(d: D) -> Result<Option<T>, D::Error> {
    let v = serde_json::Value::deserialize(d)?;
    Ok(serde_json::from_value(v).ok())
}
```

- [ ] **Step 4: Testy przechodzą**

Run: `cargo test -p pets-core settings` i `cargo test --workspace`
Expected: PASS (w tym aplikacja Tauri, która nie używa `Skin`)

- [ ] **Step 5: Commit** `feat(core): pet style, motion and per-agent overrides in settings (reads the old skin field)`

---

### Task 2: Model wyglądu w TS (`look.ts`, typy, domyślne)

**Files:**
- Create: `app/src/look.ts`, `app/src/look.test.ts`
- Modify: `app/src/types.ts`, `app/src/settings/model.ts`, `app/src/settings/SettingsView.tsx`, `app/src/settings/Wizard.tsx`, `app/src/stage/stage.ts`, `app/src/panel/App.tsx`

**Interfaces:**
- Produces:
  - `type StyleId = 'sketch'|'clean'|'sticker'|'pixel'|'neon'|'ink'|'pastel'`, `type MotionId = 'calm'|'anime'`, `interface Look { style: StyleId; motion: MotionId }`, `type Pets = Settings['pets']` (w `types.ts`);
  - `STYLE_IDS: StyleId[]`, `MOTION_IDS: MotionId[]`, `defaultPets(): Pets`, `appFor(s: Pick<Session,'agent'|'origin'>): AppId`, `lookFor(p: Pets, app: AppId): Look`, `withOverride(p: Pets, app: AppId, field: 'style'|'motion', v: StyleId|MotionId|null): Pets`, `DEFAULT_LOOK: Look = { style: 'clean', motion: 'calm' }` (w `look.ts`).

- [ ] **Step 1: Testy `app/src/look.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { appFor, defaultPets, lookFor, withOverride } from './look';

describe('look', () => {
  it('new settings: sticker, calm, no overrides', () => {
    expect(defaultPets()).toEqual({ style: 'sticker', motion: 'calm', overrides: {}, max_visible: 5 });
  });
  it('maps a session to its app; router tasks win over the agent', () => {
    expect(appFor({ agent: 'claude', origin: 'cli' })).toBe('claude_code');
    expect(appFor({ agent: 'codex', origin: 'desktop' })).toBe('codex');
    expect(appFor({ agent: 'codex', origin: 'router' })).toBe('agent_router');
  });
  it('an override replaces only its own fields', () => {
    const p = { ...defaultPets(), overrides: { codex: { motion: 'anime' as const } } };
    expect(lookFor(p, 'codex')).toEqual({ style: 'sticker', motion: 'anime' });
    expect(lookFor(p, 'claude_code')).toEqual({ style: 'sticker', motion: 'calm' });
  });
  it('survives settings without overrides (older app build)', () => {
    const p = { style: 'neon', motion: 'calm', max_visible: 5 } as unknown as ReturnType<typeof defaultPets>;
    expect(lookFor(p, 'codex')).toEqual({ style: 'neon', motion: 'calm' });
  });
  it('withOverride sets a field and "like default" removes it, dropping empty entries', () => {
    let p = withOverride(defaultPets(), 'codex', 'style', 'pixel');
    expect(p.overrides).toEqual({ codex: { style: 'pixel' } });
    p = withOverride(p, 'codex', 'motion', 'anime');
    expect(p.overrides).toEqual({ codex: { style: 'pixel', motion: 'anime' } });
    p = withOverride(withOverride(p, 'codex', 'style', null), 'codex', 'motion', null);
    expect(p.overrides).toEqual({});
  });
});
```

- [ ] **Step 2: Run** `pnpm --dir app test look` → FAIL (moduł `./look` nie istnieje)

- [ ] **Step 3: Implementacja**

`types.ts`:

```ts
export type StyleId = 'sketch' | 'clean' | 'sticker' | 'pixel' | 'neon' | 'ink' | 'pastel';
export type MotionId = 'calm' | 'anime';
export interface Look { style: StyleId; motion: MotionId }
export interface Pets { style: StyleId; motion: MotionId; overrides: Partial<Record<AppId, Partial<Look>>>; max_visible: number }
// w Settings:
  pets: Pets;
```

`look.ts`:

```ts
import type { AppId, Look, MotionId, Pets, Session, StyleId } from './types';

export const STYLE_IDS: StyleId[] = ['sticker', 'sketch', 'clean', 'pixel', 'neon', 'ink', 'pastel'];
export const MOTION_IDS: MotionId[] = ['calm', 'anime'];
/** Wygląd bez ustawień: dokładnie rysunek prototypu v6 (testy parytetu). */
export const DEFAULT_LOOK: Look = { style: 'clean', motion: 'calm' };

/** Jak `Pets::default()` w rdzeniu. */
export const defaultPets = (): Pets => ({ style: 'sticker', motion: 'calm', overrides: {}, max_visible: 5 });

export function appFor(s: Pick<Session, 'agent' | 'origin'>): AppId {
  if (s.origin === 'router') return 'agent_router';
  return s.agent === 'codex' ? 'codex' : 'claude_code';
}

export function lookFor(p: Pets, app: AppId): Look {
  const o = p.overrides?.[app] ?? {};
  return { style: o.style ?? p.style, motion: o.motion ?? p.motion };
}

/** `null` = „Jak domyślny”: usuwa pole, a puste nadpisanie znika. */
export function withOverride(p: Pets, app: AppId, field: keyof Look, v: StyleId | MotionId | null): Pets {
  const cur: Partial<Look> = { ...(p.overrides?.[app] ?? {}) };
  if (v == null) delete cur[field]; else (cur as Record<string, string>)[field] = v;
  const overrides = { ...(p.overrides ?? {}) };
  if (Object.keys(cur).length) overrides[app] = cur; else delete overrides[app];
  return { ...p, overrides };
}
```

`model.ts`: `defaultSettings()` ma `pets: defaultPets()`.

Przejściowo (do taska 4) wywołania `pen.sketch = … .skin === 'sketch'` w `stage.ts`, `panel/App.tsx`, `Wizard.tsx` zmieniają się na `… .style === 'sketch'`. Wybór w `SettingsView` (zakładka `pets`) to `<select value={s.pets.style}>` z opcjami z `STYLE_IDS` i etykietą `STYLE_LABEL` (poniżej), kreator — radio z tych samych opcji. Etykiety w `look.ts`:

```ts
export const STYLE_LABEL: Record<StyleId, string> = {
  sticker: 'Naklejka', sketch: 'Szkic', clean: 'Czysty', pixel: 'Pixel-art', neon: 'Neon', ink: 'Tusz', pastel: 'Pastel',
};
export const MOTION_LABEL: Record<MotionId, string> = { calm: 'Spokojny', anime: 'Anime' };
```

- [ ] **Step 4: Run** `pnpm --dir app test` i `pnpm --dir app exec tsc --noEmit` → PASS, bez błędów typów

- [ ] **Step 5: Commit** `feat(ui): look model (style, motion, per-agent overrides) mirroring the core settings`

---

### Task 3: Kolory i nagrywający kontekst z gradientem

**Files:**
- Create: `app/src/renderer/color.ts`, `app/src/renderer/color.test.ts`
- Modify: `app/src/renderer/testing.ts`

**Interfaces:**
- Produces: `parseColor(c: string): [number,number,number,number] | null`, `mix(a: string, b: string, t: number): string`, `lighten(c, t)`, `darken(c, t)`, `luma(c): number` (0–1); wynik `rgb(r,g,b)` albo `rgba(r,g,b,a)`; nierozpoznany kolor wraca bez zmian. `recorder().ctx.createLinearGradient(...)` zwraca obiekt z `addColorStop`, który też jest logowany (`grad.addColorStop(0,#fff)`), a gradient w `fillStyle` loguje się jako `fillStyle=grad#<n>`.

- [ ] **Step 1: Testy**

```ts
import { describe, expect, it } from 'vitest';
import { darken, lighten, luma, mix, parseColor } from './color';
import { recorder } from './testing';

describe('color', () => {
  it('parses hex, short hex, rgb and rgba', () => {
    expect(parseColor('#D97757')).toEqual([217, 119, 87, 1]);
    expect(parseColor('#fff')).toEqual([255, 255, 255, 1]);
    expect(parseColor('rgb(1, 2, 3)')).toEqual([1, 2, 3, 1]);
    expect(parseColor('rgba(1,2,3,0.5)')).toEqual([1, 2, 3, 0.5]);
    expect(parseColor('papayawhip')).toBeNull();
  });
  it('mixes, lightens, darkens; keeps alpha; passes unknown colours through', () => {
    expect(mix('#000000', '#ffffff', 0.5)).toBe('rgb(128,128,128)');
    expect(lighten('#000', 1)).toBe('rgb(255,255,255)');
    expect(darken('#fff', 1)).toBe('rgb(0,0,0)');
    expect(mix('rgba(0,0,0,0.5)', '#fff', 0)).toBe('rgba(0,0,0,0.5)');
    expect(lighten('papayawhip', 0.5)).toBe('papayawhip');
  });
  it('luma of white is 1, of black 0', () => {
    expect(luma('#fff')).toBeCloseTo(1);
    expect(luma('#000')).toBeCloseTo(0);
  });
  it('the recorder supports linear gradients', () => {
    const r = recorder();
    const g = r.ctx.createLinearGradient(0, 0, 0, 10);
    g.addColorStop(0, '#fff');
    r.ctx.fillStyle = g;
    expect(r.log).toEqual(['createLinearGradient(0,0,0,10)', 'grad1.addColorStop(0,#fff)', 'fillStyle=grad1']);
  });
});
```

- [ ] **Step 2: Run** `pnpm --dir app test color` → FAIL (brak modułu)

- [ ] **Step 3: Implementacja `color.ts`**

```ts
// Proste operacje na kolorach dla stylów (Neon, Tusz, Pastel, Naklejka). Wyniki są zapamiętywane.
type RGBA = [number, number, number, number];
const cache = new Map<string, string>();

export function parseColor(c: string): RGBA | null {
  const s = c.trim();
  if (s[0] === '#') {
    const h = s.length === 4 ? [...s.slice(1)].map(d => d + d).join('') : s.slice(1);
    if (!/^[0-9a-f]{6}$/i.test(h)) return null;
    const n = parseInt(h, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 1];
  }
  const m = /^rgba?\(([^)]+)\)$/.exec(s);
  if (!m) return null;
  const p = m[1].split(',').map(v => Number(v.trim()));
  if (p.length < 3 || p.some(v => !Number.isFinite(v))) return null;
  return [p[0], p[1], p[2], p[3] ?? 1];
}

const out = ([r, g, b, a]: RGBA) => (a < 1 ? `rgba(${r},${g},${b},${a})` : `rgb(${r},${g},${b})`);

export function mix(a: string, b: string, t: number): string {
  const key = `${a}|${b}|${t}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const A = parseColor(a), B = parseColor(b);
  const r = !A || !B ? a : out([0, 1, 2].map(i => Math.round(A[i] + (B[i] - A[i]) * t)).concat(A[3]) as RGBA);
  if (cache.size > 4096) cache.clear();
  cache.set(key, r);
  return r;
}
export const lighten = (c: string, t: number) => mix(c, '#ffffff', t);
export const darken = (c: string, t: number) => mix(c, '#000000', t);
export function luma(c: string): number {
  const p = parseColor(c);
  return p ? (0.2126 * p[0] + 0.7152 * p[1] + 0.0722 * p[2]) / 255 : 0.5;
}
```

`testing.ts`, w `recorder()`: licznik gradientów i obsługa `createLinearGradient`; przypisanie obiektu gradientu loguje jego nazwę.

```ts
  let grads = 0;
  // w get:
      if (k === 'createLinearGradient') return (...a: unknown[]) => {
        log.push(`createLinearGradient(${a.map(r).join(',')})`);
        const name = `grad${++grads}`;
        return { name, addColorStop: (o: number, c: string) => { log.push(`${name}.addColorStop(${r(o)},${c})`); } };
      };
  // w set: wartość-obiekt z polem name loguje się jako name
    set: (_t, k: string, v) => { props[k] = v; log.push(`${k}=${typeof v === 'object' && v && 'name' in v ? (v as { name: string }).name : r(v)}`); return true; },
```

- [ ] **Step 4: Run** `pnpm --dir app test` → PASS (parytet bez zmian)

- [ ] **Step 5: Commit** `feat(renderer): colour helpers and gradient support in the recording context`

---

### Task 4: Rejestr stylów, `pen.st` i `drawPet(look)`: Szkic i Czysty

**Files:**
- Create: `app/src/styles/types.ts`, `app/src/styles/index.ts`, `app/src/styles/clean.ts`, `app/src/styles/sketch.ts`, `app/src/renderer/styles.test.ts`
- Modify: `app/src/renderer/pen.ts`, `app/src/renderer/draw/body.ts`, `app/src/renderer/draw/props.ts`, `app/src/renderer/draw/items.ts`, `app/src/renderer/index.ts`, `app/src/renderer/parity.test.ts`, `app/src/stage/stage.ts`, `app/src/panel/App.tsx`, `app/src/panel/PetCanvas.tsx`, `app/src/settings/Wizard.tsx`

**Interfaces:**
- Consumes: `Look`, `DEFAULT_LOOK`, `lookFor`, `appFor`, `defaultPets` (task 2); `mix`/`lighten`/`darken` (task 3).
- Produces:
  - `StyleDef` (poniżej), `STYLES: Record<StyleId, StyleDef>` — w tym tasku `sketch` i `clean`; pozostałe id wskazują tymczasowo na `clean` i dostają własne definicje w taskach 5, 6 i 8;
  - `ACCENT: Record<SkinId, string>` = `{ clawd: '#D97757', kodek: '#5DCAA5' }`;
  - `pen = { boil, sid, font, st: StyleDef, ol: string, accent: string, fx: boolean, squash: number }`;
  - `drawPet(x, c, X, Y, u, t, look?: Look)`;
  - `PetCanvas({ session, look })`.

```ts
// app/src/styles/types.ts
import type { SkinId } from '../skins';
import type { StyleId } from '../types';

export interface StyleDef {
  id: StyleId;
  /** kontur: najmniejsza grubość w px CSS i mnożnik dzisiejszej grubości 2,4·u */
  line: { minPx: number; scale: number };
  /** kolor konturu zwierzaka i rekwizytów; `accent` to kolor agenta */
  ink: (accent: string) => string;
  /** kolor konturu jednego kształtu liczony z jego wypełnienia (Pastel) */
  strokeFor?: (fill: string) => string;
  /** zmiana wypełnienia każdego kształtu (Neon, Tusz, Pastel) */
  fillFor?: (fill: string) => string;
  fill: 'flat' | 'gradient';
  glow?: boolean;
  brush?: boolean;
  softShadow?: boolean;
  /** Szkic: drganie konturu, przesunięcie wypełnienia i odstęp kreskowania, minima w px CSS */
  sketch?: { jitterPx: number; offsetPx: number; hatchGapPx: number };
  shape?: { radius?: Partial<Record<SkinId, number>>; flatSide?: boolean };
  face?: { smile?: boolean; blush?: boolean; eyes?: 'accent' };
  extras?: { ears?: boolean; phones?: boolean };
  /** Pixel-art: rozmiar „piksela” = max(minPx, perU·u) px CSS */
  pixel?: { perU: number; minPx: number };
}
```

```ts
// app/src/styles/clean.ts
import { OL } from '../renderer/palette';
import type { StyleDef } from './types';
/** Dzisiejszy rysunek bez szkicu: parytet z prototypem v6. */
export const clean: StyleDef = { id: 'clean', line: { minPx: 1, scale: 1 }, ink: () => OL, fill: 'flat' };
```

```ts
// app/src/styles/sketch.ts
import { OL } from '../renderer/palette';
import type { StyleDef } from './types';
/** Szkic prototypu z minimami w px CSS, żeby drganie i kreskowanie były widać w pasku (u = 0,3). */
export const sketch: StyleDef = {
  id: 'sketch', line: { minPx: 1, scale: 1 }, ink: () => OL, fill: 'flat',
  sketch: { jitterPx: 1.2, offsetPx: 0.9, hatchGapPx: 3 },
};
```

```ts
// app/src/styles/index.ts
import type { SkinId } from '../skins';
import type { StyleId } from '../types';
import { clean } from './clean';
import { sketch } from './sketch';
import type { StyleDef } from './types';
export type { StyleDef } from './types';
export const ACCENT: Record<SkinId, string> = { clawd: '#D97757', kodek: '#5DCAA5' };
export const STYLES: Record<StyleId, StyleDef> = {
  clean, sketch, sticker: clean, pixel: clean, neon: clean, ink: clean, pastel: clean,
};
```

- [ ] **Step 1: Testy `app/src/renderer/styles.test.ts`** i zmiana parytetu

```ts
import { describe, expect, it } from 'vitest';
import { createPet, drawPet, pen, setRng } from './index';
import { rrP, shp } from './pen';
import { STYLES } from '../styles';
import { recorder, seeded } from './testing';

setRng(seeded(5).next);
pen.font = 'x';

describe('styles', () => {
  it('sketch jitter is visible at taskbar scale (≥ 1.2 px wide, not 0.42)', () => {
    pen.st = STYLES.sketch;
    const rec = recorder();
    let worst = 0;
    for (pen.boil = 0; pen.boil < 20; pen.boil++) {
      rec.log.length = 0;
      shp(rec.ctx, rrP(0, 0, 30, 30, 0), '#fff', 0.3);
      for (const l of rec.log) {
        const m = /^(?:moveTo|lineTo)\(([-\d.]+),([-\d.]+)\)$/.exec(l);
        if (m) worst = Math.max(worst, Math.min(Math.abs(+m[1]), Math.abs(+m[1] - 30)), Math.min(Math.abs(+m[2]), Math.abs(+m[2] - 30)));
      }
    }
    pen.st = STYLES.clean;
    expect(worst).toBeGreaterThan(0.3);
  });
  it('each drawPet sets its own style; nothing leaks to the next pet', () => {
    const a = createPet('clawd', 'idle'), b = createPet('clawd', 'idle');
    const draw = (look?: Parameters<typeof drawPet>[6]) => { const r = recorder(); drawPet(r.ctx, look ? a : b, 50, 50, 0.3, 1, look); return r.log; };
    const plain = draw();
    draw({ style: 'sketch', motion: 'calm' });
    expect(draw()).toEqual(plain);
  });
});
```

`parity.test.ts`: `drawTrace` dostaje zamiast `sketch: (v) => void` parametr `look` dla portu: `api.draw(rec.ctx, c, 100, 150, u, T)` dla prototypu po `proto.setSK(sketch)` i `drawPet(rec.ctx, c, 100, 150, u, T, { style: sketch ? 'sketch' : 'clean', motion: 'calm' })` dla portu. Pętla pomija `sketch && u === 0.3` (celowa różnica, sprawdza ją test wyżej).

- [ ] **Step 2: Run** `pnpm --dir app test renderer` → FAIL (brak `../styles`, `pen.st`)

- [ ] **Step 3: Implementacja**

`pen.ts`:

```ts
import { clean } from "../styles/clean";
import type { StyleDef } from "../styles/types";
export const pen = { boil: 0, sid: 0, font: "sans-serif", st: clean as StyleDef, ol: OL, accent: '#D97757', fx: false, squash: 1 };
```

`shp` (zachowuje kolejność wywołań prototypu dla Czystego i Szkicu przy `u = 1`):

```ts
export function shp(x: any,p: any,fill: any,u: any,o?: any){o=o||{};const st=pen.st,sk=st.sketch,id=++pen.sid,
j=sk?Math.max(1.4*u,sk.jitterPx)*(o.j==null?1:o.j):0,s=pen.boil*977+id*131,f=fill&&st.fillFor?st.fillFor(fill):fill;
if(f){path(x,p,j,s);if(sk){const ox=Math.max(.9*u,sk.offsetPx);x.save();x.translate(ox,ox*7/9);}x.fillStyle=st.fill==='gradient'?grad(x,p,f):f;x.fill();if(sk)x.restore();}
if(o.hatch&&sk){x.save();path(x,p,0,0);x.clip();x.strokeStyle='rgba(43,29,22,0.3)';x.lineWidth=Math.max(.6,.9*u);x.beginPath();const bb=bbox(p),hh=bb[3]-bb[1],gap=Math.max(5*u,sk.hatchGapPx);for(let k=bb[0]-hh,g=0;k<bb[2]&&g<400;k+=gap,g++){x.moveTo(k,bb[3]);x.lineTo(k+hh,bb[1]);}x.stroke();x.restore();}
if(o.noStroke)return;
const deco=!!(st.strokeFor&&f)||!!st.glow;if(deco){x.save();if(st.strokeFor&&f)x.strokeStyle=st.strokeFor(f);if(st.glow){x.shadowColor=pen.ol;x.shadowBlur=Math.max(3,8*u);}}
path(x,p,j,s+17);x.stroke();
if(st.brush){x.save();x.lineWidth*=.5;x.translate(.5*Math.max(1,u*2),.4*Math.max(1,u*2));path(x,p,j,s+51);x.stroke();x.restore();}
if(deco)x.restore();
if(sk){x.save();x.globalAlpha*=.55;x.lineWidth*=.45;path(x,p,j*1.5,s+33);x.stroke();x.restore();}}
/** Naklejka: jaśniej u góry, ciemniej u dołu (gradient w obrysie kształtu). */
function grad(x: any,p: any,f: string){const b=bbox(p),g=x.createLinearGradient(0,b[1],0,b[3]);g.addColorStop(0,lighten(f,.22));g.addColorStop(.55,f);g.addColorStop(1,darken(f,.1));return g;}
```

Uwaga: `ox*7/9` przy `u = 1` daje `0.7` (zaokrąglenie rekordera do 0,001). W `hose`: `j=pen.st.sketch?Math.max(1.4*u,pen.st.sketch.jitterPx):0`. W `seg`, `lines`, `hose` i w `draw/{body,props,items}.ts` każde użycie identyfikatora `OL` jako koloru (`\bOL\b`, poza importem) zamienia się na `pen.ol` (import `pen` z `../pen`).

`body.ts`, początek `drawPet`:

```ts
export function drawPet(x: CanvasRenderingContext2D,c: Pet,X: number,Y: number,u: number,t: number,look?: Look){pen.sid=0;
const lk=look??DEFAULT_LOOK,st=STYLES[lk.style]??STYLES.clean;pen.st=st;pen.accent=ACCENT[c.type];pen.ol=st.ink(pen.accent);
```

i `lw=Math.max(st.line.minPx,2.4*u*st.line.scale)` w linii z `W,Dp,H,…`.

Wywołania:
- `stage.ts`: `let pets = defaultPets();`, w `onSettings`: `pets = s.pets; maxPets = s.pets.max_visible;` (bez `pen.sketch`), w pętli `drawPet(x, e.pet, p.x, Y, u, tt, lookFor(pets, appFor(e.session)))`;
- `PetCanvas`: prop `look: Look`, trzymany w `useRef` (efekt `[look]` aktualizuje ref), `drawPet(..., lookRef.current)`;
- `panel/App.tsx`: stan `pets` (`useState(defaultPets())`), słuchacz `pets://settings` i `settings_get` ustawiają `setPets(v.settings.pets)`; `PanelView` dostaje prop `pets?: Pets` (domyślnie `defaultPets()`) i przekazuje `look={lookFor(pets, appFor(s))}`;
- `Wizard.tsx`: bez efektu `pen.sketch`; podgląd `look={{ style: draft.pets.style, motion: draft.pets.motion }}`.

`renderer/index.ts` eksportuje też `STYLES` nie trzeba — konsumenci importują z `../styles`.

- [ ] **Step 4: Run** `pnpm --dir app test` i `pnpm --dir app exec tsc --noEmit` → PASS (parytet silnika i Czystego 100%, Szkic przy `u = 1`)

- [ ] **Step 5: Commit** `feat(renderer): style registry; sketch and clean as styles, sketch visible at taskbar scale`

---

### Task 5: Styl Naklejka (styl ikony)

**Files:**
- Create: `app/src/styles/sticker.ts`
- Modify: `app/src/styles/index.ts`, `app/src/renderer/draw/body.ts`, `app/src/renderer/styles.test.ts`

**Interfaces:**
- Consumes: `StyleDef.shape`, `.face`, `.extras`, `fill: 'gradient'` (task 4).

- [ ] **Step 1: Testy (w `styles.test.ts`)**

```ts
  const trace = (style: StyleId, skin: 'clawd' | 'kodek' = 'clawd', u = 0.3) => {
    const c = createPet(skin, 'edit');
    const r = recorder();
    drawPet(r.ctx, c, 60, 40, u, 1, { style, motion: 'calm' });
    return r.log;
  };
  it('sticker: at least 2 px outline in the taskbar and gradient fills', () => {
    const log = trace('sticker');
    const widths = log.filter(l => l.startsWith('lineWidth=')).map(l => +l.slice(10));
    expect(Math.max(...widths)).toBeGreaterThanOrEqual(2);
    expect(log.some(l => l.startsWith('createLinearGradient('))).toBe(true);
  });
  it('sticker: Clawd smiles and blushes, Kodek wears headphones', () => {
    expect(trace('sticker', 'clawd', 1).length).toBeGreaterThan(trace('clean', 'clawd', 1).length);
    const k = trace('sticker', 'kodek', 1).join('\n');
    expect(k).toContain('#E8E6E0'); // nauszniki
  });
```

(`StyleId` importowany z `../types`.)

- [ ] **Step 2: Run** `pnpm --dir app test styles` → FAIL (Naklejka = Czysty)

- [ ] **Step 3: Implementacja**

```ts
// app/src/styles/sticker.ts
import type { StyleDef } from './types';
/** Styl ikony aplikacji: gruby kontur, zaokrąglone bryły, gradient, uśmiech, rumieńce, uszka i słuchawki. */
export const sticker: StyleDef = {
  id: 'sticker', line: { minPx: 2, scale: 1.3 }, ink: () => '#1E1410', fill: 'gradient',
  shape: { radius: { clawd: 12, kodek: 22 }, flatSide: true },
  face: { smile: true, blush: true }, extras: { ears: true, phones: true },
};
```

`body.ts`:
- `R=(st.shape?.radius?.[c.type]??sk.radius)*u`;
- ściana boczna: `shp(x,rrP(-hW,top,hW*2,H,R),st.shape?.flatSide?cm:cs,u,{hatch:!st.shape?.flatSide})`;
- **uszka Clawda** (przed ścianą boczną, w `bodyT`): `if(st.extras?.ears&&c.type==='clawd')[-1,1].forEach(s=>shp(x,rrP(s>0?hW-3*u:-hW-7*u,top+H*.36,10*u,H*.3,3*u),cm,u));`
- **słuchawki Kodka** (po przedniej ścianie): `if(st.extras?.phones&&c.type==='kodek'){const yy=top+H*.45;[-1,1].forEach(s=>{shp(x,elP(s*hW,yy,6*u,11*u),'#E8E6E0',u);shp(x,elP(s*hW,yy,3*u,7*u),'#B9B6AE',u,{noStroke:1});});}`
- **uśmiech** (w pętli oczu, po oku, gdy `s>0`, tylko bez `screenFace`): `if(st.face?.smile&&!sk.screenFace&&s>0&&open>.3&&hp<.02){x.globalAlpha=GA*ea;x.lineWidth=Math.max(1,2.2*u);x.beginPath();x.arc(fcx,ey+eh*.45,5*u*co,.15*PI,.85*PI);x.stroke();}`
- **rumieńce zawsze**: warunek `hp>.02&&sk.blush` → `(hp>.02||st.face?.blush)&&sk.blush`, alfa `GA*ea*Math.max(hp,.75)*.6`.

`index.ts`: `sticker` zamiast `clean`.

- [ ] **Step 4: Run** `pnpm --dir app test` → PASS (parytet Czystego bez zmian)

- [ ] **Step 5: Commit** `feat(styles): sticker style in the app icon's look`

---

### Task 6: Style Neon, Tusz i Pastel

**Files:**
- Create: `app/src/styles/neon.ts`, `app/src/styles/ink.ts`, `app/src/styles/pastel.ts`
- Modify: `app/src/styles/index.ts`, `app/src/renderer/draw/body.ts`, `app/src/renderer/styles.test.ts`

**Interfaces:**
- Consumes: `fillFor`, `strokeFor`, `glow`, `brush`, `softShadow`, `face.eyes` (task 4).

- [ ] **Step 1: Testy**

```ts
  it('neon glows in the agent colour and restores the context', () => {
    const log = trace('neon');
    expect(log.some(l => l.startsWith('shadowBlur='))).toBe(true);
    expect(log.filter(l => l === 'save()').length).toBe(log.filter(l => l === 'restore()').length);
  });
  it('ink is greyscale with a black brush outline', () => {
    const log = trace('ink');
    expect(log).toContain('strokeStyle=#111111');
    const fills = log.filter(l => l.startsWith('fillStyle=rgb(')).map(l => l.slice(14, -1).split(',').map(Number));
    expect(fills.length).toBeGreaterThan(0);
    for (const [r, g, b] of fills) expect(Math.max(r, g, b) - Math.min(r, g, b)).toBeLessThanOrEqual(2);
  });
  it('pastel outlines take their fill hue and the shadow is soft', () => {
    const log = trace('pastel');
    expect(log.some(l => l.startsWith('filter=blur('))).toBe(true);
    expect(log).not.toContain('strokeStyle=#2B1D16');
  });
```

- [ ] **Step 2: Run** `pnpm --dir app test styles` → FAIL

- [ ] **Step 3: Implementacja**

```ts
// app/src/styles/neon.ts
import { lighten, mix } from '../renderer/color';
import type { StyleDef } from './types';
/** Ciemne bryły, kontur i oczy w kolorze agenta ze świeceniem. */
export const neon: StyleDef = {
  id: 'neon', line: { minPx: 1.5, scale: 1 }, ink: a => lighten(a, 0.25), fill: 'flat', glow: true,
  fillFor: f => mix(f, '#15131A', 0.84), face: { eyes: 'accent' },
};
```

```ts
// app/src/styles/ink.ts
import { luma } from '../renderer/color';
import type { StyleDef } from './types';
/** Tusz: jasne szarości z luminancji, czarny kontur pędzlem; akcent zostaje w oczach i efektach. */
export const ink: StyleDef = {
  id: 'ink', line: { minPx: 1.6, scale: 1.4 }, ink: () => '#111111', fill: 'flat', brush: true,
  fillFor: f => { const v = Math.round(200 + 55 * luma(f)); return `rgb(${v},${v},${v})`; },
};
```

```ts
// app/src/styles/pastel.ts
import { darken, lighten } from '../renderer/color';
import type { StyleDef } from './types';
/** Rozjaśnione barwy, kontur w odcieniu wypełnienia, miękki cień. */
export const pastel: StyleDef = {
  id: 'pastel', line: { minPx: 1, scale: 0.8 }, ink: () => '#9A8C84', fill: 'flat', softShadow: true,
  fillFor: f => lighten(f, 0.45), strokeFor: f => darken(f, 0.3),
};
```

`body.ts`:
- cień: `x.save();if(st.softShadow)x.filter=\`blur(${Math.max(1,3*u)}px)\`;x.fillStyle=…` (reszta jak było, `x.restore()` zdejmuje filtr);
- kolor oczu: `let ecol=st.face?.eyes==='accent'?pen.ol:'#1E1410';` (ekran Kodka nadal ustawia swój `ecol`).

- [ ] **Step 4: Run** `pnpm --dir app test` → PASS

- [ ] **Step 5: Commit** `feat(styles): neon, ink and pastel styles`

---

### Task 7: Ruch: definicje, zegar zwierzaka, sprężyny, squash, emotki w ciele

**Files:**
- Create: `app/src/motion/types.ts`, `app/src/motion/index.ts`, `app/src/motion/tick.ts`, `app/src/motion/tick.test.ts`
- Modify: `app/src/renderer/pet.ts`, `app/src/renderer/draw/body.ts`

**Interfaces:**
- Produces:
  - `MotionDef { id; tempo; spring: { k; d }; squash; trails; speedLines; impacts; emotes }`, `MOTIONS: Record<MotionId, MotionDef>`;
  - `effective(m: MotionDef, env: { saving: boolean; reduced: boolean }): MotionDef`;
  - `tick(c: Pet, dt: number, t0: number, m: MotionDef, animate: boolean): number` (zwraca zegar zwierzaka `c.clk`);
  - `stepPet(c, dt, t, spr?: { k: number; d: number })`;
  - `drawPet` ustawia `pen.squash = MOTIONS[look.motion].squash` i `pen.fx = MOTIONS[look.motion].emotes`.

```ts
// app/src/motion/index.ts
import type { MotionId } from '../types';
import type { MotionDef } from './types';
export type { MotionDef } from './types';
export const MOTIONS: Record<MotionId, MotionDef> = {
  calm: { id: 'calm', tempo: 1, spring: { k: 1, d: 1 }, squash: 1, trails: false, speedLines: false, impacts: false, emotes: false },
  anime: { id: 'anime', tempo: 1.4, spring: { k: 1.8, d: 0.7 }, squash: 1.6, trails: true, speedLines: true, impacts: true, emotes: true },
};
/** Tryb oszczędny: bez smug i linii. Wyłączone efekty animacji w Windows: także bez impaktów. */
export function effective(m: MotionDef, env: { saving: boolean; reduced: boolean }): MotionDef {
  if (!env.saving && !env.reduced) return m;
  return { ...m, trails: false, speedLines: false, impacts: m.impacts && !env.reduced };
}
```

- [ ] **Step 1: Testy `tick.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { K } from '../renderer/pose';
import { SCENES, createPet, setRng, stepPet } from '../renderer';
import { seeded } from '../renderer/testing';
import { MOTIONS, effective } from './index';
import { tick } from './tick';

const rng = seeded(3);
setRng(rng.next);

describe('motion', () => {
  it('calm tick = the old stepPet with the global clock', () => {
    // każdy zwierzak liczony osobno od tego samego ziarna (stepPet losuje akcje i mrugnięcia)
    rng.reset(3); const a = createPet('clawd', 'edit');
    let T = 0;
    for (let f = 0; f < 120; f++) { T += 1 / 60; stepPet(a, 1 / 60, T + 0.5); }
    rng.reset(3); const b = createPet('clawd', 'edit');
    T = 0;
    for (let f = 0; f < 120; f++) { T += 1 / 60; tick(b, 1 / 60, T + 0.5, MOTIONS.calm, true); }
    for (const k of K) expect(b.p[k].x).toBeCloseTo(a.p[k].x, 9);
  });
  it('anime runs the pet clock faster and stays finite at 10 fps in every scene', () => {
    for (const scene of Object.keys(SCENES)) {
      const c = createPet('kodek', scene);
      let T = 0;
      for (let f = 0; f < 200; f++) { T += 0.05; tick(c, 0.05, T, MOTIONS.anime, true); }
      for (const k of K) expect(Number.isFinite(c.p[k].x) && Math.abs(c.p[k].x) < 1e4, `${scene}/${k}`).toBe(true);
      expect(c.clk).toBeCloseTo(0.05 + 199 * 0.05 * 1.4, 6);
    }
  });
  it('switching motion keeps the clock continuous', () => {
    const c = createPet('clawd', 'idle');
    tick(c, 0.1, 5, MOTIONS.calm, true);
    const before = c.clk;
    tick(c, 0.1, 5.1, MOTIONS.anime, true);
    expect(c.clk - before).toBeCloseTo(0.14, 9);
  });
  it('anime springs overshoot where calm ones do not jump as far', () => {
    const peak = (m: typeof MOTIONS.calm) => { rng.reset(9); const c = createPet('clawd', 'idle'); let T = 0, top = 0;
      c.p.armR.x = 0; for (let f = 0; f < 60; f++) { T += 1 / 60; tick(c, 1 / 60, T, m, true); top = Math.max(top, c.p.armR.x); } return top; };
    expect(peak(MOTIONS.anime)).not.toBeCloseTo(peak(MOTIONS.calm), 3);
  });
  it('saving and reduced motion switch the costly effects off', () => {
    expect(effective(MOTIONS.anime, { saving: true, reduced: false })).toMatchObject({ trails: false, speedLines: false, impacts: true, emotes: true });
    expect(effective(MOTIONS.anime, { saving: false, reduced: true })).toMatchObject({ trails: false, speedLines: false, impacts: false });
  });
});
```

- [ ] **Step 2: Run** `pnpm --dir app test motion` → FAIL (brak modułów)

- [ ] **Step 3: Implementacja**

```ts
// app/src/motion/tick.ts
import { stepPet, type Pet } from '../renderer';
import type { MotionDef } from './types';
const STEP = 1 / 60;
/** Zegar zwierzaka biegnie z tempem ruchu; Anime liczy sprężyny w podkrokach ≤ 1/60 s (stabilność przy 10 kl./s). */
export function tick(c: Pet, dt: number, t0: number, m: MotionDef, animate: boolean): number {
  const prev: number = c.clk ?? t0 - dt * m.tempo;
  const d = dt * m.tempo;
  c.clk = prev + d;
  if (!animate) return c.clk;
  if (m.id === 'calm') { stepPet(c, dt, c.clk); return c.clk; }
  const n = Math.max(1, Math.ceil(d / STEP - 1e-9));
  for (let i = 1; i <= n; i++) stepPet(c, d / n, prev + d * i / n, m.spring);
  return c.clk;
}
```

Uwaga: przy pierwszym wywołaniu `c.clk = t0` (tak jak dzisiejsze `T + phase`).

`pet.ts`: `export function stepPet(c: any,dt: any,t: any,spr?: {k:number;d:number}){const sk=spr?.k??1,sd=spr?.d??1;…s.v+=((tg[k]-s.x)*sp[0]*sk-s.v*sp[1]*sd)*dt;…}` (mnożenie przez 1 zachowuje parytet).

`body.ts`:
- `const m=MOTIONS[lk.motion]??MOTIONS.calm;pen.squash=m.squash;pen.fx=m.emotes;` po ustawieniu stylu;
- `h*=hw;sq*=hw*pen.squash;`
- gwiazdki w oczach (po rysowaniu oka, gdy `pen.fx&&hp>.3`): `x.globalAlpha=GA*ea*hp;x.fillStyle='#FFFFFF';x.font=\`${Math.max(6,10*u)}px ${pen.font}\`;x.textAlign='center';x.textBaseline='middle';x.fillText('✦',ex+ew*.5,ey-eh*.35);`

- [ ] **Step 4: Run** `pnpm --dir app test` → PASS (parytet bez zmian: `drawPet` bez `look` → Spokojny)

- [ ] **Step 5: Commit** `feat(motion): calm and anime motion (pet clock, springier springs, squash, sparkly eyes)`

---

### Task 8: `PetPainter`: warstwa poza ekranem i styl Pixel-art

**Files:**
- Create: `app/src/renderer/painter.ts`, `app/src/renderer/painter.test.ts`, `app/src/styles/pixel.ts`
- Modify: `app/src/styles/index.ts`

**Interfaces:**
- Consumes: `tick`, `MOTIONS`, `effective` (task 7), `STYLES` (tasks 4–6).
- Produces:

```ts
export interface PaintFrame { dt: number; t0: number; X: number; Y: number; u: number; look: Look; animate: boolean; saving: boolean; reduced: boolean; dpr: number }
export interface Surface { canvas: CanvasImageSource & { width: number; height: number }; ctx: CanvasRenderingContext2D }
export type SurfaceFactory = (w: number, h: number) => Surface;
export class PetPainter {
  constructor(pet: Pet, make?: SurfaceFactory);
  readonly pet: Pet;
  energy: number;           // wygładzona prędkość ruchu (jednostki zwierzaka / s)
  frame(x: CanvasRenderingContext2D, f: PaintFrame): void;
}
export const BOX = { l: 160, r: 170, t: 190, b: 20 };  // obszar zwierzaka w jednostkach u wokół (X, Y)
export const TRAIL_SPEED = 55;
```

- [ ] **Step 1: Testy `painter.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { createPet, pen, setRng } from './index';
import { PetPainter, type SurfaceFactory } from './painter';
import { recorder, seeded } from './testing';

setRng(seeded(4).next);
pen.font = 'x';
const fake: SurfaceFactory = (w, h) => ({ canvas: { width: w, height: h } as HTMLCanvasElement, ctx: recorder().ctx });
const frame = { dt: 1 / 30, t0: 1, X: 60, Y: 40, u: 0.3, animate: true, saving: false, reduced: false, dpr: 1 };

describe('PetPainter', () => {
  it('draws straight onto the stage for vector styles in calm motion', () => {
    const r = recorder();
    new PetPainter(createPet('clawd', 'edit'), fake).frame(r.ctx, { ...frame, look: { style: 'clean', motion: 'calm' } });
    expect(r.log.some(l => l.startsWith('drawImage('))).toBe(false);
    expect(r.log.some(l => l.startsWith('lineTo('))).toBe(true);
  });
  it('pixel art draws a small layer scaled up without smoothing', () => {
    const r = recorder();
    new PetPainter(createPet('clawd', 'edit'), fake).frame(r.ctx, { ...frame, look: { style: 'pixel', motion: 'calm' } });
    expect(r.log).toContain('imageSmoothingEnabled=false');
    const di = r.log.find(l => l.startsWith('drawImage('))!;
    expect(di).toBeDefined();
  });
  it('trails show earlier frames only while the pet moves fast', () => {
    const p = new PetPainter(createPet('clawd', 'bash'), fake);
    const look = { style: 'clean' as const, motion: 'anime' as const };
    let ghosts = 0;
    for (let f = 0; f < 60; f++) {
      const r = recorder();
      p.frame(r.ctx, { ...frame, t0: 1 + f / 30, look });
      if (r.log.filter(l => l.startsWith('drawImage(')).length > 1) ghosts++;
    }
    expect(ghosts).toBeGreaterThan(0);
    const still = new PetPainter(createPet('clawd', 'sleep'), fake);
    for (let f = 0; f < 30; f++) { const r = recorder(); still.frame(r.ctx, { ...frame, t0: 1 + f / 30, look }); if (f > 10) expect(r.log.filter(l => l.startsWith('drawImage(')).length).toBe(1); }
  });
  it('power saving draws anime without trails', () => {
    const p = new PetPainter(createPet('clawd', 'bash'), fake);
    for (let f = 0; f < 30; f++) {
      const r = recorder();
      p.frame(r.ctx, { ...frame, t0: 1 + f / 30, saving: true, look: { style: 'clean', motion: 'anime' } });
      expect(r.log.some(l => l.startsWith('drawImage('))).toBe(false);
    }
  });
});
```

- [ ] **Step 2: Run** `pnpm --dir app test painter` → FAIL

- [ ] **Step 3: Implementacja**

```ts
// app/src/styles/pixel.ts
import { OL } from '../renderer/palette';
import type { StyleDef } from './types';
/** Rysowany na małym płótnie i powiększany bez wygładzania (PetPainter). */
export const pixel: StyleDef = { id: 'pixel', line: { minPx: 1, scale: 1 }, ink: () => OL, fill: 'flat', pixel: { perU: 6, minPx: 2 } };
```

```ts
// app/src/renderer/painter.ts
import { MOTIONS, effective } from '../motion';
import { drawFx } from '../motion/fx';
import { tick } from '../motion/tick';
import { STYLES } from '../styles';
import type { Look } from '../types';
import { drawPet } from './draw/body';
import type { Pet } from './pet';

export interface PaintFrame { dt: number; t0: number; X: number; Y: number; u: number; look: Look; animate: boolean; saving: boolean; reduced: boolean; dpr: number }
export interface Surface { canvas: CanvasImageSource & { width: number; height: number }; ctx: CanvasRenderingContext2D }
export type SurfaceFactory = (w: number, h: number) => Surface;
interface Layer extends Surface { ox: number; oy: number; w: number; h: number }

export const BOX = { l: 160, r: 170, t: 190, b: 20 };
export const TRAIL_SPEED = 55;
const GHOST = [0.14, 0.24, 0.38];

const domSurface: SurfaceFactory = (w, h) => {
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  return { canvas, ctx: canvas.getContext('2d')! };
};

/** Jedno wejście rysowania zwierzaka: zegar ruchu, styl, warstwa (Pixel-art, smugi) i efekty Anime. */
export class PetPainter {
  energy = 0;
  private ring: Layer[] = [];
  private prev: number[][] | null = null;
  constructor(readonly pet: Pet, private make: SurfaceFactory = domSurface) {}

  frame(x: CanvasRenderingContext2D, f: PaintFrame): void {
    const base = MOTIONS[f.look.motion] ?? MOTIONS.calm, m = effective(base, f), st = STYLES[f.look.style] ?? STYLES.clean;
    const t = tick(this.pet, f.dt, f.t0, base, f.animate);
    if (!st.pixel && !m.trails) {
      this.ring.length = 0;
      drawPet(x, this.pet, f.X, f.Y, f.u, t, f.look);
      this.measure(f.dt);
      drawFx(x, this.pet, f.X, f.Y, f.u, t, m, this.energy);
      return;
    }
    const res = st.pixel ? 1 / Math.max(st.pixel.minPx, st.pixel.perU * f.u) : f.dpr;
    const w = (BOX.l + BOX.r) * f.u, h = (BOX.t + BOX.b) * f.u, ox = f.X - BOX.l * f.u, oy = f.Y - BOX.t * f.u;
    const keep = m.trails ? GHOST.length + 1 : 1;
    const ghosts = m.trails ? this.ring.slice(-GHOST.length) : [];
    const layer = this.take(Math.ceil(w * res), Math.ceil(h * res), keep);
    layer.ctx.setTransform(1, 0, 0, 1, 0, 0);
    layer.ctx.clearRect(0, 0, layer.canvas.width, layer.canvas.height);
    layer.ctx.setTransform(res, 0, 0, res, -ox * res, -oy * res);
    drawPet(layer.ctx, this.pet, f.X, f.Y, f.u, t, f.look);
    Object.assign(layer, { ox, oy, w, h });
    this.measure(f.dt);
    x.save();
    if (st.pixel) x.imageSmoothingEnabled = false;
    if (this.energy > TRAIL_SPEED) ghosts.forEach((g, i) => {
      x.globalAlpha = GHOST[GHOST.length - ghosts.length + i];
      x.drawImage(g.canvas, g.ox, g.oy, g.w, g.h);
    });
    x.globalAlpha = 1;
    x.drawImage(layer.canvas, ox, oy, w, h);
    x.restore();
    this.ring.push(layer);
    drawFx(x, this.pet, f.X, f.Y, f.u, t, m, this.energy);
  }

  /** Najstarsza warstwa (nie jest wśród duchów tej klatki) wraca do użytku; nowa tylko przy niepełnej puli. */
  private take(pw: number, ph: number, keep: number): Layer {
    const l = this.ring.length >= keep ? this.ring.shift() : undefined;
    while (this.ring.length > keep - 1) this.ring.shift(); // ruch zmienił się z Anime na Spokojny
    if (!l) return { ...this.make(pw, ph), ox: 0, oy: 0, w: 0, h: 0 };
    if (l.canvas.width !== pw || l.canvas.height !== ph) { l.canvas.width = pw; l.canvas.height = ph; }
    return l;
  }

  /** Energia = największa prędkość dłoni albo ciała, wygładzona. */
  private measure(dt: number): void {
    const hands: number[][] = this.pet.hand ?? [];
    let raw = 0;
    if (this.prev && dt > 0) {
      hands.forEach((p, i) => { const q = this.prev![i]; if (q) raw = Math.max(raw, Math.hypot(p[0] - q[0], p[1] - q[1]) / dt); });
      raw = Math.max(raw, Math.abs(this.pet.p.lx.v), Math.abs(this.pet.p.th.v) * 40);
    }
    this.prev = hands.map(p => [p[0], p[1]]);
    this.energy = this.energy * 0.7 + raw * 0.3;
  }
}
```

Uwaga: `canvas.width = …` na obiekcie z fabryki testowej działa (zwykłe pole). W tym tasku `drawFx` to pusta funkcja w `app/src/motion/fx.ts`: `export function drawFx(..._a: unknown[]): void {}` — treść dostaje w tasku 9. `styles/index.ts`: `pixel` zamiast `clean`.

- [ ] **Step 4: Run** `pnpm --dir app test` → PASS

- [ ] **Step 5: Commit** `feat(renderer): PetPainter with an offscreen layer; pixel-art style and anime trails`

---

### Task 9: Efekty Anime: linie prędkości, impakty, emotki

**Files:**
- Modify: `app/src/motion/fx.ts`
- Create: `app/src/motion/fx.test.ts`

**Interfaces:**
- Produces: `drawFx(x, c: Pet, X, Y, u, t, m: MotionDef, energy: number): void`. Rysuje w przestrzeni sceny wokół `(X + c.p.lx.x·u, Y)`; dłonie z `c.hand` (jednostki zwierzaka). Pamięta w zwierzaku `c.fxSt` (poprzednia scena) i `c.fxDoneAt`.

- [ ] **Step 1: Testy**

```ts
import { describe, expect, it } from 'vitest';
import { createPet, drawPet, pen, setRng, setScene, stepPet } from '../renderer';
import { recorder, seeded } from '../renderer/testing';
import { MOTIONS } from './index';
import { drawFx } from './fx';

setRng(seeded(8).next);
pen.font = 'x';
const warm = (scene: string) => { const c = createPet('clawd', scene); for (let f = 0; f < 60; f++) stepPet(c, 1 / 60, f / 60);
  drawPet(recorder().ctx, c, 60, 40, 0.3, 1); return c; };

describe('anime fx', () => {
  it('draws nothing in calm motion', () => {
    const r = recorder();
    drawFx(r.ctx, warm('edit'), 60, 40, 0.3, 1, MOTIONS.calm, 999);
    expect(r.log).toEqual([]);
  });
  it('typing gets speed lines', () => {
    const r = recorder();
    drawFx(r.ctx, warm('edit'), 60, 40, 0.3, 1, MOTIONS.anime, 100);
    expect(r.log.filter(l => l.startsWith('lineTo(')).length).toBeGreaterThanOrEqual(4);
  });
  it('an error gets a sweat drop and an anger mark; waiting gets a big "!"', () => {
    const e = recorder(); drawFx(e.ctx, warm('error'), 60, 40, 0.3, 1, MOTIONS.anime, 0);
    expect(e.log.some(l => l.startsWith('quadraticCurveTo('))).toBe(true);
    expect(e.log).toContain('strokeStyle=#E24B4A');
    const n = recorder(); drawFx(n.ctx, warm('needs'), 60, 40, 0.3, 1, MOTIONS.anime, 0);
    expect(n.log.some(l => l.startsWith('fillText(!,'))).toBe(true);
  });
  it('finishing bursts once, briefly', () => {
    const c = warm('edit');
    drawFx(recorder().ctx, c, 60, 40, 0.3, 1, MOTIONS.anime, 0);
    setScene(c, 'done');
    const a = recorder(); drawFx(a.ctx, c, 60, 40, 0.3, 1.02, MOTIONS.anime, 0);
    const b = recorder(); drawFx(b.ctx, c, 60, 40, 0.3, 1.5, MOTIONS.anime, 0);
    const rays = (l: string[]) => l.filter(v => v.startsWith('moveTo(')).length;
    expect(rays(a.log)).toBeGreaterThanOrEqual(8);
    expect(rays(b.log)).toBeLessThan(8);
  });
  it('without speed lines and impacts (power saving) only emotes remain', () => {
    const r = recorder();
    drawFx(r.ctx, warm('edit'), 60, 40, 0.3, 1, { ...MOTIONS.anime, speedLines: false, impacts: false }, 100);
    expect(r.log).toEqual([]);
  });
});
```

- [ ] **Step 2: Run** `pnpm --dir app test fx` → FAIL

- [ ] **Step 3: Implementacja**

```ts
// app/src/motion/fx.ts
import { PI, TAU, cl } from '../renderer/math';
import { pen } from '../renderer/pen';
import type { Pet } from '../renderer/pet';
import type { MotionDef } from './types';

const HIT = 20 / TAU; // takt uderzeń klawiszy (sin(t·20) w scenach pisania)

/** Efekty Anime rysowane poza ciałem: linie prędkości, impakty, wybuch po skończeniu, emotki. */
export function drawFx(x: CanvasRenderingContext2D, c: Pet, X: number, Y: number, u: number, t: number, m: MotionDef, energy: number): void {
  if (c.fxSt !== c.st) { if (c.st === 'done' && c.fxSt != null) c.fxDoneAt = t; c.fxSt = c.st; }
  if (!m.speedLines && !m.impacts && !m.emotes) return;
  const P = c.p, XX = X + P.lx.x * u, lw = Math.max(1, 1.6 * u), a = c.alpha ?? 1;
  const hands: number[][] = c.hand ?? [];
  const line = (x1: number, y1: number, x2: number, y2: number) => { x.moveTo(x1, y1); x.lineTo(x2, y2); };
  const begin = (col: string, alpha: number) => { x.save(); x.globalAlpha = a * alpha; x.strokeStyle = col; x.lineWidth = lw; x.lineCap = 'round'; x.beginPath(); };
  const end = () => { x.stroke(); x.restore(); };

  if (m.speedLines && cl(P.typeW.x) > 0.5 && energy > 20) {
    begin(pen.ol, 0.55);
    hands.forEach(([hx, hy], i) => { for (let k = 0; k < 2; k++) { const y = Y + (hy - 4 + k * 7) * u, x0 = XX + (hx + (i ? 10 : -10)) * u;
      line(x0, y, x0 + (i ? 1 : -1) * (8 + 5 * k) * u, y); } });
    end();
  }
  if (m.speedLines && cl(P.walkW.x) > 0.5) { begin(pen.ol, 0.45); for (let k = 0; k < 3; k++) line(XX - (70 + 6 * k) * u, Y - (20 + 14 * k) * u, XX - (90 + 10 * k) * u, Y - (20 + 14 * k) * u); end(); }
  if (m.speedLines && cl(P.hopW.x) > 0.5 && (c.hp % 1) < 0.3) { begin(pen.ol, 0.45); for (let k = -1; k <= 1; k++) line(XX + k * 22 * u, Y + 2 * u, XX + k * 22 * u, Y + 12 * u); end(); }

  if (m.impacts && cl(P.typeW.x) > 0.5 && hands[1]) {
    const ph = t * HIT, beat = Math.floor(ph);
    if (beat % 3 === 0 && ph - beat < 0.35) {
      const [hx, hy] = hands[1], cx = XX + hx * u, cy = Y + (hy + 4) * u;
      begin('#EF9F27', 0.9);
      for (let k = 0; k < 4; k++) { const an = -PI / 2 + (k - 1.5) * 0.5; line(cx + Math.cos(an) * 5 * u, cy + Math.sin(an) * 5 * u, cx + Math.cos(an) * 12 * u, cy + Math.sin(an) * 12 * u); }
      end();
    }
  }
  if (m.impacts && c.fxDoneAt != null && t - c.fxDoneAt < 0.15) {
    begin('#EF9F27', 0.9);
    for (let k = 0; k < 10; k++) { const an = TAU * k / 10; line(XX + Math.cos(an) * 55 * u, Y - 40 * u + Math.sin(an) * 45 * u, XX + Math.cos(an) * 80 * u, Y - 40 * u + Math.sin(an) * 65 * u); }
    end();
  }

  if (!m.emotes) return;
  const head = Y - 85 * u, bob = Math.abs(Math.sin(t * 8));
  if (c.st === 'error') {
    x.save(); x.globalAlpha = a; x.fillStyle = '#85B7EB'; x.strokeStyle = pen.ol; x.lineWidth = Math.max(0.8, u);
    const dx = XX + 48 * u, dy = head + 10 * u + (t * 30 % 12) * u;
    x.beginPath(); x.moveTo(dx, dy - 7 * u); x.quadraticCurveTo(dx + 6 * u, dy + 2 * u, dx, dy + 4 * u); x.quadraticCurveTo(dx - 6 * u, dy + 2 * u, dx, dy - 7 * u); x.fill(); x.stroke();
    x.restore();
    begin('#E24B4A', 1); x.lineWidth = Math.max(1.2, 2.2 * u);
    const vx = XX - 38 * u, vy = head;
    for (let k = 0; k < 4; k++) { const an = k * PI / 2 + PI / 4; x.moveTo(vx + Math.cos(an) * 3 * u, vy + Math.sin(an) * 3 * u); x.arc(vx + Math.cos(an) * 7 * u, vy + Math.sin(an) * 7 * u, 4 * u, an + PI * 0.75, an + PI * 1.25); }
    end();
  }
  if (c.st === 'needs') {
    x.save(); x.globalAlpha = a; x.fillStyle = '#EF9F27'; x.strokeStyle = pen.ol; x.lineWidth = Math.max(1, 2 * u);
    x.font = `900 ${Math.max(12, 34 * u)}px ${pen.font}`; x.textAlign = 'center'; x.textBaseline = 'bottom';
    const yy = head - 18 * u - bob * 8 * u;
    x.strokeText('!', XX + 40 * u, yy); x.fillText('!', XX + 40 * u, yy);
    x.restore();
  }
}
```

`Pet` ma już indeks `[key: string]: any`, więc `fxSt`, `fxDoneAt`, `clk` nie wymagają zmian typu.

- [ ] **Step 4: Run** `pnpm --dir app test` → PASS

- [ ] **Step 5: Commit** `feat(motion): anime speed lines, impacts, finish burst and manga emotes`

---

### Task 10: Scena w pasku i panel przez `PetPainter`

**Files:**
- Modify: `app/src/stage/stage.ts`, `app/src/panel/PetCanvas.tsx`, `app/src/panel/App.tsx`, `app/src/stage/power.ts`, `app/src/stage/power.test.ts`

**Interfaces:**
- Consumes: `PetPainter`, `PaintFrame` (task 8), `lookFor`, `appFor` (task 2).
- Produces: `reducedMotion(): boolean` w `stage/power.ts` (`matchMedia('(prefers-reduced-motion: reduce)')`, `false` bez `matchMedia`); `setPetSaving(saving: boolean)` w `PetCanvas.tsx` (zamiast `setPetFps`, ustawia też fps).

- [ ] **Step 1: Test `power.test.ts`**

```ts
  it('reduced motion follows the media query and is off without matchMedia', () => {
    expect(reducedMotion()).toBe(false);
    const g = globalThis as unknown as { matchMedia?: (q: string) => { matches: boolean } };
    g.matchMedia = q => ({ matches: q.includes('reduce') });
    expect(reducedMotion()).toBe(true);
    delete g.matchMedia;
  });
```

- [ ] **Step 2: Run** `pnpm --dir app test power` → FAIL

- [ ] **Step 3: Implementacja**

`power.ts`:

```ts
/** Windows „Efekty animacji: wyłączone” → bez smug, linii prędkości i impaktów (spec wyglądu, 4). */
export function reducedMotion(): boolean {
  const mm = (globalThis as { matchMedia?: (q: string) => { matches: boolean } }).matchMedia;
  return mm ? mm('(prefers-reduced-motion: reduce)').matches : false;
}
```

`stage.ts`: `const painters = new WeakMap<Entry, PetPainter>()`; zmienne `saving` (z `onPower`) i `reduced = reducedMotion()` (odświeżane co sekundę w istniejącym `setInterval`). W pętli zamiast `stepPet`/`drawPet`:

```ts
      let painter = painters.get(e);
      if (!painter) { painter = new PetPainter(e.pet); painters.set(e, painter); }
      e.pet.alpha = roster.alpha(e, T);
      painter.frame(x, { dt, t0: T + e.phase, X: p.x, Y, u, look: lookFor(pets, appFor(e.session)), animate: budget.animate(e.session.state),
        saving, reduced, dpr: devicePixelRatio || 1 });
```

`PetCanvas.tsx`: trzyma `PetPainter` w `useRef`; `fps` i `saving` modułowe, ustawiane przez `setPetSaving`; klatka: `painter.frame(x, { dt: acc, t0: T, X, Y, u: U, look: lookRef.current, animate: true, saving, reduced: reducedMotion(), dpr: d })`, a `pen.boil = Math.floor(T * 8)` przed rysowaniem zostaje jak dziś. `panel/App.tsx`: `setPetSaving(saving)` zamiast `setPetFps(frameBudget(saving).fps)`.

- [ ] **Step 4: Run** `pnpm --dir app test` i `pnpm --dir app exec tsc --noEmit` → PASS

- [ ] **Step 5: Ręcznie:** `pnpm --dir app dev`, `http://localhost:1420/dev.html` — zwierzaki w Naklejce (domyślny wygląd), bez błędów w konsoli.

- [ ] **Step 6: Commit** `feat: stage and panel draw pets through PetPainter with per-agent looks`

---

### Task 11: Galeria wyglądu i zakładka „Wygląd”

**Files:**
- Create: `app/src/settings/look/loop.ts`, `app/src/settings/look/PetsCanvas.tsx`, `app/src/settings/look/LookGallery.tsx`, `app/src/settings/look/LookTab.tsx`
- Modify: `app/src/settings/SettingsView.tsx`, `app/src/settings/main.tsx`, `app/src/settings/views.test.tsx`, `app/settings.html`

**Interfaces:**
- Consumes: `PetPainter`, `STYLE_IDS`, `STYLE_LABEL`, `MOTION_IDS`, `MOTION_LABEL`, `lookFor`, `withOverride`, `APP_LABEL`.
- Produces:
  - `subscribe(fn: (dt: number) => void): () => void`, `setLoopSaving(saving: boolean)` (`loop.ts`);
  - `PetsCanvas({ pets: { agent: Agent; look: Look }[]; scene: SceneKey; u: number; width: number; height: number; className?: string })`;
  - `LookGallery({ style, motion, scene, compact?, onPick(style) })`;
  - `LookTab({ pets, onChange(pets) })`;
  - zakładka `Tab = 'look'` (etykieta „Wygląd”) zamiast `'pets'`.

- [ ] **Step 1: Testy widoków (`views.test.tsx`)**

```ts
  it('look tab: seven style cards, the chosen one checked, motion switch and per-agent overrides', () => {
    const s = defaultSettings();
    const html = renderToString(<SettingsView settings={s} rows={rows} diag={diag} tab="look" onTab={() => {}}
      onChange={() => {}} onIntegration={async () => ''} message={null} />);
    for (const name of ['Naklejka', 'Szkic', 'Czysty', 'Pixel-art', 'Neon', 'Tusz', 'Pastel']) expect(html).toContain(name);
    expect(html).toMatch(/<button[^>]*aria-checked="true"[^>]*look-card[^>]*><canvas[^>]*><\/canvas><span>Naklejka<\/span>/);
    expect(html).toContain('Spokojny');
    expect(html).toContain('Anime');
    expect(html).toContain('Osobno dla agentów');
    expect(html).toContain('Jak domyślny');
    expect(html).toContain('Tak wygląda w pasku');
    expect(html).toContain('Najwięcej zwierzaków w pasku');
  });
```

- [ ] **Step 2: Run** `pnpm --dir app test views` → FAIL

- [ ] **Step 3: Implementacja**

```ts
// app/src/settings/look/loop.ts
// Jedna pętla klatek dla wszystkich podglądów; stoi, gdy okno jest ukryte albo nikt nie rysuje.
type Fn = (dt: number) => void;
const subs = new Set<Fn>();
let raf = 0, last = 0, acc = 0, fps = 30;
export function setLoopSaving(saving: boolean): void { fps = saving ? 10 : 30; }
function frame(now: number) {
  raf = requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (document.hidden) return;
  acc += dt;
  if (acc < 1 / fps) return;
  subs.forEach(f => f(acc));
  acc = 0;
}
export function subscribe(fn: Fn): () => void {
  subs.add(fn);
  if (!raf) { last = performance.now(); raf = requestAnimationFrame(frame); }
  return () => { subs.delete(fn); if (!subs.size) { cancelAnimationFrame(raf); raf = 0; } };
}
```

```tsx
// app/src/settings/look/PetsCanvas.tsx
import { useEffect, useRef } from 'react';
import { createPet, pen, setScene } from '../../renderer';
import { PetPainter } from '../../renderer/painter';
import { reducedMotion } from '../../stage/power';
import { skinFor, type SceneKey } from '../../stage/sceneFor';
import type { Agent, Look } from '../../types';
import { subscribe } from './loop';

export interface PreviewPet { agent: Agent; look: Look }
let saving = false;
export function setPreviewSaving(v: boolean): void { saving = v; }

/** Kilka zwierzaków na jednym płótnie (karta galerii, pasek w prawdziwym rozmiarze). */
export function PetsCanvas({ pets, scene, u, width, height, className }: { pets: PreviewPet[]; scene: SceneKey; u: number; width: number; height: number; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const live = useRef({ pets, scene });
  live.current = { pets, scene };
  const painters = useRef<PetPainter[]>([]);

  useEffect(() => { painters.current.forEach(p => setScene(p.pet, scene)); }, [scene]);

  useEffect(() => {
    const c = ref.current, x = c?.getContext('2d');
    if (!c || !x) return;
    pen.font = getComputedStyle(document.body).fontFamily || 'sans-serif';
    let T = Math.random() * 10;
    return subscribe(dt => {
      const { pets: list, scene: sc } = live.current;
      while (painters.current.length < list.length) painters.current.push(new PetPainter(createPet(skinFor(list[painters.current.length].agent), sc)));
      T += dt;
      const d = devicePixelRatio || 1;
      if (c.width !== Math.round(width * d)) { c.width = Math.round(width * d); c.height = Math.round(height * d); }
      x.setTransform(d, 0, 0, d, 0, 0);
      x.clearRect(0, 0, width, height);
      pen.boil = Math.floor(T * 8);
      list.forEach((p, i) => painters.current[i].frame(x, { dt, t0: T + i * 0.7, X: width * (i + 0.5) / list.length - 8 * u, Y: height - 8, u,
        look: p.look, animate: true, saving, reduced: reducedMotion(), dpr: d }));
    });
  }, [width, height, u]);

  return <canvas ref={ref} className={className} width={width} height={height} style={{ width, height }} aria-hidden="true" />;
}
```

```tsx
// app/src/settings/look/LookGallery.tsx
import { STYLE_IDS, STYLE_LABEL } from '../../look';
import type { SceneKey } from '../../stage/sceneFor';
import type { MotionId, StyleId } from '../../types';
import { PetsCanvas } from './PetsCanvas';

export function LookGallery({ style, motion, scene, compact, onPick }: { style: StyleId; motion: MotionId; scene: SceneKey; compact?: boolean; onPick: (s: StyleId) => void }) {
  const [w, h, u] = compact ? [124, 60, 0.36] : [150, 78, 0.5];
  return (
    <div className={`gallery${compact ? ' compact' : ''}`} role="radiogroup" aria-label="Styl">
      {STYLE_IDS.map(id => (
        <button type="button" key={id} role="radio" aria-checked={style === id} className={`look-card${style === id ? ' on' : ''}`} onClick={() => onPick(id)}>
          <PetsCanvas pets={[{ agent: 'claude', look: { style: id, motion } }, { agent: 'codex', look: { style: id, motion } }]} scene={scene} u={u} width={w} height={h} />
          <span>{STYLE_LABEL[id]}</span>
        </button>
      ))}
    </div>
  );
}
```

```tsx
// app/src/settings/look/LookTab.tsx
import { useState } from 'react';
import { MOTION_IDS, MOTION_LABEL, STYLE_IDS, STYLE_LABEL, lookFor, withOverride } from '../../look';
import type { SceneKey } from '../../stage/sceneFor';
import type { AppId, Look, MotionId, Pets, StyleId } from '../../types';
import { APP_LABEL } from '../model';
import { LookGallery } from './LookGallery';
import { PetsCanvas } from './PetsCanvas';

const SCENES: [SceneKey, string][] = [['edit', 'Pracuje'], ['needs', 'Czeka'], ['done', 'Gotowe'], ['sleep', 'Śpi'], ['error', 'Błąd']];
const APPS: AppId[] = ['claude_code', 'codex', 'agent_router'];

export function MotionSwitch({ motion, onPick }: { motion: MotionId; onPick: (m: MotionId) => void }) {
  return (
    <div className="segmented" role="radiogroup" aria-label="Ruch">
      {MOTION_IDS.map(m => <button type="button" key={m} role="radio" aria-checked={motion === m} className={motion === m ? 'on' : ''} onClick={() => onPick(m)}>{MOTION_LABEL[m]}</button>)}
    </div>
  );
}

/** Zakładka „Wygląd”: ruch, scena podglądu, galeria stylów, pasek w prawdziwym rozmiarze, nadpisania per agent. */
export function LookTab({ pets, onChange }: { pets: Pets; onChange: (p: Pets) => void }) {
  const [scene, setScene] = useState<SceneKey>('edit');
  const pick = (app: AppId, field: keyof Look, v: string) => onChange(withOverride(pets, app, field, v === '' ? null : v as StyleId | MotionId));
  return <>
    <section className="card look-top">
      <div className="row"><span className="text"><span className="label">Ruch</span>
        <span className="desc">Anime: szybciej, sprężyście, ze smugami i efektami</span></span>
        <MotionSwitch motion={pets.motion} onPick={m => onChange({ ...pets, motion: m })} /></div>
      <div className="chips" role="radiogroup" aria-label="Scena podglądu">
        {SCENES.map(([k, l]) => <button type="button" key={k} role="radio" aria-checked={scene === k} className={scene === k ? 'on' : ''} onClick={() => setScene(k)}>{l}</button>)}
      </div>
      <LookGallery style={pets.style} motion={pets.motion} scene={scene} onPick={s => onChange({ ...pets, style: s })} />
      <p className="label strip-label">Tak wygląda w pasku</p>
      <PetsCanvas className="taskbar" scene={scene} u={0.3} width={330} height={48}
        pets={APPS.map(a => ({ agent: a === 'claude_code' ? 'claude' : 'codex', look: lookFor(pets, a) }))} />
    </section>
    <details className="card overrides">
      <summary>Osobno dla agentów</summary>
      {APPS.map(a => {
        const o = pets.overrides?.[a] ?? {};
        return (
          <div className="row" key={a}>
            <span className="text"><span className="label">{APP_LABEL[a]}</span></span>
            <select aria-label={`${APP_LABEL[a]}: styl`} value={o.style ?? ''} onChange={e => pick(a, 'style', e.target.value)}>
              <option value="">Jak domyślny</option>
              {STYLE_IDS.map(id => <option key={id} value={id}>{STYLE_LABEL[id]}</option>)}
            </select>
            <select aria-label={`${APP_LABEL[a]}: ruch`} value={o.motion ?? ''} onChange={e => pick(a, 'motion', e.target.value)}>
              <option value="">Jak domyślny</option>
              {MOTION_IDS.map(id => <option key={id} value={id}>{MOTION_LABEL[id]}</option>)}
            </select>
          </div>
        );
      })}
    </details>
  </>;
}
```

`SettingsView.tsx`: `Tab = 'apps' | 'look' | …`, `TABS` z `['look', 'Wygląd']`; zakładka `look` renderuje `<LookTab pets={s.pets} onChange={p => set({ pets: p })} />` i pod nią kartę z dotychczasowymi wierszami „Najwięcej zwierzaków w pasku” i „Tryb oszczędny” (wybór skórki usunięty). `main.tsx`: nasłuch `pets://power` i `power_get` → `setPreviewSaving`, `setLoopSaving` (w Tauri).

`settings.html` (CSS, tokeny istniejących zmiennych):

```css
.gallery{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:8px;margin:12px 0}
.gallery.compact{grid-template-columns:repeat(4,1fr);gap:6px}
.look-card{display:flex;flex-direction:column;align-items:center;gap:4px;padding:6px 4px;border:1px solid var(--btnb);border-radius:8px;background:var(--card);cursor:pointer}
.look-card.on{border-color:var(--accent);box-shadow:inset 0 0 0 1px var(--accent)}
.look-card span{font-size:12px}
.segmented,.chips{display:flex;gap:4px}
.segmented button,.chips button{border:1px solid var(--btnb);border-radius:6px;padding:4px 12px;background:var(--btn)}
.segmented button.on,.chips button.on{border-color:var(--accent);box-shadow:inset 0 0 0 1px var(--accent)}
.chips{margin-top:12px}
.strip-label{margin:12px 0 6px}
canvas.taskbar{display:block;border-radius:6px;background:#1F1F1F}
details.overrides summary{cursor:pointer;padding:4px 0}
details.overrides .row select+select{margin-left:6px}
```

(Jeśli któregoś tokena `--card`/`--btn` nie ma w `settings.html`, użyć istniejących nazw z tego pliku.)

- [ ] **Step 4: Run** `pnpm --dir app test` i `tsc --noEmit` → PASS

- [ ] **Step 5: Ręcznie:** `pnpm --dir app dev`, `http://localhost:1420/settings.html` → zakładka Wygląd: 7 żywych kart, przełączanie sceny i ruchu, pasek, nadpisania. Zrzut ekranu do obejrzenia.

- [ ] **Step 6: Commit** `feat(settings): look tab with a live style gallery, taskbar-size preview and per-agent overrides`

---

### Task 12: Kreator: galeria kompaktowa

**Files:**
- Modify: `app/src/settings/Wizard.tsx`, `app/src/settings/views.test.tsx`

- [ ] **Step 1: Test**

```ts
  it('the look step offers the style gallery and the motion switch', () => {
    const html = renderToString(<Wizard rows={rows} initial={defaultSettings()} onFinish={noop} initialStep="look" />);
    expect(html).toContain('gallery compact');
    expect(html).toContain('Pixel-art');
    expect(html).toContain('Anime');
  });
```

- [ ] **Step 2: Run** `pnpm --dir app test views` → FAIL

- [ ] **Step 3: Implementacja:** krok `look` = `<section className="card look"><MotionSwitch motion={draft.pets.motion} onPick={m => set({ pets: { ...draft.pets, motion: m } })} /><LookGallery compact style={draft.pets.style} motion={draft.pets.motion} scene="edit" onPick={s => set({ pets: { ...draft.pets, style: s } })} /></section>`; usunięte stare radio skórek, `preview()` i import `PetCanvas`. Tytuł kroku zostaje „Wygląd zwierzaków”.

- [ ] **Step 4: Run** `pnpm --dir app test` → PASS; ręcznie `settings.html?wizard` (krok 4) — mieści się w oknie 760×440.

- [ ] **Step 5: Commit** `feat(wizard): pick the look from the compact gallery`

---

### Task 13: Rozróżnialność w pasku, zrzuty, weryfikacja

**Files:**
- Modify: `app/src/renderer/painter.test.ts`, `README.md`
- Create: `docs/looks-verification.md`

- [ ] **Step 1: Test rozróżnialności**

```ts
import { STYLE_IDS } from '../look';
  it('every pair of styles draws differently at taskbar scale', () => {
    const logs = STYLE_IDS.map(style => {
      const r = recorder();
      setRng(seeded(4).next);
      new PetPainter(createPet('clawd', 'edit'), fake).frame(r.ctx, { ...frame, look: { style, motion: 'calm' } });
      return r.log.join('\n');
    });
    for (let i = 0; i < logs.length; i++) for (let j = i + 1; j < logs.length; j++) expect(logs[i], `${STYLE_IDS[i]} vs ${STYLE_IDS[j]}`).not.toBe(logs[j]);
  });
```

Uwaga: warstwa Pixel-art rysuje na kontekście z fabryki; główny kontekst ma `drawImage` i `imageSmoothingEnabled=false`, co już różni zapis.

- [ ] **Step 2: Run** `pnpm --dir app test` → PASS (jeśli któraś para jest równa, to błąd stylu — poprawić styl, nie test)

- [ ] **Step 3: Zrzuty** (puppeteer-core + Edge jak w wydaniu 0.5.0, skrypt w scratchpadzie): `dev.html` z każdym stylem × ruchem, `settings.html` (zakładka Wygląd), `settings.html?wizard` krok 4. Obejrzeć każdy zrzut; poprawki kosmetyczne stylów (grubości, kolory) jako osobne commity `style(styles): …`.

- [ ] **Step 4: `docs/looks-verification.md`** — tabela jak w `phase5-verification.md`: 7 stylów rozróżnialnych w pasku, Anime vs Spokojny, nadpisanie per agent, tryb oszczędny (bez smug), migracja `skin` na maszynie użytkownika, testy automatyczne. README: w „Highlights” zdanie o 7 stylach i ruchu Anime; usunięte „Known limits” o nierozróżnialnych skórkach, jeśli jest w README.

- [ ] **Step 5: Run** `cargo test --workspace` i `pnpm --dir app test` → PASS

- [ ] **Step 6: Commit** `docs: looks verification and README highlights`

---

## Część B: język angielski (spec, sekcja 8)

Kolejność: po taskach 1–13, żeby przetłumaczyć też teksty galerii. Global Constraints obowiązują; dodatkowo:
- **Lang jawnie w Rust:** teksty dostają `Lang` parametrem albo z pola struktury (bez globalnego stanu, testy równoległe).
- **Domyślny język w testach TS:** `pl` (moduł startuje z polskim słownikiem), więc istniejące asercje tekstów zostają.

Review Focus dla części B:
1. **Język zmieniony w trakcie:** tray, panel, pasek i okno ustawień przechodzą na nowy język bez restartu. Test: task 17 (TS) i ręcznie.
2. **Windows po angielsku, brak pliku ustawień (pierwsze uruchomienie):** kreator od razu po angielsku. Test: task 14 (`resolve(Auto, …)`) i task 16 (`resolveLang`).
3. **Brakujące tłumaczenie:** błąd kompilacji TS (`en: Dict`), a skan źródeł wyłapuje zapomniane polskie literały. Test: task 16.

### Task 14: Rdzeń: ustawienie języka, `i18n`, teksty integracji

**Files:**
- Create: `crates/pets-core/src/i18n.rs`
- Modify: `crates/pets-core/src/lib.rs`, `crates/pets-core/src/settings.rs`, `crates/pets-core/src/integrations.rs`, `crates/pets-core/Cargo.toml` (cecha `Win32_Globalization` w `windows`, jeśli rdzeń ma już `windows`; inaczej wykrycie w aplikacji, patrz niżej)

**Interfaces:**
- Produces:
  - `enum Language { Auto, Pl, En }` (serde `snake_case`, domyślnie `Auto`, tolerancyjnie przez `or_default`), pole `Settings.language`;
  - `pets_core::i18n::{Lang, resolve(setting: Language, system_polish: bool) -> Lang, tr(l: Lang, pl: &'static str, en: &'static str) -> &'static str}`;
  - `integrations::{detect, status, enable, disable, uninstall_all}` dostają `lang: Lang` jako ostatni parametr;
  - `settings::load` zwraca w `error` tekst techniczny `"{path}: {e}"` (bez polskiego opisu).

- [ ] **Step 1: Testy**

```rust
// i18n.rs
#[cfg(test)]
mod tests {
    use super::*;
    use crate::settings::Language;
    #[test]
    fn auto_follows_windows_and_explicit_choice_wins() {
        assert_eq!(resolve(Language::Auto, true), Lang::Pl);
        assert_eq!(resolve(Language::Auto, false), Lang::En);
        assert_eq!(resolve(Language::Pl, false), Lang::Pl);
        assert_eq!(resolve(Language::En, true), Lang::En);
        assert_eq!(tr(Lang::En, "Tak", "Yes"), "Yes");
    }
}
```

```rust
// settings.rs, tests
    #[test]
    fn language_defaults_to_auto_and_unknown_values_fall_back() {
        assert_eq!(Settings::default().language, Language::Auto);
        assert_eq!(load_str(r#"{"version":1,"language":"en"}"#).settings.language, Language::En);
        assert_eq!(load_str(r#"{"version":1,"language":"klingon"}"#).settings.language, Language::Auto);
    }
```

```rust
// integrations.rs, tests
    #[test]
    fn texts_follow_the_language() {
        let h = tempfile::tempdir().unwrap();
        assert!(detect(AppId::Codex, h.path(), Lang::En).note.unwrap().starts_with("~/.codex not found"));
        assert_eq!(status(AppId::Codex, h.path(), Lang::En).detail, "Nothing to install");
        assert_eq!(status(AppId::ClaudeCode, h.path(), Lang::Pl).detail, "Hooki: brak");
    }
```

Istniejące testy `integrations` i `settings` dostają `Lang::Pl` w wywołaniach (asercje polskich tekstów zostają); test uszkodzonego pliku sprawdza, że `error` zawiera ścieżkę.

- [ ] **Step 2: Run** `cargo test -p pets-core` → FAIL (brak `i18n`, `Language`)

- [ ] **Step 3: Implementacja**

```rust
//! Język tekstów pokazywanych użytkownikowi (tray, powiadomienia, opisy integracji). Logi zostają po polsku.
use crate::settings::Language;

#[derive(Clone, Copy, Debug, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "snake_case")]
pub enum Lang { Pl, En }

/// `Auto`: polski tylko przy polskim interfejsie Windows; każdy inny → angielski.
pub fn resolve(setting: Language, system_polish: bool) -> Lang {
    match setting { Language::Pl => Lang::Pl, Language::En => Lang::En, Language::Auto => if system_polish { Lang::Pl } else { Lang::En } }
}

pub fn tr(l: Lang, pl: &'static str, en: &'static str) -> &'static str { match l { Lang::Pl => pl, Lang::En => en } }

/// Język interfejsu Windows (LANG_POLISH = 0x15 w młodszych bitach LANGID).
#[cfg(windows)]
pub fn system_polish() -> bool {
    // SAFETY: funkcja bez argumentów, tylko odczyt ustawienia użytkownika.
    let id = unsafe { windows::Win32::Globalization::GetUserDefaultUILanguage() };
    id & 0x3ff == 0x15
}
#[cfg(not(windows))]
pub fn system_polish() -> bool { std::env::var("LANG").map(|v| v.starts_with("pl")).unwrap_or(false) }
```

(Jeśli `pets-core` nie zależy od `windows`, `system_polish` trafia do `app/src-tauri/src/system.rs`, a rdzeń ma tylko `resolve`/`tr`.)

Teksty w `integrations.rs` przez `tr(lang, …)` / `match lang` dla `format!`:

| PL (dziś) | EN |
|---|---|
| Nie znaleziono ~/.claude. Uruchom Claude Code raz, potem włącz tutaj. | ~/.claude not found. Run Claude Code once, then turn it on here. |
| Nie znaleziono ~/.codex. Uruchom Codex raz, potem włącz tutaj. | ~/.codex not found. Run Codex once, then turn it on here. |
| Nie znaleziono ~/.agent-router (serwer MCP Agent Router). | ~/.agent-router not found (Agent Router MCP server). |
| {path} jest uszkodzony ({e}) | {path} is damaged ({e}) |
| Nic do instalowania | Nothing to install |
| Hooki: zainstalowane / brak / niekompletne ({n}/9) | Hooks: installed / missing / incomplete ({n}/9) |
| Nie mogę odczytać / zapisać {path}: {e} | Cannot read / write {path}: {e} |
| Brak hook.exe w instalacji Agent Pets; zainstaluj aplikację ponownie. | hook.exe is missing from the Agent Pets install; reinstall the app. |
| Nie udało się zapisać hooków w {path}: {e} | Could not write the hooks to {path}: {e} |
| Nic do usunięcia | Nothing to remove |
| Hooki usunięte z ustawień Claude Code (kopia: settings.json.agent-pets.bak). | Hooks removed from Claude Code settings (backup: settings.json.agent-pets.bak). |
| {id}: błąd: {e} / Usunięto {path} | {id}: error: {e} / Removed {path} |

Zawartość `enable` dla Claude Code (komunikat o instalacji hooków) tłumaczy się tak samo.

- [ ] **Step 4: Run** `cargo test --workspace` → PASS po poprawieniu wywołań w aplikacji (task 15 podaje `lang`; w tym tasku aplikacja przekazuje `Lang::Pl` tymczasowo, żeby się kompilowała)

- [ ] **Step 5: Commit** `feat(core): language setting and translatable integration texts`

### Task 15: Aplikacja (Rust): tray, powiadomienia, przejście, kreator

**Files:**
- Modify: `app/src-tauri/src/{settings.rs,tray.rs,notify/rules.rs,notify/mod.rs,jump/exec.rs,lib.rs,core.rs}`

**Interfaces:**
- Consumes: `Lang`, `resolve`, `tr`, `system_polish` (task 14).
- Produces: `settings::lang(&SettingsState) -> Lang` (bieżący język z ustawień i Windows); `SettingsView` ma pole `lang: Lang` (TS: `lang: 'pl' | 'en'`); `rules::Rules::set_lang(Lang)`; `jump::exec::run(steps, lang)`; `tray::relabel(app, lang)`; `core::failure_text(e, lang)`.

- [ ] **Step 1: Testy**

```rust
// notify/rules.rs
    #[test]
    fn toasts_speak_english_when_asked() {
        let mut r = Rules::new(ALL);
        r.set_lang(Lang::En);
        // ten sam scenariusz co test „done” po polsku (sesja b, 3 min)
        /* … przygotowanie jak w istniejącym teście done … */
        assert_eq!(t[0].title, "Agent finished");
        assert_eq!(t[0].body, "T-b finished (3 min)");
    }
```

(Scenariusz skopiowany z istniejącego testu, który sprawdza `"T-b skończył (3 min)"`.)

```rust
// jump/exec.rs
    #[test]
    fn failure_text_is_translated() {
        assert_eq!(run(&[], Lang::En).detail, "Could not jump to the session");
    }
// core.rs
    #[test]
    fn failure_text_in_english() {
        assert_eq!(failure_text(&anyhow::anyhow!("no home"), Lang::En), "Agent Pets: data core stopped (no home)");
    }
```

- [ ] **Step 2: Run** `cargo test -p agent-pets` (nazwa pakietu aplikacji z `Cargo.toml`) → FAIL

- [ ] **Step 3: Implementacja**

Teksty:

| Miejsce | PL | EN |
|---|---|---|
| tray | Ustawienia / Zakończ Agent Pets | Settings / Quit Agent Pets |
| toast needs | Agent czeka na Ciebie / {name} czeka na Ciebie | Agent needs you / {name} is waiting for you |
| toast done | Agent skończył / {name} skończył ({m} min) | Agent finished / {name} finished ({m} min) |
| toast limit | {who}: limit {win} / Zużyto {p}% limitu {win} | {who}: {win} limit / {p}% of the {win} limit used |
| okno limitu | 5h / tydzień | 5h / weekly |
| przycisk toastu | Przejdź | Open |
| jump | Otworzono sesję w aplikacji / Przełączono na okno sesji / Skopiowano komendę: {t} / Wznów ręcznie: {t} / Nie udało się przejść do sesji / Sesja już nie istnieje | Opened the session in the app / Switched to the session window / Copied the command: {t} / Resume manually: {t} / Could not jump to the session / The session no longer exists |
| status rdzenia | Agent Pets: rdzeń danych nie działa ({e}) | Agent Pets: data core stopped ({e}) |
| zapis ustawień | Nie udało się zapisać {path}: {e} | Could not save {path}: {e} |

- `settings.rs`: `lang(st)` = `resolve(current.language, system_polish())`; `settings_get` wypełnia `lang`; `settings_set` po zapisie, gdy zmienił się język: `tray::relabel(&app, lang)` i `notify` dostaje język razem z ustawieniami (istniejące `set_settings` w `notify/mod.rs` woła też `rules.set_lang`); `integrations_list`, `integration_set`, `wizard_finish`, `diagnostics` przekazują `lang`.
- `tray.rs`: `MenuItem` trzymane w stanie (`TrayItems { settings, quit }`), `relabel` woła `set_text`; `build` przyjmuje `lang`.
- `lib.rs`: „Sesja już nie istnieje” przez `tr`; `repair_integrations` i `uninstall_cli` z `Lang` z ustawień (odinstalowanie: `resolve(load(..).settings.language, system_polish())`).

- [ ] **Step 4: Run** `cargo test --workspace` → PASS

- [ ] **Step 5: Commit** `feat(app): tray, notifications, jump results and wizard messages in English or Polish`

### Task 16: UI: słowniki i przeniesienie tekstów

**Files:**
- Create: `app/src/i18n/index.ts`, `app/src/i18n/pl.ts`, `app/src/i18n/en.ts`, `app/src/i18n/i18n.test.ts`
- Modify: wszystkie pliki z tekstami dla użytkownika: `tooltip/text.ts`, `panel/{App.tsx,main.tsx,model.ts}`, `stage/{router.ts,demo.ts,hud.ts}`, `settings/{SettingsView.tsx,Wizard.tsx,main.tsx,model.ts}`, `settings/look/*.tsx`, `look.ts` (etykiety stylów i ruchu)

**Interfaces:**
- Produces: `type Lang = 'pl' | 'en'`; `t(): Dict` (bieżący słownik), `setLang(l: Lang)`, `lang(): Lang`, `resolveLang(setting: 'auto'|'pl'|'en', languages?: readonly string[]): Lang`; `type Dict = typeof pl`; `export const en: Dict`.

Struktura słownika (klucze pogrupowane jak pliki), przykłady:

```ts
// app/src/i18n/pl.ts
const plural = (n: number, one: string, few: string, many: string) =>
  n === 1 ? one : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? few : many;
export const pl = {
  agent: { claude: 'Claude Code', codex: 'Codex' },
  origin: { cli: 'CLI', desktop: 'aplikacja', router: 'Agent Router' },
  tool: { edit: 'Edytuje pliki', bash: 'Uruchamia komendy', /* … wszystkie z tooltip/text.ts */ },
  state: { thinking: 'Myśli', needs_you: 'Czeka na Ciebie', /* … */ },
  time: {
    now: 'teraz', secAgo: (s: number) => `${s} s temu`, minAgo: (m: number) => `${m} min temu`, hAgo: (h: number) => `${h} h temu`,
    resetSoon: 'reset wkrótce', reset: (when: string) => `reset ${when}`, days: ['nd', 'pn', 'wt', 'śr', 'czw', 'pt', 'sob'],
  },
  window: { five_hour: '5h', weekly: 'tydzień' },
  sessions: (n: number) => `${n} ${plural(n, 'sesja', 'sesje', 'sesji')}`,
  more: (n: number) => `Jeszcze ${n} ${plural(n, 'sesja', 'sesje', 'sesji')}`,
  /* panel, tooltip, settings (zakładki, wiersze, opisy), wizard, look (style, ruch, sceny, galeria), diag (raport) … */
};
```

```ts
// app/src/i18n/en.ts
import type { Dict } from './index';
export const en: Dict = {
  agent: { claude: 'Claude Code', codex: 'Codex' },
  origin: { cli: 'CLI', desktop: 'app', router: 'Agent Router' },
  tool: { edit: 'Editing files', bash: 'Running commands', /* … */ },
  state: { thinking: 'Thinking', needs_you: 'Needs you', /* … */ },
  time: {
    now: 'now', secAgo: s => `${s}s ago`, minAgo: m => `${m} min ago`, hAgo: h => `${h} h ago`,
    resetSoon: 'resets soon', reset: when => `resets ${when}`, days: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
  },
  window: { five_hour: '5h', weekly: 'weekly' },
  sessions: n => `${n} ${n === 1 ? 'session' : 'sessions'}`,
  more: n => `${n} more ${n === 1 ? 'session' : 'sessions'}`,
  /* … */
};
```

```ts
// app/src/i18n/index.ts
import { en } from './en';
import { pl } from './pl';
export type Dict = typeof pl;
export type Lang = 'pl' | 'en';
let cur: Lang = 'pl';
export const lang = (): Lang => cur;
export const t = (): Dict => (cur === 'en' ? en : pl);
export function setLang(l: Lang): void { cur = l; }
/** `auto`: polski tylko dla polskiego języka przeglądarki (WebView2 = język Windows). */
export function resolveLang(setting: 'auto' | 'pl' | 'en', languages: readonly string[] = globalThis.navigator?.languages ?? []): Lang {
  if (setting !== 'auto') return setting;
  return languages[0]?.toLowerCase().startsWith('pl') ? 'pl' : 'en';
}
```

Godziny resetu po angielsku w formacie 12-godzinnym z `Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' })`, po polsku jak dziś (`HH:MM`).

- [ ] **Step 1: Testy `i18n.test.ts`**

```ts
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { resolveLang, setLang, t } from './index';
import { formatAgo, badgeTooltip } from '../tooltip/text';

afterEach(() => setLang('pl'));

describe('i18n', () => {
  it('auto picks Polish only for a Polish system', () => {
    expect(resolveLang('auto', ['pl-PL', 'en'])).toBe('pl');
    expect(resolveLang('auto', ['en-GB', 'pl'])).toBe('en');
    expect(resolveLang('auto', [])).toBe('en');
    expect(resolveLang('pl', ['en-US'])).toBe('pl');
  });
  it('switches texts at once', () => {
    setLang('en');
    expect(formatAgo(125_000)).toBe('2 min ago');
    expect(badgeTooltip([{} as never, {} as never]).title).toBe('2 more sessions');
    expect(t().sessions(1)).toBe('1 session');
    setLang('pl');
    expect(t().sessions(5)).toBe('5 sesji');
  });
  it('no Polish literals left outside the Polish dictionary', () => {
    const roots = ['src', 'src-tauri/src'].map(r => join(__dirname, '..', '..', r));
    const skip = /(\.test\.|testing\.ts|i18n[\\/]pl\.ts|renderer[\\/]scenes\.ts|[\\/]i18n\.rs$)/;
    const files: string[] = [];
    const walk = (d: string) => readdirSync(d).forEach(n => { const p = join(d, n); statSync(p).isDirectory() ? walk(p) : /\.(tsx?|rs)$/.test(n) && !skip.test(p) && files.push(p); });
    roots.forEach(walk);
    const bad: string[] = [];
    for (const f of files) {
      let src = readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
      if (f.endsWith('.rs')) src = src.split('#[cfg(test)]')[0].replace(/(eprintln|println|expect|panic)!?\([^\n]*/g, '');
      for (const m of src.match(/(["'`])(?:(?!\1)[^\\\n]|\\.)*\1|>[^<>{}]+</g) ?? []) if (/[ąćęłńóśźżĄĆĘŁŃÓŚŹŻ]/.test(m)) bad.push(`${f}: ${m.slice(0, 60)}`);
    }
    expect(bad).toEqual([]);
  });
});
```

(Rust w tym skanie: teksty tłumaczone w taskach 14–15 są w `tr(lang, "pl", "en")` — polski literał w `tr(` jest dozwolony; skan pomija linie z `tr(` i `Lang::Pl =>`: dopisać do wyrażenia czyszczącego `.replace(/(tr\(|Lang::Pl\s*=>)[^\n]*/g, '')`.)

- [ ] **Step 2: Run** `pnpm --dir app test i18n` → FAIL (brak modułu, potem lista polskich literałów)

- [ ] **Step 3: Implementacja:** słowniki i zamiana literałów na `t().…` we wszystkich plikach z listy, aż skan jest pusty. Etykiety `STYLE_LABEL`/`MOTION_LABEL` przechodzą do słownika (`t().look.style[id]`). Dane pokazowe (`stage/demo.ts`, `settings/main.tsx`) też ze słownika. Błąd ustawień z rdzenia: `t().settings.broken(err)` („{err}; używam ustawień domyślnych” / „{err}; using default settings”).

- [ ] **Step 4: Run** `pnpm --dir app test` i `tsc --noEmit` → PASS (istniejące testy po polsku, bo domyślnie `pl`)

- [ ] **Step 5: Commit** `feat(ui): Polish and English dictionaries for every user-facing text`

### Task 17: Wybór języka, przełączanie na żywo, instalator, README

**Files:**
- Modify: `crates/pets-core/src/settings.rs` (nic, pole jest z taska 14), `app/src/types.ts` (`language`, `SettingsView.lang`), `app/src/settings/{SettingsView.tsx,Wizard.tsx,main.tsx,model.ts}`, `app/src/stage/stage.ts`, `app/src/panel/App.tsx`, `app/src/settings/views.test.tsx`, `app/src-tauri/tauri.conf.json`, `README.md`, `docs/looks-verification.md`

- [ ] **Step 1: Testy (`views.test.tsx`)**

```ts
  it('general tab offers the language, and English renders English', () => {
    const s = { ...defaultSettings(), language: 'en' as const };
    setLang('en');
    const html = renderToString(<SettingsView settings={s} rows={rows} diag={diag} tab="general" onTab={() => {}}
      onChange={() => {}} onIntegration={async () => ''} message={null} />);
    setLang('pl');
    expect(html).toContain('Język / Language');
    expect(html).toContain('Start with Windows');
    expect(html).not.toContain('Uruchamiaj z Windows');
  });
  it('the wizard shows a language picker on its first step', () => {
    const html = renderToString(<Wizard rows={rows} initial={defaultSettings()} onFinish={noop} />);
    expect(html).toContain('aria-label="Język / Language"');
  });
```

- [ ] **Step 2: Run** `pnpm --dir app test views` → FAIL

- [ ] **Step 3: Implementacja**
- `types.ts`: `language: 'auto' | 'pl' | 'en'` w `Settings`; `defaultSettings()` z `language: 'auto'`.
- Wiersz w zakładce Ogólne: `<select aria-label="Język / Language">` z opcjami „Automatycznie / Automatic”, „Polski”, „English”.
- Kreator: ten sam `select` w nagłówku pierwszego kroku; zmiana ustawia `draft.language` i od razu `setLang(resolveLang(v))` (kreator przerenderowuje się w nowym języku).
- Na żywo: `stage.ts` (`onSettings`), `panel/App.tsx` (`pets://settings`, `settings_get`), `settings/main.tsx` (`reload` i zdarzenie) wołają `setLang(resolveLang(s.language))` przed ustawieniem stanu.
- `tauri.conf.json`: `bundle.windows.nsis.languages: ["English", "Polish"]`, `displayLanguageSelector: false`.
- README: usunięte zdanie „The app's interface is in Polish for now”; w Highlights „English and Polish UI (follows Windows)”.
- `docs/looks-verification.md`: wiersze „Windows po angielsku: kreator i pasek po angielsku”, „Zmiana języka na żywo”, „Instalator po polsku/angielsku”.

- [ ] **Step 4: Run** `cargo test --workspace` i `pnpm --dir app test` → PASS

- [ ] **Step 5: Ręcznie:** `settings.html` i `panel.html` w podglądzie z `language: en`; zrzut do obejrzenia.

- [ ] **Step 6: Commit** `feat: language picker (auto, Polski, English), live switching, bilingual installer`


Po tym: przegląd całej gałęzi (reviewer na najmocniejszym modelu), poprawki, test użytkownika na żywo (`pnpm tauri dev` albo instalator), scalenie i push dopiero po zgodzie.
