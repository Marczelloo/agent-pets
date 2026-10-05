import { atom, read, update } from 'claude-code'
import type { EngineInterface as Api, On } from 'claude-code'
import { sharedBridge } from './bridge'
import type { Bridge, BridgeIo, Board } from './bridge'
import { tidy } from './pane'

// Mirrors the app's switch from the board, like the pet's in pet.tsx.
const nudgesAtom = atom({ plugin: 'agent-pets', key: 'nudges' } as const, true)

const POLL_MS = 3000
const QUESTION_MAX = 80

type Nudges = { toasts: string[]; seen: Set<string>; waiting: number }

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null

// `codex` -> `Codex`; by code point, an agent name is whatever another program called itself.
const capitalised = (agent: string): string => {
  const [first = 'A', ...rest] = Array.from(agent || 'agent')
  return first.toUpperCase() + rest.join('')
}

/**
 * What changed on the widget's board since `prev`: a toast for each session of another agent that now waits for the user
 * or has failed, unless `prev` already holds its key (id, state and question). `seen` is every such key on this board,
 * so a session that moves on forgets its key and toasts again when it asks anew. `self` and its children (`self/...`) are left out.
 * Board strings come from other programs: they are tidied before they reach a toast.
 */
export function diff(prev: Set<string>, board: Board, self: string): Nudges {
  const out: Nudges = { toasts: [], seen: new Set(), waiting: 0 }
  for (const raw of isObject(board) && Array.isArray(board.sessions) ? board.sessions : []) {
    if (!isObject(raw)) continue
    const id = String(raw.id ?? '')
    if (id === self || id.startsWith(`${self}/`)) continue
    if (raw.state !== 'needs_input' && raw.state !== 'error') continue
    const key = `${id}|${raw.state}|${raw.question ?? ''}`
    if (raw.state === 'needs_input') out.waiting++
    out.seen.add(key)
    if (prev.has(key)) continue
    const agent = capitalised(tidy(raw.agent, 40))
    if (raw.state === 'needs_input') {
      // A question can be missing; the title still says what is waiting.
      out.toasts.push(`${agent} waits: ${tidy(raw.question, QUESTION_MAX) || tidy(raw.title, QUESTION_MAX)}`)
    } else {
      out.toasts.push(`${agent} hit an error: ${tidy(raw.title, QUESTION_MAX)}`)
    }
  }
  return out
}

// Mirrors report.ts's `ioOf`: the two must stay in step. The engine's `$` as the bridge's io. The validator follows `$` only into functions declared in this file,
// and `$.env.get` takes a literal name: both are why this lives here and not in bridge.ts (report.ts and pane.tsx have their own).
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

/**
 * Toasts when another agent's session needs the user or fails, and pins `⏳ N waiting` under the prompt, while a person is at the prompt.
 * Polls the widget's board every 3 s, through `bridge` or the shared one. The first look only learns what already waits, so Claude
 * starting beside a waiting session does not burst. Nothing here throws into the session.
 */
export function registerNudges(on: On, bridge?: Bridge): void {
  let timer: { cancel: () => void } | undefined

  // A matcher: the engine takes one unmatched hook per event and plugin, and report.ts has that one.
  on('session.start', { surface: 'terminal', isInteractive: true }, async ($, e, next) => {
    const r = await next(e)
    try {
      timer?.cancel()
      const door = bridge ?? sharedBridge(ioOf($))
      // null until the first look: that look seeds, it does not toast.
      let seen: Set<string> | null = null
      let shown: string | undefined
      let busy = false

      const pin = async (text: string | undefined) => {
        if (text === shown) return
        shown = text
        await $.ui.status(text)
      }

      const tick = async () => {
        if (busy) return
        busy = true
        try {
          if (await door.isDuplicateCopy()) {
            // The app's own copy nudges: this one says nothing, and seeds again if it ever takes over.
            seen = null
            await pin(undefined)
            return
          }
          const { nudges } = await door.prefs()
          if (nudges !== (await read($, nudgesAtom))) await update($, nudgesAtom, () => nudges)
          if (!nudges) {
            // Off: forget what was seen, so turning it back on seeds again instead of bursting.
            seen = null
            await pin(undefined)
            return
          }
          const board = await door.state()
          if (!board) {
            await pin(undefined)
            return
          }
          // The board just read carries the latest switch: a nudge turned off in the app is not toasted once more.
          if (!(await door.prefs()).nudges) {
            seen = null
            await pin(undefined)
            return
          }
          const out = diff(seen ?? new Set(), board, await $.session.id())
          const first = seen === null
          seen = out.seen
          await pin(out.waiting > 0 ? `⏳ ${out.waiting} waiting` : undefined)
          if (first) return
          for (const text of out.toasts) {
            try {
              await $.ui.toast(text)
            } catch {}
          }
        } catch {
          // a missed look is made up for by the next
        } finally {
          busy = false
        }
      }

      timer = $.clock.every(POLL_MS, tick)
    } catch {}
    return r
  })
}
