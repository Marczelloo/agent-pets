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
 * Only a session doing nothing and not waiting for you listens to music (`idle`, `sleep`).
 * `music`: system audio is playing (Spotify, Apple Music, browser…) and the user allows reactions.
 */
export const listens = (s: Pick<Session, 'state'>, music: boolean) => music && (s.state === 'idle' || s.state === 'sleep');

/** Headphone scenes: an idle pet dances; a sleeping pet keeps dozing, now with headphones. */
export const MUSIC_SCENES: ReadonlySet<SceneKey> = new Set(['vibe', 'doze']);

export function sceneFor(s: Pick<Session, 'state' | 'tool'>, music = false): SceneKey {
  if (listens(s, music)) return s.state === 'sleep' ? 'doze' : 'vibe';
  if (s.state === 'working') return TOOL[s.tool ?? 'other'] ?? 'mcp';
  return STATE[s.state] ?? 'thinking';
}

const SKIN_OF: Record<string, SkinId> = {
  claude: 'clawd', codex: 'kodek', opencode: 'opencode', copilot: 'copilot', antigravity: 'antigravity', cursor: 'cursor', grok: 'grok', zcode: 'zcode',
};
/** Agent skin; agents without their own mascot (bridge) get a blob. */
export const skinFor = (agent: string): SkinId => SKIN_OF[agent] ?? 'blob';

const blobName = (s: Pick<Session, 'agent' | 'agent_name'>) => agentLabel({ agent: s.agent, agent_name: s.agent_name?.trim() || null });

/** Session pet accent color (bubbles, entrance); a blob derives its own from its name. */
export function accentFor(s: Pick<Session, 'agent' | 'agent_name'>): string {
  const skin = skinFor(s.agent);
  return skin === 'blob' ? blobPal(blobName(s)).s : ACCENT[skin];
}

/** Session pet: a blob gets its color and letter from the agent name. */
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
