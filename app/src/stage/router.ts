import type { RouterTask } from '../types';
import { t as translate } from '../i18n';

export type RouterHealth = 'active' | 'quiet' | 'stalled' | 'blocked';

const QUIET_MS = 30_000;

/**
 * Jak `Router.healthOf` w Agent Routerze, ale liczone w chwili rysowania: plik stanu zmienia się tylko przy
 * zdarzeniach. `seenAt` to ostatnia aktywność sesji widziana w rolloucie; liczy się późniejsza z obu.
 */
export function routerHealth(t: RouterTask, nowMs: number, seenAt?: number): RouterHealth {
  if (t.blocked) return 'blocked';
  if (t.last_activity_at == null) return 'active';
  const quiet = nowMs - Math.max(t.last_activity_at, seenAt ?? -Infinity);
  if (quiet > t.stall_ms) return 'stalled';
  if (quiet > QUIET_MS) return 'quiet';
  return 'active';
}

export const isLive = (t: RouterTask) => t.status === 'running' || t.status === 'pending';

export function routerLine(t: RouterTask, nowMs: number, seenAt?: number): string {
  const what = isLive(t) ? translate().router.health[routerHealth(t, nowMs, seenAt)] : (translate().router.done as Record<string, string>)[t.status] ?? t.status;
  return translate().router.task(what);
}
