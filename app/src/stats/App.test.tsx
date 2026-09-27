import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { StatsPage, type PageProps } from './App';
import { demoStats } from './demo';
import type { StatsView } from '../types';

const base = (over: Partial<PageProps> = {}): PageProps => ({
  view: demoStats(), period: 'week', metric: 'time', race: 'agents', progress: { files: 0, scanned: 1, total: 1, done: true },
  animate: false, onPeriod: () => {}, onMetric: () => {}, onRace: () => {}, ...over,
});
const empty: StatsView = { empty: true, podium: [], tiles: { tokens: 0, tokens_change: null, cache_pct: null, cache_read: 0, active_ms: 0,
  longest_ms: 0, sessions: 0, subagents: 0, questions: 0 }, race: [], calendar: [], badges: [], record: false };

describe('StatsPage', () => {
  it('shows the tiles, the podium and the period switch', () => {
    const html = renderToString(<StatsPage {...base()} />);
    for (const s of ['Tokeny', '48,2 mln', 'Z cache', '91%', 'Czas pracy', 'Sesje', 'Agent Pets', 'Tydzień']) expect(html, s).toContain(s);
    expect(html).toMatch(/aria-pressed="true"[^>]*>Tydzień/);
    expect(html.match(/class="step s\d"/g)?.length).toBe(3);
  });
  it('shows the record only on a record day', () => {
    expect(renderToString(<StatsPage {...base()} />)).toContain('Rekord dnia!');
    expect(renderToString(<StatsPage {...base({ view: { ...demoStats(), record: false } })} />)).not.toContain('Rekord dnia!');
  });
  it('shows the history loading bar while the first scan runs', () => {
    const html = renderToString(<StatsPage {...base({ progress: { files: 9, scanned: 43, total: 100, done: false } })} />);
    expect(html).toContain('Wczytuję historię… 43%');
    expect(renderToString(<StatsPage {...base()} />)).not.toContain('Wczytuję historię');
  });
  it('an empty history says what will appear, without errors', () => {
    const html = renderToString(<StatsPage {...base({ view: empty })} />);
    expect(html).toContain('Statystyki pojawią się, gdy agenci zaczną pracować');
    expect(html).toContain('class="empty"');
    expect(html).not.toContain('NaN');
  });
  it('during the first scan an empty book shows the loading bar, not the empty text', () => {
    const html = renderToString(<StatsPage {...base({ view: empty, progress: { files: 40, scanned: 10, total: 100, done: false } })} />);
    expect(html).toContain('Wczytuję historię… 10%');
    expect(html).not.toContain('Statystyki pojawią się');
  });
  it('without motion (energy saver) the pets do not make an entrance', () => {
    expect(renderToString(<StatsPage {...base({ animate: true })} />)).toContain('class="enter"');
    expect(renderToString(<StatsPage {...base({ animate: false })} />)).not.toContain('enter');
  });
  it('the calendar has a cell per day with its level', () => {
    const html = renderToString(<StatsPage {...base()} />);
    expect(html.match(/class="day lv\d"/g)?.length).toBe(182);
  });
});
