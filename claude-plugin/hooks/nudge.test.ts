import { test, expect, mock } from 'claude-code/testing'
import type { On } from 'claude-code'
import { diff } from './nudge'
import type { Board, BoardSession } from './bridge'

const NOW = 1_800_000_000_000
const WAITING = '\u23f3'

const session = (over: Partial<BoardSession> & { id: string }): BoardSession => ({
  agent: 'codex',
  state: 'working',
  title: 'Port the parser',
  cwd: 'C:/w',
  since: NOW,
  ...over,
})
const boardOf = (...sessions: BoardSession[]): Board => ({ v: 1, app_version: '0.16.0', sessions, limits: [] })

test('a session that needs input toasts once, with its question', () => {
  const board = boardOf(session({ id: 'b', state: 'needs_input', question: 'Overwrite lib.rs?' }))
  const first = diff(new Set(), board, 'me')
  expect(first.toasts).toEqual(['Codex waits: Overwrite lib.rs?'])
  expect(first.waiting).toBe(1)
  const second = diff(first.seen, board, 'me')
  expect(second.toasts).toEqual([])
  expect(second.seen).toEqual(first.seen)
  expect(second.waiting).toBe(1)
})

test('a new question on the same session toasts again, and a session that moved on forgets its key', () => {
  const asked = (q: string) => boardOf(session({ id: 'b', state: 'needs_input', question: q }))
  const one = diff(new Set(), asked('Overwrite?'), 'me')
  const two = diff(one.seen, asked('Delete it?'), 'me')
  expect(two.toasts).toEqual(['Codex waits: Delete it?'])
  const gone = diff(two.seen, boardOf(session({ id: 'b', state: 'working' })), 'me')
  expect(gone.toasts).toEqual([])
  expect(gone.seen.size).toBe(0)
  expect(diff(gone.seen, asked('Delete it?'), 'me').toasts).toEqual(['Codex waits: Delete it?'])
})

test('an error toasts with the title; done and working never toast', () => {
  const board = boardOf(
    session({ id: 'a', agent: 'claude', state: 'error', title: 'Fix the build' }),
    session({ id: 'b', state: 'done' }),
    session({ id: 'c', state: 'working', question: 'ignored' }),
  )
  const out = diff(new Set(), board, 'me')
  expect(out.toasts).toEqual(['Claude hit an error: Fix the build'])
  expect(out.waiting).toBe(0)
})

test('this session and its children never toast or count', () => {
  const board = boardOf(
    session({ id: 'me', state: 'needs_input', question: 'mine' }),
    session({ id: 'me/sub', state: 'error', title: 'child' }),
    session({ id: 'me2', state: 'needs_input', question: 'someone else' }),
  )
  const out = diff(new Set(), board, 'me')
  expect(out.toasts).toEqual(['Codex waits: someone else'])
  expect(out.waiting).toBe(1)
})

test('waiting counts every other session that needs input, errors excluded', () => {
  const board = boardOf(
    session({ id: 'a', state: 'needs_input', question: 'a?' }),
    session({ id: 'b', state: 'needs_input', question: 'b?' }),
    session({ id: 'c', state: 'error' }),
  )
  expect(diff(new Set(), board, 'me').waiting).toBe(2)
})

test('the question is one line of at most 80 characters, and the agent is capitalised', () => {
  const long = `line one\nline two ${'x'.repeat(200)}`
  const out = diff(new Set(), boardOf(session({ id: 'b', agent: 'copilot', state: 'needs_input', question: long })), 'me')
  const text = out.toasts[0]!
  expect(text.startsWith('Copilot waits: line one line two ')).toBe(true)
  expect(text).not.toContain('\n')
  expect(Array.from(text.slice('Copilot waits: '.length)).length).toBeLessThanOrEqual(80)
  expect(text.endsWith('\u2026')).toBe(true)
})

test('a needs_input session without a question toasts with its title', () => {
  const out = diff(new Set(), boardOf(session({ id: 'b', state: 'needs_input', question: null })), 'me')
  expect(out.toasts).toEqual(['Codex waits: Port the parser'])
})

