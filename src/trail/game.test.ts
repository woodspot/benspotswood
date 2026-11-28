import { describe, expect, it } from 'vitest';
import { allPhrases } from '../voice/phrases';
import { clipKey } from '../kids/words';
import {
  choiceParts, finishStop, isOpen, isRight, mulberry32, newLesson, newPlayer, newQuestion, newSticker, promptParts,
  startsWith, STICKERS, STOP_COUNT, STOPS, letterPool, type Question,
} from './game';
import { letterOf } from '../abc/game';

const values = (q: Question): (string | number)[] => {
  switch (q.kind) {
    case 'pattern': return q.choices.map((t) => t.e);
    case 'dots': return [q.pic.id];
    default: return q.choices;
  }
};

describe("Hoot's Trail", () => {
  it('every question in every stop has exactly one right answer among different choices', () => {
    const rng = mulberry32(7);
    for (const lang of ['en', 'es'] as const)
      for (const stop of STOPS)
        for (let k = 0; k < 6; k++) {
          const q = newQuestion(stop, lang, rng);
          const v = values(q);
          expect(new Set(v).size).toBe(v.length);
          if (q.kind !== 'dots') expect(v.filter((x) => isRight(q, x))).toHaveLength(1);
          if (q.kind === 'count') expect(q.n).toBeGreaterThanOrEqual(1);
        }
  });

  it('gets harder world by world', () => {
    const rng = mulberry32(3);
    const maxCount = (world: number) =>
      Math.max(...Array.from({ length: 80 }, () => newQuestion({ index: 0, world, kind: 'count' }, 'en', rng)).map((q) => (q.kind === 'count' ? q.n : 0)));
    expect(maxCount(0)).toBeLessThanOrEqual(3);
    expect(maxCount(3)).toBeGreaterThan(5);
    expect(letterPool(0, 'en')).toHaveLength(6);
    expect(letterPool(3, 'en')).toHaveLength(26);
  });

  it('first sounds only use letters whose word starts with them', () => {
    expect(startsWith(letterOf('W', 'es'))).toBe(false); // kiwi
    expect(startsWith(letterOf('Ñ', 'es'))).toBe(false); // piña
    expect(startsWith(letterOf('E', 'es'))).toBe(true); // elefante
    const rng = mulberry32(1);
    for (let k = 0; k < 200; k++) {
      const q = newQuestion({ index: 35, world: 3, kind: 'sound' }, 'es', rng);
      if (q.kind === 'sound') for (const ch of q.choices) expect(startsWith(letterOf(ch, 'es'))).toBe(true);
    }
  });

  it('a lesson is four questions, or two dot-to-dot pictures', () => {
    const rng = mulberry32(2);
    expect(newLesson(STOPS[0], 'en', rng)).toHaveLength(4);
    const dots = STOPS.find((s) => s.kind === 'dots')!;
    expect(newLesson(dots, 'en', rng)).toHaveLength(2);
  });

  it('finishing the newest stop opens the next; replaying an old one just adds a star and sticker', () => {
    const p = newPlayer('🐯', 'a');
    expect(isOpen(p, 0)).toBe(true);
    expect(isOpen(p, 1)).toBe(false);
    finishStop(p, 0, STICKERS[0]);
    expect(p.done).toBe(1);
    expect(isOpen(p, 1)).toBe(true);
    finishStop(p, 0, STICKERS[1]);
    expect(p.done).toBe(1);
    expect(p.stars).toBe(2);
    expect(p.stickers).toEqual([STICKERS[0].e, STICKERS[1].e]);
    p.done = STOP_COUNT;
    expect(isOpen(p, STOP_COUNT - 1)).toBe(true);
  });

  it('gives stickers they do not have yet', () => {
    const rng = mulberry32(5);
    const have = STICKERS.slice(1).map((s) => s.e);
    expect(newSticker(have, rng)).toBe(STICKERS[0]);
  });

  it('has a recorded voice line for everything Hoot says', () => {
    const keys = new Set(allPhrases().map(clipKey));
    const rng = mulberry32(9);
    for (const lang of ['en', 'es'] as const)
      for (const stop of STOPS) {
        const q = newQuestion(stop, lang, rng);
        for (const p of promptParts(q, lang)) expect(keys.has(clipKey(p)), p.text).toBe(true);
        for (const v of values(q)) for (const p of choiceParts(q, v, lang)) expect(keys.has(clipKey(p)), p.text).toBe(true);
      }
  });
});
