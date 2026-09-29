import { useState } from 'react';
import { MOTION_IDS, STYLE_IDS, lookFor, withOverride } from '../../look';
import type { SceneKey } from '../../stage/sceneFor';
import type { Agent, AppId, Look, MotionId, Pets, StyleId } from '../../types';
import { appLabel } from '../model';
import { t } from '../../i18n';
import { LookGallery } from './LookGallery';
import { PreviewStage } from './PreviewStage';
import { BubblePreview } from './BubblePreview';
import { PetsCanvas } from './PetsCanvas';
import { Toggle } from '../Toggle';

const APPS: AppId[] = ['claude_code', 'codex', 'agent_router', 'opencode', 'copilot', 'antigravity', 'cursor', 'grok', 'zcode'];
/** Pets available in preview: every mascot and a blob for agents without one. */
export const PREVIEW_AGENTS: Agent[] = ['claude', 'codex', 'opencode', 'copilot', 'antigravity', 'cursor', 'grok', 'zcode', 'other'];
const petName = (a: Agent) => (a === 'other' ? t().look.otherPet : t().agent[a]);

export function PetPicker({ agent, onPick }: { agent: Agent; onPick: (a: Agent) => void }) {
  return (
    <div className="segmented" role="radiogroup" aria-label={t().look.previewPet}>
      {PREVIEW_AGENTS.map(a => (
        <button type="button" key={a} role="radio" aria-checked={agent === a} className={agent === a ? 'on' : ''} onClick={() => onPick(a)}>{petName(a)}</button>
      ))}
    </div>
  );
}

export function MotionSwitch({ motion, onPick }: { motion: MotionId; onPick: (m: MotionId) => void }) {
  return (
    <div className="segmented" role="radiogroup" aria-label={t().look.motionTitle}>
      {MOTION_IDS.map(m => (
        <button type="button" key={m} role="radio" aria-checked={motion === m} className={motion === m ? 'on' : ''} onClick={() => onPick(m)}>
          {t().look.motion[m]}
        </button>
      ))}
    </div>
  );
}

/** Appearance tab: motion, preview scene, style gallery, taskbar at actual size, per-agent overrides. */
export function LookTab({ pets, onChange }: { pets: Pets; onChange: (p: Pets) => void }) {
  const [scene, setScene] = useState<SceneKey>('edit');
  const [cycle, setCycle] = useState(false);
  const [agent, setAgent] = useState<Agent>('claude');
  const pick = (app: AppId, field: keyof Look, v: string) =>
    onChange(withOverride(pets, app, field, v === '' ? null : v as StyleId | MotionId));
  return <>
    <section className="card look-top">
      <div className="row">
        <span className="text"><span className="label">{t().look.motionTitle}</span>
          <span className="desc">{t().look.motionDesc}</span></span>
        <MotionSwitch motion={pets.motion} onPick={m => onChange({ ...pets, motion: m })} />
      </div>
      <div className="row">
        <span className="text"><span className="label">{t().look.previewPet}</span></span>
        <PetPicker agent={agent} onPick={setAgent} />
      </div>
      <PreviewStage look={{ style: pets.style, motion: pets.motion }} agent={agent} scene={scene} cycle={cycle} onScene={setScene} onCycle={setCycle} />
      <div className="row">
        <span className="text"><span className="label">{t().look.bubblesTitle}</span>
          <span className="desc">{t().look.bubblesDesc}</span></span>
      </div>
      <BubblePreview look={{ style: pets.style, motion: pets.motion }} agent={agent} />
      <LookGallery style={pets.style} motion={pets.motion} scene={scene} agent={agent} onPick={s => onChange({ ...pets, style: s })} />
      <p className="label strip-label">{t().look.taskbar}</p>
      <PetsCanvas className="taskbar" scene={scene} u={0.3} width={330} height={48}
        pets={APPS.map(a => ({ agent: a === 'claude_code' ? 'claude' : a === 'agent_router' ? 'codex' : a, look: lookFor(pets, a) }))} />
    </section>
    <details className="card overrides">
      <summary>{t().look.perAgent}</summary>
      {APPS.map(a => {
        const o = pets.overrides?.[a] ?? {};
        return (
          <div className="row" key={a}>
            <span className="text"><span className="label">{appLabel(a)}</span></span>
            <span className="pair">
              <select aria-label={t().look.styleField(appLabel(a))} value={o.style ?? ''} onChange={e => pick(a, 'style', e.target.value)}>
                <option value="">{t().look.sameDefault}</option>
                {STYLE_IDS.map(id => <option key={id} value={id}>{t().look.style[id]}</option>)}
              </select>
              <select aria-label={t().look.motionField(appLabel(a))} value={o.motion ?? ''} onChange={e => pick(a, 'motion', e.target.value)}>
                <option value="">{t().look.sameDefault}</option>
                {MOTION_IDS.map(id => <option key={id} value={id}>{t().look.motion[id]}</option>)}
              </select>
            </span>
          </div>
        );
      })}
    </details>
    <section className="card">
      <Toggle label={t().look.mediaTitle} checked={pets.react_to_media !== false} onChange={on => onChange({ ...pets, react_to_media: on })}>
        {t().look.mediaDesc}
      </Toggle>
    </section>
  </>;
}
