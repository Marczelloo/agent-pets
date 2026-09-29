import { describe, expect, it } from 'vitest';
import { FONT_ROWS, PIXEL_FONT, glyphOf, textWidth } from './pixelfont';

const required = [
  ...Array.from({ length: 95 }, (_, index) => String.fromCharCode(index + 32)),
  ...Array.from('ąćęłńóśźżĄĆĘŁŃÓŚŹŻ…'),
];

describe('pixel font', () => {
  it('contains all required glyphs', () => {
    for (const ch of required) expect(PIXEL_FONT[ch], ch).toBeDefined();
  });

  it('uses nine valid, consistently sized rows per glyph', () => {
    for (const [ch, rows] of Object.entries(PIXEL_FONT)) {
      expect(rows, ch).toHaveLength(FONT_ROWS);
      const width = rows[0].length;
      expect(width, ch).toBeGreaterThanOrEqual(1);
      expect(width, ch).toBeLessThanOrEqual(5);
      for (const row of rows) {
        expect(row).toMatch(/^[#.]+$/);
        expect(row).toHaveLength(width);
      }
      if (ch !== ' ') expect(rows.some((row) => row.includes('#'))).toBe(true);
    }
  });

  it('keeps capital and digit marks in the specified rows', () => {
    const accented = new Set(['Ć', 'Ń', 'Ó', 'Ś', 'Ź', 'Ż']);
    for (const ch of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789') {
      if (!['Ą', 'Ę'].includes(ch)) expect(glyphOf(ch)[8]).not.toContain('#');
      if (!accented.has(ch)) expect(glyphOf(ch)[0]).not.toContain('#');
    }
  });

  it('places lowercase descenders in row eight', () => {
    for (const ch of 'gjpqy') expect(glyphOf(ch)[8]).toContain('#');
  });

  const lastRow = (ch: string) => glyphOf(ch).reduce((last, row, i) => (row.includes('#') ? i : last), -1);
  const firstRow = (ch: string) => glyphOf(ch).findIndex(row => row.includes('#'));

  it('stands letters, digits and dots on the baseline (row 7)', () => {
    for (const ch of 'ABCDEFGHIJKLMNOPRSTUVWXYZ0123456789abcdefhiklmnorstuvwxzćńóśźżĆŃÓŚŹŻŁł.!?:;…') {
      expect(lastRow(ch), ch).toBe(7);
    }
    for (const ch of 'gjpqy,_ąęĄĘ') expect(lastRow(ch), ch).toBe(8);
  });

  it('keeps ascenders at cap height and x-height letters lower', () => {
    for (const ch of 'bdfhkl') expect(firstRow(ch), ch).toBe(1);
    for (const ch of 'acemnorsuvwxz') expect(firstRow(ch), ch).toBe(3);
    for (const ch of '-=+~') expect(firstRow(ch), ch).toBeGreaterThanOrEqual(3);
    for (const ch of '"\'`^') expect(lastRow(ch), ch).toBeLessThanOrEqual(3);
  });

  it('gives Polish letters their own marks', () => {
    expect(glyphOf('ż')).not.toEqual(glyphOf('ź'));
    expect(glyphOf('Ż')).not.toEqual(glyphOf('Ź'));
    expect(glyphOf('ł')).not.toEqual(glyphOf('l'));
    expect(glyphOf('Ł')).not.toEqual(glyphOf('L'));
    // accent stroke goes up to the right
    const acute = glyphOf('ó');
    expect(acute[1].indexOf('#')).toBeGreaterThan(acute[2].indexOf('#'));
  });

  it('falls back to the question mark and measures text in pixels', () => {
    expect(glyphOf('€')).toEqual(glyphOf('?'));
    expect(textWidth('')).toBe(0);
    expect(textWidth('A')).toBe(glyphOf('A')[0].length);
    expect(textWidth('AB')).toBe(glyphOf('A')[0].length + 1 + glyphOf('B')[0].length);
    expect(textWidth('żółw')).toBe(
      glyphOf('ż')[0].length + 1 + glyphOf('ó')[0].length + 1 + glyphOf('ł')[0].length + 1 + glyphOf('w')[0].length,
    );
  });
});
