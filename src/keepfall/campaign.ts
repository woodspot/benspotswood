// Campaign 2.0: three acts, each a short map of choices ending in a boss.
// Battles earn gold and cards; markets sell cards, relics and crew; events offer choices;
// docks upgrade, enchant or remove cards; defeated bosses drop legendary cards.
import type { Difficulty } from './ai';
import { canEnchant, canUpgrade, card, enchantId, LEGENDARY_CARDS, rarity, STARTER_DECK, upgradeId } from './cards';
import { aiDeck, offerCards, rand, type RngHolder } from './draft';
import { EVENT_DEF, EVENTS, type Effect } from './events';
import type { FactionId } from './factions';
import { FACTIONS } from './factions';
import { availableRelics, CREW, ELITE_TRAITS, RELIC_MAP } from './relics';
import type { Enchant } from './types';
import type { VoiceKey } from '../kids/words';

export type NodeType = 'battle' | 'elite' | 'camp' | 'treasure' | 'event' | 'market' | 'boss';

export interface EnemySpec {
  name: string;
  faction: FactionId;
  difficulty: Difficulty;
  relics: string[];
  picks: number; // drafted cards on top of the starter deck
  eventEvery?: number; // weather changes this often in this battle
  boss?: string; // boss id (for taunts)
}

export interface MapNode {
  type: NodeType;
  enemy?: EnemySpec;
  event?: string; // event id for ❓ nodes
}

export type RunStatus = 'map' | 'battle' | 'reward' | 'camp' | 'treasure' | 'event' | 'market' | 'act' | 'won' | 'lost';

export interface MarketItem {
  kind: 'card' | 'relic' | 'crew';
  id: string;
  price: number;
  sold?: boolean;
}

export interface RunState extends RngHolder {
  version: 2;
  faction: FactionId;
  deck: string[];
  relics: string[]; // relics found this run
  crew: string[]; // crew members
  yard: string[]; // Shipyard upgrades (hidden relics) carried into every battle
  captain?: { id: string; level: number };
  lives: number;
  maxLives: number;
  gold: number;
  act: number; // 1–3
  map: MapNode[][]; // the current act's floors
  floor: number; // index of the floor being played in this act (−1 before the first choice)
  path: number[]; // node chosen on each floor of this act
  status: RunStatus;
  pendingCards?: string[];
  pendingRelics?: string[];
  pendingGold?: number; // gold won in the last battle (shown on the reward screen)
  bonusGold?: number; // extra gold promised by an event for winning its battle
  market?: MarketItem[];
  eventResult?: string; // what happened at the last event
  battles: { won: number; lost: number };
  siege: number; // Storm level 0–10
  elites: number;
  bosses: number; // act bosses beaten
  floorsCleared: number; // across all acts
  removals: number; // cards removed at markets (each costs more)
  goldSpent: number;
  rerolls: number; // card-reward rerolls left (Lookout upgrade)
  dockActions: number; // actions per dock visit (Refit Crew upgrade gives 2)
  dockLeft?: number; // actions left at the current dock
  daily?: string; // date of a Daily Voyage
  dailyMods?: string[];
  fastestBoss?: number; // fewest turns to beat a boss (feats)
  winKinds?: string[]; // how battles were won: destroy / tower / hoard (feats)
  scored?: boolean; // Renown already awarded for this run
}

export interface RunOptions {
  siege?: number;
  startRelic?: boolean; // begin by choosing 1 of 3 relics
  startCard?: boolean; // begin with a free pick from 3 strong cards
  captain?: { id: string; level: number };
  yard?: string[]; // hidden relics from Shipyard upgrades
  extraLives?: number;
  gold?: number;
  rerolls?: number;
  dockActions?: number;
  daily?: string;
  dailyMods?: string[];
}

export const ACTS = 3;
export const FLOORS_PER_ACT = 6; // the last is the boss
export const MAX_SIEGE = 10;
export const MIN_DECK = 12;

export const ACT_INFO = [
  { name: 'The Cloud Sea', icon: '☁️', text: 'Calm skies and rival captains.' },
  { name: 'The Storm Wall', icon: '⛈️', text: 'The weather changes twice as often.' },
  { name: 'The High Harbor', icon: '🏰', text: 'Every enemy carries an extra relic.' },
];

