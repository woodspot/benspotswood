// Sky Armada's sound: recorded effects from Kenney (kenney.nl, CC0 public domain) in public/sfx/,
// mixed through Web Audio with a little sky-wide echo, stereo placement (your ship on the left,
// theirs on the right) and synthesized low "boom" layers so big hits feel big. Between moves a
// quiet atmosphere plays: wind, the engine drone, creaking rigging, and thunder in stormy weather.
// Each effect falls back to a small synthesized sound until its file has loaded.

let ctx: AudioContext | null = null;
let master: GainNode | null = null; // → compressor → speakers
let fxBus: GainNode | null = null; // effects volume
let ambBus: GainNode | null = null; // atmosphere volume
let echo: GainNode | null = null; // send into the echo (reverb)

let muted = localStorage.getItem('keepfall.muted') === '1';
let fxVolume = Number(localStorage.getItem('keepfall.fxVol') ?? 0.8);
let ambVolume = Number(localStorage.getItem('keepfall.ambVol') ?? 0.5);

/** A short, soft, open-air echo: decaying stereo noise used as a reverb impulse. */
function impulse(a: AudioContext, seconds = 1.8): AudioBuffer {
  const len = Math.floor(a.sampleRate * seconds);
  const b = a.createBuffer(2, len, a.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = b.getChannelData(ch);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2);
  }
  return b;
}

function audio(): AudioContext | null {
  if (muted) return null;
  if (!ctx) {
    try {
      ctx = new AudioContext();
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -16;
      comp.ratio.value = 4;
      comp.connect(ctx.destination);
      master = ctx.createGain();
      master.gain.value = 0.9;
      master.connect(comp);
      fxBus = ctx.createGain();
      fxBus.gain.value = fxVolume;
      fxBus.connect(master);
      ambBus = ctx.createGain();
      ambBus.gain.value = ambVolume;
      ambBus.connect(master);
      const conv = ctx.createConvolver();
      conv.buffer = impulse(ctx);
      echo = ctx.createGain();
      echo.gain.value = 0.35;
      echo.connect(conv).connect(fxBus);
    } catch {
      return null;
    }
  }
  if (ctx.state !== 'running') void ctx.resume().catch(() => {});
  return ctx;
}

export const isMuted = () => muted;
export const getVolumes = () => ({ fx: fxVolume, amb: ambVolume });

export function setMuted(m: boolean): void {
  muted = m;
  localStorage.setItem('keepfall.muted', m ? '1' : '0');
  if (m) stopAmbience();
  void (m ? ctx?.suspend() : ctx?.resume());
}

export function setVolumes(fx: number, amb: number): void {
  fxVolume = fx;
  ambVolume = amb;
  localStorage.setItem('keepfall.fxVol', String(fx));
  localStorage.setItem('keepfall.ambVol', String(amb));
  if (fxBus) fxBus.gain.value = fx;
  if (ambBus) ambBus.gain.value = amb;
}

/** Call from a click handler so browsers allow audio to start. */
export function unlock(): void {
  if (audio()) preloadSfx();
}

// ── Building blocks ────────────────────────────────────────────

/** Where a sound sits left–right: your ship (0) on the left, theirs (1) on the right. */
const PAN = (side?: 0 | 1) => (side === undefined ? 0 : side === 0 ? -0.55 : 0.55);

function out(a: AudioContext, pan = 0, wet = 0): AudioNode {
  const p = a.createStereoPanner();
  p.pan.value = pan;
  p.connect(fxBus!);
  if (wet > 0 && echo) {
    const send = a.createGain();
    send.gain.value = wet;
    p.connect(send).connect(echo);
  }
  return p;
}