test('hostile board strings never reach a toast as control characters', () => {
  const ESC = String.fromCharCode(27)
  const RLO = String.fromCharCode(0x202e)
  const board = boardOf(
    session({ id: 'a', agent: `co${ESC}[31mdex${RLO}`, state: 'needs_input', question: `Over${ESC}[2Jwrite\r\nlib.rs${RLO}?` }),
    session({ id: 'b', state: 'error', title: `bad${ESC}[0m\ntitle` }),
  )
  const toasts = diff(new Set(), board, 'me').toasts
  expect(toasts.length).toBe(2)
  for (const text of toasts) {
    expect(text).not.toMatch(/[\u0000-\u001f\u007f-\u009f\u202a-\u202e]/)
  }
})

test('entries that are not sessions are skipped and a board without sessions is empty', () => {
  const odd = { v: 1, app_version: 'x', sessions: [null, 7, 'text', { id: 3, state: 'needs_input' }], limits: [] } as unknown as Board
  expect(() => diff(new Set(), odd, 'me')).not.toThrow()
  const none = { v: 1, app_version: 'x', limits: [] } as unknown as Board
  expect(diff(new Set(), none, 'me')).toEqual({ toasts: [], seen: new Set(), waiting: 0 })
})

// Everything beneath the plugin: clock, store, endpoint file, the widget's board, and what the plugin shows.
function world(on: On, store: Record<string, unknown> = {}, toastFails = false, duplicate = false) {
  const clock = mock.clock(on, { now: NOW })
  mock.env(on, { USERPROFILE: 'C:\\Users\\tester' })
  const held: Record<string, unknown> = { ...store }
  on('store.get', ($$, e) => {
    w.storeReads++
    return { value: held[e.key] }
  })
  on('store.set', ($$, e) => {
    held[e.key] = e.value
    return { value: undefined }
  })
  on('fs.exists', ($$, e) => ({ value: duplicate && e.path.split('\\').join('/') === 'C:/Users/tester/.claude/skills/agent-pets/.claude-plugin/plugin.json' }))
  on('fs.read', ($$, e) => {
    const path = e.path.split('\\').join('/')
    if (path === 'C:/Users/tester/.agent-pets/endpoint.json') return { value: JSON.stringify({ port: 4711, token: 'tok' }) }
    return { deny: 'ENOENT' }
  })
  on('session.id', () => ({ value: 'me' }))
  const w = {
    clock,
    held,
    board: boardOf() as Board | 'down',
    fetched: 0,
    storeReads: 0,
    toasts: [] as string[],
    statuses: [] as (string | undefined)[],
  }
  on('http.fetch', ($$, e) => {
    // the report hook posts the session's start; only reads of the board count
    if (e.init?.method === 'GET') w.fetched++
    if (w.board === 'down') return { deny: 'ECONNREFUSED' }
    return { value: { status: 200, ok: true, headers: {}, text: JSON.stringify(w.board) } }
  })
  on('ui.toast', ($$, e) => {
    if (toastFails) return { deny: 'EIO' }
    w.toasts.push(e.text)
    return { value: undefined }
  })
  on('ui.status', ($$, e) => {
    w.statuses.push(e.text)
    return { value: undefined }
  })
  on('session.start', ($$, e) => ({ cwd: e.cwd }))
  return w
}

const startTerminal = ($: { session: { start: (e: never) => Promise<unknown> } }) =>
  $.session.start({ cwd: 'C:/w', surface: 'terminal', isInteractive: true } as never)

test('the first tick seeds without toasting; a session that starts waiting later toasts once', async ($, on) => {
  const w = world(on)
  w.board = boardOf(session({ id: 'old', state: 'needs_input', question: 'already waiting' }))
  await startTerminal($)
  await w.clock.advance(3000)
  expect(w.toasts).toEqual([])
  expect(w.statuses.at(-1)).toBe(`${WAITING} 1 waiting`)

  w.board = boardOf(
    session({ id: 'old', state: 'needs_input', question: 'already waiting' }),
    session({ id: 'new', agent: 'claude', state: 'needs_input', question: 'Run the tests?' }),
    session({ id: 'bad', state: 'error', title: 'Port failed' }),
  )
  await w.clock.advance(3000)
  expect(w.toasts).toEqual(['Claude waits: Run the tests?', 'Codex hit an error: Port failed'])
  expect(w.statuses.at(-1)).toBe(`${WAITING} 2 waiting`)
  await w.clock.advance(3000)
  expect(w.toasts.length).toBe(2)

  w.board = boardOf()
  await w.clock.advance(3000)
  expect(w.statuses.at(-1)).toBeUndefined()
})