/** The three bosses, with what they say (spoken with natural voice clips, once generated). */
export const BOSSES = [
  {
    id: 'leviathan', name: 'The Iron Leviathan', faction: 'stonewardens' as FactionId, relic: 'boss-leviathan', legendary: 'leg-heart',
    voice: 'villain' as VoiceKey, start: 'You dare challenge the Iron Leviathan? My armor has never been breached!', end: 'Impossible! My armor… broken…',
  },
  {
    id: 'thunder', name: 'The Thunder Queen', faction: 'stormcallers' as FactionId, relic: 'boss-thunder', legendary: 'leg-crown',
    voice: 'queen' as VoiceKey, start: 'Kneel before the Thunder Queen, little captain. The storm obeys only me.', end: 'The skies… are yours. For now.',
  },
  {
    id: 'smuggler', name: 'The Smuggler King', faction: 'shadowmarch' as FactionId, relic: 'boss-smuggler', legendary: 'leg-ransom',
    voice: 'villain' as VoiceKey, start: 'Everything you own is mine now. Your cards, your gold, your ship.', end: 'Fine! Keep your trinkets. The High Harbor is yours.',
  },
];

/** Each Storm level adds its rule on top of the ones below it. */
export const SIEGE_RULES = [
  'The standard campaign.',
  'Ordinary battles are one difficulty harder.',
  'Every enemy has +6 Armor, +3 Altitude and 3 more drafted cards.',
  'You have one banner fewer.',
  'Elites and bosses carry an extra relic.',
  'Bosses have +10 Altitude.',
  'Every enemy starts with 5 Ward.',
  'Card rewards offer 2 cards instead of 3.',
  'Market prices are 50% higher and you earn 25% less gold.',
  'Elites and bosses have an extra trait.',
  'Bosses start with +15 Altitude and +10 Armor.',
];

const ENEMY_NAMES = [
  'Captain Ashcombe', 'The Cloud Queen', 'Mother Gale', 'Commodore Brannoc', 'The Tinker Lord',
  'Warlock Vesk', 'Captain Rook', 'Lady Thornwick', 'Old Man Cirrus', 'The Squall Twins',
  'Admiral Fenwick', 'Baroness Mistral', 'Captain Halloway', 'The Cinder Sisters',
];
const ELITE_NAMES = ['The Black Galleon', 'Hexmother Ilse', 'Admiral Kord', 'The Hollow Zeppelin', 'The Brass Behemoth', 'Captain Nightjar'];

export const NODE_INFO: Record<NodeType, { icon: string; label: string; text: string }> = {
  battle: { icon: '⚔️', label: 'Battle', text: 'Fight a rival captain. Win gold and a card.' },
  elite: { icon: '💀', label: 'Elite', text: 'A tough foe with special traits. Better rewards: more gold, a rarer card and a relic.' },
  camp: { icon: '⚓', label: 'Dock', text: 'Refit: upgrade, enchant or remove a card, or recover a banner.' },
  treasure: { icon: '💎', label: 'Salvage', text: 'A drifting wreck. Choose one of three relics.' },
  event: { icon: '❓', label: 'Event', text: 'Something strange in the clouds. Make a choice.' },
  market: { icon: '🛒', label: 'Market', text: 'Spend gold on cards, relics, crew and services.' },
  boss: { icon: '👑', label: 'Boss', text: 'The ruler of this stretch of sky.' },
};

const pickOne = <T>(h: RngHolder, list: T[]): T => list[Math.floor(rand(h) * list.length)];

function randomRelics(h: RngHolder, n: number, exclude: string[] = []): string[] {
  const pool = availableRelics()
    .map((r) => r.id)
    .filter((id) => !exclude.includes(id));
  const out: string[] = [];
  while (out.length < n && pool.length) out.push(pool.splice(Math.floor(rand(h) * pool.length), 1)[0]);
  return out;
}

function randomFrom(h: RngHolder, list: string[], n: number, exclude: string[] = []): string[] {
  const pool = list.filter((x) => !exclude.includes(x));
  const out: string[] = [];
  while (out.length < n && pool.length) out.push(pool.splice(Math.floor(rand(h) * pool.length), 1)[0]);
  return out;
}

