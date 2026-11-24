import { describe, expect, it } from 'vitest';
import { chooseAction, type Difficulty } from './ai';
import {
  ACTS, applyDailyMods, battleSetup, buyItem, buyService, camp, canCamp, canChoose, chooseNode, finishBattle, FLOORS_PER_ACT,
  leaveMarket, newRun, resolveEvent, takeReward, takeTreasure, type RunState,
} from './campaign';
import { CAPTAINS } from './captains';
import { card, STARTER_DECK } from './cards';
import { aiDeck, offerCards } from './draft';
import { newGame, step } from './engine';
import { EVENTS } from './events';
import { FACTIONS } from './factions';
import { applyRun, buy, dailyFor, migrateMeta, newMeta, runOptionsFromMeta, spendable } from './meta';

describe('draft', () => {
  it('offers distinct cards', () => {
    const h = { rng: 1 };
    for (let i = 0; i < 50; i++) expect(new Set(offerCards(h)).size).toBe(3);
  });

  it('builds AI decks of the right size', () => {
    expect(aiDeck({ rng: 2 }, 10)).toHaveLength(STARTER_DECK.length + 10);
  });
});

describe('campaign 2.0', () => {
  it('each act is a map of choices ending in a boss, with a rest stop before it', () => {
    const run = newRun('warhost', 5);
    expect(run.map).toHaveLength(FLOORS_PER_ACT);
    expect(run.map[FLOORS_PER_ACT - 1][0].type).toBe('boss');
    expect(run.map[FLOORS_PER_ACT - 1][0].enemy!.name).toBe('The Iron Leviathan');
    expect(run.map[FLOORS_PER_ACT - 2].map((n) => n.type)).toContain('camp');
    for (const floor of run.map) expect(floor.some((n) => ['battle', 'elite', 'boss'].includes(n.type)) || floor.some((n) => n.type === 'camp')).toBe(true);
  });

  it('battles pay gold; losing costs a banner; losing them all ends the run', () => {
    let run = chooseNode(newRun('stonewardens', 7), 0);
    const won = finishBattle(run, true, 12, 'destroy');
    expect(won.gold).toBeGreaterThan(10);
    expect(won.status).toBe('reward');
    expect(won.winKinds).toContain('destroy');
    run = finishBattle(run, false);
    expect(run.lives).toBe(2);
    run.lives = 1;
    run.status = 'battle';
    expect(finishBattle(run, false).status).toBe('lost');
  });

  it('beating an act boss offers legendary cards and moves on to the next act', () => {
    let run = newRun('arcanists', 9);
    run.floor = FLOORS_PER_ACT - 1;
    run.path = Array(FLOORS_PER_ACT).fill(0);
    run.status = 'battle';
    run = finishBattle(run, true, 10);
    expect(run.status).toBe('act');
    expect(run.pendingCards).toContain('leg-heart');
    for (const id of run.pendingCards!) expect(card(id).legendary).toBe(true);
    run = takeReward(run, run.pendingCards![0], null);
    expect(run.act).toBe(2);
    expect(run.floor).toBe(-1);
    expect(run.map[FLOORS_PER_ACT - 1][0].enemy!.name).toBe('The Thunder Queen');
    expect(run.deck).toContain('leg-heart');
  });

  it('docks upgrade, enchant and remove; Refit Crew gives two actions', () => {
    let run = newRun('arcanists', 6, { dockActions: 2 });
    run.status = 'camp';
    run.dockLeft = 2;
    run = camp(run, { kind: 'enchant', index: 0, ench: 't' });
    expect(run.deck[0]).toBe('mortar~t');
    expect(card(run.deck[0]).ops.some((o) => o.op === 'again')).toBe(true);
    expect(run.status).toBe('camp'); // one more action
    run = camp(run, { kind: 'upgrade', index: 0 });
    expect(run.deck[0]).toBe('mortar+~t');
    expect(card('mortar+~t').name).toBe('Twin Rivets+');
    expect(run.status).toBe('map');
    expect(canCamp(run, { kind: 'rest' })).toBe(false);
  });

  it('markets sell cards, relics and crew, and services cost gold', () => {
    let run = newRun('warhost', 11, { gold: 500 });
    run.status = 'market';
    run.map[0][0] = { type: 'market' };
    run = chooseNode({ ...run, status: 'map' }, 0);
    expect(run.status).toBe('market');
    const before = run.gold;
    const cardAt = run.market!.findIndex((m) => m.kind === 'card');
    run = buyItem(run, cardAt);
    expect(run.gold).toBeLessThan(before);
    expect(run.market![cardAt].sold).toBe(true);
    const crewAt = run.market!.findIndex((m) => m.kind === 'crew');
    run = buyItem(run, crewAt);
    expect(run.crew).toHaveLength(1);
    run = buyService(run, { kind: 'remove', index: 0 });
    expect(run.removals).toBe(1);
    expect(() => buyItem({ ...run, gold: 0 }, run.market!.findIndex((m) => !m.sold))).toThrow();
    expect(leaveMarket(run).status).toBe('map');
  });

  it('every event choice can be resolved', () => {
    for (const ev of EVENTS) {
      ev.choices.forEach((_c, i) => {
        let run = newRun('shadowmarch', 20 + i, { gold: 300 });
        run.map[0][0] = { type: 'event', event: ev.id };
        run = chooseNode(run, 0);
        expect(run.status).toBe('event');
        expect(canChoose(run, i)).toBe(true);
        const next = resolveEvent(run, i);
        expect(['map', 'battle', 'lost']).toContain(next.status);
        if (next.status === 'battle') expect(() => battleSetup(next)).not.toThrow();
      });
    }
  });

  it('the Shipyard spends Renown and shapes the next campaign', () => {
    let m = newMeta();
    m.renown = 1000;
    m = buy(m, 'yard-hull-1');
    m = buy(m, 'yard-hull-2');
    m = buy(m, 'yard-banner');
    m = buy(m, 'captain-gunner');
    expect(spendable(m)).toBe(1000 - 60 - 120 - 300 - 150);
    const opts = runOptionsFromMeta(m);
    expect(opts.yard).toEqual(['yard-hull-2']);
    expect(opts.extraLives).toBe(1);
    expect(opts.captain!.id).toBe('gunner');
    const run = newRun('warhost', 1, opts);
    expect(run.maxLives).toBe(4);
    expect(() => buy(m, 'yard-hull-2')).toThrow(); // already owned
    expect(() => buy(newMeta(), 'yard-hull-2')).toThrow(); // needs tier 1 and Renown
  });

  it('captains have powers that work in battle and level up', () => {
    for (const c of CAPTAINS) {
      let s = newGame({ seed: 3, first: 0, captains: [{ id: c.id, level: 5 }, undefined] });
      expect(s.players[0].captain!.uses).toBe(2);
      s = step(s, { kind: 'power' });
      expect(s.players[0].captain!.uses).toBe(1);
      expect(s.current).toBe(0); // the power doesn't end the turn
      expect(s.players[0].hand).toHaveLength(6);
    }
    const run = newRun('warhost', 1, { captain: { id: 'gunner', level: 1 } });
    run.battles.won = 6;
    run.status = 'lost';
    const r = applyRun(newMeta(), run);
    expect(r.levelUp).toEqual({ captain: 'gunner', from: 1, to: 2 });
  });

  it('daily voyages are the same for everyone on a date', () => {
    const a = dailyFor('2026-12-01');
    expect(dailyFor('2026-12-01')).toEqual(a);
    expect(a.mods).toHaveLength(2);
    expect(a.mods[0].id).not.toBe(a.mods[1].id);
    const run = applyDailyMods(newRun(a.faction, a.seed, { daily: '2026-12-01' }), ['crewed', 'glass', 'legend']);
    expect(run.crew).toHaveLength(2);
    expect(run.maxLives).toBe(1);
    expect(run.deck.some((id) => card(id).legendary)).toBe(true);
  });

  it('old saves migrate', () => {
    const m = migrateMeta({ version: 1, renown: 300, siegeUnlocked: 2, runs: 4, wins: 1, bestFloor: 9 });
    expect(m.version).toBe(2);
    expect(spendable(m)).toBe(300);
    expect(m.captain).toBe('navigator');
  });

  it('a whole three-act campaign can be played to the end by the AI', () => {
    const results: string[] = [];
    for (let seed = 0; seed < 4; seed++) {
      let run: RunState = newRun(FACTIONS[seed % FACTIONS.length].id, 100 + seed, { captain: { id: 'shipwright', level: 3 }, gold: 50 });
      let guard = 0;
      while (run.status !== 'won' && run.status !== 'lost' && guard++ < 200) {
        if (run.status === 'map') run = chooseNode(run, 0);
        else if (run.status === 'camp') run = camp(run, canCamp(run, { kind: 'rest' }) ? { kind: 'rest' } : { kind: 'upgrade', index: run.deck.findIndex((c) => !c.includes('+')) });
        else if (run.status === 'treasure') run = takeTreasure(run, run.pendingRelics![0]);
        else if (run.status === 'reward' || run.status === 'act') run = takeReward(run, run.pendingCards?.[0] ?? null, run.pendingRelics?.[0] ?? null);
        else if (run.status === 'market') run = leaveMarket(run);
        else if (run.status === 'event') run = resolveEvent(run, 0);
        else if (run.status === 'battle') {
          const { run: r, enemy, enemyDeck, myRelics } = battleSetup(run);
          let g = newGame({
            seed: r.rng,
            factions: [r.faction, enemy.faction],
            decks: [r.deck, enemyDeck],
            relics: [myRelics, enemy.relics],
            captains: [r.captain, undefined],
            rules: enemy.eventEvery ? { ...newGameRules(), eventEvery: enemy.eventEvery } : undefined,
          });
          const diff: [Difficulty, Difficulty] = ['hard', enemy.difficulty];
          for (let t = 0; t < 400 && g.winner === null; t++) g = step(g, chooseAction(g, diff[g.current]), enemy.eventEvery ? { ...newGameRules(), eventEvery: enemy.eventEvery } : undefined);
          run = finishBattle(r, g.winner === 0, g.turn, g.winKind);
        }
      }
      expect(['won', 'lost']).toContain(run.status);
      results.push(`${run.status}@act${run.act}`);
      expect(applyRun(newMeta(), run).gained).toBeGreaterThan(0);
    }
    console.log('AI campaign runs:', results.join(' '), `(of ${ACTS} acts)`);
  }, 300_000);
});

import { DEFAULT_RULES } from './types';
const newGameRules = () => DEFAULT_RULES;
