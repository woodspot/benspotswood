// Family voice recordings for Toy Phone, kept in this device's IndexedDB (never uploaded).
import type { LineKind } from './game';
import { setAudioSession } from '../kids/audio';

/** The lines a grown-up can record for one person. "Chat" has three so calls don't repeat. */
export const SLOTS = ['hello', 'more1', 'more2', 'more3', 'kiss', 'wave', 'bye'] as const;
export type Slot = (typeof SLOTS)[number];

export const SLOT_INFO: Record<Slot, { label: string; example: string }> = {
  hello: { label: 'Hello', example: '“Hi sweetie! It’s Nana!”' },
  more1: { label: 'Chat 1', example: '“I love you so much!”' },
  more2: { label: 'Chat 2', example: '“What did you play today?”' },
  more3: { label: 'Chat 3', example: '“Can you count to three? One, two, three!”' },
  kiss: { label: 'Kiss', example: '“Mwah! A big kiss for you!”' },
  wave: { label: 'Wave', example: '“Hi hi! I see you waving!”' },
  bye: { label: 'Bye', example: '“Bye bye! Love you!”' },
};

const DB = 'toy-phone';
const STORE = 'recordings';
let dbPromise: Promise<IDBDatabase> | null = null;
const cache = new Map<string, Blob>(); // "contactId:slot" → recording

function db(): Promise<IDBDatabase> {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return db().then(
    (d) =>
      new Promise<T>((resolve, reject) => {
        const req = fn(d.transaction(STORE, mode).objectStore(STORE));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      }),
  );
}

/** Load every recording into memory (they're small), so calls can play them instantly. */
export async function loadRecordings(): Promise<void> {
  try {
    const keys = (await tx('readonly', (s) => s.getAllKeys())) as string[];
    const blobs = (await tx('readonly', (s) => s.getAll())) as Blob[];
    cache.clear();
    keys.forEach((k, i) => cache.set(k, blobs[i]));
  } catch {
    /* private browsing or no IndexedDB: recordings just aren't available */
  }
}

export const getRecording = (id: string, slot: Slot) => cache.get(`${id}:${slot}`);
export const countRecordings = (id: string) => SLOTS.filter((s) => cache.has(`${id}:${s}`)).length;

export async function saveRecording(id: string, slot: Slot, blob: Blob): Promise<void> {
  await tx('readwrite', (s) => s.put(blob, `${id}:${slot}`));
  cache.set(`${id}:${slot}`, blob);
}

export async function deleteRecording(id: string, slot: Slot): Promise<void> {
  await tx('readwrite', (s) => s.delete(`${id}:${slot}`));
  cache.delete(`${id}:${slot}`);
}

export async function deleteAllFor(id: string): Promise<void> {
  for (const s of SLOTS) if (cache.has(`${id}:${s}`)) await deleteRecording(id, s);
}

/** A recording for this moment of the call, if the grown-up made one ("more" picks any chat). */
export function recordingFor(id: string, kind: LineKind): Blob | undefined {
  if (kind !== 'more') return getRecording(id, kind);
  const chats = (['more1', 'more2', 'more3'] as Slot[]).map((s) => getRecording(id, s)).filter(Boolean) as Blob[];
  return chats[Math.floor(Math.random() * chats.length)];
}

// ── Recording from the microphone ─────────────────────────────

const MAX_SECONDS = 10;
let stream: MediaStream | null = null;
let recorder: MediaRecorder | null = null;

function pickMime(): string | undefined {
  for (const m of ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus'])
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(m)) return m;
  return undefined;
}

/** Start recording; resolves with the recording when stopRecording() is called (or after 10 s). */
export async function startRecording(): Promise<Blob> {
  setAudioSession('play-and-record');
  stream ??= await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
  const mime = pickMime();
  const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
  recorder = rec;
  const chunks: Blob[] = [];
  return new Promise((resolve, reject) => {
    const limit = setTimeout(() => rec.state === 'recording' && rec.stop(), MAX_SECONDS * 1000);
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    rec.onstop = () => {
      clearTimeout(limit);
      recorder = null;
      // Let go of the microphone straight away: while it's open, iPhone plays sound through the
      // quiet earpiece and can pause other audio, so playback right after recording was silent.
      releaseMic();
      resolve(new Blob(chunks, { type: rec.mimeType || mime || 'audio/webm' }));
    };
    rec.onerror = () => reject(new Error('recording failed'));
    rec.start();
  });
}

export function stopRecording(): void {
  if (recorder?.state === 'recording') recorder.stop();
}

/** Let go of the microphone (when the grown-up leaves the recording screen). */
export function releaseMic(): void {
  stopRecording();
  stream?.getTracks().forEach((t) => t.stop());
  stream = null;
  setAudioSession('playback');
}

// ── Raw access for backup and family sync ─────────────────────

/** Every recording as [key, blob] where key is "contactId:slot". */
export async function allRecordings(): Promise<[string, Blob][]> {
  await loadRecordings();
  return [...cache.entries()];
}

export async function putRecordingKey(key: string, blob: Blob): Promise<void> {
  await tx('readwrite', (s) => s.put(blob, key));
  cache.set(key, blob);
}

export async function deleteRecordingKey(key: string): Promise<void> {
  await tx('readwrite', (s) => s.delete(key));
  cache.delete(key);
}

/** The recordings as a store that backup and sync can use. */
export const recordingStore = { list: allRecordings, put: putRecordingKey, del: deleteRecordingKey };

export const canRecord = () => !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== 'undefined';
