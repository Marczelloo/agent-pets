import { useEffect } from 'react';
import { t } from '../../i18n';
import type { SceneKey } from '../../stage/sceneFor';
import type { Agent, Look } from '../../types';
import { Row, Segmented, Switch } from '../ui';
import { PetsCanvas } from './PetsCanvas';
import { CYCLE_MS, SCENE_GROUPS, cycleScene } from './scenes';

interface Props { look: Look; agent: Agent; scene: SceneKey; cycle: boolean; onScene: (s: SceneKey) => void; onCycle: (on: boolean) => void }

/** Large preview of the selected pet with a choice of each animation (three groups) or all in sequence. */
export function PreviewStage({ look, agent, scene, cycle, onScene, onCycle }: Props) {
  useEffect(() => {
    if (!cycle) return;
    const id = setInterval(() => onScene(cycleScene(scene, document.hidden)), CYCLE_MS);
    return () => clearInterval(id);
  }, [cycle, scene, onScene]);

  return <>
    <PetsCanvas key={agent} className="preview-stage" scene={scene} u={0.8} width={640} height={170} pets={[{ agent, look }]} />
    <Row label={t().look.allInOrder} control={<Switch checked={cycle} onChange={onCycle} aria-label={t().look.allInOrder} />} />
    <div className="scene-picker">
      {SCENE_GROUPS.map(g => (
        <div className="scene-group" key={g.id}>
          <span className="ui-hint">{t().look.groups[g.id]}</span>
          <Segmented wrap aria-label={t().look.groups[g.id]} value={!cycle && g.scenes.includes(scene) ? scene : ('' as SceneKey)}
            onChange={k => { onCycle(false); onScene(k); }}
            options={g.scenes.map(k => ({ value: k, label: t().look.sceneName[k], playing: cycle && scene === k }))} />
        </div>
      ))}
    </div>
  </>;
}
