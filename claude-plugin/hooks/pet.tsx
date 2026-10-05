import { atom, read, update } from 'claude-code'
import type { EngineInterface as Api, On } from 'claude-code'
import { sharedBridge } from './bridge'
import type { Bridge, BridgeIo } from './bridge'
import { COLS, FRAMES, ROWS, encode } from './sprites'
import type { PetState } from './sprites'

export type PetEvent = 'prompt' | 'tool' | 'tool_done' | 'ask' | 'answer' | 'aborted' | 'error' | 'tick'

const TICK_MS = 200
const DONE_MS = 3000
const SLEEP_MS = 5 * 60 * 1000
const BAND_MIN_COLUMNS = 60

// What the pet is doing, and when the last event (anything but a tick) happened. It lives in `$.state`, not in a variable:
// a hot reload loses variables. `pet` mirrors the app's switch from the board; the band reads it, so a change made in the app redraws it.
const moodAtom = atom({ plugin: 'agent-pets', key: 'mood' } as const, { state: 'idle', at: 0 })
const petAtom = atom({ plugin: 'agent-pets', key: 'pet' } as const, false)

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

// Mirrors report.ts's `ioOf`: the two must stay in step. The engine's `$` as the bridge's io. The validator follows `$` only into functions declared in this file,
// and `$.env.get` takes a literal name: both are why this lives here and not in bridge.ts (report.ts, pane.tsx and nudge.ts have their own).
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

// The app's own copy has the pet: a second copy of the mod draws nothing (cached for a minute, never throws).
function isDuplicate($: Api, bridge?: Bridge): Promise<boolean> {
  return (bridge ?? sharedBridge(ioOf($))).isDuplicateCopy()
}

// The engine's `$` stays in this file (the validator follows it only into functions declared here).
// `ev` may be a function, asked when the write happens: what a call's end means depends on the calls still running then.
async function feed($: Api, event: PetEvent | (() => PetEvent)): Promise<void> {
  try {
    const ev = typeof event === 'function' ? event() : event
    const now = await $.clock.now()
    const { state, at } = await read($, moodAtom)
    const quiet = at === 0 ? 0 : now - at
    if (ev === 'tick' && step(state, ev, quiet) === state) return
    // The step is computed from the value the write finds, so two events at once cannot undo each other.
    await update($, moodAtom, cur => {
      const at = typeof event === 'function' ? event() : ev
      const quietNow = cur.at === 0 ? 0 : now - cur.at
      return { state: step(cur.state, at, quietNow), at: at === 'tick' ? cur.at : now }
    })
  } catch {}
}

/**
 * A pixel Clawd above the prompt that mirrors what this session is doing, on interactive terminal sessions wide enough
 * for it and while the app's Settings → Apps has the terminal pet on. It watches the prompt, tool calls, permission asks and the end of each turn.
 */
export function registerPet(on: On, bridge?: Bridge): void {
  let timer: { cancel: () => void } | undefined
  // The band's request id and the animation's frame: the band draws frame `frame`, the timer blits the next. Losing them on a reload costs one frame.
  let band: string | undefined
  let frame = 0
  // This session's tool calls under way: with tools in parallel the turn goes back to the model only when the last one ends.
  let running = 0

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
          if (await isDuplicate($, bridge)) return
          // The switch is the app's: a change made while this session runs lands here (cached 30 s) and redraws the band.
          // Before the band check: a band that is not drawn yet is how a pet that was off gets drawn.
          const { pet } = await (bridge ?? sharedBridge(ioOf($))).prefs()
          if (pet !== (await read($, petAtom))) await update($, petAtom, () => pet)
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
    if (r.drop === undefined) {
      running = 0
      await feed($, 'prompt')
    }
    return r
  })

  // A tool that ends, or a question that is answered, takes the turn back to the model. Subagents' tools are the main turn's business.
  on('tool.call', async ($, e, next) => {
    const own = e.agentId === undefined
    if (!own) return next(e)
    running++
    // The pet never holds a tool call up: the write starts now and is not waited for. `feed` swallows its own errors.
    const started = feed($, e.tool === 'AskUserQuestion' ? 'ask' : 'tool').catch(() => {})
    try {
      return await next(e)
    } finally {
      running = Math.max(0, running - 1)
      // After the start's write, so a call that ends at once cannot be undone by its own beginning; not waited for either.
      // Another call still running keeps the pet at work (and takes it off `waiting` once this call's question is settled).
      void started.then(() => feed($, () => (running > 0 ? 'tool' : 'tool_done'))).catch(() => {})
    }
  })

  // The engine's verdict `ask` on a real call is a permission prompt for the user; a call without `tool_use_id` is a plugin's query.
  on('tool.check', async ($, e, next) => {
    const r = await next(e)
    if (r.decision === 'ask' && e.tool_use_id !== undefined) await feed($, 'ask')
    return r
  })

  // A matcher naming every reason: see session.start above.
  on('turn.complete', { reason: ['answer', 'aborted', 'refusal', 'error'] }, async ($, e, next) => {
    const r = await next(e)
    if (e.agentId === undefined) running = 0
    if (e.agentId === undefined) await feed($, e.reason === 'answer' ? 'answer' : e.reason === 'aborted' ? 'aborted' : 'error')
    return r
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (await isDuplicate($, bridge)) return next(e)
    if (e.surface !== 'terminal' || e.props.bodyColumns < BAND_MIN_COLUMNS || e.props.maxRows < ROWS || e.props.hasSurvey) return next(e)
    try {
      // The mirror is read for the redraw its change brings; the board's switch is what decides.
      await read($, petAtom)
      if (!(await (bridge ?? sharedBridge(ioOf($))).prefs()).pet) return next(e)
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
