import { test, expect } from 'claude-code/testing'
import { createBridge, sharedBridge } from './bridge'
import type { BridgeIo } from './bridge'
import type { ModPayload } from './report'

const HOME = 'C:\\Users\\tester'
const ENDPOINT = 'C:/Users/tester/.agent-pets/endpoint.json'
const SKILLS_ROOT = 'C:/Users/tester/.claude/skills/agent-pets'
const SKILLS_MANIFEST = `${SKILLS_ROOT}/.claude-plugin/plugin.json`
const TOKEN = 'tok-secret-123'

type Call = { url: string; init?: { method?: string; headers?: Record<string, string>; body?: string } }

// A hand-made io: what the bridge needs from the engine, over files and a clock held in memory.
function world(opts: { root?: string; files?: Record<string, string>; fetch?: (c: Call) => { status: number; text?: string } | Error } = {}) {
  const files: Record<string, string> = { ...(opts.files ?? {}) }
  const calls: Call[] = []
  const reads: string[] = []
  let now = 1_000_000
  const answer: (c: Call) => { status: number; text?: string } | Error = opts.fetch ?? (() => ({ status: 204 }))
  const io: BridgeIo = {
    pluginRoot: opts.root ?? 'C:/Users/tester/plugins/agent-pets',
    home: async () => HOME,
    read: async path => {
      reads.push(path)
      const text = files[path]
      if (text === undefined) throw new Error('ENOENT')
      return text
    },
    exists: async path => path in files,
    now: async () => now,
    fetch: async (url, init) => {
      const call = { url, init }
      calls.push(call)
      const r = answer(call)
      if (r instanceof Error) throw r
      return { status: r.status, ok: r.status >= 200 && r.status < 300, text: r.text ?? '' }
    },
  }
  return {
    io,
    files,
    calls,
    reads,
    advance: (ms: number) => { now += ms },
  }
}

const endpointFile = (port: number) => JSON.stringify({ port, token: TOKEN })
const flush = async () => { for (let i = 0; i < 50; i++) await Promise.resolve() }
const payload = (sessionId: string): ModPayload => ({ v: 1, kind: 'measure', session_id: sessionId, ts: 1 })

test('a malformed endpoint file sends nothing', async () => {
  for (const port of ['80@evil.com', 0, 70000, 1.5]) {
    const w = world({ files: { [ENDPOINT]: JSON.stringify({ port, token: TOKEN }) } })
    const bridge = createBridge(w.io)
    expect(await bridge.state()).toBe(null)
    bridge.send(payload('s1'))
    await flush()
    expect(w.calls.length).toBe(0)
  }
})

test('no endpoint file: state() is null and send does not throw', async () => {
  const w = world()
  const bridge = createBridge(w.io)
  expect(await bridge.state()).toBe(null)
  expect(() => bridge.send(payload('s1'))).not.toThrow()
  await flush()
  expect(w.calls.length).toBe(0)
  expect(w.reads).toContain(ENDPOINT)
})

test('posts to 127.0.0.1 with a bearer token that never reaches the URL', async () => {
  const w = world({ files: { [ENDPOINT]: endpointFile(4711) } })
  const bridge = createBridge(w.io)
  bridge.send(payload('s1'))
  await flush()
  expect(w.calls.length).toBe(1)
  const c = w.calls[0]!
  expect(c.url).toBe('http://127.0.0.1:4711/v1/events/claude-mod')
  expect(c.url.includes(TOKEN)).toBe(false)
  expect(c.init?.method).toBe('POST')
  expect(c.init?.headers?.['authorization']).toBe(`Bearer ${TOKEN}`)
  expect(JSON.parse(c.init?.body ?? '{}').session_id).toBe('s1')
})

