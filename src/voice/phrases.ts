// Every fixed phrase the toddler games can say, in every language and voice. This is the list the
// voice generator (scripts/gen-voices.mjs) turns into natural-sounding clips. Anything not on it
// (custom family names, for example) falls back to the device's own speech.
import { nextParts, countParts, nameParts as balloonNames, praiseParts, promptParts } from '../balloons/speech';
import { COLORS, SHAPES, type Target } from '../balloons/game';
import { nameParts as matchNames, PICS } from '../match/game';
import { CONTACTS, KEYS, keyWord } from '../phone/game';
import { clipKey, en, es, type Lang, type Part } from '../kids/words';

const LANGS: Lang[] = ['en', 'es'];

/** Shared bits: greetings and cheers used by more than one game. */
const shared = (): Part[] => [en('Hello!'), es('¡Hola!'), en('Hooray!')];

function balloons(): Part[] {
  const targets: Target[] = [
    { kind: 'any' },
    ...COLORS.map((c) => ({ kind: 'color', id: c.id }) as Target),
    ...SHAPES.map((id) => ({ kind: 'shape', id }) as Target),
    ...[1, 2, 3, 4, 5].map((n) => ({ kind: 'count', n }) as Target),
  ];
  const out: Part[] = [];
  for (const lang of LANGS) {
    for (const t of targets) out.push(...promptParts(t, lang), ...praiseParts(t, lang), ...nextParts(t, lang));
    for (let n = 1; n <= 5; n++) out.push(...countParts(n, lang));
    for (const c of COLORS) out.push(...balloonNames({ color: c.id, shape: null }, false, lang));
    for (const s of SHAPES) out.push(...balloonNames({ color: 'red', shape: s }, true, lang));
  }
  return out;
}

function match(): Part[] {
  const out: Part[] = [en('Find the same one!'), en('Find the pairs!')];
  for (const lang of LANGS) for (const list of Object.values(PICS)) for (const p of list) out.push(...matchNames(p, lang));
  return out;
}

function phone(): Part[] {
  const out: Part[] = [en('Press the numbers!'), en('Calling'), en('is calling!')];
  for (const lang of LANGS) for (const k of KEYS) out.push(keyWord(k, lang));
  for (const c of CONTACTS) {
    out.push(en(`Calling ${c.name.en}!`), en(`${c.name.en} is calling!`), es(c.name.es));
    for (const lang of LANGS)
      for (const lines of Object.values(c.lines))
        for (const text of lines[lang]) out.push({ ...(lang === 'es' ? es(text) : en(text)), voice: c.voice });
  }
  return out;
}

/** Every phrase, once each. */
export function allPhrases(): Part[] {
  const seen = new Map<string, Part>();
  for (const p of [...shared(), ...balloons(), ...match(), ...phone()]) {
    const key = clipKey(p);
    if (p.text && !seen.has(key)) seen.set(key, { text: p.text, lang: p.lang, voice: p.voice ?? 'female' });
  }
  return [...seen.values()];
}
