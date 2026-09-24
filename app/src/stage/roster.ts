import { createPet, setScene, type Pet } from '../renderer';
import type { Session } from '../types';
import { sceneFor, skinFor, type SceneKey } from './sceneFor';

export interface Entry { session: Session; pet: Pet; scene: SceneKey; born: number; byeAt?: number; phase: number }

const FADE_IN = .3, BYE_WAVE = .7, BYE_FADE = .8;

/** Przesunięcie fazy animacji z id sesji, żeby zwierzaki nie ruszały się synchronicznie. */
function phaseOf(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return (Math.abs(h) % 1000) / 1000 * 3;
}

export class Roster {
  private entries = new Map<string, Entry>();

  get(id: string): Entry | undefined { return this.entries.get(id); }

  sync(sessions: Session[], t: number): void {
    const seen = new Set<string>();
    for (const s of sessions) {
      const scene = sceneFor(s);
      const e = this.entries.get(s.id);
      if (!e) {
        if (scene === 'bye') continue;
        this.entries.set(s.id, { session: s, pet: createPet(skinFor(s.agent), scene), scene, born: t, phase: phaseOf(s.id) });
        seen.add(s.id);
        continue;
      }
      seen.add(s.id);
      e.session = s;
      if (e.scene !== scene) {
        setScene(e.pet, scene);
        e.scene = scene;
        e.byeAt = scene === 'bye' ? t : undefined;
      }
    }
    for (const id of [...this.entries.keys()]) if (!seen.has(id)) this.entries.delete(id);
  }

  alpha(e: Entry, t: number): number {
    const fadeIn = Math.min(1, Math.max(0, (t - e.born) / FADE_IN));
    if (e.byeAt == null) return fadeIn;
    return fadeIn * (1 - Math.min(1, Math.max(0, (t - e.byeAt - BYE_WAVE) / BYE_FADE)));
  }
}
