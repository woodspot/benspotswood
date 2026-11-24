// Captains: chosen before a campaign (bought in the Shipyard). Each has a passive bonus and a
// power: a button you can press once per battle (twice at level 5) without using up your turn.
// Captains level up from 1 to 5 as you win battles with them.
import type { Mods } from './factions';
import type { Op, StartBonus } from './types';
import type { VoiceKey } from '../kids/words';

export interface CaptainDef {
  id: string;
  name: string;
  icon: string;
  cost: number; // Renown in the Shipyard (0 = free)
  blurb: string;
  passive: (level: number) => { text: string; start?: StartBonus; mods?: Mods };
  power: { name: string; text: (level: number) => string; ops: (level: number) => Op[] };
  /** Spoken when the power is used (natural voice clips if generated; otherwise silent). */
  shout: string;
  voice: VoiceKey;
}

const dmg = (amt: number): Op => ({ op: 'damage', amt });

export const CAPTAINS: CaptainDef[] = [
  {
    id: 'navigator',
    name: 'Navigator Wren',
    icon: '🧭',
    cost: 0,
    blurb: 'Steady hands and a sharp eye for a better course.',
    passive: (l) => ({ text: `Start with +${1 + l} of every resource`, start: { res: { stone: 1 + l, mana: 1 + l, steel: 1 + l } } }),
    power: {
      name: 'Change Course',
      text: (l) => `Draw a whole new hand and gain ${1 + l} of every resource`,
      ops: (l) => [{ op: 'redraw' }, ...(['stone', 'mana', 'steel'] as const).map((res): Op => ({ op: 'res', res, amt: 1 + l, target: 'self' }))],
    },
    shout: 'Hard to starboard! New heading!',
    voice: 'heroF',
  },
  {
    id: 'gunner',
    name: 'Gunner Brass',
    icon: '🎯',
    cost: 150,
    blurb: 'Never met a problem a cannon couldn’t fix.',
    passive: (l) => ({
      text: l >= 3 ? `Start with +${2 + l} Powder; all damage +1` : `Start with +${2 + l} Powder`,
      start: { res: { steel: 2 + l } },
      mods: l >= 3 ? { damageBonus: 1 } : undefined,
    }),
    power: { name: 'Broadside', text: (l) => `${6 + 2 * l} damage`, ops: (l) => [dmg(6 + 2 * l)] },
    shout: 'Fire all cannons!',
    voice: 'heroM',
  },
  {
    id: 'shipwright',
    name: 'Shipwright Moss',
    icon: '🔨',
    cost: 150,
    blurb: 'Can patch a hull mid-storm with a spoon and a smile.',
    passive: (l) => ({ text: `Start with +${2 + 2 * l} Armor`, start: { wall: 2 + 2 * l } }),
    power: {
      name: 'Patch Her Up',
      text: (l) => `+${6 + 2 * l} Armor and +${1 + l} Altitude`,
      ops: (l) => [
        { op: 'wall', amt: 6 + 2 * l, target: 'self' },
        { op: 'tower', amt: 1 + l, target: 'self' },
      ],
    },
    shout: 'Hammers out, lads! Patch her up!',
    voice: 'grandpa',
  },
  {
    id: 'aethermage',
    name: 'Aethermage Lune',
    icon: '🔮',
    cost: 200,
    blurb: 'Speaks to storms, and sometimes they answer.',
    passive: (l) => ({
      text: l >= 3 ? 'Start with +1 Aether Well; spells that hit enemy Altitude deal +1' : 'Start with +1 Aether Well',
      start: { gen: { mana: 1 } },
      mods: l >= 3 ? { spellBonus: 1 } : undefined,
    }),
    power: { name: 'Arc Flash', text: (l) => `Enemy Altitude −${3 + l}`, ops: (l) => [{ op: 'tower', amt: -(3 + l), target: 'enemy' }] },
    shout: 'Feel the storm!',
    voice: 'heroF',
  },
  {
    id: 'quartermaster',
    name: 'Quartermaster Bell',
    icon: '📦',
    cost: 200,
    blurb: 'Knows exactly what’s in the hold, down to the last bolt.',
    passive: (l) => ({ text: `Start with +${2 + l} of every resource`, start: { res: { stone: 2 + l, mana: 2 + l, steel: 2 + l } } }),
    power: {
      name: 'Open the Hold',
      text: (l) => `+${4 + l} of every resource`,
      ops: (l) => (['stone', 'mana', 'steel'] as const).map((res): Op => ({ op: 'res', res, amt: 4 + l, target: 'self' })),
    },
    shout: 'Open the hold! Everything we’ve got!',
    voice: 'heroM',
  },
  {
    id: 'smuggler',
    name: 'Smuggler Vex',
    icon: '🦜',
    cost: 250,
    blurb: 'If it isn’t nailed down, it’s hers. If it is, she has a crowbar.',
    passive: (l) => ({ text: `Steal effects take ${l >= 3 ? 2 : 1} more`, mods: { stealBonus: l >= 3 ? 2 : 1 } }),
    power: {
      name: 'Pickpocket',
      text: (l) => `Steal ${2 + l} of every resource`,
      ops: (l) => (['stone', 'mana', 'steel'] as const).map((res): Op => ({ op: 'steal', res, amt: 2 + l })),
    },
    shout: 'Yours? Not anymore, darling.',
    voice: 'heroF',
  },
];

export const CAPTAIN_MAP: Record<string, CaptainDef> = Object.fromEntries(CAPTAINS.map((c) => [c.id, c]));

/** Experience needed for each level (index = level − 1). */
export const LEVEL_XP = [0, 5, 15, 30, 50];
export const levelFor = (xp: number) => LEVEL_XP.filter((t) => xp >= t).length;
export const usesFor = (level: number) => (level >= 5 ? 2 : 1);
