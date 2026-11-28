// Hoot's Trail: a winding learning trail for little ones, guided by Hoot the owl.
// Each stop is a few hands-on rounds: trace a letter and pop its bubbles, drop pictures in the right
// letter's basket, tap to count and feed a hungry friend, sort colours, fit shapes in their holes,
// big things to Big Bear, finish a bead pattern, dot-to-dot. Finishing a stop earns a sticker to put
// in that world's picture, and opens the next stop.
// No DOM here, so the rules and everything the voice says can be tested.
import { LETTERS, letterOf, letterPart, meetParts as letterMeet, wordPart, type Letter } from '../abc/game';
import { COLORS, type ColorId } from '../balloons/game';
import { ANIMALS } from '../barn/game';
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
/** How much of something, by world (0–3). */
const byWorld = <T>(w: number, list: [T, T, T, T]): T => list[Math.min(Math.max(w, 0), 3)];

// ── The trail ──────────────────────────────────────────────────

export type Kind = 'letter' | 'sound' | 'count' | 'color' | 'shape' | 'size' | 'pattern' | 'dots';

export interface World {
  id: string;
  name: { en: string; es: string };
  emoji: string;
  deco: string[]; // pictures along the path (and in the sticker picture)
}

/** Four worlds of ten stops; each world is a little harder than the one before. */
export const WORLDS: World[] = [
  { id: 'meadow', name: { en: 'the Meadow', es: 'el prado' }, emoji: '🌼', deco: ['🌸', '🐰', '🌳', '🐞', '🐝', '🌸', '🐑', '🌳'] },
  { id: 'beach', name: { en: 'the Beach', es: 'la playa' }, emoji: '🏖️', deco: ['🏝️', '🐳', '⛵', '🐟', '🐢', '🐙', '☀️', '🐟'] },
  { id: 'forest', name: { en: 'the Forest', es: 'el bosque' }, emoji: '🌲', deco: ['🌳', '🦉', '🦊', '🐻', '🐸', '🌳', '🐭', '🐞'] },
  { id: 'space', name: { en: 'Space', es: 'el espacio' }, emoji: '🚀', deco: ['🚀', '🌙', '⭐', '⭐', '🚀', '⭐', '🌙', '⭐'] },
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

// ── Things to count, feed, compare and line up ─────────────────

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
/** Food for hungry friends. */
export const FOODS: Thing[] = [
  THINGS[0],
  THINGS[5],
  THINGS[7],
  T('🥕', 'carrot', 'carrots', 'zanahoria', 'zanahorias'),
  T('🍓', 'strawberry', 'strawberries', 'fresa', 'fresas'),
];
// Things that look the same drawn big or small (and make sense either way).
export const SIZE_THINGS = ['🐘', '🐶', '⚽', '🌳', '🐟', '🍎', '🦆', '🚗'];

/** Hungry friends who ask to be fed. */
export interface Friend {
  e: string;
  name: { en: string; es: string };
}
export const FRIENDS: Friend[] = [
  { e: '🐰', name: { en: 'bunny', es: 'conejo' } },
  { e: '🐵', name: { en: 'monkey', es: 'mono' } },
  { e: '🐻', name: { en: 'bear', es: 'oso' } },
  { e: '🐘', name: { en: 'elephant', es: 'elefante' } },
  { e: '🐶', name: { en: 'puppy', es: 'perrito' } },
  { e: '🐼', name: { en: 'panda', es: 'panda' } },
];

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

// ── Rounds: one hands-on activity each ─────────────────────────

export type Round =
  | { kind: 'trace'; letter: string } // trace the big letter with a finger
  | { kind: 'pop'; letter: string; others: string[]; need: number } // pop the bubbles with that letter
  | { kind: 'sound'; letters: string[] } // a basket per letter: drop each picture in its first letter's basket
  | { kind: 'tapcount'; thing: Thing; n: number } // tap each one to count it
  | { kind: 'feed'; friend: Friend; food: Thing; n: number } // drag exactly n treats to a hungry friend
  | { kind: 'sort'; colors: ColorId[]; items: ColorId[] } // balls into the basket of their colour
  | { kind: 'shapes'; shapes: ShapeId[]; colors: string[] } // each shape into its hole
  | { kind: 'size'; things: string[] } // each thing comes big and small: big to Big Bear, small to Little Bear
  | { kind: 'pattern'; seq: Thing[]; blanks: Thing[]; tray: Thing[] } // finish the bead string
  | { kind: 'dots'; pic: DotPic };

/** Letters in play: the first few, then more of the alphabet as the worlds go on. */
export function letterPool(world: number, lang: Lang): Letter[] {
  const all = LETTERS[lang];
  return all.slice(0, Math.min(all.length, byWorld(world, [6, 13, 20, 99])));
}

const plain = (w: string) => w.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
/** Does the letter's picture word really start with it? (Not "kiwi" for W, "piña" for Ñ.) */
export const startsWith = (l: Letter) => l.ch !== 'Ñ' && plain(l.word).startsWith(plain(l.ch));

/** A count from 1 up to the world's top number. */
const countTo = (w: number, rng: Rng) => 1 + Math.floor(rng() * byWorld(w, [3, 5, 7, 10]));

function patternRound(w: number, rng: Rng): Extract<Round, { kind: 'pattern' }> {
  const [a, b, c] = shuffle(THINGS, rng);
  // Meadow: AB AB. Beach: AB AB, more to pick from. Forest: ABC ABC. Space: AAB AAB with two to fill.
  const unit = byWorld(w, [[a, b], [a, b], [a, b, c], [a, a, b]]);
  const blanksN = w >= 3 ? 2 : 1;
  const len = (unit.length === 2 ? 4 : 6) + (blanksN - 1);
  const all = Array.from({ length: len }, (_, i) => unit[i % unit.length]);
  const seq = all.slice(0, len - blanksN);
  const blanks = all.slice(len - blanksN);
  // The tray: what's needed, plus something else to think about.
  const extra = shuffle(THINGS.filter((t) => !unit.includes(t)), rng).slice(0, w === 0 ? 1 : 2);
  const need = [...new Set(blanks)];
  const tray = shuffle([...need, ...unit.filter((t) => !need.includes(t)).slice(0, 1), ...extra], rng);
  return { kind: 'pattern', seq, blanks, tray };
}

/** The rounds for one visit to a stop. */
export function newLesson(stop: Stop, lang: Lang, rng: Rng): Round[] {
  const w = Math.min(stop.world, 3);
  const letters = (n: number, firstSound = false) =>
    shuffle(letterPool(w, lang).filter((l) => !firstSound || startsWith(l)).map((l) => l.ch), rng).slice(0, n);
  switch (stop.kind) {
    case 'letter': {
      // Trace a letter, then pop its bubbles; then a second letter.
      const [a, b] = letters(2);
      const others = (t: string) => letters(5).filter((x) => x !== t).slice(0, byWorld(w, [1, 2, 2, 3]));
      return [
        { kind: 'trace', letter: a }, { kind: 'pop', letter: a, others: others(a), need: 3 },
        { kind: 'trace', letter: b }, { kind: 'pop', letter: b, others: others(b), need: 3 },
      ];
    }
    case 'sound':
      return Array.from({ length: 3 }, () => ({ kind: 'sound' as const, letters: letters(byWorld(w, [2, 2, 3, 3]), true) }));
    case 'count': {
      const thing = pick(rng, THINGS);
      const [f1, f2] = shuffle(FRIENDS, rng);
      const [d1, d2] = shuffle(FOODS, rng);
      return [
        { kind: 'tapcount', thing, n: Math.max(2, countTo(w, rng)) },
        { kind: 'feed', friend: f1, food: d1, n: countTo(w, rng) },
        { kind: 'feed', friend: f2, food: d2, n: Math.max(2, countTo(w, rng)) },
      ];
    }
    case 'color':
      return Array.from({ length: 3 }, () => {
        const colors = shuffle(COLORS.slice(0, byWorld(w, [4, 5, 7, 7])).map((c) => c.id), rng).slice(0, byWorld(w, [2, 2, 3, 3]));
        const items = shuffle(colors.flatMap((c) => [c, c]), rng); // two of each colour
        return { kind: 'sort' as const, colors, items };
      });
    case 'shape':
      return Array.from({ length: 3 }, () => {
        const shapes = shuffle(SHAPES.slice(0, byWorld(w, [4, 5, 6, 8])), rng).slice(0, byWorld(w, [2, 3, 3, 4]));
        // Every piece a different colour, so it's the shape they look at, not the colour.
        return { kind: 'shapes' as const, shapes, colors: shuffle(COLORS.map((c) => c.hex), rng).slice(0, shapes.length) };
      });
    case 'size':
      return Array.from({ length: 3 }, () => ({ kind: 'size' as const, things: shuffle(SIZE_THINGS, rng).slice(0, byWorld(w, [1, 1, 2, 2])) }));
    case 'pattern':
      return Array.from({ length: 3 }, () => patternRound(w, rng));
    case 'dots': {
      const pool = shuffle(DOT_PICS.slice(0, byWorld(w, [3, 4, 5, 6])), rng);
      return [{ kind: 'dots', pic: pool[0] }, { kind: 'dots', pic: pool[1] }];
    }
  }
}

/** The pieces a child moves in a round, each with what it belongs to (for drag-and-drop rounds). */
export function piecesOf(r: Round): { id: string; goes: string }[] {
  switch (r.kind) {
    case 'sound':
      return r.letters.map((ch) => ({ id: ch, goes: ch }));
    case 'sort':
      return r.items.map((c, i) => ({ id: `${c}-${i}`, goes: c }));
    case 'shapes':
      return r.shapes.map((s) => ({ id: s, goes: s }));
    case 'size':
      return r.things.flatMap((_t, i) => [{ id: `big-${i}`, goes: 'big' }, { id: `small-${i}`, goes: 'small' }]);
    case 'pattern':
      return r.tray.map((t, i) => ({ id: `${i}`, goes: t.e }));
    case 'feed':
      return Array.from({ length: r.n + 2 }, (_, i) => ({ id: `${i}`, goes: 'friend' }));
    default:
      return [];
  }
}

// ── Speech ─────────────────────────────────────────────────────
// Like the other toddler games: instructions in English, the word being learned in the chosen language.

const bang = (w: { en: string; es: string }, lang: Lang): Part => (lang === 'es' ? es(`¡${cap(w.es)}!`) : en(`${cap(w.en)}!`));

export const SIZE_WORDS = { big: { en: 'big', es: 'grande' }, small: { en: 'small', es: 'pequeño' } };

/** What Hoot (or the hungry friend) says to start a round. */
export function promptParts(r: Round, lang: Lang): Part[] {
  const es1 = lang === 'es';
  switch (r.kind) {
    case 'trace': {
      const l = letterOf(r.letter, lang);
      return es1 ? [en('Trace the letter'), letterPart(l, lang)] : [en(`Trace the letter ${l.ch}!`)];
    }
    case 'pop': {
      const l = letterOf(r.letter, lang);
      return es1 ? [en('Pop every'), letterPart(l, lang)] : [en(`Pop every ${l.ch}!`)];
    }
    case 'sound':
      return [en('Put each picture in the basket with its first letter!')];
    case 'tapcount':
      return es1 ? [en("Let's count the"), es(`¡${r.thing.many.es}!`)] : [en(`Let's count the ${r.thing.many.en}!`)];
    case 'feed':
      return [en("I'm hungry! Can I have"), numberPart(r.n, lang), foodPart(r.food, r.n, lang)];
    case 'sort':
      return [en('Put each ball in the basket of its color!')];
    case 'shapes':
      return [en('Put each shape in its hole!')];
    case 'size':
      return [en('Big ones for Big Bear, small ones for Little Bear!')];
    case 'pattern':
      return [en('What comes next?')];
    case 'dots':
      return [en('Connect the dots! Start at one.')];
  }
}

/** "apples?" / "manzanas?" (or one "apple?") */
export const foodPart = (t: Thing, n: number, lang: Lang): Part => {
  const w = n === 1 ? t.one : t.many;
  return lang === 'es' ? es(`¿${w.es}?`) : en(`${w.en}?`);
};

/** The letter, said inside a sentence in English so the voice says its name: "That's B!" */
export const thatsLetter = (ch: string, lang: Lang): Part[] =>
  lang === 'es' ? [en("That's"), letterPart(letterOf(ch, lang), lang)] : [en(`That's ${ch}!`)];

/** Meeting a letter: "B is for ball!" / "¡Be! ¡Ballena!" */
export const letterParts = (ch: string, lang: Lang): Part[] => letterMeet(letterOf(ch, lang), lang);
/** A letter's picture word: "Ball!" */
export const letterWordPart = (ch: string, lang: Lang): Part => wordPart(letterOf(ch, lang), lang);

export const colorPart = (c: ColorId, lang: Lang): Part => bang(COLOR_WORDS[c], lang);
export const shapePart = (s: ShapeId, lang: Lang): Part => bang(SHAPE_NAMES[s], lang);
export const sizePart = (s: 'big' | 'small', lang: Lang): Part => bang(SIZE_WORDS[s], lang);
export const thingPart = (t: Thing, lang: Lang): Part => bang(t.one, lang);
/** "Three apples!" after tap-counting. */
export const countedParts = (t: Thing, n: number, lang: Lang): Part[] => [numberPart(n, lang), lang === 'es' ? es(`¡${(n === 1 ? t.one : t.many).es}!`) : en(`${(n === 1 ? t.one : t.many).en}!`)];
export const dotsDonePart = (p: DotPic, lang: Lang): Part => bang(p.name, lang);

/** Counting out loud. */
export const numberPart = (n: number, lang: Lang): Part => (lang === 'es' ? es(numberWord(n).es) : en(numberWord(n).en));

export const PRAISE = ['Yes!', 'Great job!', 'You did it!', 'Wow!', 'Super!', 'Hooray!'];
export const YUM = 'Yum yum! Thank you!';
export const STICKER_PLACE = 'Put your sticker in your picture!';

export const worldParts = (w: World, lang: Lang): Part[] =>
  lang === 'es' ? [en('Welcome to'), es(`¡${cap(w.name.es)}!`)] : [en(`Welcome to ${w.name.en}!`)];

// ── Stickers ───────────────────────────────────────────────────

/** Every sticker that can be won: the pictures from Match It!, so each has a name to hear. */
export const STICKERS: Pic[] = [...PICS.animals, ...PICS.vehicles, ...PICS.food];
export const stickerParts = (p: Pic, lang: Lang) => picName(p, lang);

/** The animal stickers that have a real sound (Barnyard's recordings, plus the lion). */
export const STICKER_SOUND: Record<string, string> = Object.fromEntries([
  ...ANIMALS.map((a) => [a.emoji, a.id]),
  ['🦁', 'lion'],
]);

/** A sticker they don't have yet (or any, once the book is full). */
export function newSticker(have: readonly string[], rng: Rng): Pic {
  const left = STICKERS.filter((s) => !have.includes(s.e));
  return pick(rng, left.length ? left : STICKERS);
}

// ── Players (each twin gets their own trail) ───────────────────

/** A sticker stuck in a world's picture, at x/y percent across and down. */
export interface Placed {
  e: string;
  x: number;
  y: number;
}

export interface Player {
  id: string;
  name: string;
  avatar: string;
  done: number; // stops finished in order: the next stop is `done`
  stickers: string[];
  stars: number;
  scenes?: Record<string, Placed[]>; // world id → stickers in its picture
}
export const AVATARS = ['🐯', '🐼', '🦊', '🐨', '🐸', '🦄', '🐵', '🐰'];

export function newPlayer(avatar: string, id = Math.random().toString(36).slice(2, 8)): Player {
  return { id, name: '', avatar, done: 0, stickers: [], stars: 0, scenes: {} };
}

/** Finishing a stop: a star, a sticker, and the next stop opens if this was the newest one. */
export function finishStop(p: Player, stop: number, sticker: Pic): void {
  p.stars++;
  if (!p.stickers.includes(sticker.e)) p.stickers.push(sticker.e);
  if (stop === p.done && p.done < STOP_COUNT) p.done++;
}

/** Can this stop be played? Every finished stop, and the next one. After the last stop all are open. */
export const isOpen = (p: Player, stop: number) => stop <= p.done || p.done >= STOP_COUNT;

/** Worlds whose picture can be decorated: every world reached so far. */
export const openWorlds = (p: Player) => WORLDS.filter((_, i) => i * STOPS_PER_WORLD <= Math.min(p.done, STOP_COUNT - 1));

/** Stickers they have that aren't in any picture yet. */
export function unplaced(p: Player): string[] {
  const used = new Set(Object.values(p.scenes ?? {}).flat().map((s) => s.e));
  return p.stickers.filter((e) => !used.has(e));
}

/** Put a sticker in a world's picture (or move it there). Positions are kept inside the picture. */
export function placeSticker(p: Player, world: string, e: string, x: number, y: number): void {
  p.scenes ??= {};
  for (const list of Object.values(p.scenes)) {
    const i = list.findIndex((s) => s.e === e);
    if (i >= 0) list.splice(i, 1);
  }
  const clamp = (v: number) => Math.round(Math.min(94, Math.max(6, v)));
  (p.scenes[world] ??= []).push({ e, x: clamp(x), y: clamp(y) });
}

// ── Everything Hoot's Trail says, for the voice clip generator ──

export function allTrailPhrases(): Part[] {
  const out: Part[] = [
    en("Who's playing?"), en("Let's go!"), en('You got a sticker!'), en('Tap the present!'), en('Not yet!'),
    en('You finished the whole trail!'), en(YUM), en(STICKER_PLACE), ...PRAISE.map((p) => en(p)),
  ];
  const round = (r: Round, lang: Lang) => out.push(...promptParts(r, lang));
  for (const lang of ['en', 'es'] as Lang[]) {
    for (const w of WORLDS) out.push(...worldParts(w, lang));
    for (let n = 1; n <= 10; n++) out.push(numberPart(n, lang));
    for (const s of STICKERS) out.push(...stickerParts(s, lang));
    for (const l of LETTERS[lang]) {
      round({ kind: 'trace', letter: l.ch }, lang);
      round({ kind: 'pop', letter: l.ch, others: [], need: 1 }, lang);
      out.push(...letterParts(l.ch, lang), ...thatsLetter(l.ch, lang), letterWordPart(l.ch, lang));
    }
    for (const t of THINGS) {
      round({ kind: 'tapcount', thing: t, n: 2 }, lang);
      out.push(thingPart(t, lang));
      for (let n = 1; n <= 10; n++) out.push(...countedParts(t, n, lang));
    }
    for (const f of FOODS) for (let n = 1; n <= 10; n++) round({ kind: 'feed', friend: FRIENDS[0], food: f, n }, lang);
    for (const c of COLORS) out.push(colorPart(c.id, lang));
    for (const s of SHAPES) out.push(shapePart(s, lang));
    for (const s of ['big', 'small'] as const) out.push(sizePart(s, lang));
    for (const p of DOT_PICS) out.push(dotsDonePart(p, lang));
    for (const r of [
      { kind: 'sound', letters: [] }, { kind: 'sort', colors: [], items: [] }, { kind: 'shapes', shapes: [], colors: [] },
      { kind: 'size', things: [] }, { kind: 'pattern', seq: [], blanks: [], tray: [] }, { kind: 'dots', pic: DOT_PICS[0] },
    ] as Round[]) round(r, lang);
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
