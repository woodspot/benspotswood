import type { BuildingDef, CardDef, Condition, Op, Rarity, Resource } from './types';

const dmg = (amt: number): Op => ({ op: 'damage', amt });
const tower = (amt: number, target: 'self' | 'enemy' = 'self'): Op => ({ op: 'tower', amt, target });
const wall = (amt: number, target: 'self' | 'enemy' = 'self'): Op => ({ op: 'wall', amt, target });
const res = (r: Resource, amt: number, target: 'self' | 'enemy' = 'self'): Op => ({ op: 'res', res: r, amt, target });
const gen = (r: Resource, amt: number, target: 'self' | 'enemy' = 'self'): Op => ({ op: 'gen', res: r, amt, target });
const steal = (r: Resource, amt: number): Op => ({ op: 'steal', res: r, amt });
const again: Op = { op: 'again' };
const build = (building: string): Op => ({ op: 'build', building });
const demolish: Op = { op: 'demolish' };
const burn = (amt: number, turns: number): Op => ({ op: 'burn', amt, turns });
const ward = (amt: number): Op => ({ op: 'ward', amt });
const curse = (count: number): Op => ({ op: 'curse', count });
const when = (cond: Condition, ...then: Op[]): Op => ({ op: 'if', cond, then });
const choose = (...options: Op[][]): Op => ({ op: 'choose', options });

