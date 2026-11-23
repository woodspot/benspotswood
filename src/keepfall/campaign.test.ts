import { describe, expect, it } from 'vitest';
import { chooseAction, type Difficulty } from './ai';
import { battleSetup, camp, canCamp, chooseNode, finishBattle, FLOORS, newRun, takeReward, takeTreasure, type RunState } from './campaign';
import { STARTER_DECK } from './cards';
import { aiDeck, offerCards } from './draft';
import { newGame, step } from './engine';
import { FACTIONS } from './factions';

describe('draft', () => {
  it('offers distinct cards', () => {
    const h = { rng: 1 };
    for (let i = 0; i < 50; i++) {
      const o = offerCards(h);
      expect(new Set(o).size).toBe(3);
    }
  });

  it('builds AI decks of the right size', () => {
    expect(aiDeck({ rng: 2 }, 10)).toHaveLength(STARTER_DECK.length + 10);
  });
});

describe('campaign', () => {
  it('generates a map ending in a boss', () => {
    const run = newRun('warhost', 5);
    expect(run.map).toHaveLength(FLOORS);
    expect(run.map[FLOORS - 1][0].type).toBe('boss');
    for (const floor of run.map) expect(floor.some((n) => n.type !== 'camp' && n.type !== 'treasure') || floor.length === 2).toBe(true);
  });

  it('camp upgrades and removes cards, rest restores a banner', () => {
    let run = newRun('arcanists', 6);
    run.status = 'camp';
    run = camp(run, { kind: 'upgrade', index: 0 });
    expect(run.deck[0]).toBe('mortar+');
    run.status = 'camp';
    expect(canCamp(run, { kind: 'upgrade', index: 0 })).toBe(false);
    expect(canCamp(run, { kind: 'rest' })).toBe(false); // full lives
    run.lives = 2;
    run = camp(run, { kind: 'rest' });
    expect(run.lives).toBe(3);
  });

  it('losing costs a banner; losing them all ends the run', () => {
    let run = chooseNode(newRun('stonewardens', 7), 0);
    run = finishBattle(run, false);
    expect(run.lives).toBe(2);
    expect(run.status).toBe('map');
    run.lives = 1;
    run.status = 'battle';
    run = finishBattle(run, false);
    expect(run.status).toBe('lost');
  });

  it('a whole run can be played to the end by the AI', () => {
    const results: string[] = [];
    for (let seed = 0; seed < 6; seed++) {
      let run: RunState = newRun(FACTIONS[seed % 3].id, 100 + seed);
      let guard = 0;
      while (run.status !== 'won' && run.status !== 'lost' && guard++ < 100) {
        if (run.status === 'map') run = chooseNode(run, 0);
        else if (run.status === 'camp') run = camp(run, canCamp(run, { kind: 'rest' }) ? { kind: 'rest' } : { kind: 'upgrade', index: run.deck.findIndex((c) => !c.endsWith('+')) });
        else if (run.status === 'treasure') run = takeTreasure(run, run.pendingRelics![0]);
        else if (run.status === 'reward') run = takeReward(run, run.pendingCards![0], run.pendingRelics?.[0] ?? null);
        else if (run.status === 'battle') {
          const { run: r, enemy, enemyDeck } = battleSetup(run);
          let g = newGame({
            seed: r.rng,
            factions: [r.faction, enemy.faction],
            decks: [r.deck, enemyDeck],
            relics: [r.relics, enemy.relics],
          });
          const diff: [Difficulty, Difficulty] = ['normal', enemy.difficulty];
          while (g.winner === null) g = step(g, chooseAction(g, diff[g.current]));
          run = finishBattle(r, g.winner === 0);
        }
      }
      expect(['won', 'lost']).toContain(run.status);
      results.push(`${run.status}@floor${run.floor + 1}`);
    }
    console.log('AI campaign runs:', results.join(' '));
  }, 120_000);
});
