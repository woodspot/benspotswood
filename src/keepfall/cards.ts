import type { CardDef, Op, Resource } from './types';

const dmg = (amt: number): Op => ({ op: 'damage', amt });
const tower = (amt: number, target: 'self' | 'enemy' = 'self'): Op => ({ op: 'tower', amt, target });
const wall = (amt: number, target: 'self' | 'enemy' = 'self'): Op => ({ op: 'wall', amt, target });
const res = (r: Resource, amt: number, target: 'self' | 'enemy' = 'self'): Op => ({ op: 'res', res: r, amt, target });
const gen = (r: Resource, amt: number, target: 'self' | 'enemy' = 'self'): Op => ({ op: 'gen', res: r, amt, target });
const steal = (r: Resource, amt: number): Op => ({ op: 'steal', res: r, amt });
const again: Op = { op: 'again' };

export const CARDS: CardDef[] = [
  // ── Stone: building ──────────────────────────────────────────
  { id: 'mortar', name: 'Mortar Mix', type: 'stone', cost: 1, copies: 3, ops: [wall(3)] },
  { id: 'cornerstone', name: 'Cornerstone', type: 'stone', cost: 2, copies: 2, ops: [tower(2), again], flavor: 'Lay it true, then keep going.' },
  { id: 'stonecutters', name: 'Stonecutters', type: 'stone', cost: 3, copies: 2, ops: [gen('stone', 1)] },
  { id: 'rampart', name: 'Rampart', type: 'stone', cost: 4, copies: 2, ops: [wall(6)] },
  { id: 'watchtower', name: 'Watchtower', type: 'stone', cost: 5, copies: 2, ops: [tower(5)] },
  { id: 'buttress', name: 'Buttress', type: 'stone', cost: 6, copies: 2, ops: [wall(4), tower(3)] },
  { id: 'tunnel', name: 'Collapse Tunnel', type: 'stone', cost: 7, copies: 1, ops: [wall(-9, 'enemy')] },
  { id: 'guild', name: "Masons' Guild", type: 'stone', cost: 8, copies: 1, ops: [gen('stone', 2)] },
  { id: 'landslide', name: 'Landslide', type: 'stone', cost: 10, copies: 1, ops: [gen('stone', -1, 'enemy'), wall(-6, 'enemy')] },
  { id: 'greatwall', name: 'Great Wall', type: 'stone', cost: 12, copies: 1, ops: [wall(15)] },
  { id: 'spire', name: 'Keep Spire', type: 'stone', cost: 15, copies: 1, ops: [tower(13)] },
  { id: 'bastion', name: 'Granite Bastion', type: 'stone', cost: 18, copies: 1, ops: [wall(12), tower(8)] },

  // ── Mana: magic ──────────────────────────────────────────────
  { id: 'rune', name: 'Quick Rune', type: 'mana', cost: 1, copies: 3, ops: [tower(1), again] },
  { id: 'spark', name: 'Spark', type: 'mana', cost: 2, copies: 2, ops: [tower(-3, 'enemy')], flavor: 'Walls mean nothing to lightning.' },
  { id: 'leyline', name: 'Ley Line', type: 'mana', cost: 3, copies: 2, ops: [gen('mana', 1)] },
  { id: 'mend', name: 'Mend', type: 'mana', cost: 3, copies: 2, ops: [tower(4)] },
  { id: 'siphon', name: 'Mana Siphon', type: 'mana', cost: 4, copies: 2, ops: [steal('mana', 5)] },
  { id: 'transmute', name: 'Transmute', type: 'mana', cost: 5, copies: 2, ops: [res('stone', 5), res('steel', 5)] },
  { id: 'bolt', name: 'Arcane Bolt', type: 'mana', cost: 6, copies: 2, ops: [tower(-6, 'enemy')] },
  { id: 'rust', name: 'Curse of Rust', type: 'mana', cost: 7, copies: 1, ops: [gen('steel', -1, 'enemy'), res('steel', -5, 'enemy')] },
  { id: 'conclave', name: 'Conclave', type: 'mana', cost: 8, copies: 1, ops: [gen('mana', 2)] },
  { id: 'quake', name: 'Earthquake Hex', type: 'mana', cost: 9, copies: 1, ops: [gen('stone', -1, 'enemy'), tower(-5, 'enemy')] },
  { id: 'storm', name: 'Lightning Storm', type: 'mana', cost: 13, copies: 1, ops: [tower(-11, 'enemy')] },
  { id: 'citadel', name: 'Sky Citadel', type: 'mana', cost: 16, copies: 1, ops: [tower(15)] },

  // ── Steel: war ───────────────────────────────────────────────
  { id: 'drums', name: 'War Drums', type: 'steel', cost: 1, copies: 3, ops: [dmg(2), again] },
  { id: 'skirmish', name: 'Skirmishers', type: 'steel', cost: 2, copies: 2, ops: [dmg(4)] },
  { id: 'recruiter', name: 'Recruiter', type: 'steel', cost: 3, copies: 2, ops: [gen('steel', 1)] },
  { id: 'archers', name: 'Archers', type: 'steel', cost: 4, copies: 2, ops: [dmg(6)] },
  { id: 'raiders', name: 'Raiders', type: 'steel', cost: 5, copies: 2, ops: [dmg(4), steal('stone', 4)] },
  { id: 'warband', name: 'Warband', type: 'steel', cost: 6, copies: 2, ops: [dmg(9)] },
  { id: 'ram', name: 'Battering Ram', type: 'steel', cost: 7, copies: 1, ops: [wall(-14, 'enemy')] },
  { id: 'mercs', name: 'Mercenary Camp', type: 'steel', cost: 8, copies: 1, ops: [gen('steel', 2)] },
  { id: 'saboteurs', name: 'Saboteurs', type: 'steel', cost: 8, copies: 1, ops: [gen('mana', -1, 'enemy'), dmg(5)] },
  { id: 'assassin', name: 'Assassin', type: 'steel', cost: 10, copies: 1, ops: [tower(-9, 'enemy')] },
  { id: 'siege', name: 'Siege Engine', type: 'steel', cost: 12, copies: 1, ops: [dmg(17)] },
  { id: 'dragon', name: 'Dragon Rider', type: 'steel', cost: 18, copies: 1, ops: [dmg(26)] },
];

