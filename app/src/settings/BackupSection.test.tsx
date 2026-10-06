import { renderToString } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { setLang } from '../i18n';
import { BackupResult, BackupSection, exportBackup, importBackup } from './BackupSection';

describe('settings backup', () => {
  it('renders the section and controls in both languages', () => {
    setLang('pl');
    const pl = renderToString(<BackupSection onExport={async () => ''} onImport={async () => {}} />);
    expect(pl).toContain('Kopia ustawień');
    expect(pl).toContain('Eksportuj');
    expect(pl).toContain('Importuj…');
    expect(pl).toContain('accept=".json,application/json"');
    setLang('en');
    const en = renderToString(<BackupSection />);
    expect(en).toContain('Settings backup');
    expect(en).toContain('Agent integrations stay as they are.');
    setLang('pl');
  });

  it('uses the exported path for the saved name and reveal action', async () => {
    const path = 'C:\\Users\\Ann\\Downloads\\agent-pets-settings-2026-10-06.json';
    const send = vi.fn().mockResolvedValue(path);
    expect(await exportBackup(send)).toEqual({ path, name: 'agent-pets-settings-2026-10-06.json' });
    expect(send).toHaveBeenCalledOnce();
    setLang('en');
    const html = renderToString(<BackupResult result="Saved: agent-pets-settings-2026-10-06.json" error={false} path={path} onReveal={async () => {}} />);
    expect(html).toContain('role="status"');
    expect(html).toContain('Show in folder');
    setLang('pl');
  });

  it('reads the chosen file and sends its text to import', async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    await importBackup({ text: async () => '{"theme":"dark"}' }, send);
    expect(send).toHaveBeenCalledWith('{"theme":"dark"}');
    const error = new Error('This is not an Agent Pets settings file.');
    send.mockRejectedValueOnce(error);
    await expect(importBackup({ text: async () => '{}' }, send)).rejects.toBe(error);
    const html = renderToString(<BackupResult result={error.message} error path={null} />);
    expect(html).toContain('role="alert"');
    expect(html).toContain(error.message);
  });
});
