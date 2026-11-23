// Progress that carries over between campaign runs: Renown, unlocks and Siege levels.
import { HEX_CARDS } from './cards';
import { FLOORS, MAX_SIEGE, type RunState } from './campaign';
import type { FactionId } from './factions';
import { UNLOCKABLE_RELICS } from './relics';

export interface Meta {
  version: 1;
  renown: number;
  siegeUnlocked: number; // highest Siege level you may pick
  runs: number;
  wins: number;
  bestFloor: number;
}

export const newMeta = (): Meta => ({ version: 1, renown: 0, siegeUnlocked: 0, runs: 0, wins: 0, bestFloor: 0 });

export type UnlockId = 'shadowmarch' | 'hex' | 'relics' | 'startRelic' | 'startCard';

export interface UnlockDef {
  id: UnlockId;
  at: number; // Renown needed
  icon: string;
  name: string;
  text: string;
}

export const UNLOCKS: UnlockDef[] = [
  { id: 'shadowmarch', at: 25, icon: '🗡️', name: 'Shadowmarch', text: 'A new faction of thieves and hexers.' },
  { id: 'hex', at: 60, icon: '🔥', name: 'Hex cards', text: 'Burns and curses join the card pool: Hexfire, Wasting Plague, Fire Arrows, Rubble Cart, Marauders.' },
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
  return {
    cards: isUnlocked(m, 'hex') ? [] : HEX_CARDS,
    relics: isUnlocked(m, 'relics') ? [] : UNLOCKABLE_RELICS,
    factions: isUnlocked(m, 'shadowmarch') ? [] : ['shadowmarch'],
  };
}

export interface RenownLine {
  label: string;
  amount: number;
}

/** Renown earned by a finished run, itemised. Higher Siege levels pay 20% more per level. */
export function renownFor(run: RunState): { lines: RenownLine[]; total: number } {
  const floors = Math.max(0, run.status === 'won' ? FLOORS : run.floor);
  const lines: RenownLine[] = [
    { label: `Floors cleared (${floors})`, amount: floors * 4 },
    { label: `Battles won (${run.battles.won})`, amount: run.battles.won * 4 },
  ];
  if (run.elites) lines.push({ label: `Elites beaten (${run.elites})`, amount: run.elites * 8 });
  if (run.status === 'won') lines.push({ label: 'The Iron Warden falls', amount: 30 });
  const base = lines.reduce((t, l) => t + l.amount, 0);
  const siege = run.siege ?? 0;
  if (siege > 0) lines.push({ label: `Siege ${siege} bonus (+${siege * 20}%)`, amount: Math.round(base * siege * 0.2) });
  return { lines, total: lines.reduce((t, l) => t + l.amount, 0) };
}

export interface RunResult {
  meta: Meta;
  gained: number;
  lines: RenownLine[];
  unlocked: UnlockDef[];
  newSiege: number | null; // Siege level unlocked by this win
}

export function applyRun(prev: Meta, run: RunState): RunResult {
  const meta = { ...prev };
  const { lines, total } = renownFor(run);
  meta.renown += total;
  meta.runs++;
  meta.bestFloor = Math.max(meta.bestFloor, run.status === 'won' ? FLOORS : run.floor + 1);
  let newSiege: number | null = null;
  if (run.status === 'won') {
    meta.wins++;
    const siege = run.siege ?? 0;
    if (siege >= meta.siegeUnlocked && siege < MAX_SIEGE) newSiege = meta.siegeUnlocked = siege + 1;
  }
  const unlocked = UNLOCKS.filter((u) => prev.renown < u.at && meta.renown >= u.at);
  return { meta, gained: total, lines, unlocked, newSiege };
}