export const CARDS: CardDef[] = [
  // ── Iron (stone): shipwrights ──────────────────────────────────────────
  { id: 'mortar', name: 'Rivets', type: 'stone', cost: 1, copies: 3, ops: [wall(3)] },
  { id: 'cornerstone', name: 'Drop Ballast', type: 'stone', cost: 2, copies: 2, ops: [tower(2), again], flavor: 'Lighter is higher.' },
  { id: 'stonecutters', name: 'Ore Barge', type: 'stone', cost: 3, copies: 2, ops: [gen('stone', 1)] },
  { id: 'rampart', name: 'Iron Plating', type: 'stone', cost: 4, copies: 2, ops: [wall(6)] },
  { id: 'watchtower', name: 'Lift Bag', type: 'stone', cost: 5, copies: 2, ops: [tower(5)] },
  { id: 'buttress', name: 'Reinforced Keel', type: 'stone', cost: 6, copies: 2, ops: [wall(4), tower(3)] },
  { id: 'tunnel', name: 'Hull Cutters', type: 'stone', cost: 7, copies: 1, ops: [wall(-9, 'enemy')] },
  { id: 'guild', name: 'Foundry Guild', type: 'stone', cost: 8, copies: 1, ops: [gen('stone', 2)] },
  { id: 'landslide', name: 'Iron Hail', type: 'stone', cost: 10, copies: 1, ops: [gen('stone', -1, 'enemy'), wall(-6, 'enemy')] },
  { id: 'greatwall', name: 'Ironclad Hull', type: 'stone', cost: 12, copies: 1, ops: [wall(15)] },
  { id: 'spire', name: 'Great Envelope', type: 'stone', cost: 15, copies: 1, ops: [tower(13)] },
  { id: 'bastion', name: 'Dreadnought Refit', type: 'stone', cost: 18, copies: 1, ops: [wall(12), tower(8)] },

  // ── Aether (mana): magic ──────────────────────────────────────────────
  { id: 'rune', name: 'Updraft', type: 'mana', cost: 1, copies: 3, ops: [tower(1), again] },
  { id: 'spark', name: 'Static Spark', type: 'mana', cost: 2, copies: 2, ops: [tower(-3, 'enemy')], flavor: 'Armor means nothing to lightning.' },
  { id: 'leyline', name: 'Aether Tap', type: 'mana', cost: 3, copies: 2, ops: [gen('mana', 1)] },
  { id: 'mend', name: 'Buoyancy Charm', type: 'mana', cost: 3, copies: 2, ops: [tower(4)] },
  { id: 'siphon', name: 'Aether Siphon', type: 'mana', cost: 3, copies: 2, ops: [steal('mana', 6), again] },
  { id: 'transmute', name: 'Transmute', type: 'mana', cost: 4, copies: 2, ops: [res('stone', 6), res('steel', 6)] },
  { id: 'bolt', name: 'Aether Bolt', type: 'mana', cost: 6, copies: 2, ops: [tower(-6, 'enemy')] },
  { id: 'rust', name: 'Damp Powder', type: 'mana', cost: 7, copies: 1, ops: [gen('steel', -1, 'enemy'), res('steel', -5, 'enemy')] },
  { id: 'conclave', name: 'Aether Conclave', type: 'mana', cost: 8, copies: 1, ops: [gen('mana', 2)] },
  { id: 'quake', name: 'Leaden Hex', type: 'mana', cost: 9, copies: 1, ops: [gen('stone', -1, 'enemy'), tower(-5, 'enemy')] },
  { id: 'storm', name: 'Thunderhead', type: 'mana', cost: 13, copies: 1, ops: [tower(-11, 'enemy')] },
  { id: 'citadel', name: 'Skyward Surge', type: 'mana', cost: 16, copies: 1, ops: [tower(15)] },

  // ── Powder (steel): guns ───────────────────────────────────────────────
  { id: 'drums', name: 'Swivel Guns', type: 'steel', cost: 1, copies: 3, ops: [dmg(2), again] },
  { id: 'skirmish', name: 'Musket Volley', type: 'steel', cost: 2, copies: 2, ops: [dmg(4)] },
  { id: 'recruiter', name: 'Powder Works', type: 'steel', cost: 3, copies: 2, ops: [gen('steel', 1)] },
  { id: 'archers', name: 'Deck Cannons', type: 'steel', cost: 4, copies: 2, ops: [dmg(6)] },
  { id: 'raiders', name: 'Boarding Party', type: 'steel', cost: 5, copies: 2, ops: [dmg(4), steal('stone', 4)] },
  { id: 'warband', name: 'Broadside', type: 'steel', cost: 6, copies: 2, ops: [dmg(9)] },
  { id: 'ram', name: 'Ramming Prow', type: 'steel', cost: 7, copies: 1, ops: [wall(-14, 'enemy')] },
  { id: 'mercs', name: 'Privateer Contract', type: 'steel', cost: 8, copies: 1, ops: [gen('steel', 2)] },
  { id: 'saboteurs', name: 'Saboteurs', type: 'steel', cost: 8, copies: 1, ops: [gen('mana', -1, 'enemy'), dmg(5)] },
  { id: 'assassin', name: 'Sharpshooter', type: 'steel', cost: 10, copies: 1, ops: [tower(-9, 'enemy')] },
  { id: 'siege', name: 'Siege Mortar', type: 'steel', cost: 12, copies: 1, ops: [dmg(17)] },
  { id: 'dragon', name: 'Leviathan Gun', type: 'steel', cost: 18, copies: 1, ops: [dmg(26)] },

  // ── Modules (buildings): stay aboard, act every turn ──────────────────
  { id: 'b-lodge', name: 'Repair Crew', type: 'stone', cost: 6, copies: 1, ops: [build('lodge')], flavor: 'The plating grows while you sleep.' },
  { id: 'b-market', name: 'Trade Hold', type: 'stone', cost: 9, copies: 1, ops: [build('market')] },
  { id: 'b-shrine', name: 'Lift Engine', type: 'mana', cost: 7, copies: 1, ops: [build('shrine')] },
  { id: 'b-beacon', name: 'Storm Lantern', type: 'mana', cost: 10, copies: 1, ops: [build('beacon')] },
  { id: 'b-catapult', name: 'Mortar Deck', type: 'steel', cost: 7, copies: 1, ops: [build('catapult')] },
  { id: 'b-ballista', name: 'Gun Turret', type: 'steel', cost: 12, copies: 1, ops: [build('ballista')] },
  { id: 'sappers', name: 'Demolition Charge', type: 'steel', cost: 5, copies: 2, ops: [demolish, dmg(3)], flavor: 'Bring it all down.' },
  { id: 'dispel', name: 'Dispel', type: 'mana', cost: 4, copies: 1, ops: [demolish, again] },

  // ── Choices, combos, wards ───────────────────────────────────
  { id: 'scaffold', name: 'Rigging', type: 'stone', cost: 3, copies: 2, ops: [choose([wall(5)], [tower(2), again])], flavor: 'Up or out?' },
  { id: 'bulwark', name: 'Bulkhead', type: 'stone', cost: 6, copies: 1, ops: [ward(7), wall(3)] },
  { id: 'renovate', name: 'Emergency Refit', type: 'stone', cost: 8, copies: 1, ops: [tower(4), when('behind', tower(5))], flavor: 'Rebuild bigger.' },
  { id: 'glyph', name: 'Warding Sigil', type: 'mana', cost: 3, copies: 2, ops: [ward(5), again] },
  { id: 'echo', name: 'Echo', type: 'mana', cost: 2, copies: 2, ops: [tower(1), when('combo', tower(-4, 'enemy'))], flavor: 'Magic answers magic.' },
  { id: 'pact', name: 'Twin Pact', type: 'mana', cost: 5, copies: 2, ops: [choose([tower(-5, 'enemy')], [tower(6)])] },
  { id: 'blitz', name: 'Strafing Run', type: 'steel', cost: 3, copies: 2, ops: [dmg(3), when('combo', dmg(4))] },
  { id: 'flank', name: 'Flanking Pass', type: 'steel', cost: 5, copies: 2, ops: [dmg(5), when('foeNoWall', dmg(5))], flavor: 'Go around.' },
  { id: 'pillage', name: 'Plunder', type: 'steel', cost: 6, copies: 1, ops: [choose([steal('stone', 7)], [steal('mana', 7)], [dmg(7)])] },
  { id: 'b-obelisk', name: 'Aether Lens', type: 'mana', cost: 8, copies: 1, ops: [build('obelisk')] },
  { id: 'b-den', name: "Smugglers' Hold", type: 'steel', cost: 9, copies: 1, ops: [build('den')] },

  // ── Hex (unlockable): burns and junk ───────────────────────
  { id: 'hexfire', name: 'Hexfire', type: 'mana', cost: 4, copies: 2, ops: [burn(2, 3)], flavor: 'It never quite goes out.' },
  { id: 'plague', name: 'Corroding Fog', type: 'mana', cost: 9, copies: 1, ops: [burn(3, 4), gen('stone', -1, 'enemy')] },
  { id: 'firearrows', name: 'Fire Shot', type: 'steel', cost: 4, copies: 2, ops: [dmg(3), burn(1, 3)] },
  { id: 'rubblecart', name: 'Junk Barge', type: 'stone', cost: 4, copies: 2, ops: [wall(-3, 'enemy'), curse(2)] },
  { id: 'marauders', name: 'Raiders', type: 'steel', cost: 7, copies: 1, ops: [dmg(6), curse(2)] },

  // ── Junk ─────────────────────────────────────────────────────
  {
    id: 'rubble', name: 'Junk', type: 'stone', cost: 0, copies: 0, ops: [], curse: true, exhaust: true,
    text: ['Does nothing', 'Leaves your deck when played'], flavor: 'Someone dumped this in your hold.',
  },
];

