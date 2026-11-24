// Match It: the rules, kept free of the DOM so they can be tested.
// Two ways to play:
//  - Same: one picture at the top; tap the one that matches from 2–4 cards (all face up).
//  - Memory: classic pairs; a grown-up picks how many (2–8).

import { en, es, type Part } from '../kids/words';

export type Theme = 'animals' | 'vehicles' | 'food';

export interface Pic {
  e: string; // emoji
  name: string; // English word
  es: string; // Spanish word
}

export const PICS: Record<Theme, Pic[]> = {
  animals: [
    { e: '🐶', name: 'dog', es: 'perro' }, { e: '🐱', name: 'cat', es: 'gato' }, { e: '🐮', name: 'cow', es: 'vaca' }, { e: '🐷', name: 'pig', es: 'cerdo' },
    { e: '🐸', name: 'frog', es: 'rana' }, { e: '🦁', name: 'lion', es: 'león' }, { e: '🐵', name: 'monkey', es: 'mono' }, { e: '🐔', name: 'chicken', es: 'gallina' },
    { e: '🦆', name: 'duck', es: 'pato' }, { e: '🐘', name: 'elephant', es: 'elefante' }, { e: '🐰', name: 'bunny', es: 'conejo' }, { e: '🐻', name: 'bear', es: 'oso' },
  ],
  vehicles: [
    { e: '🚗', name: 'car', es: 'carro' }, { e: '🚒', name: 'fire truck', es: 'camión de bomberos' }, { e: '🚜', name: 'tractor', es: 'tractor' }, { e: '🚂', name: 'train', es: 'tren' },
    { e: '✈️', name: 'plane', es: 'avión' }, { e: '🚀', name: 'rocket', es: 'cohete' }, { e: '🚌', name: 'bus', es: 'autobús' }, { e: '🚁', name: 'helicopter', es: 'helicóptero' },
    { e: '⛵', name: 'boat', es: 'barco' }, { e: '🚲', name: 'bike', es: 'bicicleta' }, { e: '🚓', name: 'police car', es: 'patrulla' }, { e: '🚑', name: 'ambulance', es: 'ambulancia' },
  ],
  food: [
    { e: '🍎', name: 'apple', es: 'manzana' }, { e: '🍌', name: 'banana', es: 'plátano' }, { e: '🍓', name: 'strawberry', es: 'fresa' }, { e: '🍇', name: 'grapes', es: 'uvas' },
    { e: '🍊', name: 'orange', es: 'naranja' }, { e: '🍉', name: 'watermelon', es: 'sandía' }, { e: '🥕', name: 'carrot', es: 'zanahoria' }, { e: '🧀', name: 'cheese', es: 'queso' },
    { e: '🍪', name: 'cookie', es: 'galleta' }, { e: '🍦', name: 'ice cream', es: 'helado' }, { e: '🥦', name: 'broccoli', es: 'brócoli' }, { e: '🍐', name: 'pear', es: 'pera' },
  ],
};

export type Rng = () => number;

const cap = (w: string) => w[0].toUpperCase() + w.slice(1);

/** The picture's name as speech: "Dog!" or "¡Perro!" */
export function nameParts(p: Pic, lang: 'en' | 'es'): Part[] {
  return lang === 'es' ? [es(`¡${cap(p.es)}!`)] : [en(`${cap(p.name)}!`)];
}

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

/** How many pairs a grown-up can pick for Memory. */
export const PAIR_OPTIONS = [2, 3, 4, 6, 8];

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
    // Prefer full rows: a lone card on the last row looks odd, so ragged layouts score a little lower.
    const size = Math.min(w / cols, (h / rows) * 0.75) * (n % cols === 0 ? 1 : 0.9);
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
