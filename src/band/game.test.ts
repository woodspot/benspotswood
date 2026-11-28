import { describe, expect, it } from 'vitest';
import { allPhrases } from '../voice/phrases';
import { clipKey } from '../kids/words';
import { BAR_NOTES, barsFor, chordAt, INSTRUMENTS, mulberry32, newTune, parseTune, RIFFS, songBeats, SONGS, tuneLength } from './game';

describe('The Band', () => {
  it('every instrument riff stays in C major pentatonic, so any taps sound good together', () => {
    const scale = new Set([0, 2, 4, 7, 9]);
    for (const riff of Object.values(RIFFS)) for (const n of riff) expect(scale.has(n % 12)).toBe(true);
  });

  it('copy-me tunes grow longer and use more bars, never the same bar three times running', () => {
    expect(tuneLength(0)).toBe(2);
    expect(tuneLength(20)).toBe(6);
    expect(barsFor(0)).toBe(4);
    expect(barsFor(10)).toBe(8);
    const rng = mulberry32(4);
    for (let wins = 0; wins < 12; wins++)
      for (let k = 0; k < 30; k++) {
        const t = newTune(wins, rng);
        expect(t).toHaveLength(tuneLength(wins));
        for (const b of t) expect(b).toBeLessThan(barsFor(wins));
        for (let i = 2; i < t.length; i++) expect(t[i] === t[i - 1] && t[i] === t[i - 2]).toBe(false);
      }
  });

  it('songs only use bars on the xylophone', () => {
    for (const s of SONGS) for (const b of s.bars) expect(b >= 0 && b < BAR_NOTES.length).toBe(true);
  });

  it('songs are whole verses whose rhythm fits their chords', () => {
    expect(parseTune('C E:2 c:1/3')).toEqual([{ bar: 0, beats: 1 }, { bar: 2, beats: 2 }, { bar: 7, beats: 1 / 3 }]);
    for (const s of SONGS) {
      expect(s.bars.length, s.id).toBeGreaterThanOrEqual(26);
      expect(songBeats(s), s.id).toBeCloseTo(s.chords.length * s.chordBeats, 6);
      expect(chordAt(s, songBeats(s) - 0.01), s.id).toBe(s.chords[s.chords.length - 1]);
    }
    // Old MacDonald starts on G and dips to the low D (not up to the high notes).
    const farm = SONGS.find((s) => s.id === 'farm')!;
    expect(farm.bars.slice(0, 7)).toEqual([4, 4, 4, 1, 2, 2, 1]);
  });

  it('has a recorded voice line for every instrument name', () => {
    const keys = new Set(allPhrases().map(clipKey));
    for (const i of INSTRUMENTS) expect(keys.has(`es|female|¡${i.es[0].toUpperCase()}${i.es.slice(1)}!`), i.es).toBe(true);
  });
});
