// The prism: the same two pets seen through seven stripes, one look each. The stripe under the cursor widens.
import { Actor, BODY, CREW, REDUCED, Stage } from './engine';
import { SKINS } from '@app/skins';
import type { Agent, Look, MotionId, StyleId } from '@app/types';

const LOOKS: { id: StyleId; name: string; bg: string; fg: string }[] = [
  { id: 'sticker', name: 'Sticker', bg: '#2A2420', fg: '#E9E2DA' },
  { id: 'sketch', name: 'Sketch', bg: '#F3EADB', fg: '#3B3A38' },
  { id: 'clean', name: 'Clean', bg: '#1F1C1A', fg: '#E9E2DA' },
  { id: 'pixel', name: 'Pixel art', bg: '#1A1E26', fg: '#C9D4E6' },
  { id: 'neon', name: 'Neon', bg: '#0F0C16', fg: '#E7C8FF' },
  { id: 'ink', name: 'Ink', bg: '#F8F5F0', fg: '#111111' },
  { id: 'pastel', name: 'Pastel', bg: '#F5E3DA', fg: '#7A6158' },
];
const MOVES: { name: string; agent: Agent; scene: string }[] = [
  { name: 'Punch barrage', agent: 'claude', scene: 'edit' },
  { name: 'Hand seals', agent: 'codex', scene: 'bash' },
  { name: 'Detective', agent: 'opencode', scene: 'grep' },
  { name: 'Shadow thinking', agent: 'copilot', scene: 'thinking' },
  { name: 'Thunder dash', agent: 'grok', scene: 'web' },
  { name: 'Summoning', agent: 'zcode', scene: 'agent' },
  { name: 'Hollow Purple', agent: 'claude', scene: 'compact' },
];

