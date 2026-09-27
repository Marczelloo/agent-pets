import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { App } from '../types';
import { HostIcon } from './HostIcon';

describe('HostIcon', () => {
  it('draws an icon for every program', () => {
    const apps: App[] = ['terminal', 'claude_desktop', 'codex_app', 'vscode', 't3code', 'cursor', 'antigravity', 'zed', 'jetbrains', 'other'];
    for (const a of apps) expect(renderToString(<HostIcon app={a} />), a).toMatch(/^<svg[^>]*aria-hidden="true"/);
  });
});
