import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { setLang } from '../../i18n';
import { PreviewStage } from './PreviewStage';

const noop = () => {};
const look = { style: 'sticker', motion: 'dynamic' } as const;

describe('PreviewStage', () => {
  it('"all in order" marks the scene that is playing right now', () => {
    setLang('en');
    const html = renderToString(<PreviewStage look={look} scene="bash" cycle onScene={noop} onCycle={noop} />);
    expect(html).toMatch(/class="playing"[^>]*>Commands|class="playing"[^>]*>[^<]*<\/button>/);
    const playing = html.match(/<button[^>]*class="playing"[^>]*>([^<]*)</);
    expect(playing?.[1]).toBeTruthy();
    const single = renderToString(<PreviewStage look={look} scene="bash" cycle={false} onScene={noop} onCycle={noop} />);
    expect(single).not.toContain('class="playing"');
  });
});
