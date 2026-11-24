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
  | { op: 'again' } // play another card this turn
  | { op: 'burn'; amt: number; turns: number } // enemy Tower loses amt at the start of each of their next `turns` turns
  | { op: 'ward'; amt: number } // absorbs enemy harm to your Tower and Wall
  | { op: 'curse'; count: number } // shuffle Rubble into the enemy deck
  | { op: 'if'; cond: Condition; then: Op[] }
  | { op: 'choose'; options: Op[][] } // the player picks one option when playing
  | { op: 'redraw' } // discard your hand and draw a new one
  | { op: 'weather'; event: string }; // change the shared weather (event) right now

/** foeNoWall: enemy Wall is 0 · behind: your Tower is lower · combo: you already played a card this turn */
export type Condition = 'foeNoWall' | 'behind' | 'combo';

export type Rarity = 'common' | 'uncommon' | 'rare' | 'legendary';

export interface CardDef {
  id: string;
  name: string;
  type: Resource; // which resource it costs
  cost: number;
  copies: number; // copies in the standard deck
  ops: Op[];
  flavor?: string;
  upgraded?: boolean;
  text?: string[]; // rules text override (for cards with no ops)
  exhaust?: boolean; // leaves the deck when played instead of going to the discard pile
  curse?: boolean; // junk card: never offered in drafts or rewards
  legendary?: boolean; // boss reward only: never in drafts, shops or normal rewards
  enchant?: Enchant; // Dock enchantment (built from the card id, e.g. "archers~g")
}

/** Dock enchantments: g = Gilded (costs 1 less), t = Twin (play again), b = Burning (adds a Burn). */
export type Enchant = 'g' | 't' | 'b';

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
  ward?: number;
  curseFoe?: number; // Rubble shuffled into the enemy's deck
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
  ward: number;
  burn: number; // Tower lost at the start of each turn…
  burnTurns: number; // …for this many more turns
  captain?: { id: string; level: number; uses: number }; // the human's captain (campaigns)
}

export type Action =
  | { kind: 'play'; index: number; choice?: number }
  | { kind: 'discard'; index: number }
  | { kind: 'power' }; // use your captain's power (doesn't end the turn)

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
  chain: number; // cards the current player has played this turn (for Combo)
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
