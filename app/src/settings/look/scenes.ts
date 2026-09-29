// All scenes for settings preview, in two groups (appearance spec v2, 7).
import type { SceneKey } from '../../stage/sceneFor';

export const PREVIEW_GROUPS: { id: 'work' | 'states' | 'stats'; scenes: SceneKey[] }[] = [
  { id: 'work', scenes: ['thinking', 'edit', 'bash', 'read', 'grep', 'web', 'agent', 'mcp', 'compact'] },
  { id: 'states', scenes: ['needs', 'done', 'error', 'idle', 'vibe', 'sleep', 'doze', 'bye'] },
  // stats window (0.9)
  { id: 'stats', scenes: ['podium_first', 'podium_second', 'podium_third', 'run'] },
];

/** Duration of one scene in "All in sequence" mode. */
export const CYCLE_MS = 6000;

const ORDER = PREVIEW_GROUPS.flatMap(g => g.scenes);

/** Next scene in group order, wrapping around. */
export function nextScene(cur: SceneKey): SceneKey {
  return ORDER[(ORDER.indexOf(cur) + 1) % ORDER.length];
}

/** "All in sequence" step: when the window is hidden, the scene (and animation) pauses. */
export function cycleScene(cur: SceneKey, hidden: boolean): SceneKey {
  return hidden ? cur : nextScene(cur);
}