export const CARD_MAP: Record<string, CardDef> = Object.fromEntries(CARDS.map((c) => [c.id, c]));

export function card(id: string): CardDef {
  const c = CARD_MAP[id];
  if (!c) throw new Error(`Unknown card: ${id}`);
  return c;
}

const RES_LABEL: Record<Resource, string> = { stone: 'Stone', mana: 'Mana', steel: 'Steel' };
const GEN_LABEL: Record<Resource, string> = { stone: 'Quarry', mana: 'Sanctum', steel: 'Barracks' };

const signed = (n: number) => (n > 0 ? `+${n}` : `${n}`);

/** Human-readable rules text, generated from the card's ops. */
export function describeOp(o: Op): string {
  switch (o.op) {
    case 'damage':
      return `${o.amt} damage`;
    case 'tower':
      return o.target === 'self' ? `${signed(o.amt)} Tower` : `Enemy Tower ${signed(o.amt)}`;
    case 'wall':
      return o.target === 'self' ? `${signed(o.amt)} Wall` : `Enemy Wall ${signed(o.amt)}`;
    case 'res':
      return o.target === 'self' ? `${signed(o.amt)} ${RES_LABEL[o.res]}` : `Enemy ${RES_LABEL[o.res]} ${signed(o.amt)}`;
    case 'gen':
      return o.target === 'self' ? `${signed(o.amt)} ${GEN_LABEL[o.res]}` : `Enemy ${GEN_LABEL[o.res]} ${signed(o.amt)}`;
    case 'steal':
      return `Steal ${o.amt} ${RES_LABEL[o.res]}`;
    case 'again':
      return 'Play again';
  }
}

export function describeCard(c: CardDef): string[] {
  return c.ops.map(describeOp);
}

export { RES_LABEL, GEN_LABEL };