const HARDER: Record<Difficulty, Difficulty> = { easy: 'normal', normal: 'hard', hard: 'hard' };

function enemyFor(h: RngHolder, type: NodeType, act: number, floor: number, siege: number): EnemySpec {
  let spec: EnemySpec;
  const depth = (act - 1) * FLOORS_PER_ACT + floor; // 0 … 17
  if (type === 'boss') {
    const b = BOSSES[act - 1];
    spec = { name: b.name, faction: b.faction, difficulty: 'hard', relics: [b.relic, ...randomRelics(h, act - 1)], picks: 12 + act * 6, boss: b.id };
    if (b.id === 'thunder') spec.eventEvery = 2;
  } else if (type === 'elite') {
    spec = {
      name: pickOne(h, ELITE_NAMES),
      faction: pickOne(h, FACTIONS).id,
      difficulty: 'hard',
      relics: [...randomFrom(h, ELITE_TRAITS, 1), ...randomRelics(h, 1)],
      picks: 6 + depth * 2,
    };
  } else {
    const base: Difficulty = depth < 2 ? 'easy' : depth < 8 ? 'normal' : 'hard';
    spec = { name: pickOne(h, ENEMY_NAMES), faction: pickOne(h, FACTIONS).id, difficulty: siege >= 1 ? HARDER[base] : base, relics: [], picks: 3 + depth * 2 };
  }
  if (act === 2 && !spec.eventEvery) spec.eventEvery = 3;
  if (act === 3 && type !== 'boss') spec.relics.push(...randomRelics(h, 1, spec.relics));
  if (siege >= 2) {
    spec.relics.push('siege-walls');
    spec.picks += 3;
  }
  if (siege >= 4 && type !== 'battle') spec.relics.push(...randomRelics(h, 1, spec.relics));
  if (siege >= 5 && type === 'boss') spec.relics.push('warden-might');
  if (siege >= 6) spec.relics.push('storm-ward');
  if (siege >= 9 && type !== 'battle') spec.relics.push(...randomFrom(h, ELITE_TRAITS, 1, spec.relics));
  if (siege >= 10 && type === 'boss') spec.relics.push('storm-boss');
  return spec;
}

/** One act's map: floors of 2–3 choices, a rest stop before the boss, then the boss. */
export function generateMap(h: RngHolder, act: number, siege = 0): MapNode[][] {
  const floors: MapNode[][] = [];
  const last = FLOORS_PER_ACT - 1;
  for (let f = 0; f < FLOORS_PER_ACT; f++) {
    let types: NodeType[];
    if (f === last) types = ['boss'];
    else if (f === last - 1) types = rand(h) < 0.5 ? ['camp', 'market'] : ['camp', 'treasure'];
    else if (f === 0) types = ['battle', rand(h) < 0.5 ? 'event' : 'battle'];
    else {
      const n = rand(h) < 0.5 ? 2 : 3;
      types = [];
      for (let i = 0; i < n; i++) {
        const r = rand(h);
        types.push(r < 0.16 ? 'elite' : r < 0.36 ? 'event' : r < 0.46 ? 'market' : r < 0.54 ? 'camp' : r < 0.6 ? 'treasure' : 'battle');
      }
      if (!types.some((t) => t === 'battle' || t === 'elite')) types[0] = 'battle';
    }
    floors.push(
      types.map((type): MapNode => {
        if (type === 'battle' || type === 'elite' || type === 'boss') return { type, enemy: enemyFor(h, type, act, f, siege) };
        if (type === 'event') return { type, event: pickOne(h, EVENTS).id };
        return { type };
      }),
    );
  }
  return floors;
}

