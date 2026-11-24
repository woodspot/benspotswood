// Family sync: every device that knows the family code shares the games' settings, Toy Phone
// contacts and photos, and voice recordings, through public/api/sync.php on our own hosting.
//
// How it stays in step: each setting is a key with a value and a time. A device sends the keys it
// changed since its last sync; the server keeps the newest version of each key and sends everything
// back. Recordings are files; their key points at the file by content hash, so only new or changed
// recordings are uploaded or downloaded.
import { gameKeys, type BlobStore } from './backup';

const API = '/api/sync.php';
const CODE_KEY = 'kids.sync.code';
const LAST_KEY = 'kids.sync.last'; // values as of the last sync
const REC_KEY = 'kids.sync.rec'; // recording key → content hash as of the last sync
const WHEN_KEY = 'kids.sync.when';

type Entry = { v: string | null; t: number };
type State = Record<string, Entry>;

export const getCode = () => localStorage.getItem(CODE_KEY);
export const isLinked = () => !!getCode();
export const lastSynced = () => Number(localStorage.getItem(WHEN_KEY)) || 0;

const load = <T>(key: string, fallback: T): T => {
  try {
    return (JSON.parse(localStorage.getItem(key) ?? '') as T) ?? fallback;
  } catch {
    return fallback;
  }
};

