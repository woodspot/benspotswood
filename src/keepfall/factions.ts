import type { Resource } from './types';

/** Rule tweaks a faction or event applies. All fields optional; they stack. */
export interface Mods {
  costDelta?: Partial<Record<Resource, number>>; // added to card costs of that type
  damageBonus?: number; // added to every 'damage' op
  spellBonus?: number; // extra loss on ops that lower the enemy tower directly
  prodDelta?: number; // added to each generator's output (never below 1)
}

export type FactionId = 'stonewardens' | 'arcanists' | 'warhost';

export interface FactionDef extends Mods {
  id: FactionId;
  name: string;
  icon: string;
  blurb: string;
  perks: string[];
  start: { wall?: number; tower?: number; gen?: Partial<Record<Resource, number>> };
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
    perks: ['Start with +1 Barracks', 'All damage +1'],
    start: { gen: { steel: 1 } },
    damageBonus: 1,
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
];

export const EVENT_MAP: Record<string, EventDef> = Object.fromEntries(EVENTS.map((e) => [e.id, e]));

/** Combine several mod sources into one. */
export function mergeMods(...list: (Mods | undefined)[]): Required<Mods> {
  const out: Required<Mods> = { costDelta: {}, damageBonus: 0, spellBonus: 0, prodDelta: 0 };
  for (const m of list) {
    if (!m) continue;
    out.damageBonus += m.damageBonus ?? 0;
    out.spellBonus += m.spellBonus ?? 0;
    out.prodDelta += m.prodDelta ?? 0;
    for (const [r, d] of Object.entries(m.costDelta ?? {}) as [Resource, number][]) {
      out.costDelta[r] = (out.costDelta[r] ?? 0) + d;
    }
  }
  return out;
}
