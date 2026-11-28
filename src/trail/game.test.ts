import { describe, expect, it } from 'vitest';
import { allPhrases } from '../voice/phrases';
import { clipKey } from '../kids/words';
import { letterOf } from '../abc/game';
import {
  finishStop, isOpen, letterPool, mulberry32, newLesson, newPlayer, newSticker, openWorlds, piecesOf, placeSticker, promptParts,
  startsWith, STICKERS, STOP_COUNT, STOPS, STOPS_PER_WORLD, unplaced, type Round,
} from './game';

const lessons = (seed: number) => {
  const rng = mulberry32(seed);
  return (['en', 'es'] as const).flatMap((lang) => STOPS.flatMap((stop) => newLesson(stop, lang, rng).map((r) => ({ r, lang, stop }))));
};

describe("Hoot's Trail", () => {
  it('every stop is a few hands-on rounds', () => {
    const rng = mulberry32(2);
    for (const stop of STOPS) {
      const rounds = newLesson(stop, 'en', rng);
      expect(rounds.length).toBeGreaterThanOrEqual(2);
      expect(rounds.length).toBeLessThanOrEqual(4);
    }
    expect(newLesson(STOPS[0], 'en', rng).map((r) => r.kind)).toEqual(['trace', 'pop', 'trace', 'pop']);
  });

  it('every drag piece has somewhere to go, and every place gets filled', () => {
    for (const { r } of lessons(7)) {
      const pieces = piecesOf(r);
      switch (r.kind) {
        case 'sound':
          expect(new Set(r.letters).size).toBe(r.letters.length);
          expect(pieces.map((p) => p.goes).sort()).toEqual([...r.letters].sort());
          break;
        case 'sort':
          for (const c of r.colors) expect(r.items.filter((x) => x === c)).toHaveLength(2);
          break;
        case 'shapes':
          expect(new Set(r.shapes).size).toBe(r.shapes.length);
          expect(new Set(r.colors).size).toBe(r.colors.length);
          break;
        case 'size':
          expect(pieces.filter((p) => p.goes === 'big')).toHaveLength(r.things.length);
          break;
        case 'pattern':
          // Everything the blanks need is in the tray.
          for (const b of r.blanks) expect(r.tray).toContain(b);
          expect(r.blanks.length).toBeGreaterThan(0);
          break;
        case 'feed':
          expect(pieces.length).toBe(r.n + 2); // more than they need: knowing when to stop is the lesson
          expect(r.n).toBeGreaterThanOrEqual(1);
          break;
        case 'pop':
          expect(r.others).not.toContain(r.letter);
          expect(r.others.length).toBeGreaterThan(0);
          break;
        default:
      }
    }
  });

  it('gets harder world by world', () => {
    const rng = mulberry32(3);
    const maxFeed = (world: number) =>
      Math.max(...Array.from({ length: 60 }, () => newLesson({ index: 1, world, kind: 'count' }, 'en', rng))
        .flat().map((r) => (r.kind === 'feed' || r.kind === 'tapcount' ? r.n : 0)));
    expect(maxFeed(0)).toBeLessThanOrEqual(3);
    expect(maxFeed(3)).toBeGreaterThan(5);
    expect(letterPool(0, 'en')).toHaveLength(6);
    expect(letterPool(3, 'en')).toHaveLength(26);
    const baskets = (world: number) => newLesson({ index: 5, world, kind: 'sound' }, 'en', rng)[0] as Extract<Round, { kind: 'sound' }>;
    expect(baskets(0).letters).toHaveLength(2);
    expect(baskets(3).letters).toHaveLength(3);
  });

  it('first sounds only use letters whose word starts with them', () => {
    expect(startsWith(letterOf('W', 'es'))).toBe(false); // kiwi
    expect(startsWith(letterOf('Ñ', 'es'))).toBe(false); // piña
    expect(startsWith(letterOf('E', 'es'))).toBe(true); // elefante
    const rng = mulberry32(1);
    for (let k = 0; k < 100; k++)
      for (const r of newLesson({ index: 35, world: 3, kind: 'sound' }, 'es', rng))
        if (r.kind === 'sound') for (const ch of r.letters) expect(startsWith(letterOf(ch, 'es'))).toBe(true);
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

  it('stickers go in a world picture, can be moved, and stay inside it', () => {
    const p = newPlayer('🐯', 'a');
    finishStop(p, 0, STICKERS[0]);
    finishStop(p, 1, STICKERS[1]);
    expect(unplaced(p)).toEqual([STICKERS[0].e, STICKERS[1].e]);
    placeSticker(p, 'meadow', STICKERS[0].e, 30, 40);
    expect(unplaced(p)).toEqual([STICKERS[1].e]);
    placeSticker(p, 'meadow', STICKERS[0].e, 150, -20); // moved, and kept in the picture
    expect(p.scenes!.meadow).toEqual([{ e: STICKERS[0].e, x: 94, y: 6 }]);
    expect(openWorlds(p).map((w) => w.id)).toEqual(['meadow']);
    p.done = STOPS_PER_WORLD;
    expect(openWorlds(p).map((w) => w.id)).toEqual(['meadow', 'beach']);
  });

  it('has a recorded voice line for everything Hoot says', () => {
    const keys = new Set(allPhrases().map(clipKey));
    for (const { r, lang } of lessons(9)) for (const p of promptParts(r, lang)) expect(keys.has(clipKey(p)), p.text).toBe(true);
  });
});