async function call(action: string, opts: { code?: string; json?: unknown; blob?: Blob; name?: string } = {}): Promise<Response> {
  const code = opts.code ?? getCode();
  if (!code) throw new Error('This device is not linked to a family.');
  const url = `${API}?action=${action}${opts.name ? `&name=${encodeURIComponent(opts.name)}` : ''}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'X-Family-Code': code, ...(opts.json !== undefined ? { 'Content-Type': 'application/json' } : {}) },
    body: opts.blob ?? (opts.json !== undefined ? JSON.stringify(opts.json) : undefined),
    cache: 'no-store',
  });
  if (!res.ok) {
    let msg = `Sync failed (${res.status})`;
    try {
      msg = ((await res.json()) as { error?: string }).error ?? msg;
    } catch {
      /* not JSON */
    }
    throw new Error(msg);
  }
  return res;
}

async function callJson(action: string, opts: Parameters<typeof call>[1] = {}): Promise<State> {
  const data = (await (await call(action, opts)).json()) as { state?: State | [] };
  return Array.isArray(data.state) ? {} : (data.state ?? {});
}

async function hashBlob(b: Blob): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', await b.arrayBuffer());
  return [...new Uint8Array(digest)].map((x) => x.toString(16).padStart(2, '0')).join('').slice(0, 20);
}

function extFor(type: string): string {
  if (type.includes('mp4') || type.includes('m4a') || type.includes('aac')) return 'm4a';
  if (type.includes('ogg')) return 'ogg';
  if (type.includes('wav')) return 'wav';
  if (type.includes('mpeg') || type.includes('mp3')) return 'mp3';
  return 'webm';
}

const typeFor = (name: string) =>
  ({ m4a: 'audio/mp4', ogg: 'audio/ogg', wav: 'audio/wav', mp3: 'audio/mpeg', webm: 'audio/webm' })[name.split('.').pop() ?? ''] ?? 'audio/mp4';

/** Link this device to a family: "create" starts one with this device's setup, "join" switches to it. */
export async function link(code: string, mode: 'create' | 'join', store?: BlobStore): Promise<SyncResult> {
  const clean = code.trim();
  await callJson(mode, { code: clean });
  localStorage.setItem(CODE_KEY, clean);
  // A new link starts fresh: nothing counts as "already synced".
  localStorage.removeItem(LAST_KEY);
  localStorage.removeItem(REC_KEY);
  return sync(store, mode === 'join' ? 'theirs' : 'mine');
}

/** Stop syncing on this device. Its current setup stays as it is. */
export function unlink(): void {
  for (const k of [CODE_KEY, LAST_KEY, REC_KEY, WHEN_KEY]) localStorage.removeItem(k);
}

/** Delete the family's data from the server (other devices keep their own copies). */
export async function forget(): Promise<void> {
  await call('forget');
  unlink();
}

export interface SyncResult {
  changedHere: boolean; // something on this device was updated from the family
}

let running: Promise<SyncResult> | null = null;

/**
 * Sync now. `prefer` decides what happens to keys this device changed that the family also has,
 * on the first sync after linking: 'mine' keeps this device's (create), 'theirs' takes the family's (join).
 */
export function sync(store?: BlobStore, prefer: 'newest' | 'mine' | 'theirs' = 'newest'): Promise<SyncResult> {
  if (!isLinked()) return Promise.resolve({ changedHere: false });
  running ??= doSync(store, prefer).finally(() => (running = null));
  return running;
}

async function doSync(store: BlobStore | undefined, prefer: 'newest' | 'mine' | 'theirs'): Promise<SyncResult> {
  const server = await callJson('pull');
  const last = load<Record<string, string | null>>(LAST_KEY, {});
  const recLast = load<Record<string, string | null>>(REC_KEY, {});
  const now = Date.now();
  const changes: State = {};
  const keep = (key: string) => !(prefer === 'theirs' && key in server);

  // Settings this device changed since the last sync.
  for (const key of new Set([...gameKeys(), ...Object.keys(last)])) {
    const v = localStorage.getItem(key);
    if (v !== (last[key] ?? null) && keep(key)) changes[key] = { v, t: prefer === 'mine' ? now + 1 : now };
  }

  // Recordings this device added, changed or deleted: upload new ones first.
  const localRecs = new Map<string, Blob>(store ? await store.list() : []);
  const localHash = new Map<string, string>();
  if (store) {
    for (const [key, blob] of localRecs) localHash.set(key, await hashBlob(blob));
    for (const key of new Set([...localHash.keys(), ...Object.keys(recLast)])) {
      const h = localHash.get(key) ?? null;
      if (h === (recLast[key] ?? null) || !keep(`rec:${key}`)) continue;
      if (h) {
        const blob = localRecs.get(key)!;
        const name = `${key.replace(/[^A-Za-z0-9_-]/g, '_')}-${h.slice(0, 10)}.${extFor(blob.type)}`;
        await call('putfile', { blob, name });
        changes[`rec:${key}`] = { v: `${h}|${name}`, t: now };
      } else {
        changes[`rec:${key}`] = { v: null, t: now };
      }
    }
  }

  const merged = Object.keys(changes).length ? await callJson('push', { json: { changes } }) : server;

  // Bring this device up to date with the family.
  let changedHere = false;
  const nextLast: Record<string, string | null> = {};
  const nextRec: Record<string, string | null> = {};
  for (const [key, entry] of Object.entries(merged)) {
    if (key.startsWith('rec:')) {
      if (!store) continue;
      const recKey = key.slice(4);
      const [hash, name] = entry.v ? entry.v.split('|') : [null, null];
      if (hash && name && localHash.get(recKey) !== hash) {
        const res = await call('getfile', { name });
        await store.put(recKey, new Blob([await res.arrayBuffer()], { type: typeFor(name) }));
        changedHere = true;
      } else if (!hash && localHash.has(recKey)) {
        await store.del(recKey);
        changedHere = true;
      }
      nextRec[recKey] = hash;
    } else {
      if (localStorage.getItem(key) !== entry.v) {
        if (entry.v === null) localStorage.removeItem(key);
        else localStorage.setItem(key, entry.v);
        changedHere = true;
      }
      nextLast[key] = entry.v;
    }
  }
  localStorage.setItem(LAST_KEY, JSON.stringify(nextLast));
  // Without a store (games other than Toy Phone) leave the recording bookkeeping alone.
  if (store) localStorage.setItem(REC_KEY, JSON.stringify(nextRec));
  localStorage.setItem(WHEN_KEY, String(Date.now()));
  return { changedHere };
}

/**
 * For games that just need their settings: sync quietly when the page opens, and reload once if
 * the family had newer settings (so the game starts with them).
 */
export function syncOnOpen(store?: BlobStore, onChanged?: () => void): void {
  if (!isLinked()) return;
  sync(store)
    .then((r) => {
      if (r.changedHere) onChanged?.();
    })
    .catch(() => {
      /* offline: try again next time */
    });
}
