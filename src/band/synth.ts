// The band's instruments, made with Web Audio (no sound files): a plucked guitar string, a bell-like
// xylophone, a soft piano, a brassy trumpet, drums and maracas. Everything goes through one gentle
// compressor so lots of taps at once never get too loud.
import { audioCtx } from '../kids/audio';
import { freq, type DrumHit, type InstrumentId } from './game';

let out: AudioNode | null = null;
let outCtx: AudioContext | null = null;

function master(ctx: AudioContext): AudioNode {
  if (out && outCtx === ctx) return out;
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -14;
  comp.ratio.value = 6;
  const g = ctx.createGain();
  g.gain.value = 0.9;
  comp.connect(g).connect(ctx.destination);
  out = comp;
  outCtx = ctx;
  return comp;
}

function env(ctx: AudioContext, t: number, attack: number, peak: number, decay: number): GainNode {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  return g;
}

function osc(ctx: AudioContext, type: OscillatorType, f: number, t: number, dur: number, dest: AudioNode): OscillatorNode {
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(f, t);
  o.connect(dest);
  o.start(t);
  o.stop(t + dur + 0.05);
  return o;
}

const noiseCache = new WeakMap<AudioContext, AudioBuffer>();
function noise(ctx: AudioContext): AudioBuffer {
  let b = noiseCache.get(ctx);
  if (!b) {
    b = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    noiseCache.set(ctx, b);
  }
  return b;
}

function burstOf(ctx: AudioContext, t: number, dur: number, filter: BiquadFilterType, fq: number, vol: number, dest: AudioNode): void {
  const src = ctx.createBufferSource();
  src.buffer = noise(ctx);
  const f = ctx.createBiquadFilter();
  f.type = filter;
  f.frequency.value = fq;
  const g = env(ctx, t, 0.003, vol, dur);
  src.connect(f).connect(g).connect(dest);
  src.start(t, Math.random() * 0.5);
  src.stop(t + dur + 0.05);
}

/** Karplus–Strong: a burst of noise fed round a short delay line sounds like a plucked string. */
const strings = new Map<string, AudioBuffer>();
function pluck(ctx: AudioContext, f: number): AudioBuffer {
  const key = `${ctx.sampleRate}|${f.toFixed(2)}`;
  let b = strings.get(key);
  if (b) return b;
  const len = Math.floor(ctx.sampleRate * 1.6);
  b = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = b.getChannelData(0);
  const n = Math.max(2, Math.round(ctx.sampleRate / f));
  const ring = new Float32Array(n);
  for (let i = 0; i < n; i++) ring[i] = Math.random() * 2 - 1;
  for (let i = 0; i < len; i++) {
    const k = i % n;
    const v = ring[k];
    ring[k] = 0.4985 * (v + ring[(k + 1) % n]);
    d[i] = v * 0.6;
  }
  strings.set(key, b);
  return b;
}

/** Play one note (MIDI number) on an instrument, `at` seconds from now. */
export function playNote(inst: Exclude<InstrumentId, 'drum' | 'maracas'>, midi: number, at = 0, vol = 1): void {
  const ctx = audioCtx();
  if (!ctx) return;
  const dest = master(ctx);
  const t = ctx.currentTime + at + 0.005;
  const f = freq(midi);
  switch (inst) {
    case 'xylophone': {
      const g = env(ctx, t, 0.003, 0.5 * vol, 0.9);
      g.connect(dest);
      osc(ctx, 'sine', f, t, 1, g);
      const g2 = env(ctx, t, 0.002, 0.12 * vol, 0.25);
      g2.connect(dest);
      osc(ctx, 'sine', f * 3.93, t, 0.3, g2); // the bright "tink" of a wooden bar
      break;
    }
    case 'piano': {
      const g = env(ctx, t, 0.006, 0.4 * vol, 1.4);
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.setValueAtTime(f * 6, t);
      lp.frequency.exponentialRampToValueAtTime(f * 2, t + 1);
      g.connect(lp).connect(dest);
      osc(ctx, 'triangle', f, t, 1.5, g);
      const o2 = osc(ctx, 'sawtooth', f * 2, t, 1.5, g);
      o2.detune.value = 4;
      break;
    }
    case 'guitar': {
      const src = ctx.createBufferSource();
      src.buffer = pluck(ctx, f);
      const g = ctx.createGain();
      g.gain.value = 0.9 * vol;
      src.connect(g).connect(dest);
      src.start(t);
      break;
    }
    case 'trumpet': {
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.32 * vol, t + 0.04);
      g.gain.setValueAtTime(0.28 * vol, t + 0.3);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.55);
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.Q.value = 2;
      lp.frequency.setValueAtTime(700, t);
      lp.frequency.exponentialRampToValueAtTime(2600, t + 0.06);
      lp.frequency.exponentialRampToValueAtTime(1400, t + 0.4);
      g.connect(lp).connect(dest);
      const o = osc(ctx, 'sawtooth', f, t, 0.6, g);
      // A little wobble, like a real player.
      const lfo = ctx.createOscillator();
      const depth = ctx.createGain();
      lfo.frequency.value = 5.5;
      depth.gain.value = 6;
      lfo.connect(depth).connect(o.detune);
      lfo.start(t + 0.15);
      lfo.stop(t + 0.65);
      break;
    }
  }
}

