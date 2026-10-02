import type { AppId, AppRow, Settings } from '../types';
import { t } from '../i18n';
import { appHint, appLabel, doorOn, groupApps, withDoor } from './model';
import { Row, Section, Switch } from './ui';

/** Apps whose files receive hooks: the paragraph explains what and where. */
const HOOK_FILES: AppId[] = ['copilot', 'antigravity', 'cursor', 'grok', 'zcode'];
/** What this app's pet will not show. */
const NOTE: Partial<Record<AppId, () => string>> = {
  antigravity: () => t().settings.antigravityNote, cursor: () => t().settings.cursorNote, zcode: () => t().settings.zcodeNote,
};

interface Props {
  settings: Settings;
  rows: AppRow[];
  onChange: (s: Settings) => void;
  onIntegration: (id: AppId, on: boolean) => Promise<string>;
}

/** Apps tab: main agents, then the experimental ones, then the door for any other tool. */
export function AppsTab({ settings: s, rows, onChange, onIntegration }: Props) {
  const { main, experimental } = groupApps(rows);
  const line = (r: AppRow) => r.detected.found ? `${t().settings.detected} · ${r.status.detail}` : r.detected.note;
  const appRow = (r: AppRow) => (
    <Row key={r.id} label={appLabel(r.id)} hint={line(r)} dim={!r.detected.found}
      control={<Switch checked={!!s.apps[r.id]} disabled={!r.detected.found && !s.apps[r.id]} aria-label={appLabel(r.id)}
        onChange={on => void onIntegration(r.id, on)} />}>
      {(r.detected.found || HOOK_FILES.includes(r.id)) && (
        <details className="app-details">
          <summary>{t().settings.details}</summary>
          {r.detected.found && <p className="ui-hint">{r.detected.path}</p>}
          {HOOK_FILES.includes(r.id) && <p className="ui-hint">{appHint(r.id)}{NOTE[r.id] && ` ${NOTE[r.id]!()}`}</p>}
          {r.id === 'claude_code' && s.apps.claude_code && !r.status.installed && (
            <p className="ui-hint">{appHint('claude_code')}{' '}
              <button type="button" onClick={() => void onIntegration(r.id, true)}>{t().settings.reinstall}</button></p>
          )}
        </details>
      )}
    </Row>
  );
  return <>
    {main.length > 0 && <Section title={t().settings.sections.main}>{main.map(appRow)}</Section>}
    {experimental.length > 0 && <Section title={t().settings.sections.experimental} note={t().settings.experimentalNote}>{experimental.map(appRow)}</Section>}
    <Section title={t().settings.sections.other}>
      <Row label={t().settings.door} hint={t().settings.doorDesc}
        control={<Switch checked={doorOn(s)} onChange={on => onChange(withDoor(s, on))} aria-label={t().settings.door} />} />
    </Section>
  </>;
}