export const HEX_CARDS = ['hexfire', 'plague', 'firearrows', 'rubblecart', 'marauders'];

export const BUILDINGS: BuildingDef[] = [
  { id: 'lodge', name: 'Repair Crew', icon: '🔧', ops: [wall(2)], worth: 14 },
  { id: 'market', name: 'Trade Hold', icon: '📦', ops: [res('stone', 1), res('mana', 1), res('steel', 1)], worth: 16 },
  { id: 'shrine', name: 'Lift Engine', icon: '🎈', ops: [tower(1)], worth: 16 },
  { id: 'beacon', name: 'Storm Lantern', icon: '🏮', ops: [tower(-1, 'enemy')], worth: 20 },
  { id: 'catapult', name: 'Mortar Deck', icon: '☄️', ops: [dmg(2)], worth: 18 },
  { id: 'ballista', name: 'Gun Turret', icon: '🎯', ops: [dmg(3), wall(1)], worth: 26 },
  { id: 'obelisk', name: 'Aether Lens', icon: '🔮', ops: [ward(2)], worth: 15 },
  { id: 'den', name: "Smugglers' Hold", icon: '🗝️', ops: [steal('stone', 1), steal('mana', 1), steal('steel', 1)], worth: 22 },
];

const BASE_CARDS: Record<string, CardDef> = Object.fromEntries(CARDS.map((c) => [c.id, c]));
const BASE_BUILDINGS: Record<string, BuildingDef> = Object.fromEntries(BUILDINGS.map((b) => [b.id, b]));

