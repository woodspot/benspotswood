// Progress that carries over between campaigns: Renown (lifetime and spendable), unlocks,
// Storm levels, the Shipyard, captains, feats, the Daily Voyage and the Captain's Log.
import { ACTS, BOSSES, FLOORS_PER_ACT, MAX_SIEGE, TOTAL_FLOORS, type RunOptions, type RunState } from './campaign';
import { CAPTAIN_MAP, levelFor } from './captains';
import { CARD_PACKS, HEX_CARDS, card } from './cards';
import type { FactionId } from './factions';
import { FACTIONS } from './factions';
import { RELIC_PACK, UNLOCKABLE_RELICS } from './relics';
import { COSMETIC_SLOTS, FREE_ITEMS, SHOP, SHOP_MAP, type Slot } from './shipyard';

export interface LogEntry {
  date: string; // YYYY-MM-DD
  faction: FactionId;
  captain?: string;
  siege: number;
  daily?: boolean;
  result: 'won' | 'lost';
  act: number;
  floors: number;
  deck: string[];
  relics: string[];
  renown: number;
}

export interface Meta {
  version: 2;
  renown: number; // lifetime: drives the unlock milestones and Storm levels
  spent: number; // spent in the Shipyard (spendable = renown − spent)
  siegeUnlocked: number; // highest Storm level you may pick
  runs: number;
  wins: number;
  bestFloor: number; // most floors cleared in one campaign
  owned: string[]; // Shipyard items bought
  disabled: string[]; // upgrades switched off
  equipped: Partial<Record<Slot, string>>; // cosmetics in use
  captain: string; // chosen captain id
  captainXP: Record<string, number>;
  feats: string[];
  title?: string; // a feat shown as your title
  log: LogEntry[]; // newest first, last 30 campaigns
  daily?: { date: string; done: boolean; renown?: number };
}

export const newMeta = (): Meta => ({
  version: 2, renown: 0, spent: 0, siegeUnlocked: 0, runs: 0, wins: 0, bestFloor: 0,
  owned: [], disabled: [], equipped: {}, captain: 'navigator', captainXP: {}, feats: [], log: [],
});

/** Load any saved shape (including the first version) into the current one. */
export function migrateMeta(raw: unknown): Meta {
  const m = (raw ?? {}) as Partial<Meta> & { version?: number };
  return { ...newMeta(), ...m, version: 2, owned: m.owned ?? [], disabled: m.disabled ?? [], equipped: m.equipped ?? {}, captainXP: m.captainXP ?? {}, feats: m.feats ?? [], log: m.log ?? [] };
}

export const spendable = (m: Meta) => m.renown - m.spent;
export const owns = (m: Meta, id: string) => FREE_ITEMS.includes(id) || m.owned.includes(id) || (id === 'captain-navigator');

// ── Milestone unlocks (from lifetime Renown) ───────────────────

export type UnlockId = 'shadowmarch' | 'hex' | 'relics' | 'startRelic' | 'startCard';

export interface UnlockDef {
  id: UnlockId;
  at: number;
  icon: string;
  name: string;
  text: string;
}

export const UNLOCKS: UnlockDef[] = [
  { id: 'shadowmarch', at: 25, icon: '🗡️', name: 'Smugglers', text: 'A new faction of thieves and hexers.' },
  { id: 'hex', at: 60, icon: '🔥', name: 'Hex cards', text: 'Burns and junk join the card pool: Hexfire, Corroding Fog, Fire Shot, Junk Barge, Raiders.' },
  { id: 'relics', at: 100, icon: '💍', name: 'Rare relics', text: "Five new relics can be found: Aegis Charm, Ember Heart, Thief's Glove, Hex Doll, Old War Map." },
  { id: 'startRelic', at: 150, icon: '🎒', name: 'Supplies', text: 'Begin each campaign by choosing 1 of 3 relics.' },
  { id: 'startCard', at: 220, icon: '📜', name: 'Veteran', text: 'Begin each campaign with a free pick of 3 strong cards.' },
];

export const isUnlocked = (m: Meta, id: UnlockId) => m.renown >= UNLOCKS.find((u) => u.id === id)!.at;

export function nextUnlock(m: Meta): UnlockDef | undefined {
  return UNLOCKS.find((u) => m.renown < u.at);
}

