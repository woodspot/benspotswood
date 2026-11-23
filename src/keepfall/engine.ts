import { building, card, standardDeck } from './cards';
import { EVENTS, EVENT_MAP, FACTIONS, FACTION_MAP, mergeMods, type FactionId, type Mods } from './factions';
import { RELIC_MAP } from './relics';
import { DEFAULT_RULES, RESOURCES } from './types';
import type { Action, GameState, Op, Player, Rules, StartBonus, WinKind } from './types';

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

/** Each player draws from their own deck; the discard pile reshuffles when it runs out. */
function draw(state: GameState, who: 0 | 1): string {
  const p = state.players[who];
  if (p.deck.length === 0) {
    p.deck = p.discard;
    p.discard = [];
    shuffle(state, p.deck);
  }
  return p.deck.pop()!;
}

function applyStart(p: Player, b: StartBonus | undefined, rules: Rules): void {
  if (!b) return;
  p.tower += b.tower ?? 0;
  p.wall += b.wall ?? 0;
  for (const r of RESOURCES) {
    p.gen[r] += b.gen?.[r] ?? 0;
    p.res[r] += b.res?.[r] ?? 0;
  }
  for (const id of b.buildings ?? []) addBuilding(p, id, rules);
}

function newPlayer(name: string, faction: FactionId, relics: string[], deck: string[], rules: Rules): Player {
  const p: Player = {
    name,
    faction,
    relics: [...relics],
    tower: rules.startTower,
    wall: rules.startWall,
    res: { stone: rules.startRes, mana: rules.startRes, steel: rules.startRes },
    gen: { stone: rules.startGen, mana: rules.startGen, steel: rules.startGen },
    hand: [],
    deck: [...deck],
    discard: [],
    buildings: [],
  };
  applyStart(p, FACTION_MAP[faction].start, rules);
  for (const r of relics) applyStart(p, RELIC_MAP[r]?.start, rules);
  return p;
}

export interface NewGameOptions {
  seed?: number;
  names?: [string, string];
  factions?: [FactionId, FactionId];
  decks?: [string[], string[]]; // default: the standard deck for both
  relics?: [string[], string[]];
  first?: 0 | 1;
  rules?: Rules;
}

export function newGame(opts: NewGameOptions = {}): GameState {
  const rules = opts.rules ?? DEFAULT_RULES;
  const names = opts.names ?? ['You', 'Opponent'];
  const seed = opts.seed ?? (Math.random() * 2 ** 32) | 0;
  // Pick factions from the seed if not given, so seeded games stay reproducible.
  const pick = (n: number) => FACTIONS[Math.abs(seed + n) % FACTIONS.length].id;
  const factions = opts.factions ?? [pick(0), pick(1)];
  const decks = opts.decks ?? [standardDeck(), standardDeck()];
  const relics = opts.relics ?? [[], []];
  const state: GameState = {
    players: [
      newPlayer(names[0], factions[0], relics[0], decks[0], rules),
      newPlayer(names[1], factions[1], relics[1], decks[1], rules),
    ],
    current: 0,
    turn: 1,
    rng: seed,
    winner: null,
    log: [],
    event: null,
  };
  for (const who of [0, 1] as const) {
    shuffle(state, state.players[who].deck);
    for (let i = 0; i < rules.handSize; i++) state.players[who].hand.push(draw(state, who));
  }
  state.current = opts.first ?? (nextRandom(state) < 0.5 ? 0 : 1);
  // Going first is an advantage, so the first player skips their opening production.
  return state;
}

/** Everything changing the rules for player `who`: faction, relics and the shared event. */
export function modsFor(state: GameState, who: 0 | 1): Required<Mods> {
  const p = state.players[who];
  return mergeMods(
    FACTION_MAP[p.faction],
    ...p.relics.map((r) => RELIC_MAP[r]),
    state.event ? EVENT_MAP[state.event] : undefined,
  );
}

function addBuilding(p: Player, id: string, rules: Rules): void {
  p.buildings.push(id);
  while (p.buildings.length > rules.buildingSlots) p.buildings.shift(); // replaces the oldest
}