test('state() GETs /v1/state and returns the board', async () => {
  const board = { v: 1, app_version: '0.16.0', sessions: [], limits: [] }
  const w = world({
    files: { [ENDPOINT]: endpointFile(4711) },
    fetch: () => ({ status: 200, text: JSON.stringify(board) }),
  })
  const bridge = createBridge(w.io)
  expect(await bridge.state()).toEqual(board)
  expect(w.calls[0]!.url).toBe('http://127.0.0.1:4711/v1/state')
  expect(w.calls[0]!.init?.method ?? 'GET').toBe('GET')
  expect(w.calls[0]!.url.includes(TOKEN)).toBe(false)
})

test('a failed request backs the bridge off for 30 s, then re-reads the endpoint', async () => {
  let failing = true
  const w = world({
    files: { [ENDPOINT]: endpointFile(4711) },
    fetch: () => (failing ? new Error('ECONNREFUSED') : { status: 204 }),
  })
  const bridge = createBridge(w.io)
  bridge.send(payload('s1'))
  await flush()
  expect(w.calls.length).toBe(1)

  // within the backoff nothing is fetched, nothing is re-read
  w.advance(29_000)
  bridge.send(payload('s1'))
  expect(await bridge.state()).toBe(null)
  await flush()
  expect(w.calls.length).toBe(1)
  expect(w.reads.length).toBe(1)

  // after it the endpoint is re-read: the widget came back on another port
  failing = false
  w.files[ENDPOINT] = endpointFile(5555)
  w.advance(1_000)
  bridge.send(payload('s1'))
  await flush()
  expect(w.reads.length).toBe(2)
  expect(w.calls.length).toBe(2)
  expect(w.calls[1]!.url).toBe('http://127.0.0.1:5555/v1/events/claude-mod')
})

test('a non-2xx other than 400 also backs off', async () => {
  const w = world({ files: { [ENDPOINT]: endpointFile(4711) }, fetch: () => ({ status: 401 }) })
  const bridge = createBridge(w.io)
  bridge.send(payload('s1'))
  await flush()
  bridge.send(payload('s1'))
  await flush()
  expect(w.calls.length).toBe(1)
  expect(bridge.stopped('s1')).toBe(false)
})

test('a 400 stops that session only, without backing off the others', async () => {
  const w = world({
    files: { [ENDPOINT]: endpointFile(4711) },
    fetch: c => ({ status: JSON.parse(c.init?.body ?? '{}').session_id === 'bad' ? 400 : 204 }),
  })
  const bridge = createBridge(w.io)
  expect(bridge.stopped('bad')).toBe(false)
  bridge.send(payload('bad'))
  await flush()
  expect(bridge.stopped('bad')).toBe(true)
  expect(bridge.stopped('good')).toBe(false)

  bridge.send(payload('bad'))
  await flush()
  expect(w.calls.length).toBe(1)

  bridge.send(payload('good'))
  await flush()
  expect(w.calls.length).toBe(2)
})

test('duplicate copy: a copy outside the skills folder goes silent when the skills copy exists', async () => {
  const w = world({ files: { [ENDPOINT]: endpointFile(4711), [SKILLS_MANIFEST]: '{}' } })
  const bridge = createBridge(w.io)
  bridge.send(payload('s1'))
  expect(await bridge.state()).toBe(null)
  await flush()
  expect(w.calls.length).toBe(0)
  expect(w.reads.length).toBe(0)
})

test('duplicate copy: the copy at the skills folder is never silenced (case and slashes ignored)', async () => {
  const w = world({
    root: 'c:\\users\\TESTER\\.claude\\skills\\Agent-Pets\\',
    files: { [ENDPOINT]: endpointFile(4711), [SKILLS_MANIFEST]: '{}' },
  })
  const bridge = createBridge(w.io)
  bridge.send(payload('s1'))
  await flush()
  expect(w.calls.length).toBe(1)
})

test('duplicate copy: a copy elsewhere reports when there is no skills copy', async () => {
  const w = world({ files: { [ENDPOINT]: endpointFile(4711) } })
  const bridge = createBridge(w.io)
  bridge.send(payload('s1'))
  await flush()
  expect(w.calls.length).toBe(1)
})

test('sharedBridge hands every caller the first bridge made', () => {
  const first = sharedBridge(world().io)
  expect(sharedBridge(world().io)).toBe(first)
})
