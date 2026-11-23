import { CARDS, card } from './cards';
import { DEFAULT_RULES, RESOURCES } from './types';
import type { Action, GameState, Op, Player, Rules, WinKind } from './types';

// ── Seeded RNG (mulberry32): same seed → same game ─────────────
function nextRandom(state: GameState): number {
  let t = (state.rng = (state.rng + 0x6d2b79f5) | 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

function shuffle(state: GameState, arr: string[]): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(nextRandom(state) * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

function draw(state: GameState): string {
  if (state.deck.length === 0) {
    state.deck = state.discard;
    state.discard = [];
    shuffle(state, state.deck);
  }
  return state.deck.pop()!;
}

function newPlayer(name: string, rules: Rules): Player {
  return {
    name,
    tower: rules.startTower,
    wall: rules.startWall,
    res: { stone: rules.startRes, mana: rules.startRes, steel: rules.startRes },
    gen: { stone: rules.startGen, mana: rules.startGen, steel: rules.startGen },
    hand: [],
  };
}

export function newGame(opts: { seed?: number; names?: [string, string]; first?: 0 | 1; rules?: Rules } = {}): GameState {
  const rules = opts.rules ?? DEFAULT_RULES;
  const names = opts.names ?? ['You', 'Opponent'];
  const state: GameState = {
    players: [newPlayer(names[0], rules), newPlayer(names[1], rules)],
    current: 0,
    turn: 1,
    deck: CARDS.flatMap((c) => Array.from({ length: c.copies }, () => c.id)),
    discard: [],
    rng: opts.seed ?? (Math.random() * 2 ** 32) | 0,
    winner: null,
    log: [],
  };
  shuffle(state, state.deck);
  for (let i = 0; i < rules.handSize; i++) {
    state.players[0].hand.push(draw(state));
    state.players[1].hand.push(draw(state));
  }
  state.current = opts.first ?? (nextRandom(state) < 0.5 ? 0 : 1);
  // Going first is an advantage, so the first player skips their opening production.
  return state;
}

/** Start of turn: each generator adds its resource. */
function produce(state: GameState): void {
  const p = state.players[state.current];
  for (const r of RESOURCES) p.res[r] += p.gen[r];
}

export function canAfford(p: Player, cardId: string): boolean {
  const c = card(cardId);
  return p.res[c.type] >= c.cost;
}

export function legalActions(state: GameState): Action[] {
  if (state.winner !== null) return [];
  const p = state.players[state.current];
  const out: Action[] = [];
  p.hand.forEach((id, index) => {
    if (canAfford(p, id)) out.push({ kind: 'play', index });
    out.push({ kind: 'discard', index });
  });
  return out;
}

export function applyOp(me: Player, foe: Player, o: Op): void {
  switch (o.op) {
    case 'damage': {
      const absorbed = Math.min(foe.wall, o.amt);
      foe.wall -= absorbed;
      foe.tower = Math.max(0, foe.tower - (o.amt - absorbed));
      break;
    }
    case 'tower': {
      const t = o.target === 'self' ? me : foe;
      t.tower = Math.max(0, t.tower + o.amt);
      break;
    }
    case 'wall': {
      const t = o.target === 'self' ? me : foe;
      t.wall = Math.max(0, t.wall + o.amt);
      break;
    }
    case 'res': {
      const t = o.target === 'self' ? me : foe;
      t.res[o.res] = Math.max(0, t.res[o.res] + o.amt);
      break;
    }
    case 'gen': {
      const t = o.target === 'self' ? me : foe;
      t.gen[o.res] = Math.max(1, t.gen[o.res] + o.amt); // generators never drop below 1
      break;
    }
    case 'steal': {
      const taken = Math.min(foe.res[o.res], o.amt);
      foe.res[o.res] -= taken;
      me.res[o.res] += taken;
      break;
    }
    case 'again':
      break;
  }
}

function checkWinner(state: GameState, rules: Rules): void {
  const won = state.players.map((p, i): WinKind | null => {
    const foe = state.players[1 - i];
    if (foe.tower <= 0) return 'destroy';
    if (p.tower >= rules.winTower) return 'tower';
    if (RESOURCES.some((r) => p.res[r] >= rules.winRes)) return 'hoard';
    return null;
  });
  if (won[0] && won[1]) {
    state.winner = 'draw';
    state.winReason = 'Both sides won at the same moment';
  } else if (won[0] || won[1]) {
    const w = won[0] ? 0 : 1;
    const kind = won[w]!;
    const name = state.players[w].name;
    state.winner = w;
    state.winKind = kind;
    state.winReason =
      kind === 'destroy' ? `${name} won by toppling the enemy tower`
      : kind === 'tower' ? `${name} won by raising their tower to ${rules.winTower}`
      : `${name} won by stockpiling ${rules.winRes} of a resource`;
  }
}

/**
 * The whole game in one pure function: (state, action) → new state.
 * The UI and AI never mutate state themselves.
 */
export function step(prev: GameState, action: Action, rules: Rules = DEFAULT_RULES): GameState {
  if (prev.winner !== null) return prev;
  const state = structuredClone(prev);
  const who = state.current;
  const me = state.players[who];
  const foe = state.players[1 - who];
  const cardId = me.hand[action.index];
  if (cardId === undefined) throw new Error('No card at that index');
  const c = card(cardId);

  let playAgain = false;
  if (action.kind === 'play') {
    if (!canAfford(me, cardId)) throw new Error(`Cannot afford ${c.name}`);
    me.res[c.type] -= c.cost;
    for (const o of c.ops) applyOp(me, foe, o);
    playAgain = c.ops.some((o) => o.op === 'again');
    state.log.push({ player: who, kind: 'play', cardId, text: `${me.name} played ${c.name}` });
  } else {
    state.log.push({ player: who, kind: 'discard', cardId, text: `${me.name} discarded ${c.name}` });
  }
  state.lastAction = { player: who, kind: action.kind, cardId };

  me.hand.splice(action.index, 1);
  state.discard.push(cardId);
  me.hand.push(draw(state));

  checkWinner(state, rules);
  if (state.winner !== null) {
    state.log.push({ player: who, kind: 'info', text: state.winReason! });
    return state;
  }

  if (!playAgain) {
    state.current = (1 - who) as 0 | 1;
    state.turn++;
    produce(state);
    checkWinner(state, rules); // production can hit the resource goal
    if (state.winner !== null) state.log.push({ player: state.current, kind: 'info', text: state.winReason! });
  }
  return state;
}
