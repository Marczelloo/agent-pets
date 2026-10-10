import { defaultStage } from '../look';
import { t } from '../i18n';
import { onLinux } from '../platform';
import type { MonitorInfo, Settings, StageAlign, StageBackground, StageOrder, StagePosition, StageSettings } from '../types';
import { clampMaxVisible } from './model';
import { OptionCards, Row, Section, Segmented, Select, Stepper, Switch } from './ui';

const POSITIONS: StagePosition[] = ['right', 'left', 'custom', 'floating'];
const BACKGROUNDS: StageBackground['kind'][] = ['none', 'glass', 'solid'];
const ALIGNS: StageAlign[] = ['left', 'center', 'right'];
const ORDERS: StageOrder[] = ['start', 'attention', 'agent'];
/** Like core `SIZE_TASKBAR_MAX` and `SIZE`. */
const SIZE_MIN = 70, SIZE_TASKBAR = 100, SIZE_FLOAT = 300;
const DEFAULT_OPACITY = { none: 0, glass: 12, solid: 90 } as const;
const AUTO_COLOR = { glass: '#FFFFFF', solid: '#202020' } as const;

/** "Restore defaults" on the Taskbar tab: stage settings only (pet limit stays). */
export const resetStage = (s: Settings): Settings => ({ ...s, stage: defaultStage() });

/** Toggle from the "Bubbles and subagents" section. */
export function withBubbles(s: Settings, key: 'questions' | 'actions' | 'minis', on: boolean): Settings {
  const st = s.stage ?? defaultStage();
  return key === 'minis' ? { ...s, stage: { ...st, minis: on } } : { ...s, stage: { ...st, bubbles: { ...st.bubbles, [key]: on } } };
}

function Slider({ label, value, min, max, text, desc, onChange }: {
  label: string; value: number; min: number; max: number; text: (v: number) => string; desc?: React.ReactNode; onChange: (v: number) => void;
}) {
  return (
    <Row label={label} hint={desc} control={
      <span className="slider">
        <input type="range" min={min} max={max} value={value} aria-label={label} aria-valuetext={text(value)}
          onChange={e => onChange(Number(e.target.value))} />
        <output>{text(value)}</output>
      </span>} />
  );
}

/** On Linux there is no taskbar: the pets stand on the bottom edge of the screen. */
const POSITIONS_LINUX: StagePosition[] = ['right', 'left', 'floating'];

/** Positions on offer; on Linux `custom` only while it is the saved choice (e.g. from a Windows backup). */
const positionsFor = (current: StagePosition): StagePosition[] =>
  onLinux() ? (current === 'custom' ? POSITIONS : POSITIONS_LINUX) : POSITIONS;

/** Miniature of the screen: the taskbar along the bottom edge (none on Linux) and where the widget (accent) stands. */
function PositionPreview({ position }: { position: StagePosition }) {
  const linux = onLinux();
  const y = linux ? 30 : 29;
  const widget = {
    right: { x: linux ? 75 : 70, y, w: 18 }, left: { x: linux ? 3 : 6, y, w: 18 }, custom: { x: 30, y, w: 18 }, floating: { x: 52, y: 8, w: 24 },
  }[position];
  return (
    <svg viewBox="0 0 96 40" width="100%" height="44" role="presentation">
      <rect x="1" y="1" width="94" height="38" rx="4" fill="none" stroke="currentColor" strokeOpacity=".3" />
      {!linux && <rect x="2" y="27" width="92" height="11" rx="2" fill="currentColor" fillOpacity=".16" />}
      <rect x={widget.x} y={widget.y} width={widget.w} height={position === 'floating' ? 14 : 8} rx="2" fill="var(--accent)"
        strokeDasharray={position === 'custom' ? '3 2' : undefined} stroke={position === 'custom' ? 'currentColor' : undefined} />
      {position === 'custom' && <path d="M26 33h-5m5 0l-2-2m2 2l-2 2M52 33h5m-5 0l2-2m-2 2l2 2" stroke="currentColor" strokeWidth="1" fill="none" />}
    </svg>
  );
}

interface Props {
  settings: Settings;
  monitors: MonitorInfo[];
  /** left-side mode with no room on the left (icons left-aligned): stage stays near the tray */
  leftFallback: boolean;
  /** the taskbar is docked to the left or right edge: the stage floats beside it */
  verticalBar?: boolean;
  onChange: (s: Settings) => void;
  onMove: () => void;
}

