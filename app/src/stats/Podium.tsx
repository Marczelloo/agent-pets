import { useEffect, useRef } from 'react';
import { t } from '../i18n';
import { rng } from '../renderer/rng';
import { reducedMotion } from '../stage/power';
import type { Pets, StatsPlace } from '../types';
import { projectName } from './model';
import { CONFETTI_MS, confettiColors, drawConfetti, spawnConfetti, stepConfetti, type Piece } from './confetti';
import { StatPet } from './StatPet';

const SCENE = ['podium_first', 'podium_second', 'podium_third'];
const PET_W = 96, PET_H = 80, PET_U = 0.52;

/** Entrance delays for places 1, 2, 3: third first, winner last (every 300 ms). */
export const introPlan = (reduced: boolean): number[] => (reduced ? [0, 0, 0] : [600, 300, 0]);

/** Confetti for 2.5 s after the winner enters; restart whenever `replay` changes. */
function Confetti({ agent, replay, animate }: { agent: string | null; replay: string; animate: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    const x = c?.getContext('2d');
    if (!c || !x || !agent || !animate || reducedMotion()) return;
    const w = c.clientWidth, h = c.clientHeight, d = devicePixelRatio || 1;
    c.width = Math.round(w * d); c.height = Math.round(h * d);
    let parts: Piece[] = spawnConfetti(40, w, confettiColors(agent), rng);
    let raf = 0, last = 0;
    const start = performance.now() + introPlan(false)[0];
    const frame = (now: number) => {
      if (now < start) { raf = requestAnimationFrame(frame); return; }
      const dt = last ? Math.min(0.05, (now - last) / 1000) : 0;
      last = now;
      parts = stepConfetti(parts, dt, h);
      x.setTransform(d, 0, 0, d, 0, 0);
      x.clearRect(0, 0, w, h);
      drawConfetti(x, parts);
      if (now - start < CONFETTI_MS && parts.length && !document.hidden) raf = requestAnimationFrame(frame);
      else x.clearRect(0, 0, w, h);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [agent, replay, animate]);
  return <canvas ref={ref} className="confetti" aria-hidden="true" />;
}

export interface PodiumProps {
  places: StatsPlace[]; format: (v: number) => string; pets: Pets; animate: boolean;
  /** changing (period, measure) replays the entrance and confetti */
  replay: string;
}

export function Podium({ places, format, pets, animate, replay }: PodiumProps) {
  const delays = introPlan(!animate || reducedMotion());
  return (
    <div className="podium">
      <Confetti agent={places[0]?.agent ?? null} replay={replay} animate={animate} />
      {[1, 0, 2].map(i => {
        const p = places[i];
        return <div key={i} className={`step s${i + 1}`}>
          <div className="pet-slot">
            {p && <StatPet key={`${replay}-${p.project}`} agent={p.agent} scene={SCENE[i]} wear={i === 0 ? 'crown' : undefined}
              w={PET_W} h={PET_H} u={PET_U} pets={pets} animate={animate} delay={delays[i]} />}
          </div>
          <div className="blk">{i + 1}</div>
          <div className="nm" title={p ? projectName(p.project) : undefined}>{p ? projectName(p.project) : t().stats.emptyStep}</div>
          <div className="vl">{p ? format(p.value) : ''}</div>
        </div>;
      })}
    </div>
  );
}