function tone(freq: number, start: number, dur: number, type: OscillatorType = 'sine', vol = 0.5, endFreq?: number, pan = 0): void {
  const a = audio();
  if (!a || !fxBus) return;
  const t = a.currentTime + start;
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (endFreq) o.frequency.exponentialRampToValueAtTime(endFreq, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(out(a, pan));
  o.start(t);
  o.stop(t + dur + 0.02);
}

function noiseBuffer(a: AudioContext, seconds: number): AudioBuffer {
  const buf = a.createBuffer(1, Math.ceil(a.sampleRate * seconds), a.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return buf;
}

function noise(start: number, dur: number, vol = 0.4, filterFreq = 1200, filterEnd?: number, pan = 0): void {
  const a = audio();
  if (!a || !fxBus) return;
  const t = a.currentTime + start;
  const src = a.createBufferSource();
  src.buffer = noiseBuffer(a, dur);
  const f = a.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.setValueAtTime(filterFreq, t);
  if (filterEnd) f.frequency.exponentialRampToValueAtTime(filterEnd, t + dur);
  const g = a.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(g).connect(out(a, pan));
  src.start(t);
}

/** The weight under a big hit: a falling sub-bass thump plus a low rumble of noise. */
function thump(power: number, pan = 0, delay = 0): void {
  const a = audio();
  if (!a || !fxBus) return;
  const t = a.currentTime + delay;
  const o = a.createOscillator();
  const g = a.createGain();
  o.frequency.setValueAtTime(90, t);
  o.frequency.exponentialRampToValueAtTime(32, t + 0.5);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.5 * power, t + 0.015);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.7);
  o.connect(g).connect(out(a, pan, 0.4));
  o.start(t);
  o.stop(t + 0.75);
  const src = a.createBufferSource();
  src.buffer = noiseBuffer(a, 1.2);
  const f = a.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.setValueAtTime(500, t);
  f.frequency.exponentialRampToValueAtTime(80, t + 1.1);
  const ng = a.createGain();
  ng.gain.setValueAtTime(0.35 * power, t);
  ng.gain.exponentialRampToValueAtTime(0.0001, t + 1.15);
  src.connect(f).connect(ng).connect(out(a, pan, 0.5));
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

const ALL = [
  'card', 'card2', 'discard', 'cannon', 'cannon2', 'cannon3', 'cannon4', 'boom', 'boom2', 'armor', 'armor2', 'armor3',
  'iron1', 'iron2', 'iron3', 'iron4', 'aether1', 'aether2', 'aether3', 'zap', 'zap2', 'spell', 'spell2', 'ward', 'burn',
  'module', 'module2', 'power', 'click', 'confirm', 'coin', 'coins', 'turn', 'event', 'unlock', 'shuffle', 'slide',
  'select', 'back', 'error', 'bell', 'creak', 'creak2', 'creak3', 'drone',
];

/** Fetch every sound as soon as audio is allowed, so nothing is silent the first time. */
export function preloadSfx(): void {
  for (const n of ALL) load(n);
}

interface Play {
  vol?: number;
  rate?: number;
  pan?: number;
  wet?: number; // how much echo
  delay?: number;
  bus?: 'fx' | 'amb';
}

/** Play a recorded sound with a little natural variety; false if it isn't loaded yet. */
function sample(name: string, o: Play = {}): boolean {
  const a = audio();
  if (!a || !fxBus) return true; // muted: nothing to play either way
  const b = buffers.get(name);
  if (!b) {
    load(name);
    return false;
  }
  const src = a.createBufferSource();
  src.buffer = b;
  src.playbackRate.value = (o.rate ?? 1) * (0.93 + Math.random() * 0.14);
  const g = a.createGain();
  g.gain.value = (o.vol ?? 0.8) * (0.85 + Math.random() * 0.15);
  if (o.bus === 'amb') {
    const p = a.createStereoPanner();
    p.pan.value = o.pan ?? 0;
    src.connect(g).connect(p).connect(ambBus!);
  } else src.connect(g).connect(out(a, o.pan ?? 0, o.wet ?? 0.15));
  src.start(a.currentTime + (o.delay ?? 0));
  return true;
}

const pick = (...names: string[]) => names[Math.floor(Math.random() * names.length)];

// ── The effects ────────────────────────────────────────────────

export const sfx = {
  card: () => sample(pick('card', 'card2'), { vol: 0.55, wet: 0.05 }) || noise(0, 0.18, 0.25, 600, 3000),
  discard: () => {
    if (sample('discard', { vol: 0.55, wet: 0.05 })) return;
    noise(0, 0.15, 0.15, 2500, 500);
    tone(220, 0, 0.12, 'triangle', 0.15, 150);
  },
  /** Shipwright work on a ship (Armor or Altitude going up): hammer blows and a rivet. */
  build: (side: 0 | 1 = 0) => {
    const pan = PAN(side);
    if (!sample(pick('iron1', 'iron4'), { vol: 0.6, pan })) {
      tone(330, 0.02, 0.09, 'square', 0.12, undefined, pan);
      tone(495, 0.1, 0.12, 'square', 0.12, undefined, pan);
      return;
    }
    sample('iron3', { vol: 0.5, pan, delay: 0.14 });
    sample('iron2', { vol: 0.4, pan, delay: 0.3, rate: 1.1 });
  },
  /** A module being fitted aboard: a latch and a heavy clunk. */
  module: (side: 0 | 1 = 0) => {
    const pan = PAN(side);
    if (!sample('module', { vol: 0.7, pan })) return tone(220, 0, 0.2, 'square', 0.12, 160, pan);
    sample('module2', { vol: 0.5, pan, delay: 0.12, rate: 0.8 });
    thump(0.3, pan, 0.12);
  },
  /** Cannon fire landing on a ship: heavier hits get a deeper boom and more echo. */
  hit: (amount = 5, side: 0 | 1 = 1) => {
    const pan = PAN(side);
    const power = Math.min(1.4, 0.45 + amount / 12);
    if (!sample(pick('cannon', 'cannon2', 'cannon3', 'cannon4'), { vol: 0.55 + power * 0.25, pan, wet: 0.3, rate: amount >= 10 ? 0.85 : 1 })) {
      tone(140, 0, 0.25, 'sine', 0.7, 45, pan);
      noise(0, 0.22, 0.45, 400, 120, pan);
    }
    thump(power, pan);
    if (amount >= 10) sample(pick('boom', 'boom2'), { vol: 0.7, pan, wet: 0.5, delay: 0.08, rate: 0.9 });
  },
  /** Spells striking a ship directly (Aether attacks): a crackling zap and a thump. */
  spell: (amount = 4, side: 0 | 1 = 1) => {
    const pan = PAN(side);
    if (!sample(pick('zap', 'zap2'), { vol: 0.7, pan, wet: 0.35 })) tone(1200, 0, 0.3, 'sawtooth', 0.15, 200, pan);
    thump(Math.min(1, 0.3 + amount / 14), pan, 0.05);
  },
  /** Shots that only dent the armor plating: clanging metal. */
  armor: (side: 0 | 1 = 1) => {
    const pan = PAN(side);
    if (!sample(pick('armor', 'armor2', 'armor3'), { vol: 0.7, pan, wet: 0.25 })) tone(300, 0, 0.1, 'square', 0.15, 200, pan);
    thump(0.35, pan);
  },
  /** Casting an Aether card: a rising shimmer. */
  magic: (side: 0 | 1 = 0) => {
    if (sample(pick('aether1', 'aether2', 'aether3'), { vol: 0.5, pan: PAN(side) * 0.6, wet: 0.4 })) return;
    [880, 1320, 1760].forEach((f, i) => tone(f, i * 0.05, 0.25, 'sine', 0.18));
  },
  ward: (side: 0 | 1 = 0) => sample('ward', { vol: 0.55, pan: PAN(side), wet: 0.4 }) || tone(1200, 0, 0.3, 'sine', 0.15, 1800),
  burn: (side: 0 | 1 = 0) => sample('burn', { vol: 0.45, pan: PAN(side), wet: 0.2 }) || noise(0, 0.5, 0.2, 800, 300),
  power: () => {
    if (!sample('power', { vol: 0.75, wet: 0.3 })) [660, 880, 1320].forEach((f, i) => tone(f, i * 0.06, 0.2, 'square', 0.12));
    sample('aether3', { vol: 0.35, delay: 0.05, rate: 0.8, wet: 0.4 });
  },
  /** The ship's bell: your turn begins. */
  bell: () => sample('bell', { vol: 0.35, wet: 0.45, rate: 1.25 }),
  coin: () => sample(pick('coin', 'coins'), { vol: 0.6 }) || tone(1600, 0, 0.08, 'triangle', 0.2),
  unlock: () => sample('unlock', { vol: 0.6, wet: 0.3 }) || [784, 988, 1175].forEach((f, i) => tone(f, i * 0.1, 0.3, 'triangle', 0.25)),
  confirm: () => sample('confirm', { vol: 0.5, wet: 0 }) || tone(880, 0, 0.08, 'triangle', 0.15),
  turn: () => sample('turn', { vol: 0.4, wet: 0 }),
  shuffle: () => sample('shuffle', { vol: 0.35, wet: 0 }),
  creak: () => sample(pick('creak', 'creak2', 'creak3'), { vol: 0.4 }),
  error: () => sample('error', { vol: 0.45, wet: 0 }) || tone(200, 0, 0.15, 'square', 0.1),
  /** The weather changes: a gust, and rolling thunder if it's stormy. */
  event: (stormy = false) => {
    gust(0.5);
    if (stormy) thunder();
    else if (!sample('event', { vol: 0.5, wet: 0.2 })) {
      tone(196, 0, 0.35, 'sawtooth', 0.12);
      tone(294, 0.18, 0.5, 'sawtooth', 0.12);
    }
  },
  win: () => {
    [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.12, 0.45, 'triangle', 0.3));
    setTimeout(() => sample('bell', { vol: 0.4, wet: 0.5 }), 500);
  },
  lose: () => {
    [392, 330, 262, 196].forEach((f, i) => tone(f, i * 0.16, 0.5, 'triangle', 0.3));
    thump(0.6, 0, 0.6);
  },
  click: () => sample('click', { vol: 0.45, wet: 0 }) || tone(660, 0, 0.05, 'square', 0.08),
};

