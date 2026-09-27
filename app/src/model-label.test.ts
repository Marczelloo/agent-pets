import { afterEach, describe, expect, it } from 'vitest';
import { setLang } from './i18n';
import { agentLabel, hostLabel, modelLabel } from './model-label';
import type { Session } from './types';

afterEach(() => setLang('pl'));

describe('modelLabel', () => {
  it('names models the way people say them', () => {
    const cases: [string, string][] = [
      ['claude-opus-5-5', 'Opus 5.5'], ['claude-sonnet-5', 'Sonnet 5'], ['claude-haiku-4-5-20251001', 'Haiku 4.5'],
      ['claude-fable-5-1', 'Fable 5.1'], ['gpt-6-sol', 'GPT-6 Sol'], ['gpt-6', 'GPT-6'], ['gpt-5.1-codex-max', 'GPT-5.1 Codex Max'],
      ['gemini-3-pro', 'Gemini 3 Pro'], ['glm-5.3', 'GLM-5.3'], ['anthropic/claude-opus-5-5', 'Opus 5.5'],
      ['openrouter/openai/gpt-6-sol', 'GPT-6 Sol'], ['GLM-5.3', 'GLM-5.3'], ['kimi-k2', 'kimi-k2'],
    ];
    for (const [id, want] of cases) expect(modelLabel(id), id).toBe(want);
  });
  it('keeps unknown ids short and drops empty ones', () => {
    expect(modelLabel('x'.repeat(50))).toHaveLength(32);
    expect([modelLabel(null), modelLabel(undefined), modelLabel(''), modelLabel('  ')]).toEqual([null, null, null, null]);
  });
});

describe('agentLabel and hostLabel', () => {
  const s = (p: Partial<Session>): Session => ({
    id: 's', agent: 'claude', origin: 'cli', title: '', cwd: '', state: 'idle', tool: null, progress: null, context: null,
    started_at: 0, last_activity: 0, state_since: 0, turn_started_at: null, jump: { pid: null, session_id: 's', cwd: '', app: null }, ...p,
  });
  it('a door agent shows the name it reported', () => {
    expect(agentLabel(s({ agent: 'other', agent_name: 'Kilo CLI' }))).toBe('Kilo CLI');
    expect(agentLabel(s({ agent: 'other' }))).toBe('Agent');
    expect(agentLabel(s({ agent: 'opencode' }))).toBe('opencode');
  });
  it('names the program, skipping the terminal', () => {
    const j = (app: Session['jump']['app'], app_name: string | null = null) => ({ pid: null, session_id: 's', cwd: '', app, app_name });
    expect(hostLabel(s({ jump: j('terminal') }))).toBeNull();
    expect(hostLabel(s({}))).toBeNull();
    expect(hostLabel(s({ origin: 'desktop' }))).toBe('aplikacja');
    expect(hostLabel(s({ origin: 'router' }))).toBe('Agent Router');
    expect(hostLabel(s({ jump: j('t3code') }))).toBe('t3code');
    expect(hostLabel(s({ jump: j('vscode') }))).toBe('VS Code');
    expect(hostLabel(s({ jump: j('jetbrains') }))).toBe('JetBrains');
    expect(hostLabel(s({ origin: 'desktop', jump: j('codex_app') }))).toBe('aplikacja');
    expect(hostLabel(s({ origin: 'desktop', jump: j('other', 'zed_codex') }))).toBe('zed_codex');
    setLang('en');
    expect(hostLabel(s({ origin: 'desktop' }))).toBe('app');
  });
});
