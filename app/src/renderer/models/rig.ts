// Płaski szkielet przodem dla modeli naklejki i pikselowego: te same sprężyny co body.ts, bez obrotu 3D.
// Ustawia c.hand i c.aHand w tych samych jednostkach co body.ts, więc targets(), rekwizyty i energia ruchu działają bez zmian.
import { PI, cl } from '../math';
import type { Pet } from '../pet';

export interface RigArm {
  s: -1 | 1; k: 'L' | 'R';
  /** bark i dłoń względem (XX, Y); `ah` = dłoń bez IK (naturalne machanie) */
  sx: number; sy: number; hx: number; hy: number; ah: [number, number];
  ik: number; L: number; fr: number; sw: [number, number];
}

export interface Rig {
  /** podstawa zwierzaka na scenie (po przesunięciu lx) */
  XX: number; Y: number;
  /** przesunięcie skoku (ujemne w górę) */
  oy: number;
  /** squash & stretch i przechył bryły */
  sx: number; sy: number; rot: number;
  W: number; H: number; top: number; bot: number; legH: number; down: number; loaf: number; sit: number;
  /** zwrot z `th`: w lewo, przód, w prawo */
  face: -1 | 0 | 1;
  /** przesunięcie źrenic (ex, look) w jednostkach u */
  gaze: [number, number];
  eyes: { open: number; blink: number; sleep: number; happy: number; dizzy: number; squint: number };
  grey: number; alpha: number; walk: number; hopH: number;
  arms: RigArm[];
}

export function rig(c: Pet, X: number, Y: number, u: number, t: number, size: { w: number; h: number; arm: number }): Rig {
  const P = c.p;
  const sit = cl(P.sit.x), loaf = cl(P.loaf.x), down = Math.max(sit, loaf), walk = cl(P.walkW.x), lean = cl(P.lean.x);
  const hph = c.hp % 1;
  let h = 0, sq = 0;
  if (hph < .42) { h = Math.sin(PI * hph / .42); sq = .07 * Math.cos(PI * hph / .42); } else if (hph < .58) sq = -.13 * Math.sin(PI * (hph - .42) / .16);
  const hw = cl(P.hopW.x);
  h *= hw; sq *= hw;
  const wb = Math.abs(Math.sin(t * 10)) * walk, br = Math.sin(t * (2.3 - loaf)) * .02 * (1 + cl(P.sleep.x) * 1.5);
  const oy = -(h * 24 + wb * 2.5) * u + lean * 4 * u;
  const W = size.w * u, H = size.h * u * (1 - .1 * loaf), bot = -12 * u * (1 - down), top = bot - H, legH = 17 * u;
  const wob = cl(P.wobW.x), rot = Math.sin(t * 4) * .1 * wob + loaf * .06 + P.tilt.x;
  const sx = (1 + .1 * lean) * (1 - (sq + br) * .6), sy = (1 + .1 * lean) * (1 + sq + br);
  const th = P.th.x, face: -1 | 0 | 1 = th > .25 ? 1 : th < -.25 ? -1 : 0;
  const XX = X + P.lx.x * u, shY = top + H * .52, AL = size.arm * u;
  const arms: RigArm[] = ([-1, 1] as const).map(s => {
    const k = s < 0 ? 'L' : 'R';
    const a = P['arm' + k].x + P['osc' + k].x * Math.sin(t * c.f + (s < 0 ? 1.7 : 0)), fw = walk * Math.sin(t * 10 + (s < 0 ? 0 : PI)) * .6;
    const sw: [number, number] = [s * W * .5 * sx, shY * sy + oy];
    const up = Math.max(0, -Math.cos(a)), AE = AL * (1 + .75 * up);
    const ah: [number, number] = [sw[0] + s * Math.sin(a) * AE * .92 + fw * 4 * u, sw[1] + Math.cos(a) * AE * .92];
    const ik = cl(P['ik' + k].x);
    const hx = ah[0] * (1 - ik) + P['hx' + k].x * u * ik, hy = ah[1] * (1 - ik) + P['hy' + k].x * u * ik;
    return { s, k, sx: sw[0], sy: sw[1], hx, hy, ah, ik, L: Math.hypot(hx - sw[0], hy - sw[1]), fr: 1, sw };
  });
  c.hand = arms.map(a => [a.hx / u, a.hy / u]);
  c.aHand = arms.map(a => [a.ah[0] / u, a.ah[1] / u]);
  const bl = c.blink > 0 ? Math.sin(PI * (c.blink / .16)) : 0, sl = cl(P.sleep.x), hp = cl(P.happy.x), dz = cl(P.dizzy.x), sqn = cl(P.squint.x);
  return {
    XX, Y, oy, sx, sy, rot, W, H, top, bot, legH, down, loaf, sit, face,
    gaze: [P.ex.x * 4, P.look.x * 4.5],
    eyes: { open: Math.max(0, 1 - Math.max(bl, sl, hp, dz, sqn)), blink: bl, sleep: sl, happy: hp, dizzy: dz, squint: sqn },
    grey: cl(P.grey.x), alpha: (1 - .22 * cl(P.dim.x)) * (c.alpha ?? 1), walk, hopH: h, arms,
  };
}
