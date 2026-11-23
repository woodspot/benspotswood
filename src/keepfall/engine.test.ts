import { describe, expect, it } from 'vitest';
import { chooseAction } from './ai';
import { CARDS } from './cards';
import { legalActions, newGame, step } from './engine';
import type { GameState } from './types';

function playout(seed: number, diffs: ['easy' | 'normal' | 'hard', 'easy' | 'normal' | 'hard']): GameState {
  let s = newGame({ seed, first: (seed % 2) as 0 | 1 });
  for (let i = 0; i < 600 && s.winner === null; i++) s = step(s, chooseAction(s, diffs[s.current]));
  return s;
}

describe('engine', () => {
  it('deals hands; first player gets no opening production', () => {
    const s = newGame({ seed: 1, first: 0 });
    expect(s.players[0].hand).toHaveLength(6);
    expect(s.players[1].hand).toHaveLength(6);
    expect(s.players[0].res.stone).toBe(5); // first player skips opening production
    expect(s.players[1].res.stone).toBe(5);
  });

  it('is deterministic for a seed', () => {
    expect(newGame({ seed: 42 }).players[0].hand).toEqual(newGame({ seed: 42 }).players[0].hand);
  });

  it('damage hits the wall before the tower', () => {
    const s = newGame({ seed: 3, first: 0 });
    s.players[0].hand[0] = 'archers'; // 6 damage
    s.players[0].res.steel = 10;
    const n = step(s, { kind: 'play', index: 0 });
    expect(n.players[1].wall).toBe(4);
    expect(n.players[1].tower).toBe(25);
    expect(n.current).toBe(1);
  });

  it('play-again cards keep the turn', () => {
    const s = newGame({ seed: 4, first: 0 });
    s.players[0].hand[0] = 'drums';
    const n = step(s, { kind: 'play', index: 0 });
    expect(n.current).toBe(0);
    expect(n.players[0].res.stone).toBe(s.players[0].res.stone); // no extra production
  });

  it('does not mutate the previous state', () => {
    const s = newGame({ seed: 5 });
    const snapshot = JSON.stringify(s);
    step(s, legalActions(s)[0]);
    expect(JSON.stringify(s)).toBe(snapshot);
  });

  it('every card is valid', () => {
    for (const c of CARDS) {
      expect(c.cost).toBeGreaterThan(0);
      expect(c.ops.length).toBeGreaterThan(0);
    }
  });

  it('AI vs AI games finish, and better AI wins more', () => {
    let normalWins = 0;
    let turns = 0;
    const N = 60;
    for (let i = 0; i < N; i++) {
      const s = playout(i, i % 2 ? ['normal', 'easy'] : ['easy', 'normal']);
      expect(s.winner).not.toBeNull();
      turns += s.turn;
      const normalSeat = i % 2 ? 0 : 1;
      if (s.winner === normalSeat) normalWins++;
    }
    console.log(`normal beat easy ${normalWins}/${N}, avg ${Math.round(turns / N)} turns`);
    expect(normalWins).toBeGreaterThan(N / 2);
  });
});
