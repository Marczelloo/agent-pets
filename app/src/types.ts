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

export type AppId = 'claude_code' | 'codex' | 'agent_router';
export type StyleId = 'sketch' | 'clean' | 'sticker' | 'pixel' | 'neon' | 'ink' | 'pastel';
export type MotionId = 'calm' | 'anime';
export interface Look { style: StyleId; motion: MotionId }
export interface Pets { style: StyleId; motion: MotionId; overrides: Partial<Record<AppId, Partial<Look>>>; max_visible: number }
export interface AppsSettings { claude_code: boolean; codex: boolean; agent_router: boolean }
export interface Settings {
  version: number;
  apps: AppsSettings;
  claude_statusline: boolean;
  claude_plan_usage: boolean;
  notifications: { needs_you: boolean; done: boolean; limits: boolean };
  pets: Pets;
  power_saving: 'auto' | 'always' | 'never';
  autostart: boolean;
  language: Language;
  [extra: string]: unknown;
}
export type Language = 'auto' | 'pl' | 'en';
/** `lang`: język tekstów z Rusta (ustawienie albo język Windows), dla `auto` w UI. */
export interface SettingsView { settings: Settings; first_run: boolean; load_error: string | null; lang?: 'pl' | 'en'; system_lang?: 'pl' | 'en' }
export interface AppRow {
  id: AppId;
  detected: { found: boolean; path: string | null; note: string | null };
  status: { installed: boolean; detail: string };
  enabled: boolean;
}
export interface Diagnostics {
  version: string;
  endpoint_port: number | null;
  settings_path: string;
  settings_error: string | null;
  hook_exe: string | null;
  autostart_registered: boolean;
  last_seen: Record<string, number>;
  apps: [AppId, boolean, string][];
}
