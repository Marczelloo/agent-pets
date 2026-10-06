// The real app windows, recorded by capture.mjs into public/ui/<name>/: loaded a few frames ahead of the playhead and dropped behind it,
// so a long recording never sits in memory all at once.

export interface Seq { name: string; fps: number; frames: number; width: number; height: number }

const metas = new Map<string, Seq>();
const cache = new Map<string, HTMLImageElement>();

export async function loadMeta(name: string): Promise<Seq> {
  const m = await (await fetch(`/ui/${name}/meta.json`)).json();
  const s = { name, ...m } as Seq;
  metas.set(name, s);
  return s;
}

const key = (name: string, i: number) => `${name}/${i}`;
const file = (name: string, i: number) => `/ui/${name}/${String(i).padStart(4, '0')}.png`;

/** Frame index of a recording `age` seconds after it started playing (holds the last frame). */
export const frameAt = (s: Seq, age: number): number => Math.max(0, Math.min(s.frames - 1, Math.floor(age * s.fps)));

/** Make sure frames [i, i + ahead] are decoded; forget older ones. */
export async function need(name: string, i: number, ahead = 3): Promise<void> {
  const s = metas.get(name)!;
  const jobs: Promise<void>[] = [];
  for (let k = i; k <= Math.min(s.frames - 1, i + ahead); k++) {
    if (cache.has(key(name, k))) continue;
    const img = new Image(); img.src = file(name, k);
    cache.set(key(name, k), img);
    jobs.push(img.decode());
  }
  for (const k of [...cache.keys()]) { const [n, j] = k.split('/'); if (n === name && +j < i - 1) cache.delete(k); }
  await Promise.all(jobs);
}

export const frame = (name: string, i: number): HTMLImageElement | undefined => cache.get(key(name, i));

/** A window: the recording with rounded corners and a soft shadow, drawn with its top-left at (0, 0) and `w` px wide. */
export function drawWindow(x: CanvasRenderingContext2D, img: HTMLImageElement | undefined, s: Seq, w: number): void {
  const h = w * s.height / s.width, r = w * 0.022;
  x.save();
  x.shadowColor = 'rgba(80,50,30,0.28)'; x.shadowBlur = w * 0.06; x.shadowOffsetY = w * 0.025;
  x.fillStyle = '#F4F3F1'; x.beginPath(); x.roundRect(0, 0, w, h, r); x.fill();
  x.restore();
  x.save(); x.beginPath(); x.roundRect(0, 0, w, h, r); x.clip();
  if (img) x.drawImage(img, 0, 0, w, h);
  x.restore();
  x.save(); x.strokeStyle = 'rgba(43,38,34,0.18)'; x.lineWidth = Math.max(1, w * 0.002); x.beginPath(); x.roundRect(0, 0, w, h, r); x.stroke(); x.restore();
}