/** Taskbar tab: position, monitor, background, size, spacing, alignment, order, and visible items. */
export function StageTab({ settings: s, monitors, leftFallback, verticalBar = false, onChange, onMove }: Props) {
  const st = s.stage;
  const x = t().stage;
  const linux = onLinux();
  const set = (patch: Partial<StageSettings>) => onChange({ ...s, stage: { ...st, ...patch } });
  const setBg = (patch: Partial<StageBackground>) => set({ background: { ...st.background, ...patch } });
  const floating = st.position === 'floating';
  const sizeMax = floating ? SIZE_FLOAT : SIZE_TASKBAR;
  const size = Math.min(Math.max(st.size, SIZE_MIN), sizeMax);
  const alignFixed = st.position === 'right' || st.position === 'left';
  const bg = st.background;
  const pct = (v: number) => `${v}%`;
  const chosen = monitors.find(m => m.id === st.monitor);
  const unplugged = st.monitor !== 'primary' && !chosen;

  const seg = <T extends string>(label: string, value: T, ids: T[], names: Record<T, string>, onPick: (v: T) => void, disabled?: boolean) =>
    <Segmented aria-label={label} value={value} disabled={disabled} onChange={onPick} options={ids.map(id => ({ value: id, label: names[id] }))} />;
  const show = (key: keyof StageSettings['show'], label: string, hint: string) =>
    <Row label={label} hint={hint} control={<Switch checked={st.show[key]} aria-label={label} onChange={on => set({ show: { ...st.show, [key]: on } })} />} />;
  const bubble = (key: 'questions' | 'actions' | 'minis', checked: boolean, label: string, hint: string) =>
    <Row label={label} hint={hint} control={<Switch checked={checked} aria-label={label} onChange={on => onChange(withBubbles(s, key, on))} />} />;

  return (
    <>
      <Section title={x.where} note={x.positionDesc}>
        <OptionCards aria-label={x.position} value={st.position} onChange={p => set({ position: p })}
          options={positionsFor(st.position).map(p => ({ value: p, label: x.pos[p], preview: <PositionPreview position={p} /> }))} />
        {st.position === 'custom' && <Row label={x.moveTitle} hint={x.moveDesc} control={<button type="button" onClick={onMove}>{x.move}</button>} />}
        {!linux && verticalBar && st.position !== 'floating' && <p className="ui-note" role="status">{x.verticalBar}</p>}
        {!linux && st.position === 'left' && leftFallback && <p className="ui-note" role="status">{x.leftFallback}</p>}
        <Row label={x.monitor} control={
          <Select aria-label={x.monitor} value={st.monitor} onChange={v => set({ monitor: v })}
            options={[{ value: 'primary', label: x.primary },
              ...monitors.map(m => ({ value: m.id, label: x.monitorName(m.index, m.width, m.height, m.primary) })),
              ...(unplugged ? [{ value: st.monitor, label: x.unplugged }] : [])]} />} />
        {unplugged && <p className="ui-note" role="status">{x.unpluggedDesc}</p>}
        {!linux && chosen && !chosen.has_bar && !floating && <p className="ui-note" role="status">{x.noBar}</p>}
      </Section>

      <Section title={x.window}>
        <Row label={x.background} control={seg(x.background, bg.kind, BACKGROUNDS, x.bg, k => setBg({ kind: k, opacity: null }))} />
        {bg.kind !== 'none' && <>
          <Row label={x.color} control={<span className="color">
            {bg.kind === 'glass' && <label className="check"><input type="checkbox" checked={!bg.color}
              onChange={e => setBg({ color: e.target.checked ? null : AUTO_COLOR.glass })} />{x.colorAuto}</label>}
            <input type="color" aria-label={x.color} value={bg.color ?? AUTO_COLOR[bg.kind]} disabled={bg.kind === 'glass' && !bg.color}
              onChange={e => setBg({ color: e.target.value.toUpperCase() })} />
          </span>} />
          <Slider label={x.opacity} value={bg.opacity ?? DEFAULT_OPACITY[bg.kind]} min={0} max={100} text={pct} onChange={v => setBg({ opacity: v })} />
          <Slider label={x.radius} value={bg.radius} min={0} max={24} text={x.px} onChange={v => setBg({ radius: v })} />
        </>}
      </Section>

      <Section title={x.pets}>
        <Slider label={x.size} value={size} min={SIZE_MIN} max={sizeMax} text={pct} onChange={v => set({ size: v })}
          desc={!floating && st.size > SIZE_TASKBAR ? x.sizeFloatOnly : x.sizeDesc} />
        <Slider label={x.gap} value={st.gap} min={0} max={30} text={x.px} onChange={v => set({ gap: v })} />
        <Slider label={x.padding} value={st.padding} min={0} max={24} text={x.px} onChange={v => set({ padding: v })} />
        <Row label={t().settings.maxVisible} hint={t().settings.maxVisibleDesc} control={
          <Stepper aria-label={t().settings.maxVisible} min={1} max={8} value={s.pets.max_visible}
            onChange={n => onChange({ ...s, pets: { ...s.pets, max_visible: clampMaxVisible(n) } })} />} />
        <Row label={x.align} hint={alignFixed ? x.alignFixed : x.alignDesc} dim={alignFixed} control={
          seg(x.align, st.position === 'left' ? 'left' : st.position === 'right' ? 'right' : st.align, ALIGNS, x.alignment, a => set({ align: a }), alignFixed)} />
        <Row label={x.order} control={seg(x.order, st.order, ORDERS, x.orders, o => set({ order: o }))} />
      </Section>

      <Section title={x.elements}>
        {show('progress', x.progress, x.progressDesc)}
        {show('limits', x.limits, x.limitsDesc)}
        {show('badge', x.badge, x.badgeDesc)}
      </Section>

      <Section title={x.bubblesTitle}>
        {bubble('questions', st.bubbles.questions, x.bubbleQuestions, x.bubbleQuestionsDesc)}
        {bubble('actions', st.bubbles.actions, x.bubbleActions, x.bubbleActionsDesc)}
        {bubble('minis', st.minis, x.minis, x.minisDesc)}
      </Section>
      <button type="button" className="link-btn" onClick={() => onChange(resetStage(s))}>{x.reset}</button>
    </>
  );
}
