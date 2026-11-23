import type { Resource, StartBonus } from './types';

/** Rule tweaks a faction or event applies. All fields optional; they stack. */
export interface Mods {
  costDelta?: Partial<Record<Resource, number>>; // added to card costs of that type
  damageBonus?: number; // added to every 'damage' op
  spellBonus?: number; // extra loss on ops that lower the enemy tower directly
  prodDelta?: number; // added to each generator's output (never below 1)
  stealBonus?: number; // extra taken by 'steal' ops
  burnBonus?: number; // extra Tower lost per Burn tick
}

export type FactionId = 'stonewardens' | 'arcanists' | 'warhost' | 'shadowmarch';

export interface FactionDef extends Mods {
  id: FactionId;
  name: string;
  icon: string;
  blurb: string;
  perks: string[];
  start: StartBonus;
}

export const FACTIONS: FactionDef[] = [
  {
    id: 'stonewardens',
    name: 'Stonewardens',
    icon: '🛡️',
    blurb: 'Mountain builders who outlast every siege.',
    perks: ['Start with +10 Wall', 'Build cards cost 1 less'],
    start: { wall: 10 },
    costDelta: { stone: -1 },
  },
  {
    id: 'arcanists',
    name: 'Arcanists',
    icon: '✨',
    blurb: 'Tower-mages who strike over the wall.',
    perks: ['Start with +1 Sanctum and +3 Tower', 'Spells that hit the enemy Tower deal +1'],
    start: { gen: { mana: 1 }, tower: 3 },
    spellBonus: 1,
  },
  {
    id: 'warhost',
    name: 'Warhost',
    icon: '🔥',
    blurb: 'Raiders who win before the walls go up.',
    perks: ['Start with +3 Steel', 'All damage +1'],
    start: { res: { steel: 3 } },
    damageBonus: 1,
  },
  {
    id: 'shadowmarch',
    name: 'Shadowmarch',
    icon: '🗡️',
    blurb: 'Thieves and hexers who rot a castle from within.',
    perks: ['Start with +4 Mana', 'Steal effects take 2 more', 'Burns deal +1', 'The enemy deck starts with 3 Rubble'],
    start: { curseFoe: 3, res: { mana: 4 } },
    stealBonus: 2,
    burnBonus: 1,
  },
];

export const FACTION_MAP = Object.fromEntries(FACTIONS.map((f) => [f.id, f])) as Record<FactionId, FactionDef>;

export interface EventDef extends Mods {
  id: string;
  name: string;
  icon: string;
  text: string;
}

/** Shared "weather" that changes every few turns and affects both players. */
export const EVENTS: EventDef[] = [
  { id: 'storm', name: 'Arcane Storm', icon: '⛈️', text: 'Magic cards cost 2 more.', costDelta: { mana: 2 } },
  { id: 'siege', name: 'Siege Season', icon: '🏹', text: 'All damage +2.', damageBonus: 2 },
  { id: 'harvest', name: 'Bountiful Harvest', icon: '🌾', text: 'Every generator produces 1 extra.', prodDelta: 1 },
  { id: 'festival', name: "Masons' Festival", icon: '🎉', text: 'Build cards cost 2 less.', costDelta: { stone: -2 } },
  { id: 'drought', name: 'Drought', icon: '☀️', text: 'Every generator produces 1 less.', prodDelta: -1 },
  { id: 'muster', name: 'Muster', icon: '🎺', text: 'War cards cost 2 less.', costDelta: { steel: -2 } },
  { id: 'eclipse', name: 'Eclipse', icon: '🌑', text: 'Spells that hit the enemy Tower deal +2.', spellBonus: 2 },
  { id: 'fog', name: 'Fog of War', icon: '🌫️', text: 'All damage −1.', damageBonus: -1 },
  { id: 'tithe', name: 'Royal Tithe', icon: '👑', text: 'Every card costs 1 less.', costDelta: { stone: -1, mana: -1, steel: -1 } },
  { id: 'winds', name: 'Dry Winds', icon: '🌬️', text: 'Burns deal +1.', burnBonus: 1 },
];

export const EVENT_MAP: Record<string, EventDef> = Object.fromEntries(EVENTS.map((e) => [e.id, e]));

/** Combine several mod sources into one. */
export function mergeMods(...list: (Mods | undefined)[]): Required<Mods> {
  const out: Required<Mods> = { costDelta: {}, damageBonus: 0, spellBonus: 0, prodDelta: 0, stealBonus: 0, burnBonus: 0 };
  for (const m of list) {
    if (!m) continue;
    out.damageBonus += m.damageBonus ?? 0;
    out.spellBonus += m.spellBonus ?? 0;
    out.prodDelta += m.prodDelta ?? 0;
    out.stealBonus += m.stealBonus ?? 0;
    out.burnBonus += m.burnBonus ?? 0;
    for (const [r, d] of Object.entries(m.costDelta ?? {}) as [Resource, number][]) {
      out.costDelta[r] = (out.costDelta[r] ?? 0) + d;
    }
  }
  return out;
}
