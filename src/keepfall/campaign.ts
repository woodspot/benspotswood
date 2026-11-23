import type { Difficulty } from './ai';
import { canUpgrade, STARTER_DECK } from './cards';
import { aiDeck, offerCards, rand, type RngHolder } from './draft';
import { FACTIONS, type FactionId } from './factions';
import { availableRelics } from './relics';

export type NodeType = 'battle' | 'elite' | 'camp' | 'treasure' | 'boss';

export interface EnemySpec {
  name: string;
  faction: FactionId;
  difficulty: Difficulty;
  relics: string[];
  picks: number; // drafted cards on top of the starter deck
}

export interface MapNode {
  type: NodeType;
  enemy?: EnemySpec;
}

export type RunStatus = 'map' | 'battle' | 'reward' | 'camp' | 'treasure' | 'won' | 'lost';

export interface RunState extends RngHolder {
  version: 1;
  faction: FactionId;
  deck: string[];
  relics: string[];
  lives: number;
  maxLives: number;
  map: MapNode[][];
  floor: number; // index of the floor currently being played (-1 before the first choice)
  path: number[]; // node chosen on each floor
  status: RunStatus;
  pendingCards?: string[];
  pendingRelics?: string[];
  battles: { won: number; lost: number };
  siege?: number; // difficulty level 0–5 (missing in older saves)
  elites?: number; // elites beaten
  scored?: boolean; // Renown already awarded for this run
}

export interface RunOptions {
  siege?: number;
  startRelic?: boolean; // begin by choosing 1 of 3 relics
  startCard?: boolean; // begin with a free pick from 3 strong cards
}

export const MAX_SIEGE = 5;

/** Each Siege level adds its rule on top of the ones below it. */
export const SIEGE_RULES = [
  'The standard campaign.',
  'Ordinary battles are one difficulty harder.',
  'Every enemy has +6 Wall, +3 Tower and 3 more drafted cards.',
  'You have only 2 banners.',
  'Elites and the boss carry an extra relic.',
  'The Iron Warden has +10 Tower.',
];

export const FLOORS = 9;
export const MIN_DECK = 12;

const ENEMY_NAMES = [
  'Baron Ashcombe', 'The Gravel Queen', 'Mother Hollow', 'Sir Brannoc', 'The Tinker Lord',
  'Warlock Vesk', 'Captain Rook', 'Lady Thornwick', 'Old Man Cairn', 'The Saltmarsh Twins',
];
const ELITE_NAMES = ['The Black Bastion', 'Hexmother Ilse', 'General Kord', 'The Hollow Knight-Abbot'];
export const BOSS_NAME = 'The Iron Warden';

export const NODE_INFO: Record<NodeType, { icon: string; label: string; text: string }> = {
  battle: { icon: '⚔️', label: 'Battle', text: 'Fight a rival lord. Win to add a card to your deck.' },
  elite: { icon: '💀', label: 'Elite', text: 'A tough foe with a relic. Better rewards: a rare-leaning card and a relic.' },
  camp: { icon: '🔥', label: 'Camp', text: 'Rest: upgrade a card, remove a card, or recover a banner.' },
  treasure: { icon: '💎', label: 'Treasure', text: 'Choose one of three relics.' },
  boss: { icon: '👑', label: 'Boss', text: `${BOSS_NAME} guards the last keep.` },
};

function pickOne<T>(h: RngHolder, list: T[]): T {
  return list[Math.floor(rand(h) * list.length)];
}

function randomRelics(h: RngHolder, n: number, exclude: string[] = []): string[] {
  const pool = availableRelics()
    .map((r) => r.id)
    .filter((id) => !exclude.includes(id));
  const out: string[] = [];
  while (out.length < n && pool.length) out.push(pool.splice(Math.floor(rand(h) * pool.length), 1)[0]);
  return out;
}

const HARDER: Record<Difficulty, Difficulty> = { easy: 'normal', normal: 'hard', hard: 'hard' };

function enemyFor(h: RngHolder, type: NodeType, floor: number, siege: number): EnemySpec {
  const faction = pickOne(h, FACTIONS).id;
  let spec: EnemySpec;
  if (type === 'boss') {
    spec = { name: BOSS_NAME, faction, difficulty: 'hard', relics: ['foundation', ...randomRelics(h, 1, ['foundation'])], picks: 18 };
  } else if (type === 'elite') {
    spec = { name: pickOne(h, ELITE_NAMES), faction, difficulty: 'hard', relics: randomRelics(h, 1), picks: 6 + floor * 2 };
  } else {
    const base: Difficulty = floor < 3 ? 'easy' : 'normal';
    spec = { name: pickOne(h, ENEMY_NAMES), faction, difficulty: siege >= 1 ? HARDER[base] : base, relics: [], picks: 3 + floor * 2 };
  }
  if (siege >= 2) {
    spec.relics.push('siege-walls');
    spec.picks += 3;
  }
  if (siege >= 4 && type !== 'battle') spec.relics.push(...randomRelics(h, 1, spec.relics));
  if (siege >= 5 && type === 'boss') spec.relics.push('warden-might');
  return spec;
}