// ── Atmosphere: wind, the engines, creaking rigging, thunder ───

let ambience: { stop: () => void } | null = null;
let stormy = false;

/** A gust of wind that swells and fades. */
function gust(strength = 0.4): void {
  const a = audio();
  if (!a || !ambBus) return;
  const t = a.currentTime;
  const src = a.createBufferSource();
  src.buffer = noiseBuffer(a, 3);
  const f = a.createBiquadFilter();
  f.type = 'bandpass';
  f.Q.value = 0.7;
  f.frequency.setValueAtTime(300, t);
  f.frequency.linearRampToValueAtTime(900, t + 1.2);
  f.frequency.linearRampToValueAtTime(350, t + 2.8);
  const g = a.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(0.25 * strength, t + 1);
  g.gain.linearRampToValueAtTime(0.0001, t + 2.9);
  src.connect(f).connect(g).connect(ambBus);
  src.start(t);
}

/** Distant rolling thunder. */
function thunder(): void {
  const a = audio();
  if (!a || !ambBus) return;
  const pan = Math.random() * 1.4 - 0.7;
  if (!sample(pick('boom', 'boom2'), { vol: 0.5, rate: 0.55, pan, bus: 'amb' })) thump(0.6, pan);
  setTimeout(() => sample('boom2', { vol: 0.3, rate: 0.45, pan: -pan, bus: 'amb' }), 450);
}