export function newRun(faction: FactionId, seed = (Math.random() * 2 ** 32) | 0, opts: RunOptions = {}): RunState {
  const siege = Math.max(0, Math.min(MAX_SIEGE, opts.siege ?? 0));
  const lives = (siege >= 3 ? 2 : 3) + (opts.extraLives ?? 0);
  const run: RunState = {
    version: 2,
    rng: seed,
    faction,
    deck: [...STARTER_DECK],
    relics: [],
    crew: [],
    yard: opts.yard ?? [],
    captain: opts.captain,
    lives,
    maxLives: lives,
    gold: opts.gold ?? 0,
    act: 1,
    map: [],
    floor: -1,
    path: [],
    status: 'map',
    battles: { won: 0, lost: 0 },
    siege,
    elites: 0,
    bosses: 0,
    floorsCleared: 0,
    removals: 0,
    goldSpent: 0,
    rerolls: opts.rerolls ?? 0,
    dockActions: opts.dockActions ?? 1,
    daily: opts.daily,
    dailyMods: opts.dailyMods,
  };
  run.map = generateMap(run, 1, siege);
  // Unlocked head starts: pick them before the first floor, on the reward screen.
  if (opts.startRelic || opts.startCard) {
    run.status = 'reward';
    if (opts.startCard) run.pendingCards = offerCards(run, 3, 1);
    if (opts.startRelic) run.pendingRelics = randomRelics(run, 3);
  }
  return run;
}

/** Old (version 1) saves can't be continued after the big campaign update. */
export const isCurrentRun = (r: unknown): r is RunState => !!r && (r as RunState).version === 2;

export function currentNode(run: RunState): MapNode | null {
  return run.floor >= 0 ? run.map[run.floor][run.path[run.floor]] : null;
}

const has = (run: RunState, perk: 'gold' | 'choice' | 'market') => run.crew.some((c) => RELIC_MAP[c]?.runPerk === perk);

/** How many card choices rewards offer. */
const cardChoices = (run: RunState) => (run.siege >= 7 ? 2 : 3) + (has(run, 'choice') ? 1 : 0);

function goldFor(run: RunState, type: NodeType): number {
  const base = type === 'boss' ? 60 + run.act * 15 : type === 'elite' ? 30 + run.act * 6 : 12 + run.act * 4 + Math.floor(rand(run) * 7);
  const g = base * (has(run, 'gold') ? 1.3 : 1) * (run.siege >= 8 ? 0.75 : 1) * (run.dailyMods?.includes('double-gold') ? 2 : 1);
  return Math.round(g);
}

function priceScale(run: RunState): number {
  return (has(run, 'market') ? 0.75 : 1) * (run.siege >= 8 ? 1.5 : 1);
}

function stockMarket(run: RunState): MarketItem[] {
  const s = priceScale(run);
  const price = (n: number) => Math.round(n * s);
  const cards = offerCards(run, 5, 0.5).map((id): MarketItem => ({
    kind: 'card',
    id,
    price: price({ common: 30, uncommon: 50, rare: 80, legendary: 150 }[rarity(id)] + run.act * 5),
  }));
  const relics = randomRelics(run, 2, run.relics).map((id): MarketItem => ({ kind: 'relic', id, price: price(110 + Math.floor(rand(run) * 4) * 10) }));
  const crew = randomFrom(run, CREW, 1, run.crew).map((id): MarketItem => ({ kind: 'crew', id, price: price(90) }));
  return [...cards, ...relics, ...crew];
}

/** Pick a node on the next floor. */
export function chooseNode(prev: RunState, index: number): RunState {
  if (prev.status !== 'map') throw new Error('Not on the map');
  const run = structuredClone(prev);
  run.floor++;
  run.path.push(index);
  const node = run.map[run.floor][index];
  if (!node) throw new Error('No such node');
  run.eventResult = undefined;
  if (node.type === 'camp') {
    run.status = 'camp';
    run.dockLeft = run.dockActions;
  } else if (node.type === 'treasure') {
    run.status = 'treasure';
    run.pendingRelics = randomRelics(run, 3, run.relics);
  } else if (node.type === 'market') {
    run.status = 'market';
    run.market = stockMarket(run);
  } else if (node.type === 'event') run.status = 'event';
  else run.status = 'battle';
  if (node.type !== 'battle' && node.type !== 'elite' && node.type !== 'boss') run.floorsCleared++;
  return run;
}

/** Everything newGame needs for the current battle. The enemy deck is built from the run's seed. */
export function battleSetup(prev: RunState): { run: RunState; enemy: EnemySpec; enemyDeck: string[]; myRelics: string[] } {
  const run = structuredClone(prev);
  const node = currentNode(run);
  if (!node?.enemy) throw new Error('No battle here');
  return { run, enemy: node.enemy, enemyDeck: aiDeck(run, node.enemy.picks), myRelics: [...run.relics, ...run.crew, ...run.yard] };
}

