import { atom, read, update } from 'claude-code'
import type { EngineInterface as Api, On } from 'claude-code'
import { prefs } from './pane'
import type { PrefsIo } from './pane'
import { COLS, FRAMES, ROWS, encode } from './sprites'
import type { PetState } from './sprites'

export type PetEvent = 'prompt' | 'tool' | 'tool_done' | 'ask' | 'answer' | 'aborted' | 'error' | 'tick'

const TICK_MS = 200
const DONE_MS = 3000
const SLEEP_MS = 5 * 60 * 1000
const BAND_MIN_COLUMNS = 60

// What the pet is doing, and when the last event (anything but a tick) happened. It lives in `$.state`, not in a variable:
// a hot reload loses variables. `pet` mirrors the switch in the store (see pane.tsx); the band reads it so a press redraws it.
const moodAtom = atom({ plugin: 'agent-pets', key: 'mood' } as const, { state: 'idle', at: 0 })
const petAtom = atom({ plugin: 'agent-pets', key: 'pet' } as const, true)

const STATUS: Record<PetState, string> = {
  idle: '',
  thinking: 'thinking…',
  working: 'working…',
  waiting: 'waiting for you',
  done: 'done',
  error: 'something went wrong',
  sleeping: 'zzz',
}

/**
 * The next state. `quietMs` is how long it has been since the last event that was not a tick, and matters to a tick alone:
 * a finished turn waves for 3 s and goes idle; an idle pet falls asleep after 5 minutes. A turn that is thinking, working or
 * waiting never sleeps however quiet it is, and an error stays until the next prompt.
 */
export function step(state: PetState, ev: PetEvent, quietMs: number): PetState {
  switch (ev) {
    case 'prompt':
      return 'thinking'
    case 'tool':
      return 'working'
    case 'ask':
      return 'waiting'
    case 'answer':
      return 'done'
    case 'aborted':
      return 'idle'
    case 'error':
      return 'error'
    case 'tool_done':
      // A tool that ends (or a question that is answered) sends the turn back to the model; late news after the turn ended changes nothing.
      return state === 'working' || state === 'waiting' ? 'thinking' : state === 'sleeping' ? 'idle' : state
    case 'tick':
      if (state === 'done' && quietMs >= DONE_MS) return 'idle'
      if (state === 'idle' && quietMs >= SLEEP_MS) return 'sleeping'
      return state
  }
}

const storeOf = ($: Api): PrefsIo => ({ get: key => $.store.get(key) })

// The engine's `$` stays in this file (the validator follows it only into functions declared here).
async function feed($: Api, ev: PetEvent): Promise<void> {
  try {
    const now = await $.clock.now()
    const { state, at } = await read($, moodAtom)
    const quiet = at === 0 ? 0 : now - at
    if (ev === 'tick' && step(state, ev, quiet) === state) return
    // The step is computed from the value the write finds, so two events at once cannot undo each other.
    await update($, moodAtom, cur => {
      const quietNow = cur.at === 0 ? 0 : now - cur.at
      return { state: step(cur.state, ev, quietNow), at: ev === 'tick' ? cur.at : now }
    })
  } catch {}
}

/**
 * A pixel Clawd above the prompt that mirrors what this session is doing, on interactive terminal sessions wide enough
 * for it and while `/pets` has Pet on. It watches the prompt, tool calls, permission asks and the end of each turn.
 */
export function registerPet(on: On): void {
  let timer: { cancel: () => void } | undefined
  // The band's request id and the animation's frame: the band draws frame `frame`, the timer blits the next. Losing them on a reload costs one frame.
  let band: string | undefined
  let frame = 0

  // A matcher: the engine takes one unmatched hook per event and plugin, and report.ts has that one.
  on('session.start', { surface: 'terminal', isInteractive: true }, async ($, e, next) => {
    const r = await next(e)
    try {
      timer?.cancel()
      const now = await $.clock.now()
      await update($, moodAtom, () => ({ state: 'idle', at: now }))
      let busy = false
      timer = $.clock.every(TICK_MS, async () => {
        if (busy) return
        busy = true
        try {
          await feed($, 'tick')
          if (band === undefined) return
          const { state } = await read($, moodAtom)
          frame++
          const frames = FRAMES[state]
          const { deny } = await $.ui.blit({ requestId: band, key: 'pet', cells: encode(frames[frame % frames.length]!) })
          // Not mounted (the band is off, narrow or yielded to a survey): wait for the next draw to name it again.
          if (deny !== undefined) band = undefined
        } catch {
          // a missed frame is made up for by the next
        } finally {
          busy = false
        }
      })
    } catch {}
    return r
  })

  on('prompt.submit', async ($, e, next) => {
    const r = await next(e)
    if (r.drop === undefined) await feed($, 'prompt')
    return r
  })

  // A tool that ends, or a question that is answered, takes the turn back to the model. Subagents' tools are the main turn's business.
  on('tool.call', async ($, e, next) => {
    const own = e.agentId === undefined
    if (own) await feed($, e.tool === 'AskUserQuestion' ? 'ask' : 'tool')
    const r = await next(e)
    if (own) await feed($, 'tool_done')
    return r
  })

  // The engine's verdict `ask` is a permission prompt for the user.
  on('tool.check', async ($, e, next) => {
    const r = await next(e)
    if (r.decision === 'ask') await feed($, 'ask')
    return r
  })

  // A matcher naming every reason: see session.start above.
  on('turn.complete', { reason: ['answer', 'aborted', 'refusal', 'error'] }, async ($, e, next) => {
    const r = await next(e)
    if (e.agentId === undefined) await feed($, e.reason === 'answer' ? 'answer' : e.reason === 'aborted' ? 'aborted' : 'error')
    return r
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.surface !== 'terminal' || e.props.bodyColumns < BAND_MIN_COLUMNS || e.props.maxRows < ROWS || e.props.hasSurvey) return next(e)
    try {
      // The mirror is read for the redraw its change brings; the store is what decides.
      await read($, petAtom)
      if (!(await prefs(storeOf($))).pet) return next(e)
      const { state } = await read($, moodAtom)
      const frames = FRAMES[state]
      const cells = encode(frames[frame % frames.length]!)
      const { Box, Raster, Text } = $.ui.resolve(e)
      band = e.requestId
      return (
        <Box justifyContent="flex-end" alignItems="flex-end" gap={1}>
          {STATUS[state] !== '' && <Text dimColor>{STATUS[state]}</Text>}
          <Raster key="pet" columns={COLS} rows={ROWS} cells={cells} />
        </Box>
      )
    } catch {
      return next(e)
    }
  })
}
