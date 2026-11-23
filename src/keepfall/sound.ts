// Tiny synthesized sound effects (Web Audio) — no audio files to download or license.

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
  audio();
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

export const sfx = {
  card: () => noise(0, 0.18, 0.25, 600, 3000),
  discard: () => {
    noise(0, 0.15, 0.15, 2500, 500);
    tone(220, 0, 0.12, 'triangle', 0.15, 150);
  },
  build: () => {
    tone(330, 0.02, 0.09, 'square', 0.12);
    tone(495, 0.1, 0.12, 'square', 0.12);
  },
  hit: () => {
    tone(140, 0, 0.25, 'sine', 0.7, 45);
    noise(0, 0.22, 0.45, 400, 120);
  },
  magic: () => {
    [880, 1320, 1760].forEach((f, i) => tone(f, i * 0.05, 0.25, 'sine', 0.18));
  },
  event: () => {
    tone(196, 0, 0.35, 'sawtooth', 0.12);
    tone(294, 0.18, 0.5, 'sawtooth', 0.12);
  },
  win: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.12, 0.4, 'triangle', 0.3)),
  lose: () => [392, 330, 262, 196].forEach((f, i) => tone(f, i * 0.16, 0.45, 'triangle', 0.3)),
  click: () => tone(660, 0, 0.05, 'square', 0.08),
};
