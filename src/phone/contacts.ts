// Who's in the phone: the built-in contacts plus family a grown-up adds, minus any they hide.
// Everything is kept in this device's local storage.
import { CONTACTS, displayName, fam, type Contact, type Custom } from './game';
import type { Lang } from '../kids/words';

export interface Extra {
  id: string;
  name: string;
  emoji: string;
  color: string;
  voice: 'female' | 'male';
}

/** Faces and colours to choose from when adding someone. */
export const EXTRA_EMOJI = ['👧', '👦', '👶', '👩', '👨', '👵', '👴', '🧑', '👱‍♀️', '🧔', '👩‍🦱', '👨‍🦱'];
const EXTRA_COLORS = ['#f6a5c0', '#9cc7f2', '#f7c873', '#8fd6a8', '#c9b3f5', '#ffb38a'];

const load = <T>(key: string, fallback: T): T => {
  try {
    return JSON.parse(localStorage.getItem(key) ?? '') as T;
  } catch {
    return fallback;
  }
};

let extras: Extra[] = load('phone.extra', []);
let hidden = new Set<string>(load('phone.hidden', []));
let custom: Record<string, Custom> = load('phone.custom', {});

const save = () => {
  localStorage.setItem('phone.extra', JSON.stringify(extras));
  localStorage.setItem('phone.hidden', JSON.stringify([...hidden]));
  localStorage.setItem('phone.custom', JSON.stringify(custom));
};

const fromExtra = (x: Extra): Contact =>
  fam(x.id, x.emoji, x.color, { en: x.name || 'Family', es: x.name || 'Familia' }, x.voice, 1, 0.95);

/** Everyone, hidden or not: built-in family, added family, then the animals and Santa. */
export function allContacts(): Contact[] {
  const fam = CONTACTS.filter((c) => c.family);
  return [...fam, ...extras.map(fromExtra), ...CONTACTS.filter((c) => !c.family)];
}

/** Who shows up in the phone. */
export function visibleContacts(): Contact[] {
  const shown = allContacts().filter((c) => !hidden.has(c.id));
  return shown.length ? shown : allContacts(); // never an empty phone
}

export const findContact = (id: string) => allContacts().find((c) => c.id === id);
export const isExtra = (id: string) => extras.some((x) => x.id === id);
export const extraOf = (id: string) => extras.find((x) => x.id === id);
export const isHidden = (id: string) => hidden.has(id);
export const customOf = (id: string): Custom | undefined => custom[id];
export const nameOf = (c: Contact, lang: Lang) => displayName(c, custom[c.id], lang);

export function setHidden(id: string, hide: boolean): void {
  if (hide) hidden.add(id);
  else hidden.delete(id);
  save();
}

export function addExtra(): Extra {
  const n = extras.length;
  const x: Extra = {
    id: `x${Date.now().toString(36)}`,
    name: '',
    emoji: EXTRA_EMOJI[n % EXTRA_EMOJI.length],
    color: EXTRA_COLORS[n % EXTRA_COLORS.length],
    voice: n % 2 ? 'male' : 'female',
  };
  extras = [...extras, x];
  save();
  return x;
}

export function updateExtra(id: string, patch: Partial<Extra>): void {
  extras = extras.map((x) => (x.id === id ? { ...x, ...patch } : x));
  save();
}

export function removeExtra(id: string): void {
  extras = extras.filter((x) => x.id !== id);
  delete custom[id];
  hidden.delete(id);
  save();
}

export function setCustom(id: string, patch: Partial<Custom>): void {
  custom[id] = { ...custom[id], ...patch };
  for (const k of Object.keys(custom[id]) as (keyof Custom)[]) if (!custom[id][k]) delete custom[id][k];
  save();
}
