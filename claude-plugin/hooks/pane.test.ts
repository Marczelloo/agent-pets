import { test, expect, mock } from 'claude-code/testing'
import type { On } from 'claude-code'
import { bar, limitLine, prefsLine, resetText, viewOf } from './pane'
import type { Board } from './bridge'

const PANE = {
  title: 'Agent Pets',
  isFocused: true,
  bodyColumns: 80,
  placement: 'inline',
  scroll: { offset: 0, bodyRows: 20 },
  view: {},
} as const

const NOW = 1_800_000_000_000
const RESET = NOW + 3 * 60 * 60 * 1000
const FULL = '\u2588'
const EMPTY = '\u2591'
const DOT = '\u00b7'

const board: Board = {
  v: 1,
  app_version: '0.16.0',
  prefs: { pet: true, nudges: true },
  sessions: [
    { id: 'a', agent: 'claude', state: 'working', title: 'Fix the build', cwd: 'C:/w', since: NOW },
    { id: 'b', agent: 'codex', state: 'needs_input', title: 'Port the parser', question: 'Overwrite lib.rs?', cwd: 'C:/w', since: NOW },
    { id: 'c', agent: 'codex', state: 'working', title: 'Write tests', question: 'not shown while working', cwd: 'C:/w', since: NOW },
  ],
  limits: [
    { agent: 'claude', window: 'five_hour', used_pct: 23, resets_at: RESET },
    { agent: 'claude', window: 'weekly', used_pct: 61, resets_at: null },
  ],
}

// Everything beneath the plugin: the clock, the endpoint file and the widget's answer (a board, or nothing).
function world(on: On, answer: unknown, fails: { usage?: true; duplicate?: true } = {}) {
  mock.clock(on, { now: NOW })
  mock.env(on, { USERPROFILE: 'C:\\Users\\tester' })
  on('fs.exists', ($$, e) => ({ value: fails.duplicate === true && e.path.split(String.fromCharCode(92)).join('/') === 'C:/Users/tester/.claude/skills/agent-pets/.claude-plugin/plugin.json' }))
  on('fs.read', ($$, e) => {
    const path = e.path.split('\\').join('/')
    if (path === 'C:/Users/tester/.agent-pets/endpoint.json') return { value: JSON.stringify({ port: 4711, token: 'tok' }) }
    return { deny: 'ENOENT' }
  })
  on('http.fetch', () => {
    if (answer === 'down') return { deny: 'ECONNREFUSED' }
    return { value: { status: 200, ok: true, headers: {}, text: JSON.stringify(answer) } }
  })
  on('session.usage', () =>
    fails.usage
      ? { deny: 'EIO' }
      : { value: { startedAt: 0, context: {}, rateLimits: [{ kind: 'five_hour', percentUsed: 41.5, resetsAt: new Date(RESET).toISOString() }] } },
  )
}

const timeOf = (ms: number) => new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' }).format(new Date(ms))

test('the pane lists sessions by agent, with the question of one that needs input', async ($, on) => {
  world(on, board)
  const ui = await $.ui.mount({ plugin: 'agent-pets', surface: 'terminal', component: 'Pane', requestId: 'agent-pets', props: PANE })
  expect(await ui.find({ type: 'Text', text: /Port the parser/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /needs input/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /Overwrite lib\.rs\?/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /Fix the build/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /not shown while working/ })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: /widget not running/ })).toBeUndefined()
  await ui.unmount()
})

test('the pane draws each limit as a bar with its percentage and reset time', async ($, on) => {
  world(on, board)
  const ui = await $.ui.mount({ plugin: 'agent-pets', surface: 'terminal', component: 'Pane', requestId: 'agent-pets', props: PANE })
  const five = await ui.find({ type: 'Text', text: /5h/ })
  expect(five?.text).toContain('23%')
  expect(five?.text).toContain(bar(23))
  expect(five?.text).toContain(`resets ${timeOf(RESET)}`)
  const week = await ui.find({ type: 'Text', text: /week/ })
  expect(week?.text).toContain('61%')
  expect(week?.text).not.toContain('resets')
  await ui.unmount()
})

test('without the widget the pane says so and shows this session own limits', async ($, on) => {
  world(on, 'down')
  const ui = await $.ui.mount({ plugin: 'agent-pets', surface: 'terminal', component: 'Pane', requestId: 'agent-pets', props: PANE })
  expect(await ui.find({ type: 'Text', text: /Agent Pets widget not running/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /Port the parser/ })).toBeUndefined()
  const own = await ui.find({ type: 'Text', text: /5h/ })
  expect(own?.text).toContain('42%')
  expect(own?.text).toContain(`resets ${timeOf(RESET)}`)
  await ui.unmount()
})

