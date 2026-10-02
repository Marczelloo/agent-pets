import { useState, type CSSProperties } from 'react';
import { MOTION_IDS, STYLE_IDS, lookFor, withOverride } from '../../look';
import type { SceneKey } from '../../stage/sceneFor';
import type { Agent, AppId, Look, MotionId, Pets, StyleId } from '../../types';
import { appLabel } from '../model';
import { t } from '../../i18n';
import { LookGallery } from './LookGallery';
import { PreviewStage } from './PreviewStage';
import { BubblePreview } from './BubblePreview';
import { PetsCanvas } from './PetsCanvas';
import { Row, Section, Segmented, Select, Switch } from '../ui';
import { accentFor } from '../../stage/sceneFor';
import { SLOT } from '../../stage/layout';

const APPS: AppId[] = ['claude_code', 'codex', 'agent_router', 'opencode', 'copilot', 'antigravity', 'cursor', 'grok', 'zcode'];
/** Pets available in preview: every mascot and a blob for agents without one. */
export const PREVIEW_AGENTS: Agent[] = ['claude', 'codex', 'opencode', 'copilot', 'antigravity', 'cursor', 'grok', 'zcode', 'other'];
const petName = (a: Agent) => (a === 'other' ? t().look.otherPet : t().agent[a]);

export function PetPicker({ agent, onPick }: { agent: Agent; onPick: (a: Agent) => void }) {
  return (
    <div className="pet-tiles" role="radiogroup" aria-label={t().look.previewPet}>
      {PREVIEW_AGENTS.map(a => (
        <button type="button" key={a} role="radio" aria-checked={agent === a} className={agent === a ? 'on' : ''}
          style={{ '--sw': accentFor({ agent: a, agent_name: null }) } as CSSProperties} onClick={() => onPick(a)}>{petName(a)}</button>
      ))}
    </div>
  );
}

export function MotionSwitch({ motion, onPick }: { motion: MotionId; onPick: (m: MotionId) => void }) {
  return <Segmented aria-label={t().look.motionTitle} value={motion} onChange={onPick}
    options={MOTION_IDS.map(m => ({ value: m, label: t().look.motion[m] }))} />;
}

/** Appearance tab: preview stage, style gallery, motion, bubbles, taskbar at actual size, per-agent overrides, media reaction. */
export function LookTab({ pets, onChange }: { pets: Pets; onChange: (p: Pets) => void }) {
  const [scene, setScene] = useState<SceneKey>('edit');
  const [cycle, setCycle] = useState(false);
  const [agent, setAgent] = useState<Agent>('claude');
  const pick = (app: AppId, field: keyof Look, v: string) =>
    onChange(withOverride(pets, app, field, v === '' ? null : v as StyleId | MotionId));
  const look = { style: pets.style, motion: pets.motion };
  return <>
    <Section title={t().look.previewTitle}>
      <PetPicker agent={agent} onPick={setAgent} />
      <PreviewStage look={look} agent={agent} scene={scene} cycle={cycle} onScene={setScene} onCycle={setCycle} />
    </Section>
    <Section title={t().look.styleTitle}>
      <LookGallery style={pets.style} motion={pets.motion} scene={scene} agent={agent} onPick={s => onChange({ ...pets, style: s })} />
    </Section>
    <Section title={t().look.motionTitle}>
      <Row label={t().look.motionRow} hint={t().look.motionDesc} control={<MotionSwitch motion={pets.motion} onPick={m => onChange({ ...pets, motion: m })} />} />
    </Section>
    <Section title={t().look.bubblesTitle} note={t().look.bubblesDesc}>
      <BubblePreview look={look} agent={agent} />
    </Section>
    <Section title={t().look.taskbar}>
      <div className="taskbar-scroll"><PetsCanvas className="taskbar" scene={scene} u={0.3} width={SLOT * APPS.length} height={48}
        pets={APPS.map(a => ({ agent: a === 'claude_code' ? 'claude' : a === 'agent_router' ? 'codex' : a, look: lookFor(pets, a) }))} /></div>
    </Section>
    <Section title={t().look.ambientTitle} note={t().look.ambientNote}>
      <Row label={t().look.mediaTitle} hint={t().look.mediaDesc}
        control={<Switch checked={pets.react_to_media !== false} onChange={on => onChange({ ...pets, react_to_media: on })} aria-label={t().look.mediaTitle} />} />
    </Section>
    <Section title={t().look.perAgent}>
      <details className="overrides">
        <summary>{t().look.perAgentOpen}</summary>
        {APPS.map(a => {
          const o = pets.overrides?.[a] ?? {};
          return (
            <Row key={a} label={appLabel(a)} control={<>
              <Select aria-label={t().look.styleField(appLabel(a))} value={o.style ?? ''} onChange={v => pick(a, 'style', v)}
                options={[{ value: '', label: t().look.sameDefault }, ...STYLE_IDS.map(id => ({ value: id, label: t().look.style[id] }))]} />
              <Select aria-label={t().look.motionField(appLabel(a))} value={o.motion ?? ''} onChange={v => pick(a, 'motion', v)}
                options={[{ value: '', label: t().look.sameDefault }, ...MOTION_IDS.map(id => ({ value: id, label: t().look.motion[id] }))]} />
            </>} />
          );
        })}
      </details>
    </Section>
  </>;
}
