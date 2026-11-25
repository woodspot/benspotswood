import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../match/game';
import { choicesFor, isRight, LETTERS, letterOf, meetParts, newQuiz, questionParts } from './game';

describe('abc', () => {
  it('has every letter, and Spanish adds the Ñ', () => {
    expect(LETTERS.en.map((l) => l.ch).join('')).toBe('ABCDEFGHIJKLMNOPQRSTUVWXYZ');
    expect(LETTERS.es.map((l) => l.ch).join('')).toBe('ABCDEFGHIJKLMNÑOPQRSTUVWXYZ');
  });

  it('every word contains its letter', () => {
    for (const lang of ['en', 'es'] as const)
      for (const l of LETTERS[lang]) expect(l.word.toUpperCase(), `${lang} ${l.ch}`).toContain(l.ch);
  });

  it('says the letter, then its word', () => {
    expect(meetParts(letterOf('B', 'en'), 'en')).toEqual([{ text: 'B', lang: 'en', voice: 'letters' }, { text: 'Ball!', lang: 'en' }]);
    expect(meetParts(letterOf('W', 'en'), 'en')[0].text).toBe('Double-you');
    expect(meetParts(letterOf('B', 'es'), 'es')).toEqual([{ text: '¡Be!', lang: 'es', voice: 'letters' }, { text: '¡Ballena!', lang: 'es' }]);
  });

  it('asks in English, with the letter name in Spanish', () => {
    expect(questionParts(letterOf('G', 'en'), 'en')).toEqual([{ text: 'Find the letter G!', lang: 'en' }]);
    expect(questionParts(letterOf('G', 'es'), 'es')).toEqual([{ text: 'Find the letter', lang: 'en' }, { text: '¡ge!', lang: 'es' }]);
  });

  it('quiz rounds hold the answer once, never repeat, and keep look-alikes apart', () => {
    for (const lang of ['en', 'es'] as const) {
      const rng = mulberry32(3);
      let prev;
      for (let wins = 0; wins < 40; wins++) {
        const r = newQuiz(wins, lang, rng, prev);
        expect(r.letters).toHaveLength(choicesFor(wins));
        expect(new Set(r.letters).size).toBe(r.letters.length);
        expect(r.letters.filter((ch) => isRight(r, ch))).toHaveLength(1);
        if (prev) expect(r.target).not.toBe(prev.target);
        if (r.target === 'M') expect(r.letters).not.toContain('W');
        prev = r;
      }
    }
  });
});
