// Backup and restore: everything a family set up (settings, contacts, photos, voice recordings)
// in one file that can be kept in iCloud Drive, emailed, or loaded onto another device.

/** Where a game keeps files (Toy Phone's recordings). Keys look like "contactId:slot". */
export interface BlobStore {
  list(): Promise<[string, Blob][]>;
  put(key: string, blob: Blob): Promise<void>;
  del(key: string): Promise<void>;
}

/** localStorage keys that belong to the games (and so get backed up and synced). */
const PREFIXES = ['phone.', 'kids.', 'match.', 'keepfall.', 'balloons.', 'skyhold.', 'trail.'];
/** …except these, which only make sense on this device. */
const DEVICE_ONLY = ['kids.sync.'];

export function gameKeys(): string[] {
  const out: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i)!;
    if (PREFIXES.some((p) => k.startsWith(p)) && !DEVICE_ONLY.some((p) => k.startsWith(p))) out.push(k);
  }
  return out.sort();
}

interface BackupFile {
  app: 'benspotswood-kids-games';
  version: 1;
  created: string;
  settings: Record<string, string>;
  recordings: { key: string; type: string; data: string }[];
}

function blobToBase64(b: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1] ?? '');
    r.onerror = () => reject(r.error);
    r.readAsDataURL(b);
  });
}

function base64ToBlob(data: string, type: string): Blob {
  const bin = atob(data);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type });
}

/** Build the backup and hand it to the browser as a download (on iPhone: the share/save sheet). */
export async function downloadBackup(store?: BlobStore): Promise<number> {
  const settings = Object.fromEntries(gameKeys().map((k) => [k, localStorage.getItem(k)!]));
  const recs = store ? await store.list() : [];
  const file: BackupFile = {
    app: 'benspotswood-kids-games',
    version: 1,
    created: new Date().toISOString(),
    settings,
    recordings: await Promise.all(recs.map(async ([key, b]) => ({ key, type: b.type, data: await blobToBase64(b) }))),
  };
  const blob = new Blob([JSON.stringify(file)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `family-games-backup-${file.created.slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
  return recs.length;
}

/** Load a backup file, replacing this device's game settings and recordings. */
export async function restoreBackup(file: File, store?: BlobStore): Promise<{ settings: number; recordings: number }> {
  const data = JSON.parse(await file.text()) as BackupFile;
  if (data?.app !== 'benspotswood-kids-games' || typeof data.settings !== 'object') throw new Error('Not a family games backup file');
  for (const k of gameKeys()) localStorage.removeItem(k);
  for (const [k, v] of Object.entries(data.settings)) if (PREFIXES.some((p) => k.startsWith(p))) localStorage.setItem(k, v);
  let n = 0;
  if (store) {
    for (const [key] of await store.list()) await store.del(key);
    for (const r of data.recordings ?? []) {
      await store.put(r.key, base64ToBlob(r.data, r.type));
      n++;
    }
  }
  return { settings: Object.keys(data.settings).length, recordings: n };
}
