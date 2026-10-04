import { test, expect, mock } from 'claude-code/testing'
import type { EngineInterface as Api, On } from 'claude-code'
import { toPayload, registerReport } from './report'
import type { ModPayload } from './report'
import type { Bridge } from './bridge'

test('toPayload maps a full session.measure input', () => {
  const p = toPayload('measure', 's1', 42, {
    context: { window: 200000, tokens: 50000, percent: 25 },
    rateLimits: [
      { kind: 'five_hour', percentUsed: 23.5, resetsAt: '2026-10-04T18:00:00Z' },
      { kind: 'seven_day', percentUsed: 61 },
      { kind: 'spend_limit', percentUsed: 5 },
    ],
    cost: { usd: 1.25 },
    changed: ['context'],
  })
  expect(p).toEqual({
    v: 1,
    kind: 'measure',
    session_id: 's1',
    ts: 42,
    context: { window: 200000, tokens: 50000, percent: 25 },
    rate_limits: [
      { kind: 'five_hour', percent_used: 23.5, resets_at: '2026-10-04T18:00:00Z' },
      { kind: 'seven_day', percent_used: 61 },
      { kind: 'spend_limit', percent_used: 5 },
    ],
    cost_usd: 1.25,
  })
})

test('toPayload leaves out what the input lacks (never 0)', () => {
  const p = toPayload('measure', 's1', 1, { context: { window: 200000 }, rateLimits: [], changed: ['context'] })
  expect(p).toEqual({ v: 1, kind: 'measure', session_id: 's1', ts: 1, context: { window: 200000 } })
  expect('cost_usd' in p).toBe(false)
  expect('rate_limits' in p).toBe(false)
  const bare = toPayload('measure', 's1', 1, { rateLimits: [], changed: [] })
  expect('context' in bare).toBe(false)
  const odd = toPayload('measure', 's1', 1, { context: { window: 1.5, tokens: -3, percent: 7 }, rateLimits: [], changed: ['context'] })
  expect(odd.context).toEqual({ percent: 7 })
})

test('toPayload start, turn_end and end', () => {
  expect(toPayload('start', 's1', 1, { cwd: 'C:/work', surface: null, isInteractive: true })).toEqual({
    v: 1, kind: 'start', session_id: 's1', ts: 1, cwd: 'C:/work',
  })
  expect(toPayload('turn_end', 's1', 1, { reason: 'aborted' })).toEqual({
    v: 1, kind: 'turn_end', session_id: 's1', ts: 1, reason: 'aborted',
  })
  expect(toPayload('end', 's1', 1, { reason: 'other', sessionId: 's1' })).toEqual({
    v: 1, kind: 'end', session_id: 's1', ts: 1,
  })
})

// A fake `on` that keeps the hooks, so a hook can be called with a hand-made `$`.
function capture(bridge: Bridge) {
  const hooks = new Map<string, (...a: unknown[]) => Promise<unknown>>()
  const fakeOn = ((name: string, hook: (...a: unknown[]) => Promise<unknown>) => { hooks.set(name, hook) }) as unknown as On
  registerReport(fakeOn, bridge)
  const $ = {
    clock: { now: async () => 7 },
    session: { id: async () => 'live-id', model: async () => 'claude-opus-5-5' },
  } as unknown as Api
  return { hooks, $ }
}

const recorder = () => {
  const sent: ModPayload[] = []
  const bridge: Bridge = { send: p => { sent.push(p) }, state: async () => null, stopped: () => false }
  return { sent, bridge }
}

test('measure carries the model, and start too', async () => {
  const { sent, bridge } = recorder()
  const { hooks, $ } = capture(bridge)
  const next = async (e: unknown) => ({ echoed: e })
  await hooks.get('session.measure')!($, { context: { window: 1000 }, rateLimits: [], changed: [] }, next)
  await hooks.get('session.start')!($, { cwd: 'C:/w', surface: null, isInteractive: true }, next)
  expect(sent.map(p => [p.kind, p.session_id, p.ts, p.model])).toEqual([
    ['measure', 'live-id', 7, 'claude-opus-5-5'],
    ['start', 'live-id', 7, 'claude-opus-5-5'],
  ])
})