export function finishBattle(prev: RunState, won: boolean, turns = 0, winKind?: string): RunState {
  const run = structuredClone(prev);
  const node = currentNode(run)!;
  if (won) {
    run.battles.won++;
    if (winKind && !(run.winKinds ??= []).includes(winKind)) run.winKinds.push(winKind);
    run.floorsCleared++;
    const gold = goldFor(run, node.type) + (run.bonusGold ?? 0);
    run.bonusGold = undefined;
    run.gold += gold;
    run.pendingGold = gold;
    if (node.type === 'elite') run.elites++;
    if (node.type === 'boss') {
      run.bosses++;
      if (turns) run.fastestBoss = Math.min(run.fastestBoss ?? Infinity, turns);
      if (run.act >= ACTS) {
        run.status = 'won';
        return run;
      }
      // Act cleared: choose a legendary card, recover a banner, then on to the next act.
      run.status = 'act';
      run.lives = Math.min(run.maxLives, run.lives + 1);
      const own = BOSSES[run.act - 1].legendary;
      run.pendingCards = [own, ...randomFrom(run, LEGENDARY_CARDS, 2, [own])];
      run.pendingRelics = randomRelics(run, 3, run.relics);
      return run;
    }
    run.status = 'reward';
    run.pendingCards = offerCards(run, cardChoices(run), node.type === 'elite' ? 1 : 0);
    run.pendingRelics = node.type === 'elite' ? randomRelics(run, 3, run.relics) : undefined;
  } else {
    run.battles.lost++;
    run.lives--;
    run.pendingGold = undefined;
    run.status = run.lives <= 0 ? 'lost' : 'map';
    // Losing a boss fight with banners left: try again.
    if (run.status === 'map' && node.type === 'boss') run.status = 'battle';
  }
  return run;
}

/** Use a Lookout reroll on the card reward. */
export function rerollReward(prev: RunState): RunState {
  if (prev.rerolls <= 0 || !prev.pendingCards) return prev;
  const run = structuredClone(prev);
  run.rerolls--;
  run.pendingCards = offerCards(run, run.pendingCards!.length, 0.3);
  return run;
}

export function takeReward(prev: RunState, cardId: string | null, relicId: string | null): RunState {
  const run = structuredClone(prev);
  if (cardId && run.pendingCards?.includes(cardId)) run.deck.push(cardId);
  if (relicId && run.pendingRelics?.includes(relicId)) run.relics.push(relicId);
  run.pendingCards = run.pendingRelics = undefined;
  run.pendingGold = undefined;
  if (run.status === 'act') return startNextAct(run);
  run.status = 'map';
  return run;
}

function startNextAct(run: RunState): RunState {
  run.act++;
  run.floor = -1;
  run.path = [];
  run.map = generateMap(run, run.act, run.siege);
  run.status = 'map';
  return run;
}

export function takeTreasure(prev: RunState, relicId: string): RunState {
  return takeReward(prev, null, relicId);
}

// ── Docks ──────────────────────────────────────────────────────

export type CampChoice =
  | { kind: 'upgrade'; index: number }
  | { kind: 'remove'; index: number }
  | { kind: 'enchant'; index: number; ench: Enchant }
  | { kind: 'rest' };

export function canCamp(run: RunState, c: CampChoice): boolean {
  if (c.kind === 'rest') return run.lives < run.maxLives;
  const id = run.deck[c.index];
  if (id === undefined) return false;
  if (c.kind === 'upgrade') return canUpgrade(id);
  if (c.kind === 'enchant') return canEnchant(id);
  return run.deck.length > MIN_DECK;
}

export function camp(prev: RunState, c: CampChoice): RunState {
  if (!canCamp(prev, c)) throw new Error('Not allowed');
  const run = structuredClone(prev);
  if (c.kind === 'rest') run.lives++;
  else if (c.kind === 'upgrade') run.deck[c.index] = upgradeId(run.deck[c.index]);
  else if (c.kind === 'enchant') run.deck[c.index] = enchantId(run.deck[c.index], c.ench);
  else run.deck.splice(c.index, 1);
  run.dockLeft = (run.dockLeft ?? 1) - 1;
  run.status = run.dockLeft > 0 ? 'camp' : 'map';
  return run;
}

