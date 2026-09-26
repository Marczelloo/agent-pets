import { describe, expect, it } from 'vitest';
import { blockContextMenu } from './nocontext';

describe('blockContextMenu', () => {
  it('the WebView2 menu (Back, Refresh, Print) never opens on the stage', () => {
    const t = new EventTarget();
    blockContextMenu(t);
    const e = new Event('contextmenu', { cancelable: true });
    t.dispatchEvent(e);
    expect(e.defaultPrevented).toBe(true);
  });
});
