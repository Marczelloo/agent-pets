import { useEffect, useRef } from 'react';
import { createPet, pen } from '../renderer';
import { PetPainter } from '../renderer/painter';
import { lookFor } from '../look';
import { reducedMotion } from '../stage/power';
import { skinFor } from '../stage/sceneFor';
import type { AppId, Pets, StatAgent } from '../types';

const FPS = 30;
const appOf = (a: StatAgent): AppId => (a === 'router' ? 'agent_router' : a === 'codex' ? 'codex' : 'claude_code');

export interface StatPetProps {
  agent: StatAgent; scene: string; wear?: string; w: number; h: number; u: number; pets: Pets;
  /** false: jedna klatka (testy, ograniczony ruch) */
  animate: boolean;
  className?: string;
  /** opóźnienie wejścia (animacja CSS `enter`) */
  delay?: number;
}

/** Zwierzak w oknie statystyk, w stylu z ustawień. Nie rysuje, gdy okno jest ukryte. */
export function StatPet({ agent, scene, wear, w, h, u, pets, animate, className, delay }: StatPetProps) {
  const ref = useRef<HTMLCanvasElement>(null);
  const look = lookFor(pets, appOf(agent));
  const skin = skinFor(agent === 'claude' ? 'claude' : 'codex');
  useEffect(() => {
    const c = ref.current;
    const x = c?.getContext('2d');
    if (!c || !x) return;
    const painter = new PetPainter(createPet(skin, scene));
    if (wear) painter.pet.wear = wear;
    pen.font = getComputedStyle(document.body).fontFamily || 'sans-serif';
    let raf = 0, last = performance.now(), acc = 0, T = Math.random() * 10;
    const draw = (dt: number, anim: boolean) => {
      const d = devicePixelRatio || 1;
      if (c.width !== Math.round(w * d)) { c.width = Math.round(w * d); c.height = Math.round(h * d); }
      x.setTransform(d, 0, 0, d, 0, 0);
      x.clearRect(0, 0, w, h);
      painter.frame(x, { dt, t0: T, X: w / 2, Y: h - 3, u, look, animate: anim, saving: false, reduced: !anim, dpr: d });
    };
    if (!animate || reducedMotion()) { draw(0, false); return; }
    const frame = (now: number) => {
      if (document.hidden) { raf = 0; return; }
      raf = requestAnimationFrame(frame);
      acc += Math.min(0.05, (now - last) / 1000);
      last = now;
      if (acc < 1 / FPS) return;
      T += acc;
      draw(acc, true);
      acc = 0;
    };
    const wake = () => { if (!document.hidden && !raf) { last = performance.now(); raf = requestAnimationFrame(frame); } };
    document.addEventListener('visibilitychange', wake);
    raf = requestAnimationFrame(frame);
    return () => { cancelAnimationFrame(raf); document.removeEventListener('visibilitychange', wake); };
  }, [skin, scene, wear, look.style, look.motion, animate, w, h, u]);
  const enter = delay != null && animate && !reducedMotion();
  return <canvas ref={ref} className={[className, enter ? 'enter' : ''].filter(Boolean).join(' ') || undefined}
    data-scene={scene} data-wear={wear} width={w} height={h}
    style={{ width: w, height: h, animationDelay: enter ? `${delay}ms` : undefined }} aria-hidden="true" />;
}