test('turn.complete reports the reason; session.end uses the ending session id and no model', async () => {
  const { sent, bridge } = recorder()
  const { hooks, $ } = capture(bridge)
  const next = async (e: unknown) => e
  await hooks.get('turn.complete')!($, { reason: 'error' }, next)
  await hooks.get('session.end')!($, { reason: 'clear', sessionId: 'old-id' }, next)
  expect(sent.map(p => [p.kind, p.session_id, p.reason, p.model])).toEqual([
    ['turn_end', 'live-id', 'error', undefined],
    ['end', 'old-id', undefined, undefined],
  ])
})

test('a model that cannot be read is left out, the payload still goes', async () => {
  const { sent, bridge } = recorder()
  const { hooks, $ } = capture(bridge)
  ;($ as unknown as { session: { model: () => Promise<string> } }).session.model = async () => { throw new Error('nope') }
  await hooks.get('session.measure')!($, { context: { window: 1000 }, rateLimits: [], changed: [] }, async (e: unknown) => e)
  expect(sent.length).toBe(1)
  expect('model' in sent[0]!).toBe(false)
})

test('a hook returns what next returns even when send throws', async () => {
  const bridge: Bridge = { send: () => { throw new Error('boom') }, state: async () => null, stopped: () => false }
  const { hooks, $ } = capture(bridge)
  const result = { changed: ['cost'] }
  for (const name of ['session.start', 'session.measure', 'turn.complete', 'session.end']) {
    const r = await hooks.get(name)!($, { sessionId: 's', reason: 'answer', rateLimits: [] }, async () => result)
    expect(r).toBe(result)
  }
})

// Through the real plugin: the whole path from a measure to the widget's door.
test('session.measure reaches the widget with limits and model', async ($, on) => {
  const clock = mock.clock(on, { now: 5_000 })
  mock.env(on, { USERPROFILE: 'C:\\Users\\tester' })
  const posts: { url: string; auth?: string; body: ModPayload }[] = []
  on('session.measure', ($$, e) => ({ changed: e.changed }))
  on('session.id', () => ({ value: 'sid-1' }))
  on('session.model', () => ({ value: 'claude-opus-5-5' }))
  on('fs.exists', () => ({ value: false }))
  on('fs.read', ($$, e) => {
    // the engine hands the path over in the platform's own spelling
    const path = e.path.split('\\').join('/')
    if (path === 'C:/Users/tester/.agent-pets/endpoint.json') return { value: JSON.stringify({ port: 4711, token: 'tok' }) }
    return { deny: 'ENOENT' }
  })
  on('http.fetch', ($$, e) => {
    posts.push({ url: e.url, auth: e.init?.headers?.['authorization'], body: JSON.parse(e.init?.body ?? '{}') })
    return { value: { status: 204, ok: true, headers: {}, text: '' } }
  })

  await $.session.measure({
    context: { window: 1000000, tokens: 100000, percent: 10 },
    rateLimits: [{ kind: 'five_hour', percentUsed: 12, resetsAt: '2026-10-04T18:00:00Z' }],
    cost: { usd: 0.5 },
    changed: ['context'],
  })
  await clock.settle()
  expect(posts.length).toBe(1)
  expect(posts[0]!.url).toBe('http://127.0.0.1:4711/v1/events/claude-mod')
  expect(posts[0]!.auth).toBe('Bearer tok')
  expect(posts[0]!.body).toEqual({
    v: 1,
    kind: 'measure',
    session_id: 'sid-1',
    ts: 5000,
    model: 'claude-opus-5-5',
    context: { window: 1000000, tokens: 100000, percent: 10 },
    rate_limits: [{ kind: 'five_hour', percent_used: 12, resets_at: '2026-10-04T18:00:00Z' }],
    cost_usd: 0.5,
  })
})
