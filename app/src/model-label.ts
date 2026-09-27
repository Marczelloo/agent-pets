// Tekst podpisu zwierzaka: agent (czyja pętla), model (kogo pyta) i program (gdzie użytkownik steruje). Spec 0.10, 2 i 3.3.
import { t } from './i18n';
import type { Session } from './types';

const cap = (w: string) => w.charAt(0).toUpperCase() + w.slice(1);
const words = (rest: string) => rest.split('-').filter(Boolean).map(cap).join(' ');

/** Id modelu jak z logów (`claude-opus-5-5`, `openai/gpt-6-sol`) → nazwa do wyświetlenia; nieznany format bez zmian. */
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

/** Nazwa agenta; agent z furtki podaje własną (tekst, nigdy znaczniki). */
export function agentLabel(s: Pick<Session, 'agent' | 'agent_name'>): string {
  if (s.agent === 'other') return s.agent_name || t().agent.other;
  return t().agent[s.agent] ?? s.agent;
}

/** Program, w którym działa sesja; `null` = terminal albo nieznany (jak dotąd: terminal pomijamy). */
export function hostLabel(s: Pick<Session, 'origin' | 'jump'>): string | null {
  if (s.origin === 'router') return t().origin.router;
  const app = s.jump.app;
  if (!app || app === 'terminal') return s.origin === 'desktop' && !app ? t().origin.desktop : null;
  // aplikacja samego agenta: „Codex · aplikacja”, jak w 0.9
  if (app === 'claude_desktop' || app === 'codex_app') return t().origin.desktop;
  if (app === 'other') return s.jump.app_name || null;
  return t().app[app];
}
