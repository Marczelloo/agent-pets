import type { SkinId } from '../skins';
import type { Session } from '../types';

export type SceneKey = 'thinking' | 'edit' | 'bash' | 'read' | 'grep' | 'web' | 'agent' | 'mcp'
  | 'needs' | 'done' | 'error' | 'idle' | 'sleep' | 'compact' | 'bye' | 'vibe' | 'doze';

const TOOL: Record<string, SceneKey> = {
  edit: 'edit', bash: 'bash', read: 'read', grep: 'grep', web: 'web', agent: 'agent', mcp: 'mcp', other: 'mcp',
};
const STATE: Record<string, SceneKey> = {
  thinking: 'thinking', needs_you: 'needs', done: 'done', error: 'error', idle: 'idle',
  sleep: 'sleep', compacting: 'compact', ended: 'bye',
};

/**
 * Słucha muzyki tylko sesja, która nic nie robi i nie czeka na Ciebie (`idle`, `sleep`).
 * `music`: w systemie gra muzyka (Spotify, Apple Music, przeglądarka…), a użytkownik pozwala na reakcję.
 */
export const listens = (s: Pick<Session, 'state'>, music: boolean) => music && (s.state === 'idle' || s.state === 'sleep');

/** Sceny ze słuchawkami: bezczynny tańczy, śpiący drzemie dalej, tylko w słuchawkach. */
export const MUSIC_SCENES: ReadonlySet<SceneKey> = new Set(['vibe', 'doze']);

export function sceneFor(s: Pick<Session, 'state' | 'tool'>, music = false): SceneKey {
  if (listens(s, music)) return s.state === 'sleep' ? 'doze' : 'vibe';
  if (s.state === 'working') return TOOL[s.tool ?? 'other'] ?? 'mcp';
  return STATE[s.state] ?? 'thinking';
}

export const skinFor = (agent: string): SkinId => (agent === 'codex' ? 'kodek' : 'clawd');
