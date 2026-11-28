// Draws pictures for the toddler games with OpenAI's image model, in one consistent style.
//
//   node scripts/gen-art.mjs --full [--only id,id] [--dry]
//        every picture in src/kids/art-list.json that has no drawing yet, in the storybook style,
//        full size → art-raw/ (scripts/shrink-art.py then makes the small files in src/kids/art/).
//        --only redraws just those ids; --dry lists what would be drawn and the rough cost.
//   node scripts/gen-art.mjs --samples    a few test subjects in each candidate style → art-samples/
//
// Needs OPENAI_API_KEY in the environment (not for --dry). Usually run by the "Generate pictures"
// GitHub workflow, which keeps the key in a repository secret.

import { existsSync, readFileSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

// Newest first: if a model isn't available to this key, the next one is tried.
const MODELS = (process.env.OPENAI_IMAGE_MODEL || 'gpt-image-2.6-flare,gpt-image-2.5-flare').split(',');
const QUALITY = process.env.OPENAI_IMAGE_QUALITY || 'medium';
const OUTPUT_RATE = 30 / 1e6; // $ per image output token (gpt-image-2.6 / 2.5 list price)
const INPUT_RATE = 5 / 1e6; // $ per text input token
const CONCURRENCY = 3;

const COMMON =
  'For a learning game for two-year-olds. Show exactly one {subject}, centred, the whole thing visible with a little space around it, ' +
  'facing the viewer. Friendly, happy and gentle, never scary. Transparent background, no ground shadow, no scenery, ' +
  'no text, no letters, no numbers, no border.';

export const STYLES = {
  storybook: 'Style: a soft hand-painted storybook illustration, gentle gouache and watercolour texture, warm cheerful colours, rounded simple shapes.',
  clay: 'Style: a cute 3D clay toy, smooth matte plasticine look, soft studio lighting, chunky rounded shapes, bright colours.',
  sticker: 'Style: a bold flat vector sticker, thick rounded dark-brown outlines, bright flat cheerful colours, very simple shapes, a thick white sticker edge around the outline.',
};

export const SAMPLES = {
  dog: 'puppy dog sitting',
  cat: 'kitten sitting',
  apple: 'shiny red apple with one green leaf',
  train: 'toy steam train engine, red and blue',
  owl: 'round brown owl with big eyes, the friendly guide of the game, waving one wing',
  tiger: 'tiger cub face (just the head), smiling',
};

// The style chosen for the games.
const STYLE = 'storybook';
const EACH = 0.045; // rough $ per picture at medium quality, for --dry

const key = process.env.OPENAI_API_KEY;
if (!key && !process.argv.includes('--dry')) {
  console.error('Set OPENAI_API_KEY to draw pictures.');
  process.exit(1);
}

let model = MODELS[0];
let spent = 0;
let transparent = true; // turned off if the model can't do see-through backgrounds

async function draw(prompt) {
  for (;;) {
    const body = { model, prompt, size: '1024x1024', quality: QUALITY, ...(transparent ? { background: 'transparent' } : {}), output_format: 'webp', n: 1 };
    const res = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => ({}));
    if (res.ok) {
      const u = json.usage ?? {};
      spent += (u.output_tokens ?? 0) * OUTPUT_RATE + (u.input_tokens ?? 0) * INPUT_RATE;
      return Buffer.from(json.data[0].b64_json, 'base64');
    }
    const msg = json.error?.message ?? res.statusText;
    if (transparent && /background|transparen/i.test(msg)) {
      console.warn(`${model}: ${msg} → drawing without a transparent background`);
      transparent = false;
      continue;
    }
    // This key can't use that model: try the next one.
    if ((res.status === 404 || /model/i.test(msg)) && MODELS.indexOf(model) < MODELS.length - 1) {
      console.warn(`${model}: ${msg} → trying ${MODELS[MODELS.indexOf(model) + 1]}`);
      model = MODELS[MODELS.indexOf(model) + 1];
      continue;
    }
    throw new Error(`${res.status} ${msg}`);
  }
}

async function drawAll(jobs) {
  // Draw the first one alone, so a model fallback happens once before the rest start.
  const queue = [...jobs];
  const failed = [];
  const one = async (j) => {
    try {
      await writeFile(j.file, await draw(j.prompt));
      console.log(`✓ ${j.file}`);
    } catch (err) {
      console.error(`✗ ${j.file}: ${err.message}`);
      failed.push(j.file);
    }
  };
  if (queue.length) await one(queue.shift());
  await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
    for (let j; (j = queue.shift()); ) await one(j);
  }));
  return failed;
}

async function full() {
  const list = JSON.parse(readFileSync('src/kids/art-list.json', 'utf8'));
  const arg = process.argv.indexOf('--only');
  const only = arg > 0 ? process.argv[arg + 1].split(',') : null;
  const todo = Object.values(list).filter(([id]) => (only ? only.includes(id) : !existsSync(`src/kids/art/${id}.webp`)));
  console.log(`${todo.length} to draw${todo.length ? `: ${todo.map(([id]) => id).join(', ')}` : ''}`);
  console.log(`about $${(todo.length * EACH).toFixed(2)} at ${QUALITY} quality`);
  if (process.argv.includes('--dry') || !todo.length) return;
  const out = 'art-raw';
  await mkdir(out, { recursive: true });
  const jobs = todo.map(([id, subject]) => ({ file: join(out, `${id}.webp`), prompt: `${COMMON.replace('{subject}', subject)} ${STYLES[STYLE]}` }));
  const failed = await drawAll(jobs);
  console.log(`${jobs.length - failed.length} pictures with ${model} (${QUALITY}), about $${spent.toFixed(2)}`);
  if (failed.length) console.error(`${failed.length} failed: ${failed.join(', ')} (run again to retry just those)`);
}

async function samples() {
  const out = 'art-samples';
  await mkdir(out, { recursive: true });
  const jobs = Object.entries(STYLES).flatMap(([style, look]) =>
    Object.entries(SAMPLES).map(([id, subject]) => ({ file: join(out, `${style}-${id}.webp`), prompt: `${COMMON.replace('{subject}', subject)} ${look}` })),
  );
  await drawAll(jobs);
  await writeFile(join(out, 'info.json'), JSON.stringify({ model, quality: QUALITY, transparent, styles: STYLES, samples: SAMPLES, common: COMMON }, null, 2));
  console.log(`${jobs.length} pictures with ${model} (${QUALITY}), about $${spent.toFixed(2)}`);
}

if (process.argv.includes('--full')) await full();
else if (process.argv.includes('--samples')) await samples();
else console.error('Run with --full or --samples.');