// ── Upgrades: "archers+" is Archers with ~35% bigger numbers ───
function boost(n: number): number {
  const d = Math.max(1, Math.round(Math.abs(n) * 0.35));
  return n > 0 ? n + d : n - d;
}

function upgradeOps(ops: Op[]): Op[] {
  return ops.map((o) => {
    switch (o.op) {
      case 'damage':
      case 'tower':
      case 'wall':
      case 'res':
      case 'steal':
      case 'ward':
        return { ...o, amt: boost(o.amt) };
      case 'burn':
        return { ...o, amt: o.amt + 1 };
      case 'build':
        return { ...o, building: o.building + '+' };
      case 'if':
        return { ...o, then: upgradeOps(o.then) };
      case 'choose':
        return { ...o, options: o.options.map(upgradeOps) };
      default:
        return o;
    }
  });
}

const scalable = (ops: Op[]): boolean =>
  ops.some(
    (o) =>
      ['damage', 'tower', 'wall', 'res', 'steal', 'build', 'ward', 'burn'].includes(o.op) ||
      (o.op === 'if' && scalable(o.then)) ||
      (o.op === 'choose' && o.options.some(scalable)),
  );

const upgradeCache: Record<string, CardDef> = {};
const upgradeBuildingCache: Record<string, BuildingDef> = {};

export function card(id: string): CardDef {
  if (id.endsWith('+')) {
    if (upgradeCache[id]) return upgradeCache[id];
    const base = card(id.slice(0, -1));
    const up: CardDef = {
      ...base,
      id,
      name: base.name + '+',
      upgraded: true,
      ops: upgradeOps(base.ops),
      // Cards with nothing to scale (generators) get cheaper instead.
      cost: scalable(base.ops) ? base.cost : Math.max(1, base.cost - 2),
    };
    return (upgradeCache[id] = up);
  }
  const c = BASE_CARDS[id];
  if (!c) throw new Error(`Unknown card: ${id}`);
  return c;
}

export function building(id: string): BuildingDef {
  if (id.endsWith('+')) {
    if (upgradeBuildingCache[id]) return upgradeBuildingCache[id];
    const base = building(id.slice(0, -1));
    const up: BuildingDef = { ...base, id, name: base.name + '+', ops: upgradeOps(base.ops), worth: Math.round(base.worth * 1.35) };
    return (upgradeBuildingCache[id] = up);
  }
  const b = BASE_BUILDINGS[id];
  if (!b) throw new Error(`Unknown building: ${id}`);
  return b;
}

export const canUpgrade = (id: string) => !id.endsWith('+') && !card(id).curse;

export function rarity(id: string): Rarity {
  const c = card(id.replace(/\+$/, ''));
  return c.cost <= 4 ? 'common' : c.cost <= 9 ? 'uncommon' : 'rare';
}

