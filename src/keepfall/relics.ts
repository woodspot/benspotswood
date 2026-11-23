import type { Mods } from './factions';
import type { StartBonus } from './types';

/** Campaign treasures: permanent perks for the rest of a run. Enemies can carry them too. */
export interface RelicDef extends Mods {
  id: string;
  name: string;
  icon: string;
  text: string;
  start?: StartBonus;
}

export const RELICS: RelicDef[] = [
  { id: 'gate', name: 'Iron Gate', icon: '🚪', text: 'Start each battle with +8 Wall.', start: { wall: 8 } },
  { id: 'foundation', name: 'Deep Foundation', icon: '🏰', text: 'Start each battle with +5 Tower.', start: { tower: 5 } },
  { id: 'banner', name: 'War Banner', icon: '🚩', text: 'All damage +1.', damageBonus: 1 },
  { id: 'font', name: 'Mana Font', icon: '💧', text: 'Start each battle with +1 Sanctum.', start: { gen: { mana: 1 } } },
  { id: 'forge', name: 'Ever-Forge', icon: '⚒️', text: 'Start each battle with +1 Barracks.', start: { gen: { steel: 1 } } },
  { id: 'charter', name: "Mason's Charter", icon: '📜', text: 'Build cards cost 1 less.', costDelta: { stone: -1 } },
  { id: 'coin', name: 'Lucky Coin', icon: '🪙', text: 'Start each battle with +4 of every resource.', start: { res: { stone: 4, mana: 4, steel: 4 } } },
  { id: 'runestone', name: 'Runestone', icon: '🔷', text: 'Spells that hit the enemy Tower deal +1.', spellBonus: 1 },
  { id: 'plans', name: "Architect's Plans", icon: '📐', text: "Start each battle with a Masons' Lodge built.", start: { buildings: ['lodge'] } },
  { id: 'granary', name: 'Granary', icon: '🌾', text: 'Every generator produces 1 extra.', prodDelta: 1 },
];

export const RELIC_MAP: Record<string, RelicDef> = Object.fromEntries(RELICS.map((r) => [r.id, r]));
