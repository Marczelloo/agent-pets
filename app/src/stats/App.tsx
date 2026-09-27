import { useCallback, useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { resolveLang, setLang, setSystemLang, t } from '../i18n';
import { reducedMotion } from '../stage/power';
import { defaultPets } from '../look';
import type { Pets, Settings, SettingsView, StatsMetric, StatsPeriod, StatsProgress, StatsRace, StatsView } from '../types';
import { Badges } from './Badges';
import { Podium } from './Podium';
import { Race } from './Race';
import { StatPet } from './StatPet';
import { Calendar } from './Calendar';
import { COUNT_MS, countUp } from './count';
import { demoStats } from './demo';
import { formatChange, formatHours, formatPct, formatTokens, scanPct } from './model';

export const PERIODS: StatsPeriod[] = ['today', 'week', 'month', 'all'];

export interface PageProps {
  view: StatsView; period: StatsPeriod; metric: StatsMetric; race: StatsRace; progress: StatsProgress | null;
  /** liczniki i paski rosną od zera (w testach i przy ograniczonym ruchu: od razu wartości) */
  animate: boolean;
  onPeriod: (p: StatsPeriod) => void; onMetric: (m: StatsMetric) => void; onRace: (r: StatsRace) => void;
  /** wygląd zwierzaków z ustawień */
  pets?: Pets;
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

/** Okno „Statystyki” (spec 0.9, 3.2). Zwierzaki dorysowują płótna w miejscach `.pet-slot`. */
export function StatsPage({ view, period, metric, race, progress, animate, onPeriod, onMetric, onRace, pets = defaultPets() }: PageProps) {
  const el = useElapsed(animate, `${period}|${metric}|${race}`);
  const reduced = reducedMotion();
  const n = (v: number) => countUp(v, el, COUNT_MS, reduced);
  const byMetric = (v: number) => (metric === 'time' ? formatHours(v) : formatTokens(v));
  const x = t().stats;
  const tl = view.tiles;
  const change = formatChange(tl.tokens_change);
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
      {view.empty ? <div className="empty">{progress && !progress.done
        // pierwszy skan jeszcze trwa: zwierzak czyta historię, tekst jest w pasku wyżej
        ? <StatPet agent="claude" scene="read" w={96} h={72} u={0.45} pets={pets} animate={animate} />
        : <><StatPet agent="claude" scene="sleep" w={96} h={72} u={0.45} pets={pets} animate={animate} /><p>{x.empty}</p></>}</div> : <>
        <div className="row top">
          <section className="card">
            <div className="ct"><span>{x.podium[period]}</span>
              <Seg small items={['time', 'tokens'] as StatsMetric[]} value={metric} label={x.metricLabel} onPick={onMetric} text={m => x.metric[m]} /></div>
            <Podium places={view.podium} format={byMetric} pets={pets} animate={animate} replay={`${period}|${metric}`} />
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
          <Race lanes={view.race} race={race} format={byMetric} pets={pets} elapsed={el} animate={animate} />
        </section>
        <div className="row bottom">
          <section className="card"><div className="ct"><span>{x.activity}</span></div><Calendar days={view.calendar} /></section>
          <section className="card"><div className="ct"><span>{x.badges}</span></div>
            <Badges badges={view.badges} pets={pets} animate={animate} />
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
  const [pets, setPets] = useState<Pets>(defaultPets);
  // tryb oszczędzania energii: bez liczników, wejść i konfetti (spec 3.3), jak w panelu i na scenie
  const [saving, setSaving] = useState(false);
  const lang = (l: Parameters<typeof resolveLang>[0]) => { setLang(resolveLang(l)); relang(n => n + 1); };
  const pick = (c: Partial<Choice>) => setChoice(o => { const n = { ...o, ...c }; saveChoice(n); return n; });
  const refresh = useCallback(() => {
    if (tauri) void invoke<StatsView>('stats_view', { ...choice }).then(setView);
  }, [tauri, choice]);

  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => {
    if (!tauri) return;
    const every = setInterval(() => { if (!document.hidden) refresh(); }, 30_000);
    // w trakcie skanu liczby rosną na żywo (spec 3.2), najwyżej co 2 s
    let shown = 0;
    const un = [
      listen<StatsProgress>('stats://progress', e => {
        setProgress(e.payload);
        if (e.payload.done || Date.now() - shown >= 2_000) { shown = Date.now(); refresh(); }
      }),
      listen<boolean>('pets://power', e => setSaving(e.payload)),
      listen<Settings>('pets://settings', e => { lang(e.payload.language ?? 'auto'); setPets(e.payload.pets); }),
    ];
    void invoke<StatsProgress>('stats_progress').then(setProgress);
    void invoke<boolean>('power_get').then(setSaving);
    void invoke<SettingsView>('settings_get').then(v => { setSystemLang(v.system_lang); lang(v.settings.language ?? 'auto'); setPets(v.settings.pets); });
    return () => { clearInterval(every); un.forEach(p => void p.then(f => f())); };
  }, [tauri, refresh]);

  if (!view) return null;
  return <StatsPage view={view} {...choice} progress={progress} animate={!saving} pets={pets} onPeriod={period => pick({ period })}
    onMetric={metric => pick({ metric })} onRace={race => pick({ race })} />;
}
