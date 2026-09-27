import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { seeded } from '../renderer/testing';
import { defaultPets } from '../look';
import { spawnConfetti, stepConfetti } from './confetti';
import { Podium, introPlan } from './Podium';
import { Badges, WEAR_OF } from './Badges';
import { Race } from './Race';
import { demoStats } from './demo';
import { formatHours } from './model';

describe('confetti', () => {
  it('pieces fall, leave below the canvas and never multiply', () => {
    let parts = spawnConfetti(30, 200, ['#fff'], seeded(1).next);
    expect(parts).toHaveLength(30);
    const y0 = parts.map(p => p.y);
    parts = stepConfetti(parts, 0.1, 150);
    expect(parts.every((p, i) => p.y > y0[i])).toBe(true);
    for (let i = 0; i < 100; i++) parts = stepConfetti(parts, 0.1, 150);
    expect(parts).toHaveLength(0);
  });
  it('the same seed gives the same confetti', () => {
    expect(spawnConfetti(5, 100, ['#a', '#b'], seeded(3).next)).toEqual(spawnConfetti(5, 100, ['#a', '#b'], seeded(3).next));
  });
});

describe('pets in the statistics window', () => {
  const pets = defaultPets();
  it('the pets enter from third to first, or all at once with reduced motion', () => {
    expect(introPlan(false)).toEqual([600, 300, 0]);
    expect(introPlan(true)).toEqual([0, 0, 0]);
  });
  it('a podium with two projects has two pets and a free third step', () => {
    const places = demoStats().podium.slice(0, 2);
    const html = renderToString(<Podium places={places} format={formatHours} pets={pets} animate={false} replay="w" />);
    expect(html.match(/<canvas/g)?.filter(Boolean).length).toBe(2 + 1); // dwa zwierzaki i konfetti
    expect(html).toContain('wolne miejsce');
    expect(html).toContain('data-scene="podium_first"');
    expect(html).toContain('data-wear="crown"');
  });
  it('each badge dresses its pet', () => {
    expect(WEAR_OF).toEqual({ glutton: 'bib', cache_master: 'scarf', night_owl: 'nightcap', marathon: 'headband' });
    const html = renderToString(<Badges badges={demoStats().badges} totalTokens={42_000_000} pets={pets} animate={false} />);
    for (const w of ['bib', 'scarf', 'nightcap', 'headband']) expect(html).toContain(`data-wear="${w}"`);
  });
  it('each badge explains itself on hover or focus', () => {
    const html = renderToString(<Badges badges={demoStats().badges} totalTokens={42_000_000} pets={pets} animate={false} />);
    expect(html.match(/role="tooltip"/g)).toHaveLength(4);
    expect(html.match(/tabindex="0"/g)).toHaveLength(4);
    expect(html).toContain('21 mln (50% wszystkich tokenów)');
    expect(html).toContain('co najmniej 1 mln tokenów');
    expect(html).toContain('między 23:00 a 5:00');
    expect(html).toContain('Przerwy dłuższe niż 5 min się nie liczą');
  });
  it('a project without a folder reads as "No project" on the podium', () => {
    const places = [{ project: ':no-project', value: 1, agent: 'claude' as const }];
    expect(renderToString(<Podium places={places} format={formatHours} pets={pets} animate={false} replay="w" />)).toContain('Bez projektu');
  });
  it('race lanes carry a running pet', () => {
    const html = renderToString(<Race lanes={demoStats().race} race="agents" format={formatHours} pets={pets} elapsed={Infinity} animate={false} />);
    expect(html.match(/data-scene="run"/g)).toHaveLength(3);
  });
});
