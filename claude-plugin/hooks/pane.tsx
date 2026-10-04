import { atom, read, update } from 'claude-code'
import type { EngineInterface as Api, On } from 'claude-code'
import { sharedBridge } from './bridge'
import type { Bridge, BridgeIo } from './bridge'

const PANE = 'agent-pets'
const BAR_CELLS = 10
const DAY_MS = 24 * 60 * 60 * 1000

// The store holds the switches (they outlive the session); these mirror them so a press redraws the pane,
// and so the band and the nudges can read them as state. Opening the pane fills them from the store.
const petAtom = atom({ plugin: 'agent-pets', key: 'pet' } as const, true)
const nudgesAtom = atom({ plugin: 'agent-pets', key: 'nudges' } as const, true)

/** What a hook file reads the switches through; each file builds it from its own `$` (the validator will not follow `$` across an import). */
export type PrefsIo = { get(key: string): Promise<unknown> }
export type Prefs = { pet: boolean; nudges: boolean }

/** The two switches; a key that is missing or not a boolean counts as on. */
export async function prefs(io: PrefsIo): Promise<Prefs> {
  const on = async (key: string) => (await io.get(key)) !== false
  return { pet: await on('pet'), nudges: await on('nudges') }
}

type LimitRow = { label: string; percent: number; resetsAt?: number | null; stale: boolean }

const WINDOW_LABEL: Record<string, string> = { five_hour: '5h', weekly: 'week', seven_day: 'week', spend_limit: 'spend' }

// Everything the widget sends ends up in a Text, and ultimately comes from the user's sessions: one tidy line each.
// Control characters and line breaks become a space; bidi marks and zero-width characters (which could reorder
// or hide what is drawn) go. Cut by code point so a surrogate pair is never split.
const tidy = (text: unknown, max = 160): string => {
  const flat = String(text ?? '')
    .replace(/[\u200b-\u200f\u202a-\u202e\u2060\u2066-\u2069\ufeff]/g, '')
    .replace(/[\u0000-\u001f\u007f\u0080-\u009f\s]+/g, ' ')
    .trim()
  const points = Array.from(flat)
  return points.length > max ? `${points.slice(0, max - 1).join('')}\u2026` : flat
}

const clampPercent = (v: number) => Math.min(100, Math.max(0, Number.isFinite(v) ? v : 0))

/** `██████░░░░`: one cell per ten percent, rounded. */
export function bar(percent: number): string {
  const filled = Math.round(clampPercent(percent) / (100 / BAR_CELLS))
  return '█'.repeat(filled) + '░'.repeat(BAR_CELLS - filled)
}

/** Local clock time of a reset (the weekday too when it is a day or more away); the user's own zone and locale, none hard-coded. */
export function resetText(resetsAt: number, now: number): string {
  try {
    const at = new Date(resetsAt)
    const time = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' }).format(at)
    if (resetsAt - now < DAY_MS) return time
    return `${new Intl.DateTimeFormat(undefined, { weekday: 'short' }).format(at)} ${time}`
  } catch {
    return ''
  }
}

/** `5h ██████░░░░ 23% · resets 18:00` */
export function limitLine(row: LimitRow, now: number): string {
  const parts = [`${String(row.label ?? '').padEnd(5)} ${bar(row.percent)} ${Math.round(clampPercent(row.percent))}%`]
  const reset = typeof row.resetsAt === 'number' ? resetText(row.resetsAt, now) : ''
  if (reset) parts.push(`resets ${reset}`)
  if (row.stale) parts.push('stale')
  return parts.join(' · ')
}

type SessionRow = { agent: string; state: string; title: string; question: string }
type BoardView = { sessions: SessionRow[]; limits: (LimitRow & { agent: string })[] }

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null

/**
 * The widget's board as rows that are safe to draw: arrays that are not arrays become empty, entries that are not
 * objects are skipped, every string is tidied (agents are grouped by their tidied name) and a percentage that is not a number is 0.
 */
export function viewOf(board: unknown): BoardView | null {
  if (!isObject(board)) return null
  const view: BoardView = { sessions: [], limits: [] }
  for (const raw of Array.isArray(board.sessions) ? board.sessions : []) {
    if (!isObject(raw)) continue
    view.sessions.push({ agent: tidy(raw.agent, 40), state: tidy(raw.state, 24), title: tidy(raw.title, 80), question: tidy(raw.question) })
  }
  for (const raw of Array.isArray(board.limits) ? board.limits : []) {
    if (!isObject(raw)) continue
    const window = tidy(raw.window, 12)
    const percent = typeof raw.used_pct === 'number' && Number.isFinite(raw.used_pct) ? raw.used_pct : 0
    view.limits.push({
      agent: tidy(raw.agent, 40),
      label: WINDOW_LABEL[window] ?? window,
      percent,
      resetsAt: typeof raw.resets_at === 'number' ? raw.resets_at : null,
      stale: typeof raw.stale_since === 'number',
    })
  }
  return view
}

// The agents in the order the board names them: sessions first, then agents that only have limits.
const agentsOf = (view: BoardView): string[] => [...new Set([...view.sessions.map(s => s.agent), ...view.limits.map(l => l.agent)])]