/** Start the background atmosphere for a battle (quiet; volume in the sound settings). */
export function startAmbience(): void {
  stopAmbience();
  const a = audio();
  if (!a || !ambBus) return;
  const t = a.currentTime;
  // Steady wind: looping filtered noise whose pitch drifts slowly.
  const wind = a.createBufferSource();
  wind.buffer = noiseBuffer(a, 4);
  wind.loop = true;
  const wf = a.createBiquadFilter();
  wf.type = 'bandpass';
  wf.Q.value = 0.6;
  wf.frequency.value = 420;
  const lfo = a.createOscillator();
  lfo.frequency.value = 0.07;
  const lfoGain = a.createGain();
  lfoGain.gain.value = 180;
  lfo.connect(lfoGain).connect(wf.frequency);
  const wg = a.createGain();
  wg.gain.setValueAtTime(0.0001, t);
  wg.gain.linearRampToValueAtTime(0.09, t + 2);
  wind.connect(wf).connect(wg).connect(ambBus);
  wind.start(t);
  lfo.start(t);
  // The engines: a low, looping drone.
  let drone: AudioBufferSourceNode | null = null;
  const dg = a.createGain();
  dg.gain.setValueAtTime(0.0001, t);
  dg.gain.linearRampToValueAtTime(0.14, t + 3);
  dg.connect(ambBus);
  const startDrone = () => {
    const b = buffers.get('drone');
    if (!b || drone) return;
    drone = a.createBufferSource();
    drone.buffer = b;
    drone.loop = true;
    drone.playbackRate.value = 0.8;
    const lp = a.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 700;
    drone.connect(lp).connect(dg);
    drone.start();
  };
  if (buffers.get('drone')) startDrone();
  else load('drone');
  // Now and then: a creak of the rigging, a gust, or thunder when the weather is stormy.
  const timers: number[] = [];
  const every = (min: number, max: number, fn: () => void) => {
    const go = () => {
      timers.push(window.setTimeout(() => {
        fn();
        go();
      }, min + Math.random() * (max - min)));
    };
    go();
  };
  every(6000, 14000, () => {
    startDrone();
    sample(pick('creak', 'creak2', 'creak3'), { vol: 0.5, rate: 0.85 + Math.random() * 0.3, pan: Math.random() * 1.2 - 0.6, bus: 'amb' });
  });
  every(9000, 18000, () => gust(0.6));
  every(10000, 22000, () => stormy && thunder());
  ambience = {
    stop: () => {
      timers.forEach(clearTimeout);
      const now = a.currentTime;
      wg.gain.cancelScheduledValues(now);
      wg.gain.setValueAtTime(wg.gain.value, now);
      wg.gain.linearRampToValueAtTime(0.0001, now + 0.8);
      dg.gain.cancelScheduledValues(now);
      dg.gain.setValueAtTime(dg.gain.value, now);
      dg.gain.linearRampToValueAtTime(0.0001, now + 0.8);
      setTimeout(() => {
        try {
          wind.stop();
          lfo.stop();
          drone?.stop();
        } catch {
          /* already stopped */
        }
      }, 900);
    },
  };
}

export function stopAmbience(): void {
  ambience?.stop();
  ambience = null;
}

/** Stormy weather brings thunder to the atmosphere. */
export function setStormy(on: boolean): void {
  stormy = on;
}
