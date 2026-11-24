import { describe, expect, it } from 'vitest';
import { chooseAction } from './ai';
import { availableCards, card, describeCard, HEX_CARDS, setLockedCards, standardDeck } from './cards';
import { battleSetup, chooseNode, newRun, takeReward } from './campaign';
import { legalActions, newGame, previewCard, step } from './engine';
import { applyRun, lockedContent, newMeta, UNLOCKS } from './meta';
import type { GameState } from './types';

const fresh = (): GameState => {
  const s = newGame({ seed: 9, first: 0, factions: ['arcanists', 'arcanists'] });
  for (const p of s.players) p.res = { stone: 30, mana: 30, steel: 30 };
  return s;
};

describe('new mechanics', () => {
  it('Choose cards apply only the picked option, and offer one action per option', () => {
    const s = fresh();
    s.players[0].hand[0] = 'pact'; // enemy tower −5 (−6 for Arcanists) or +6 tower
    const plays = legalActions(s).filter((a) => a.kind === 'play' && a.index === 0);
    expect(plays).toHaveLength(2);
    const hit = step(s, { kind: 'play', index: 0, choice: 0 });
    expect(hit.players[1].tower).toBe(s.players[1].tower - 6);
    expect(hit.players[0].tower).toBe(s.players[0].tower);
    const heal = step(s, { kind: 'play', index: 0, choice: 1 });
    expect(heal.players[0].tower).toBe(s.players[0].tower + 6);
  });

  it('a Play again inside the chosen option keeps the turn', () => {
    const s = fresh();
    s.players[0].hand[0] = 'scaffold';
    expect(step(s, { kind: 'play', index: 0, choice: 0 }).current).toBe(1);
    expect(step(s, { kind: 'play', index: 0, choice: 1 }).current).toBe(0);
  });

  it('Combo only fires after another card this turn', () => {
    const s = fresh();
    s.players[0].hand[0] = 'blitz';
    s.players[0].hand[1] = 'drums';
    s.players[1].wall = 0;
    const alone = step(s, { kind: 'play', index: 0 });
    expect(s.players[1].tower - alone.players[1].tower).toBe(3);
    const afterDrums = step(s, { kind: 'play', index: 1 }); // drums: 2 damage, play again
    const idx = afterDrums.players[0].hand.indexOf('blitz');
    const combo = step(afterDrums, { kind: 'play', index: idx });
    expect(afterDrums.players[1].tower - combo.players[1].tower).toBe(7);
  });

  it('Ward soaks damage and spells before the wall and tower', () => {
    const s = fresh();
    s.players[1].ward = 5;
    s.players[0].hand[0] = 'archers'; // 6 damage
    const n = step(s, { kind: 'play', index: 0 });
    expect(n.players[1].ward).toBe(0);
    expect(n.players[1].wall).toBe(s.players[1].wall - 1);
    s.players[0].hand[0] = 'spark'; // enemy tower −3 (−4 Arcanists)
    const m = step(s, { kind: 'play', index: 0 });
    expect(m.players[1].ward).toBe(1);
    expect(m.players[1].tower).toBe(s.players[1].tower);
  });

  it('Burn ticks at the start of the burned player’s turns, ignoring the wall', () => {
    const s = fresh();
    s.players[0].hand[0] = 'hexfire'; // burn 2 for 3 turns
    const n = step(s, { kind: 'play', index: 0 });
    expect(n.current).toBe(1);
    expect(n.players[1].tower).toBe(s.players[1].tower - 2);
    expect(n.players[1].wall).toBe(s.players[1].wall);
    expect(n.players[1].burnTurns).toBe(2);
  });

  it('Rubble clogs the enemy deck and leaves it when played', () => {
    const s = fresh();
    s.players[0].hand[0] = 'rubblecart';
    const before = s.players[1].deck.length;
    const n = step(s, { kind: 'play', index: 0 });
    expect(n.players[1].deck.filter((c) => c === 'rubble').length).toBe(2);
    expect(n.players[1].deck.length).toBe(before + 2);
    const t = fresh();
    t.players[0].hand[0] = 'rubble';
    const after = step(t, { kind: 'play', index: 0 });
    expect(after.players[0].discard).not.toContain('rubble');
  });

  it('Shadowmarch starts the enemy with Rubble and steals more', () => {
    const s = newGame({ seed: 5, factions: ['shadowmarch', 'warhost'] });
    const enemyCards = [...s.players[1].deck, ...s.players[1].hand];
    expect(enemyCards.filter((c) => c === 'rubble')).toHaveLength(3);
  });

  it('previewCard matches what step does', () => {
    const s = fresh();
    s.players[0].hand[0] = 'warband';
    const [me, foe] = previewCard(s, 0, 'warband');
    const n = step(s, { kind: 'play', index: 0 });
    expect(foe.wall).toBe(n.players[1].wall);
    expect(foe.tower).toBe(n.players[1].tower);
    expect(me.res.steel).toBe(s.players[0].res.steel - 6);
  });

  it('upgrades scale new ops', () => {
    expect(describeCard(card('glyph+'))[0]).toBe('+7 Ward');
    expect(describeCard(card('hexfire+'))[0]).toBe('Burn 3 for 3 turns');
    expect(describeCard(card('pact+'))).toContain('② +8 Altitude');
  });

  it('AI games with the new cards finish', () => {
    for (let seed = 0; seed < 10; seed++) {
      let s = newGame({ seed, factions: ['shadowmarch', (['stonewardens', 'arcanists', 'warhost'] as const)[seed % 3]] });
      for (let i = 0; i < 600 && s.winner === null; i++) s = step(s, chooseAction(s, 'normal'));
      expect(s.winner).not.toBeNull();
    }
  }, 60_000);
});

