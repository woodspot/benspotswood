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

/** One note of a song: which bar, and how long it lasts (in beats). */
export interface SongNote {
  bar: number;
  beats: number;
}

export interface Song {
  id: string;
  e: string; // its picture
  name: { en: string; es: string };
  notes: SongNote[];
  bars: number[]; // just the bars, in order (0 = C … 7 = high C)
  bpm: number; // how fast it goes when the band plays it back
  chordBeats: number; // each chord lasts this many beats
  chords: ChordName[]; // the soft piano and guitar underneath
  sound?: string; // an animal's real sound to finish with (Old MacDonald's cow)
}

export type ChordName = 'C' | 'F' | 'G' | 'D';
/** Each chord: a low guitar note and three soft piano notes. */
export const CHORDS: Record<ChordName, { bass: number; piano: number[] }> = {
  C: { bass: 48, piano: [55, 60, 64] },
  F: { bass: 41, piano: [57, 60, 65] },
  G: { bass: 43, piano: [55, 59, 62] },
  D: { bass: 50, piano: [57, 62, 66] },
};

const LETTERS = 'CDEFGABc';
/**
 * A tune written as letters (C D E F G A B, c = high C), each with an optional length in beats
 * after a colon: "C C G G A A G:2". Fractions are fine: "E:2/3 D:1/3".
 */
export function parseTune(text: string): SongNote[] {
  return text
    .split(/\s+/)
    .filter((t) => t && t !== '|')
    .map((t) => {
      const [l, len] = t.split(':');
      const bar = LETTERS.indexOf(l);
      if (bar < 0) throw new Error(`Not a note: ${t}`);
      let beats = 1;
      if (len) {
        const [a, b] = len.split('/');
        beats = Number(a) / (b ? Number(b) : 1);
      }
      return { bar, beats };
    });
}

function song(s: Omit<Song, 'notes' | 'bars' | 'chords'> & { tune: string; chords: string }): Song {
  const { tune, chords, ...rest } = s;
  const notes = parseTune(tune);
  return { ...rest, notes, bars: notes.map((n) => n.bar), chords: chords.split(/\s+/).filter((c) => c && c !== '|') as ChordName[] };
}

/** When each note starts, in beats from the beginning. */
export function noteStarts(s: Song): number[] {
  let t = 0;
  return s.notes.map((n) => {
    const at = t;
    t += n.beats;
    return at;
  });
}
export const songBeats = (s: Song) => s.notes.reduce((t, n) => t + n.beats, 0);
/** The chord playing at this beat. */
export const chordAt = (s: Song, beat: number): ChordName => s.chords[Math.min(s.chords.length - 1, Math.floor(beat / s.chordBeats + 1e-6))];

export const SONGS: Song[] = [
  song({
    id: 'twinkle', e: '⭐', name: { en: 'Twinkle, Twinkle, Little Star', es: 'Estrellita' }, bpm: 100, chordBeats: 2,
    tune: `C C G G A A G:2 | F F E E D D C:2 |
           G G F F E E D:2 | G G F F E E D:2 |
           C C G G A A G:2 | F F E E D D C:2`,
    chords: `C C F C | F C G C | C G C G | C G C G | C C F C | F C G C`,
  }),
  song({
    id: 'lamb', e: '🐑', name: { en: 'Mary Had a Little Lamb', es: 'María tenía un corderito' }, bpm: 112, chordBeats: 4,
    tune: `E D C D | E E E:2 | D D D:2 | E G G:2 |
           E D C D | E E E E | D D E D | C:4 |
           E D C D | E E E:2 | D D D:2 | E G G:2 |
           E D C D | E E E E | D D E D | C:4`,
    chords: `C C G C C C G C | C C G C C C G C`,
  }),
  song({
    // In 6/8: one beat here is a dotted quarter, so a quick note is a third of a beat.
    id: 'boat', e: '⛵', name: { en: 'Row, Row, Row Your Boat', es: 'Rema, rema, rema' }, bpm: 66, chordBeats: 2,
    tune: `C C | C:2/3 D:1/3 E | E:2/3 D:1/3 E:2/3 F:1/3 | G:2 |
           c:1/3 c:1/3 c:1/3 G:1/3 G:1/3 G:1/3 | E:1/3 E:1/3 E:1/3 C:1/3 C:1/3 C:1/3 |
           G:2/3 F:1/3 E:2/3 D:1/3 | C:2 |
           C C | C:2/3 D:1/3 E | E:2/3 D:1/3 E:2/3 F:1/3 | G:2 |
           c:1/3 c:1/3 c:1/3 G:1/3 G:1/3 G:1/3 | E:1/3 E:1/3 E:1/3 C:1/3 C:1/3 C:1/3 |
           G:2/3 F:1/3 E:2/3 D:1/3 | C:2`,
    chords: `C C C C C C G C | C C C C C C G C`,
  }),
  song({
    // In G: it starts on G and dips down to the low D, like the real song.
    id: 'farm', e: '🐮', name: { en: 'Old MacDonald Had a Farm', es: 'La granja del viejo MacDonald' }, bpm: 126, chordBeats: 2,
    tune: `G G G D | E E D:2 | B B A A | G:3 D |
           G G G D | E E D:2 | B B A A | G:3 D:1/2 D:1/2 |
           G G G D:1/2 D:1/2 | G G G:2 |
           G:1/2 G:1/2 G G:1/2 G:1/2 G | G:1/2 G:1/2 G:1/2 G:1/2 G G |
           G G G D | E E D:2 | B B A A | G:4`,
    chords: `G G C G D D G G | G G C G D D G G | G G G G G G G G | G G C G D D G G`,
    sound: 'cow',
  }),
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
