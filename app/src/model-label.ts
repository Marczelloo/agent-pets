// Pet label text: agent (whose loop), model (who it queries), and app (where the user controls it). Spec 0.10, 2 and 3.3.
import { t } from './i18n';
import type { Session } from './types';

const cap = (w: string) => w.charAt(0).toUpperCase() + w.slice(1);
const words = (rest: string) => rest.split('-').filter(Boolean).map(cap).join(' ');

/** Model ID from logs (`claude-opus-5-5`, `openai/gpt-6-sol`) → display name; unknown formats stay unchanged. */
export function modelLabel(id: string | null | undefined): string | null {
  const raw = (id ?? '').trim().split('/').pop()?.trim() ?? '';
  if (!raw) return null;
  const claude = /^claude-([a-z]+)-(\d+(?:-\d{1,2})*?)(?:-\d{8})?(?:\[1m\])?$/.exec(raw);
  if (claude) return `${cap(claude[1])} ${claude[2].replace(/-/g, '.')}`;
  const gpt = /^gpt-(\d+(?:\.\d+)?)((?:-[a-z0-9]+)*)$/.exec(raw);
  if (gpt) return [`GPT-${gpt[1]}`, words(gpt[2])].filter(Boolean).join(' ');
  const gemini = /^gemini-(\d+(?:\.\d+)?)((?:-[a-z]+)*)$/.exec(raw);
  if (gemini) return [`Gemini ${gemini[1]}`, words(gemini[2])].filter(Boolean).join(' ');
  const glm = /^glm-(\d+(?:\.\d+)?)$/i.exec(raw);
  if (glm) return `GLM-${glm[1]}`;
  return raw.slice(0, 32);
}

/** Agent name; a bridge agent provides its own (text, never markup). */
export function agentLabel(s: Pick<Session, 'agent' | 'agent_name'>): string {
  if (s.agent === 'other') return s.agent_name || t().agent.other;
  return t().agent[s.agent] ?? s.agent;
}

/** App running the session; `null` = terminal or unknown (as before, omit the terminal). */
export function hostLabel(s: Pick<Session, 'origin' | 'jump'>): string | null {
  if (s.origin === 'router') return t().origin.router;
  const app = s.jump.app;
  if (!app || app === 'terminal') return s.origin === 'desktop' && !app ? t().origin.desktop : null;
  // agent's own app: "Codex · app", as in 0.9
  if (app === 'claude_desktop' || app === 'codex_app') return t().origin.desktop;
  if (app === 'other') return s.jump.app_name || null;
  return t().app[app];
}
