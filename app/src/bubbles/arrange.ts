// Rozmieszczenie dymków nad zwierzakami (spec 0.8, 2.3): każdy nad swoim zwierzakiem, nachodzące przesuwane
// w bok, a gdy w rzędzie brak miejsca, drugi rząd wyżej. Nic nie wychodzi poza okno.

interface Placed { i: number; left: number; w: number }

/** Dokłada dymek na koniec rzędu, w razie potrzeby przesuwając wcześniejsze w lewo; `false`, gdy się nie mieści. */
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

/** `x`: środek zwierzaka, `w`: szerokość dymku (px CSS okna). Wynik w kolejności wejścia. */
export function arrange(items: { x: number; w: number }[], width: number, gap = 6): { left: number; row: 0 | 1 }[] {
  const rows: [Placed[], Placed[]] = [[], []];
  const order = items.map((it, i) => ({ ...it, i })).sort((a, b) => a.x - b.x);
  for (const it of order) {
    const w = Math.min(it.w, width);
    const p: Placed = { i: it.i, w, left: Math.min(Math.max(0, it.x - w / 2), width - w) };
    // oba rzędy pełne: skraj drugiego rzędu (lepiej nakryć dymek niż wyjść poza okno)
    if (!fitInRow(rows[0], p, width, gap) && !fitInRow(rows[1], p, width, gap)) rows[1].push({ ...p, left: width - w });
  }
  const out: { left: number; row: 0 | 1 }[] = items.map(() => ({ left: 0, row: 0 }));
  rows.forEach((row, r) => row.forEach(p => { out[p.i] = { left: p.left, row: r as 0 | 1 }; }));
  return out;
}
