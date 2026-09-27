import { useCallback, useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { resolveLang, setLang, setSystemLang, t } from '../i18n';
import { reducedMotion } from '../stage/power';
import type { Settings, SettingsView, StatsBadge, StatsMetric, StatsPeriod, StatsProgress, StatsRace, StatsView } from '../types';
import { Calendar } from './Calendar';
import { COUNT_MS, countUp } from './count';
import { demoStats } from './demo';
import { agentName, badgeText, formatChange, formatHours, formatPct, formatTokens, scanPct } from './model';

export const PERIODS: StatsPeriod[] = ['today', 'week', 'month', 'all'];

export interface PageProps {
  view: StatsView; period: StatsPeriod; metric: StatsMetric; race: StatsRace; progress: StatsProgress | null;
  /** liczniki i paski rosną od zera (w testach i przy ograniczonym ruchu: od razu wartości) */
  animate: boolean;
  onPeriod: (p: StatsPeriod) => void; onMetric: (m: StatsMetric) => void; onRace: (r: StatsRace) => void;
}

/** Czas od ostatniej zmiany `key` (ms), do końca animacji liczników; bez animacji od razu „koniec”. */
function useElapsed(animate: boolean, key: string): number {
  const [el, setEl] = useState(animate ? 0 : Infinity);
  useEffect(() => {
    if (!animate) { setEl(Infinity); return; }
    const t0 = performance.now();
    let raf = 0;
    const f = (now: number) => { const e = now - t0; setEl(e); if (e < COUNT_MS) raf = requestAnimationFrame(f); };
    setEl(0);
    raf = requestAnimationFrame(f);
    return () => cancelAnimationFrame(raf);
  }, [animate, key]);
  return el;
}

function Seg<T extends string>({ items, value, label, onPick, text, small }: {
  items: T[]; value: T; label: string; onPick: (v: T) => void; text: (v: T) => string; small?: boolean;
}) {
  return (
    <div className={small ? 'seg small' : 'seg'} role="group" aria-label={label}>
      {items.map(v => <button key={v} type="button" aria-pressed={v === value} className={v === value ? 'on' : undefined} onClick={() => onPick(v)}>{text(v)}</button>)}
    </div>
  );
}

function badgeDetail(b: StatsBadge): string {
  switch (b.kind) {
    case 'glutton': return `${b.project ?? ''} · ${formatTokens(b.value)}`;
    case 'cache_master': return `${b.project ?? ''} · ${formatPct(b.value)}`;
    case 'night_owl': return t().stats.nightOwl(formatHours(b.value));
    case 'marathon': return `${b.project ?? ''} · ${formatHours(b.value)}`;
  }
}

/** Okno „Statystyki” (spec 0.9, 3.2). Zwierzaki dorysowują płótna w miejscach `.pet-slot`. */
export function StatsPage({ view, period, metric, race, progress, animate, onPeriod, onMetric, onRace }: PageProps) {
  const el = useElapsed(animate, `${period}|${metric}|${race}`);
  const reduced = reducedMotion();
  const n = (v: number) => countUp(v, el, COUNT_MS, reduced);
  const byMetric = (v: number) => (metric === 'time' ? formatHours(v) : formatTokens(v));
  const x = t().stats;
  const tl = view.tiles;
  const change = formatChange(tl.tokens_change);
  const max = Math.max(1, ...view.race.map(l => l.value));
  return (
    <div className="stats">
      <header>
        <h1>{x.title}</h1>
        {view.record && <span className="rec">{x.record}</span>}
        <Seg items={PERIODS} value={period} label={x.periodLabel} onPick={onPeriod} text={p => x.periods[p]} />
      </header>
      {progress && !progress.done && <div className="scan" role="status">
        <span>{x.loading(scanPct(progress))}</span>
        <span className="bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={scanPct(progress)}><i style={{ width: `${scanPct(progress)}%` }} /></span>
      </div>}
      {view.empty ? <div className="empty"><div className="pet-slot" data-slot="empty" /><p>{x.empty}</p></div> : <>
        <div className="row top">
          <section className="card">
            <div className="ct"><span>{x.podium[period]}</span>
              <Seg small items={['time', 'tokens'] as StatsMetric[]} value={metric} label={x.metricLabel} onPick={onMetric} text={m => x.metric[m]} /></div>
            <div className="podium">
              {[1, 0, 2].map(i => {
                const p = view.podium[i];
                return <div key={i} className={`step s${i + 1}`}>
                  <div className="pet-slot" data-slot="podium" data-rank={i + 1} data-agent={p?.agent ?? ''} />
                  <div className="blk">{i + 1}</div>
                  <div className="nm">{p?.project ?? x.emptyStep}</div>
                  <div className="vl">{p ? byMetric(p.value) : ''}</div>
                </div>;
              })}
            </div>
          </section>
          <div className="tiles">
            <div className="tile"><div className="k">{x.tiles.tokens}</div><div className="v">{formatTokens(n(tl.tokens))}</div>
              <div className="d">{change && <><span className={tl.tokens_change! >= 0 ? 'up' : 'down'}>{change}</span> {x.vsPrev}</>}</div></div>
            <div className="tile"><div className="k">{x.tiles.cache}</div><div className="v">{tl.cache_pct == null ? '–' : formatPct(n(tl.cache_pct))}</div>
              <div className="d">{x.cacheRead(formatTokens(tl.cache_read))}</div></div>
            <div className="tile"><div className="k">{x.tiles.time}</div><div className="v">{formatHours(n(tl.active_ms))}</div>
              <div className="d">{tl.longest_ms > 0 && x.longest(formatHours(tl.longest_ms))}</div></div>
            <div className="tile"><div className="k">{x.tiles.sessions}</div><div className="v">{n(tl.sessions)}</div>
              <div className="d">{x.subsQuestions(tl.subagents, tl.questions)}</div></div>
          </div>
        </div>
        <section className="card race">
          <div className="ct"><span>{x.race.title}</span>
            <Seg small items={['agents', 'projects'] as StatsRace[]} value={race} label={x.race.title} onPick={onRace} text={r => x.race[r]} /></div>
          {view.race.map(l => {
            const w = (countUp(l.value, el, COUNT_MS, reduced) / max) * 100;
            return <div className="lane" key={l.key}>
              <span className="nm">{race === 'agents' && l.agent ? agentName(l.agent) : l.key}</span>
              <div className="trk"><i className={`bar ${l.agent ?? ''}`} style={{ width: `${w}%` }} />
                <div className="pet-slot runner" data-slot="run" data-agent={l.agent ?? ''} style={{ left: `calc(${w}% - 12px)` }} /></div>
              <span className="t">{byMetric(l.value)}</span>
            </div>;
          })}
        </section>
        <div className="row bottom">
          <section className="card"><div className="ct"><span>{x.activity}</span></div><Calendar days={view.calendar} /></section>
          <section className="card"><div className="ct"><span>{x.badges}</span></div>
            {view.badges.length === 0 ? <p className="none">{x.noBadges}</p> : <div className="badges">
              {view.badges.map(b => <div className="bd" key={b.kind}>
                <div className="pet-slot" data-slot="badge" data-badge={b.kind} data-agent={b.agent ?? ''} />
                <div><b>{badgeText(b.kind)}</b><span>{badgeDetail(b)}</span></div>
              </div>)}
            </div>}
          </section>
        </div>
      </>}
    </div>
  );
}

const KEY = 'agent-pets.stats';
interface Choice { period: StatsPeriod; metric: StatsMetric; race: StatsRace }
function loadChoice(): Choice {
  const d: Choice = { period: 'week', metric: 'time', race: 'agents' };
  try { return { ...d, ...(JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<Choice>) }; } catch { return d; }
}
function saveChoice(c: Choice) { try { localStorage.setItem(KEY, JSON.stringify(c)); } catch { /* bez pamięci wyboru */ } }

/** Okno w aplikacji (rdzeń) albo w zwykłej przeglądarce (dane pokazowe). */
export default function Root({ tauri }: { tauri: boolean }) {
  const [choice, setChoice] = useState<Choice>(loadChoice);
  const [view, setView] = useState<StatsView | null>(tauri ? null : demoStats());
  const [progress, setProgress] = useState<StatsProgress | null>(null);
  const [, relang] = useState(0);
  const lang = (l: Parameters<typeof resolveLang>[0]) => { setLang(resolveLang(l)); relang(n => n + 1); };
  const pick = (c: Partial<Choice>) => setChoice(o => { const n = { ...o, ...c }; saveChoice(n); return n; });
  const refresh = useCallback(() => {
    if (tauri) void invoke<StatsView>('stats_view', { ...choice }).then(setView);
  }, [tauri, choice]);

  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => {
    if (!tauri) return;
    const every = setInterval(() => { if (!document.hidden) refresh(); }, 30_000);
    const un = [
      listen<StatsProgress>('stats://progress', e => { setProgress(e.payload); if (e.payload.done) refresh(); }),
      listen<Settings>('pets://settings', e => lang(e.payload.language ?? 'auto')),
    ];
    void invoke<StatsProgress>('stats_progress').then(setProgress);
    void invoke<SettingsView>('settings_get').then(v => { setSystemLang(v.system_lang); lang(v.settings.language ?? 'auto'); });
    return () => { clearInterval(every); un.forEach(p => void p.then(f => f())); };
  }, [tauri, refresh]);

  if (!view) return null;
  return <StatsPage view={view} {...choice} progress={progress} animate onPeriod={period => pick({ period })}
    onMetric={metric => pick({ metric })} onRace={race => pick({ race })} />;
}
