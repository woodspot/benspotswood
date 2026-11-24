// Match It: the rules, kept free of the DOM so they can be tested.
// Two ways to play:
//  - Same: one picture at the top; tap the one that matches from 2–4 cards (all face up).
//  - Memory: classic pairs, starting with just 2 pairs and growing as the child wins.

export type Theme = 'animals' | 'vehicles' | 'food';

export interface Pic {
  e: string; // emoji
  name: string; // what the voice calls it
}

export const PICS: Record<Theme, Pic[]> = {
  animals: [
    { e: '🐶', name: 'dog' }, { e: '🐱', name: 'cat' }, { e: '🐮', name: 'cow' }, { e: '🐷', name: 'pig' },
    { e: '🐸', name: 'frog' }, { e: '🦁', name: 'lion' }, { e: '🐵', name: 'monkey' }, { e: '🐔', name: 'chicken' },
    { e: '🦆', name: 'duck' }, { e: '🐘', name: 'elephant' }, { e: '🐰', name: 'bunny' }, { e: '🐻', name: 'bear' },
  ],
  vehicles: [
    { e: '🚗', name: 'car' }, { e: '🚒', name: 'fire truck' }, { e: '🚜', name: 'tractor' }, { e: '🚂', name: 'train' },
    { e: '✈️', name: 'plane' }, { e: '🚀', name: 'rocket' }, { e: '🚌', name: 'bus' }, { e: '🚁', name: 'helicopter' },
    { e: '⛵', name: 'boat' }, { e: '🚲', name: 'bike' }, { e: '🚓', name: 'police car' }, { e: '🚑', name: 'ambulance' },
  ],
  food: [
    { e: '🍎', name: 'apple' }, { e: '🍌', name: 'banana' }, { e: '🍓', name: 'strawberry' }, { e: '🍇', name: 'grapes' },
    { e: '🍊', name: 'orange' }, { e: '🍉', name: 'watermelon' }, { e: '🥕', name: 'carrot' }, { e: '🧀', name: 'cheese' },
    { e: '🍪', name: 'cookie' }, { e: '🍦', name: 'ice cream' }, { e: '🥦', name: 'broccoli' }, { e: '🍐', name: 'pear' },
  ],
};

export type Rng = () => number;

function shuffle<T>(list: T[], rng: Rng): T[] {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** `n` different pictures from a theme, as indexes into PICS[theme]. */
function pickPics(theme: Theme, n: number, rng: Rng): number[] {
  return shuffle(PICS[theme].map((_, i) => i), rng).slice(0, n);
}

// ── Same ───────────────────────────────────────────────────────

export interface SameRound {
  target: number;
  options: number[]; // includes the target exactly once
}

/** How many cards to choose from: 2 at first, up to 4 as the child gets them right. */
export const sameChoices = (wins: number) => Math.min(4, 2 + Math.floor(wins / 4));

export function newSame(theme: Theme, wins: number, rng: Rng, prevTarget?: number): SameRound {
  let pics = pickPics(theme, sameChoices(wins), rng);
  // Don't ask for the same picture twice in a row.
  if (prevTarget !== undefined && pics[0] === prevTarget) pics = [...pics.slice(1), pics[0]];
  return { target: pics[0], options: shuffle(pics, rng) };
}

// ── Memory ─────────────────────────────────────────────────────

export interface Card {
  pic: number;
  up: boolean;
  matched: boolean;
}

export interface Memory {
  theme: Theme;
  cards: Card[];
  open: number[]; // indexes of face-up, unmatched cards (0–2)
}

/** Board size by level: 2 pairs, then 3, 4 and 6. */
export const MEMORY_PAIRS = [2, 3, 4, 6];

export function newMemory(theme: Theme, pairs: number, rng: Rng): Memory {
  const pics = pickPics(theme, pairs, rng);
  const cards = shuffle([...pics, ...pics], rng).map((pic) => ({ pic, up: false, matched: false }));
  return { theme, cards, open: [] };
}

export type FlipResult =
  | { kind: 'ignored' } // already up, or two cards are showing
  | { kind: 'first' }
  | { kind: 'match'; pic: number; done: boolean }
  | { kind: 'miss' }; // call hideMiss() after a pause

export function flip(m: Memory, i: number): FlipResult {
  const c = m.cards[i];
  if (!c || c.up || c.matched || m.open.length >= 2) return { kind: 'ignored' };
  c.up = true;
  m.open.push(i);
  if (m.open.length === 1) return { kind: 'first' };
  const [a, b] = m.open.map((k) => m.cards[k]);
  if (a.pic === b.pic) {
    a.matched = b.matched = true;
    m.open = [];
    return { kind: 'match', pic: a.pic, done: m.cards.every((x) => x.matched) };
  }
  return { kind: 'miss' };
}

/** Turn a missed pair back over. */
export function hideMiss(m: Memory): void {
  for (const k of m.open) m.cards[k].up = false;
  m.open = [];
}

/** Columns × rows that fit `n` cards best in a w × h space, keeping cards roughly 3:4. */
export function gridFor(n: number, w: number, h: number): { cols: number; rows: number } {
  let best = { cols: n, rows: 1, size: 0 };
  for (let cols = 1; cols <= n; cols++) {
    const rows = Math.ceil(n / cols);
    if (cols * rows - n >= cols) continue; // no empty rows
    const size = Math.min(w / cols, (h / rows) * 0.75);
    if (size > best.size) best = { cols, rows, size };
  }
  return { cols: best.cols, rows: best.rows };
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
