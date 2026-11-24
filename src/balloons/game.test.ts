import { describe, expect, it } from 'vitest';
import { colorPool, matches, mulberry32, newSession, nextBalloon, pop, type Spec } from './game';
import { countParts, nameParts, nextParts, praiseParts, promptParts } from './speech';

describe('balloon pop', () => {
  it('always keeps a matching balloon available', () => {
    const rng = mulberry32(1);
    for (const mode of ['colors', 'shapes'] as const) {
      const s = newSession(mode, rng);
      for (let i = 0; i < 200; i++) {
        // Screen full of non-matching balloons: the next one must match.
        const others: Spec[] = [];
        const b = nextBalloon(s, others.filter((x) => !matches(s.target, x)), rng);
        expect(matches(s.target, b)).toBe(true);
      }
    }
  });

  it('a wrong pop names the balloon and keeps the target', () => {
    const rng = mulberry32(2);
    const s = newSession('colors', rng);
    s.target = { kind: 'color', id: 'red' };
    const r = pop(s, { color: 'blue', shape: null }, rng);
    expect(r).toEqual({ kind: 'other', said: "That's blue." });
    expect(s.target).toEqual({ kind: 'color', id: 'red' });
  });

  it('a right pop moves to a different target', () => {
    const rng = mulberry32(3);
    const s = newSession('colors', rng);
    s.target = { kind: 'color', id: 'red' };
    const r = pop(s, { color: 'red', shape: null }, rng);
    expect(r).toMatchObject({ kind: 'right', done: true });
    expect(s.target).not.toEqual({ kind: 'color', id: 'red' });
    expect(s.correct).toBe(1);
  });

  it('counting finishes after n pops of any balloon', () => {
    const rng = mulberry32(4);
    const s = newSession('count', rng);
    s.target = { kind: 'count', n: 3 };
    expect(pop(s, { color: 'red', shape: null }, rng)).toEqual({ kind: 'right', done: false, count: 1 });
    expect(pop(s, { color: 'blue', shape: null }, rng)).toEqual({ kind: 'right', done: false, count: 2 });
    expect(pop(s, { color: 'blue', shape: null }, rng)).toEqual({ kind: 'right', done: true, count: 3 });
    expect(s.progress).toBe(0);
  });

  it('more colours unlock as the child gets them right', () => {
    expect(colorPool(0)).toEqual(['red', 'blue', 'yellow', 'green']);
    expect(colorPool(100)).toHaveLength(7);
  });

  it('speaks English, or English instructions with the word in Spanish', () => {
    const red = { kind: 'color', id: 'red' } as const;
    expect(promptParts(red, 'en')).toEqual([{ text: 'Pop the red balloon!', lang: 'en' }]);
    expect(promptParts(red, 'es')).toEqual([
      { text: 'Pop the', lang: 'en' }, { text: 'rojo', lang: 'es' }, { text: 'balloon!', lang: 'en' },
    ]);
    expect(promptParts({ kind: 'count', n: 3 }, 'en')).toEqual([{ text: 'Pop three balloons!', lang: 'en' }]);
    expect(praiseParts({ kind: 'shape', id: 'star' }, 'en')).toEqual([{ text: 'Star!', lang: 'en' }]);
    expect(praiseParts({ kind: 'shape', id: 'star' }, 'es')).toEqual([{ text: '¡Estrella!', lang: 'es' }]);
    expect(nextParts({ kind: 'color', id: 'blue' }, 'es')).toEqual([{ text: 'Now', lang: 'en' }, { text: 'azul', lang: 'es' }]);
    expect(countParts(2, 'es')).toEqual([{ text: 'dos', lang: 'es' }]);
    // In English a popped balloon stays quiet; in Spanish it names its colour.
    expect(nameParts({ color: 'green', shape: null }, false, 'en')).toEqual([]);
    expect(nameParts({ color: 'green', shape: null }, false, 'es')).toEqual([{ text: 'verde', lang: 'es' }]);
  });
});
