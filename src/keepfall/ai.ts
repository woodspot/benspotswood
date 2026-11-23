import { card } from './cards';
import { applyOp, legalActions, step } from './engine';
import { DEFAULT_RULES, RESOURCES } from './types';
import type { Action, GameState, Player, Rules } from './types';

export type Difficulty = 'easy' | 'normal' | 'hard';

function towerValue(t: number, rules: Rules): number {
  let v = t * 3;
  if (t < 15) v -= (15 - t) * 4; // danger zone
  const nearWin = rules.winTower - 20;
  if (t > nearWin) v += (t - nearWin) * 3; // closing in on a tower win
  return v;
}

function sideValue(p: Player, rules: Rules): number {
  let v = towerValue(p.tower, rules);
  v += Math.min(p.wall, 40) * 1.1 + Math.max(0, p.wall - 40) * 0.3;
  for (const r of RESOURCES) {
    v += p.gen[r] * 11;
    v += Math.min(p.res[r], 40) * 0.5 + Math.max(0, p.res[r] - 40) * 0.15;
  }
  return v;
}

/** How good the position is for player `me`. */
export function evaluate(state: GameState, me: 0 | 1, rules: Rules = DEFAULT_RULES): number {
  if (state.winner === me) return 1e6;
  if (state.winner === 'draw') return 0;
  if (state.winner !== null) return -1e6;
  return sideValue(state.players[me], rules) - sideValue(state.players[1 - me], rules);
}

/** Rough worth of holding a card: its effect, discounted by how long until we can afford it. */
function cardWorth(state: GameState, me: 0 | 1, cardId: string, rules: Rules): number {
  const c = card(cardId);
  const sim = structuredClone(state);
  const p = sim.players[me];
  for (const o of c.ops) applyOp(p, sim.players[1 - me], o);
  let gain = evaluate(sim, me, rules) - evaluate(state, me, rules);
  if (c.ops.some((o) => o.op === 'again')) gain += 4;
  const real = state.players[me];
  const short = c.cost - real.res[c.type];
  const turnsAway = short <= 0 ? 0 : Math.ceil(short / real.gen[c.type]);
  return gain / (1 + turnsAway);
}

function scoreAction(state: GameState, a: Action, depth: number, rules: Rules): number {
  const me = state.current;
  const base = evaluate(state, me, rules);
  if (a.kind === 'discard') {
    return -1 - cardWorth(state, me, state.players[me].hand[a.index], rules) * 0.25;
  }
  const next = step(state, a, rules);
  let gain = evaluate(next, me, rules) - base;
  // "Play again": look ahead at our best follow-up.
  if (next.winner === null && next.current === me && depth > 0) {
    const follow = legalActions(next).map((b) => scoreAction(next, b, depth - 1, rules));
    gain += Math.max(...follow);
  }
  return gain;
}

export function chooseAction(state: GameState, difficulty: Difficulty = 'normal', rules: Rules = DEFAULT_RULES): Action {
  const actions = legalActions(state);
  if (actions.length === 0) throw new Error('No legal actions');
  const depth = difficulty === 'hard' ? 3 : 1;
  const scored = actions.map((a) => ({ a, s: scoreAction(state, a, depth, rules) }));

  if (difficulty === 'easy') {
    // Sloppy: noisy scores and the occasional random move.
    if (Math.random() < 0.2) return actions[Math.floor(Math.random() * actions.length)];
    for (const x of scored) x.s += (Math.random() - 0.5) * 30;
  }
  scored.sort((x, y) => y.s - x.s);
  return scored[0].a;
}
