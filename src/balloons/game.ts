// Balloon Pop: the rules, kept free of the DOM so they can be tested.
// Nobody ever loses. A "wrong" balloon still pops; the voice just names what it was.

export type Mode = 'free' | 'colors' | 'shapes' | 'count';
export type ColorId = 'red' | 'blue' | 'yellow' | 'green' | 'orange' | 'purple' | 'pink';
export type ShapeId = 'circle' | 'star' | 'heart' | 'square' | 'triangle';

export const COLORS: { id: ColorId; hex: string }[] = [
  { id: 'red', hex: '#ec4038' },
  { id: 'blue', hex: '#3a7ff0' },
  { id: 'yellow', hex: '#f7cf2d' },
  { id: 'green', hex: '#3fbf5a' },
  { id: 'orange', hex: '#f68b28' },
  { id: 'purple', hex: '#9b5de5' },
  { id: 'pink', hex: '#f477b6' },
];
export const COLOR_HEX = Object.fromEntries(COLORS.map((c) => [c.id, c.hex])) as Record<ColorId, string>;
export const SHAPES: ShapeId[] = ['circle', 'star', 'heart', 'square', 'triangle'];

export interface Spec {
  color: ColorId;
  shape: ShapeId | null; // drawn on the balloon in Shapes mode
}

export type Target = { kind: 'any' } | { kind: 'color'; id: ColorId } | { kind: 'shape'; id: ShapeId } | { kind: 'count'; n: number };

export interface Session {
  mode: Mode;
  target: Target;
  progress: number; // balloons popped toward the current target (Count mode)
  correct: number; // right pops this session: unlocks more colours and shapes
}

export type Rng = () => number;
const pick = <T>(rng: Rng, list: readonly T[]): T => list[Math.floor(rng() * list.length)];

/** Start with the easy colours and shapes; more join as the child gets them right. */
export function colorPool(correct: number): ColorId[] {
  return COLORS.slice(0, Math.min(COLORS.length, 4 + Math.floor(correct / 8))).map((c) => c.id);
}
export function shapePool(correct: number): ShapeId[] {
  return SHAPES.slice(0, Math.min(SHAPES.length, 3 + Math.floor(correct / 8)));
}

export function newTarget(s: Pick<Session, 'mode' | 'correct'>, rng: Rng, prev?: Target): Target {
  switch (s.mode) {
    case 'free':
      return { kind: 'any' };
    case 'colors': {
      const pool = colorPool(s.correct).filter((c) => !(prev?.kind === 'color' && prev.id === c));
      return { kind: 'color', id: pick(rng, pool) };
    }
    case 'shapes': {
      const pool = shapePool(s.correct).filter((x) => !(prev?.kind === 'shape' && prev.id === x));
      return { kind: 'shape', id: pick(rng, pool) };
    }
    case 'count': {
      const max = Math.min(5, 2 + Math.floor(s.correct / 4));
      const opts = Array.from({ length: max }, (_, i) => i + 1).filter((n) => !(prev?.kind === 'count' && prev.n === n));
      return { kind: 'count', n: pick(rng, opts) };
    }
  }
}

export function newSession(mode: Mode, rng: Rng): Session {
  const base = { mode, correct: 0 };
  return { ...base, target: newTarget(base, rng), progress: 0 };
}

export function matches(t: Target, b: Spec): boolean {
  if (t.kind === 'color') return b.color === t.id;
  if (t.kind === 'shape') return b.shape === t.id;
  return true; // any balloon counts in Free and Count modes
}

/** The next balloon to float up. There is always at least one balloon that matches the target. */
export function nextBalloon(s: Session, onScreen: Spec[], rng: Rng): Spec {
  const colors = colorPool(s.correct);
  const shapes = shapePool(s.correct);
  const random = (): Spec => ({ color: pick(rng, colors), shape: s.mode === 'shapes' ? pick(rng, shapes) : null });
  const t = s.target;
  // At least one match on screen, at most two: the child has to look, not just tap anything.
  const matching = onScreen.filter((b) => matches(t, b)).length;
  const wantMatch = matching === 0 || (matching < 2 && rng() < 0.35);
  if (t.kind === 'color' && wantMatch) return { color: t.id, shape: null };
  if (t.kind === 'shape' && wantMatch) return { color: pick(rng, colors), shape: t.id };
  if (t.kind === 'color') return { color: pick(rng, colors.filter((c) => c !== t.id)), shape: null };
  if (t.kind === 'shape') return { color: pick(rng, colors), shape: pick(rng, shapes.filter((x) => x !== t.id)) };
  return random();
}

export type PopResult =
  | { kind: 'free' } // Free mode: every pop is a happy pop
  | { kind: 'right'; done: boolean; count?: number } // done: target finished, time for a new one
  | { kind: 'other'; said: string }; // not the one asked for: name it, gently

/** A balloon was popped. Updates the session and says what should happen. */
export function pop(s: Session, b: Spec, rng: Rng): PopResult {
  const t = s.target;
  if (t.kind === 'any') {
    s.correct++;
    return { kind: 'free' };
  }
  if (t.kind === 'count') {
    s.progress++;
    if (s.progress >= t.n) {
      s.correct++;
      return finish(s, rng, s.progress);
    }
    return { kind: 'right', done: false, count: s.progress };
  }
  if (matches(t, b)) {
    s.correct++;
    return finish(s, rng);
  }
  return { kind: 'other', said: t.kind === 'shape' && b.shape ? `That's a ${b.shape}.` : `That's ${b.color}.` };
}

function finish(s: Session, rng: Rng, count?: number): PopResult {
  s.target = newTarget(s, rng, s.target);
  s.progress = 0;
  return { kind: 'right', done: true, count };
}

/** Seeded RNG for tests. */
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
