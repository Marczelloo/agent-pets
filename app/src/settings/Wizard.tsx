import { useState } from 'react';
import type { AppRow, Settings } from '../types';
import { LookGallery } from './look/LookGallery';
import { MotionSwitch } from './look/LookTab';
import { appBadge, appHint, appLabel, groupApps, WIZARD_STEPS, defaultAppChoice, type WizardStep } from './model';
import { Row, Section } from './ui';
import { Toggle } from './Toggle';
import { resolveLang, setLang, t } from '../i18n';
import { LanguageSelect } from './LanguageSelect';


interface Props {
  rows: AppRow[];
  initial: Settings;
  onFinish: (s: Settings) => Promise<string[]>;
  onDone?: () => void;
  initialStep?: WizardStep;
}

/** First-run wizard: apps, limit consent, notifications and autostart, skin. */
export function Wizard({ rows, initial, onFinish, onDone, initialStep = 'apps' }: Props) {
  const [draft, setDraft] = useState(() => defaultAppChoice(rows, initial));
  const [step, setStep] = useState(WIZARD_STEPS.indexOf(initialStep));
  const [result, setResult] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);
  const cur = WIZARD_STEPS[step];
  const set = (patch: Partial<Settings>) => setDraft(d => ({ ...d, ...patch }));
  const { main, experimental } = groupApps(rows);
  const appRow = (r: AppRow) => (
    <Toggle key={r.id} label={appLabel(r.id)} badge={appBadge(r.id)} checked={r.detected.found && !!draft.apps[r.id]} disabled={!r.detected.found}
      onChange={on => set({ apps: { ...draft.apps, [r.id]: on } })}>
      {r.detected.found ? `${r.detected.path}. ${appHint(r.id)}` : r.detected.note}
    </Toggle>
  );


  if (result) {
    return (
      <main className="wizard">
        <h1>{t().wizard.done}</h1>
        <ul className="result">{result.map((m, i) => <li key={i}>{m}</li>)}</ul>
        <p className="ui-note">{t().wizard.doneDesc}</p>
        <footer><span /><button type="button" className="accent" onClick={onDone}>{t().wizard.goSettings}</button></footer>
      </main>
    );
  }

  const finish = async () => { setBusy(true); try { setResult(await onFinish(draft)); } finally { setBusy(false); } };

  return (
    <main className="wizard">
      <div className="wizard-top">
        <p className="steps" aria-label={t().wizard.step(step + 1, WIZARD_STEPS.length)}>
          {WIZARD_STEPS.map((s, i) => <span key={s} className={i === step ? 'on' : ''} />)}
        </p>
        {step === 0 && <LanguageSelect value={draft.language ?? 'auto'} onChange={l => { setLang(resolveLang(l)); set({ language: l }); }} />}
      </div>
      <h1>{t().wizard.title[cur]}</h1>

      {cur === 'apps' && <>
        {([['main', main], ['experimental', experimental]] as const).filter(([, list]) => list.length > 0).map(([key, list]) => (
          <Section key={key} title={t().settings.sections[key]} note={key === 'experimental' ? t().settings.experimentalNote : undefined}>
            {list.map(appRow)}
          </Section>
        ))}
      </>}

      {cur === 'limits' && <>
        <p className="ui-note">
          {t().wizard.limitsIntro}<code>/usage</code>{t().wizard.limitsIntroAfter}
        </p>
        <p className="ui-note">
          {t().wizard.limitsAuth}<code>~/.claude/.credentials.json</code>{t().wizard.limitsAuthAfter}
          <code> api.anthropic.com</code>{t().wizard.limitsAuthEnd}
        </p>
        <Section title="Claude">
          <Toggle label={t().limits.fromAnthropic} checked={draft.claude_plan_usage} onChange={on => set({ claude_plan_usage: on })}>
            {t().wizard.fetchLimits}
          </Toggle>
          <Toggle label={t().limits.statusline} checked={draft.claude_statusline} onChange={on => set({ claude_statusline: on })}>
            {t().limits.statuslineDesc}
          </Toggle>
        </Section>
      </>}

      {cur === 'notify' && <Section>
        <Toggle label={t().state.needs_you} checked={draft.notifications.needs_you}
          onChange={on => set({ notifications: { ...draft.notifications, needs_you: on } })}>{t().settings.notifyNeeds}</Toggle>
        <Toggle label={t().state.done} checked={draft.notifications.done}
          onChange={on => set({ notifications: { ...draft.notifications, done: on } })}>{t().settings.notifyDone}</Toggle>
        <Toggle label={t().limits.label} checked={draft.notifications.limits}
          onChange={on => set({ notifications: { ...draft.notifications, limits: on } })}>{t().limits.notification}</Toggle>
        <Toggle label={t().settings.autostart} checked={draft.autostart} onChange={on => set({ autostart: on })}>
          {t().settings.autostartDesc}
        </Toggle>
      </Section>}

      {cur === 'look' && <Section>
        <Row label={t().look.motionTitle} hint={t().look.motionDesc} control={
          <MotionSwitch motion={draft.pets.motion} onPick={m => set({ pets: { ...draft.pets, motion: m } })} />} />
        <LookGallery compact style={draft.pets.style} motion={draft.pets.motion} scene="edit" onPick={st => set({ pets: { ...draft.pets, style: st } })} />
      </Section>}

      <footer>
        <button type="button" disabled={step === 0} onClick={() => setStep(s => s - 1)}>{t().wizard.back}</button>
        {step < WIZARD_STEPS.length - 1
          ? <button type="button" className="accent" onClick={() => setStep(s => s + 1)}>{t().wizard.next}</button>
          : <button type="button" className="accent" disabled={busy} onClick={() => void finish()}>{t().wizard.finish}</button>}
      </footer>
    </main>
  );
}
