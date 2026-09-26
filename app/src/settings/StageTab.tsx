import { defaultStage } from '../look';
import { t } from '../i18n';
import type { MonitorInfo, Settings, StageAlign, StageBackground, StageOrder, StagePosition, StageSettings } from '../types';
import { clampMaxVisible } from './model';
import { Toggle } from './Toggle';

const POSITIONS: StagePosition[] = ['right', 'left', 'custom', 'floating'];
const BACKGROUNDS: StageBackground['kind'][] = ['none', 'glass', 'solid'];
const ALIGNS: StageAlign[] = ['left', 'center', 'right'];
const ORDERS: StageOrder[] = ['start', 'attention', 'agent'];
/** Jak `SIZE_TASKBAR_MAX` i `SIZE` w rdzeniu. */
const SIZE_MIN = 70, SIZE_TASKBAR = 120, SIZE_FLOAT = 300;
const DEFAULT_OPACITY = { none: 0, glass: 12, solid: 90 } as const;
const AUTO_COLOR = { glass: '#FFFFFF', solid: '#202020' } as const;

/** „Przywróć domyślne” w karcie „Pasek”: tylko ustawienia sceny (limit zwierzaków zostaje). */
export const resetStage = (s: Settings): Settings => ({ ...s, stage: defaultStage() });

function Segmented<T extends string>({ label, value, options, names, disabled, onPick }: {
  label: string; value: T; options: T[]; names: Record<T, string>; disabled?: boolean; onPick: (v: T) => void;
}) {
  return (
    <div className="segmented" role="radiogroup" aria-label={label} aria-disabled={disabled || undefined}>
      {options.map(o => (
        <button type="button" key={o} role="radio" aria-checked={value === o} className={value === o ? 'on' : ''} disabled={disabled}
          onClick={() => onPick(o)}>{names[o]}</button>
      ))}
    </div>
  );
}

function Slider({ label, value, min, max, text, desc, onChange }: {
  label: string; value: number; min: number; max: number; text: (v: number) => string; desc?: React.ReactNode; onChange: (v: number) => void;
}) {
  return (
    <label className="row">
      <span className="text"><span className="label">{label}</span>{desc && <span className="desc">{desc}</span>}</span>
      <span className="slider">
        <input type="range" min={min} max={max} value={value} aria-label={label} aria-valuetext={text(value)}
          onChange={e => onChange(Number(e.target.value))} />
        <output>{text(value)}</output>
      </span>
    </label>
  );
}

interface Props {
  settings: Settings;
  monitors: MonitorInfo[];
  /** tryb „po lewej” bez miejsca po lewej (ikony wyrównane do lewej): scena stoi przy zasobniku */
  leftFallback: boolean;
  onChange: (s: Settings) => void;
  onMove: () => void;
}

