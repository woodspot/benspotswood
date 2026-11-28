// The Band: play in an animal band, copy the xylophone's tunes, or play songs by following the lights.
import { bindVoiceButton, en, say, sfx, stopSpeech, unlock, type Part } from '../kids/audio';
import { burst, CONFETTI, party } from '../kids/fx';
import { awardSticker } from '../kids/stickers';
import { keepAwake, lockGestures } from '../kids/hold';
import { bindKidsNav } from '../kids/nav';
import { drawing } from '../kids/art';
import { bindLangButtons, getLang } from '../kids/lang';
import { syncOnOpen } from '../kids/sync';
import { soundUrl } from '../kids/sounds';
import {
  BAR_COLORS, BAR_NOTES, barsFor, DRUM_RIFF, INSTRUMENTS, instrumentParts, newTune, PRAISE, RIFFS, SAY, SONGS, songParts,
  type Instrument, type Song,
} from './game';
import { beatOn, playDrum, playMaracas, playNote, setBeat } from './synth';

type Mode = 'band' | 'copy' | 'songs';

const $ = (id: string) => document.getElementById(id)!;
const rng = Math.random;
const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const pickOne = <T>(list: readonly T[]) => list[Math.floor(rng() * list.length)];
const stage = () => $('stage');
/** Speak, and resolve when done (but never wait forever). */
const talk = (parts: Part[] | string, min = 400, max = 5000) => Promise.race([Promise.all([say(parts), wait(min)]), wait(max)]);
const centerOf = (el: Element): [number, number] => {
  const r = el.getBoundingClientRect();
  return [r.left + r.width / 2, r.top + r.height / 2];
};

let mode: Mode = 'band';
let run = 0; // bumps whenever a game starts or stops, so old waits know to give up
let busy = false;

function celebrate(then: () => void): void {
  busy = true;
  const my = run;
  sfx.fanfare();
  void say('Hooray!');
  party($('party'), stage(), () =>
    awardSticker(() => {
      busy = false;
      if (my === run) then();
    }),
  );
}

/** Little music notes float up from a spot. */
function notesFrom(el: Element, color = '#fff'): void {
  const [x, y] = centerOf(el);
  const n = document.createElement('span');
  n.className = 'note-fly';
  n.textContent = pickOne(['♪', '♫', '♩', '♬']);
  n.style.left = `${x + (rng() - 0.5) * 40}px`;
  n.style.top = `${y - 30}px`;
  n.style.color = color;
  document.body.append(n);
  setTimeout(() => n.remove(), 1200);
}

function bounce(el: Element, cls = 'bop'): void {
  el.classList.remove(cls);
  void (el as HTMLElement).offsetWidth;
  el.classList.add(cls);
}

// ── Band ───────────────────────────────────────────────────────

const step: Record<string, number> = {};
const taps: Record<string, number> = {};
let bandTaps = 0;
const BAND_PARTY = 40;

function renderBand(): void {
  stage().className = 'stage band';
  stage().innerHTML = `<div class="players">${INSTRUMENTS.map(
    (i, k) => `<button class="player" data-inst="${i.id}" style="--c:${i.color};animation-delay:${k * 70}ms">
      <span class="who">${drawing(i.player)}</span>
      <span class="inst">${drawing(i.e)}</span>
    </button>`,
  ).join('')}</div>`;
  $('beat').hidden = false;
  renderBeat();
}

function renderBeat(): void {
  $('beat').classList.toggle('on', beatOn());
  stage().classList.toggle('grooving', beatOn());
}

function playInstrument(i: Instrument, k: number): void {
  if (i.id === 'drum') playDrum(DRUM_RIFF[k % DRUM_RIFF.length]);
  else if (i.id === 'maracas') playMaracas();
  else playNote(i.id, RIFFS[i.id][k % RIFFS[i.id].length]);
}

function tapPlayer(el: HTMLElement): void {
  const i = INSTRUMENTS.find((x) => x.id === el.dataset.inst)!;
  const k = (step[i.id] = (step[i.id] ?? -1) + 1);
  playInstrument(i, k);
  bounce(el);
  notesFrom(el, i.color);
  taps[i.id] = (taps[i.id] ?? 0) + 1;
  // Say what it is the first time, and now and then after that.
  if (taps[i.id] % 12 === 1) void say(instrumentParts(i, getLang()));
  if (++bandTaps % BAND_PARTY === 0) {
    setBeat(false);
    renderBeat();
    celebrate(() => {});
  }
}