/** Content still locked for this player. */
export function lockedContent(m: Meta): { cards: string[]; relics: string[]; factions: FactionId[] } {
  const cards = isUnlocked(m, 'hex') ? [] : [...HEX_CARDS];
  for (const [pack, ids] of Object.entries(CARD_PACKS)) if (!owns(m, `pack-${pack}`)) cards.push(...ids);
  const relics = isUnlocked(m, 'relics') ? [] : [...UNLOCKABLE_RELICS];
  if (!owns(m, 'pack-relics')) relics.push(...RELIC_PACK);
  const factions: FactionId[] = [];
  if (!isUnlocked(m, 'shadowmarch')) factions.push('shadowmarch');
  if (!owns(m, 'faction-stormcallers')) factions.push('stormcallers');
  return { cards, relics, factions };
}

// ── The Shipyard ───────────────────────────────────────────────

export function canBuy(m: Meta, id: string): boolean {
  const item = SHOP_MAP[id];
  if (!item || owns(m, id)) return false;
  if (item.requires && !owns(m, item.requires)) return false;
  return spendable(m) >= item.cost;
}

export function buy(prev: Meta, id: string): Meta {
  if (!canBuy(prev, id)) throw new Error('Cannot buy that');
  const m = structuredClone(prev);
  m.owned.push(id);
  m.spent += SHOP_MAP[id].cost;
  const item = SHOP_MAP[id];
  if (COSMETIC_SLOTS.includes(item.slot)) m.equipped[item.slot] = id; // wear it straight away
  if (item.slot === 'captain') m.captain = id.slice('captain-'.length);
  return m;
}

export function toggleUpgrade(prev: Meta, id: string): Meta {
  const m = structuredClone(prev);
  m.disabled = m.disabled.includes(id) ? m.disabled.filter((x) => x !== id) : [...m.disabled, id];
  return m;
}

export const isOn = (m: Meta, id: string) => owns(m, id) && !m.disabled.includes(id);

/** The best owned, switched-on tier in an upgrade group. */
function bestTier(m: Meta, group: string): string | undefined {
  return SHOP.filter((i) => i.group === group && isOn(m, i.id)).pop()?.id;
}

export const captainLevel = (m: Meta, id: string) => levelFor(m.captainXP[id] ?? 0);

/** Campaign options from the Shipyard and the chosen captain. */
export function runOptionsFromMeta(m: Meta): RunOptions {
  const yard = (['hull', 'plate', 'stores'] as const).map((g) => bestTier(m, g)).filter(Boolean) as string[];
  const goldTier = bestTier(m, 'gold');
  const captain = CAPTAIN_MAP[m.captain] && owns(m, `captain-${m.captain}`) ? m.captain : 'navigator';
  return {
    yard,
    gold: goldTier === 'yard-gold-2' ? 50 : goldTier === 'yard-gold-1' ? 25 : 0,
    extraLives: isOn(m, 'yard-banner') ? 1 : 0,
    dockActions: isOn(m, 'yard-dock') ? 2 : 1,
    rerolls: isOn(m, 'yard-lookout') ? 3 : 0,
    captain: { id: captain, level: captainLevel(m, captain) },
    startRelic: isUnlocked(m, 'startRelic'),
    startCard: isUnlocked(m, 'startCard'),
  };
}

// ── Feats ──────────────────────────────────────────────────────

export interface FeatDef {
  id: string;
  name: string; // also the title it grants
  icon: string;
  text: string;
  renown: number;
  check: (run: RunState, meta: Meta) => boolean;
}

const won = (r: RunState) => r.status === 'won';

