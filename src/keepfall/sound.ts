// Sound effects: recorded game sounds from Kenney (kenney.nl, CC0 public domain) in public/sfx/,
// played through Web Audio. Each effect falls back to a tiny synthesized sound until its file loads.

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let muted = localStorage.getItem('keepfall.muted') === '1';

function audio(): AudioContext | null {
  if (muted) return null;
  if (!ctx) {
    try {
      ctx = new AudioContext();
      master = ctx.createGain();
      master.gain.value = 0.35;
      master.connect(ctx.destination);
    } catch {
      return null;
    }
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

export function isMuted(): boolean {
  return muted;
}

export function setMuted(m: boolean): void {
  muted = m;
  localStorage.setItem('keepfall.muted', m ? '1' : '0');
}

/** Call from a click handler so browsers allow audio to start. */
export function unlock(): void {
  if (audio()) preloadSfx();
}

function tone(freq: number, start: number, dur: number, type: OscillatorType = 'sine', vol = 0.5, endFreq?: number): void {
  const a = audio();
  if (!a || !master) return;
  const t = a.currentTime + start;
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (endFreq) o.frequency.exponentialRampToValueAtTime(endFreq, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(master);
  o.start(t);
  o.stop(t + dur + 0.02);
}

function noise(start: number, dur: number, vol = 0.4, filterFreq = 1200, filterEnd?: number): void {
  const a = audio();
  if (!a || !master) return;
  const t = a.currentTime + start;
  const buf = a.createBuffer(1, Math.ceil(a.sampleRate * dur), a.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  const src = a.createBufferSource();
  src.buffer = buf;
  const f = a.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.setValueAtTime(filterFreq, t);
  if (filterEnd) f.frequency.exponentialRampToValueAtTime(filterEnd, t + dur);
  const g = a.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(g).connect(master);
  src.start(t);
}

// ── Recorded samples ───────────────────────────────────────────

const buffers = new Map<string, AudioBuffer | null>();
const loading = new Map<string, Promise<void>>();

function load(name: string): void {
  const a = audio();
  if (!a || buffers.has(name) || loading.has(name)) return;
  loading.set(
    name,
    fetch(`/sfx/${name}.mp3`)
      .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(String(r.status)))))
      .then((d) => a.decodeAudioData(d))
      .then((b) => void buffers.set(name, b))
      .catch(() => void buffers.set(name, null)),
  );
}

/** Fetch the common sounds as soon as audio is allowed, so the first hit isn't silent. */
export function preloadSfx(): void {
  for (const n of ['card', 'card2', 'discard', 'cannon', 'cannon2', 'boom', 'armor', 'armor2', 'build', 'build2', 'spell', 'spell2', 'ward', 'burn', 'power', 'click', 'confirm', 'coin', 'turn', 'event', 'unlock', 'shuffle', 'slide', 'select', 'back', 'error', 'coins', 'creak'])
    load(n);
}

/** Play a recorded sound; returns false if it isn't loaded yet (so the caller can use a synth sound). */
function sample(name: string, vol = 0.8, rate = 1): boolean {
  const a = audio();
  if (!a || !master) return true; // muted: nothing to play either way
  const b = buffers.get(name);
  if (!b) {
    load(name);
    return false;
  }
  const src = a.createBufferSource();
  src.buffer = b;
  src.playbackRate.value = rate * (0.95 + Math.random() * 0.1); // slight variety
  const g = a.createGain();
  g.gain.value = vol * 2.4; // master is quiet (0.35); samples are already normalised
  src.connect(g).connect(master);
  src.start();
  return true;
}

const pick = (...names: string[]) => names[Math.floor(Math.random() * names.length)];

export const sfx = {
  card: () => sample(pick('card', 'card2'), 0.6) || noise(0, 0.18, 0.25, 600, 3000),
  discard: () => {
    if (sample('discard', 0.6)) return;
    noise(0, 0.15, 0.15, 2500, 500);
    tone(220, 0, 0.12, 'triangle', 0.15, 150);
  },
  build: () => {
    if (sample(pick('build', 'build2'), 0.8)) return;
    tone(330, 0.02, 0.09, 'square', 0.12);
    tone(495, 0.1, 0.12, 'square', 0.12);
  },
  /** Damage landing: a cannon blast, or a big boom for heavy hits. */
  hit: (big = false) => {
    if (sample(big ? 'boom' : pick('cannon', 'cannon2'), big ? 0.9 : 0.7)) return;
    tone(140, 0, 0.25, 'sine', 0.7, 45);
    noise(0, 0.22, 0.45, 400, 120);
  },
  /** Shots that only dent the armor plating. */
  armor: () => sample(pick('armor', 'armor2'), 0.7) || tone(300, 0, 0.1, 'square', 0.15, 200),
  magic: () => {
    if (sample(pick('spell', 'spell2'), 0.6)) return;
    [880, 1320, 1760].forEach((f, i) => tone(f, i * 0.05, 0.25, 'sine', 0.18));
  },
  ward: () => sample('ward', 0.6) || tone(1200, 0, 0.3, 'sine', 0.15, 1800),
  burn: () => sample('burn', 0.5) || noise(0, 0.5, 0.2, 800, 300),
  power: () => sample('power', 0.8) || [660, 880, 1320].forEach((f, i) => tone(f, i * 0.06, 0.2, 'square', 0.12)),
  coin: () => sample(pick('coin', 'coins'), 0.7) || tone(1600, 0, 0.08, 'triangle', 0.2),
  unlock: () => sample('unlock', 0.7) || [784, 988, 1175].forEach((f, i) => tone(f, i * 0.1, 0.3, 'triangle', 0.25)),
  confirm: () => sample('confirm', 0.6) || tone(880, 0, 0.08, 'triangle', 0.15),
  turn: () => sample('turn', 0.5),
  shuffle: () => sample('shuffle', 0.4),
  creak: () => sample('creak', 0.5),
  error: () => sample('error', 0.5) || tone(200, 0, 0.15, 'square', 0.1),
  event: () => {
    if (sample('event', 0.7)) return;
    tone(196, 0, 0.35, 'sawtooth', 0.12);
    tone(294, 0.18, 0.5, 'sawtooth', 0.12);
  },
  win: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.12, 0.4, 'triangle', 0.3)),
  lose: () => [392, 330, 262, 196].forEach((f, i) => tone(f, i * 0.16, 0.45, 'triangle', 0.3)),
  click: () => sample('click', 0.5) || tone(660, 0, 0.05, 'square', 0.08),
};
