// Duels: two people, one battle, taking turns whenever it suits them. The server only keeps the
// starting setup and the list of moves (see public/api/duel.php); the engine is deterministic, so
// every phone replays the moves and gets the same battle. No DOM here, so it can be tested.
import { CARDS } from './cards';
import { newGame, step } from './engine';
import type { FactionId } from './factions';
import { DEFAULT_RULES, type Action, type GameState } from './types';

export type Seat = 0 | 1;

/** A duel as the server stores it (minus the secret seat tokens). */
export interface DuelDoc {
  v: number;
  id: string;
  created: number;
  updated: number;
  seed: number;
  deck: string[];
  names: [string, string | null];
  factions: [FactionId, FactionId | null];
  actions: Action[];
  winner: Seat | 'draw' | 'cancelled' | null;
  resigned: Seat | null;
}

/**
 * The deck both players use: every card in the game, once its normal number of copies. It ignores
 * what this phone has unlocked in the Shipyard (otherwise the two phones would build different
 * decks), and it's saved with the duel, so a later game update can't change a duel in progress.
 */
export function duelDeck(): string[] {
  return CARDS.filter((c) => !c.curse && !c.legendary && !c.upgraded && !c.enchant).flatMap((c) => Array.from({ length: c.copies }, () => c.id));
}

/** The battle at the start, from seat 0's side. */
export function startState(d: DuelDoc): GameState {
  return newGame({
    seed: d.seed,
    names: [d.names[0], d.names[1] ?? 'Opponent'],
    factions: [d.factions[0], d.factions[1] ?? d.factions[0]],
    decks: [[...d.deck], [...d.deck]],
    rules: DEFAULT_RULES,
  });
}

const other = (s: Seat): Seat => (1 - s) as Seat;
const flipSeat = <T>(v: T): T => (v === 0 ? 1 : v === 1 ? 0 : v) as T;

/**
 * The same battle seen from the other seat: players swapped and every "whose" flipped. The battle
 * screen always shows "you" as player 0, so seat 1 plays on a flipped copy. The engine treats both
 * players alike, so playing a move on the flipped copy gives the flipped result.
 */
export function flipState(s: GameState): GameState {
  const f: GameState = structuredClone(s);
  f.players = [f.players[1], f.players[0]];
  f.current = other(f.current);
  f.winner = flipSeat(f.winner);
  f.log = f.log.map((e) => ({ ...e, player: other(e.player) }));
  if (f.lastAction) f.lastAction = { ...f.lastAction, player: other(f.lastAction.player) };
  if (f.beats)
    f.beats = f.beats.map((b) => ({ ...b, player: other(b.player), after: [b.after[1], b.after[0]] }));
  return f;
}

/** The battle after the first `upTo` moves, seen from `seat` (so "you" are player 0). */
export function replay(d: DuelDoc, seat: Seat, upTo = d.actions.length): GameState {
  let s = startState(d);
  if (seat === 1) s = flipState(s);
  for (const a of d.actions.slice(0, upTo)) s = step(s, a, DEFAULT_RULES);
  return s;
}

export type DuelStatus = 'invite' | 'yours' | 'theirs' | 'won' | 'lost' | 'draw' | 'cancelled';

/** Where a duel stands for the player in `seat`. */
export function statusOf(d: DuelDoc, seat: Seat): DuelStatus {
  if (d.winner === 'cancelled') return 'cancelled';
  if (d.winner === 'draw') return 'draw';
  if (d.winner === 0 || d.winner === 1) return d.winner === seat ? 'won' : 'lost';
  if (d.names[1] === null || d.factions[1] === null) return 'invite';
  const s = replay(d, seat);
  if (s.winner !== null) return s.winner === 'draw' ? 'draw' : s.winner === 0 ? 'won' : 'lost';
  return s.current === 0 ? 'yours' : 'theirs';
}

/** The other player's name, as seen from `seat`. */
export const opponentName = (d: DuelDoc, seat: Seat) => (seat === 0 ? d.names[1] : d.names[0]) ?? 'Waiting for someone…';

/** Who won, in the server's terms (seat numbers), from a battle seen from `seat`. */
export function seatWinner(s: GameState, seat: Seat): Seat | 'draw' | null {
  if (s.winner === null || s.winner === 'draw') return s.winner;
  return seat === 0 ? s.winner : other(s.winner);
}
