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
