// Barnyard: the animals, what they say, and the two ways to play. No DOM here, so it can be tested.
//  - Peek: tap the barn door, a haystack, a bush… and an animal pops out, says its sound and its name.
//  - Who says? Three or four animals stand in the meadow; the voice asks "Who says moo?" or
//    "Where's the cow?" and the child taps the right one. A wrong tap just plays that animal's sound.
import { en, es, type Lang, type Part, type VoiceKey } from '../kids/words';

export interface Animal {
  id: string;
  emoji: string;
  name: { en: string; es: string };
  sound: { en: string; es: string }; // spoken by the animal
  voice: VoiceKey; // big animals get a deeper voice
}

const big: VoiceKey = 'bigcritter';
const small: VoiceKey = 'critter';

export const ANIMALS: Animal[] = [
  { id: 'cow', emoji: '🐮', name: { en: 'cow', es: 'vaca' }, sound: { en: 'Moo!', es: '¡Muu!' }, voice: big },
  { id: 'pig', emoji: '🐷', name: { en: 'pig', es: 'cerdo' }, sound: { en: 'Oink oink!', es: '¡Oinc oinc!' }, voice: big },
  { id: 'sheep', emoji: '🐑', name: { en: 'sheep', es: 'oveja' }, sound: { en: 'Baa!', es: '¡Beee!' }, voice: small },
  { id: 'horse', emoji: '🐴', name: { en: 'horse', es: 'caballo' }, sound: { en: 'Neigh!', es: '¡Hiiii!' }, voice: big },
  { id: 'chicken', emoji: '🐔', name: { en: 'chicken', es: 'gallina' }, sound: { en: 'Cluck cluck!', es: '¡Clo clo!' }, voice: small },
  { id: 'duck', emoji: '🦆', name: { en: 'duck', es: 'pato' }, sound: { en: 'Quack quack!', es: '¡Cuac cuac!' }, voice: small },
  { id: 'dog', emoji: '🐶', name: { en: 'dog', es: 'perro' }, sound: { en: 'Woof woof!', es: '¡Guau guau!' }, voice: big },
  { id: 'cat', emoji: '🐱', name: { en: 'cat', es: 'gato' }, sound: { en: 'Meow!', es: '¡Miau!' }, voice: small },
  { id: 'goat', emoji: '🐐', name: { en: 'goat', es: 'cabra' }, sound: { en: 'Maa!', es: '¡Meee!' }, voice: big },
  { id: 'rooster', emoji: '🐓', name: { en: 'rooster', es: 'gallo' }, sound: { en: 'Cock-a-doodle-doo!', es: '¡Quiquiriquí!' }, voice: small },
  { id: 'turkey', emoji: '🦃', name: { en: 'turkey', es: 'pavo' }, sound: { en: 'Gobble gobble!', es: '¡Glu glu glu!' }, voice: big },
  { id: 'mouse', emoji: '🐭', name: { en: 'mouse', es: 'ratón' }, sound: { en: 'Squeak squeak!', es: '¡Iii iii!' }, voice: small },
  { id: 'frog', emoji: '🐸', name: { en: 'frog', es: 'rana' }, sound: { en: 'Ribbit!', es: '¡Croac croac!' }, voice: small },
  { id: 'owl', emoji: '🦉', name: { en: 'owl', es: 'búho' }, sound: { en: 'Hoo hoo!', es: '¡Uuu uuu!' }, voice: small },
  { id: 'bee', emoji: '🐝', name: { en: 'bee', es: 'abeja' }, sound: { en: 'Buzzz!', es: '¡Bzzz!' }, voice: small },
];

export const ANIMAL_MAP: Record<string, Animal> = Object.fromEntries(ANIMALS.map((a) => [a.id, a]));

/** Places on the farm where animals hide (Peek mode). */
export const SPOTS = ['barn', 'hay', 'tree', 'pond', 'coop', 'tractor', 'flowers', 'fence'] as const;
export type Spot = (typeof SPOTS)[number];

export type Rng = () => number;
const cap = (w: string) => w.charAt(0).toUpperCase() + w.slice(1);

function shuffle<T>(list: readonly T[], rng: Rng): T[] {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ── Speech ─────────────────────────────────────────────────────

/** The animal's own sound, in its own voice. */
export const soundPart = (a: Animal, lang: Lang): Part => ({ ...(lang === 'es' ? es(a.sound.es) : en(a.sound.en)), voice: a.voice });

/** The animal's name: "Cow!" or "¡Vaca!" */
export const namePart = (a: Animal, lang: Lang): Part => (lang === 'es' ? es(`¡${cap(a.name.es)}!`) : en(`${cap(a.name.en)}!`));

/** What happens when an animal appears: its sound, then its name. */
export const meetParts = (a: Animal, lang: Lang): Part[] => [soundPart(a, lang), namePart(a, lang)];

export type Question = { kind: 'sound' | 'name'; animal: string };

/** "Who says moo?" / "Who says… ¡muu!?" or "Where's the cow?" / "Where's the… vaca?" */
export function questionParts(q: Question, lang: Lang): Part[] {
  const a = ANIMAL_MAP[q.animal];
  const bare = (t: string) => t.replace(/[¡!]/g, '').toLowerCase();
  if (q.kind === 'sound') return lang === 'es' ? [en('Who says'), es(`${bare(a.sound.es)}?`)] : [en(`Who says ${bare(a.sound.en)}?`)];
  return lang === 'es' ? [en('Where is the'), es(a.name.es)] : [en(`Where is the ${a.name.en}?`)];
}

// ── Peek ───────────────────────────────────────────────────────

/** Who hides where this time. Animals are spread out so the same one doesn't hide twice. */
export function hideAnimals(rng: Rng, avoid: string[] = []): Record<Spot, string> {
  const pool = shuffle(ANIMALS.map((a) => a.id).filter((id) => !avoid.includes(id)), rng);
  const out = {} as Record<Spot, string>;
  SPOTS.forEach((s, i) => (out[s] = pool[i % pool.length]));
  return out;
}

/** After an animal has been found, a different one hides there next time. */
export function rehide(hidden: Record<Spot, string>, spot: Spot, rng: Rng): Record<Spot, string> {
  const showing = new Set(Object.values(hidden));
  const options = ANIMALS.map((a) => a.id).filter((id) => !showing.has(id));
  return { ...hidden, [spot]: options[Math.floor(rng() * options.length)] ?? hidden[spot] };
}

// ── Who says? ──────────────────────────────────────────────────

/** How many animals to choose from: 2 at first, up to 4 as they get them right. */
export const choicesFor = (wins: number) => Math.min(4, 2 + Math.floor(wins / 4));

export interface QuizRound {
  animals: string[]; // in the meadow, left to right
  question: Question;
}

export function newQuiz(wins: number, rng: Rng, prev?: QuizRound): QuizRound {
  const pool = shuffle(ANIMALS.map((a) => a.id), rng);
  // Don't ask about the same animal twice in a row.
  const target = pool.find((id) => id !== prev?.question.animal)!;
  const others = pool.filter((id) => id !== target).slice(0, choicesFor(wins) - 1);
  const animals = shuffle([target, ...others], rng);
  // Mostly sounds at first; names come in as they grow.
  const kind: Question['kind'] = rng() < (wins < 4 ? 0.75 : 0.5) ? 'sound' : 'name';
  return { animals, question: { kind, animal: target } };
}

export const isRight = (r: QuizRound, animal: string) => r.question.animal === animal;
