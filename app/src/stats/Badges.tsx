import { t } from '../i18n';
import type { BadgeKind, Pets, StatsBadge } from '../types';
import { agentName, badgeText, formatHours, formatPct, formatTokens, projectName } from './model';
import { StatPet } from './StatPet';

/** Worn item for a badge pet. */
export const WEAR_OF: Record<BadgeKind, string> = { glutton: 'bib', cache_master: 'scarf', night_owl: 'nightcap', marathon: 'headband' };

const proj = (b: StatsBadge) => projectName(b.project ?? '');

function detail(b: StatsBadge): string {
  switch (b.kind) {
    case 'glutton': return `${proj(b)} · ${formatTokens(b.value)}`;
    case 'cache_master': return `${proj(b)} · ${formatPct(b.value)}`;
    case 'night_owl': return t().stats.nightOwl(formatHours(b.value));
    case 'marathon': return `${proj(b)} · ${formatHours(b.value)}`;
  }
}

/** Longer badge explanation in a tooltip (hover or keyboard focus). */
function tip(b: StatsBadge, totalTokens: number): string {
  const x = t().stats.tip;
  switch (b.kind) {
    case 'glutton': return x.glutton(proj(b), formatTokens(b.value), totalTokens > 0 ? Math.round((b.value * 100) / totalTokens) : 100);
    case 'cache_master': return x.cache_master(proj(b), formatPct(b.value));
    case 'night_owl': return x.night_owl(formatHours(b.value));
    case 'marathon': return x.marathon(proj(b), b.agent ? agentName(b.agent) : '', formatHours(b.value));
  }
}

export function Badges({ badges, totalTokens, pets, animate }: { badges: StatsBadge[]; totalTokens: number; pets: Pets; animate: boolean }) {
  if (badges.length === 0) return <p className="none">{t().stats.noBadges}</p>;
  return (
    <div className="badges">
      {badges.map(b => <div className="bd" key={b.kind} tabIndex={0} aria-describedby={`tip-${b.kind}`}>
        <StatPet agent={b.agent ?? 'claude'} scene={b.kind === 'night_owl' ? 'sleep' : 'idle'} wear={WEAR_OF[b.kind]}
          w={52} h={46} u={0.27} pets={pets} animate={animate} className="badge-pet" />
        <div><b>{badgeText(b.kind)}</b><span>{detail(b)}</span></div>
        <div className="tip" role="tooltip" id={`tip-${b.kind}`}>{tip(b, totalTokens)}</div>
      </div>)}
    </div>
  );
}
