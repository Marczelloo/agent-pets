/** Overlay of a dictionary: any subset of keys; functions and arrays are leaves. */
export type DeepPartial<T> = T extends (...a: never[]) => unknown ? T
  : T extends readonly unknown[] ? T
  : T extends object ? { [K in keyof T]?: DeepPartial<T[K]> } : T;

const isPlain = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/** Deep-merges `over` onto `base` without mutating either. */
export function merge<T>(base: T, over: DeepPartial<T>): T {
  if (!isPlain(base) || !isPlain(over)) return (over ?? base) as T;
  const out: Record<string, unknown> = { ...base };
  for (const k of Object.keys(over)) out[k] = k in base ? merge(base[k], over[k] as never) : over[k];
  return out as T;
}
