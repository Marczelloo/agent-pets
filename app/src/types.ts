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
  /** id sesji rodzica; brak = zwykła sesja */
  parent?: string | null;
  /** tylko u dzieci (subagentów) */
  sub?: SubInfo | null;
  /** bieżący tekst akcji (tylko w pamięci rdzenia i okien) */
  action?: string | null;
  /** tekst pytania, tylko w `needs_you` */
  question?: string | null;
}

export type SubKind = 'claude' | 'codex' | 'router';
export interface SubInfo { kind: SubKind; agent_type: string | null; description: string | null; background: boolean }

export interface RouterTask { task_id: string; status: string; last_activity_at: number | null; blocked: boolean; stall_ms: number }

export interface Limit { agent: Agent; window: 'five_hour' | 'weekly'; used_pct: number; resets_at: number | null }
export interface Snapshot { sessions: Session[]; limits: Limit[]; now: number }
/** Układ od Rusta; `mode` i `light` od 0.7 (brak = pasek, ciemny). */
export interface StageLayout { max_css: number; height_css: number; scale: number; mode?: 'taskbar' | 'floating'; light?: boolean }
export type PointerMsg =
  | { kind: 'move'; x: number; y: number }
  | { kind: 'leave' }
  | { kind: 'click'; x: number; y: number }
  | { kind: 'context'; x: number; y: number };
export interface TooltipContent { title: string; subtitle: string; lines: string[] }

export type AppId = 'claude_code' | 'codex' | 'agent_router';
export type StyleId = 'sketch' | 'clean' | 'sticker' | 'pixel' | 'neon' | 'ink' | 'pastel';
export type MotionId = 'calm' | 'dynamic';
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
  updates: Updates;
  stage: StageSettings;
  [extra: string]: unknown;
}
export type Updates = 'notify' | 'auto' | 'off';
/** Lustro `placement::MonitorInfo` (komenda `monitors_list`). */
export interface MonitorInfo { id: string; primary: boolean; width: number; height: number; index: number; has_bar: boolean }
/** Lustro `updater::UpdateStatus` (zdarzenie `pets://update`). */
export type UpdateStatus =
  | { state: 'idle' } | { state: 'checking' } | { state: 'latest' }
  | { state: 'available'; version: string; notes: string | null }
  | { state: 'downloading'; version: string; pct: number | null }
  | { state: 'ready'; version: string }
  /** `verify`: problem z samą aktualizacją (panel i ustawienia); inaczej błąd sprawdzania (tylko ustawienia) */
  | { state: 'error'; message: string; verify: boolean };
export type StagePosition = 'right' | 'left' | 'custom' | 'floating';
export type StageAlign = 'left' | 'center' | 'right';
export type StageOrder = 'start' | 'attention' | 'agent';
export interface StageBackground { kind: 'none' | 'glass' | 'solid'; color?: string | null; opacity?: number | null; radius: number }
/** Lustro `settings::Stage` z rdzenia (karta „Pasek”). */
export interface StageSettings {
  position: StagePosition;
  /** kotwica w pasku jako ułamek szerokości paska (0–1) */
  custom_at?: number | null;
  /** kotwica okna pływającego (px CSS względem obszaru roboczego monitora) */
  floating_at?: { x: number; y: number } | null;
  monitor: string;
  background: StageBackground;
  size: number;
  gap: number;
  padding: number;
  align: StageAlign;
  order: StageOrder;
  show: { progress: boolean; limits: boolean; badge: boolean };
  bubbles: { questions: boolean; actions: boolean };
  /** mini-zwierzaki subagentów pracujących dłużej niż 5 s */
  minis: boolean;
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
  stats_files: number;
  stats_scanned_bytes: number;
  stats_total_bytes: number;
}

// Statystyki (0.9): lustro `pets_core::stats::summary::StatsView` i `scan::Progress`.
export type StatAgent = 'claude' | 'codex' | 'router';
export type StatsPeriod = 'today' | 'week' | 'month' | 'all';
export type StatsMetric = 'time' | 'tokens';
export type StatsRace = 'agents' | 'projects';
export type BadgeKind = 'glutton' | 'cache_master' | 'night_owl' | 'marathon';
export interface StatsPlace { project: string; value: number; agent: StatAgent }
export interface StatsTiles {
  tokens: number; tokens_change: number | null; cache_pct: number | null; cache_read: number;
  active_ms: number; longest_ms: number; sessions: number; subagents: number; questions: number;
}
export interface StatsLane { key: string; agent: StatAgent | null; value: number }
export interface StatsDay { date: string; active_ms: number; level: number }
export interface StatsBadge { kind: BadgeKind; project: string | null; agent: StatAgent | null; value: number }
export interface StatsView { empty: boolean; podium: StatsPlace[]; tiles: StatsTiles; race: StatsLane[]; calendar: StatsDay[]; badges: StatsBadge[]; record: boolean }
export interface StatsProgress { files: number; scanned: number; total: number; done: boolean }
