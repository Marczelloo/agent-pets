import { useRef, useState } from 'react';
import { t } from '../i18n';
import { Section } from './ui';

interface Props {
  onExport?: () => Promise<string>;
  onImport?: (text: string) => Promise<void>;
  onReveal?: (path: string) => Promise<void>;
}

interface ResultProps { result: string | null; error: boolean; path: string | null; onReveal?: (path: string) => Promise<void>; onError?: (message: string) => void }

export function BackupResult({ result, error, path, onReveal, onError }: ResultProps) {
  if (!result) return null;
  return <p className="ui-note" role={error ? 'alert' : 'status'}>{result}
    {path && onReveal && <>{' '}<button type="button" className="link-btn" onClick={() => void onReveal(path).catch(e => onError?.(String(e)))}>{t().settings.backup.reveal}</button></>}
  </p>;
}

export const backupFileName = (path: string) => path.split(/[\\/]/).pop() ?? path;

export async function exportBackup(send: () => Promise<string>): Promise<{ path: string; name: string }> {
  const path = await send();
  return { path, name: backupFileName(path) };
}

export async function importBackup(file: Pick<File, 'text'>, send: (text: string) => Promise<void>): Promise<void> {
  await send(await file.text());
}

export function BackupSection({ onExport, onImport, onReveal }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const [path, setPath] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);
  const backup = t().settings.backup;

  const exportFile = async () => {
    if (!onExport) return;
    setBusy(true);
    try {
      const saved = await exportBackup(onExport);
      setPath(saved.path);
      setResult(backup.saved(saved.name));
      setError(false);
    } catch (e) { setPath(null); setResult(String(e)); setError(true); }
    finally { setBusy(false); }
  };
  const importFile = async (file: File | undefined) => {
    if (!file || !onImport) return;
    setBusy(true);
    setPath(null);
    try { await importBackup(file, onImport); setResult(backup.imported); setError(false); }
    catch (e) { setResult(String(e)); setError(true); }
    finally { setBusy(false); if (input.current) input.current.value = ''; }
  };

  return <Section title={backup.title} note={backup.hint}>
    <div className="backup-actions">
      <button type="button" disabled={busy || !onExport} onClick={() => void exportFile()}>{backup.export}</button>
      <button type="button" disabled={busy || !onImport} onClick={() => input.current?.click()}>{backup.import}</button>
      <input ref={input} type="file" accept=".json,application/json" aria-label={backup.import} hidden
        onChange={e => void importFile(e.currentTarget.files?.[0])} />
    </div>
    <BackupResult result={result} error={error} path={path} onReveal={onReveal} onError={message => { setResult(message); setError(true); }} />
  </Section>;
}
