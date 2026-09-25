import { useState } from 'react';
import type { AppRow, Settings } from '../types';
import { LookGallery } from './look/LookGallery';
import { MotionSwitch } from './look/LookTab';
import { APP_HINT, APP_LABEL, WIZARD_STEPS, defaultAppChoice, type WizardStep } from './model';
import { Toggle } from './Toggle';

const TITLE: Record<WizardStep, string> = {
  apps: 'Dla których aplikacji mają być zwierzaki?',
  limits: 'Limity Claude\'a z godzinami resetu',
  notify: 'Powiadomienia i uruchamianie',
  look: 'Wygląd zwierzaków',
};


interface Props {
  rows: AppRow[];
  initial: Settings;
  onFinish: (s: Settings) => Promise<string[]>;
  onDone?: () => void;
  initialStep?: WizardStep;
}

/** Kreator pierwszego uruchomienia: aplikacje, zgoda na limity, powiadomienia i autostart, skórka. */
export function Wizard({ rows, initial, onFinish, onDone, initialStep = 'apps' }: Props) {
  const [draft, setDraft] = useState(() => defaultAppChoice(rows, initial));
  const [step, setStep] = useState(WIZARD_STEPS.indexOf(initialStep));
  const [result, setResult] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);
  const cur = WIZARD_STEPS[step];
  const set = (patch: Partial<Settings>) => setDraft(d => ({ ...d, ...patch }));


  if (result) {
    return (
      <main className="wizard">
        <h1>Gotowe</h1>
        <ul className="result">{result.map((m, i) => <li key={i}>{m}</li>)}</ul>
        <p className="desc">Wszystko to zmienisz później w Ustawieniach (ikona w trayu albo ⚙ w panelu).</p>
        <footer><span /><button type="button" className="accent" onClick={onDone}>Przejdź do ustawień</button></footer>
      </main>
    );
  }

  const finish = async () => { setBusy(true); try { setResult(await onFinish(draft)); } finally { setBusy(false); } };

  return (
    <main className="wizard">
      <p className="steps" aria-label={`Krok ${step + 1} z ${WIZARD_STEPS.length}`}>
        {WIZARD_STEPS.map((s, i) => <span key={s} className={i === step ? 'on' : ''} />)}
      </p>
      <h1>{TITLE[cur]}</h1>

      {cur === 'apps' && <section className="card">
        {rows.map(r => (
          <Toggle key={r.id} label={APP_LABEL[r.id]} checked={r.detected.found && draft.apps[r.id]} disabled={!r.detected.found}
            onChange={on => set({ apps: { ...draft.apps, [r.id]: on } })}>
            {r.detected.found ? `${r.detected.path}. ${APP_HINT[r.id]}` : r.detected.note}
          </Toggle>
        ))}
      </section>}

      {cur === 'limits' && <section className="card">
        <p className="desc">
          Widżet może co 5 minut pytać serwer Anthropic o zużycie Twojego planu Claude, tak jak robi to <code>/usage</code> w Claude Code.
          Daje to dokładne limity 5h i tygodniowy z godzinami resetu, bez żadnej otwartej sesji.
        </p>
        <p className="desc">
          Użyje do tego logowania Claude Code z <code>~/.claude/.credentials.json</code>. Token trafia wyłącznie do
          <code> api.anthropic.com</code> i nigdzie go nie zapisujemy. Bez zgody limity Claude'a pochodzą z aplikacji Claude
          (bez godzin resetu) albo z sesji w terminalu.
        </p>
        <Toggle label="Limity z Anthropic" checked={draft.claude_plan_usage} onChange={on => set({ claude_plan_usage: on })}>
          Pobieraj limity planu z api.anthropic.com
        </Toggle>
      </section>}

      {cur === 'notify' && <section className="card">
        <Toggle label="Czeka na Ciebie" checked={draft.notifications.needs_you}
          onChange={on => set({ notifications: { ...draft.notifications, needs_you: on } })}>Gdy agent czeka na odpowiedź dłużej niż 15 s</Toggle>
        <Toggle label="Skończył" checked={draft.notifications.done}
          onChange={on => set({ notifications: { ...draft.notifications, done: on } })}>Po turze dłuższej niż 2 minuty</Toggle>
        <Toggle label="Limit" checked={draft.notifications.limits}
          onChange={on => set({ notifications: { ...draft.notifications, limits: on } })}>Gdy zużycie limitu przekroczy 90%</Toggle>
        <Toggle label="Uruchamiaj z Windows" checked={draft.autostart} onChange={on => set({ autostart: on })}>
          Zwierzaki pojawią się po zalogowaniu
        </Toggle>
      </section>}

      {cur === 'look' && <section className="card look">
        <MotionSwitch motion={draft.pets.motion} onPick={m => set({ pets: { ...draft.pets, motion: m } })} />
        <LookGallery compact style={draft.pets.style} motion={draft.pets.motion} scene="edit" onPick={st => set({ pets: { ...draft.pets, style: st } })} />
      </section>}

      <footer>
        <button type="button" disabled={step === 0} onClick={() => setStep(s => s - 1)}>Wstecz</button>
        {step < WIZARD_STEPS.length - 1
          ? <button type="button" className="accent" onClick={() => setStep(s => s + 1)}>Dalej</button>
          : <button type="button" className="accent" disabled={busy} onClick={() => void finish()}>Zakończ</button>}
      </footer>
    </main>
  );
}