export function leaveDock(prev: RunState): RunState {
  const run = structuredClone(prev);
  run.status = 'map';
  run.dockLeft = 0;
  return run;
}

// ── Markets ────────────────────────────────────────────────────

export const removePrice = (run: RunState) => Math.round((40 + 15 * run.removals) * priceScale(run));
export const servicePrice = (run: RunState, kind: 'upgrade' | 'enchant' | 'banner') =>
  Math.round({ upgrade: 45, enchant: 60, banner: 70 }[kind] * priceScale(run));

function spend(run: RunState, amount: number): void {
  if (run.gold < amount) throw new Error('Not enough gold');
  run.gold -= amount;
  run.goldSpent += amount;
}

export function buyItem(prev: RunState, index: number): RunState {
  const run = structuredClone(prev);
  const item = run.market?.[index];
  if (!item || item.sold) throw new Error('Not for sale');
  spend(run, item.price);
  item.sold = true;
  if (item.kind === 'card') run.deck.push(item.id);
  else if (item.kind === 'relic') run.relics.push(item.id);
  else run.crew.push(item.id);
  return run;
}

export type Service = { kind: 'remove'; index: number } | { kind: 'upgrade'; index: number } | { kind: 'enchant'; index: number; ench: Enchant } | { kind: 'banner' };

export function canService(run: RunState, s: Service): boolean {
  if (s.kind === 'banner') return run.lives < run.maxLives && run.gold >= servicePrice(run, 'banner');
  const id = run.deck[s.index];
  if (id === undefined) return false;
  if (s.kind === 'remove') return run.deck.length > MIN_DECK && run.gold >= removePrice(run);
  if (s.kind === 'upgrade') return canUpgrade(id) && run.gold >= servicePrice(run, 'upgrade');
  return canEnchant(id) && run.gold >= servicePrice(run, 'enchant');
}

export function buyService(prev: RunState, s: Service): RunState {
  if (!canService(prev, s)) throw new Error('Not allowed');
  const run = structuredClone(prev);
  if (s.kind === 'banner') {
    spend(run, servicePrice(run, 'banner'));
    run.lives++;
  } else if (s.kind === 'remove') {
    spend(run, removePrice(run));
    run.removals++;
    run.deck.splice(s.index, 1);
  } else if (s.kind === 'upgrade') {
    spend(run, servicePrice(run, 'upgrade'));
    run.deck[s.index] = upgradeId(run.deck[s.index]);
  } else {
    spend(run, servicePrice(run, 'enchant'));
    run.deck[s.index] = enchantId(run.deck[s.index], s.ench);
  }
  return run;
}

export function leaveMarket(prev: RunState): RunState {
  const run = structuredClone(prev);
  run.status = 'map';
  run.market = undefined;
  return run;
}

// ── Events ─────────────────────────────────────────────────────

const ENCHANTS: Enchant[] = ['g', 't', 'b'];

