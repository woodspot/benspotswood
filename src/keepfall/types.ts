import type { FactionId } from './factions';

export type Resource = 'stone' | 'mana' | 'steel';
export type Generator = 'quarry' | 'sanctum' | 'barracks';
export type Target = 'self' | 'enemy';

export const RESOURCES: Resource[] = ['stone', 'mana', 'steel'];
export const GENERATOR_FOR: Record<Resource, Generator> = {
  stone: 'quarry',
  mana: 'sanctum',
  steel: 'barracks',
};

/** One step of a card's effect. Cards are pure data built from these. */
export type Op =
  | { op: 'damage'; amt: number } // hits enemy wall first, then tower
  | { op: 'tower'; amt: number; target: Target } // +/- tower directly
  | { op: 'wall'; amt: number; target: Target } // +/- wall directly
  | { op: 'res'; res: Resource; amt: number; target: Target }
  | { op: 'gen'; res: Resource; amt: number; target: Target }
  | { op: 'steal'; res: Resource; amt: number }
  | { op: 'again' }; // play another card this turn

export interface CardDef {
  id: string;
  name: string;
  type: Resource; // which resource it costs
  cost: number;
  copies: number; // copies in the shared deck
  ops: Op[];
  flavor?: string;
}

export interface Player {
  name: string;
  faction: FactionId;
  tower: number;
  wall: number;
  res: Record<Resource, number>;
  gen: Record<Resource, number>;
  hand: string[]; // card ids
}

export type Action =
  | { kind: 'play'; index: number }
  | { kind: 'discard'; index: number };

export interface LogEntry {
  player: 0 | 1;
  kind: 'play' | 'discard' | 'info' | 'event';
  cardId?: string;
  text: string;
}

export type WinKind = 'destroy' | 'tower' | 'hoard';

export interface GameState {
  players: [Player, Player];
  current: 0 | 1;
  turn: number;
  deck: string[];
  discard: string[];
  rng: number; // seeded RNG state, so games are reproducible
  winner: 0 | 1 | 'draw' | null;
  winKind?: WinKind;
  winReason?: string;
  log: LogEntry[];
  lastAction?: { player: 0 | 1; kind: 'play' | 'discard'; cardId: string };
  event: string | null; // id of the active shared event, if any
}

export interface Rules {
  startTower: number;
  startWall: number;
  startRes: number;
  startGen: number;
  handSize: number;
  winTower: number;
  winRes: number;
  eventEvery: number; // a new event every N turns (0 = no events)
}

export const DEFAULT_RULES: Rules = {
  startTower: 25,
  startWall: 10,
  startRes: 5,
  startGen: 2,
  handSize: 6,
  winTower: 50,
  winRes: 150,
  eventEvery: 6,
};
