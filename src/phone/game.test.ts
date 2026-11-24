import { describe, expect, it } from 'vitest';
import { CONTACTS, CONTACT_MAP, displayName, KEYS, keyWord, lineFor, whoAnswers } from './game';

describe('toy phone', () => {
  it('every key says a word in English and Spanish', () => {
    expect(keyWord('7', 'en')).toEqual({ text: 'seven', lang: 'en' });
    expect(keyWord('7', 'es')).toEqual({ text: 'siete', lang: 'es' });
    expect(keyWord('0', 'es')).toEqual({ text: 'cero', lang: 'es' });
    expect(keyWord('⭐', 'es')).toEqual({ text: 'estrella', lang: 'es' });
    for (const k of KEYS) expect(keyWord(k, 'en').text && keyWord(k, 'es').text).toBeTruthy();
  });

  it('every contact has lines for every moment, in both languages', () => {
    for (const c of CONTACTS)
      for (const kind of ['hello', 'more', 'kiss', 'wave', 'bye'] as const) {
        expect(c.lines[kind].en.length).toBeGreaterThan(0);
        expect(c.lines[kind].es.length).toBeGreaterThan(0);
      }
  });

  it('family can be renamed by a grown-up', () => {
    const g = CONTACT_MAP.grandma;
    expect(displayName(g, undefined, 'en')).toBe('Grandma');
    expect(displayName(g, undefined, 'es')).toBe('Abuela');
    expect(displayName(g, { name: 'Nana' }, 'es')).toBe('Nana');
    // "It's Grandma!" becomes "It's Nana!"
    const line = lineFor(g, 'more', 'en', () => 0.99, { name: 'Nana' });
    expect(line.text).toBe("It's Nana! I love talking to you!");
  });

  it('animals speak their own sound in each language', () => {
    expect(lineFor(CONTACT_MAP.dog, 'more', 'es', () => 0).text).toBe('¡Guau guau!');
    expect(lineFor(CONTACT_MAP.cow, 'more', 'en', () => 0).text).toBe('Moo!');
  });

  it('the same number always reaches the same friend', () => {
    expect(whoAnswers('123')).toBe(whoAnswers('123'));
    const reached = new Set(Array.from({ length: 200 }, (_, i) => whoAnswers(String(i)).id));
    expect(reached.size).toBeGreaterThan(5);
  });
});
