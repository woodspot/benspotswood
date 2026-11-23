import { availableCards, card, rarity, STARTER_DECK } from './cards';
import type { Rarity } from './types';

/** A seeded random source that lives inside a saveable object. */
export interface RngHolder {
  rng: number;
}

export function rand(h: RngHolder): number {
  let t = (h.rng = (h.rng + 0x6d2b79f5) | 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export const DRAFT_PICKS = 12;

function pools(): Record<Rarity, string[]> {
  const pool: Record<Rarity, string[]> = { common: [], uncommon: [], rare: [] };
  for (const c of availableCards()) pool[rarity(c.id)].push(c.id);
  return pool;
}

/**
 * Offer `n` different cards. `luck` shifts odds toward rarer cards
 * (0 = normal 60/30/10 split, 1 = elite rewards 30/45/25).
 */
export function offerCards(h: RngHolder, n = 3, luck = 0): string[] {
  const out: string[] = [];
  const POOL = pools();
  const rareP = 0.1 + 0.15 * luck;
  const uncP = 0.3 + 0.15 * luck;
  let guard = 0;
  while (out.length < n && guard++ < 200) {
    const r = rand(h);
    const tier: Rarity = r < rareP ? 'rare' : r < rareP + uncP ? 'uncommon' : 'common';
    const pool = POOL[tier];
    const id = pool[Math.floor(rand(h) * pool.length)];
    if (!out.includes(id)) out.push(id);
  }
  return out;
}

/** How the AI drafts: usually the priciest card on offer, sometimes a random one. */
export function aiPick(h: RngHolder, offer: string[]): string {
  if (rand(h) < 0.35) return offer[Math.floor(rand(h) * offer.length)];
  return [...offer].sort((a, b) => card(b).cost - card(a).cost)[0];
}

/** A full AI deck: the starter plus `picks` drafted cards. */
export function aiDeck(h: RngHolder, picks: number): string[] {
  const deck = [...STARTER_DECK];
  for (let i = 0; i < picks; i++) deck.push(aiPick(h, offerCards(h)));
  return deck;
}
