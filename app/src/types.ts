// Lustro modelu z crates/pets-core/src/model.rs (serde: snake_case, Option → null).
export type Agent = 'claude' | 'codex';
export type Origin = 'cli' | 'desktop' | 'router';
export type State = 'thinking' | 'working' | 'needs_you' | 'done' | 'error' | 'idle' | 'sleep' | 'compacting' | 'ended';
export type Tool = 'edit' | 'bash' | 'read' | 'grep' | 'web' | 'agent' | 'mcp' | 'other';

export interface Progress { done: number; total: number }
export interface Context { used: number; max: number }

export interface Session {
  id: string;
  agent: Agent;
  origin: Origin;
  title: string;
  cwd: string;
  state: State;
  tool: Tool | null;
  progress: Progress | null;
  context: Context | null;
  started_at: number;
  last_activity: number;
  state_since: number;
  turn_started_at: number | null;
  jump: { pid: number | null; session_id: string; cwd: string; app: string | null };
  /** zadanie Agent Routera powiązane z tym wątkiem Codexa */
  router_task?: RouterTask | null;
}

export interface RouterTask { task_id: string; status: string; last_activity_at: number | null; blocked: boolean; stall_ms: number }

export interface Limit { agent: Agent; window: 'five_hour' | 'weekly'; used_pct: number; resets_at: number | null }
export interface Snapshot { sessions: Session[]; limits: Limit[]; now: number }
export interface StageLayout { max_css: number; height_css: number; scale: number }
export type PointerMsg =
  | { kind: 'move'; x: number; y: number }
  | { kind: 'leave' }
  | { kind: 'click'; x: number; y: number }
  | { kind: 'context'; x: number; y: number };
export interface TooltipContent { title: string; subtitle: string; lines: string[] }
