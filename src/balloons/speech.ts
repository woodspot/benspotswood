// What Balloon Pop says, in English or with the learning word in Spanish.
// Instructions are always English: "Pop the… rojo… balloon!"
import { COLOR_WORDS, en, es, numberWord, SHAPE_WORDS, type Lang, type Part } from '../kids/words';
import type { Spec, Target } from './game';

const cap = (w: string) => w[0].toUpperCase() + w.slice(1);

function wordFor(t: Target, lang: Lang): string {
  const w = t.kind === 'color' ? COLOR_WORDS[t.id] : t.kind === 'shape' ? SHAPE_WORDS[t.id] : null;
  return w ? w[lang] : '';
}

/** The ask: "Pop the red balloon!" / "Pop the… rojo… balloon!" */
export function promptParts(t: Target, lang: Lang): Part[] {
  const w = wordFor(t, lang);
  if (lang === 'en') {
    if (t.kind === 'color') return [en(`Pop the ${w} balloon!`)];
    if (t.kind === 'shape') return [en(`Pop the ${w}!`)];
    if (t.kind === 'count') return [en("Let's count! Pop a balloon!")];
    return [en('Pop the balloons!')];
  }
  if (t.kind === 'color') return [en('Pop the'), es(w), en('balloon!')];
  if (t.kind === 'shape') return [en('Pop the'), es(w)];
  if (t.kind === 'count') return [en("Let's count! Pop a balloon!")];
  return [en('Pop the balloons!')];
}

/** After a right answer, just the word: "Red!" / "¡Rojo!" */
export function praiseParts(t: Target, lang: Lang): Part[] {
  const w = wordFor(t, lang);
  if (!w) return [en('Yay!')];
  return lang === 'es' ? [es(`¡${cap(w)}!`)] : [en(`${cap(w)}!`)];
}

/** The short follow-on: "Now blue." / "Now… azul." */
export function nextParts(t: Target, lang: Lang): Part[] {
  const w = wordFor(t, lang);
  if (!w) return [];
  const lead = t.kind === 'shape' ? 'Now the' : 'Now';
  return lang === 'es' ? [en(lead), es(w)] : [en(`${lead} ${w}.`)];
}

/** Counting out loud as they pop: "one", "two"… "one hundred" or "uno", "dos"… "cien" */
export function countParts(n: number, lang: Lang): Part[] {
  const w = numberWord(n)[lang];
  return lang === 'es' ? [es(w)] : [en(w)];
}

/** In Spanish, every popped balloon says its colour (or shape) so the words soak in. */
export function nameParts(b: Spec, shapesMode: boolean, lang: Lang): Part[] {
  if (lang !== 'es') return [];
  return [es(shapesMode && b.shape ? SHAPE_WORDS[b.shape].es : COLOR_WORDS[b.color].es)];
}
