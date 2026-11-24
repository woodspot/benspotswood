// Choosing the most natural-sounding voice the device has. No browser APIs here, so it can be tested.
//
// Phones and tablets ship basic voices, but iPhone/iPad can download much better "Enhanced" and
// "Premium" ones (Settings → Accessibility → Spoken Content → Voices). We always prefer those, and
// skip the novelty voices (Bubbles, Zarvox, the robotic "Eloquence" set…).

import type { Lang } from './words';

export type Gender = 'female' | 'male';

export interface VoiceInfo {
  name: string;
  lang: string;
  voiceURI: string;
  localService?: boolean;
}

/** Known good voices by language and gender, best first. */
const NAMES: Record<Lang, Record<Gender, string[]>> = {
  en: {
    female: ['Ava', 'Zoe', 'Samantha', 'Allison', 'Susan', 'Nicky', 'Serena', 'Kate', 'Karen', 'Tessa', 'Moira', 'Microsoft Aria', 'Microsoft Jenny', 'Microsoft Zira', 'Microsoft Hazel', 'Microsoft Susan', 'Google US English', 'Google UK English Female'],
    male: ['Evan', 'Nathan', 'Tom', 'Aaron', 'Alex', 'Daniel', 'Oliver', 'Arthur', 'Rishi', 'Gordon', 'Microsoft Guy', 'Microsoft Davis', 'Microsoft Ryan', 'Microsoft David', 'Microsoft Mark', 'Microsoft George', 'Google UK English Male'],
  },
  es: {
    female: ['Paulina', 'Marisol', 'Angélica', 'Angelica', 'Isabela', 'Mónica', 'Monica', 'Soledad', 'Microsoft Dalia', 'Microsoft Sabina', 'Microsoft Helena', 'Microsoft Laura', 'Google español de Estados Unidos', 'Google español'],
    male: ['Juan', 'Jorge', 'Diego', 'Carlos', 'Microsoft Jorge', 'Microsoft Raul', 'Microsoft Pablo', 'Microsoft Alvaro'],
  },
};

const NOVELTY = [
  'Albert', 'Bad News', 'Bahh', 'Bells', 'Boing', 'Bubbles', 'Cellos', 'Deranged', 'Good News', 'Hysterical', 'Jester', 'Organ',
  'Superstar', 'Trinoids', 'Whisper', 'Wobble', 'Zarvox', 'Fred', 'Junior', 'Ralph', 'Kathy', 'Princess',
  'Eddy', 'Flo', 'Grandma', 'Grandpa', 'Reed', 'Rocko', 'Sandy', 'Shelley',
];

const isNovelty = (v: VoiceInfo) =>
  /eloquence|speech\.synthesis\.voice/i.test(v.voiceURI) || NOVELTY.some((n) => v.name === n || v.name.startsWith(`${n} (`));

/** Higher is better: Premium > Enhanced > Microsoft/Google "natural" voices > the rest. */
export function quality(v: VoiceInfo): number {
  const id = `${v.voiceURI} ${v.name}`.toLowerCase();
  if (id.includes('premium')) return 4;
  if (id.includes('enhanced') || id.includes('neural') || id.includes('natural')) return 3;
  if (id.includes('microsoft') || id.includes('google')) return 2;
  return 1;
}

/** The best voice for a language and gender, or null if the device has none in that language. */
export function pickVoice<V extends VoiceInfo>(all: V[], lang: Lang, gender: Gender): V | null {
  const inLang = all.filter((v) => v.lang.toLowerCase().startsWith(lang) && !isNovelty(v));
  if (!inLang.length) return null;
  // Spanish: Latin American accents before Spain's.
  const accent = (v: V) => (lang === 'es' && /-(MX|US|419)/i.test(v.lang) ? 0.5 : 0);
  const named = (v: V, g: Gender) => {
    const i = NAMES[lang][g].findIndex((n) => v.name.includes(n));
    return i < 0 ? -1 : i;
  };
  const score = (v: V) => {
    const mine = named(v, gender);
    const other = named(v, gender === 'female' ? 'male' : 'female');
    // Right gender matters most; then quality; then how well-known the voice is.
    const genderScore = mine >= 0 ? 10 : other >= 0 ? -10 : 0;
    return genderScore + quality(v) * 2 + accent(v) + (mine >= 0 ? (20 - mine) / 20 : 0);
  };
  return [...inLang].sort((a, b) => score(b) - score(a))[0];
}
