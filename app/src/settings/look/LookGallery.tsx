import { STYLE_IDS, STYLE_LABEL } from '../../look';
import type { SceneKey } from '../../stage/sceneFor';
import type { MotionId, StyleId } from '../../types';
import { PetsCanvas } from './PetsCanvas';

interface Props { style: StyleId; motion: MotionId; scene: SceneKey; compact?: boolean; onPick: (s: StyleId) => void }

/** Karty stylów z żywym Clawdem i Kodkiem; kliknięcie wybiera styl. */
export function LookGallery({ style, motion, scene, compact, onPick }: Props) {
  const [w, h, u] = compact ? [124, 60, 0.3] : [140, 72, 0.34];
  return (
    <div className={`gallery${compact ? ' compact' : ''}`} role="radiogroup" aria-label="Styl">
      {STYLE_IDS.map(id => (
        <button type="button" key={id} role="radio" aria-checked={style === id} className={`look-card${style === id ? ' on' : ''}`} onClick={() => onPick(id)}>
          <PetsCanvas pets={[{ agent: 'claude', look: { style: id, motion } }, { agent: 'codex', look: { style: id, motion } }]} scene={scene} u={u} width={w} height={h} />
          <span>{STYLE_LABEL[id]}</span>
        </button>
      ))}
    </div>
  );
}
