import { atom, read, update } from 'claude-code'
import type { EngineInterface as Api, On } from 'claude-code'
import { sharedBridge } from './bridge'
import type { Board, Bridge, BridgeIo } from './bridge'

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

// Titles and questions come from the widget and ultimately from the user's sessions: one tidy line each.
const tidy = (text: unknown, max = 160): string => {
  const flat = String(text ?? '').replace(/[\u0000-\u001f\u007f\u0080-\u009f\s]+/g, ' ').trim()
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat
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
  const parts = [`${row.label.padEnd(5)} ${bar(row.percent)} ${Math.round(clampPercent(row.percent))}%`]
  const reset = typeof row.resetsAt === 'number' ? resetText(row.resetsAt, now) : ''
  if (reset) parts.push(`resets ${reset}`)
  if (row.stale) parts.push('stale')
  return parts.join(' · ')
}

// The agents in the order the board names them: sessions first, then agents that only have limits.
function agentsOf(board: Board): string[] {
  const names = new Set<string>()
  for (const s of board.sessions) names.add(s.agent)
  for (const l of board.limits) names.add(l.agent)
  return [...names]
}

const boardRows = (board: Board, agent: string): LimitRow[] =>
  board.limits
    .filter(l => l.agent === agent)
    .map(l => ({ label: WINDOW_LABEL[l.window] ?? l.window, percent: l.used_pct, resetsAt: l.resets_at, stale: typeof l.stale_since === 'number' }))

// This session's own windows, from the engine; what the pane can still show without the widget.
async function sessionLimits($: Api): Promise<LimitRow[]> {
  try {
    const { rateLimits } = await $.session.usage()
    return rateLimits.map(l => {
      const at = l.resetsAt ? Date.parse(l.resetsAt) : NaN
      return { label: WINDOW_LABEL[l.kind] ?? l.kind, percent: l.percentUsed, resetsAt: Number.isFinite(at) ? at : null, stale: false }
    })
  } catch {
    return []
  }
}

// The engine's `$` as the bridge's io. The validator follows `$` only into functions declared in this file,
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
    // Reading the mirrors while drawing is what redraws the pane when a switch is pressed.
    await read($, petAtom)
    await read($, nudgesAtom)
    const { pet, nudges } = await prefs(storeOf($))
    const now = await $.clock.now()
    const board = await (bridge ?? sharedBridge(ioOf($))).state()
    const own = board ? [] : await sessionLimits($)

    const switches = (
      <Box gap={1}>
        <Button key="pet" label={`Pet: ${pet ? 'on' : 'off'}`} onPress={() => toggle($, 'pet')} />
        <Button key="nudges" label={`Nudges: ${nudges ? 'on' : 'off'}`} onPress={() => toggle($, 'nudges')} />
      </Box>
    )

    if (!board) {
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
                    {tidy(s.state, 24).replace(/_/g, ' ')} {tidy(s.title, 80)}
                  </Text>
                  {s.state === 'needs_input' && s.question && <Text dimColor>{`    ? ${tidy(s.question)}`}</Text>}
                </Box>
              ))}
            </Box>
          )
        })}
        <Text bold>Limits</Text>
        {board.limits.length === 0 && <Text dimColor>No limits reported yet</Text>}
        {agents.map(agent => {
          const rows = boardRows(board, agent)
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