test('the pane tells the two switches from the board and where to change them', async ($, on) => {
  world(on, board)
  const ui = await $.ui.mount({ plugin: 'agent-pets', surface: 'terminal', component: 'Pane', requestId: 'agent-pets', props: PANE })
  const line = await ui.find({ type: 'Text', text: /Pet: / })
  expect(line?.text).toBe('Pet: on · Nudges: on — change in Agent Pets → Settings → Apps')
  expect(await ui.find({ type: 'Button' })).toBeUndefined()
  await ui.unmount()
})

test('the switches the app sends are the ones the pane shows', async ($, on) => {
  world(on, { ...board, prefs: { pet: false, nudges: true } })
  const ui = await $.ui.mount({ plugin: 'agent-pets', surface: 'terminal', component: 'Pane', requestId: 'agent-pets', props: PANE })
  expect((await ui.find({ type: 'Text', text: /Pet: / }))?.text).toContain('Pet: off · Nudges: on')
  await ui.unmount()
})

test('a board from an older app without prefs shows the defaults', async ($, on) => {
  world(on, { v: 1, app_version: '0.16.0', sessions: [], limits: [] })
  const ui = await $.ui.mount({ plugin: 'agent-pets', surface: 'terminal', component: 'Pane', requestId: 'agent-pets', props: PANE })
  expect((await ui.find({ type: 'Text', text: /Pet: / }))?.text).toContain('Pet: off · Nudges: on')
  await ui.unmount()
})

test('/pets opens the pane on a terminal session and registers the command', async ($, on) => {
  world(on, board)
  const registered: string[] = []
  const opened: unknown[] = []
  on('session.start', ($$, e) => ({ cwd: e.cwd }))
  on('command.register', ($$, e) => {
    registered.push(e.name)
    return { value: { command: e.name } }
  })
  on('ui.open', ($$, e) => {
    opened.push(e)
    return { value: { isPlaced: true } }
  })
  await $.session.start({ cwd: 'C:/w', surface: 'terminal', isInteractive: true })
  await $.session.start({ cwd: 'C:/w', surface: null, isInteractive: false })
  expect(registered).toEqual(['pets'])
  const out = await $.command.run({ command: 'pets', args: '', origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 80 } } as never)
  expect(out.text ?? '').toBe('')
  expect(opened).toEqual([{ id: 'agent-pets', title: 'Agent Pets', focus: true, closeOnEscape: true }])
})

test('prefsLine spells each switch on or off', () => {
  expect(prefsLine({ pet: true, nudges: false })).toMatch(/^Pet: on · Nudges: off /)
  expect(prefsLine({ pet: false, nudges: true })).toMatch(/^Pet: off · Nudges: on /)
})

test('bar and limitLine format a percentage, clamped', () => {
  expect(bar(0)).toBe(EMPTY.repeat(10))
  expect(bar(23)).toBe(FULL.repeat(2) + EMPTY.repeat(8))
  expect(bar(100)).toBe(FULL.repeat(10))
  expect(bar(250)).toBe(bar(100))
  expect(bar(-5)).toBe(bar(0))
  expect(limitLine({ label: '5h', percent: 23.4, resetsAt: RESET, stale: false }, NOW)).toBe(`5h    ${bar(23.4)} 23% ${DOT} resets ${timeOf(RESET)}`)
  expect(limitLine({ label: 'week', percent: 61, resetsAt: null, stale: true }, NOW)).toBe(`week  ${bar(61)} 61% ${DOT} stale`)
})

test('a reset a day or more away names the weekday too', () => {
  const far = NOW + 3 * 24 * 60 * 60 * 1000
  const weekday = new Intl.DateTimeFormat(undefined, { weekday: 'short' }).format(new Date(far))
  expect(resetText(far, NOW)).toBe(`${weekday} ${timeOf(far)}`)
  expect(resetText(RESET, NOW)).toBe(timeOf(RESET))
})

const mountPane = ($: Parameters<Parameters<typeof test>[1]>[0]) =>
  $.ui.mount({ plugin: 'agent-pets', surface: 'terminal', component: 'Pane', requestId: 'agent-pets', props: PANE })

