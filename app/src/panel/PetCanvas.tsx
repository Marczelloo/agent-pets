import { useEffect, useRef } from 'react';
import { createPet, pen, setScene } from '../renderer';
import { PetPainter } from '../renderer/painter';
import { frameBudget, reducedMotion } from '../stage/power';
import { sceneFor, skinFor } from '../stage/sceneFor';
import type { Look, Session } from '../types';

const W = 96, H = 72;
let fps = 30, saving = false;
/** Tryb oszczędny panelu: 10 kl./s i Anime bez smug. */
export function setPetSaving(s: boolean): void { saving = s; fps = frameBudget(s).fps; }
// Skala zwierzaka ze sceny w pasku (u = 0,3 przy 48 px), przeniesiona na płótno wysokości 72 px.
const U = 0.3 * H / 48, X = 36, Y = H - 10;

/** Ten sam zwierzak co w pasku, większy. Rysuje tylko w przeglądarce (efekt nie działa przy renderze na serwerze). */
export function PetCanvas({ session, look }: { session: Session; look: Look }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const lookRef = useRef(look);
  lookRef.current = look;
  const painter = useRef<PetPainter | null>(null);
  const scene = sceneFor(session);

  useEffect(() => {
    if (painter.current) setScene(painter.current.pet, scene);
  }, [scene]);

  useEffect(() => {
    const c = ref.current;
    const x = c?.getContext('2d');
    if (!c || !x) return;
    painter.current ??= new PetPainter(createPet(skinFor(session.agent), sceneFor(session)));
    pen.font = getComputedStyle(document.body).fontFamily || 'sans-serif';
    let raf = 0, last = performance.now(), T = Math.random() * 10, acc = 0;
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      acc += dt;
      if (acc < 1 / fps) return;
      T += acc;
      const d = devicePixelRatio || 1;
      if (c.width !== Math.round(W * d)) { c.width = Math.round(W * d); c.height = Math.round(H * d); }
      x.setTransform(d, 0, 0, d, 0, 0);
      x.clearRect(0, 0, W, H);
      pen.boil = Math.floor(T * 8);
      painter.current!.frame(x, { dt: acc, t0: T, X, Y, u: U, look: lookRef.current, animate: true, saving, reduced: reducedMotion(), dpr: d });
      acc = 0;
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
    // agent sesji się nie zmienia; scenę przełącza efekt wyżej
  }, []);

  return <canvas ref={ref} className="pet" width={W} height={H} style={{ width: W, height: H }} aria-hidden="true" />;
}
