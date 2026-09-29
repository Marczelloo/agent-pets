import { reducedMotion } from '../stage/power';
import type { Pets, StatsLane, StatsRace } from '../types';
import { COUNT_MS, countUp } from './count';
import { agentName, projectName } from './model';
import { StatPet } from './StatPet';

export interface RaceProps {
  lanes: StatsLane[]; race: StatsRace; format: (v: number) => string; pets: Pets;
  /** time since bar animation began (ms); Infinity = bars fill immediately */
  elapsed: number;
  animate: boolean;
}

/** Race: a bar grows to its value with the agent's pet running at its end. */
export function Race({ lanes, race, format, pets, elapsed, animate }: RaceProps) {
  const max = Math.max(1, ...lanes.map(l => l.value));
  const reduced = reducedMotion();
  return <>
    {lanes.map(l => {
      const w = (countUp(l.value, elapsed, COUNT_MS, reduced) / max) * 100;
      return <div className="lane" key={l.key}>
        <span className="nm">{race === 'agents' && l.agent ? agentName(l.agent) : projectName(l.key)}</span>
        <div className="trk">
          <i className={`bar ${l.agent ?? ''}`} style={{ width: `${w}%` }} />
          <div className="runner" style={{ left: `calc(${w}% - 18px)` }}>
            <StatPet agent={l.agent ?? 'claude'} scene="run" w={36} h={30} u={0.18} pets={pets} animate={animate} />
          </div>
        </div>
        <span className="t">{format(l.value)}</span>
      </div>;
    })}
  </>;
}
