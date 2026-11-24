// Sounds are synthesised (no files to load) and the voice uses the device's built-in speech.
// Both need a first tap before they work on iPhone and iPad, so unlock() runs on the Play button.

let ctx: AudioContext | null = null;

export function unlock(): void {
  ctx ??= new AudioContext();
  if (ctx.state === 'suspended') void ctx.resume();
  // iOS only lets speech start from a tap; an empty utterance opens the door.
  if ('speechSynthesis' in window) speechSynthesis.speak(new SpeechSynthesisUtterance(''));
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
  /** A card turning over. */
  flip(): void {
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
import { en, type Lang, type Part } from './words';
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
  if (!on && 'speechSynthesis' in window) speechSynthesis.cancel();
}

/** Say something, cutting off whatever was being said. Mixed-language lines are spoken part by part. */
export function say(line: string | Part[]): void {
  if (!voiceOn || !('speechSynthesis' in window)) return;
  const parts = (typeof line === 'string' ? [en(line)] : line).filter((p) => p.text);
  if (!parts.length) return;
  speechSynthesis.cancel();
  for (const p of parts) {
    const u = new SpeechSynthesisUtterance(p.text);
    const v = voiceFor(p.lang, p.voice ?? 'female');
    u.lang = v?.lang ?? (p.lang === 'es' ? 'es-MX' : 'en-US');
    if (v) u.voice = v;
    // Learning words a touch slower. Pitch stays close to 1: big pitch shifts sound robotic.
    u.rate = p.rate ?? (p.lang === 'es' ? 0.88 : 0.95);
    u.pitch = p.pitch ?? 1;
    u.volume = 0.85;
    speechSynthesis.speak(u);
  }
}

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
