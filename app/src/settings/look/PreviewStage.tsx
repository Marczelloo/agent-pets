import { useEffect } from 'react';
import { t } from '../../i18n';
import type { SceneKey } from '../../stage/sceneFor';
import type { Look } from '../../types';
import { PetsCanvas } from './PetsCanvas';
import { CYCLE_MS, PREVIEW_GROUPS, cycleScene } from './scenes';

interface Props { look: Look; scene: SceneKey; cycle: boolean; onScene: (s: SceneKey) => void; onCycle: (on: boolean) => void }

/** Duży podgląd Clawda i Kodka z wyborem każdej animacji albo wszystkich po kolei. */
export function PreviewStage({ look, scene, cycle, onScene, onCycle }: Props) {
  useEffect(() => {
    if (!cycle) return;
    const id = setInterval(() => onScene(cycleScene(scene, document.hidden)), CYCLE_MS);
    return () => clearInterval(id);
  }, [cycle, scene, onScene]);

  return <>
    <PetsCanvas className="preview-stage" scene={scene} u={0.7} width={460} height={150}
      pets={[{ agent: 'claude', look }, { agent: 'codex', look }]} />
    <div className="scene-picker" role="radiogroup" aria-label={t().look.previewScene}>
      <button type="button" role="radio" aria-checked={cycle} className={`chip-all${cycle ? ' on' : ''}`} onClick={() => onCycle(!cycle)}>
        {t().look.allInOrder}
      </button>
      {PREVIEW_GROUPS.map(g => (
        <div className="chip-group" key={g.id}>
          <span className="desc">{t().look.groups[g.id]}</span>
          {g.scenes.map(k => (
            <button type="button" key={k} role="radio" aria-checked={!cycle && scene === k} className={scene === k ? (cycle ? 'playing' : 'on') : ''}
              onClick={() => { onCycle(false); onScene(k); }}>{t().look.sceneName[k]}</button>
          ))}
        </div>
      ))}
    </div>
  </>;
}