/** A drum sound, `at` seconds from now. */
export function playDrum(hit: DrumHit, at = 0, vol = 1): void {
  const ctx = audioCtx();
  if (!ctx) return;
  const dest = master(ctx);
  const t = ctx.currentTime + at + 0.005;
  switch (hit) {
    case 'kick': {
      const g = env(ctx, t, 0.002, 0.9 * vol, 0.4);
      g.connect(dest);
      const o = osc(ctx, 'sine', 140, t, 0.45, g);
      o.frequency.exponentialRampToValueAtTime(45, t + 0.3);
      break;
    }
    case 'snare': {
      burstOf(ctx, t, 0.18, 'highpass', 1200, 0.5 * vol, dest);
      const g = env(ctx, t, 0.002, 0.3 * vol, 0.1);
      g.connect(dest);
      osc(ctx, 'triangle', 190, t, 0.12, g);
      break;
    }
    case 'tom': {
      const g = env(ctx, t, 0.002, 0.7 * vol, 0.35);
      g.connect(dest);
      const o = osc(ctx, 'sine', 220, t, 0.4, g);
      o.frequency.exponentialRampToValueAtTime(110, t + 0.3);
      break;
    }
    case 'hat':
      burstOf(ctx, t, 0.05, 'highpass', 7000, 0.25 * vol, dest);
      break;
    case 'crash':
      burstOf(ctx, t, 1.1, 'highpass', 4000, 0.35 * vol, dest);
      playDrum('kick', at, vol);
      break;
  }
}

/** Two quick shakes of the maracas. */
export function playMaracas(at = 0, vol = 1): void {
  const ctx = audioCtx();
  if (!ctx) return;
  const dest = master(ctx);
  const t = ctx.currentTime + at + 0.005;
  burstOf(ctx, t, 0.07, 'bandpass', 5500, 0.6 * vol, dest);
  burstOf(ctx, t + 0.12, 0.09, 'bandpass', 5000, 0.5 * vol, dest);
}

// ── The beat: a gentle drum and bass loop to play along with ───

let beatTimer = 0;
let nextAt = 0;
let step = 0;
const BPM = 100;
const STEP = 60 / BPM / 2; // eighth notes
const BASS = [36, 36, 43, 43, 33, 33, 43, 43]; // C C G G A A G G, one per beat

export const beatOn = () => beatTimer !== 0;

/** Start or stop the beat. Notes are scheduled a little ahead so they stay in time. */
export function setBeat(on: boolean): void {
  clearInterval(beatTimer);
  beatTimer = 0;
  const ctx = audioCtx();
  if (!on || !ctx) return;
  nextAt = ctx.currentTime + 0.1;
  step = 0;
  beatTimer = window.setInterval(() => {
    while (nextAt < ctx.currentTime + 0.25) {
      const at = nextAt - ctx.currentTime;
      if (step % 4 === 0) playDrum('kick', at, 0.6);
      if (step % 4 === 2) playDrum('snare', at, 0.35);
      playDrum('hat', at, 0.5);
      if (step % 2 === 0) playBass(BASS[(step / 2) % BASS.length], at);
      nextAt += STEP;
      step++;
    }
  }, 50);
}

function playBass(midi: number, at: number): void {
  const ctx = audioCtx();
  if (!ctx) return;
  const t = ctx.currentTime + at + 0.005;
  const g = env(ctx, t, 0.01, 0.35, 0.35);
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 500;
  g.connect(lp).connect(master(ctx));
  osc(ctx, 'triangle', freq(midi), t, 0.4, g);
}
