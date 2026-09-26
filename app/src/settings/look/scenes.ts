// Wszystkie sceny do podglądu w ustawieniach, w dwóch grupach (spec wyglądu v2, 7).
import type { SceneKey } from '../../stage/sceneFor';

export const PREVIEW_GROUPS: { id: 'work' | 'states'; scenes: SceneKey[] }[] = [
  { id: 'work', scenes: ['thinking', 'edit', 'bash', 'read', 'grep', 'web', 'agent', 'mcp', 'compact'] },
  { id: 'states', scenes: ['needs', 'done', 'error', 'idle', 'sleep', 'bye'] },
];

/** Czas jednej sceny w trybie „Wszystkie po kolei”. */
export const CYCLE_MS = 6000;

const ORDER = PREVIEW_GROUPS.flatMap(g => g.scenes);

/** Następna scena w kolejności grup, z zawijaniem. */
export function nextScene(cur: SceneKey): SceneKey {
  return ORDER[(ORDER.indexOf(cur) + 1) % ORDER.length];
}

/** Krok „Wszystkie po kolei”: gdy okno jest ukryte, scena stoi (animacja też stoi). */
export function cycleScene(cur: SceneKey, hidden: boolean): SceneKey {
  return hidden ? cur : nextScene(cur);
}
