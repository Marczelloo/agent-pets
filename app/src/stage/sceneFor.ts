import { blobPal, type SkinId } from '../skins';
import { createPet, type Pet } from '../renderer/pet';
import { agentLabel } from '../model-label';
import { ACCENT } from '../styles';
import type { Session } from '../types';

export type SceneKey = 'thinking' | 'edit' | 'bash' | 'read' | 'grep' | 'web' | 'agent' | 'mcp'
  | 'needs' | 'done' | 'error' | 'idle' | 'sleep' | 'compact' | 'bye' | 'vibe' | 'doze'
  | 'podium_first' | 'podium_second' | 'podium_third' | 'run';

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

const SKIN_OF: Record<string, SkinId> = { claude: 'clawd', codex: 'kodek', opencode: 'opencode' };
/** Skórka agenta; agenci bez własnej maskotki (furtka, a do 0.11/0.12 także reszta) dostają bloba. */
export const skinFor = (agent: string): SkinId => SKIN_OF[agent] ?? 'blob';

const blobName = (s: Pick<Session, 'agent' | 'agent_name'>) => agentLabel({ agent: s.agent, agent_name: s.agent_name?.trim() || null });

/** Kolor akcentu zwierzaka sesji (dymki, pojawianie się); blob ma własny z nazwy. */
export function accentFor(s: Pick<Session, 'agent' | 'agent_name'>): string {
  const skin = skinFor(s.agent);
  return skin === 'blob' ? blobPal(blobName(s)).s : ACCENT[skin];
}

/** Zwierzak sesji: blob dostaje barwę i literę z nazwy agenta. */
export function petFor(s: Pick<Session, 'agent' | 'agent_name'>, scene: SceneKey): Pet {
  const c = createPet(skinFor(s.agent), scene);
  if (c.type === 'blob') {
    const name = blobName(s);
    c.pal = blobPal(name);
    c.accent = c.pal.s;
    c.mark = (name.match(/[\p{L}\p{N}]/u)?.[0] ?? 'A').toUpperCase();
  }
  return c;
}
