// Pet Care: look after the animals. No DOM here, so it can be tested.
//  - Bath: a muddy animal in the tub. Scrub the mud off with the sponge (counting each spot), rinse
//    the bubbles with the shower, dry with the towel, and it's clean and happy.
//  - Meal time: hungry animals and a basket of food. Who eats what? Give each one its favourite
//    food; it says "yum" with its real sound.
import { en, es, type Lang, type Part } from '../kids/words';
import { nameParts, type Pic } from '../match/game';
import { hasSound } from '../kids/sounds';
import { numberWord } from '../kids/words';

export type Rng = () => number;

export function shuffle<T>(list: readonly T[], rng: Rng): T[] {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export interface Pet extends Pic {
  sound?: string; // its real recording, if there is one (see kids/sounds.ts)
}

const pet = (e: string, name: string, esName: string, sound?: string): Pet => ({ e, name, es: esName, sound });

// ── Bath ───────────────────────────────────────────────────────

/** Animals who get muddy (and look good in a bath). */
export const BATHERS: Pet[] = [
  pet('🐷', 'pig', 'cerdo', 'pig'),
  pet('🐶', 'dog', 'perro', 'dog'),
  pet('🐑', 'sheep', 'oveja', 'sheep'),
  pet('🐴', 'horse', 'caballo', 'horse'),
  pet('🐮', 'cow', 'vaca', 'cow'),
  pet('🐱', 'cat', 'gato', 'cat'),
  pet('🐼', 'panda', 'panda'),
  pet('🐘', 'elephant', 'elefante'),
  pet('🐐', 'goat', 'cabra', 'goat'),
  pet('🦆', 'duck', 'pato', 'duck'),
];

export type BathStep = 'scrub' | 'rinse' | 'dry';
export const BATH_STEPS: BathStep[] = ['scrub', 'rinse', 'dry'];

/** Mud spots to scrub: three at first, up to six. Positions are % across and down the animal (its top two thirds: the tub hides the rest). */
export function mudSpots(baths: number, rng: Rng): { x: number; y: number; r: number }[] {
  const n = Math.min(6, 3 + Math.floor(baths / 2));
  // Spread them out: pick from a grid of places, never two in the same one.
  const places = shuffle(
    [[26, 28], [50, 20], [74, 28], [22, 46], [50, 42], [78, 46], [34, 62], [66, 62], [50, 64]],
    rng,
  ).slice(0, n);
  return places.map(([x, y]) => ({ x: x + (rng() - 0.5) * 8, y: y + (rng() - 0.5) * 8, r: 6.5 + rng() * 3 }));
}

/** The next animal for the bath (not the same one twice in a row). */
export function nextBather(rng: Rng, prev?: string): Pet {
  const pool = BATHERS.filter((b) => b.e !== prev);
  return pool[Math.floor(rng() * pool.length)];
}

// ── Meal time ──────────────────────────────────────────────────

export interface Meal {
  pet: Pet;
  food: Pic;
}

/** Who eats what. */
export const MEALS: Meal[] = [
  { pet: pet('🐰', 'bunny', 'conejo'), food: { e: '🥕', name: 'carrot', es: 'zanahoria' } },
  { pet: pet('🐵', 'monkey', 'mono'), food: { e: '🍌', name: 'banana', es: 'plátano' } },
  { pet: pet('🐭', 'mouse', 'ratón', 'mouse'), food: { e: '🧀', name: 'cheese', es: 'queso' } },
  { pet: pet('🐱', 'cat', 'gato', 'cat'), food: { e: '🐟', name: 'fish', es: 'pescado' } },
  { pet: pet('🐶', 'dog', 'perro', 'dog'), food: { e: '🦴', name: 'bone', es: 'hueso' } },
  { pet: pet('🐻', 'bear', 'oso'), food: { e: '🍯', name: 'honey', es: 'miel' } },
  { pet: pet('🐔', 'chicken', 'gallina', 'chicken'), food: { e: '🌽', name: 'corn', es: 'maíz' } },
  { pet: pet('🐼', 'panda', 'panda'), food: { e: '🎋', name: 'bamboo', es: 'bambú' } },
  { pet: pet('🐴', 'horse', 'caballo', 'horse'), food: { e: '🍎', name: 'apple', es: 'manzana' } },
  { pet: pet('🐮', 'cow', 'vaca', 'cow'), food: { e: '🌾', name: 'hay', es: 'heno' } },
];

export interface MealRound {
  meals: Meal[]; // the hungry animals, left to right
  tray: string[]; // food in the basket (each animal's, plus some no one here wants)
}

/** Two hungry animals at first, then three; extra foods in the basket as they get better. */
export function newMealRound(rounds: number, rng: Rng, prev?: MealRound): MealRound {
  const n = rounds < 2 ? 2 : 3;
  const extra = rounds < 1 ? 0 : rounds < 4 ? 1 : 2;
  const last = new Set(prev?.meals.map((m) => m.pet.e));
  const fresh = shuffle(MEALS.filter((m) => !last.has(m.pet.e)), rng);
  const meals = fresh.slice(0, n);
  const others = shuffle(MEALS.filter((m) => !meals.includes(m)), rng).slice(0, extra).map((m) => m.food.e);
  return { meals, tray: shuffle([...meals.map((m) => m.food.e), ...others], rng) };
}

/** Is this food for this animal? */
export const eats = (petE: string, foodE: string) => MEALS.some((m) => m.pet.e === petE && m.food.e === foodE);

// ── Speech ─────────────────────────────────────────────────────

export const SAY = {
  bath: 'Bath time!',
  muddy: 'Oh no! So muddy!',
  scrub: 'Scrub off the mud!',
  rinse: 'Rinse off the bubbles!',
  dry: 'Dry with the towel!',
  clean: 'So clean!',
  meal: 'Meal time! Who eats what?',
  noThanks: 'No, thank you!',
  yum: 'Yum yum!',
  full: 'Everyone is full!',
};
export const PRAISE = ['Yes!', 'Great job!', 'You did it!', 'Wow!', 'Super!'];

export const petName = (p: Pic, lang: Lang): Part[] => nameParts(p, lang);
export const foodName = (p: Pic, lang: Lang): Part[] => nameParts(p, lang);

/** The animal's own sound (its real recording), when it has one. */
export const petSound = (p: Pet): Part[] => (p.sound && hasSound(p.sound) ? [{ ...en(`${p.name}!`), sound: p.sound }] : []);

/** Counting the mud spots: "One!" / "¡Uno!" */
export const countPart = (n: number, lang: Lang): Part => {
  const w = numberWord(n);
  const cap = (s: string) => s[0].toUpperCase() + s.slice(1);
  return lang === 'es' ? es(`¡${cap(w.es)}!`) : en(`${cap(w.en)}!`);
};

export const STEP_SAY: Record<BathStep, string> = { scrub: SAY.scrub, rinse: SAY.rinse, dry: SAY.dry };

export function allCarePhrases(): Part[] {
  const out: Part[] = [...Object.values(SAY).map((t) => en(t)), ...PRAISE.map((t) => en(t)), en('Hooray!')];
  for (const lang of ['en', 'es'] as Lang[]) {
    for (const p of [...BATHERS, ...MEALS.map((m) => m.pet)]) out.push(...petName(p, lang));
    for (const m of MEALS) out.push(...foodName(m.food, lang));
    for (let n = 1; n <= 6; n++) out.push(countPart(n, lang));
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
