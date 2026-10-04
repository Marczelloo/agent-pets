import type { ModPayload } from './report'

export type Endpoint = { port: number; token: string }
export type Board = { v: 1; app_version: string; sessions: BoardSession[]; limits: BoardLimit[] }
export type BoardSession = { id: string; agent: string; state: string; title: string; question?: string | null; cwd: string; since: number }
export type BoardLimit = { agent: string; window: 'five_hour' | 'weekly'; used_pct: number; resets_at?: number | null; stale_since?: number | null }

/**
 * What the bridge needs from the engine. The plugin validator follows `$` only inside the file that
 * hooks, never across an import, so the hook file builds this from its `$` (see `ioOf` in report.ts).
 */
export type BridgeIo = {
  /** This copy's folder (`$.plugin.root`). */
  pluginRoot: string
  /** The user's home directory (USERPROFILE, else HOME); undefined when neither is set. */
  home(): Promise<string | undefined>
  read(path: string): Promise<string>
  exists(path: string): Promise<boolean>
  /** Milliseconds since the epoch. */
  now(): Promise<number>
  fetch(url: string, init: { method: string; headers: Record<string, string>; body?: string }): Promise<BridgeResponse>
}

const BACKOFF_MS = 30_000
const EVENTS_PATH = '/v1/events/claude-mod'
const STATE_PATH = '/v1/state'
const SKILLS_COPY = '/.claude/skills/agent-pets'

/** Forward slashes, no trailing slash. Compare with `.toLowerCase()` where case does not matter. */
const normalise = (path: string) => path.replace(/\\/g, '/').replace(/\/+$/, '')

type BridgeResponse = { status: number; ok: boolean; text: string }

/**
 * The only door to the widget: its endpoint file, a bearer token and three failure rules.
 * Nothing here throws to a caller; the token never leaves the Authorization header.
 */
export function createBridge(io: BridgeIo) {
  let endpoint: Endpoint | null = null
  let backoffUntil = 0
  const stoppedSessions = new Set<string>()
  let duplicate: Promise<boolean> | undefined

  const home = async () => normalise((await io.home()) ?? '')

  // Another copy of this plugin (the app's own, in the skills folder) already reports: this one stays silent.
  const isDuplicateCopy = (): Promise<boolean> =>
    (duplicate ??= (async () => {
      try {
        const base = await home()
        if (!base) return false
        const own = `${base}${SKILLS_COPY}`
        if (normalise(io.pluginRoot).toLowerCase() === own.toLowerCase()) return false
        return await io.exists(`${own}/.claude-plugin/plugin.json`)
      } catch {
        return false
      }
    })())

  const readEndpoint = async (): Promise<Endpoint> => {
    const text = await io.read(`${await home()}/.agent-pets/endpoint.json`)
    const parsed: unknown = JSON.parse(text)
    const { port, token } = (parsed ?? {}) as Partial<Endpoint>
    if (typeof port !== 'number' || !Number.isInteger(port) || port < 1 || port > 65535 || typeof token !== 'string' || token === '') {
      throw new Error('bad endpoint file')
    }
    return { port, token }
  }

  // A 2xx or a 400 is an answer; anything else (or no answer) drops the endpoint and pauses every call.
  const request = async (path: string, init: { method: string; body?: string }): Promise<BridgeResponse | null> => {
    if (await isDuplicateCopy()) return null
    const now = await io.now()
    if (now < backoffUntil) return null
    try {
      endpoint ??= await readEndpoint()
      const headers: Record<string, string> = { authorization: `Bearer ${endpoint.token}` }
      if (init.body !== undefined) headers['content-type'] = 'application/json'
      const res = await io.fetch(`http://127.0.0.1:${endpoint.port}${path}`, { method: init.method, headers, body: init.body })
      if (res.ok || res.status === 400) return res
    } catch {
      // fall through to the backoff
    }
    endpoint = null
    backoffUntil = now + BACKOFF_MS
    return null
  }

  return {
    /** Fire-and-forget; never throws. */
    send(payload: ModPayload): void {
      if (stoppedSessions.has(payload.session_id)) return
      request(EVENTS_PATH, { method: 'POST', body: JSON.stringify(payload) })
        .then(res => {
          if (res?.status === 400) stoppedSessions.add(payload.session_id)
        })
        .catch(() => {})
    },

    /** The widget's board; null when it is unreachable or the bridge is backing off. */
    async state(): Promise<Board | null> {
      try {
        const res = await request(STATE_PATH, { method: 'GET' })
        if (!res?.ok) return null
        const board = JSON.parse(res.text) as Board
        return board && board.v === 1 ? board : null
      } catch {
        return null
      }
    },

    /** True after the widget answered 400 for that session: stop sending it anything. */
    stopped(sessionId: string): boolean {
      return stoppedSessions.has(sessionId)
    },
  }
}

export type Bridge = ReturnType<typeof createBridge>
