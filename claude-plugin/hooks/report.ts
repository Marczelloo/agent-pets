import type { EngineInterface as Api, On } from 'claude-code'
import { createBridge } from './bridge'
import type { Bridge, BridgeIo } from './bridge'

export type ModPayload = {
  v: 1
  kind: 'start' | 'measure' | 'turn_end' | 'end'
  session_id: string
  ts: number
  cwd?: string
  model?: string
  context?: { tokens?: number; window?: number; percent?: number }
  rate_limits?: { kind: string; percent_used: number; resets_at?: string }[]
  cost_usd?: number
  reason?: string
}

type Rec = Record<string, unknown>
const rec = (v: unknown): Rec => (typeof v === 'object' && v !== null ? (v as Rec) : {})
const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined)
// Token counts are u64 on the Rust side; a fraction or a negative would get the whole payload refused.
const count = (v: unknown): number | undefined => (Number.isInteger(v) && (v as number) >= 0 ? (v as number) : undefined)
const str = (v: unknown): string | undefined => (typeof v === 'string' && v !== '' ? v : undefined)

/** A hook's input as the widget's payload. Fields the input lacks stay absent (never 0); `model` is added by the hook. */
export function toPayload(kind: ModPayload['kind'], sessionId: string, ts: number, e: unknown): ModPayload {
  const input = rec(e)
  const p: ModPayload = { v: 1, kind, session_id: sessionId, ts }
  if (kind === 'start') {
    const cwd = str(input.cwd)
    if (cwd) p.cwd = cwd
  } else if (kind === 'turn_end') {
    const reason = str(input.reason)
    if (reason) p.reason = reason
  } else if (kind === 'measure') {
    const c = rec(input.context)
    const context = { tokens: count(c.tokens), window: count(c.window), percent: num(c.percent) }
    if (Object.values(context).some(v => v !== undefined)) {
      p.context = {}
      if (context.tokens !== undefined) p.context.tokens = context.tokens
      if (context.window !== undefined) p.context.window = context.window
      if (context.percent !== undefined) p.context.percent = context.percent
    }
    const limits: NonNullable<ModPayload['rate_limits']> = []
    for (const raw of Array.isArray(input.rateLimits) ? input.rateLimits : []) {
      const l = rec(raw)
      const limitKind = str(l.kind)
      const percentUsed = num(l.percentUsed)
      if (!limitKind || percentUsed === undefined) continue
      const entry: NonNullable<ModPayload['rate_limits']>[number] = { kind: limitKind, percent_used: percentUsed }
      const resetsAt = str(l.resetsAt)
      if (resetsAt) entry.resets_at = resetsAt
      limits.push(entry)
    }
    if (limits.length > 0) p.rate_limits = limits
    const usd = num(rec(input.cost).usd)
    if (usd !== undefined) p.cost_usd = usd
  }
  return p
}

// The session's model, when the engine can say; a payload goes without it rather than not at all.
async function modelOf($: Api): Promise<string | undefined> {
  try {
    return str(await $.session.model())
  } catch {
    return undefined
  }
}

// The engine's `$` as the bridge's io. The validator follows `$` only into functions declared in this file,
// and `$.env.get` takes a literal name: both are why this lives here and not in bridge.ts.
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

type Holder = { bridge?: Bridge }

async function report($: Api, holder: Holder, kind: ModPayload['kind'], e: unknown, withModel: boolean, sessionId?: string) {
  const payload = toPayload(kind, sessionId ?? (await $.session.id()), await $.clock.now(), e)
  if (withModel) {
    const model = await modelOf($)
    if (model) payload.model = model
  }
  ;(holder.bridge ??= createBridge(ioOf($))).send(payload)
}

/**
 * Reports the session's start, every measure (limits, context, cost), each turn's end and the session's end.
 * Each hook lets the engine finish first and never fails or delays the session on the widget's account.
 * Reports through `bridge`, or through one made from the first hook's `$` (`register` gets no `$`).
 * `model` rides on `start` and on every `measure`: a start can reach the app before it knows the session.
 */
export function registerReport(on: On, bridge?: Bridge): void {
  const holder: Holder = { bridge }
  on('session.start', async ($, e, next) => {
    const r = await next(e)
    try {
      await report($, holder, 'start', e, true)
    } catch {}
    return r
  })

  on('session.measure', async ($, e, next) => {
    const r = await next(e)
    try {
      await report($, holder, 'measure', e, true)
    } catch {}
    return r
  })

  on('turn.complete', async ($, e, next) => {
    const r = await next(e)
    try {
      await report($, holder, 'turn_end', e, false)
    } catch {}
    return r
  })

  // After a /clear the process goes on under a new id: the event names the session that ended.
  on('session.end', async ($, e, next) => {
    const r = await next(e)
    try {
      await report($, holder, 'end', e, false, e.sessionId)
    } catch {}
    return r
  })
}
