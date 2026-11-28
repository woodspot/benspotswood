import { describe, expect, it } from 'vitest';
import { eats, MEALS, mudSpots, mulberry32, newMealRound, nextBather } from './game';

describe('Pet Care', () => {
  it('mud spots: three at first, up to six, spread over the part of the animal above the tub', () => {
    const rng = mulberry32(1);
    expect(mudSpots(0, rng)).toHaveLength(3);
    expect(mudSpots(20, rng)).toHaveLength(6);
    for (const s of mudSpots(10, rng)) {
      expect(s.x).toBeGreaterThan(10);
      expect(s.x).toBeLessThan(90);
      expect(s.y).toBeLessThan(70);
    }
  });

  it('never baths the same animal twice in a row', () => {
    const rng = mulberry32(2);
    let prev = nextBather(rng);
    for (let k = 0; k < 50; k++) {
      const b = nextBather(rng, prev.e);
      expect(b.e).not.toBe(prev.e);
      prev = b;
    }
  });

  it('every animal at the table has its food in the basket, and the extras are for no one there', () => {
    const rng = mulberry32(3);
    let prev;
    for (let r = 0; r < 30; r++) {
      const round = newMealRound(r, rng, prev);
      expect(round.meals).toHaveLength(r < 2 ? 2 : 3);
      for (const m of round.meals) expect(round.tray).toContain(m.food.e);
      for (const f of round.tray) expect(round.tray.filter((x) => x === f)).toHaveLength(1);
      const extras = round.tray.filter((f) => !round.meals.some((m) => eats(m.pet.e, f)));
      expect(extras).toHaveLength(r < 1 ? 0 : r < 4 ? 1 : 2);
      // A new set of animals each time.
      if (prev) for (const m of round.meals) expect(prev.meals.map((x) => x.pet.e)).not.toContain(m.pet.e);
      prev = round;
    }
  });

  it('each animal eats one food, and each food is for one animal', () => {
    expect(new Set(MEALS.map((m) => m.pet.e)).size).toBe(MEALS.length);
    expect(new Set(MEALS.map((m) => m.food.e)).size).toBe(MEALS.length);
  });
});
