// UI icons drawn with strokes in the text color (emoji vary by system and theme).
const base = { width: 16, height: 16, viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor', strokeWidth: 1.4,
  strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true };

/** Stats: three bars on a baseline. */
export function StatsIcon() {
  return (
    <svg {...base}>
      <path d="M2.5 13.5h11" />
      <rect x="3.5" y="8" width="2.2" height="5.5" rx=".6" />
      <rect x="6.9" y="4" width="2.2" height="9.5" rx=".6" />
      <rect x="10.3" y="6.5" width="2.2" height="7" rx=".6" />
    </svg>
  );
}

/** Gear outline: `n` teeth, outer radius `ro`, inner radius `ri` (center 8, 8). */
export function gearPath(n = 8, ro = 7, ri = 5.3): string {
  const r = (v: number) => Math.round(v * 100) / 100;
  const pt = (a: number, rad: number) => `${r(8 + rad * Math.cos(a))} ${r(8 + rad * Math.sin(a))}`;
  const step = (2 * Math.PI) / n, top = step * 0.18, base = step * 0.3;
  const pts: string[] = [];
  for (let i = 0; i < n; i++) {
    const a = i * step;
    pts.push(pt(a - base, ri), pt(a - top, ro), pt(a + top, ro), pt(a + base, ri));
  }
  return `M${pts.join('L')}Z`;
}

/** Settings: gear with a hole. */
export function GearIcon() {
  return (
    <svg {...base}>
      <path d={gearPath()} />
      <circle cx="8" cy="8" r="2.1" />
    </svg>
  );
}
