import { useEffect, useRef } from 'react';
import { pen } from '../renderer';
import { PetPainter } from '../renderer/painter';
import { frameBudget, reducedMotion } from '../stage/power';
import { petFor, sceneFor } from '../stage/sceneFor';
import { switchScene } from '../stage/roster';
import type { Look, Session } from '../types';

let fps = 30, saving = false;
/** Panel power saving mode: 10 fps and Dynamic without trails. */
export function setPetSaving(s: boolean): void { saving = s; fps = frameBudget(s).fps; }
// Pet scale from the taskbar stage (u = 0.3 at 48 px), applied to a 72 px high canvas.
// A mini (subagent under a parent) has the same proportions as a mini pet in the taskbar.
const SIZES = {
  full: { W: 96, H: 72, U: 0.3 * 72 / 48, X: 36, Y: 62 },
  mini: { W: 40, H: 30, U: 0.3 * 72 / 48 * 0.42, X: 15, Y: 26 },
};

/** The same pet as in the taskbar, enlarged. Draws only in the browser (the effect does not run during server rendering). */
export function PetCanvas({ session, look, mini = false, music = false }: { session: Session; look: Look; mini?: boolean; music?: boolean }) {
  const { W, H, U, X, Y } = SIZES[mini ? 'mini' : 'full'];
  const ref = useRef<HTMLCanvasElement>(null);
  const lookRef = useRef(look);
  lookRef.current = look;
  const painter = useRef<PetPainter | null>(null);
  const scene = sceneFor(session, music);
  const shown = useRef(scene);

  useEffect(() => {
    if (painter.current && shown.current !== scene) switchScene(painter.current.pet, shown.current, scene);
    shown.current = scene;
  }, [scene]);

  useEffect(() => {
    const c = ref.current;
    const x = c?.getContext('2d');
    if (!c || !x) return;
    painter.current ??= new PetPainter(petFor(session, scene));
    pen.font = getComputedStyle(document.body).fontFamily || 'sans-serif';
    let raf = 0, last = performance.now(), T = Math.random() * 10, acc = 0;
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(fps < 30 ? 0.25 : 0.05, (now - last) / 1000);
      last = now;
      acc += dt;
      if (acc < 1 / fps) return;
      T += acc;
      const d = devicePixelRatio || 1;
      if (c.width !== Math.round(W * d)) { c.width = Math.round(W * d); c.height = Math.round(H * d); }
      x.setTransform(d, 0, 0, d, 0, 0);
      x.clearRect(0, 0, W, H);
      painter.current!.frame(x, { dt: acc, t0: T, X, Y, u: U, look: lookRef.current, animate: true, saving, reduced: reducedMotion(), dpr: d });
      acc = 0;
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
    // session agent and size stay the same; the effect above switches scenes
  }, []);

  return <canvas ref={ref} className={mini ? 'pet mini' : 'pet'} width={W} height={H} style={{ width: W, height: H }} aria-hidden="true" />;
}