/** Start of turn: generators produce, then the player's buildings act. */
function startTurn(state: GameState, rules: Rules): void {
  const who = state.current;
  const p = state.players[who];
  const foe = state.players[1 - who];
  const mods = modsFor(state, who);
  for (const r of RESOURCES) p.res[r] += Math.max(1, p.gen[r] + mods.prodDelta);
  // Buildings deal their printed damage: card bonuses (faction, relic, event) don't stack every turn.
  const plain = { ...mods, damageBonus: 0, spellBonus: 0 };
  for (const id of p.buildings) {
    const b = building(id);
    for (const o of b.ops) applyOp(p, foe, o, plain, rules);
  }
}

/** Every `eventEvery` turns the shared event changes. */
function maybeChangeEvent(state: GameState, rules: Rules): void {
  if (!rules.eventEvery || state.turn === 1 || (state.turn - 1) % rules.eventEvery !== 0) return;
  const choices = EVENTS.filter((e) => e.id !== state.event);
  const e = choices[Math.floor(nextRandom(state) * choices.length)];
  state.event = e.id;
  state.log.push({ player: state.current, kind: 'event', text: `${e.icon} ${e.name}: ${e.text}` });
}

export function costOf(state: GameState, who: 0 | 1, cardId: string): number {
  const c = card(cardId);
  return Math.max(0, c.cost + (modsFor(state, who).costDelta[c.type] ?? 0));
}

export function canAfford(state: GameState, who: 0 | 1, cardId: string): boolean {
  return state.players[who].res[card(cardId).type] >= costOf(state, who, cardId);
}

export function legalActions(state: GameState): Action[] {
  if (state.winner !== null) return [];
  const who = state.current;
  const out: Action[] = [];
  state.players[who].hand.forEach((id, index) => {
    if (canAfford(state, who, id)) out.push({ kind: 'play', index });
    out.push({ kind: 'discard', index });
  });
  return out;
}

const NO_MODS: Required<Mods> = mergeMods();

export function applyOp(me: Player, foe: Player, o: Op, mods: Required<Mods> = NO_MODS, rules: Rules = DEFAULT_RULES): void {
  switch (o.op) {
    case 'damage': {
      const amt = o.amt + mods.damageBonus;
      const absorbed = Math.min(foe.wall, amt);
      foe.wall -= absorbed;
      foe.tower = Math.max(0, foe.tower - (amt - absorbed));
      break;
    }
    case 'tower': {
      const t = o.target === 'self' ? me : foe;
      const amt = o.target === 'enemy' && o.amt < 0 ? o.amt - mods.spellBonus : o.amt;
      t.tower = Math.max(0, t.tower + amt);
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
    case 'build':
      addBuilding(me, o.building, rules);
      break;
    case 'demolish': {
      if (foe.buildings.length === 0) break;
      let best = 0;
      foe.buildings.forEach((id, i) => {
        if (building(id).worth >= building(foe.buildings[best]).worth) best = i;
      });
      foe.buildings.splice(best, 1);
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
    if (!canAfford(state, who, cardId)) throw new Error(`Cannot afford ${c.name}`);
    me.res[c.type] -= costOf(state, who, cardId);
    const mods = modsFor(state, who);
    for (const o of c.ops) applyOp(me, foe, o, mods, rules);
    playAgain = c.ops.some((o) => o.op === 'again');
    state.log.push({ player: who, kind: 'play', cardId, text: `${me.name} played ${c.name}` });
  } else {
    state.log.push({ player: who, kind: 'discard', cardId, text: `${me.name} discarded ${c.name}` });
  }
  state.lastAction = { player: who, kind: action.kind, cardId };

  me.hand.splice(action.index, 1);
  me.discard.push(cardId);
  me.hand.push(draw(state, who));

  checkWinner(state, rules);
  if (state.winner !== null) {
    state.log.push({ player: who, kind: 'info', text: state.winReason! });
    return state;
  }

  if (!playAgain) {
    state.current = (1 - who) as 0 | 1;
    state.turn++;
    maybeChangeEvent(state, rules);
    const next = state.players[state.current];
    if (next.buildings.length) {
      const names = next.buildings.map((id) => `${building(id).icon} ${building(id).name}`).join(', ');
      state.log.push({ player: state.current, kind: 'building', text: `${next.name}'s buildings act: ${names}` });
    }
    startTurn(state, rules);
    checkWinner(state, rules); // production or buildings can end the game
    if (state.winner !== null) state.log.push({ player: state.current, kind: 'info', text: state.winReason! });
  }
  return state;
}
