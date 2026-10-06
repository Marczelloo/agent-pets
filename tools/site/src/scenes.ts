// Poses that exist only for this page (like the README banner's): added to both choreography tables, never to the app.
import { SCENES, SCENES_DYNAMIC, type Scene } from '@app/renderer';

const HIP_L = { ikL: 1, hxL: -47, hyL: -25 };
const hold = (base: Record<string, any>, fn: (a: number, c: any) => Record<string, any> = () => ({})): Scene => ({ base, acts: [['page pose', 1e9, fn]] });

export const PAGE_SCENES: Record<string, Scene> = {
  // sits on a letter, swinging its legs and glancing where `c.gaze` points (-1 left … 1 right)
  perch: hold({ sit: 1, swing: 1 }, (a, c) => ({ th: (c.gaze ?? 0) * .8 + .12 * Math.sin(a * .9), look: -.25 + .15 * Math.sin(a * 1.3) })),
  wave: hold({ armR: 2.3, oscR: .55, _f: 11, ...HIP_L, look: 0, ex: -.2, happy: .6 }),
  cheer: hold({ armL: 2.6, armR: 2.6, oscL: .2, oscR: .2, _f: 7, happy: 1, look: -.3 }),
  clap: hold({ ikL: 1, hxL: -3, hyL: -26, ikR: 1, hxR: 3, hyR: -26, happy: .9, look: -.2 }),
  point: hold({ ikR: 1, hxR: 52, hyR: -70, ...HIP_L, happy: .5, look: -.5, th: .35 }),
  // stands and follows `c.gaze` with its whole body
  stand: hold({}, (a, c) => ({ th: (c.gaze ?? 0) * .9, look: -.1 + .1 * Math.sin(a * 1.1) })),
};
Object.assign(SCENES, PAGE_SCENES);
Object.assign(SCENES_DYNAMIC, PAGE_SCENES);