/** Apply an event effect; returns lines describing what happened. */
function applyEffect(run: RunState, e: Effect, out: string[]): void {
  if (e.gold) {
    run.gold = Math.max(0, run.gold + e.gold);
    if (e.gold < 0) run.goldSpent -= e.gold;
    out.push(e.gold > 0 ? `+${e.gold} gold` : `${e.gold} gold`);
  }
  if (e.lives) {
    if (e.lives > 0) {
      if (run.lives < run.maxLives) {
        run.lives = Math.min(run.maxLives, run.lives + e.lives);
        out.push('Recovered a banner 🚩');
      } else {
        run.gold += 30;
        out.push('Banners already full: +30 gold');
      }
    } else {
      run.lives = Math.max(0, run.lives + e.lives);
      out.push('Lost a banner 🏳️');
    }
  }
  for (let i = 0; i < (e.card ? (e.cards ?? 1) : 0); i++) {
    let id: string;
    if (e.card === 'random') id = offerCards(run, 1, 0)[0];
    else if (e.card === 'rare') id = offerCards(run, 1, 2)[0];
    else if (e.card === 'legendary') id = pickOne(run, LEGENDARY_CARDS);
    else id = e.card!;
    run.deck.push(id);
    out.push(`Added ${card(id).name}`);
  }
  if (e.junk) {
    for (let i = 0; i < e.junk; i++) run.deck.push('rubble');
    out.push(`${e.junk} Junk added to your deck 🗑️`);
  }
  for (let i = 0; i < (e.remove ?? 0) && run.deck.length > MIN_DECK; i++) {
    const at = Math.floor(rand(run) * run.deck.length);
    out.push(`Lost ${card(run.deck[at]).name}`);
    run.deck.splice(at, 1);
  }
  for (let i = 0; i < (e.upgrade ?? 0); i++) {
    const options = run.deck.map((id, at) => ({ id, at })).filter((x) => canUpgrade(x.id));
    if (!options.length) break;
    const pick = pickOne(run, options);
    run.deck[pick.at] = upgradeId(pick.id);
    out.push(`Upgraded ${card(pick.id).name}`);
  }
  for (let i = 0; i < (e.enchant ?? 0); i++) {
    const options = run.deck.map((id, at) => ({ id, at })).filter((x) => canEnchant(x.id));
    if (!options.length) break;
    const pick = pickOne(run, options);
    run.deck[pick.at] = enchantId(pick.id, pickOne(run, ENCHANTS));
    out.push(`${card(run.deck[pick.at]).name}!`);
  }
  if (e.relic) {
    const [id] = randomRelics(run, 1, run.relics);
    if (id) {
      run.relics.push(id);
      out.push(`Found ${RELIC_MAP[id].icon} ${RELIC_MAP[id].name}`);
    }
  }
  if (e.crew) {
    const [id] = randomFrom(run, CREW, 1, run.crew);
    if (id) {
      run.crew.push(id);
      out.push(`${RELIC_MAP[id].icon} ${RELIC_MAP[id].name} joins the crew`);
    }
  }
  if (e.chance) applyEffect(run, rand(run) < e.chance.p ? e.chance.win : e.chance.lose, out);
}

export function canChoose(run: RunState, choice: number): boolean {
  const ev = EVENT_DEF[currentNode(run)?.event ?? ''];
  const c = ev?.choices[choice];
  return !!c && run.gold >= (c.needGold ?? 0);
}

/** Resolve an event choice. A "fight" choice turns this stop into a battle. */
export function resolveEvent(prev: RunState, choice: number): RunState {
  if (!canChoose(prev, choice)) throw new Error('Not allowed');
  const run = structuredClone(prev);
  const node = currentNode(run)!;
  const effect = EVENT_DEF[node.event!].choices[choice].effect;
  const out: string[] = [];
  const { fight, gold, ...rest } = effect;
  if (fight) {
    // Gold from an escort or duel is paid when the battle is won.
    node.type = fight;
    node.enemy = enemyFor(run, fight, run.act, run.floor, run.siege);
    run.floorsCleared--; // counted again when the battle is won
    run.status = 'battle';
    run.bonusGold = gold;
    applyEffect(run, rest, out);
    return run;
  }
  applyEffect(run, effect, out);
  run.eventResult = out.length ? out.join(' · ') : 'Nothing happens. The clouds drift on.';
  run.status = run.lives <= 0 ? 'lost' : 'map';
  return run;
}

/** Total floors in a full campaign. */
export const TOTAL_FLOORS = ACTS * FLOORS_PER_ACT;

/** Set up a Daily Voyage: today's modifiers change the starting position. */
export function applyDailyMods(prev: RunState, mods: string[]): RunState {
  const run = structuredClone(prev);
  run.dailyMods = mods;
  for (const m of mods) {
    if (m === 'rich') run.gold += 150;
    if (m === 'glass') run.lives = run.maxLives = 1;
    if (m === 'legend') run.deck.push(pickOne(run, LEGENDARY_CARDS));
    if (m === 'crewed') run.crew.push(...randomFrom(run, CREW, 2, run.crew));
    if (m === 'junk') run.deck.push('rubble', 'rubble', 'rubble');
    if (m === 'veteran') {
      for (let i = 0; i < 4; i++) {
        const options = run.deck.map((id, at) => ({ id, at })).filter((x) => canUpgrade(x.id));
        const pick = pickOne(run, options);
        if (pick) run.deck[pick.at] = upgradeId(pick.id);
      }
    }
  }
  return run;
}
