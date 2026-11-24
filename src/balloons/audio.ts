// Sounds are synthesised (no files to load) and the voice uses the device's built-in speech.
// Both need a first tap before they work on iPhone and iPad, so unlock() runs on the Play button.

let ctx: AudioContext | null = null;

export function unlock(): void {
  ctx ??= new AudioContext();
  if (ctx.state === 'suspended') void ctx.resume();
  // iOS only lets speech start from a tap; an empty utterance opens the door.
  if ('speechSynthesis' in window) speechSynthesis.speak(new SpeechSynthesisUtterance(''));
}

function tone(freq: number, start: number, dur: number, type: OscillatorType = 'sine', vol = 0.25): void {
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
  /** The big celebration. */
  fanfare(): void {
    [523, 659, 784, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.13, 0.32, 'triangle', 0.24));
  },
};

let voice: SpeechSynthesisVoice | null = null;

function chooseVoice(): void {
  const voices = speechSynthesis.getVoices().filter((v) => v.lang.startsWith('en'));
  // Prefer a warm, natural-sounding voice where the device has one.
  const liked = ['Samantha', 'Karen', 'Moira', 'Tessa', 'Google UK English Female', 'Microsoft Aria', 'Microsoft Jenny', 'Google US English'];
  voice = liked.map((n) => voices.find((v) => v.name.includes(n))).find(Boolean) ?? voices[0] ?? null;
}
if ('speechSynthesis' in window) {
  chooseVoice();
  speechSynthesis.addEventListener?.('voiceschanged', chooseVoice);
}

let voiceOn = localStorage.getItem('balloons.voice') !== 'off';
export const isVoiceOn = () => voiceOn;
export function setVoiceOn(on: boolean): void {
  voiceOn = on;
  localStorage.setItem('balloons.voice', on ? 'on' : 'off');
  if (!on && 'speechSynthesis' in window) speechSynthesis.cancel();
}

/** Say something, cutting off whatever was being said. */
export function say(text: string): void {
  if (!voiceOn || !text || !('speechSynthesis' in window)) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  if (voice) u.voice = voice;
  u.rate = 0.95;
  u.pitch = 1;
  u.volume = 0.8;
  speechSynthesis.speak(u);
}