// ── The xylophone (Copy me and Songs) ──────────────────────────

function barsHtml(n: number): string {
  return `<div class="bars">${BAR_NOTES.slice(0, n)
    .map((_, b) => `<button class="bar" data-bar="${b}" style="--c:${BAR_COLORS[b]};--h:${100 - b * 5}%"><i></i><i></i></button>`)
    .join('')}</div>`;
}

const barEl = (b: number) => stage().querySelector<HTMLElement>(`[data-bar="${b}"]`);

function strike(b: number, at = 0): void {
  playNote('xylophone', BAR_NOTES[b], at);
  const el = barEl(b);
  if (!el) return;
  setTimeout(() => {
    bounce(el, 'hit');
    notesFrom(el, BAR_COLORS[b]);
  }, at * 1000);
}

/** Play a list of bars in time; resolves when finished (or stopped). */
async function playBars(bars: number[], gap: number, my: number): Promise<boolean> {
  for (const b of bars) {
    if (my !== run) return false;
    strike(b);
    await wait(gap);
  }
  return my === run;
}

// ── Copy me ────────────────────────────────────────────────────

let wins = 0;
let tune: number[] = [];
let got = 0;
let listening = false;
let missed = false;

async function copyRound(): Promise<void> {
  const my = run;
  tune = newTune(wins, rng);
  got = 0;
  missed = false;
  listening = false;
  stage().className = 'stage copy';
  stage().innerHTML = `<div class="teacher">${drawing('🐰')}</div><div class="dots">${tune.map(() => '<i></i>').join('')}</div>${barsHtml(barsFor(wins))}`;
  $('ask').hidden = false;
  await playTune(my);
}

async function playTune(my: number): Promise<void> {
  listening = false;
  stage().classList.add('demo');
  bounce(stage().querySelector('.teacher')!, 'bop');
  await talk(SAY.listen, 300, 2500);
  if (my !== run) return;
  await wait(250);
  if (!(await playBars(tune, 650, my))) return;
  stage().classList.remove('demo');
  void talk(SAY.yourTurn);
  got = 0;
  renderDots();
  listening = true;
  hint();
}

function renderDots(): void {
  stage().querySelectorAll('.dots i').forEach((d, k) => d.classList.toggle('on', k < got));
}

/** After a mistake, the next bar to play glows a little. */
function hint(): void {
  stage().querySelectorAll('.bar.hint').forEach((b) => b.classList.remove('hint'));
  if (missed && listening) barEl(tune[got])?.classList.add('hint');
}

function copyTap(b: number): void {
  if (stage().classList.contains('demo')) return; // listening to the tune
  strike(b);
  if (!listening) return;
  if (b !== tune[got]) {
    // Not that one: hear it again, with a little help this time.
    listening = false;
    missed = true;
    const my = run;
    void wait(500).then(async () => {
      if (my !== run) return;
      await talk(SAY.again, 300, 2500);
      if (my === run) await playTune(my);
    });
    return;
  }
  got++;
  renderDots();
  hint();
  if (got < tune.length) return;
  listening = false;
  wins++;
  const my = run;
  const [x, y] = centerOf(stage().querySelector('.dots')!);
  burst(stage(), x, y, CONFETTI, 22, 130);
  sfx.yay();
  void talk(pickOne(PRAISE), 700, 2500).then(() => {
    if (my !== run) return;
    if (wins % 4 === 0) celebrate(() => void copyRound());
    else void copyRound();
  });
}

// ── Songs ──────────────────────────────────────────────────────

let song: Song | null = null;
let pos = 0;

function songMenu(): void {
  song = null;
  $('ask').hidden = true;
  stage().className = 'stage songs';
  stage().innerHTML = `<div class="song-picks">${SONGS.map(
    (s, k) => `<button class="song-pick" data-song="${s.id}" style="--c:${BAR_COLORS[(k * 2) % 8]}"><span>${drawing(s.e)}</span><small>♪ ♫</small></button>`,
  ).join('')}</div>`;
  void say(SAY.pickSong);
}