export function generateMap(h: RngHolder, siege = 0): MapNode[][] {
  const floors: MapNode[][] = [];
  for (let f = 0; f < FLOORS; f++) {
    let types: NodeType[];
    if (f === 0) types = ['battle', 'battle'];
    else if (f === FLOORS - 1) types = ['boss'];
    else if (f === FLOORS - 2) types = ['camp', 'treasure'];
    else {
      const n = rand(h) < 0.5 ? 2 : 3;
      types = [];
      for (let i = 0; i < n; i++) {
        const r = rand(h);
        types.push(f >= 2 && r < 0.2 ? 'elite' : r < 0.32 ? 'camp' : r < 0.42 ? 'treasure' : 'battle');
      }
      if (!types.some((t) => t === 'battle' || t === 'elite')) types[0] = 'battle';
    }
    floors.push(types.map((type) => (type === 'camp' || type === 'treasure' ? { type } : { type, enemy: enemyFor(h, type, f, siege) })));
  }
  return floors;
}

export function newRun(faction: FactionId, seed = (Math.random() * 2 ** 32) | 0, opts: RunOptions = {}): RunState {
  const siege = Math.max(0, Math.min(MAX_SIEGE, opts.siege ?? 0));
  const lives = siege >= 3 ? 2 : 3;
  const run: RunState = {
    version: 1,
    rng: seed,
    faction,
    deck: [...STARTER_DECK],
    relics: [],
    lives,
    maxLives: lives,
    map: [],
    floor: -1,
    path: [],
    status: 'map',
    battles: { won: 0, lost: 0 },
    siege,
    elites: 0,
  };
  run.map = generateMap(run, siege);
  // Unlocked head starts: pick them before the first floor, on the reward screen.
  if (opts.startRelic || opts.startCard) {
    run.status = 'reward';
    if (opts.startCard) run.pendingCards = offerCards(run, 3, 1);
    if (opts.startRelic) run.pendingRelics = randomRelics(run, 3);
  }
  return run;
}

export function currentNode(run: RunState): MapNode | null {
  return run.floor >= 0 ? run.map[run.floor][run.path[run.floor]] : null;
}

/** Pick a node on the next floor. */
export function chooseNode(prev: RunState, index: number): RunState {
  if (prev.status !== 'map') throw new Error('Not on the map');
  const run = structuredClone(prev);
  run.floor++;
  run.path.push(index);
  const node = run.map[run.floor][index];
  if (!node) throw new Error('No such node');
  if (node.type === 'camp') run.status = 'camp';
  else if (node.type === 'treasure') {
    run.status = 'treasure';
    run.pendingRelics = randomRelics(run, 3, run.relics);
  } else run.status = 'battle';
  return run;
}

/** Everything newGame needs for the current battle. The enemy deck is built from the run's seed. */
export function battleSetup(prev: RunState): { run: RunState; enemy: EnemySpec; enemyDeck: string[] } {
  const run = structuredClone(prev);
  const node = currentNode(run);
  if (!node?.enemy) throw new Error('No battle here');
  return { run, enemy: node.enemy, enemyDeck: aiDeck(run, node.enemy.picks) };
}

export function finishBattle(prev: RunState, won: boolean): RunState {
  const run = structuredClone(prev);
  const node = currentNode(run)!;
  if (won) {
    run.battles.won++;
    if (node.type === 'elite') run.elites = (run.elites ?? 0) + 1;
    if (node.type === 'boss') {
      run.status = 'won';
      return run;
    }
    run.status = 'reward';
    run.pendingCards = offerCards(run, 3, node.type === 'elite' ? 1 : 0);
    run.pendingRelics = node.type === 'elite' ? randomRelics(run, 3, run.relics) : undefined;
  } else {
    run.battles.lost++;
    run.lives--;
    run.status = run.lives <= 0 ? 'lost' : 'map';
    // Losing the boss fight with banners left: try again.
    if (run.status === 'map' && node.type === 'boss') run.status = 'battle';
  }
  return run;
}

export function takeReward(prev: RunState, cardId: string | null, relicId: string | null): RunState {
  const run = structuredClone(prev);
  if (cardId && run.pendingCards?.includes(cardId)) run.deck.push(cardId);
  if (relicId && run.pendingRelics?.includes(relicId)) run.relics.push(relicId);
  run.pendingCards = run.pendingRelics = undefined;
  run.status = 'map';
  return run;
}

export function takeTreasure(prev: RunState, relicId: string): RunState {
  return takeReward(prev, null, relicId);
}

export type CampChoice = { kind: 'upgrade'; index: number } | { kind: 'remove'; index: number } | { kind: 'rest' };

export function canCamp(run: RunState, c: CampChoice): boolean {
  if (c.kind === 'rest') return run.lives < run.maxLives;
  const id = run.deck[c.index];
  if (id === undefined) return false;
  return c.kind === 'upgrade' ? canUpgrade(id) : run.deck.length > MIN_DECK;
}

export function camp(prev: RunState, c: CampChoice): RunState {
  if (!canCamp(prev, c)) throw new Error('Not allowed');
  const run = structuredClone(prev);
  if (c.kind === 'rest') run.lives++;
  else if (c.kind === 'upgrade') run.deck[c.index] += '+';
  else run.deck.splice(c.index, 1);
  run.status = 'map';
  return run;
}
