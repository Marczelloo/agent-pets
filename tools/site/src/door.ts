// The door: type an agent's name, a blob in its own colour answers, and the hook.exe call is written for you.
import { Actor, Stage, bubble, tone } from './engine';
import { blobPal } from '@app/skins';
import { copyButtons } from './copy';

const TAKEN = new Set(['claude', 'codex', 'opencode', 'copilot', 'antigravity', 'cursor', 'grok', 'zcode']);
const SCENE: Record<string, string> = { working: 'edit', needs_you: 'needs', done: 'done', sleep: 'sleep' };

export function slug(name: string): string {
  return name.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 32) || 'my-agent';
}

export function door(): void {
  const input = document.getElementById('door-name') as HTMLInputElement;
  const out = document.querySelector<HTMLElement>('[data-door-cmd]')!;
  const stateBtns = [...document.querySelectorAll<HTMLButtonElement>('[data-state]')];
  let state = 'working', name = input.value;
  let blob = new Actor('other', SCENE[state], name);

  const render = () => {
    const shown = name.trim() || 'My agent';
    const id = slug(shown), safe = shown.replace(/["`$]/g, '');
    const extra = state === 'working' ? ' --tool edit --title "Refactor"' : state === 'needs_you' ? ' --question "Deploy now?"' : '';
    const lines = [
      `& "$HOME\\.agent-pets\\hook.exe" report \``,
      `  --agent ${id} --name "${safe}" --session abc \``,
      `  --state ${state}${extra}`,
    ];
    if (TAKEN.has(id)) lines.push(`# "${id}" has its own integration, so the door refuses it`);
    out.textContent = lines.join('\n');
    document.querySelector<HTMLElement>('.door')!.style.setProperty('--door', blobPal(shown).s);
  };

  input.addEventListener('input', () => {
    name = input.value;
    const next = new Actor('other', SCENE[state], name.trim() || 'My agent');
    next.x = blob.x; next.y = blob.y; next.u = blob.u; next.squash = .3;
    blob = next;
    render();
  });
  stateBtns.forEach(b => b.addEventListener('click', () => {
    state = b.dataset.state!;
    stateBtns.forEach(o => o.setAttribute('aria-checked', String(o === b)));
    blob.set(SCENE[state]); blob.hop(220);
    render();
  }));

  const stage = new Stage(document.querySelector('.door-stage')!, (s, dt, T) => {
    const x = s.x, floor = s.h - 34;
    // a doorway behind the pet
    const dw = Math.min(170, s.w * .36), dh = Math.min(s.h - 50, 230), dx = s.w * .5 - dw / 2 + 50;
    x.fillStyle = tone.bar; x.beginPath(); x.roundRect(dx, floor - dh, dw, dh, [dw / 2, dw / 2, 0, 0]); x.fill();
    x.fillStyle = tone.amber; x.globalAlpha = .9;
    x.beginPath(); x.arc(dx + dw - 22, floor - dh * .45, 5, 0, 7); x.fill(); x.globalAlpha = 1;
    x.fillStyle = tone.ink; x.fillRect(0, floor, s.w, 3);
    const u = Math.max(.9, Math.min(1.6, s.w / 360));
    blob.u = u; blob.x = s.w * .5 - (state === 'working' ? 60 * u : 0); blob.y = floor;
    blob.step(dt); blob.draw(x, dt, T, s.dpr);
    if (state === 'needs_you') bubble(x, blob, 'Deploy now?', 'question', 1.15, s.dpr, s.w);
    else if (state === 'working') bubble(x, blob, 'Refactor', 'action', 1.15, s.dpr, s.w);
  });
  stage.onClick = (px, py) => { if (blob.hit(px, py, 20)) blob.poke('cheer', 1.4); };
  render();
  copyButtons();
}