export const FEATS: FeatDef[] = [
  { id: 'first-win', name: 'Maiden Voyage', icon: '⛵', text: 'Win a campaign battle', renown: 20, check: (r) => r.battles.won > 0 },
  { id: 'leviathan', name: 'Leviathan Slayer', icon: '🐋', text: 'Defeat the Iron Leviathan', renown: 30, check: (r) => r.bosses >= 1 },
  { id: 'thunder', name: 'Storm Breaker', icon: '🌩️', text: 'Defeat the Thunder Queen', renown: 40, check: (r) => r.bosses >= 2 },
  { id: 'king', name: 'Kingmaker', icon: '👑', text: 'Win a whole campaign', renown: 60, check: won },
  { id: 'harbor', name: 'High Flyer', icon: '🎈', text: 'Win a battle by reaching the high harbor', renown: 25, check: (r) => !!r.winKinds?.includes('tower') },
  { id: 'sink', name: 'Sky Pirate', icon: '🏴‍☠️', text: 'Win a battle by bringing the enemy down', renown: 15, check: (r) => !!r.winKinds?.includes('destroy') },
  { id: 'hoard', name: 'Dragon’s Hoard', icon: '💰', text: 'Win a battle by stockpiling a resource', renown: 40, check: (r) => !!r.winKinds?.includes('hoard') },
  { id: 'fast', name: 'Lightning Raid', icon: '⚡', text: 'Beat a boss in 14 turns or fewer', renown: 50, check: (r) => (r.fastestBoss ?? 99) <= 14 },
  { id: 'thin', name: 'Lean and Mean', icon: '🍃', text: 'Win a campaign with 16 cards or fewer', renown: 75, check: (r) => won(r) && r.deck.length <= 16 },
  { id: 'noiron', name: 'Paper Ship', icon: '📄', text: 'Win a campaign with no Iron cards in your deck', renown: 100, check: (r) => won(r) && !r.deck.some((id) => card(id).type === 'stone' && !card(id).curse) },
  { id: 'spender', name: 'Tycoon', icon: '💸', text: 'Spend 400 gold in one campaign', renown: 40, check: (r) => r.goldSpent >= 400 },
  { id: 'collector', name: 'Collector', icon: '💎', text: 'Finish a campaign with 6 or more relics', renown: 40, check: (r) => r.relics.length >= 6 },
  { id: 'crew', name: 'Full Crew', icon: '👥', text: 'Have 3 crew members at once', renown: 30, check: (r) => r.crew.length >= 3 },
  { id: 'storm5', name: 'Storm Chaser', icon: '⛈️', text: 'Win a campaign at Storm 5 or higher', renown: 100, check: (r) => won(r) && r.siege >= 5 },
  { id: 'storm10', name: 'Eye of the Storm', icon: '🌀', text: 'Win a campaign at Storm 10', renown: 250, check: (r) => won(r) && r.siege >= 10 },
  { id: 'daily', name: 'Daily Captain', icon: '📅', text: 'Win a Daily Voyage', renown: 50, check: (r) => won(r) && !!r.daily },
  { id: 'veteran', name: 'Veteran Captain', icon: '🎖️', text: 'Raise a captain to level 5', renown: 80, check: (_r, m) => Object.values(m.captainXP).some((xp) => levelFor(xp) >= 5) },
  { id: 'fashion', name: 'Fashionista', icon: '🎨', text: 'Own 6 cosmetics', renown: 25, check: (_r, m) => m.owned.filter((id) => COSMETIC_SLOTS.includes(SHOP_MAP[id]?.slot)).length >= 6 },
];

export const FEAT_MAP: Record<string, FeatDef> = Object.fromEntries(FEATS.map((f) => [f.id, f]));

// ── Renown for a finished campaign ─────────────────────────────

export interface RenownLine {
  label: string;
  amount: number;
}

export function renownFor(run: RunState): { lines: RenownLine[]; total: number } {
  const lines: RenownLine[] = [
    { label: `Floors cleared (${run.floorsCleared})`, amount: run.floorsCleared * 3 },
    { label: `Battles won (${run.battles.won})`, amount: run.battles.won * 4 },
  ];
  if (run.elites) lines.push({ label: `Elites beaten (${run.elites})`, amount: run.elites * 8 });
  if (run.bosses) lines.push({ label: `Bosses defeated (${run.bosses})`, amount: run.bosses * 25 });
  if (run.status === 'won') lines.push({ label: `${BOSSES[ACTS - 1].name} falls: campaign won`, amount: 40 });
  const base = lines.reduce((t, l) => t + l.amount, 0);
  const siege = run.siege ?? 0;
  if (siege > 0) lines.push({ label: `Storm ${siege} bonus (+${siege * 20}%)`, amount: Math.round(base * siege * 0.2) });
  if (run.daily) {
    const mult = dailyMultiplier(run.dailyMods ?? []);
    lines.push({ label: `Daily Voyage bonus (×${mult})`, amount: Math.round(base * (mult - 1)) });
    if (run.status === 'won') lines.push({ label: 'Daily Voyage completed', amount: 50 });
  }
  return { lines, total: lines.reduce((t, l) => t + l.amount, 0) };
}

export interface RunResult {
  meta: Meta;
  gained: number;
  lines: RenownLine[];
  unlocked: UnlockDef[];
  newSiege: number | null; // Storm level unlocked by this win
  feats: FeatDef[]; // earned on this campaign (their Renown is included in `gained`)
  levelUp?: { captain: string; from: number; to: number };
}