// ── Locked content: unlockable cards stay out of decks and offers until earned ──
let lockedCards = new Set<string>();
export function setLockedCards(ids: string[]): void {
  lockedCards = new Set(ids);
}
/** Cards that can appear in decks, drafts and rewards right now. */
export function availableCards(): CardDef[] {
  return CARDS.filter((c) => !c.curse && !lockedCards.has(c.id));
}

/** Every available card, with its copy count: used for Quick Battle. */
export function standardDeck(): string[] {
  return availableCards().flatMap((c) => Array.from({ length: c.copies }, () => c.id));
}

/** A plain starting deck for draft and campaign play. */
export const STARTER_DECK: string[] = [
  'mortar', 'mortar', 'cornerstone', 'stonecutters', 'rampart', 'watchtower',
  'rune', 'rune', 'spark', 'leyline', 'mend', 'bolt',
  'drums', 'drums', 'skirmish', 'recruiter', 'archers', 'warband',
];

const RES_LABEL: Record<Resource, string> = { stone: 'Iron', mana: 'Aether', steel: 'Powder' };
const GEN_LABEL: Record<Resource, string> = { stone: 'Foundry', mana: 'Aether Well', steel: 'Powder Mill' };

const signed = (n: number) => (n > 0 ? `+${n}` : `${n}`);

/** Human-readable rules text, generated from the card's ops. */
export function describeOp(o: Op): string {
  switch (o.op) {
    case 'damage':
      return `${o.amt} damage`;
    case 'tower':
      return o.target === 'self' ? `${signed(o.amt)} Altitude` : `Enemy Altitude ${signed(o.amt)}`;
    case 'wall':
      return o.target === 'self' ? `${signed(o.amt)} Armor` : `Enemy Armor ${signed(o.amt)}`;
    case 'res':
      return o.target === 'self' ? `${signed(o.amt)} ${RES_LABEL[o.res]}` : `Enemy ${RES_LABEL[o.res]} ${signed(o.amt)}`;
    case 'gen':
      return o.target === 'self' ? `${signed(o.amt)} ${GEN_LABEL[o.res]}` : `Enemy ${GEN_LABEL[o.res]} ${signed(o.amt)}`;
    case 'steal':
      return `Steal ${o.amt} ${RES_LABEL[o.res]}`;
    case 'build': {
      const b = building(o.building);
      return `${b.icon} Each turn: ${b.ops.map(describeOp).join(', ')}`;
    }
    case 'demolish':
      return 'Destroy an enemy module';
    case 'again':
      return 'Play again';
    case 'burn':
      return `Burn ${o.amt} for ${o.turns} turns`;
    case 'ward':
      return `+${o.amt} Ward`;
    case 'curse':
      return `${o.count} Junk into enemy deck`;
    case 'if':
      return `${COND_LABEL[o.cond]}: ${o.then.map(describeOp).join(', ')}`;
    case 'choose':
      return `Choose: ${o.options.map(describeOption).join(' or ')}`;
  }
}

export const COND_LABEL: Record<Condition, string> = {
  foeNoWall: 'If enemy has no Armor',
  behind: 'If you are lower',
  combo: 'Combo',
};

/** Text for one option of a Choose card. */
export function describeOption(opt: Op[]): string {
  return opt.map(describeOp).join(', ');
}

const NUMS = ['①', '②', '③', '④'];

export function describeCard(c: CardDef): string[] {
  if (c.text) return c.text;
  return c.ops.flatMap((o) =>
    o.op === 'choose' ? ['Choose one:', ...o.options.map((opt, i) => `${NUMS[i]} ${describeOption(opt)}`)] : [describeOp(o)],
  );
}

/** The Choose op on a card, if it has one. */
export function choiceOf(c: CardDef): Extract<Op, { op: 'choose' }> | undefined {
  return c.ops.find((o): o is Extract<Op, { op: 'choose' }> => o.op === 'choose');
}

export { RES_LABEL, GEN_LABEL };
