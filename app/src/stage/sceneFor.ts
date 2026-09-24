import type { SkinId } from '../skins';
import type { Session } from '../types';

export type SceneKey = 'thinking' | 'edit' | 'bash' | 'read' | 'grep' | 'web' | 'agent' | 'mcp'
  | 'needs' | 'done' | 'error' | 'idle' | 'sleep' | 'compact' | 'bye';

const TOOL: Record<string, SceneKey> = {
  edit: 'edit', bash: 'bash', read: 'read', grep: 'grep', web: 'web', agent: 'agent', mcp: 'mcp', other: 'mcp',
};
const STATE: Record<string, SceneKey> = {
  thinking: 'thinking', needs_you: 'needs', done: 'done', error: 'error', idle: 'idle',
  sleep: 'sleep', compacting: 'compact', ended: 'bye',
};

export function sceneFor(s: Pick<Session, 'state' | 'tool'>): SceneKey {
  if (s.state === 'working') return TOOL[s.tool ?? 'other'] ?? 'mcp';
  return STATE[s.state] ?? 'thinking';
}

export const skinFor = (agent: string): SkinId => (agent === 'codex' ? 'kodek' : 'clawd');
