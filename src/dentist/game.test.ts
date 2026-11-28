import { describe, expect, it } from 'vitest';
import { clipKey } from '../kids/words';
import { allPhrases } from '../voice/phrases';
import { complaintFor, kindsFor, mulberry32, newVisit, nextPatient, PATIENTS, problemCount, TOOLS } from './game';

describe('dentist', () => {
  it('each visit has the right number of problems, never two on one tooth', () => {
    const rng = mulberry32(7);
    for (let n = 0; n < 30; n++)
      for (const p of PATIENTS) {
        const v = newVisit(p, n, rng);
        expect(v.length).toBe(problemCount(n));
        const used = new Set<string>();
        for (const x of v) {
          expect(kindsFor(n)).toContain(x.kind);
          const teeth = x.kind === 'stuck' ? [x.i, x.i + 1] : [x.i];
          for (const i of teeth) {
            expect(i).toBeLessThan(p.teeth);
            const k = `${x.row}${i}`;
            expect(used.has(k)).toBe(false);
            used.add(k);
          }
          if (x.kind === 'stuck') expect(p.snack).toContain(x.snack);
        }
        expect(v.filter((x) => x.kind === 'cavity').length).toBeLessThanOrEqual(2);
      }
  });

  it('every patient shows the thing they like once it is unlocked', () => {
    const rng = mulberry32(3);
    for (const p of PATIENTS) expect(newVisit(p, 10, rng).some((x) => x.kind === p.likes)).toBe(true);
  });

  it('starts gently: plaque and germs, then stuck food, then cavities', () => {
    expect(kindsFor(0)).toEqual(['plaque', 'germ']);
    expect(kindsFor(1)).toContain('stuck');
    expect(kindsFor(2)).toContain('cavity');
    expect(complaintFor([{ kind: 'plaque', row: 'top', i: 0 }, { kind: 'cavity', row: 'top', i: 1 }])).toMatch(/hurts/);
  });

  it('never sees the same patient twice in a row', () => {
    const rng = mulberry32(1);
    let prev: string | undefined;
    for (let n = 0; n < 50; n++) {
      const p = nextPatient(rng, prev);
      expect(p.e).not.toBe(prev);
      prev = p.e;
    }
  });

  it('has a voice line for every patient and tool', () => {
    const keys = new Set(allPhrases().map(clipKey));
    for (const x of [...PATIENTS, ...TOOLS]) expect(keys.has(`en|female|${x.name[0].toUpperCase()}${x.name.slice(1)}!`), x.name).toBe(true);
  });
});
