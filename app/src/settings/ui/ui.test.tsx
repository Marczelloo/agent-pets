import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { OptionCards, Row, Section, Segmented, Select, Stepper, Switch } from './index';
import { clampStep } from './clamp';
import { nextIndex } from './radio';

const noop = () => {};

describe('clampStep', () => {
  it('falls back on empty or non-numeric input and clamps to the range', () => {
    expect(clampStep('', 1, 8, 5)).toBe(5);
    expect(clampStep('abc', 1, 8, 5)).toBe(5);
    expect(clampStep('0', 1, 8, 5)).toBe(1);
    expect(clampStep('99', 1, 8, 5)).toBe(8);
    expect(clampStep(3.6, 1, 8, 5)).toBe(4);
    expect(clampStep(' 7 ', 1, 8, 5)).toBe(7);
    expect(clampStep(NaN, 1, 8, 5)).toBe(5);
  });
});

describe('nextIndex', () => {
  it('moves with arrow keys, wraps at both ends and ignores other keys', () => {
    expect(nextIndex('ArrowRight', 0, 3)).toBe(1);
    expect(nextIndex('ArrowDown', 2, 3)).toBe(0);
    expect(nextIndex('ArrowLeft', 0, 3)).toBe(2);
    expect(nextIndex('ArrowUp', 1, 3)).toBe(0);
    expect(nextIndex('Home', 2, 3)).toBe(0);
    expect(nextIndex('End', 0, 3)).toBe(2);
    expect(nextIndex('a', 1, 3)).toBeNull();
  });
});

describe('Segmented', () => {
  const html = renderToString(<Segmented aria-label="Theme" value="b" onChange={noop}
    options={[{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }]} />);
  it('is a radiogroup with the selected option marked and only it tabbable', () => {
    expect(html).toContain('role="radiogroup"');
    expect(html).toContain('aria-label="Theme"');
    expect(html).toMatch(/role="radio" aria-checked="true" tabindex="0"[^>]*>B</);
    expect(html).toMatch(/role="radio" aria-checked="false" tabindex="-1"[^>]*>A</);
  });
});

describe('Segmented extras', () => {
  const opts = [{ value: 'a', label: 'A' }, { value: 'b', label: 'B', playing: true }];
  it('with no selected option the first one is still tabbable, and a playing option is marked', () => {
    const html = renderToString(<Segmented aria-label="Scene" value="" onChange={noop} options={opts} />);
    expect(html).not.toContain('aria-checked="true"');
    expect(html).toMatch(/aria-checked="false" tabindex="0"[^>]*>A</);
    expect(html).toMatch(/aria-checked="false" tabindex="-1" class="playing"[^>]*>B</);
  });
  it('wrap lets a long group flow onto several lines', () => {
    expect(renderToString(<Segmented aria-label="x" value="a" onChange={noop} options={opts} wrap />)).toContain('class="ui-seg wrap"');
  });
});

describe('OptionCards', () => {
  it('marks the selected card and renders label, hint and preview', () => {
    const html = renderToString(<OptionCards aria-label="Position" value="left" onChange={noop}
      options={[{ value: 'left', label: 'Left', hint: 'next to the tray', preview: <i className="pv" /> }, { value: 'right', label: 'Right' }]} />);
    expect(html).toMatch(/role="radio" aria-checked="true" tabindex="0"/);
    expect(html).toMatch(/role="radio" aria-checked="false" tabindex="-1"/);
    for (const x of ['Left', 'next to the tray', 'class="pv"', 'Right']) expect(html).toContain(x);
  });
});

describe('Switch', () => {
  it('is a checkbox with role switch, checked state and an accessible name', () => {
    const on = renderToString(<Switch checked onChange={noop} aria-label="Sound" />);
    expect(on).toContain('role="switch"');
    expect(on).toContain('checked=""');
    expect(on).toContain('aria-label="Sound"');
    expect(renderToString(<Switch checked={false} onChange={noop} aria-label="Sound" />)).not.toContain('checked=""');
    expect(renderToString(<Switch checked onChange={noop} aria-label="Sound" disabled />)).toContain('disabled=""');
  });
});

describe('Stepper', () => {
  const html = renderToString(<Stepper value={3} min={1} max={8} onChange={noop} aria-label="Agents" />);
  it('has no native spin buttons: a text input with numeric keypad and its own − / + buttons', () => {
    expect(html).toContain('type="text"');
    expect(html).toContain('inputMode="numeric"');
    expect(html).not.toContain('type="number"');
    expect(html).toContain('value="3"');
    expect(html).toContain('aria-label="Agents"');
    expect(html.match(/<button/g)?.length).toBe(2);
  });
  it('disables the button at the bounds', () => {
    expect(renderToString(<Stepper value={1} min={1} max={8} onChange={noop} aria-label="n" />)).toMatch(/disabled=""[^>]*>−/);
    expect(renderToString(<Stepper value={8} min={1} max={8} onChange={noop} aria-label="n" />)).toMatch(/disabled=""[^>]*>\+/);
  });
});

describe('Select', () => {
  it('renders a labelled native select with the current value selected', () => {
    const html = renderToString(<Select aria-label="Language" value="pl" onChange={noop} options={[{ value: 'en', label: 'English' }, { value: 'pl', label: 'Polski' }]} />);
    expect(html).toContain('aria-label="Language"');
    expect(html).toMatch(/<option value="pl" selected="">Polski</);
  });
});

describe('Row and Section', () => {
  it('Row shows label, hint, control and expandable details; Section shows title and note', () => {
    const html = renderToString(<Section title="Sound" note="Optional"><Row label="Volume" hint="0–100" control={<b className="ctl" />} dim><p className="more">details</p></Row></Section>);
    for (const x of ['Sound', 'Optional', 'Volume', '0–100', 'class="ctl"', 'class="more"']) expect(html).toContain(x);
    expect(html).toContain('dim');
  });
});
