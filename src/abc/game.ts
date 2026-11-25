// ABC: the letters, a picture word for each, and the two ways to play. No DOM here, so it can be tested.
//  - ABC: tap any letter; it pops up big, says its name and a word that starts with it ("B! Ball!").
//  - Find it!: "Find the letter B!" with 2 letters to choose from, growing to 4. A wrong tap just says
//    that letter's own name and word, so they learn it anyway.
// Spanish has its own letter names (be, ce, de…), its own words, and the Ñ.
import { en, es, type Lang, type Part } from '../kids/words';

export interface Letter {
  ch: string; // the capital letter
  name: string; // how it's said aloud (English: the letter itself, which the voices read correctly)
  word: string; // a word with the letter, usually first
  emoji: string;
}

const L = (ch: string, name: string, word: string, emoji: string): Letter => ({ ch, name, word, emoji });

export const LETTERS: Record<Lang, Letter[]> = {
  en: [
    L('A', 'A', 'apple', '🍎'), L('B', 'B', 'ball', '⚽'), L('C', 'C', 'cat', '🐱'), L('D', 'D', 'dog', '🐶'),
    L('E', 'E', 'egg', '🥚'), L('F', 'F', 'fish', '🐟'), L('G', 'G', 'grapes', '🍇'), L('H', 'H', 'hat', '🎩'),
    L('I', 'I', 'ice cream', '🍦'), L('J', 'J', 'juice', '🧃'), L('K', 'K', 'key', '🔑'), L('L', 'L', 'lion', '🦁'),
    L('M', 'M', 'moon', '🌙'), L('N', 'N', 'nose', '👃'), L('O', 'O', 'octopus', '🐙'), L('P', 'P', 'pig', '🐷'),
    L('Q', 'Q', 'queen', '👸'), L('R', 'R', 'rabbit', '🐰'), L('S', 'S', 'sun', '☀️'), L('T', 'T', 'train', '🚂'),
    L('U', 'U', 'umbrella', '☂️'), L('V', 'V', 'violin', '🎻'), L('W', 'W', 'whale', '🐳'), L('X', 'X', 'box', '📦'),
    L('Y', 'Y', 'yo-yo', '🪀'), L('Z', 'Z', 'zebra', '🦓'),
  ],
  // Letter names are spelled out so the Spanish voice says "be", not "b" or the English name.
  es: [
    L('A', 'a', 'abeja', '🐝'), L('B', 'be', 'ballena', '🐳'), L('C', 'ce', 'casa', '🏠'), L('D', 'de', 'dinosaurio', '🦕'),
    L('E', 'e', 'elefante', '🐘'), L('F', 'efe', 'flor', '🌸'), L('G', 'ge', 'gato', '🐱'), L('H', 'hache', 'helado', '🍦'),
    L('I', 'i', 'isla', '🏝️'), L('J', 'jota', 'jirafa', '🦒'), L('K', 'ka', 'koala', '🐨'), L('L', 'ele', 'león', '🦁'),
    L('M', 'eme', 'manzana', '🍎'), L('N', 'ene', 'nube', '☁️'), L('Ñ', 'eñe', 'piña', '🍍'), L('O', 'o', 'oso', '🐻'),
    L('P', 'pe', 'perro', '🐶'), L('Q', 'cu', 'queso', '🧀'), L('R', 'erre', 'ratón', '🐭'), L('S', 'ese', 'sol', '☀️'),
    L('T', 'te', 'tortuga', '🐢'), L('U', 'u', 'uvas', '🍇'), L('V', 'uve', 'vaca', '🐮'), L('W', 'uve doble', 'kiwi', '🥝'),
    L('X', 'equis', 'saxofón', '🎷'), L('Y', 'ye', 'yoyó', '🪀'), L('Z', 'zeta', 'zapato', '👟'),
  ],
};

export const letterOf = (ch: string, lang: Lang): Letter => LETTERS[lang].find((l) => l.ch === ch) ?? LETTERS[lang][0];

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

/** The letter's name: "B!" or "¡Be!" */
export const letterPart = (l: Letter, lang: Lang): Part => (lang === 'es' ? es(`¡${cap(l.name)}!`) : en(`${l.name}!`));

/** Its word: "Ball!" or "¡Ballena!" */
export const wordPart = (l: Letter, lang: Lang): Part => (lang === 'es' ? es(`¡${cap(l.word)}!`) : en(`${cap(l.word)}!`));

/** Meeting a letter: its name, then its word. */
export const meetParts = (l: Letter, lang: Lang): Part[] => [letterPart(l, lang), wordPart(l, lang)];

/** "Find the letter B!" / "Find the letter… be!" */
export const questionParts = (l: Letter, lang: Lang): Part[] =>
  lang === 'es' ? [en('Find the letter'), es(`¡${l.name}!`)] : [en(`Find the letter ${l.name}!`)];

// ── Find it! ───────────────────────────────────────────────────

/** How many letters to choose from: 2 at first, up to 4 as they get them right. */
export const choicesFor = (wins: number) => Math.min(4, 2 + Math.floor(wins / 4));

// Letters that look alike are kept apart while there are only a few choices, so it's fair for little eyes.
const LOOKALIKE = [['M', 'W'], ['N', 'Ñ'], ['O', 'Q'], ['C', 'G'], ['E', 'F'], ['P', 'R'], ['U', 'V']];
const alike = (a: string, b: string) => LOOKALIKE.some((g) => g.includes(a) && g.includes(b));

export interface QuizRound {
  letters: string[]; // left to right
  target: string;
}

export function newQuiz(wins: number, lang: Lang, rng: Rng, prev?: QuizRound): QuizRound {
  const pool = shuffle(LETTERS[lang].map((l) => l.ch), rng);
  // Don't ask for the same letter twice in a row.
  const target = pool.find((ch) => ch !== prev?.target)!;
  const others = pool.filter((ch) => ch !== target && !alike(ch, target)).slice(0, choicesFor(wins) - 1);
  return { letters: shuffle([target, ...others], rng), target };
}

export const isRight = (r: QuizRound, ch: string) => r.target === ch;