function startSong(s: Song): void {
  song = s;
  pos = 0;
  $('ask').hidden = false;
  stage().className = 'stage songs playing';
  stage().innerHTML = `<div class="song-title">${drawing(s.e)}</div>
    <div class="song-dots">${s.bars.map((b) => `<i style="--c:${BAR_COLORS[b]}"></i>`).join('')}</div>${barsHtml(8)}`;
  void talk([...songParts(s, getLang()), en(SAY.shine)]);
  shine();
}

function shine(): void {
  if (!song) return;
  stage().querySelectorAll('.bar.shine').forEach((b) => b.classList.remove('shine'));
  barEl(song.bars[pos])?.classList.add('shine');
  stage().querySelectorAll('.song-dots i').forEach((d, k) => d.classList.toggle('on', k < pos));
}

function songTap(b: number): void {
  if (!song || busy) return;
  if (b !== song.bars[pos]) {
    playNote('xylophone', BAR_NOTES[b], 0, 0.5);
    const want = barEl(song.bars[pos]);
    if (want) bounce(want, 'wiggle');
    return;
  }
  strike(b);
  pos++;
  shine();
  if (pos < song.bars.length) return;
  void finishSong(song);
}

async function finishSong(s: Song): Promise<void> {
  busy = true;
  const my = run;
  stage().querySelectorAll('.bar.shine').forEach((x) => x.classList.remove('shine'));
  await wait(600);
  // Now the whole song, all together, to hear what they played.
  if (!(await playBars(s.bars, 420, my))) return;
  if (s.sound && soundUrl(s.sound)) await talk([{ ...en('Moo!'), sound: s.sound }], 600, 4000);
  if (my !== run) return;
  busy = false;
  celebrate(() => songMenu());
}

// ── Screens ────────────────────────────────────────────────────

function start(m: Mode): void {
  unlock();
  run++;
  mode = m;
  busy = false;
  wins = 0;
  bandTaps = 0;
  $('menu').hidden = true;
  $('game').hidden = false;
  $('ask').hidden = true;
  $('beat').hidden = true;
  keepAwake(true);
  if (m === 'band') {
    renderBand();
    void say(SAY.band);
  } else if (m === 'copy') void copyRound();
  else songMenu();
}

function stop(): void {
  run++;
  setBeat(false);
  stopSpeech();
  keepAwake(false);
  song = null;
  listening = false;
  stage().innerHTML = '';
  $('party').hidden = true;
  $('ask').hidden = true;
  $('beat').hidden = true;
  $('game').hidden = true;
  $('menu').hidden = false;
}

function init(): void {
  $('modes').addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('[data-mode]');
    if (b) start(b.dataset.mode as Mode);
  });
  bindVoiceButton($('voice'));
  bindLangButtons($('lang'));
  bindKidsNav(stop);
  lockGestures();
  // Play on touch-down, like a real instrument.
  stage().addEventListener('pointerdown', (e) => {
    if (busy) return;
    const t = e.target as HTMLElement;
    const p = t.closest<HTMLElement>('.player');
    if (p) return tapPlayer(p);
    const bar = t.closest<HTMLElement>('.bar');
    if (bar) {
      const b = Number(bar.dataset.bar);
      return mode === 'copy' ? copyTap(b) : songTap(b);
    }
    const sp = t.closest<HTMLElement>('.song-pick');
    if (sp) startSong(SONGS.find((s) => s.id === sp.dataset.song)!);
  });
  for (const id of ['beat', 'ask']) $(id).addEventListener('pointerdown', (e) => e.stopPropagation());
  $('beat').addEventListener('click', () => {
    unlock();
    const on = !beatOn();
    setBeat(on);
    renderBeat();
    if (on) void say(SAY.together);
  });
  $('ask').addEventListener('click', () => {
    if (busy) return;
    if (mode === 'copy' && listening) void playTune(run);
    else if (mode === 'songs' && song) void say([...songParts(song, getLang()), en(SAY.shine)]);
  });
}

init();
// Family sync: pick up the family's newer settings (language, voice…).
syncOnOpen(undefined, () => !document.getElementById('menu')!.hidden && location.reload());
