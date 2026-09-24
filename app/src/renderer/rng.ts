let source: () => number = Math.random;
export function rng(): number { return source(); }
export function setRng(f: () => number): void { source = f; }
