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

/** Notifications: bell. */
export function BellIcon() {
  return (
    <svg {...base}>
      <path d="M3.5 11.5h9l-1.2-1.6V7a3.3 3.3 0 0 0-6.6 0v2.9z" />
      <path d="M6.7 13.4a1.4 1.4 0 0 0 2.6 0" />
    </svg>
  );
}

/** Pinned session: a push pin. */
export function PinIcon() {
  return (
    <svg {...base}>
      <path d="M9.9 2.5l3.6 3.6-1.6.5-2 2.4.3 2.3-.9.9-2.6-2.6-3.6 3.6-.6-.6 3.6-3.6-2.6-2.6.9-.9 2.3.3 2.4-2z" />
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

/** Settings sidebar: four tiles (Apps). */
export function AppsIcon() {
  return (
    <svg {...base}>
      <rect x="2.5" y="2.5" width="4.5" height="4.5" rx="1" />
      <rect x="9" y="2.5" width="4.5" height="4.5" rx="1" />
      <rect x="2.5" y="9" width="4.5" height="4.5" rx="1" />
      <rect x="9" y="9" width="4.5" height="4.5" rx="1" />
    </svg>
  );
}

/** Settings sidebar: a pet face (Look). */
export function LookIcon() {
  return (
    <svg {...base}>
      <circle cx="8" cy="8" r="5.5" />
      <path d="M5.8 9.6a2.9 2.9 0 0 0 4.4 0" />
      <path d="M5.9 6.4v.1M10.1 6.4v.1" strokeWidth="1.8" />
    </svg>
  );
}

/** Settings sidebar: a window with a bar along the bottom (Taskbar). */
export function TaskbarIcon() {
  return (
    <svg {...base}>
      <rect x="2" y="3" width="12" height="10" rx="1.6" />
      <path d="M2 10.2h12" />
      <path d="M4.6 11.6h.1M7 11.6h.1" strokeWidth="1.6" />
    </svg>
  );
}

/** Settings sidebar: a gauge (Limits). */
export function LimitsIcon() {
  return (
    <svg {...base}>
      <path d="M2.4 11.5a5.8 5.8 0 1 1 11.2 0" />
      <path d="M8 9.6l2.4-3" />
      <circle cx="8" cy="9.8" r=".5" />
    </svg>
  );
}

/** Settings sidebar: two sliders (General). */
export function GeneralIcon() {
  return (
    <svg {...base}>
      <path d="M2.5 5h11M2.5 11h11" />
      <circle cx="10" cy="5" r="1.6" fill="var(--bg)" />
      <circle cx="6" cy="11" r="1.6" fill="var(--bg)" />
    </svg>
  );
}

/** Settings sidebar: a pulse line (Diagnostics). */
export function DiagIcon() {
  return (
    <svg {...base}>
      <path d="M1.8 8.4h3l1.7-4.2 3 7.6 1.7-3.4h3" />
    </svg>
  );
}

/** Theme: follow the system (monitor). */
export function MonitorIcon() {
  return (
    <svg {...base}>
      <rect x="2" y="3" width="12" height="8" rx="1.4" />
      <path d="M6 13.5h4M8 11v2.5" />
    </svg>
  );
}

/** Theme: light (sun). */
export function SunIcon() {
  return (
    <svg {...base}>
      <circle cx="8" cy="8" r="2.6" />
      <path d="M8 1.8v1.4M8 12.8v1.4M1.8 8h1.4M12.8 8h1.4M3.6 3.6l1 1M11.4 11.4l1 1M12.4 3.6l-1 1M4.6 11.4l-1 1" />
    </svg>
  );
}

/** Theme: dark (moon). */
export function MoonIcon() {
  return (
    <svg {...base}>
      <path d="M13 9.4A5.4 5.4 0 0 1 6.6 3a5.4 5.4 0 1 0 6.4 6.4z" />
    </svg>
  );
}
