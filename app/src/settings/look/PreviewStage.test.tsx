import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { setLang } from '../../i18n';
import { PreviewStage } from './PreviewStage';

const noop = () => {};
const look = { style: 'sticker', motion: 'dynamic' } as const;

describe('PreviewStage', () => {
  it('"all in order" marks the scene that is playing right now', () => {
    setLang('en');
    const html = renderToString(<PreviewStage agent="claude" look={look} scene="bash" cycle onScene={noop} onCycle={noop} />);
    expect(html).toMatch(/class="playing"[^>]*>Commands|class="playing"[^>]*>[^<]*<\/button>/);
    const playing = html.match(/<button[^>]*class="playing"[^>]*>([^<]*)</);
    expect(playing?.[1]).toBeTruthy();
    const single = renderToString(<PreviewStage agent="claude" look={look} scene="bash" cycle={false} onScene={noop} onCycle={noop} />);
    expect(single).not.toContain('class="playing"');
  });
  it('the scenes are three labelled radiogroups; exactly one scene is checked across them, none while "play all" runs', () => {
    setLang('en');
    const one = renderToString(<PreviewStage agent="claude" look={look} scene="bash" cycle={false} onScene={noop} onCycle={noop} />);
    for (const name of ['Work', 'States', 'Reactions']) expect(one).toMatch(new RegExp(`role="radiogroup" aria-label="${name}"`));
    expect(one.match(/aria-checked="true"/g)?.length).toBe(1);
    expect(one).toMatch(/aria-checked="true"[^>]*>Commands</);
    const all = renderToString(<PreviewStage agent="claude" look={look} scene="bash" cycle onScene={noop} onCycle={noop} />);
    expect(all).not.toContain('aria-checked="true"');
  });
  it('"play all" is a toggle button that is pressed while cycling, and every group stays reachable by Tab', () => {
    setLang('en');
    const all = renderToString(<PreviewStage agent="claude" look={look} scene="bash" cycle onScene={noop} onCycle={noop} />);
    expect(all).toMatch(/<button[^>]*aria-pressed="true"[^>]*>.*?All in order<\/button>/);
    expect(all.match(/tabindex="0"/g)?.length).toBe(3);
    const one = renderToString(<PreviewStage agent="claude" look={look} scene="bash" cycle={false} onScene={noop} onCycle={noop} />);
    expect(one.match(/role="radio"[^>]*tabindex="0"/g)?.length).toBe(3);
  });
});
