import type { Mods } from './factions';
import type { StartBonus } from './types';

/** Campaign treasures: permanent perks for the rest of a run. Enemies can carry them too. */
export interface RelicDef extends Mods {
  id: string;
  name: string;
  icon: string;
  text: string;
  start?: StartBonus;
  hidden?: boolean; // campaign difficulty modifiers: never offered as rewards
}

export const RELICS: RelicDef[] = [
  { id: 'gate', name: 'Spare Plates', icon: '🔩', text: 'Start each battle with +8 Armor.', start: { wall: 8 } },
  { id: 'foundation', name: 'Spare Balloon', icon: '🎈', text: 'Start each battle with +5 Altitude.', start: { tower: 5 } },
  { id: 'banner', name: 'War Banner', icon: '🚩', text: 'All damage +1.', damageBonus: 1 },
  { id: 'font', name: 'Aether Font', icon: '💧', text: 'Start each battle with +1 Aether Well.', start: { gen: { mana: 1 } } },
  { id: 'forge', name: 'Ever-Forge', icon: '⚒️', text: 'Start each battle with +1 Powder Mill.', start: { gen: { steel: 1 } } },
  { id: 'charter', name: "Shipwright's Charter", icon: '📜', text: 'Iron cards cost 1 less.', costDelta: { stone: -1 } },
  { id: 'coin', name: 'Lucky Coin', icon: '🪙', text: 'Start each battle with +4 of every resource.', start: { res: { stone: 4, mana: 4, steel: 4 } } },
  { id: 'runestone', name: 'Runestone', icon: '🔷', text: 'Spells that hit enemy Altitude deal +1.', spellBonus: 1 },
  { id: 'plans', name: "Architect's Plans", icon: '📐', text: 'Start each battle with a Repair Crew aboard.', start: { buildings: ['lodge'] } },
  { id: 'granary', name: 'Trade Ledger', icon: '📒', text: 'Every generator produces 1 extra.', prodDelta: 1 },
  // Unlockable relics
  { id: 'aegis', name: 'Aegis Charm', icon: '💠', text: 'Start each battle with 8 Ward.', start: { ward: 8 } },
  { id: 'ember', name: 'Ember Heart', icon: '🕯️', text: 'Burns deal +1.', burnBonus: 1 },
  { id: 'glove', name: "Thief's Glove", icon: '🧤', text: 'Steal effects take 2 more.', stealBonus: 2 },
  { id: 'doll', name: 'Hex Doll', icon: '🪆', text: 'The enemy deck starts with 2 Junk.', start: { curseFoe: 2 } },
  { id: 'warmap', name: 'Old War Map', icon: '🗺️', text: 'Start each battle with a Mortar Deck aboard.', start: { buildings: ['catapult'] } },
  // Siege-level modifiers carried by campaign enemies
  { id: 'siege-walls', name: 'Armored Escort', icon: '🏗️', text: 'Storm: +6 Armor and +3 Altitude.', start: { wall: 6, tower: 3 }, hidden: true },
  { id: 'warden-might', name: 'Flagship Engines', icon: '⚙️', text: 'Storm: +10 Altitude.', start: { tower: 10 }, hidden: true },
];

export const UNLOCKABLE_RELICS = ['aegis', 'ember', 'glove', 'doll', 'warmap'];

let lockedRelics = new Set<string>();
export function setLockedRelics(ids: string[]): void {
  lockedRelics = new Set(ids);
}
/** Relics that can be found or carried right now. */
export function availableRelics(): RelicDef[] {
  return RELICS.filter((r) => !r.hidden && !lockedRelics.has(r.id));
}

export const RELIC_MAP: Record<string, RelicDef> = Object.fromEntries(RELICS.map((r) => [r.id, r]));
