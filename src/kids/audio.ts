// Sounds are synthesised (no files to load). Speech uses, in order of preference:
//   1. a family recording (Toy Phone plays those itself with playBlob),
//   2. a pre-recorded natural voice clip from /voice/ (see scripts/gen-voices.mjs),
//   3. the device's built-in speech.
// Audio needs a first tap before it works on iPhone and iPad, so unlock() runs on the Play button.

let ctx: AudioContext | null = null;

// Recordings play through one shared <audio> player. iPhone/iPad only allow an audio player to
// start from a tap, but once a player has played during a tap it can play again later (e.g. when
// Grandma "answers" a few seconds after the call button). unlock() does that first play.
let player: HTMLAudioElement | null = null;
let silentUrl = '';

/** A tiny silent WAV, used to unlock the audio player. */
function silence(): string {
  if (silentUrl) return silentUrl;
  const n = 800; // 0.1 s at 8 kHz
  const buf = new ArrayBuffer(44 + n * 2);
  const v = new DataView(buf);
  const w = (o: number, t: string) => [...t].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  w(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); w(8, 'WAVEfmt '); v.setUint32(16, 16, true);
  v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, 8000, true); v.setUint32(28, 16000, true);
  v.setUint16(32, 2, true); v.setUint16(34, 16, true); w(36, 'data'); v.setUint32(40, n * 2, true);
  silentUrl = URL.createObjectURL(new Blob([buf], { type: 'audio/wav' }));
  return silentUrl;
}

export function unlock(): void {
  ctx ??= new AudioContext();
  if (ctx.state !== 'running') void ctx.resume().catch(() => {});
  player ??= new Audio();
  if (player.paused) {
    player.src = silence();
    void player.play().catch(() => {});
  }
  // iOS only lets speech start from a tap; an empty utterance opens the door.
  if ('speechSynthesis' in window) speechSynthesis.speak(new SpeechSynthesisUtterance(''));
}

/** iOS can pause the sound engine (e.g. after the microphone was used); wake it before playing. */
async function wake(): Promise<void> {
  if (ctx && ctx.state !== 'running') await ctx.resume().catch(() => {});
}

/** One note: frequency (Hz), start delay and length (seconds). */
export function tone(freq: number, start: number, dur: number, type: OscillatorType = 'sine', vol = 0.25): void {
  if (!ctx) return;
  const t = ctx.currentTime + start;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(ctx.destination);
  o.start(t);
  o.stop(t + dur + 0.05);
}

export const sfx = {
  /** A balloon pop: a short burst of noise with a falling squeak. */
  pop(): void {
    if (!ctx) return;
    const t = ctx.currentTime;
    const len = Math.floor(ctx.sampleRate * 0.12);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const g = ctx.createGain();
    g.gain.value = 0.55;
    src.connect(g).connect(ctx.destination);
    src.start(t);
    const o = ctx.createOscillator();
    const og = ctx.createGain();
    o.frequency.setValueAtTime(900, t);
    o.frequency.exponentialRampToValueAtTime(200, t + 0.12);
    og.gain.setValueAtTime(0.15, t);
    og.gain.exponentialRampToValueAtTime(0.0001, t + 0.14);
    o.connect(og).connect(ctx.destination);
    o.start(t);
    o.stop(t + 0.16);
  },
  /** Right answer: a happy rising arpeggio. */
  yay(): void {
    [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.08 + i * 0.08, 0.3, 'triangle', 0.22));
  },
  /** One step of counting: the note climbs with the count. */
  count(n: number): void {
    tone([0, 523, 587, 659, 698, 784][Math.min(n, 5)], 0.05, 0.35, 'triangle', 0.25);
  },
  /** Not the one asked for: a soft, friendly boop (never a buzzer). */
  boop(): void {
    tone(330, 0.04, 0.22, 'sine', 0.18);
  },
  /** A card turning over: a real card sound (Kenney, CC0), or two quick notes until it loads. */
  flip(): void {
    if (playSample(Math.random() < 0.5 ? 'card' : 'card2', 0.7)) return;
    tone(660, 0, 0.08, 'triangle', 0.12);
    tone(880, 0.05, 0.08, 'triangle', 0.1);
  },
  /** A pair found: two bright notes. */
  match(): void {
    tone(784, 0.05, 0.25, 'triangle', 0.22);
    tone(1175, 0.17, 0.35, 'triangle', 0.22);
  },
  /** The big celebration. */
  fanfare(): void {
    [523, 659, 784, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.13, 0.32, 'triangle', 0.24));
  },
};

