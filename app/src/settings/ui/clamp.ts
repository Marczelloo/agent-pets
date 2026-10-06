/** Parse and clamp a typed or stepped number; anything unreadable falls back so the setting never goes NaN. */
export const clampStep = (raw: string | number, min: number, max: number, fallback: number): number => {
  const n = typeof raw === 'number' ? raw : raw.trim() === '' ? NaN : Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
};