/** Karta „Pasek”: pozycja, monitor, tło, rozmiar, odstępy, wyrównanie, kolejność i widoczne elementy. */
export function StageTab({ settings: s, monitors, leftFallback, onChange, onMove }: Props) {
  const st = s.stage;
  const x = t().stage;
  const set = (patch: Partial<StageSettings>) => onChange({ ...s, stage: { ...st, ...patch } });
  const setBg = (patch: Partial<StageBackground>) => set({ background: { ...st.background, ...patch } });
  const floating = st.position === 'floating';
  const sizeMax = floating ? SIZE_FLOAT : SIZE_TASKBAR;
  const size = Math.min(Math.max(st.size, SIZE_MIN), sizeMax);
  const alignFixed = st.position === 'right' || st.position === 'left';
  const bg = st.background;
  const pct = (v: number) => `${v}%`;
  const known = monitors.some(m => m.id === st.monitor);

  return (
    <>
      <h3>{x.where}</h3>
      <section className="card">
        <div className="row">
          <span className="text"><span className="label">{x.position}</span>
            <span className="desc">{st.position === 'custom' ? x.moveDesc : x.positionDesc}</span></span>
          <Segmented label={x.position} value={st.position} options={POSITIONS} names={x.pos} onPick={p => set({ position: p })} />
        </div>
        {st.position === 'custom' && <div className="row">
          <span className="text" />
          <button type="button" onClick={onMove}>{x.move}</button>
        </div>}
        {st.position === 'left' && leftFallback && <p className="desc" role="status">{x.leftFallback}</p>}
        <div className="row">
          <span className="text"><span className="label">{x.monitor}</span></span>
          <select aria-label={x.monitor} value={known ? st.monitor : 'primary'} onChange={e => set({ monitor: e.target.value })}>
            <option value="primary">{x.primary}</option>
            {monitors.map(m => <option key={m.id} value={m.id}>{x.monitorName(m.index, m.width, m.height, m.primary)}</option>)}
          </select>
        </div>
      </section>

      <h3>{x.window}</h3>
      <section className="card">
        <div className="row">
          <span className="text"><span className="label">{x.background}</span></span>
          <Segmented label={x.background} value={bg.kind} options={BACKGROUNDS} names={x.bg} onPick={k => setBg({ kind: k, opacity: null })} />
        </div>
        {bg.kind !== 'none' && <>
          <div className="row">
            <span className="text"><span className="label">{x.color}</span></span>
            <span className="color">
              {bg.kind === 'glass' && <label className="check"><input type="checkbox" checked={!bg.color}
                onChange={e => setBg({ color: e.target.checked ? null : AUTO_COLOR.glass })} />{x.colorAuto}</label>}
              <input type="color" aria-label={x.color} value={bg.color ?? AUTO_COLOR[bg.kind]} disabled={bg.kind === 'glass' && !bg.color}
                onChange={e => setBg({ color: e.target.value.toUpperCase() })} />
            </span>
          </div>
          <Slider label={x.opacity} value={bg.opacity ?? DEFAULT_OPACITY[bg.kind]} min={0} max={100} text={pct} onChange={v => setBg({ opacity: v })} />
          <Slider label={x.radius} value={bg.radius} min={0} max={24} text={x.px} onChange={v => setBg({ radius: v })} />
        </>}
      </section>

      <h3>{x.pets}</h3>
      <section className="card">
        <Slider label={x.size} value={size} min={SIZE_MIN} max={sizeMax} text={pct} onChange={v => set({ size: v })}
          desc={!floating && size > 100 ? x.sizeClip : x.sizeDesc} />
        <Slider label={x.gap} value={st.gap} min={0} max={30} text={x.px} onChange={v => set({ gap: v })} />
        <Slider label={x.padding} value={st.padding} min={0} max={24} text={x.px} onChange={v => set({ padding: v })} />
        <div className="row">
          <span className="text"><span className="label">{t().settings.maxVisible}</span>
            <span className="desc">{t().settings.maxVisibleDesc}</span></span>
          <input type="number" min={1} max={8} aria-label={t().settings.maxVisible} value={s.pets.max_visible}
            onChange={e => onChange({ ...s, pets: { ...s.pets, max_visible: clampMaxVisible(Number(e.target.value)) } })} />
        </div>
        <div className={`row${alignFixed ? ' off' : ''}`}>
          <span className="text"><span className="label">{x.align}</span>
            <span className="desc">{alignFixed ? x.alignFixed : x.alignDesc}</span></span>
          <Segmented label={x.align} value={st.position === 'left' ? 'left' : st.position === 'right' ? 'right' : st.align}
            options={ALIGNS} names={x.alignment} disabled={alignFixed} onPick={a => set({ align: a })} />
        </div>
        <div className="row">
          <span className="text"><span className="label">{x.order}</span></span>
          <select aria-label={x.order} value={st.order} onChange={e => set({ order: e.target.value as StageOrder })}>
            {ORDERS.map(o => <option key={o} value={o}>{x.orders[o]}</option>)}
          </select>
        </div>
      </section>

      <h3>{x.elements}</h3>
      <section className="card">
        <Toggle label={x.progress} checked={st.show.progress} onChange={on => set({ show: { ...st.show, progress: on } })}>{x.progressDesc}</Toggle>
        <Toggle label={x.limits} checked={st.show.limits} onChange={on => set({ show: { ...st.show, limits: on } })}>{x.limitsDesc}</Toggle>
        <Toggle label={x.badge} checked={st.show.badge} onChange={on => set({ show: { ...st.show, badge: on } })}>{x.badgeDesc}</Toggle>
      </section>
      <button type="button" className="reset" onClick={() => onChange(resetStage(s))}>{x.reset}</button>
    </>
  );
}
