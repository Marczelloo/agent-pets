import { describe, expect, it } from 'vitest';
import { darken, lighten, luma, mix, parseColor } from './color';
import { recorder } from './testing';

describe('color', () => {
  it('parses hex, short hex, rgb and rgba', () => {
    expect(parseColor('#D97757')).toEqual([217, 119, 87, 1]);
    expect(parseColor('#fff')).toEqual([255, 255, 255, 1]);
    expect(parseColor('rgb(1, 2, 3)')).toEqual([1, 2, 3, 1]);
    expect(parseColor('rgba(1,2,3,0.5)')).toEqual([1, 2, 3, 0.5]);
    expect(parseColor('papayawhip')).toBeNull();
  });
  it('mixes, lightens, darkens; keeps alpha; passes unknown colours through', () => {
    expect(mix('#000000', '#ffffff', 0.5)).toBe('rgb(128,128,128)');
    expect(lighten('#000', 1)).toBe('rgb(255,255,255)');
    expect(darken('#fff', 1)).toBe('rgb(0,0,0)');
    expect(mix('rgba(0,0,0,0.5)', '#fff', 0)).toBe('rgba(0,0,0,0.5)');
    expect(lighten('papayawhip', 0.5)).toBe('papayawhip');
  });
  it('luma of white is 1, of black 0', () => {
    expect(luma('#fff')).toBeCloseTo(1);
    expect(luma('#000')).toBeCloseTo(0);
  });
  it('the recorder supports linear gradients', () => {
    const r = recorder();
    const g = r.ctx.createLinearGradient(0, 0, 0, 10);
    g.addColorStop(0, '#fff');
    r.ctx.fillStyle = g;
    expect(r.log).toEqual(['createLinearGradient(0,0,0,10)', 'grad1.addColorStop(0,#fff)', 'fillStyle=grad1']);
  });
});
