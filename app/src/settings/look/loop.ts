// One frame loop for all previews; pauses when the window is hidden or nothing is drawing.
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

/** Canvas size in whole device pixels and matching CSS size (sharp at 125%, 150%). */
export function backing(css: number, dpr: number): { px: number; css: number } {
  const px = Math.round(css * dpr);
  return { px, css: px / dpr };
}
