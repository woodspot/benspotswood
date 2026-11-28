import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../match/game';
import { hasSound } from '../kids/sounds';
import { ANIMALS, choicesFor, hideAnimals, isRight, meetParts, newQuiz, questionParts, rehide, SPOTS } from './game';

describe('barnyard', () => {
  it('every animal has a sound and a name in both languages', () => {
    for (const a of ANIMALS) {
      expect(a.sound.en && a.sound.es && a.name.en && a.name.es).toBeTruthy();
    }
  });

  it('meeting an animal says its sound in its own voice, then its name', () => {
    const turkey = { ...ANIMALS.find((a) => a.id === 'turkey')!, id: 'quiet-turkey' }; // no recording: the sound is spoken
    expect(meetParts(turkey, 'en')).toEqual([{ text: 'Gobble gobble!', lang: 'en', voice: 'bigcritter' }, { text: 'Turkey!', lang: 'en' }]);
    expect(meetParts(turkey, 'es')).toEqual([{ text: '¡Glu glu glu!', lang: 'es', voice: 'bigcritter' }, { text: '¡Pavo!', lang: 'es' }]);
  });

  it('plays the real recording where there is one, with the spoken sound kept as a fallback', () => {
    const cow = ANIMALS[0];
    const [sound] = meetParts(cow, 'en');
    expect(sound.text).toBe('Moo!');
    expect(sound.sound).toBe(hasSound('cow') ? 'cow' : undefined);
    expect(questionParts({ kind: 'sound', animal: 'cow' }, 'en')).toHaveLength(hasSound('cow') ? 2 : 1);
  });

  it('asks questions in English, with the word in Spanish', () => {
    expect(questionParts({ kind: 'sound', animal: 'turkey' }, 'en').slice(0, 1)).toEqual([{ text: 'Who says gobble gobble?', lang: 'en' }]);
    expect(questionParts({ kind: 'sound', animal: 'turkey' }, 'es').slice(0, 2)).toEqual([{ text: 'Who says', lang: 'en' }, { text: 'glu glu glu?', lang: 'es' }]);
    expect(questionParts({ kind: 'name', animal: 'pig' }, 'es')).toEqual([{ text: 'Where is the', lang: 'en' }, { text: 'cerdo', lang: 'es' }]);
  });

  it('hides a different animal in every spot, and swaps one after it is found', () => {
    const rng = mulberry32(1);
    const hidden = hideAnimals(rng);
    expect(new Set(Object.values(hidden)).size).toBe(SPOTS.length);
    const next = rehide(hidden, 'barn', rng);
    expect(next.barn).not.toBe(hidden.barn);
    expect(new Set(Object.values(next)).size).toBe(SPOTS.length);
  });

  it('quiz rounds hold the answer once and never repeat the last animal', () => {
    const rng = mulberry32(2);
    let prev;
    for (let wins = 0; wins < 30; wins++) {
      const r = newQuiz(wins, rng, prev);
      expect(r.animals).toHaveLength(choicesFor(wins));
      expect(new Set(r.animals).size).toBe(r.animals.length);
      expect(r.animals.filter((a) => isRight(r, a))).toHaveLength(1);
      if (prev) expect(r.question.animal).not.toBe(prev.question.animal);
      prev = r;
    }
  });
});
