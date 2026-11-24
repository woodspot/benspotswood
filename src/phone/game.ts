// Toy Phone: the words and characters, kept free of the DOM so they can be tested.
import { en, es, NUMBER_WORDS, type Lang, type Part, type VoiceKey } from '../kids/words';

// ── Keypad ─────────────────────────────────────────────────────

/** Keypad layout. ⭐ and ❤️ stand in for * and # so every key is a word a toddler can learn. */
export const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '⭐', '0', '❤️'] as const;
export type Key = (typeof KEYS)[number];

export function keyWord(key: Key, lang: Lang): Part {
  if (key === '⭐') return lang === 'es' ? es('estrella') : en('star');
  if (key === '❤️') return lang === 'es' ? es('corazón') : en('heart');
  const w = NUMBER_WORDS[Number(key)];
  return lang === 'es' ? es(w.es) : en(w.en);
}

/** Real telephone (DTMF) tone pairs, so each key beeps like a real phone. */
export const DTMF: Record<Key, [number, number]> = {
  '1': [697, 1209], '2': [697, 1336], '3': [697, 1477],
  '4': [770, 1209], '5': [770, 1336], '6': [770, 1477],
  '7': [852, 1209], '8': [852, 1336], '9': [852, 1477],
  '⭐': [941, 1209], '0': [941, 1336], '❤️': [941, 1477],
};

// ── Who you can call ───────────────────────────────────────────

export type LineKind = 'hello' | 'more' | 'kiss' | 'wave' | 'bye';

export interface Contact {
  id: string;
  emoji: string;
  color: string; // avatar background
  family: boolean; // a grown-up can rename these and add a photo
  pitch: number; // voice: 1 normal, lower is deeper (kept gentle: big shifts sound robotic)
  voice: VoiceKey;
  rate: number;
  name: { en: string; es: string };
  lines: Record<LineKind, { en: string[]; es: string[] }>;
}

const familyLines = (who: { en: string; es: string }) => ({
  hello: {
    en: ['Hello sweetie! I love you!', 'Hi! Are you having fun today?', 'Hello! I miss you! Big hugs!'],
    es: ['¡Hola, mi amor! ¡Te quiero mucho!', '¡Hola! ¿Cómo estás?', '¡Hola! ¡Te extraño! ¡Un abrazo grande!'],
  },
  more: {
    en: ['What did you play today?', 'You are so clever!', 'Can you count to three? One, two, three!', `It's ${who.en}! I love talking to you!`],
    es: ['¿A qué jugaste hoy?', '¡Qué inteligente eres!', '¿Cuentas hasta tres? ¡Uno, dos, tres!', `¡Soy ${who.es}! ¡Me encanta hablar contigo!`],
  },
  kiss: { en: ['Mwah! A big kiss for you!', 'Mwah mwah!'], es: ['¡Muak! ¡Un besito para ti!', '¡Muak muak!'] },
  wave: { en: ['Hi hi! I see you waving!', 'Hello! Wave wave!'], es: ['¡Hola hola! ¡Te veo!', '¡Hola! ¡Adiós con la manita!'] },
  bye: { en: ['Bye bye! I love you!', 'Bye! See you soon!'], es: ['¡Adiós! ¡Te quiero!', '¡Chao! ¡Hasta pronto!'] },
});

const animalLines = (en1: string, es1: string) => ({
  hello: { en: [`${en1} Hello!`, `${en1}`], es: [`${es1} ¡Hola!`, `${es1}`] },
  more: { en: [`${en1}`, `${en1} ${en1}`], es: [`${es1}`, `${es1} ${es1}`] },
  kiss: { en: [`Mwah! ${en1}`], es: [`¡Muak! ${es1}`] },
  wave: { en: [`${en1} Hi hi!`], es: [`${es1} ¡Hola hola!`] },
  bye: { en: [`${en1} Bye bye!`], es: [`${es1} ¡Adiós!`] },
});

export const fam = (id: string, emoji: string, color: string, name: { en: string; es: string }, voice: VoiceKey, pitch: number, rate: number): Contact => ({
  id, emoji, color, family: true, voice, pitch, rate, name, lines: familyLines(name),
});
const animal = (id: string, emoji: string, color: string, name: { en: string; es: string }, sound: [string, string], voice: VoiceKey = 'critter', pitch = 1.2): Contact => ({
  id, emoji, color, family: false, voice, pitch, rate: 1, name, lines: animalLines(...sound),
});

