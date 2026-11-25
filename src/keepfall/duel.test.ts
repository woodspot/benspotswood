import { describe, expect, it } from 'vitest';
import { setLockedCards, standardDeck } from './cards';
import { duelDeck, flipState, replay, seatWinner, statusOf, type DuelDoc } from './duel';
import { legalActions, step } from './engine';
import type { Action } from './types';

function doc(actions: Action[] = []): DuelDoc {
  return {
    v: 1, id: 'ABCDEF', created: 0, updated: 0, seed: 12345, deck: duelDeck(),
    names: ['Ben', 'Grandma'], factions: ['stonewardens', 'warhost'], actions, winner: null, resigned: null,
  } as DuelDoc;
}

/** A whole game of made-up moves (the first affordable play, else a discard), played from seat 0. */
function someMoves(n: number): Action[] {
  const out: Action[] = [];
  let s = replay(doc(), 0);
  for (let i = 0; i < n && s.winner === null; i++) {
    const legal = legalActions(s).filter((a) => a.kind !== 'power');
    const a = legal[(i * 7) % legal.length];
    out.push(a);
    s = step(s, a);
  }
  return out;
}

describe('duels', () => {
  it('the duel deck is every card, whatever this phone has unlocked', () => {
    setLockedCards([]);
    const all = duelDeck();
    expect([...all].sort()).toEqual([...standardDeck()].sort());
    setLockedCards(['thunderclap']);
    expect(duelDeck()).toEqual(all);
    setLockedCards([]);
  });

  it('both phones see the same battle: seat 1 is the flipped copy of seat 0', () => {
    const moves = someMoves(80);
    expect(moves.length).toBeGreaterThan(20);
    const d = doc(moves);
    for (const n of [0, 1, 10, moves.length]) {
      const a = replay(d, 0, n);
      const b = replay(d, 1, n);
      expect(flipState(b)).toEqual(a);
    }
  });

  it('whose turn it is, from each side', () => {
    const d = doc();
    const s = replay(d, 0);
    expect(statusOf(d, 0)).toBe(s.current === 0 ? 'yours' : 'theirs');
    expect(statusOf(d, 1)).toBe(s.current === 0 ? 'theirs' : 'yours');
    expect(statusOf({ ...d, names: ['Ben', null], factions: ['stonewardens', null] }, 0)).toBe('invite');
    expect(statusOf({ ...d, winner: 1, resigned: 0 }, 1)).toBe('won');
  });

  it('reports the winner by seat', () => {
    const moves = someMoves(400);
    const d = doc(moves);
    const a = replay(d, 0);
    const b = replay(d, 1);
    expect(a.winner).not.toBeNull();
    expect(seatWinner(a, 0)).toBe(seatWinner(b, 1));
  });
});
