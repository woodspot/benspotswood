// Dentist sounds, made with Web Audio: the drill's whirr, the water spray, brushing, a squishy
// filling and a germ's squeak.
import { audioCtx } from '../kids/audio';

let noiseBuf: AudioBuffer | null = null;
function noise(ctx: AudioContext): AudioBuffer {
  if (noiseBuf && noiseBuf.sampleRate === ctx.sampleRate) return noiseBuf;
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return noiseBuf;
}

/** A sound that runs while a tool is held (drill or spray). */
interface Loop { stop: () => void; set: (busy: boolean) => void }

function drillLoop(ctx: AudioContext): Loop {
  const t = ctx.currentTime;
  const o = ctx.createOscillator();
  o.type = 'sawtooth';
  o.frequency.setValueAtTime(380, t);
  const lfo = ctx.createOscillator();
  const depth = ctx.createGain();
  lfo.frequency.value = 38;
  depth.gain.value = 14;
  lfo.connect(depth).connect(o.frequency);
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 1600;
  bp.Q.value = 3;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.07, t + 0.12);
  o.connect(bp).connect(g).connect(ctx.destination);
  o.start(t);
  lfo.start(t);
  return {
    set: (busy) => {
      const now = ctx.currentTime;
      // Higher and louder when it's working on a tooth.
      o.frequency.setTargetAtTime(busy ? 520 : 380, now, 0.06);
      bp.frequency.setTargetAtTime(busy ? 2300 : 1600, now, 0.06);
      g.gain.setTargetAtTime(busy ? 0.1 : 0.06, now, 0.06);
    },
    stop: () => {
      const now = ctx.currentTime;
      g.gain.cancelScheduledValues(now);
      g.gain.setTargetAtTime(0.0001, now, 0.05);
      o.frequency.setTargetAtTime(150, now, 0.08);
      o.stop(now + 0.4);
      lfo.stop(now + 0.4);
    },
  };
}

function sprayLoop(ctx: AudioContext): Loop {
  const t = ctx.currentTime;
  const src = ctx.createBufferSource();
  src.buffer = noise(ctx);
  src.loop = true;
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 2200;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.09, t + 0.08);
  src.connect(hp).connect(g).connect(ctx.destination);
  src.start(t);
  return {
    set: () => {},
    stop: () => {
      const now = ctx.currentTime;
      g.gain.setTargetAtTime(0.0001, now, 0.05);
      src.stop(now + 0.4);
    },
  };
}

let loop: Loop | null = null;
export function startLoop(kind: 'drill' | 'spray'): void {
  stopLoop();
  const ctx = audioCtx();
  if (!ctx) return;
  loop = kind === 'drill' ? drillLoop(ctx) : sprayLoop(ctx);
}
export const loopBusy = (busy: boolean) => loop?.set(busy);
export function stopLoop(): void {
  loop?.stop();
  loop = null;
}

let lastBrush = 0;
/** A little scrub-scrub while brushing (not too often). */
export function brushSound(): void {
  const ctx = audioCtx();
  if (!ctx || performance.now() - lastBrush < 110) return;
  lastBrush = performance.now();
  const t = ctx.currentTime;
  const src = ctx.createBufferSource();
  src.buffer = noise(ctx);
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 3200 + Math.random() * 1200;
  bp.Q.value = 1.2;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.12, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
  src.connect(bp).connect(g).connect(ctx.destination);
  src.start(t, Math.random() * 0.5);
  src.stop(t + 0.12);
}

function sweep(from: number, to: number, dur: number, type: OscillatorType, vol: number): void {
  const ctx = audioCtx();
  if (!ctx) return;
  const t = ctx.currentTime;
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(from, t);
  o.frequency.exponentialRampToValueAtTime(to, t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(ctx.destination);
  o.start(t);
  o.stop(t + dur + 0.05);
}

/** The filling going in: a soft squish. */
export const squish = () => sweep(420, 140, 0.25, 'triangle', 0.25);
/** A germ, washed away: "eek!" */
export function eek(): void {
  sweep(900, 2100, 0.12, 'square', 0.06);
  setTimeout(() => sweep(1800, 2600, 0.1, 'square', 0.05), 120);
}
/** A sparkly "ting" when a tooth is fixed. */
export function ting(n = 0): void {
  const base = 1046 * Math.pow(2, (n % 5) / 12 * 2);
  sweep(base, base * 1.01, 0.5, 'sine', 0.18);
  setTimeout(() => sweep(base * 1.5, base * 1.5, 0.4, 'sine', 0.1), 70);
}