test('hostile text from the widget is drawn without escapes, line breaks or bidi marks', async ($, on) => {
  const ESC = String.fromCharCode(27)
  const RLO = String.fromCharCode(0x202e)
  const hostile = {
    v: 1,
    app_version: '0.16.0',
    sessions: [
      {
        id: 'x',
        agent: `co${ESC}[31mdex${RLO}`,
        state: 'needs_input',
        title: `Port${ESC}[31m\nthe${RLO} parser`,
        question: `Overwrite${ESC}[2J\nlib.rs${RLO}?`,
        cwd: 'C:/w',
        since: 1,
      },
    ],
    limits: [{ agent: `co${ESC}[31mdex${RLO}`, window: `five${ESC}hour`, used_pct: 10 }],
  }
  world(on, hostile)
  const ui = await mountPane($)
  const drawn = JSON.stringify(await ui.drawn())
  expect(drawn).not.toContain(ESC)
  expect(drawn).not.toContain('\u001b')
  expect(drawn).not.toContain(RLO)
  expect(drawn).not.toContain('\n')
  expect(await ui.find({ type: 'Text', text: /Port \[31m the parser/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /Overwrite \[2J lib\.rs\?/ })).toBeDefined()
  // one agent heading in each section: the two spellings tidy to the same name
  expect((await ui.findAll({ type: 'Text', text: /^co \[31mdex$/ })).length).toBe(2)
  await ui.unmount()
})

test('a long title is cut, never in the middle of a surrogate pair', async ($, on) => {
  const long = { ...board, sessions: [{ ...board.sessions[0]!, title: 'x'.repeat(300) }] }
  world(on, long)
  const ui = await mountPane($)
  const row = await ui.find({ type: 'Text', text: /xxxx/ })
  expect(row?.text).not.toContain('x'.repeat(100))
  expect(row?.text).toContain('\u2026')
  await ui.unmount()
  const view = viewOf({ sessions: [{ agent: 'a', state: 's', title: 'a'.repeat(78) + '\u{1F600}\u{1F600}\u{1F600}' }], limits: [] })
  const title = view!.sessions[0]!.title
  expect(title.endsWith('\u2026')).toBe(true)
  expect(Array.from(title).every(ch => ch.length === 2 || !/[\ud800-\udfff]/.test(ch))).toBe(true)
})

test('widget down and session.usage failing: the not-running line still shows', async ($, on) => {
  world(on, 'down', { usage: true })
  const ui = await mountPane($)
  expect(await ui.find({ type: 'Text', text: /Agent Pets widget not running/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /Pet: / })).toBeUndefined()
  await ui.unmount()
})

test('a board without sessions or limits arrays draws', async ($, on) => {
  world(on, { v: 1, app_version: '0.16.0' })
  const ui = await mountPane($)
  expect(await ui.find({ type: 'Text', text: /No sessions/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /No limits reported yet/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /widget not running/ })).toBeUndefined()
  await ui.unmount()
})

test('a limit with an unknown window and a NaN percentage draws, entries that are no objects are skipped', async ($, on) => {
  world(on, {
    v: 1,
    app_version: '0.16.0',
    sessions: [null, 7, 'text'],
    limits: [{ agent: 'codex', window: 'mystery', used_pct: null }, { agent: 'codex', used_pct: 'NaN' }, null],
  })
  const ui = await mountPane($)
  const rows = await ui.findAll({ type: 'Text', text: /0%/ })
  expect(rows.length).toBe(2)
  expect(rows[0]?.text).toContain('mystery')
  expect(await ui.find({ type: 'Text', text: /No sessions/ })).toBeDefined()
  await ui.unmount()
})

test('a duplicate copy registers no /pets, draws no pane and does not open one', async ($, on) => {
  world(on, board, { duplicate: true })
  const registered: string[] = []
  const opened: unknown[] = []
  on('session.start', ($$, e) => ({ cwd: e.cwd }))
  on('command.run', () => ({ text: 'core' }))
  on('ui.render', () => ({ type: 'Box', props: { key: 'core' }, children: [] }) as never)
  on('command.register', ($$, e) => {
    registered.push(e.name)
    return { value: { command: e.name } }
  })
  on('ui.open', ($$, e) => {
    opened.push(e)
    return { value: { isPlaced: true } }
  })
  await $.session.start({ cwd: 'C:/w', surface: 'terminal', isInteractive: true })
  expect(registered).toEqual([])
  const out = await $.command.run({ command: 'pets', args: '', origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 80 } } as never)
  expect(out.text).toBe('core')
  expect(opened).toEqual([])
  const ui = await mountPane($)
  expect(await ui.find({ type: 'Text', text: /Pet: / })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: /Sessions|widget not running/ })).toBeUndefined()
  await ui.unmount()
})