test('this session waiting for the user is not announced to itself', async ($, on) => {
  const w = world(on)
  await startTerminal($)
  await w.clock.advance(3000)
  w.board = boardOf(session({ id: 'me', agent: 'claude', state: 'needs_input', question: 'mine' }), session({ id: 'me/x', state: 'error' }))
  await w.clock.advance(3000)
  expect(w.toasts).toEqual([])
  expect(w.statuses.at(-1)).toBeUndefined()
})

test('with nudges off nothing toasts; turning them on seeds again instead of bursting', async ($, on) => {
  const w = world(on, { nudges: false })
  await startTerminal($)
  await w.clock.advance(3000)
  w.board = boardOf(session({ id: 'b', state: 'needs_input', question: 'Overwrite?' }))
  await w.clock.advance(3000)
  expect(w.toasts).toEqual([])
  expect(w.statuses.filter(s => s !== undefined)).toEqual([])
  w.held.nudges = true
  await w.clock.advance(3000)
  expect(w.toasts).toEqual([])
  expect(w.statuses.at(-1)).toBe(`${WAITING} 1 waiting`)
  w.board = boardOf(session({ id: 'b', state: 'needs_input', question: 'Overwrite?' }), session({ id: 'c', state: 'error', title: 'Boom' }))
  await w.clock.advance(3000)
  expect(w.toasts).toEqual(['Codex hit an error: Boom'])
})

test('an unreachable widget leaves the status clear, toasts nothing, and recovers', async ($, on) => {
  const w = world(on)
  w.board = 'down'
  await startTerminal($)
  await w.clock.advance(3000)
  await w.clock.advance(3000)
  expect(w.toasts).toEqual([])
  expect(w.statuses.filter(s => s !== undefined)).toEqual([])
  w.board = boardOf(session({ id: 'b', state: 'needs_input', question: 'Overwrite?' }))
  await w.clock.advance(30_000)
  expect(w.toasts).toEqual([])
  expect(w.statuses.at(-1)).toBe(`${WAITING} 1 waiting`)
})

test('a session that is not interactive starts no polling', async ($, on) => {
  const w = world(on)
  await $.session.start({ cwd: 'C:/w', surface: null, isInteractive: false } as never)
  await w.clock.advance(10_000)
  expect(w.fetched).toBe(0)
})

test('a failing toast does not stop the polling', async ($, on) => {
  const w = world(on, {}, true)
  await startTerminal($)
  await w.clock.advance(3000)
  w.board = boardOf(session({ id: 'b', state: 'needs_input', question: 'first?' }))
  await w.clock.advance(3000)
  w.board = boardOf(session({ id: 'b', state: 'needs_input', question: 'first?' }), session({ id: 'c', state: 'needs_input', question: 'second?' }))
  await w.clock.advance(3000)
  expect(w.statuses.at(-1)).toBe(`${WAITING} 2 waiting`)
})

test('a duplicate copy of the mod polls nothing, toasts nothing and pins nothing', async ($, on) => {
  const w = world(on, {}, false, true)
  w.board = boardOf(session({ id: 'old', state: 'needs_input', question: 'already waiting' }))
  await startTerminal($)
  await w.clock.advance(3000)
  w.board = boardOf(session({ id: 'new', state: 'needs_input', question: 'Run the tests?' }), session({ id: 'bad', state: 'error', title: 'Port failed' }))
  await w.clock.advance(6000)
  expect(w.fetched).toBe(0)
  expect(w.storeReads).toBe(0)
  expect(w.toasts).toEqual([])
  expect(w.statuses.filter(s => s !== undefined)).toEqual([])
})
