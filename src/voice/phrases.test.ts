import { describe, expect, it } from 'vitest';
import { promptParts } from '../balloons/speech';
import { nameParts, PICS } from '../match/game';
import { CONTACT_MAP, keyWord, lineFor } from '../phone/game';
import { clipKey, en, type Part } from '../kids/words';
import { allPhrases } from './phrases';

const keys = new Set(allPhrases().map(clipKey));
const covered = (parts: Part[]) => parts.every((p) => keys.has(clipKey(p)));

describe('phrase list for the natural voices', () => {
  it('covers what the games actually say', () => {
    expect(covered(promptParts({ kind: 'color', id: 'purple' }, 'es'))).toBe(true);
    expect(covered(nameParts(PICS.vehicles[1], 'es'))).toBe(true); // ¡Camión de bomberos!
    expect(covered([keyWord('9', 'es'), keyWord('❤️', 'en')])).toBe(true);
    expect(covered(lineFor(CONTACT_MAP.santa, 'hello', 'en', () => 0))).toBe(true);
    expect(covered(lineFor(CONTACT_MAP.grandma, 'kiss', 'es', () => 0))).toBe(true);
    expect(covered([en('Calling Grandma!'), en('Find the pairs!')])).toBe(true);
  });

  it('keeps each character in their own voice', () => {
    const santa = allPhrases().filter((p) => p.voice === 'santa');
    expect(santa.length).toBeGreaterThan(5);
  });

  it('is a sensible size to generate', () => {
    const chars = allPhrases().reduce((n, p) => n + p.text.length, 0);
    expect(allPhrases().length).toBeGreaterThan(300);
    expect(chars).toBeLessThan(40000);
  });
});
