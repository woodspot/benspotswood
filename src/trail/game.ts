// Hoot's Trail: a winding learning trail for little ones, guided by Hoot the owl.
// Each stop is a short lesson (letters, first sounds, counting, colours, shapes, big and small,
// patterns, dot-to-dot); finishing one earns a sticker for the sticker book and opens the next stop.
// No DOM here, so the rules and everything the voice says can be tested.
import { LETTERS, letterOf, meetParts as letterMeet, questionParts as letterFind, type Letter } from '../abc/game';
import { COLORS, type ColorId } from '../balloons/game';
import { PICS, nameParts as picName, type Pic } from '../match/game';
import { COLOR_WORDS, en, es, numberWord, type Lang, type Part } from '../kids/words';

export type Rng = () => number;

const cap = (w: string) => w.charAt(0).toUpperCase() + w.slice(1);
const pick = <T>(rng: Rng, list: readonly T[]): T => list[Math.floor(rng() * list.length)];
export function shuffle<T>(list: readonly T[], rng: Rng): T[] {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
/** `n` different items from a list, always including `must`. */
function choicesWith<T>(must: T, pool: readonly T[], n: number, rng: Rng): T[] {
  return shuffle([must, ...shuffle(pool.filter((x) => x !== must), rng).slice(0, n - 1)], rng);
}

// ── The trail ──────────────────────────────────────────────────

export type Kind = 'letter' | 'sound' | 'count' | 'color' | 'shape' | 'size' | 'pattern' | 'dots';

export interface World {
  id: string;
  name: { en: string; es: string };
  emoji: string;
}

/** Four worlds of ten stops; each world is a little harder than the one before. */
export const WORLDS: World[] = [
  { id: 'meadow', name: { en: 'the Meadow', es: 'el prado' }, emoji: '🌼' },
  { id: 'beach', name: { en: 'the Beach', es: 'la playa' }, emoji: '🏖️' },
  { id: 'forest', name: { en: 'the Forest', es: 'el bosque' }, emoji: '🌲' },
  { id: 'space', name: { en: 'Space', es: 'el espacio' }, emoji: '🚀' },
];
export const STOPS_PER_WORLD = 10;
export const STOP_COUNT = WORLDS.length * STOPS_PER_WORLD;

// The same mix in every world, so each subject comes round again a bit harder.
const ORDER: Kind[] = ['letter', 'count', 'color', 'shape', 'dots', 'sound', 'size', 'pattern', 'letter', 'count'];

export interface Stop {
  index: number;
  world: number;
  kind: Kind;
}
export const stopAt = (index: number): Stop => ({
  index,
  world: Math.floor(index / STOPS_PER_WORLD),
  kind: ORDER[index % STOPS_PER_WORLD],
});
export const STOPS: Stop[] = Array.from({ length: STOP_COUNT }, (_, i) => stopAt(i));

/** The little picture on each stop of the trail. */
export const KIND_ICON: Record<Kind, string> = {
  letter: '🔤', sound: '👂', count: '🔢', color: '🖍️', shape: '🔷', size: '🐘', pattern: '🧩', dots: '✏️',
};

// ── Things to count, compare and line up ───────────────────────

export interface Thing {
  e: string;
  one: { en: string; es: string };
  many: { en: string; es: string };
}
const T = (e: string, en1: string, enN: string, es1: string, esN: string): Thing => ({ e, one: { en: en1, es: es1 }, many: { en: enN, es: esN } });
export const THINGS: Thing[] = [
  T('🍎', 'apple', 'apples', 'manzana', 'manzanas'),
  T('🦆', 'duck', 'ducks', 'pato', 'patos'),
  T('⭐', 'star', 'stars', 'estrella', 'estrellas'),
  T('🐟', 'fish', 'fish', 'pez', 'peces'),
  T('🚗', 'car', 'cars', 'carro', 'carros'),
  T('🍌', 'banana', 'bananas', 'plátano', 'plátanos'),
  T('🎈', 'balloon', 'balloons', 'globo', 'globos'),
  T('🍪', 'cookie', 'cookies', 'galleta', 'galletas'),
  T('🐞', 'ladybug', 'ladybugs', 'mariquita', 'mariquitas'),
  T('🌸', 'flower', 'flowers', 'flor', 'flores'),
];
// Things that look the same drawn big or small (and make sense either way).
export const SIZE_THINGS = ['🐘', '🐶', '⚽', '🌳', '🐟', '🍎', '🦆', '🚗'];

// ── Shapes ─────────────────────────────────────────────────────

export type ShapeId = 'circle' | 'square' | 'triangle' | 'star' | 'heart' | 'diamond' | 'oval' | 'rectangle';
export const SHAPES: ShapeId[] = ['circle', 'square', 'triangle', 'star', 'heart', 'diamond', 'oval', 'rectangle'];
export const SHAPE_NAMES: Record<ShapeId, { en: string; es: string }> = {
  circle: { en: 'circle', es: 'círculo' },
  square: { en: 'square', es: 'cuadrado' },
  triangle: { en: 'triangle', es: 'triángulo' },
  star: { en: 'star', es: 'estrella' },
  heart: { en: 'heart', es: 'corazón' },
  diamond: { en: 'diamond', es: 'rombo' },
  oval: { en: 'oval', es: 'óvalo' },
  rectangle: { en: 'rectangle', es: 'rectángulo' },
};

// ── Dot-to-dot pictures (points on a 100 × 100 grid, joined in order and back to the start) ──

export interface DotPic {
  id: string;
  name: { en: string; es: string }; // with "a"/"una" so it reads "A star!"
  color: string;
  points: [number, number][];
}
const starPts = (): [number, number][] =>
  Array.from({ length: 10 }, (_, i) => {
    const a = (Math.PI / 5) * i - Math.PI / 2;
    const r = i % 2 ? 18 : 42;
    return [Math.round(50 + Math.cos(a) * r), Math.round(54 + Math.sin(a) * r)] as [number, number];
  });
export const DOT_PICS: DotPic[] = [
  { id: 'diamond', name: { en: 'a diamond', es: 'un rombo' }, color: '#3a7ff0', points: [[50, 8], [86, 50], [50, 92], [14, 50]] },
  { id: 'house', name: { en: 'a house', es: 'una casa' }, color: '#ec4038', points: [[20, 90], [20, 46], [50, 14], [80, 46], [80, 90]] },
  { id: 'boat', name: { en: 'a boat', es: 'un barco' }, color: '#f68b28', points: [[10, 60], [48, 60], [48, 10], [84, 60], [92, 60], [76, 86], [24, 86]] },
  { id: 'fish', name: { en: 'a fish', es: 'un pez' }, color: '#3fbf5a', points: [[10, 50], [30, 30], [58, 28], [76, 44], [92, 28], [92, 72], [76, 56], [58, 72], [30, 70]] },
  { id: 'heart', name: { en: 'a heart', es: 'un corazón' }, color: '#f477b6', points: [[50, 90], [16, 58], [8, 34], [22, 14], [40, 14], [50, 28], [60, 14], [78, 14], [92, 34], [84, 58]] },
  { id: 'star', name: { en: 'a star', es: 'una estrella' }, color: '#f7cf2d', points: starPts() },
];

// ── Questions ──────────────────────────────────────────────────

export type Question =
  | { kind: 'letter'; target: string; choices: string[] }
  | { kind: 'sound'; target: string; choices: string[] } // pick the picture whose word starts with the letter
  | { kind: 'count'; thing: Thing; n: number; choices: number[] }
  | { kind: 'color'; target: ColorId; choices: ColorId[] }
  | { kind: 'shape'; target: ShapeId; choices: ShapeId[]; colors: string[] }
  | { kind: 'size'; target: 'big' | 'small'; thing: string; choices: ('big' | 'small')[] }
  | { kind: 'pattern'; seq: Thing[]; answer: Thing; choices: Thing[] }
  | { kind: 'dots'; pic: DotPic };

export const QUESTIONS_PER_STOP = 4;

/** Letters in play: the first few, then more of the alphabet as the worlds go on. */
export function letterPool(world: number, lang: Lang): Letter[] {
  const all = LETTERS[lang];
  return all.slice(0, Math.min(all.length, [6, 13, 20, 99][Math.min(world, 3)]));
}

const plain = (w: string) => w.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
export const startsWith = (l: Letter) => l.ch !== 'Ñ' && plain(l.word).startsWith(plain(l.ch));

export function newQuestion(stop: Stop, lang: Lang, rng: Rng, prev?: Question): Question {
  const w = Math.min(stop.world, 3);
  switch (stop.kind) {
    case 'letter':
    case 'sound': {
      // First sounds only use letters whose word really starts with them (not "kiwi" for W, "piña" for Ñ).
      const pool = letterPool(w, lang).filter((l) => stop.kind === 'letter' || startsWith(l)).map((l) => l.ch);
      const fresh = pool.filter((ch) => !(prev && 'target' in prev && prev.target === ch));
      const target = pick(rng, fresh);
      const n = stop.kind === 'letter' ? [2, 3, 3, 4][w] : [2, 3, 3, 3][w];
      return { kind: stop.kind, target, choices: choicesWith(target, pool, n, rng) };
    }
    case 'count': {
      const max = [3, 5, 7, 10][w];
      const n = 1 + Math.floor(rng() * max);
      const others = Array.from({ length: max + 1 }, (_, i) => i).filter((x) => x >= 1 && x !== n);
      const choices = shuffle([n, ...shuffle(others, rng).slice(0, 2)], rng);
      const thing = pick(rng, THINGS.filter((t) => !(prev?.kind === 'count' && prev.thing === t)));
      return { kind: 'count', thing, n, choices };
    }
    case 'color': {
      const pool = COLORS.slice(0, [4, 5, 7, 7][w]).map((c) => c.id);
      const target = pick(rng, pool.filter((c) => !(prev?.kind === 'color' && prev.target === c)));
      return { kind: 'color', target, choices: choicesWith(target, pool, [2, 3, 4, 4][w], rng) };
    }
    case 'shape': {
      const pool = SHAPES.slice(0, [4, 5, 6, 8][w]);
      const target = pick(rng, pool.filter((s) => !(prev?.kind === 'shape' && prev.target === s)));
      const choices = choicesWith(target, pool, [2, 3, 3, 4][w], rng);
      // Every shape a different colour, so it's the shape they look at, not the colour.
      const colors = shuffle(COLORS.map((c) => c.hex), rng).slice(0, choices.length);
      return { kind: 'shape', target, choices, colors };
    }
    case 'size': {
      const target = rng() < 0.5 ? 'big' : 'small';
      return { kind: 'size', target, thing: pick(rng, SIZE_THINGS), choices: rng() < 0.5 ? ['big', 'small'] : ['small', 'big'] };
    }
    case 'pattern': {
      const [a, b, c] = shuffle(THINGS, rng);
      // Meadow: AB AB. Beach: AB AB with three to pick from. Forest: ABC ABC. Space: AAB AAB.
      const unit = [[a, b], [a, b], [a, b, c], [a, a, b]][w];
      const len = unit.length === 2 ? 4 : 6;
      const seq = Array.from({ length: len - 1 }, (_, i) => unit[i % unit.length]);
      const answer = unit[(len - 1) % unit.length];
      // Wrong choices: the other things in the pattern first, then something new.
      const others = [...new Set([...unit.filter((t) => t !== answer), ...shuffle(THINGS, rng)])].filter((t) => t !== answer);
      return { kind: 'pattern', seq, answer, choices: shuffle([answer, ...others.slice(0, w === 0 ? 1 : 2)], rng) };
    }
    case 'dots': {
      const pool = DOT_PICS.slice(0, [3, 4, 5, 6][w] ?? 6);
      return { kind: 'dots', pic: pick(rng, pool.filter((p) => !(prev?.kind === 'dots' && prev.pic === p))) };
    }
  }
}

/** A whole stop's questions. Dot-to-dot is two pictures; everything else is four quick questions. */
export function newLesson(stop: Stop, lang: Lang, rng: Rng): Question[] {
  const n = stop.kind === 'dots' ? 2 : QUESTIONS_PER_STOP;
  const out: Question[] = [];
  for (let i = 0; i < n; i++) out.push(newQuestion(stop, lang, rng, out[i - 1]));
  return out;
}

/** Is this choice the right answer? (Choices are identified by the same values the question holds.) */
export function isRight(q: Question, choice: string | number): boolean {
  switch (q.kind) {
    case 'letter':
    case 'sound':
    case 'color':
    case 'shape':
    case 'size':
      return q.target === choice;
    case 'count':
      return q.n === choice;
    case 'pattern':
      return q.answer.e === choice;
    case 'dots':
      return true;
  }
}

// ── Speech ─────────────────────────────────────────────────────
// Like the other toddler games: instructions in English, the word being learned in the chosen language.

const say = (w: { en: string; es: string }, lang: Lang, bang = true): Part =>
  lang === 'es' ? es(bang ? `¡${cap(w.es)}!` : w.es) : en(bang ? `${cap(w.en)}!` : w.en);

export const SIZE_WORDS = { big: { en: 'big', es: 'grande' }, small: { en: 'small', es: 'pequeño' } };

/** What Hoot asks. */
export function promptParts(q: Question, lang: Lang): Part[] {
  const es1 = lang === 'es';
  switch (q.kind) {
    case 'letter':
      return letterFind(letterOf(q.target, lang), lang);
    case 'sound': {
      const l = letterOf(q.target, lang);
      // Inside a sentence the voice says the letter's name (not its sound), as in the ABC game.
      return es1 ? [en('What starts with'), { ...es(`¡${cap(l.name)}!`), voice: 'letters' }] : [en(`What starts with ${l.ch}?`)];
    }
    case 'count':
      return es1 ? [en('How many'), es(`${q.thing.many.es}?`)] : [en(`How many ${q.thing.many.en}?`)];
    case 'color':
      return es1 ? [en('Find the'), es(COLOR_WORDS[q.target].es), en('crayon!')] : [en(`Find the ${COLOR_WORDS[q.target].en} crayon!`)];
    case 'shape':
      return es1 ? [en('Find the'), es(SHAPE_NAMES[q.target].es)] : [en(`Find the ${SHAPE_NAMES[q.target].en}!`)];
    case 'size':
      return es1 ? [en('Which one is'), es(`${SIZE_WORDS[q.target].es}?`)] : [en(`Which one is ${q.target}?`)];
    case 'pattern':
      return [en('What comes next?')];
    case 'dots':
      return [en('Connect the dots! Start at one.')];
  }
}

/** What's said when a choice is tapped: its name, so even a wrong tap teaches something. */
export function choiceParts(q: Question, choice: string | number, lang: Lang): Part[] {
  switch (q.kind) {
    case 'letter':
    case 'sound':
      return letterMeet(letterOf(String(choice), lang), lang);
    case 'count':
      return [say(numberWord(Number(choice)), lang)];
    case 'color':
      return [say(COLOR_WORDS[String(choice)], lang)];
    case 'shape':
      return [say(SHAPE_NAMES[choice as ShapeId], lang)];
    case 'size':
      return [say(SIZE_WORDS[choice as 'big' | 'small'], lang)];
    case 'pattern': {
      const t = THINGS.find((x) => x.e === choice) ?? q.answer;
      return [say(t.one, lang)];
    }
    case 'dots':
      return [say(q.pic.name, lang)];
  }
}

/** Counting out loud (wrong answers in counting, and each dot in dot-to-dot). */
export const numberPart = (n: number, lang: Lang): Part => (lang === 'es' ? es(numberWord(n).es) : en(numberWord(n).en));

export const PRAISE = ['Yes!', 'Great job!', 'You did it!', 'Wow!', 'Super!', 'Hooray!'];
export const TRY_AGAIN = 'Try again!';
export const LETS_COUNT = "Let's count!";

export const worldParts = (w: World, lang: Lang): Part[] =>
  lang === 'es' ? [en('Welcome to'), es(`¡${cap(w.name.es)}!`)] : [en(`Welcome to ${w.name.en}!`)];

// ── Stickers ───────────────────────────────────────────────────

/** Every sticker that can be won: the pictures from Match It!, so each has a name to hear. */
export const STICKERS: Pic[] = [...PICS.animals, ...PICS.vehicles, ...PICS.food];
export const stickerParts = (p: Pic, lang: Lang) => picName(p, lang);

/** A sticker they don't have yet (or any, once the book is full). */
export function newSticker(have: readonly string[], rng: Rng): Pic {
  const left = STICKERS.filter((s) => !have.includes(s.e));
  return pick(rng, left.length ? left : STICKERS);
}

// ── Players (each twin gets their own trail) ───────────────────

export interface Player {
  id: string;
  name: string;
  avatar: string;
  done: number; // stops finished in order: the next stop is `done`
  stickers: string[];
  stars: number;
}
export const AVATARS = ['🐯', '🐼', '🦊', '🐨', '🐸', '🦄', '🐵', '🐰'];

export function newPlayer(avatar: string, id = Math.random().toString(36).slice(2, 8)): Player {
  return { id, name: '', avatar, done: 0, stickers: [], stars: 0 };
}

/** Finishing a stop: a star, a sticker, and the next stop opens if this was the newest one. */
export function finishStop(p: Player, stop: number, sticker: Pic): void {
  p.stars++;
  if (!p.stickers.includes(sticker.e)) p.stickers.push(sticker.e);
  if (stop === p.done && p.done < STOP_COUNT) p.done++;
}

/** Can this stop be played? Every finished stop, and the next one. After the last stop all are open. */
export const isOpen = (p: Player, stop: number) => stop <= p.done || p.done >= STOP_COUNT;

/** Every fixed thing Hoot's Trail says, for the voice clip generator. */
export function allTrailPhrases(): Part[] {
  const out: Part[] = [
    en("Who's playing?"), en("Let's go!"), en('You got a sticker!'), en('Tap the present!'), en('Not yet!'),
    en('You finished the whole trail!'), en(TRY_AGAIN), en(LETS_COUNT), ...PRAISE.map((p) => en(p)),
  ];
  for (const lang of ['en', 'es'] as Lang[]) {
    for (const w of WORLDS) out.push(...worldParts(w, lang));
    for (let n = 1; n <= 10; n++) out.push(numberPart(n, lang));
    for (const s of STICKERS) out.push(...stickerParts(s, lang));
    const q = (x: Question) => out.push(...promptParts(x, lang));
    const c = (x: Question, v: string | number) => out.push(...choiceParts(x, v, lang));
    for (const l of LETTERS[lang]) {
      q({ kind: 'letter', target: l.ch, choices: [l.ch] });
      if (startsWith(l)) q({ kind: 'sound', target: l.ch, choices: [l.ch] });
      c({ kind: 'letter', target: l.ch, choices: [l.ch] }, l.ch);
    }
    const thing = THINGS[0];
    for (const t of THINGS) q({ kind: 'count', thing: t, n: 1, choices: [1] });
    for (let n = 1; n <= 10; n++) c({ kind: 'count', thing, n, choices: [n] }, n);
    for (const col of COLORS) {
      q({ kind: 'color', target: col.id, choices: [col.id] });
      c({ kind: 'color', target: col.id, choices: [col.id] }, col.id);
    }
    for (const s of SHAPES) {
      q({ kind: 'shape', target: s, choices: [s], colors: [] });
      c({ kind: 'shape', target: s, choices: [s], colors: [] }, s);
    }
    for (const s of ['big', 'small'] as const) {
      q({ kind: 'size', target: s, thing: '🐘', choices: [s] });
      c({ kind: 'size', target: s, thing: '🐘', choices: [s] }, s);
    }
    q({ kind: 'pattern', seq: [], answer: thing, choices: [] });
    for (const t of THINGS) c({ kind: 'pattern', seq: [], answer: t, choices: [] }, t.e);
    for (const p of DOT_PICS) {
      q({ kind: 'dots', pic: p });
      c({ kind: 'dots', pic: p }, p.id);
    }
  }
  return out;
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
