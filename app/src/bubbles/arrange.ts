// Arrange bubbles above pets (spec 0.8, 2.3): each above its pet; overlapping bubbles move
// sideways, with a second row above when the first is full. Nothing extends beyond the window.

interface Placed { i: number; left: number; w: number }

/** Add a bubble to the end of a row, shifting earlier ones left if needed; `false` if it does not fit. */
function fitInRow(row: Placed[], it: Placed, width: number, gap: number): boolean {
  const end = row.length ? row[row.length - 1].left + row[row.length - 1].w + gap : -Infinity;
  const next = [...row.map(p => ({ ...p })), { ...it, left: Math.max(it.left, end) }];
  let bound = width;
  for (let k = next.length - 1; k >= 0; k--) {
    next[k].left = Math.min(next[k].left, bound - next[k].w);
    if (next[k].left < 0) return false;
    bound = next[k].left - gap;
  }
  row.splice(0, row.length, ...next);
  return true;
}

/** `x`: pet center, `w`: bubble width (window CSS px). Result follows input order. */
export function arrange(items: { x: number; w: number }[], width: number, gap = 6): { left: number; row: 0 | 1 }[] {
  const rows: [Placed[], Placed[]] = [[], []];
  const order = items.map((it, i) => ({ ...it, i })).sort((a, b) => a.x - b.x);
  for (const it of order) {
    const w = Math.min(it.w, width);
    const p: Placed = { i: it.i, w, left: Math.min(Math.max(0, it.x - w / 2), width - w) };
    // both rows are full: use the edge of the second row (overlap a bubble instead of leaving the window)
    if (!fitInRow(rows[0], p, width, gap) && !fitInRow(rows[1], p, width, gap)) rows[1].push({ ...p, left: width - w });
  }
  const out: { left: number; row: 0 | 1 }[] = items.map(() => ({ left: 0, row: 0 }));
  rows.forEach((row, r) => row.forEach(p => { out[p.i] = { left: p.left, row: r as 0 | 1 }; }));
  return out;
}
