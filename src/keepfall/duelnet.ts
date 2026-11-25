// Duels on this phone: talking to the duel server and remembering which duels are yours.
// Kept under "skyduel." (not "keepfall."), so it stays on this phone: family sync shares Sky Armada
// progress between your own devices, but each phone is its own player in a duel.
import type { DuelDoc, Seat } from './duel';
import type { Action } from './types';

export interface MyDuel {
  id: string;
  seat: Seat;
  token: string;
  seen: number; // moves already shown on this phone (newer ones are played back)
  hidden?: boolean; // finished duels the player cleared from the list
}

const KEY = 'skyduel.list';
const NAME_KEY = 'skyduel.name';

export function myDuels(): MyDuel[] {
  try {
    const list = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function saveDuels(list: MyDuel[]): void {
  localStorage.setItem(KEY, JSON.stringify(list));
}

export const findMine = (id: string) => myDuels().find((m) => m.id === id);

export function rememberDuel(d: MyDuel): void {
  saveDuels([d, ...myDuels().filter((m) => m.id !== d.id)]);
}

export function updateMine(id: string, change: Partial<MyDuel>): void {
  saveDuels(myDuels().map((m) => (m.id === id ? { ...m, ...change } : m)));
}

export const myName = () => localStorage.getItem(NAME_KEY) ?? '';
export const setMyName = (n: string) => localStorage.setItem(NAME_KEY, n.trim().slice(0, 20));

/** The link that opens a duel (the invite you send). */
export const inviteLink = (id: string) => `${location.origin}/skyarmada/?duel=${id}`;

// ── Server ─────────────────────────────────────────────────────

export class DuelError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

async function call<T>(action: string, body: object): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api/duel.php?action=${action}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      cache: 'no-store',
    });
  } catch {
    throw new DuelError('No connection. Check the internet and try again.', 0);
  }
  const data = await res.json().catch(() => ({ ok: false, error: `Server error (${res.status})` }));
  if (!res.ok || !data.ok) throw new DuelError(data.error ?? `Server error (${res.status})`, res.status);
  return data as T;
}

type Joined = { duel: DuelDoc; seat: Seat; token: string };

export async function createDuel(name: string, faction: string, deck: string[]): Promise<DuelDoc> {
  const r = await call<Joined>('create', { name, faction, deck });
  rememberDuel({ id: r.duel.id, seat: r.seat, token: r.token, seen: 0 });
  return r.duel;
}

export async function joinDuel(id: string, name: string, faction: string): Promise<DuelDoc> {
  const r = await call<Joined>('join', { id, name, faction });
  rememberDuel({ id, seat: r.seat, token: r.token, seen: 0 });
  return r.duel;
}

/** Fetch duels by code (null for any that no longer exist). */
export async function getDuels(ids: string[]): Promise<Record<string, DuelDoc | null>> {
  if (!ids.length) return {};
  return (await call<{ duels: Record<string, DuelDoc | null> }>('get', { ids })).duels;
}

export async function getDuel(id: string): Promise<DuelDoc | null> {
  return (await getDuels([id]))[id] ?? null;
}

export async function sendMoves(mine: MyDuel, from: number, actions: Action[], winner: Seat | 'draw' | null): Promise<DuelDoc> {
  return (await call<{ duel: DuelDoc }>('move', { id: mine.id, token: mine.token, from, actions, winner })).duel;
}

export async function resignDuel(mine: MyDuel): Promise<DuelDoc> {
  return (await call<{ duel: DuelDoc }>('resign', { id: mine.id, token: mine.token })).duel;
}
