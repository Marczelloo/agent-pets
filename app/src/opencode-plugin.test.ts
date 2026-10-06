import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// the plugin is a regular JS module installed into opencode; test this exact file
const PLUGIN = new URL('../../crates/pets-core/assets/opencode-plugin.js', import.meta.url).href;
const CONTRACT = ['v', 'ts', 'pid', 'event', 'session', 'cwd', 'status', 'tool', 'title', 'model', 'question', 'input', 'parent'];

type Hooks = Record<string, (...a: unknown[]) => Promise<void>>;
const env = { HOME: process.env.HOME, USERPROFILE: process.env.USERPROFILE, EP: process.env.AGENT_PETS_ENDPOINT };
let fetchMock: ReturnType<typeof vi.fn>;
const homes: string[] = [];

async function load(withEndpoint = true): Promise<Hooks> {
  const home = mkdtempSync(join(tmpdir(), 'pets-oc-'));
  homes.push(home);
  if (withEndpoint) {
    mkdirSync(join(home, '.agent-pets'));
    writeFileSync(join(home, '.agent-pets', 'endpoint.json'), JSON.stringify({ port: 4321, token: 'tok' }));
  }
  process.env.HOME = home;
  process.env.USERPROFILE = home;
  delete process.env.AGENT_PETS_ENDPOINT;
  const mod = await import(/* @vite-ignore */ PLUGIN);
  return mod.AgentPets({ directory: 'C:/w' });
}

function sent(): Record<string, unknown>[] {
  return fetchMock.mock.calls.map((c) => JSON.parse((c[1] as RequestInit).body as string));
}

beforeEach(() => {
  fetchMock = vi.fn(async () => new Response(null, { status: 204 }));
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
  if (env.HOME === undefined) delete process.env.HOME; else process.env.HOME = env.HOME;
  if (env.USERPROFILE === undefined) delete process.env.USERPROFILE; else process.env.USERPROFILE = env.USERPROFILE;
  if (env.EP === undefined) delete process.env.AGENT_PETS_ENDPOINT; else process.env.AGENT_PETS_ENDPOINT = env.EP;
  for (const home of homes.splice(0)) rmSync(home, { recursive: true, force: true });
});

describe('opencode plugin', () => {
  it('sends a busy session with the token to our route', async () => {
    const h = await load();
    await h.event({ event: { type: 'session.status', properties: { sessionID: 'ses_1', status: { type: 'busy' } } } });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://127.0.0.1:4321/v1/events/opencode');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer tok');
    const b = sent()[0];
    expect(b).toMatchObject({ v: 1, event: 'session.status', session: 'ses_1', status: 'busy', pid: process.pid, cwd: 'C:/w' });
    expect(Object.keys(b).every((k) => CONTRACT.includes(k))).toBe(true);
  });

  it('does nothing and never throws without endpoint.json', async () => {
    const h = await load(false);
    await expect(h.event({ event: { type: 'session.status', properties: { sessionID: 's', status: { type: 'idle' } } } })).resolves.toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('swallows a failing fetch', async () => {
    fetchMock.mockImplementation(() => { throw new Error('port closed'); });
    const h = await load();
    await expect(h.event({ event: { type: 'session.error', properties: { sessionID: 's' } } })).resolves.toBeUndefined();
    fetchMock.mockImplementation(() => Promise.reject(new Error('timeout')));
    await expect(h['tool.execute.after']({ tool: 'bash', sessionID: 's', callID: 'c' }, {})).resolves.toBeUndefined();
  });

  it('chat.message sends only the model, never the message', async () => {
    const h = await load();
    await h['chat.message']({ sessionID: 's', model: { providerID: 'openai', modelID: 'gpt-6-sol' } },
      { message: { id: 'm' }, parts: [{ type: 'text', text: 'SEKRET-123' }] });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(sent()[0]).toMatchObject({ event: 'chat.message', session: 's', model: 'openai/gpt-6-sol' });
    expect(JSON.stringify(sent())).not.toContain('SEKRET-123');
  });

  it('tools send only whitelisted input, permissions and questions their text', async () => {
    const h = await load();
    await h['tool.execute.before']({ tool: 'write', sessionID: 's', callID: 'c' }, { args: { filePath: 'C:/w/a.ts', content: 'SEKRET-123' } });
    await h.event({ event: { type: 'permission.asked', properties: { sessionID: 's', title: 'Run rm -rf dist?' } } });
    await h.event({ event: { type: 'question.asked', properties: { sessionID: 's', questions: [{ question: 'Which port?' }] } } });
    await h.event({ event: { type: 'session.updated', properties: { info: { id: 's', title: 'Fix build' } } } });
    expect(fetchMock).toHaveBeenCalledTimes(4);
    const b = sent();
    expect(b[0]).toMatchObject({ event: 'tool.before', tool: 'write', input: { file_path: 'C:/w/a.ts' } });
    expect(b[1]).toMatchObject({ event: 'permission.asked', question: 'Run rm -rf dist?' });
    expect(b[2]).toMatchObject({ event: 'question.asked', question: 'Which port?' });
    expect(b[3]).toMatchObject({ event: 'session.updated', session: 's', title: 'Fix build' });
    expect(JSON.stringify(b)).not.toContain('SEKRET-123');
  });

  it('a task session names its parent', async () => {
    const h = await load();
    await h.event({ event: { type: 'session.created', properties: { info: { id: 'ses_kid', parentID: 'ses_p', title: 'Find tests' } } } });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(sent()[0]).toMatchObject({ event: 'session.created', session: 'ses_kid', parent: 'ses_p', title: 'Find tests' });
  });

  it('ignores events it does not know', async () => {
    const h = await load();
    await h.event({ event: { type: 'message.part.updated', properties: { part: { text: 'SEKRET-123' } } } });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
