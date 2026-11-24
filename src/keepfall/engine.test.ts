import { describe, expect, it } from 'vitest';
import { chooseAction } from './ai';
import { CARDS, card, building, STARTER_DECK } from './cards';
import { costOf, legalActions, newGame, step } from './engine';
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
    const s = newGame({ seed: 3, first: 0, factions: ['arcanists', 'arcanists'] });
    s.players[0].hand[0] = 'archers'; // 6 damage
    s.players[0].res.steel = 10;
    const n = step(s, { kind: 'play', index: 0 });
    expect(n.players[1].wall).toBe(4);
    expect(n.players[1].tower).toBe(s.players[1].tower); // wall absorbed it all
    expect(n.current).toBe(1);
  });

  it('play-again cards keep the turn', () => {
    const s = newGame({ seed: 4, first: 0, factions: ['arcanists', 'arcanists'] });
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

  it('faction perks apply', () => {
    const s = newGame({ seed: 6, first: 0, factions: ['stonewardens', 'warhost'] });
    expect(s.players[0].wall).toBe(20);
    expect(s.players[1].res.steel).toBe(8); // 5 + Warhost bonus 3
    s.players[0].hand[0] = 'rampart'; // Build card, cost 4 → 3 for Stonewardens
    expect(costOf(s, 0, 'rampart')).toBe(3);
    s.current = 1;
    s.players[1].hand[0] = 'archers'; // 6 damage +1 for Warhost
    s.players[1].res.steel = 10;
    const n = step(s, { kind: 'play', index: 0 });
    expect(n.players[0].wall).toBe(13);
  });

  it('events start after the first cycle and change the rules', () => {
    let s = newGame({ seed: 7, first: 0, factions: ['arcanists', 'arcanists'] });
    expect(s.event).toBeNull();
    for (let i = 0; i < 5; i++) {
      s.players[s.current].hand[0] = 'mortar'; // cheap, never plays again
      s.players[s.current].res.stone = 10;
      s = step(s, { kind: 'play', index: 0 });
    }
    expect(s.turn).toBe(6);
    expect(s.event).toBeNull();
    s.players[s.current].hand[0] = 'mortar';
    s = step(s, { kind: 'play', index: 0 });
    expect(s.turn).toBe(7);
    expect(s.event).not.toBeNull();
    expect(s.log.some((l) => l.kind === 'event')).toBe(true);
  });

  it('event cost changes apply and never go below 0', () => {
    const s = newGame({ seed: 8, factions: ['stonewardens', 'arcanists'] });
    s.event = 'festival'; // Build −2, plus Stonewardens −1
    expect(costOf(s, 0, 'mortar')).toBe(0);
    expect(costOf(s, 0, 'rampart')).toBe(1);
    s.event = 'storm';
    expect(costOf(s, 1, 'spark')).toBe(4);
  });

  it('buildings act at the start of their owner turn', () => {
    const s = newGame({ seed: 9, first: 0, factions: ['arcanists', 'arcanists'] });
    s.players[0].hand[0] = 'b-catapult';
    s.players[0].res.steel = 10;
    let n = step(s, { kind: 'play', index: 0 });
    expect(n.players[0].buildings).toEqual(['catapult']);
    // Opponent's turn: catapult doesn't fire yet.
    expect(n.players[1].wall).toBe(10);
    n.players[1].hand[0] = 'mortar';
    n.players[1].res.stone = 5;
    n = step(n, { kind: 'play', index: 0 }); // back to player 0: catapult fires for 2
    expect(n.players[1].wall).toBe(13 - 2);
  });

  it('a full set of slots replaces the oldest building', () => {
    const s = newGame({ seed: 10, first: 0, factions: ['arcanists', 'arcanists'] });
    s.players[0].buildings = ['lodge', 'shrine', 'market'];
    s.players[0].hand[0] = 'b-catapult';
    s.players[0].res.steel = 10;
    const n = step(s, { kind: 'play', index: 0 });
    expect(n.players[0].buildings).toEqual(['shrine', 'market', 'catapult']);
  });

  it('demolish removes the most valuable enemy building', () => {
    const s = newGame({ seed: 11, first: 0, factions: ['arcanists', 'arcanists'] });
    s.players[1].buildings = ['lodge', 'ballista', 'shrine'];
    s.players[0].hand[0] = 'sappers';
    s.players[0].res.steel = 10;
    const n = step(s, { kind: 'play', index: 0 });
    expect(n.players[1].buildings).toEqual(['lodge', 'shrine']);
  });

  it('upgraded cards have bigger numbers', () => {
    expect(card('archers+').name).toBe('Deck Cannons+');
    expect(card('archers+').ops).toEqual([{ op: 'damage', amt: 8 }]);
    expect(card('recruiter+').cost).toBe(1); // nothing to scale → cheaper
    expect(card('b-catapult+').ops).toEqual([{ op: 'build', building: 'catapult+' }]);
    expect(building('catapult+').ops).toEqual([{ op: 'damage', amt: 3 }]);
  });

  it('custom decks and relics are used', () => {
    const s = newGame({ seed: 12, factions: ['arcanists', 'arcanists'], decks: [STARTER_DECK, STARTER_DECK], relics: [['gate', 'plans'], []] });
    const p = s.players[0];
    expect(p.hand.length + p.deck.length).toBe(STARTER_DECK.length);
    expect(p.wall).toBe(18);
    expect(p.buildings).toEqual(['lodge']);
  });

  it('every card is valid', () => {
    for (const c of CARDS.filter((x) => !x.curse)) {
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
  }, 60_000);
});
