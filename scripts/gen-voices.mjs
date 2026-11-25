// Turns every fixed phrase the toddler games say into a natural-sounding voice clip (MP3) using
// OpenAI's text-to-speech, and writes public/voice/manifest.json so the games can find them.
//
//   node scripts/gen-voices.mjs --dry     how many phrases, characters and a rough cost; no API calls
//   node scripts/gen-voices.mjs           generate what's missing (needs OPENAI_API_KEY in the environment)
//
// Only new or changed phrases are generated, so re-running after adding a line costs almost nothing.
// Clips for phrases that no longer exist are deleted. Usually run by the "Generate voices" GitHub
// workflow, which keeps the key in a repository secret.

import { createHash } from 'node:crypto';
import { mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createServer } from 'vite';

const OUT = 'public/voice';
const MODEL = process.env.OPENAI_TTS_MODEL || 'gpt-4o-mini-tts';
const DRY = process.argv.includes('--dry');
const CONCURRENCY = 4;

// Who each voice is. The same OpenAI voice can play different characters thanks to the instructions.
const TODDLER = 'You are talking to a two-year-old. Speak clearly, warmly and a little slowly, with a smile in your voice.';
const VOICES = {
  female: { voice: 'coral', style: `A friendly, cheerful young woman. ${TODDLER}` },
  male: { voice: 'ash', style: `A friendly, cheerful young man. ${TODDLER}` },
  grandma: { voice: 'shimmer', style: `A gentle, loving grandmother, soft and a little older-sounding. ${TODDLER}` },
  grandpa: { voice: 'onyx', style: `A kind, jolly grandfather with a warm, slightly deeper older voice. ${TODDLER}` },
  mommy: { voice: 'nova', style: `A loving, playful mom. ${TODDLER}` },
  daddy: { voice: 'echo', style: `A fun, playful dad. ${TODDLER}` },
  santa: { voice: 'onyx', style: `Santa Claus: big, deep, booming and jolly, with hearty laughs. ${TODDLER}` },
  critter: { voice: 'fable', style: `A silly, squeaky little cartoon animal, very playful and expressive. ${TODDLER}` },
  bigcritter: { voice: 'ash', style: `A big, goofy, friendly cartoon animal with a deeper silly voice. ${TODDLER}` },
  // ABC: the same friendly voice, told it is reading a letter's name, never the sound the letter makes.
  letters: {
    voice: 'coral',
    style:
      'You are teaching the alphabet. The text is the NAME of one letter of the alphabet: say it exactly the way the ' +
      'letter is named when reciting the alphabet (in English, A is "ay", E is "ee", I is "eye", W is "double-you"), ' +
      `never the sound the letter makes, and say nothing else. ${TODDLER}`,
  },
  // Sky Armada (for grown-ups): adventure voices, not toddler voices.
  heroF: { voice: 'sage', style: 'A bold, confident airship captain shouting an order in the middle of a sky battle. Energetic and heroic.' },
  heroM: { voice: 'ballad', style: 'A brave, gruff airship captain shouting an order in the middle of a sky battle. Energetic and heroic.' },
  villain: { voice: 'onyx', style: 'A menacing, theatrical villain: deep, slow and full of contempt, like a boss in an adventure film.' },
  queen: { voice: 'shimmer', style: 'An imperious storm queen: cold, regal and dramatic, with crackling menace.' },
  narrator: { voice: 'fable', style: 'A warm, dramatic storyteller announcing a moment in an epic sky adventure.' },
};
const LANG_STYLE = {
  en: 'Speak American English.',
  es: 'Speak natural Latin American (Mexican) Spanish with a native accent.',
};

// Load the phrase list straight from the game code (TypeScript) through Vite.
const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
const { allPhrases } = await server.ssrLoadModule('/src/voice/phrases.ts');
const { clipKey } = await server.ssrLoadModule('/src/kids/words.ts');
await server.close();

const phrases = allPhrases();
const chars = phrases.reduce((n, p) => n + p.text.length, 0);

/** File name from everything that affects the sound, so a changed voice or model regenerates it. */
function fileFor(p) {
  const v = VOICES[p.voice] ?? VOICES.female;
  const id = JSON.stringify([MODEL, v.voice, v.style, LANG_STYLE[p.lang], p.text]);
  return `${createHash('sha1').update(id).digest('hex').slice(0, 16)}.mp3`;
}

await mkdir(OUT, { recursive: true });
const existing = new Set((await readdir(OUT)).filter((f) => f.endsWith('.mp3')));
const todo = phrases.filter((p) => !existing.has(fileFor(p)));
const todoChars = todo.reduce((n, p) => n + p.text.length, 0);

console.log(`${phrases.length} phrases (${chars} characters); ${todo.length} to generate (${todoChars} characters).`);
// gpt-4o-mini-tts is billed by tokens; roughly $0.015 per minute of speech (~900 characters).
console.log(`Rough cost for the missing ones: about $${((todoChars / 900) * 0.015).toFixed(2)}.`);
if (DRY) process.exit(0);

const key = process.env.OPENAI_API_KEY;
if (!key) {
  console.error('Set OPENAI_API_KEY to generate clips (or run with --dry).');
  process.exit(1);
}

async function speak(p, attempt = 1) {
  const v = VOICES[p.voice] ?? VOICES.female;
  const res = await fetch('https://api.openai.com/v1/audio/speech', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: MODEL,
      voice: v.voice,
      input: p.text,
      instructions: `${v.style} ${LANG_STYLE[p.lang]}`,
      response_format: 'mp3',
    }),
  });
  if (res.status === 429 || res.status >= 500) {
    if (attempt > 5) throw new Error(`OpenAI ${res.status} after retries`);
    await new Promise((r) => setTimeout(r, 1500 * attempt));
    return speak(p, attempt + 1);
  }
  if (!res.ok) throw new Error(`OpenAI ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return Buffer.from(await res.arrayBuffer());
}

let done = 0;
const queue = [...todo];
await Promise.all(
  Array.from({ length: CONCURRENCY }, async () => {
    for (let p = queue.shift(); p; p = queue.shift()) {
      await writeFile(join(OUT, fileFor(p)), await speak(p));
      if (++done % 25 === 0 || done === todo.length) console.log(`  ${done}/${todo.length}`);
    }
  }),
);

// Manifest: phrase → file. Remove clips nothing uses any more.
const manifest = Object.fromEntries(phrases.map((p) => [clipKey(p), fileFor(p)]).sort(([a], [b]) => a.localeCompare(b)));
const used = new Set(Object.values(manifest));
for (const f of existing) if (!used.has(f)) await rm(join(OUT, f));
await writeFile(join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 0));
console.log(`Wrote ${OUT}/manifest.json (${used.size} clips).`);
