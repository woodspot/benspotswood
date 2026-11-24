// The Shipyard: where Renown is spent. Upgrades (switchable), captains, new content and cosmetics.
import { CAPTAINS } from './captains';

export type Slot = 'yard' | 'captain' | 'content' | 'paint' | 'flag' | 'sky' | 'cardback';
export const COSMETIC_SLOTS: Slot[] = ['paint', 'flag', 'sky', 'cardback'];

export interface ShopItem {
  id: string;
  slot: Slot;
  name: string;
  icon: string;
  cost: number;
  text: string;
  requires?: string; // an earlier tier you must own first
  group?: string; // upgrade tiers in the same group: only the best owned one counts
  css?: string; // cosmetic value used by the stylesheet
}

const yard = (id: string, name: string, icon: string, cost: number, text: string, group?: string, requires?: string): ShopItem => ({
  id, slot: 'yard', name, icon, cost, text, group, requires,
});

export const SHOP: ShopItem[] = [
  // ── Upgrades: small permanent boosts for campaigns (each can be switched off) ──
  yard('yard-hull-1', 'Reinforced Envelope', '🎈', 60, '+2 Altitude in every campaign battle', 'hull'),
  yard('yard-hull-2', 'Reinforced Envelope II', '🎈', 120, '+4 Altitude in every campaign battle', 'hull', 'yard-hull-1'),
  yard('yard-hull-3', 'Reinforced Envelope III', '🎈', 200, '+6 Altitude in every campaign battle', 'hull', 'yard-hull-2'),
  yard('yard-plate-1', 'Extra Plating', '🛡️', 60, '+3 Armor in every campaign battle', 'plate'),
  yard('yard-plate-2', 'Extra Plating II', '🛡️', 120, '+6 Armor in every campaign battle', 'plate', 'yard-plate-1'),
  yard('yard-plate-3', 'Extra Plating III', '🛡️', 200, '+9 Armor in every campaign battle', 'plate', 'yard-plate-2'),
  yard('yard-stores-1', 'Bigger Hold', '📦', 80, '+2 of every resource in every campaign battle', 'stores'),
  yard('yard-stores-2', 'Bigger Hold II', '📦', 160, '+4 of every resource in every campaign battle', 'stores', 'yard-stores-1'),
  yard('yard-gold-1', 'Ship’s Purse', '👛', 50, 'Start each campaign with 25 gold', 'gold'),
  yard('yard-gold-2', 'Ship’s Purse II', '👛', 100, 'Start each campaign with 50 gold', 'gold', 'yard-gold-1'),
  yard('yard-lookout', 'Crow’s Nest', '🔭', 150, '3 rerolls per campaign for card rewards'),
  yard('yard-dock', 'Refit Crew', '🧰', 220, 'Docks let you do two things instead of one'),
  yard('yard-banner', 'Spare Banner', '🚩', 300, 'One extra banner in every campaign'),

  // ── Captains (Navigator Wren is free) ──
  ...CAPTAINS.filter((c) => c.cost > 0).map((c): ShopItem => ({ id: `captain-${c.id}`, slot: 'captain', name: c.name, icon: c.icon, cost: c.cost, text: c.blurb })),

  // ── New content ──
  { id: 'faction-stormcallers', slot: 'content', name: 'Stormcallers faction', icon: '⚡', cost: 250, text: 'A 5th faction: weather-witches wrapped in lightning.' },
  { id: 'pack-lightning', slot: 'content', name: 'Lightning cards', icon: '⚡', cost: 120, text: 'Chain Lightning, Thunderclap, Ball Lightning, Lightning Rod and more join the card pool.' },
  { id: 'pack-clockwork', slot: 'content', name: 'Clockwork cards', icon: '⚙️', cost: 120, text: 'Gearwork, Automaton Crew, Clockwork Bomb, Steam Winch and more join the card pool.' },
  { id: 'pack-weather', slot: 'content', name: 'Weather cards', icon: '🌦️', cost: 120, text: 'Cards that change the weather: Tailwind, Squall, Fog Bank, Eye of the Storm and more.' },
  { id: 'pack-relics', slot: 'content', name: 'Inventor’s relics', icon: '🧭', cost: 150, text: 'Six new relics: Lightning in a Jar, Clockwork Heart, Brass Sextant and more.' },

  // ── Cosmetics ──
  { id: 'paint-classic', slot: 'paint', name: 'Classic Green', icon: '🟢', cost: 0, text: 'The original.', css: '#4fae7c' },
  { id: 'paint-crimson', slot: 'paint', name: 'Crimson', icon: '🔴', cost: 30, text: 'Bold and fearless.', css: '#d64545' },
  { id: 'paint-royal', slot: 'paint', name: 'Royal Purple', icon: '🟣', cost: 30, text: 'Fit for an admiral.', css: '#7a5cf0' },
  { id: 'paint-gold', slot: 'paint', name: 'Gilded', icon: '🟡', cost: 60, text: 'Shines in the sun.', css: '#e0b13a' },
  { id: 'paint-midnight', slot: 'paint', name: 'Midnight', icon: '🔵', cost: 40, text: 'For night raids.', css: '#2f4a80' },
  { id: 'paint-candy', slot: 'paint', name: 'Candy Stripe', icon: '🍬', cost: 50, text: 'Pink with white stripes.', css: '#f37bb4|stripes' },
  { id: 'paint-polka', slot: 'paint', name: 'Polka Dot', icon: '🔶', cost: 50, text: 'Orange with spots.', css: '#f68b28|dots' },
  { id: 'paint-emerald', slot: 'paint', name: 'Emerald Stripes', icon: '💚', cost: 50, text: 'Deep green with stripes.', css: '#1f9e70|stripes' },
  { id: 'flag-classic', slot: 'flag', name: 'Ship Colors', icon: '🚩', cost: 0, text: 'Matches the envelope.', css: 'currentColor' },
  { id: 'flag-jolly', slot: 'flag', name: 'Jolly Roger', icon: '🏴', cost: 25, text: 'Black as a pirate’s heart.', css: '#1b1b1f' },
  { id: 'flag-gold', slot: 'flag', name: 'Golden Pennant', icon: '🟨', cost: 25, text: 'For champions.', css: '#ffd34d' },
  { id: 'flag-white', slot: 'flag', name: 'White Ensign', icon: '🏳️', cost: 20, text: 'Crisp and clean.', css: '#f4f4f4' },
  { id: 'flag-rainbow', slot: 'flag', name: 'Rainbow Streamer', icon: '🌈', cost: 45, text: 'Cycles through every color.', css: 'rainbow' },
  { id: 'sky-dusk', slot: 'sky', name: 'Dusk', icon: '🌆', cost: 0, text: 'The original evening sky.' },
  { id: 'sky-sunset', slot: 'sky', name: 'Golden Sunset', icon: '🌅', cost: 40, text: 'Warm orange skies.' },
  { id: 'sky-night', slot: 'sky', name: 'Starry Night', icon: '🌌', cost: 50, text: 'Battle under the stars.' },
  { id: 'sky-storm', slot: 'sky', name: 'Thunderhead', icon: '🌩️', cost: 60, text: 'Dark clouds and lightning flashes.' },
  { id: 'sky-aurora', slot: 'sky', name: 'Aurora', icon: '🌠', cost: 80, text: 'Shimmering northern lights.' },
  { id: 'back-classic', slot: 'cardback', name: 'Classic', icon: '🂠', cost: 0, text: 'Purple diagonal stripes.' },
  { id: 'back-stars', slot: 'cardback', name: 'Starfield', icon: '✨', cost: 25, text: 'Gold stars on navy.' },
  { id: 'back-waves', slot: 'cardback', name: 'Cloud Waves', icon: '🌊', cost: 25, text: 'Rolling cloud waves.' },
  { id: 'back-gears', slot: 'cardback', name: 'Clockwork', icon: '⚙️', cost: 35, text: 'Brass gears.' },
  { id: 'back-gold', slot: 'cardback', name: 'Gold Leaf', icon: '🌟', cost: 50, text: 'Showing off.' },
];

export const SHOP_MAP: Record<string, ShopItem> = Object.fromEntries(SHOP.map((i) => [i.id, i]));

/** Items you have without buying. */
export const FREE_ITEMS = SHOP.filter((i) => i.cost === 0).map((i) => i.id);