// Voices: the best natural-sounding one the device has, per language and gender (see voices.ts).
import { clipKey, en, VOICE_GENDER, type Lang, type Part } from './words';
import { pickVoice, type Gender } from './voices';
export { en, es, type Lang, type Part } from './words';

const cache = new Map<string, SpeechSynthesisVoice | null>();
function voiceFor(lang: Lang, gender: Gender): SpeechSynthesisVoice | null {
  const key = `${lang}-${gender}`;
  if (!cache.has(key)) cache.set(key, pickVoice(speechSynthesis.getVoices(), lang, gender));
  return cache.get(key) ?? null;
}
if ('speechSynthesis' in window) {
  // Voices load late on some devices; start again when they arrive.
  speechSynthesis.addEventListener?.('voiceschanged', () => cache.clear());
}

let voiceOn = (localStorage.getItem('kids.voice') ?? localStorage.getItem('balloons.voice')) !== 'off';
export const isVoiceOn = () => voiceOn;
export function setVoiceOn(on: boolean): void {
  voiceOn = on;
  localStorage.setItem('kids.voice', on ? 'on' : 'off');
  if (!on) stopSpeech();
}

// ── Pre-recorded clips ─────────────────────────────────────────

let manifest: Record<string, string> = {};
void fetch('/voice/manifest.json')
  .then((r) => (r.ok ? r.json() : {}))
  .then((m) => (manifest = m))
  .catch(() => {});

const buffers = new Map<string, Promise<AudioBuffer | null>>();
function bufferFor(url: string): Promise<AudioBuffer | null> {
  if (!ctx) return Promise.resolve(null);
  const c = ctx;
  let b = buffers.get(url);
  if (!b) {
    b = fetch(url)
      .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(String(r.status)))))
      .then((data) => c.decodeAudioData(data))
      .catch(() => null);
    buffers.set(url, b);
  }
  return b;
}
const clipUrl = (p: Part) => {
  const f = manifest[clipKey(p)];
  return f ? `/voice/${f}` : null;
};

/** Play a recorded sound effect from /sfx/ (loads it the first time; returns false until loaded). */
const loadedSfx = new Map<string, AudioBuffer | null>();
function playSample(name: string, vol = 0.8): boolean {
  if (!ctx) return false;
  const b = loadedSfx.get(name);
  if (b === undefined) {
    loadedSfx.set(name, null);
    void bufferFor(`/sfx/${name}.mp3`).then((buf) => loadedSfx.set(name, buf));
    return false;
  }
  if (!b) return false;
  const src = ctx.createBufferSource();
  src.buffer = b;
  const g = ctx.createGain();
  g.gain.value = vol;
  src.connect(g).connect(ctx.destination);
  src.start();
  return true;
}

/** Fetch clips ahead of time (e.g. the keypad numbers) so the first tap has no delay. */
export function preload(parts: Part[]): void {
  for (const p of parts) {
    const url = clipUrl(p);
    if (url) void bufferFor(url);
  }
}

// ── Speaking, one part after another ───────────────────────────

let seq = 0; // bumps on every new line, so older lines stop
let source: AudioBufferSourceNode | null = null;

export function stopSpeech(): void {
  seq++;
  try {
    source?.stop();
  } catch {
    /* already stopped */
  }
  source = null;
  // Leave the silent unlock clip alone: cutting it off can leave the player locked on iPhone.
  if (player && !player.paused && player.src !== silentUrl) player.pause();
  if ('speechSynthesis' in window) speechSynthesis.cancel();
}

async function playBuffer(buf: AudioBuffer, my: number, rate = 1): Promise<void> {
  await wake();
  return new Promise((resolve) => {
    if (!ctx || my !== seq) return resolve();
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = rate;
    const g = ctx.createGain();
    g.gain.value = 0.95;
    src.connect(g).connect(ctx.destination);
    src.onended = () => resolve();
    source = src;
    src.start();
  });
}

