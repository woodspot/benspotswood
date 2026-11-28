// The Band: animals with instruments, a rainbow xylophone, "copy my tune" and songs to play.
// No DOM or sound here, so it can be tested.
//  - Band: tap an animal and it plays its instrument (and says the instrument's name). Every
//    instrument plays notes from the same five-note scale, so whatever they tap sounds good together.
//  - Copy me: the xylophone plays a short tune, the bars light up, and they play it back. The tunes
//    grow longer (memory and listening).
//  - Songs: the next bar to tap shines, and a song they know comes out.
import { en, es, type Lang, type Part } from '../kids/words';
import { nameParts, type Pic } from '../match/game';

export type Rng = () => number;

export type InstrumentId = 'drum' | 'xylophone' | 'piano' | 'guitar' | 'trumpet' | 'maracas';

export interface Instrument extends Pic {
  id: InstrumentId;
  player: string; // the animal who plays it
  color: string;
}

export const INSTRUMENTS: Instrument[] = [
  { id: 'drum', e: '🥁', name: 'drum', es: 'tambor', player: '🐻', color: '#ec4038' },
  { id: 'piano', e: '🎹', name: 'piano', es: 'piano', player: '🐱', color: '#9b5de5' },
  { id: 'guitar', e: '🎸', name: 'guitar', es: 'guitarra', player: '🐶', color: '#f68b28' },
  { id: 'trumpet', e: '🎺', name: 'trumpet', es: 'trompeta', player: '🐘', color: '#f7b52d' },
  { id: 'xylophone', e: 'xylophone', name: 'xylophone', es: 'xilófono', player: '🐰', color: '#3fbf5a' },
  { id: 'maracas', e: '🪇', name: 'maracas', es: 'maracas', player: '🐵', color: '#3a7ff0' },
];

export const instrumentParts = (i: Instrument, lang: Lang): Part[] => nameParts(i, lang);

// ── Notes ──────────────────────────────────────────────────────

/** MIDI note → frequency. */
export const freq = (midi: number) => 440 * Math.pow(2, (midi - 69) / 12);

/**
 * What each instrument plays, one note per tap, round and round. All in C major pentatonic
 * (C D E G A), so any mix of taps sounds like music. The drum plays drum sounds.
 */
export const RIFFS: Record<Exclude<InstrumentId, 'drum' | 'maracas'>, number[]> = {
  xylophone: [72, 74, 76, 79, 81, 79, 76, 74, 72, 76, 79, 84],
  piano: [60, 64, 67, 72, 69, 67, 64, 62],
  guitar: [48, 55, 52, 55, 50, 57, 55, 52],
  trumpet: [67, 69, 72, 69, 67, 64, 67, 72],
};
export type DrumHit = 'kick' | 'snare' | 'tom' | 'hat' | 'crash';
export const DRUM_RIFF: DrumHit[] = ['kick', 'snare', 'kick', 'tom', 'kick', 'snare', 'tom', 'crash'];

/** The rainbow xylophone: eight bars, C to high C. */
export const BAR_NOTES = [60, 62, 64, 65, 67, 69, 71, 72];
export const BAR_COLORS = ['#ec4038', '#f68b28', '#f7cf2d', '#3fbf5a', '#2ab3b0', '#3a7ff0', '#9b5de5', '#f477b6'];

// ── Copy me ────────────────────────────────────────────────────

/** How many bars to play with: four at first, then six, then all eight. */
export const barsFor = (wins: number) => (wins < 3 ? 4 : wins < 7 ? 6 : 8);
/** How long the tune is: two notes at first, growing to six. */
export const tuneLength = (wins: number) => Math.min(6, 2 + Math.floor(wins / 2));

/** A tune to copy: bar indexes. Never the same bar three times in a row. */
export function newTune(wins: number, rng: Rng): number[] {
  const n = barsFor(wins);
  const out: number[] = [];
  while (out.length < tuneLength(wins)) {
    const b = Math.floor(rng() * n);
    if (out.length >= 2 && out[out.length - 1] === b && out[out.length - 2] === b) continue;
    out.push(b);
  }
  return out;
}

// ── Songs (traditional tunes) ──────────────────────────────────

export interface Song {
  id: string;
  e: string; // its picture
  name: { en: string; es: string };
  bars: number[]; // bar indexes (0 = C … 7 = high C)
  sound?: string; // an animal's real sound to finish with (Old MacDonald's cow)
}

export const SONGS: Song[] = [
  {
    id: 'twinkle', e: '⭐', name: { en: 'Twinkle, Twinkle, Little Star', es: 'Estrellita' },
    bars: [0, 0, 4, 4, 5, 5, 4, 3, 3, 2, 2, 1, 1, 0],
  },
  {
    id: 'lamb', e: '🐑', name: { en: 'Mary Had a Little Lamb', es: 'María tenía un corderito' },
    bars: [2, 1, 0, 1, 2, 2, 2, 1, 1, 1, 2, 4, 4, 2, 1, 0, 1, 2, 2, 2, 2, 1, 1, 2, 1, 0],
  },
  {
    id: 'boat', e: '⛵', name: { en: 'Row, Row, Row Your Boat', es: 'Rema, rema, rema' },
    bars: [0, 0, 0, 1, 2, 2, 1, 2, 3, 4, 7, 7, 7, 4, 4, 4, 2, 2, 2, 0, 0, 0, 4, 3, 2, 1, 0],
  },
  {
    id: 'farm', e: '🐮', name: { en: 'Old MacDonald Had a Farm', es: 'La granja del viejo MacDonald' },
    bars: [0, 0, 0, 4, 5, 5, 4, 2, 2, 1, 1, 0], sound: 'cow',
  },
];

/** The song's name, said in the chosen language. */
export const songParts = (s: Song, lang: Lang): Part[] => [lang === 'es' ? es(`¡${s.name.es}!`) : en(`${s.name.en}!`)];

// ── Speech ─────────────────────────────────────────────────────

export const SAY = {
  band: 'Tap the band!',
  listen: 'Listen!',
  yourTurn: 'Your turn!',
  again: 'Listen again!',
  pickSong: 'Pick a song!',
  shine: 'Tap the shining bar!',
  together: 'Everybody play!',
};
export const PRAISE = ['Yes!', 'Great job!', 'You did it!', 'Wow!', 'Super!'];

export function allBandPhrases(): Part[] {
  const out: Part[] = [...Object.values(SAY).map((t) => en(t)), ...PRAISE.map((t) => en(t)), en('Hooray!')];
  for (const lang of ['en', 'es'] as Lang[]) {
    for (const i of INSTRUMENTS) out.push(...instrumentParts(i, lang));
    for (const s of SONGS) out.push(...songParts(s, lang));
  }
  return out;
}

/** Seeded RNG for tests. */
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
