import type { App } from '../types';

type Kind = 'terminal' | 'editor' | 'window';

const KIND: Record<App, Kind> = {
  terminal: 'terminal', vscode: 'editor', cursor: 'editor', zed: 'editor', jetbrains: 'editor', antigravity: 'editor', zcode: 'editor',
  claude_desktop: 'window', codex_app: 'window', t3code: 'window', other: 'window',
};

/** Generic app icon (no brand logos): terminal, editor, or app window. */
export function HostIcon({ app }: { app: App }) {
  const kind = KIND[app] ?? 'window';
  return (
    <svg className="host-icon" viewBox="0 0 16 16" width="12" height="12" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
      <rect x="1.5" y="2.5" width="13" height="11" rx="2" />
      {kind === 'terminal' && <path d="M4.5 7l2 1.5-2 1.5M8 10.5h3.5" />}
      {kind === 'editor' && <path d="M1.5 5.5h13M5 5.5v8M7 8h5M7 10.5h3.5" />}
      {kind === 'window' && <path d="M1.5 5.5h13M3.5 4h.01M5.5 4h.01" />}
    </svg>
  );
}