describe('unlocks and siege', () => {
  it('locked cards stay out of decks until unlocked', () => {
    setLockedCards(lockedContent(newMeta()).cards);
    expect(standardDeck().some((id) => HEX_CARDS.includes(id))).toBe(false);
    expect(availableCards().some((c) => c.curse)).toBe(false);
    setLockedCards([]);
    expect(standardDeck()).toContain('hexfire');
  });

  it('a won campaign awards Renown, unlocks things, and opens the next Storm level', () => {
    const run = newRun('warhost', 3);
    run.status = 'won';
    run.act = 3;
    run.bosses = 3;
    run.battles.won = 10;
    run.floorsCleared = 18;
    const r = applyRun(newMeta(), run);
    expect(r.gained).toBeGreaterThan(100);
    expect(r.newSiege).toBe(1);
    expect(r.unlocked.map((u) => u.id)).toContain(UNLOCKS[0].id);
    expect(r.feats.map((f) => f.id)).toContain('king');
  });

  it('Storm levels toughen enemies and cut banners', () => {
    const easy = newRun('arcanists', 77);
    const hard = newRun('arcanists', 77, { siege: 6 });
    expect(hard.maxLives).toBe(2);
    const boss = hard.map[5][0].enemy!;
    expect(boss.relics).toContain('warden-might');
    expect(boss.relics).toContain('siege-walls');
    expect(boss.relics).toContain('storm-ward');
    expect(easy.map[0][0].enemy!.difficulty).toBe('easy');
    expect(hard.map[0][0].enemy!.difficulty).toBe('normal');
  });

  it('head starts put a pick before the first floor', () => {
    const run = newRun('warhost', 4, { startRelic: true, startCard: true });
    expect(run.status).toBe('reward');
    expect(run.pendingRelics).toHaveLength(3);
    const next = takeReward(run, run.pendingCards![0], run.pendingRelics![0]);
    expect(next.status).toBe('map');
    expect(next.relics).toHaveLength(1);
    expect(next.deck).toHaveLength(19);
    expect(() => battleSetup(chooseNode(next, 0))).not.toThrow();
  });
});