export function looks(): void {
  let motion: MotionId = 'calm';
  // calm: Clawd and Kodek (the two with every look) take turns along the prism
  const calmCast = () => [new Actor('claude', 'thinking'), new Actor('codex', 'vibe'), new Actor('claude', 'done'), new Actor('codex', 'needs')];
  let cast = calmCast();
  let focus = 3.5;
  // a look tapped below the prism (or where a finger let go) holds still; the sweep waits
  let pinned: number | null = null;

  const movesEl = document.querySelector<HTMLDivElement>('.moves')!;
  movesEl.innerHTML = MOVES.map((m, i) => `<button type="button" data-i="${i}" aria-pressed="false">${m.name}<small>${CREW.find(c => c.agent === m.agent)?.label ?? ''}</small></button>`).join('');
  const moveBtns = [...movesEl.querySelectorAll<HTMLButtonElement>('button')];
  const motionBtns = [...document.querySelectorAll<HTMLButtonElement>('[data-motion]')];
  const setMotion = (m: MotionId) => {
    motion = m;
    motionBtns.forEach(b => b.setAttribute('aria-checked', String(b.dataset.motion === m)));
    if (m === 'calm') moveBtns.forEach(b => b.setAttribute('aria-pressed', 'false'));
    cast.forEach((a, i) => a.hop(160 + i * 30));
  };
  motionBtns.forEach(b => b.addEventListener('click', () => {
    // Dynamic without a chosen scene: the calm crew, now with impact frames and speed lines
    if (b.dataset.motion === 'calm' || motion === 'calm') cast = calmCast();
    setMotion(b.dataset.motion as MotionId);
  }));
  moveBtns.forEach((b, i) => b.addEventListener('click', () => {
    const m = MOVES[i];
    moveBtns.forEach(o => o.setAttribute('aria-pressed', String(o === b)));
    cast = [new Actor(m.agent, m.scene), new Actor(m.agent, m.scene)];
    setMotion('dynamic');
  }));

  const chipsEl = document.querySelector<HTMLDivElement>('.prism-looks')!;
  chipsEl.innerHTML = LOOKS.map((L, k) => `<button type="button" data-k="${k}" aria-pressed="false" style="--sw:${L.bg};--sf:${L.fg}">${L.name}</button>`).join('');
  const chips = [...chipsEl.querySelectorAll<HTMLButtonElement>('button')];
  let lit = -1;
  const light = (k: number) => { if (k !== lit) { lit = k; chips.forEach((c, j) => c.setAttribute('aria-pressed', String(j === k))); } };
  chips.forEach((c, k) => c.addEventListener('click', () => { pinned = pinned === k ? null : k; }));

  const stage = new Stage(document.querySelector('.prism-stage')!, (s, dt, T) => {
    const x = s.x, narrow = s.w < 640;
    // where the wide stripe is: the cursor, a pinned look, or a slow sweep
    const want = s.pointer.in ? s.pointer.x / s.w * LOOKS.length : pinned != null ? pinned + .5 : (REDUCED ? 3.5 : (Math.sin(T * .32) * .5 + .5) * LOOKS.length);
    focus += (want - focus) * Math.min(1, dt * (s.pointer.in || pinned != null ? 9 : 2));
    light(s.pointer.in ? Math.max(0, Math.min(LOOKS.length - 1, Math.floor(want))) : pinned ?? -1);
    const wts = LOOKS.map((_, k) => 1 + 3.4 * Math.exp(-((k + .5 - focus) ** 2) / 1.1));
    const sum = wts.reduce((a, b) => a + b, 0);

    // one row: a pair of scenes with props gets room on the right; a phone keeps two calm pets (one with props), bigger
    const wide = cast.length === 2, floor = s.h - 44;
    const shown = narrow ? cast.slice(0, wide ? 1 : 2) : cast, n = shown.length;
    const u = Math.min(s.h / 175, s.w / n / (wide ? 260 : narrow ? 118 : 135));
    shown.forEach((a, i) => {
      a.u = u; a.y = floor;
      a.x = wide ? s.w * (narrow ? .32 : [.2, .62][i]) : s.w * (i + .5) / n;
    });
    const legacy = cast.every(a => !!SKINS[a.painter.pet.type].legacy);

    let x0 = 0;
    LOOKS.forEach((L, k) => {
      const w = s.w * wts[k] / sum, look: Look = { style: L.id, motion };
      x.save();
      x.beginPath(); x.rect(x0, 0, w + .5, s.h); x.clip();
      x.fillStyle = L.bg; x.fillRect(x0, 0, w + 1, s.h);
      // the floor each pet stands on
      x.fillStyle = L.fg; x.globalAlpha = .18;
      x.fillRect(x0, floor, w + 1, 2);
      x.globalAlpha = 1;
      // the first stripe moves the clock; the others draw the same instant in their own look
      shown.forEach(a => { if (k === 0) { a.look = look; a.step(dt); a.draw(x, dt, T, s.dpr); } else a.redraw(x, T, s.dpr, look); });
      // the look's name; pixel and sticker exist for Clawd and Kodek, others draw clean there
      const off = !legacy && (L.id === 'pixel' || L.id === 'sticker');
      x.fillStyle = L.fg; x.globalAlpha = off ? .45 : .95;
      const label = off ? `${L.name} (Clawd, Kodek)` : L.name;
      if (w > 96) {
        x.font = `600 ${w > 160 ? 18 : 14}px Fredoka, ${BODY}`; x.textAlign = 'left'; x.textBaseline = 'top';
        x.fillText(label, x0 + 14, 14);
      } else {
        x.translate(x0 + w / 2 + 5, 14); x.rotate(Math.PI / 2);
        x.font = `600 13px Fredoka, ${BODY}`; x.textAlign = 'left'; x.textBaseline = 'middle';
        x.fillText(L.name, 0, 0);
      }
      x.restore();
      x0 += w;
    });
  });
  stage.onClick = (px, py) => { const p = cast.find(p => p.hit(px, py, 16)); if (p) p.hop(320); };
  // a finger that lets go leaves the look it was on pinned, instead of the sweep running off with it
  stage.canvas.addEventListener('pointerup', e => {
    if (e.pointerType !== 'mouse') pinned = Math.max(0, Math.min(LOOKS.length - 1, Math.floor(stage.pointer.x / stage.w * LOOKS.length)));
  });
}