// This session's own windows, from the engine; what the pane can still show without the widget.
async function sessionLimits($: Api): Promise<LimitRow[]> {
  try {
    const { rateLimits } = await $.session.usage()
    return rateLimits.map(l => {
      const at = l.resetsAt ? Date.parse(l.resetsAt) : NaN
      return { label: WINDOW_LABEL[l.kind] ?? tidy(l.kind, 12), percent: l.percentUsed, resetsAt: Number.isFinite(at) ? at : null, stale: false }
    })
  } catch {
    return []
  }
}

// Mirrors report.ts's `ioOf`: the two must stay in step. The engine's `$` as the bridge's io. The validator follows `$` only into functions declared in this file,
// and `$.env.get` takes a literal name: both are why this lives here and not in bridge.ts (report.ts has its own).
function ioOf($: Api): BridgeIo {
  return {
    pluginRoot: $.plugin.root,
    home: async () => (await $.env.get('USERPROFILE')) || (await $.env.get('HOME')),
    read: path => $.fs.read(path),
    exists: path => $.fs.exists(path),
    now: () => $.clock.now(),
    fetch: (url, init) => $.http.fetch(url, init),
  }
}

const storeOf = ($: Api): PrefsIo => ({ get: key => $.store.get(key) })

async function toggle($: Api, key: 'pet' | 'nudges'): Promise<void> {
  try {
    const next = !(await prefs(storeOf($)))[key]
    await $.store.set(key, next)
    // Written out: the validator reads the source of `update` only when it is spelled there.
    if (key === 'pet') await update($, petAtom, () => next)
    else await update($, nudgesAtom, () => next)
  } catch {}
}

/**
 * `/pets` (terminal, interactive sessions): a pane with the widget's sessions and limits and two switches.
 * Without the widget it shows this session's own limits and says so. Reads through `bridge`, or the shared one.
 */
export function registerPane(on: On, bridge?: Bridge): void {
  // A matcher: the engine takes one unmatched hook per event and plugin, and report.ts has that one.
  on('session.start', { surface: 'terminal', isInteractive: true }, async ($, e, next) => {
    const r = await next(e)
    try {
      await $.command.register({ name: 'pets', description: 'Agent Pets: sessions and limits' })
    } catch {}
    return r
  })

  on('command.run', { command: 'pets' }, async $ => {
    try {
      // The mirrors may have gone stale since the last press (a restart resets them): line them up with the store.
      const p = await prefs(storeOf($))
      await update($, petAtom, () => p.pet)
      await update($, nudgesAtom, () => p.nudges)
      await $.ui.open({ id: PANE, title: 'Agent Pets', focus: true, closeOnEscape: true })
    } catch {}
    return {}
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Button, Text } = $.ui.resolve(e)
    // A pane that cannot gather its data still draws: switches default to on, no board means the widget-not-running view.
    try {
      // Reading the mirrors while drawing is what redraws the pane when a switch is pressed.
      await read($, petAtom)
      await read($, nudgesAtom)
    } catch {}
    let pet = true
    let nudges = true
    try {
      ;({ pet, nudges } = await prefs(storeOf($)))
    } catch {}
    let now = Date.now()
    let view: BoardView | null = null
    try {
      now = await $.clock.now()
      view = viewOf(await (bridge ?? sharedBridge(ioOf($))).state())
    } catch {
      view = null
    }
    const own = view ? [] : await sessionLimits($)

    const switches = (
      <Box gap={1}>
        <Button key="pet" label={`Pet: ${pet ? 'on' : 'off'}`} onPress={() => toggle($, 'pet')} />
        <Button key="nudges" label={`Nudges: ${nudges ? 'on' : 'off'}`} onPress={() => toggle($, 'nudges')} />
      </Box>
    )

    if (!view) {
      return (
        <Box flexDirection="column">
          <Text dimColor>Agent Pets widget not running</Text>
          {own.length > 0 && <Text bold>This session</Text>}
          {own.map(row => (
            <Text>{limitLine(row, now)}</Text>
          ))}
          {switches}
        </Box>
      )
    }

    const board = view
    const agents = agentsOf(board)
    return (
      <Box flexDirection="column">
        <Text bold>Sessions</Text>
        {board.sessions.length === 0 && <Text dimColor>No sessions</Text>}
        {agents.map(agent => {
          const sessions = board.sessions.filter(s => s.agent === agent)
          if (sessions.length === 0) return null
          return (
            <Box flexDirection="column">
              <Text bold>{agent}</Text>
              {sessions.map(s => (
                <Box flexDirection="column">
                  <Text>
                    {'  '}
                    {s.state.replace(/_/g, ' ')} {s.title}
                  </Text>
                  {s.state === 'needs_input' && s.question !== '' && <Text dimColor>{`    ? ${s.question}`}</Text>}
                </Box>
              ))}
            </Box>
          )
        })}
        <Text bold>Limits</Text>
        {board.limits.length === 0 && <Text dimColor>No limits reported yet</Text>}
        {agents.map(agent => {
          const rows = board.limits.filter(l => l.agent === agent)
          if (rows.length === 0) return null
          return (
            <Box flexDirection="column">
              <Text bold>{agent}</Text>
              {rows.map(row => (
                <Text>{`  ${limitLine(row, now)}`}</Text>
              ))}
            </Box>
          )
        })}
        {switches}
      </Box>
    )
  })
}
