import { describe, expect, it } from 'vitest';
import { flip, gridFor, hideMiss, mulberry32, newMemory, newSame, PAIR_OPTIONS, PICS, sameChoices } from './game';

describe('match it', () => {
  it('Same rounds hold the target once among different pictures', () => {
    const rng = mulberry32(1);
    for (let wins = 0; wins < 20; wins++) {
      const r = newSame('animals', wins, rng);
      expect(r.options).toHaveLength(sameChoices(wins));
      expect(new Set(r.options).size).toBe(r.options.length);
      expect(r.options.filter((x) => x === r.target)).toHaveLength(1);
    }
  });

  it('Same never repeats the last picture', () => {
    const rng = mulberry32(2);
    let prev: number | undefined;
    for (let i = 0; i < 100; i++) {
      const r = newSame('food', 0, rng, prev);
      expect(r.target).not.toBe(prev);
      prev = r.target;
    }
  });

  it('Memory deals each picture twice', () => {
    const m = newMemory('vehicles', 3, mulberry32(3));
    expect(m.cards).toHaveLength(6);
    const counts = new Map<number, number>();
    for (const c of m.cards) counts.set(c.pic, (counts.get(c.pic) ?? 0) + 1);
    expect([...counts.values()]).toEqual([2, 2, 2]);
  });

  it('Memory: match, miss and finish', () => {
    const m = newMemory('animals', 2, mulberry32(4));
    const [a, b] = [0, 1, 2, 3].filter((i) => m.cards[i].pic === m.cards[0].pic);
    const others = [0, 1, 2, 3].filter((i) => m.cards[i].pic !== m.cards[0].pic);
    // A miss: two different cards, then they turn back over.
    expect(flip(m, a)).toEqual({ kind: 'first' });
    expect(flip(m, others[0])).toEqual({ kind: 'miss' });
    expect(flip(m, others[1])).toEqual({ kind: 'ignored' }); // two already showing
    hideMiss(m);
    expect(m.cards.filter((c) => c.up)).toHaveLength(0);
    // Two matches finish the board.
    flip(m, a);
    expect(flip(m, b)).toMatchObject({ kind: 'match', done: false });
    flip(m, others[0]);
    expect(flip(m, others[1])).toMatchObject({ kind: 'match', done: true });
  });

  it('every picture has an English and a Spanish word, and themes cover the biggest board', () => {
    for (const list of Object.values(PICS)) {
      expect(list.length).toBeGreaterThanOrEqual(Math.max(...PAIR_OPTIONS));
      for (const p of list) expect(p.name && p.es).toBeTruthy();
    }
    expect(PICS.animals[0]).toMatchObject({ name: 'dog', es: 'perro' });
  });

  it('deals the number of pairs asked for', () => {
    for (const n of PAIR_OPTIONS) expect(newMemory('food', n, mulberry32(n)).cards).toHaveLength(n * 2);
  });

  it('lays cards out sensibly', () => {
    expect(gridFor(4, 360, 600)).toEqual({ cols: 2, rows: 2 });
    expect(gridFor(12, 360, 600)).toEqual({ cols: 3, rows: 4 });
    expect(gridFor(16, 343, 700)).toEqual({ cols: 4, rows: 4 });
    expect(gridFor(12, 1000, 600)).toEqual({ cols: 6, rows: 2 }); // wide screens: bigger cards in fewer rows
  });
});
