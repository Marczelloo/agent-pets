import { useState } from 'react';
import { MOTION_IDS, MOTION_LABEL, STYLE_IDS, STYLE_LABEL, lookFor, withOverride } from '../../look';
import type { SceneKey } from '../../stage/sceneFor';
import type { AppId, Look, MotionId, Pets, StyleId } from '../../types';
import { APP_LABEL } from '../model';
import { LookGallery } from './LookGallery';
import { PetsCanvas } from './PetsCanvas';

const SCENES: [SceneKey, string][] = [['edit', 'Pracuje'], ['needs', 'Czeka'], ['done', 'Gotowe'], ['sleep', 'Śpi'], ['error', 'Błąd']];
const APPS: AppId[] = ['claude_code', 'codex', 'agent_router'];

export function MotionSwitch({ motion, onPick }: { motion: MotionId; onPick: (m: MotionId) => void }) {
  return (
    <div className="segmented" role="radiogroup" aria-label="Ruch">
      {MOTION_IDS.map(m => (
        <button type="button" key={m} role="radio" aria-checked={motion === m} className={motion === m ? 'on' : ''} onClick={() => onPick(m)}>
          {MOTION_LABEL[m]}
        </button>
      ))}
    </div>
  );
}

/** Zakładka „Wygląd”: ruch, scena podglądu, galeria stylów, pasek w prawdziwym rozmiarze, nadpisania per agent. */
export function LookTab({ pets, onChange }: { pets: Pets; onChange: (p: Pets) => void }) {
  const [scene, setScene] = useState<SceneKey>('edit');
  const pick = (app: AppId, field: keyof Look, v: string) =>
    onChange(withOverride(pets, app, field, v === '' ? null : v as StyleId | MotionId));
  return <>
    <section className="card look-top">
      <div className="row">
        <span className="text"><span className="label">Ruch</span>
          <span className="desc">Anime: szybciej, sprężyście, ze smugami i efektami</span></span>
        <MotionSwitch motion={pets.motion} onPick={m => onChange({ ...pets, motion: m })} />
      </div>
      <div className="chips" role="radiogroup" aria-label="Scena podglądu">
        {SCENES.map(([k, l]) => (
          <button type="button" key={k} role="radio" aria-checked={scene === k} className={scene === k ? 'on' : ''} onClick={() => setScene(k)}>{l}</button>
        ))}
      </div>
      <LookGallery style={pets.style} motion={pets.motion} scene={scene} onPick={s => onChange({ ...pets, style: s })} />
      <p className="label strip-label">Tak wygląda w pasku</p>
      <PetsCanvas className="taskbar" scene={scene} u={0.3} width={330} height={48}
        pets={APPS.map(a => ({ agent: a === 'claude_code' ? 'claude' : 'codex', look: lookFor(pets, a) }))} />
    </section>
    <details className="card overrides">
      <summary>Osobno dla agentów</summary>
      {APPS.map(a => {
        const o = pets.overrides?.[a] ?? {};
        return (
          <div className="row" key={a}>
            <span className="text"><span className="label">{APP_LABEL[a]}</span></span>
            <span className="pair">
              <select aria-label={`${APP_LABEL[a]}: styl`} value={o.style ?? ''} onChange={e => pick(a, 'style', e.target.value)}>
                <option value="">Jak domyślny</option>
                {STYLE_IDS.map(id => <option key={id} value={id}>{STYLE_LABEL[id]}</option>)}
              </select>
              <select aria-label={`${APP_LABEL[a]}: ruch`} value={o.motion ?? ''} onChange={e => pick(a, 'motion', e.target.value)}>
                <option value="">Jak domyślny</option>
                {MOTION_IDS.map(id => <option key={id} value={id}>{MOTION_LABEL[id]}</option>)}
              </select>
            </span>
          </div>
        );
      })}
    </details>
  </>;
}
