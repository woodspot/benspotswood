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
  | { op: 'build'; building: string } // put a building in one of your slots
  | { op: 'demolish' } // destroy the enemy's most valuable building
  | { op: 'again' }; // play another card this turn

export type Rarity = 'common' | 'uncommon' | 'rare';

export interface CardDef {
  id: string;
  name: string;
  type: Resource; // which resource it costs
  cost: number;
  copies: number; // copies in the standard deck
  ops: Op[];
  flavor?: string;
  upgraded?: boolean;
}

/** A building sits in a slot and runs its ops at the start of each of its owner's turns. */
export interface BuildingDef {
  id: string;
  name: string;
  icon: string;
  ops: Op[];
  worth: number; // rough value for the AI
}

/** Bonuses applied when a game starts (factions and relics both use this). */
export interface StartBonus {
  wall?: number;
  tower?: number;
  gen?: Partial<Record<Resource, number>>;
  res?: Partial<Record<Resource, number>>;
  buildings?: string[];
}

export interface Player {
  name: string;
  faction: FactionId;
  relics: string[];
  tower: number;
  wall: number;
  res: Record<Resource, number>;
  gen: Record<Resource, number>;
  hand: string[]; // card ids
  deck: string[]; // draw pile (top = end)
  discard: string[];
  buildings: string[]; // building ids, oldest first
}

export type Action =
  | { kind: 'play'; index: number }
  | { kind: 'discard'; index: number };

export interface LogEntry {
  player: 0 | 1;
  kind: 'play' | 'discard' | 'info' | 'event' | 'building';
  cardId?: string;
  text: string;
}

export type WinKind = 'destroy' | 'tower' | 'hoard';

export interface GameState {
  players: [Player, Player];
  current: 0 | 1;
  turn: number;
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
  buildingSlots: number;
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
  buildingSlots: 3,
};
