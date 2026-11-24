import type { Mods } from './factions';
import type { Op, StartBonus } from './types';

/** Campaign treasures: permanent perks for the rest of a run. Enemies can carry them too. */
export interface RelicDef extends Mods {
  id: string;
  name: string;
  icon: string;
  text: string;
  start?: StartBonus;
  hidden?: boolean; // campaign difficulty modifiers: never offered as rewards
  turnOps?: Op[]; // acts at the start of each of the owner's turns, like a module
  crew?: boolean; // a crew member (found in events and markets), not a relic
  runPerk?: 'gold' | 'choice' | 'market'; // crew perks that work on the campaign map
}

export const RELICS: RelicDef[] = [
  { id: 'gate', name: 'Spare Plates', icon: '🔩', text: 'Start each battle with +8 Armor.', start: { wall: 8 } },
  { id: 'foundation', name: 'Spare Balloon', icon: '🎈', text: 'Start each battle with +5 Altitude.', start: { tower: 5 } },
  { id: 'banner', name: 'War Banner', icon: '🚩', text: 'All damage +1.', damageBonus: 1 },
  { id: 'font', name: 'Aether Font', icon: '💧', text: 'Start each battle with +1 Aether Well.', start: { gen: { mana: 1 } } },
  { id: 'forge', name: 'Ever-Forge', icon: '⚒️', text: 'Start each battle with +1 Powder Mill.', start: { gen: { steel: 1 } } },
  { id: 'charter', name: "Shipwright's Charter", icon: '📜', text: 'Iron cards cost 1 less.', costDelta: { stone: -1 } },
  { id: 'coin', name: 'Lucky Coin', icon: '🍀', text: 'Start each battle with +4 of every resource.', start: { res: { stone: 4, mana: 4, steel: 4 } } },
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

const turn = (...ops: Op[]) => ops;

RELICS.push(
  // Relic pack (bought in the Shipyard)
  { id: 'jar', name: 'Lightning in a Jar', icon: '🏺', text: 'Each turn: enemy Altitude −1.', turnOps: turn({ op: 'tower', amt: -1, target: 'enemy' }) },
  { id: 'clockheart', name: 'Clockwork Heart', icon: '⚙️', text: 'Each turn: +1 Armor.', turnOps: turn({ op: 'wall', amt: 1, target: 'self' }) },
  { id: 'sextant', name: 'Brass Sextant', icon: '🧭', text: 'Start each battle with +1 Foundry, Aether Well and Powder Mill.', start: { gen: { stone: 1, mana: 1, steel: 1 } } },
  { id: 'figurehead', name: 'Golden Figurehead', icon: '🦅', text: 'Start each battle with +8 Altitude.', start: { tower: 8 } },
  { id: 'cannonade', name: 'Powder Monkey', icon: '🐒', text: 'Powder cards cost 1 less.', costDelta: { steel: -1 } },
  { id: 'stormglass', name: 'Storm Glass', icon: '🔮', text: 'Burns deal +1 and last 1 turn longer.', burnBonus: 1, burnTurns: 1 },
  // Crew members
  { id: 'crew-gunner', name: 'Old Gunner', icon: '🎖️', text: 'Crew: all damage +1.', damageBonus: 1, crew: true },
  { id: 'crew-cook', name: 'Ship’s Cook', icon: '🍲', text: 'Crew: start each battle with +4 Altitude.', start: { tower: 4 }, crew: true },
  { id: 'crew-mechanic', name: 'Mechanic', icon: '🔧', text: 'Crew: each turn +1 Armor.', turnOps: turn({ op: 'wall', amt: 1, target: 'self' }), crew: true },
  { id: 'crew-lookout', name: 'Lookout', icon: '🔭', text: 'Crew: one more card to choose from after battles.', crew: true, runPerk: 'choice' },
  { id: 'crew-purser', name: 'Purser', icon: '💰', text: 'Crew: earn 30% more gold.', crew: true, runPerk: 'gold' },
  { id: 'crew-alchemist', name: 'Alchemist', icon: '⚗️', text: 'Crew: start each battle with +5 Aether.', start: { res: { mana: 5 } }, crew: true },
  { id: 'crew-stowaway', name: 'Stowaway', icon: '🐀', text: 'Crew: steal effects take 1 more.', stealBonus: 1, crew: true },
  { id: 'crew-haggler', name: 'Haggler', icon: '🤝', text: 'Crew: market prices 25% lower.', crew: true, runPerk: 'market' },
  // Elite traits
  { id: 'trait-ironclad', name: 'Ironclad', icon: '🛡️', text: 'Starts with 8 Ward and +5 Armor.', start: { ward: 8, wall: 5 }, hidden: true },
  { id: 'trait-gunship', name: 'Gunship', icon: '💥', text: 'All damage +1.', damageBonus: 1, hidden: true },
  { id: 'trait-leech', name: 'Aether Leech', icon: '🦇', text: 'Each turn: steals 2 Aether.', turnOps: turn({ op: 'steal', res: 'mana', amt: 2 }), hidden: true },
  { id: 'trait-regen', name: 'Self-Repairing', icon: '💗', text: 'Each turn: +1 Altitude.', turnOps: turn({ op: 'tower', amt: 1, target: 'self' }), hidden: true },
  { id: 'trait-hexer', name: 'Hexer', icon: '🧿', text: 'Your deck starts with 3 Junk.', start: { curseFoe: 3 }, hidden: true },
  { id: 'trait-swift', name: 'Fast Engines', icon: '💨', text: 'Starts with +1 Powder Mill and +6 Powder.', start: { gen: { steel: 1 }, res: { steel: 6 } }, hidden: true },
  // Bosses
  { id: 'boss-leviathan', name: 'Leviathan Plating', icon: '🐋', text: 'Starts with +15 Armor. Each turn: +3 Armor.', start: { wall: 15 }, turnOps: turn({ op: 'wall', amt: 3, target: 'self' }), hidden: true },
  { id: 'boss-thunder', name: 'Thunder Crown', icon: '🌩️', text: 'Burns deal +2. Each turn: lightning strikes your Altitude (−1). The weather changes every 2 turns.', burnBonus: 2, turnOps: turn({ op: 'tower', amt: -1, target: 'enemy' }), hidden: true },
  { id: 'boss-smuggler', name: 'King’s Cutpurses', icon: '🗝️', text: 'Your deck starts with 4 Junk. Each turn: steals 1 of each resource.', start: { curseFoe: 4 }, turnOps: turn({ op: 'steal', res: 'stone', amt: 1 }, { op: 'steal', res: 'mana', amt: 1 }, { op: 'steal', res: 'steel', amt: 1 }), hidden: true },
  // Shipyard upgrades (bought with Renown; the best owned tier of each is carried into battles)
  { id: 'yard-hull-1', name: 'Reinforced Envelope', icon: '🎈', text: 'Shipyard: +2 Altitude.', start: { tower: 2 }, hidden: true },
  { id: 'yard-hull-2', name: 'Reinforced Envelope II', icon: '🎈', text: 'Shipyard: +4 Altitude.', start: { tower: 4 }, hidden: true },
  { id: 'yard-hull-3', name: 'Reinforced Envelope III', icon: '🎈', text: 'Shipyard: +6 Altitude.', start: { tower: 6 }, hidden: true },
  { id: 'yard-plate-1', name: 'Extra Plating', icon: '🛡️', text: 'Shipyard: +3 Armor.', start: { wall: 3 }, hidden: true },
  { id: 'yard-plate-2', name: 'Extra Plating II', icon: '🛡️', text: 'Shipyard: +6 Armor.', start: { wall: 6 }, hidden: true },
  { id: 'yard-plate-3', name: 'Extra Plating III', icon: '🛡️', text: 'Shipyard: +9 Armor.', start: { wall: 9 }, hidden: true },
  { id: 'yard-stores-1', name: 'Bigger Hold', icon: '📦', text: 'Shipyard: +2 of every resource.', start: { res: { stone: 2, mana: 2, steel: 2 } }, hidden: true },
  { id: 'yard-stores-2', name: 'Bigger Hold II', icon: '📦', text: 'Shipyard: +4 of every resource.', start: { res: { stone: 4, mana: 4, steel: 4 } }, hidden: true },
  // Storm levels
  { id: 'storm-ward', name: 'Storm Shields', icon: '🌀', text: 'Storm: starts with 5 Ward.', start: { ward: 5 }, hidden: true },
  { id: 'storm-boss', name: 'Storm Flagship', icon: '⛈️', text: 'Storm: +15 Altitude and +10 Armor.', start: { tower: 15, wall: 10 }, hidden: true },
);

export const UNLOCKABLE_RELICS = ['aegis', 'ember', 'glove', 'doll', 'warmap'];
export const RELIC_PACK = ['jar', 'clockheart', 'sextant', 'figurehead', 'cannonade', 'stormglass'];
export const CREW = RELICS.filter((r) => r.crew).map((r) => r.id);
export const ELITE_TRAITS = RELICS.filter((r) => r.id.startsWith('trait-')).map((r) => r.id);

let lockedRelics = new Set<string>();
export function setLockedRelics(ids: string[]): void {
  lockedRelics = new Set(ids);
}
/** Relics that can be found or carried right now. */
export function availableRelics(): RelicDef[] {
  return RELICS.filter((r) => !r.hidden && !r.crew && !lockedRelics.has(r.id));
}

export const RELIC_MAP: Record<string, RelicDef> = Object.fromEntries(RELICS.map((r) => [r.id, r]));
