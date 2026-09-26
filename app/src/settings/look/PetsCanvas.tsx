import { useEffect, useRef } from 'react';
import { createPet, pen, setScene } from '../../renderer';
import { PetPainter } from '../../renderer/painter';
import { reducedMotion } from '../../stage/power';
import { skinFor, type SceneKey } from '../../stage/sceneFor';
import type { Agent, Look } from '../../types';
import { subscribe } from './loop';

export interface PreviewPet { agent: Agent; look: Look }
let saving = false;
/** Tryb oszczędny w podglądzie: Dynamiczny bez smug (fps ustawia `setLoopSaving`). */
export function setPreviewSaving(v: boolean): void { saving = v; }

interface Props { pets: PreviewPet[]; scene: SceneKey; u: number; width: number; height: number; className?: string }

/** Kilka zwierzaków na jednym płótnie (karta galerii, pasek w prawdziwym rozmiarze). */
export function PetsCanvas({ pets, scene, u, width, height, className }: Props) {
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
      list.forEach((p, i) => painters.current[i].frame(x, {
        dt, t0: T + i * 0.7, X: width * (i + 0.5) / list.length - 8 * u, Y: height - 8, u,
        look: p.look, animate: true, saving, reduced: reducedMotion(), dpr: d,
      }));
    });
  }, [width, height, u]);

  return <canvas ref={ref} className={className} width={width} height={height} style={{ width, height }} aria-hidden="true" />;
}