export function applyRun(prev: Meta, run: RunState): RunResult {
  const meta = structuredClone(prev);
  const { lines, total } = renownFor(run);
  meta.renown += total;
  meta.runs++;
  meta.bestFloor = Math.max(meta.bestFloor, run.floorsCleared);
  let newSiege: number | null = null;
  if (run.status === 'won') {
    meta.wins++;
    if (run.siege >= meta.siegeUnlocked && run.siege < MAX_SIEGE && !run.daily) newSiege = meta.siegeUnlocked = run.siege + 1;
  }
  // Captain experience: every win counts, elites and bosses count more.
  let levelUp: RunResult['levelUp'];
  if (run.captain) {
    const id = run.captain.id;
    const before = levelFor(meta.captainXP[id] ?? 0);
    meta.captainXP[id] = (meta.captainXP[id] ?? 0) + run.battles.won + run.elites + run.bosses * 3;
    const after = levelFor(meta.captainXP[id]);
    if (after > before) levelUp = { captain: id, from: before, to: after };
  }
  if (run.daily && meta.daily?.date === run.daily) meta.daily = { ...meta.daily, done: true, renown: total };
  // Feats (checked after the experience update, so level-based feats can trigger).
  const feats = FEATS.filter((f) => !meta.feats.includes(f.id) && f.check(run, meta));
  for (const f of feats) {
    meta.feats.push(f.id);
    meta.renown += f.renown;
  }
  const gained = total + feats.reduce((t, f) => t + f.renown, 0);
  meta.log = [
    {
      date: today(),
      faction: run.faction,
      captain: run.captain?.id,
      siege: run.siege,
      daily: !!run.daily,
      result: run.status === 'won' ? 'won' : 'lost',
      act: run.act,
      floors: run.floorsCleared,
      deck: run.deck,
      relics: [...run.relics, ...run.crew],
      renown: gained,
    } satisfies LogEntry,
    ...meta.log,
  ].slice(0, 30);
  const unlocked = UNLOCKS.filter((u) => prev.renown < u.at && meta.renown >= u.at);
  return { meta, gained, lines, unlocked, newSiege, feats, levelUp };
}

// ── Daily Voyage ───────────────────────────────────────────────

export interface DailyMod {
  id: string;
  icon: string;
  name: string;
  text: string;
  mult: number; // Renown multiplier
}

export const DAILY_MODS: DailyMod[] = [
  { id: 'rich', icon: '💎', name: 'Treasure Hunter', text: 'Start with 150 gold.', mult: 1 },
  { id: 'double-gold', icon: '💰', name: 'Gold Rush', text: 'Battles pay double gold.', mult: 1 },
  { id: 'glass', icon: '🥚', name: 'Glass Cannon', text: 'Only 1 banner, but Renown ×1.5.', mult: 1.5 },
  { id: 'legend', icon: '🌟', name: 'Legendary Start', text: 'Start with a random legendary card.', mult: 1 },
  { id: 'crewed', icon: '👥', name: 'Full Crew', text: 'Start with 2 random crew members.', mult: 1 },
  { id: 'veteran', icon: '⚒️', name: 'Veteran Deck', text: 'Start with 4 random cards upgraded.', mult: 1 },
  { id: 'junk', icon: '🗑️', name: 'Cluttered Hold', text: 'Start with 3 Junk, but Renown ×1.25.', mult: 1.25 },
  { id: 'storm', icon: '⛈️', name: 'Rough Weather', text: 'Storm 3 rules, Renown ×1.3.', mult: 1.3 },
];

export const today = () => new Date().toISOString().slice(0, 10);

function hash(s: string): number {
  let h = 2166136261;
  for (const ch of s) h = Math.imul(h ^ ch.codePointAt(0)!, 16777619);
  return h >>> 0;
}

/** Today's voyage: the same for everyone (seeded by the date). */
export function dailyFor(date: string): { seed: number; faction: FactionId; mods: DailyMod[] } {
  const h = hash(`sky-armada-${date}`);
  const faction = FACTIONS[h % FACTIONS.length].id;
  const first = DAILY_MODS[(h >>> 4) % DAILY_MODS.length];
  const rest = DAILY_MODS.filter((m) => m.id !== first.id);
  const second = rest[(h >>> 9) % rest.length];
  return { seed: h, faction, mods: [first, second] };
}

/** Renown multiplier for a set of daily modifiers (always at least ×1.5 for a Daily Voyage). */
export function dailyMultiplier(mods: string[]): number {
  const m = mods.reduce((t, id) => t * (DAILY_MODS.find((d) => d.id === id)?.mult ?? 1), 1.5);
  return Math.round(m * 100) / 100;
}

export const dailyAvailable = (m: Meta, date = today()) => m.daily?.date !== date;

/** Floors in a campaign (for the run summary). */
export { TOTAL_FLOORS, FLOORS_PER_ACT };