export const CONTACTS: Contact[] = [
  fam('grandma', '👵', '#f6a5c0', { en: 'Grandma', es: 'Abuela' }, 'grandma', 1, 0.88),
  fam('grandpa', '👴', '#9cc7f2', { en: 'Grandpa', es: 'Abuelo' }, 'grandpa', 0.92, 0.85),
  fam('mommy', '👩', '#f7c873', { en: 'Mommy', es: 'Mamá' }, 'mommy', 1.05, 0.95),
  fam('daddy', '👨', '#8fd6a8', { en: 'Daddy', es: 'Papá' }, 'daddy', 1, 0.95),
  animal('dog', '🐶', '#e8c39e', { en: 'Doggy', es: 'Perrito' }, ['Woof woof!', '¡Guau guau!'], 'bigcritter', 1.15),
  animal('cat', '🐱', '#ffd9a8', { en: 'Kitty', es: 'Gatito' }, ['Meow!', '¡Miau!']),
  animal('cow', '🐮', '#d9e6f2', { en: 'Cow', es: 'Vaca' }, ['Moo!', '¡Muu!'], 'bigcritter', 0.85),
  animal('duck', '🦆', '#bfe3c0', { en: 'Duck', es: 'Pato' }, ['Quack quack!', '¡Cuac cuac!']),
  animal('lion', '🦁', '#f3c96b', { en: 'Lion', es: 'León' }, ['Roar!', '¡Grrr!'], 'bigcritter', 0.8),
  animal('pig', '🐷', '#f9c3d3', { en: 'Piggy', es: 'Cerdito' }, ['Oink oink!', '¡Oinc oinc!']),
  {
    id: 'santa', emoji: '🎅', color: '#f28b82', family: false, voice: 'santa', pitch: 0.85, rate: 0.85, name: { en: 'Santa', es: 'Santa' },
    lines: {
      hello: { en: ['Ho ho ho! Hello there!'], es: ['¡Jo jo jo! ¡Hola!'] },
      more: { en: ['Have you been good? Ho ho ho!', 'My reindeer say hello!'], es: ['¿Te portaste bien? ¡Jo jo jo!', '¡Mis renos te saludan!'] },
      kiss: { en: ['Ho ho! A kiss for you!'], es: ['¡Jo jo! ¡Un besito!'] },
      wave: { en: ['Ho ho ho! I see you!'], es: ['¡Jo jo jo! ¡Te veo!'] },
      bye: { en: ['Ho ho ho! Bye bye now!', 'Goodbye, little one! Ho ho ho!'], es: ['¡Adiós! ¡Jo jo jo!'] },
    },
  },
];

export const CONTACT_MAP: Record<string, Contact> = Object.fromEntries(CONTACTS.map((c) => [c.id, c]));

/** Grown-up edits for family contacts: a custom name ("Nana", "Abuelita"…) and a photo. */
export interface Custom {
  name?: string;
  photo?: string; // small JPEG data URL, stays on this device
}

export function displayName(c: Contact, custom: Custom | undefined, lang: Lang): string {
  return custom?.name?.trim() || c.name[lang];
}

export type Rng = () => number;

/** What the person on the phone says. Family use their custom name when they introduce themselves. */
export function lineFor(c: Contact, kind: LineKind, lang: Lang, rng: Rng, custom?: Custom): Part {
  const options = c.lines[kind][lang];
  let text = options[Math.floor(rng() * options.length)];
  if (c.family && custom?.name?.trim()) text = text.replace(c.name[lang], custom.name.trim());
  return { ...(lang === 'es' ? es(text) : en(text)), voice: c.voice, pitch: c.pitch, rate: c.rate };
}

/** Dialling a number calls someone; the same number always reaches the same friend. */
export function whoAnswers(digits: string, list: Contact[] = CONTACTS): Contact {
  let h = 0;
  for (const ch of digits) h = (h * 31 + ch.codePointAt(0)!) >>> 0;
  return list[h % list.length];
}
