import { useEffect, useState } from 'react';
import { PetCanvas } from '../panel/PetCanvas';
import { STYLE_IDS, STYLE_LABEL } from '../look';
import { pen } from '../renderer';
import type { AppRow, Session, Settings } from '../types';
import { APP_HINT, APP_LABEL, WIZARD_STEPS, defaultAppChoice, type WizardStep } from './model';
import { Toggle } from './Toggle';

const TITLE: Record<WizardStep, string> = {
  apps: 'Dla których aplikacji mają być zwierzaki?',
  limits: 'Limity Claude\'a z godzinami resetu',
  notify: 'Powiadomienia i uruchamianie',
  look: 'Wygląd zwierzaków',
};

const preview = (agent: 'claude' | 'codex'): Session => ({
  id: `preview-${agent}`, agent, origin: 'cli', title: '', cwd: '', state: 'working', tool: agent === 'claude' ? 'edit' : 'bash',
  progress: null, context: null, started_at: 0, last_activity: 0, state_since: 0, turn_started_at: null,
  jump: { pid: null, session_id: '', cwd: '', app: null }, router_task: null,
});

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

  useEffect(() => { pen.sketch = draft.pets.style === 'sketch'; }, [draft.pets.style]);

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
        <div className="skins" role="radiogroup" aria-label="Skórka">
          {STYLE_IDS.map(k => (
            <label key={k} className={`skin${draft.pets.style === k ? ' on' : ''}`}>
              <input type="radio" name="skin" checked={draft.pets.style === k} onChange={() => set({ pets: { ...draft.pets, style: k } })} />
              {STYLE_LABEL[k]}
            </label>
          ))}
        </div>
        <div className="preview" key={draft.pets.style}>
          <PetCanvas session={preview('claude')} />
          <PetCanvas session={preview('codex')} />
        </div>
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
