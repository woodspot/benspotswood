// Dentist: patients come in with their mouths wide open. Every patient needs something different:
// brush off the yucky plaque, spray away the germs, pull out stuck food with the tweezers, and drill
// a cavity clean then fill it. No DOM here, so it can be tested.
import { en, type Lang, type Part } from '../kids/words';
import { nameParts, type Pic } from '../match/game';
import { hasSound } from '../kids/sounds';

export type Rng = () => number;

export function shuffle<T>(list: readonly T[], rng: Rng): T[] {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ── Tools and problems ─────────────────────────────────────────

export type ToolId = 'brush' | 'spray' | 'tweezers' | 'drill' | 'fill';
export type ProblemKind = 'plaque' | 'germ' | 'stuck' | 'cavity';

export interface Tool extends Pic {
  id: ToolId;
}
export const TOOLS: Tool[] = [
  { id: 'brush', e: '🪥', name: 'toothbrush', es: 'cepillo de dientes' },
  { id: 'spray', e: 'spray', name: 'water', es: 'agua' },
  { id: 'tweezers', e: 'tweezers', name: 'tweezers', es: 'pinzas' },
  { id: 'drill', e: 'drill', name: 'drill', es: 'taladro' },
  { id: 'fill', e: 'filling', name: 'filling', es: 'empaste' },
];

/** Which tool fixes a problem. A cavity takes two: the drill cleans it out, then it's filled. */
export const FIXES: Record<ProblemKind, ToolId[]> = {
  plaque: ['brush'],
  germ: ['spray'],
  stuck: ['tweezers'],
  cavity: ['drill', 'fill'],
};

/** New kinds of problem as they get better: plaque and germs first, then stuck food, then cavities. */
export const kindsFor = (patients: number): ProblemKind[] =>
  patients < 1 ? ['plaque', 'germ'] : patients < 2 ? ['plaque', 'germ', 'stuck'] : ['plaque', 'germ', 'stuck', 'cavity'];

// ── Patients ───────────────────────────────────────────────────

export interface Patient extends Pic {
  lips: string; // lip colour
  teeth: number; // teeth in each row (top and bottom)
  pointy?: boolean; // sharp teeth (crocodile, lion)
  likes: ProblemKind; // what this one always has (each patient is different)
  sound?: string; // a real recording, to say thank you with
  snack: string[]; // what gets stuck in their teeth
}

export const PATIENTS: Patient[] = [
  { e: '👧', name: 'girl', es: 'niña', lips: '#e66d82', teeth: 6, likes: 'plaque', snack: ['🍿', '🥦'] },
  { e: '👦', name: 'boy', es: 'niño', lips: '#d8606f', teeth: 6, likes: 'cavity', snack: ['🌽', '🍿'] },
  { e: '👵', name: 'grandma', es: 'abuela', lips: '#c45a74', teeth: 6, likes: 'stuck', snack: ['🥦', '🍓'] },
  { e: '👴', name: 'grandpa', es: 'abuelo', lips: '#b8566a', teeth: 6, likes: 'cavity', snack: ['🌽', '🥩'] },
  { e: '👩', name: 'mommy', es: 'mamá', lips: '#e0517a', teeth: 6, likes: 'germ', snack: ['🍓', '🥦'] },
  { e: '👨', name: 'daddy', es: 'papá', lips: '#c96470', teeth: 6, likes: 'plaque', snack: ['🍿', '🥩'] },
  { e: '🐊', name: 'crocodile', es: 'cocodrilo', lips: '#4f9a3c', teeth: 7, pointy: true, likes: 'stuck', snack: ['🐟', '🦴'] },
  { e: '🦁', name: 'lion', es: 'león', lips: '#c8742c', teeth: 6, pointy: true, likes: 'germ', snack: ['🦴', '🥩'], sound: 'lion' },
  { e: '🦛', name: 'hippo', es: 'hipopótamo', lips: '#9a7fb0', teeth: 5, likes: 'plaque', snack: ['🍉', '🌽'] },
];

export const patientParts = (p: Patient, lang: Lang): Part[] => nameParts(p, lang);

/** The next patient (never the same one twice in a row). */
export function nextPatient(rng: Rng, prev?: string): Patient {
  const pool = PATIENTS.filter((p) => p.e !== prev);
  return pool[Math.floor(rng() * pool.length)];
}

/** A tooth: which row, and where along it (0 = their right, on the left of the screen). */
export interface ToothRef {
  row: 'top' | 'bottom';
  i: number;
}

export interface Problem {
  kind: ProblemKind;
  row: 'top' | 'bottom';
  i: number; // the tooth (for stuck food: the gap between tooth i and i+1)
  snack?: string; // what's stuck
}

/** How many things to fix: two at first, up to six. */
export const problemCount = (patients: number) => Math.min(6, 2 + Math.floor(patients / 2));

/**
 * What this patient needs. Always at least one of the thing they like (so each patient feels
 * different), the rest from what's been unlocked, and never two problems on one tooth.
 */
export function newVisit(p: Patient, patients: number, rng: Rng): Problem[] {
  const kinds = kindsFor(patients);
  const n = problemCount(patients);
  const favourite = kinds.includes(p.likes) ? p.likes : kinds[Math.floor(rng() * kinds.length)];
  const wanted: ProblemKind[] = [favourite, favourite];
  while (wanted.length < n) wanted.push(kinds[Math.floor(rng() * kinds.length)]);
  // Not too many cavities (they take the longest): two at most.
  let cavities = 0;
  const list = shuffle(wanted.slice(0, n), rng).map((k) => {
    if (k !== 'cavity') return k;
    return ++cavities > 2 ? 'plaque' : k;
  });
  const teeth: ToothRef[] = shuffle(
    (['top', 'bottom'] as const).flatMap((row) => Array.from({ length: p.teeth }, (_, i) => ({ row, i }))),
    rng,
  );
  const gaps = shuffle(
    (['top', 'bottom'] as const).flatMap((row) => Array.from({ length: p.teeth - 1 }, (_, i) => ({ row, i }))),
    rng,
  );
  const usedTeeth = new Set<string>();
  const key = (row: string, i: number) => `${row}${i}`;
  const out: Problem[] = [];
  // Stuck food first (it needs two teeth side by side); if there's no room, it's plaque instead.
  list.sort((a, b) => Number(b === 'stuck') - Number(a === 'stuck'));
  for (let kind of list) {
    const g = kind === 'stuck' && gaps.find((x) => !usedTeeth.has(key(x.row, x.i)) && !usedTeeth.has(key(x.row, x.i + 1)));
    if (kind === 'stuck' && !g) kind = 'plaque';
    if (g) {
      // Between two teeth that have nothing else on them.
      usedTeeth.add(key(g.row, g.i)).add(key(g.row, g.i + 1));
      out.push({ kind, row: g.row, i: g.i, snack: p.snack[Math.floor(rng() * p.snack.length)] });
    } else {
      const t = teeth.find((x) => !usedTeeth.has(key(x.row, x.i)))!;
      usedTeeth.add(key(t.row, t.i));
      out.push({ kind, row: t.row, i: t.i });
    }
  }
  return out;
}

/** What the patient says when they sit down: about the thing they need most. */
export const COMPLAINT: Record<ProblemKind, string> = {
  plaque: 'I ate too much candy!',
  germ: 'My teeth feel yucky!',
  stuck: 'Something is stuck in my teeth!',
  cavity: 'Ow! My tooth hurts!',
};
export function complaintFor(problems: Problem[]): string {
  for (const k of ['cavity', 'stuck', 'germ', 'plaque'] as ProblemKind[]) if (problems.some((p) => p.kind === k)) return COMPLAINT[k];
  return COMPLAINT.plaque;
}

// ── Speech ─────────────────────────────────────────────────────

export const SAY = {
  next: 'Next patient!',
  open: 'Open wide!',
  hint: {
    brush: 'Use the toothbrush!',
    spray: 'Spray the germs with water!',
    tweezers: 'Pull it out with the tweezers!',
    drill: 'Use the drill!',
    fill: 'Now fill the hole!',
  } satisfies Record<ToolId, string>,
  germGone: 'Bye bye, germ!',
  allBetter: 'All better! What a big smile!',
  thanks: 'Thank you, doctor!',
};
export const PRAISE = ['Yes!', 'Great job!', 'Wow!', 'Super!', 'Sparkly!'];

export const toolParts = (t: Tool, lang: Lang): Part[] => nameParts(t, lang);

/** The patient's real sound, when they have one (the lion's roar). */
export const patientSound = (p: Patient): Part[] => (p.sound && hasSound(p.sound) ? [{ ...en(`${p.name}!`), sound: p.sound }] : []);

export function allDentistPhrases(): Part[] {
  const out: Part[] = [
    en(SAY.next), en(SAY.open), ...Object.values(SAY.hint).map((t) => en(t)), en(SAY.germGone), en(SAY.allBetter), en(SAY.thanks),
    ...Object.values(COMPLAINT).map((t) => en(t)), ...PRAISE.map((t) => en(t)), en('Hooray!'),
  ];
  for (const lang of ['en', 'es'] as Lang[]) {
    for (const p of PATIENTS) out.push(...patientParts(p, lang));
    for (const t of TOOLS) out.push(...toolParts(t, lang));
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
