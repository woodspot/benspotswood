import type { Resource, StartBonus } from './types';

/** Rule tweaks a faction or event applies. All fields optional; they stack. */
export interface Mods {
  costDelta?: Partial<Record<Resource, number>>; // added to card costs of that type
  damageBonus?: number; // added to every 'damage' op
  spellBonus?: number; // extra loss on ops that lower the enemy tower directly
  prodDelta?: number; // added to each generator's output (never below 1)
  stealBonus?: number; // extra taken by 'steal' ops
  burnBonus?: number; // extra Altitude lost per Burn tick
  burnTurns?: number; // extra turns your Burns last
}

export type FactionId = 'stonewardens' | 'arcanists' | 'warhost' | 'shadowmarch' | 'stormcallers';

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
    name: 'Ironclads',
    icon: '🛡️',
    blurb: 'Armored dreadnoughts that outlast every barrage.',
    perks: ['Start with +12 Armor', 'Iron cards cost 1 less'],
    start: { wall: 12 },
    costDelta: { stone: -1 },
  },
  {
    id: 'arcanists',
    name: 'Aethermancers',
    icon: '✨',
    blurb: 'Sky-mages who strike straight past the armor.',
    perks: ['Start with +1 Aether Well and +1 Altitude', 'Spells that hit enemy Altitude deal +1'],
    start: { gen: { mana: 1 }, tower: 1 },
    spellBonus: 1,
  },
  {
    id: 'warhost',
    name: 'Corsairs',
    icon: '☠️',
    blurb: 'Gun-mad privateers who strike before the plating goes on.',
    perks: ['Start with +5 Powder', 'All damage +1'],
    start: { res: { steel: 5 } },
    damageBonus: 1,
  },
  {
    id: 'shadowmarch',
    name: 'Smugglers',
    icon: '🗡️',
    blurb: 'Thieves and hexers who rot a ship from within.',
    perks: ['Start with +4 Aether', 'Steal effects take 2 more', 'Burns deal +1', 'The enemy deck starts with 3 Junk'],
    start: { curseFoe: 3, res: { mana: 4 } },
    stealBonus: 2,
    burnBonus: 1,
  },
];

FACTIONS.push({
  id: 'stormcallers',
  name: 'Stormcallers',
  icon: '⚡',
  blurb: 'Weather-witches who wrap their ships in lightning.',
  perks: ['Start with 6 Ward', 'Your Burns last 1 turn longer'],
  start: { ward: 6 },
  burnTurns: 1,
});

export const FACTION_MAP = Object.fromEntries(FACTIONS.map((f) => [f.id, f])) as Record<FactionId, FactionDef>;

export interface EventDef extends Mods {
  id: string;
  name: string;
  icon: string;
  text: string;
}

/** Shared "weather" that changes every few turns and affects both players. */
export const EVENTS: EventDef[] = [
  { id: 'storm', name: 'Aether Storm', icon: '⛈️', text: 'Aether cards cost 2 more.', costDelta: { mana: 2 } },
  { id: 'siege', name: 'Clear Skies', icon: '🔭', text: 'All damage +2.', damageBonus: 2 },
  { id: 'harvest', name: 'Trade Winds', icon: '⛵', text: 'Every generator produces 1 extra.', prodDelta: 1 },
  { id: 'festival', name: 'Shipwright Fair', icon: '🎉', text: 'Iron cards cost 2 less.', costDelta: { stone: -2 } },
  { id: 'drought', name: 'Dead Calm', icon: '🎐', text: 'Every generator produces 1 less.', prodDelta: -1 },
  { id: 'muster', name: 'Arms Convoy', icon: '📦', text: 'Powder cards cost 2 less.', costDelta: { steel: -2 } },
  { id: 'eclipse', name: 'Eclipse', icon: '🌑', text: 'Spells that hit enemy Altitude deal +2.', spellBonus: 2 },
  { id: 'fog', name: 'Cloudbank', icon: '☁️', text: 'All damage −1.', damageBonus: -1 },
  { id: 'tithe', name: 'Admiralty Grant', icon: '👑', text: 'Every card costs 1 less.', costDelta: { stone: -1, mana: -1, steel: -1 } },
  { id: 'winds', name: 'Dry Winds', icon: '🌬️', text: 'Burns deal +1.', burnBonus: 1 },
];

export const EVENT_MAP: Record<string, EventDef> = Object.fromEntries(EVENTS.map((e) => [e.id, e]));

/** Combine several mod sources into one. */
export function mergeMods(...list: (Mods | undefined)[]): Required<Mods> {
  const out: Required<Mods> = { costDelta: {}, damageBonus: 0, spellBonus: 0, prodDelta: 0, stealBonus: 0, burnBonus: 0, burnTurns: 0 };
  for (const m of list) {
    if (!m) continue;
    out.damageBonus += m.damageBonus ?? 0;
    out.spellBonus += m.spellBonus ?? 0;
    out.prodDelta += m.prodDelta ?? 0;
    out.stealBonus += m.stealBonus ?? 0;
    out.burnBonus += m.burnBonus ?? 0;
    out.burnTurns += m.burnTurns ?? 0;
    for (const [r, d] of Object.entries(m.costDelta ?? {}) as [Resource, number][]) {
      out.costDelta[r] = (out.costDelta[r] ?? 0) + d;
    }
  }
  return out;
}