function speakDevice(p: Part, my: number): Promise<void> {
  return new Promise((resolve) => {
    if (!('speechSynthesis' in window) || my !== seq) return resolve();
    const u = new SpeechSynthesisUtterance(p.text);
    const v = voiceFor(p.lang, VOICE_GENDER[p.voice ?? 'female']);
    u.lang = v?.lang ?? (p.lang === 'es' ? 'es-MX' : 'en-US');
    if (v) u.voice = v;
    // Learning words a touch slower. Pitch stays close to 1: big pitch shifts sound robotic.
    u.rate = p.rate ?? (p.lang === 'es' ? 0.88 : 0.95);
    u.pitch = p.pitch ?? 1;
    u.volume = 0.85;
    // Some devices never fire "end"; don't wait forever.
    const timer = setTimeout(resolve, 1500 + p.text.length * 110);
    u.onend = u.onerror = () => {
      clearTimeout(timer);
      resolve();
    };
    speechSynthesis.speak(u);
  });
}

/**
 * Say something, cutting off whatever was being said. Mixed-language lines are spoken part by part.
 * Resolves when it has finished (or been cut off), e.g. to stop a "talking" animation.
 */
export async function say(line: string | Part[]): Promise<void> {
  if (!voiceOn) return;
  const parts = (typeof line === 'string' ? [en(line)] : line).filter((p) => p.text);
  if (!parts.length) return;
  stopSpeech();
  const my = seq;
  // Start fetching every clip at once so there are no gaps between parts.
  const pending = parts.map((p) => {
    const url = clipUrl(p);
    return url ? bufferFor(url) : Promise.resolve(null);
  });
  for (let i = 0; i < parts.length; i++) {
    const buf = await pending[i];
    if (my !== seq) return;
    if (buf) await playBuffer(buf, my);
    else await speakDevice(parts[i], my);
  }
}

/** Play a recording (e.g. Grandma's own "hello"), cutting off other speech. */
export async function playBlob(blob: Blob): Promise<void> {
  stopSpeech();
  const my = seq;
  await wake();
  // The audio player handles every format the microphone records in (iPhone records MP4/AAC,
  // which Web Audio often can't decode), so try it first.
  if (player && (await playOnPlayer(player, blob, my))) return;
  if (!ctx || my !== seq) return;
  try {
    const buf = await ctx.decodeAudioData(await blob.arrayBuffer());
    await playBuffer(buf, my);
  } catch {
    /* unreadable recording: stay quiet */
  }
}

/** Play a recording on the shared player. Resolves true when it played (to the end or until cut off). */
function playOnPlayer(el: HTMLAudioElement, blob: Blob, my: number): Promise<boolean> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(blob);
    let done = false;
    const finish = (ok: boolean) => {
      if (done) return;
      done = true;
      el.removeEventListener('ended', onEnd);
      el.removeEventListener('pause', onEnd);
      el.removeEventListener('error', onEnd);
      URL.revokeObjectURL(url);
      resolve(ok);
    };
    const onEnd = () => finish(true);
    el.src = url;
    el.volume = 1;
    el.play().then(
      () => {
        // Listen only once it's really playing: swapping the source can fire a stray "pause".
        el.addEventListener('ended', onEnd);
        el.addEventListener('pause', onEnd); // stopSpeech() pauses it
        el.addEventListener('error', onEnd);
        if (my !== seq) el.pause();
      },
      () => finish(false),
    );
  });
}

/** Does this line have a pre-recorded clip for every part? (Used by tests and the voice report.) */
export const hasClips = (parts: Part[]) => parts.every((p) => clipUrl(p));

/** The "Voice on / Voice off" button on a start screen. */
export function bindVoiceButton(btn: HTMLElement): void {
  const show = () => (btn.textContent = voiceOn ? '🔊 Voice on' : '🔇 Voice off');
  show();
  btn.addEventListener('click', () => {
    setVoiceOn(!voiceOn);
    show();
    unlock();
    if (voiceOn) say('Hello!');
  });
}
