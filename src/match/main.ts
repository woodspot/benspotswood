// Match It: a matching game for toddlers. "Same" asks them to find the twin of one picture;
// "Memory" is pairs with face-down cards, starting tiny. No losing, very little talking.
import { bindVoiceButton, say, sfx, unlock } from '../kids/audio';
import { burst, CONFETTI, party } from '../kids/fx';
import { holdToExit, keepAwake, lockGestures } from '../kids/hold';
import {
  flip, gridFor, hideMiss, MEMORY_PAIRS, newMemory, newSame, PICS,
  type Memory, type SameRound, type Theme,
} from './game';

type Mode = 'same' | 'memory';

const $ = (id: string) => document.getElementById(id)!;
const rng = Math.random;
const CELEBRATE_EVERY = 5; // Same: a party after this many right answers
const IDLE_REMIND_MS = 25000;

let mode: Mode = 'same';
let theme: Theme = (localStorage.getItem('match.theme') as Theme) || 'animals';
let busy = false; // ignore taps during animations and parties
let wins = 0; // right answers (Same) or boards cleared (Memory) this session
let level = 0; // Memory board size
let same: SameRound | null = null;
let memory: Memory | null = null;
let idleTimer = 0;

const stage = () => $('stage');
const picOf = (i: number) => PICS[theme][i];

// ── Cards ──────────────────────────────────────────────────────

function cardHtml(i: number, pic: number, up: boolean, extra = ''): string {
  return `<button class="card ${up ? 'up' : ''} ${extra}" data-i="${i}" aria-label="${up ? picOf(pic).name : 'card'}">
    <span class="inner"><span class="face front">${picOf(pic).e}</span><span class="face cover"></span></span>
  </button>`;
}

/** Size cards to fill the space: sets --cw (card width) on the board. */
function fit(board: HTMLElement, n: number, topSpace: number, forceCols?: number): void {
  const pad = 16;
  const w = innerWidth - pad * 2;
  const h = innerHeight - topSpace - pad * 2 - 20;
  const grid = gridFor(n, w, h);
  const cols = forceCols ?? grid.cols;
  const rows = forceCols ? Math.ceil(n / forceCols) : grid.rows;
  const gap = Math.max(10, Math.min(22, w * 0.03));
  const cw = Math.floor(Math.min((w - gap * (cols - 1)) / cols, ((h - gap * (rows - 1)) / rows) * 0.75, 220));
  board.style.setProperty('--cw', `${cw}px`);
  board.style.setProperty('--gap', `${gap}px`);
  board.style.gridTemplateColumns = `repeat(${cols}, var(--cw))`;
}

function centerOf(el: Element): [number, number] {
  const r = el.getBoundingClientRect();
  return [r.left + r.width / 2, r.top + r.height / 2];
}

function wiggle(el: Element): void {
  el.classList.remove('wiggle');
  void (el as HTMLElement).offsetWidth;
  el.classList.add('wiggle');
}

function remindLater(text: string): void {
  clearTimeout(idleTimer);
  idleTimer = window.setTimeout(() => say(text), IDLE_REMIND_MS);
}

// ── Same ───────────────────────────────────────────────────────

function sameRound(first = false): void {
  same = newSame(theme, wins, rng, same?.target);
  const { target, options } = same;
  stage().innerHTML = `
    <div class="same-top"><div class="target-card">${cardHtml(-1, target, true, 'big')}</div></div>
    <div class="board" id="board">${options.map((p, i) => cardHtml(i, p, true, 'deal')).join('')}</div>`;
  const board = $('board');
  // The picture to match sits on top; the choices sit side by side underneath (2 × 2 for four).
  const targetW = Math.round(Math.min(innerWidth * 0.4, innerHeight * 0.24, 200));
  const topH = targetW * (4 / 3) + 40;
  stage().style.setProperty('--top', `${topH}px`);
  stage().style.setProperty('--tw', `${targetW}px`);
  fit(board, options.length, topH, options.length === 4 ? 2 : options.length);
  board.querySelectorAll<HTMLElement>('.card').forEach((c, k) => (c.style.animationDelay = `${k * 70}ms`));
  if (first) say('Find the same one!');
  remindLater('Find the same one!');
  busy = false;
}

function onSameTap(card: HTMLElement): void {
  if (!same) return;
  const i = Number(card.dataset.i);
  const pic = same.options[i];
  if (pic !== same.target) {
    sfx.boop();
    wiggle(card);
    wiggle($('stage').querySelector('.target-card')!);
    return;
  }
  busy = true;
  clearTimeout(idleTimer);
  wins++;
  sfx.match();
  card.classList.add('found');
  stage().querySelector('.target-card .card')?.classList.add('found');
  const [x, y] = centerOf(card);
  burst(stage(), x, y, CONFETTI, 22, 130);
  say(`${cap(picOf(pic).name)}!`);
  if (wins % CELEBRATE_EVERY === 0) setTimeout(() => celebrate(() => sameRound()), 900);
  else setTimeout(() => sameRound(), 1400);
}

// ── Memory ─────────────────────────────────────────────────────

function memoryBoard(first = false): void {
  const pairs = MEMORY_PAIRS[Math.min(level, MEMORY_PAIRS.length - 1)];
  memory = newMemory(theme, pairs, rng);
  stage().style.setProperty('--top', '70px');
  stage().innerHTML = `<div class="board memory" id="board">${memory.cards.map((c, i) => cardHtml(i, c.pic, true, 'deal')).join('')}</div>`;
  const board = $('board');
  fit(board, memory.cards.length, 70);
  board.querySelectorAll<HTMLElement>('.card').forEach((c, k) => (c.style.animationDelay = `${k * 60}ms`));
  if (first) say('Find the pairs!');
  // A peek first: everything face up for a moment, then turned over.
  busy = true;
  setTimeout(() => {
    board.querySelectorAll('.card').forEach((c) => c.classList.remove('up'));
    sfx.flip();
    busy = false;
    remindLater('Find the pairs!');
  }, 1200 + pairs * 500);
}

function onMemoryTap(card: HTMLElement): void {
  if (!memory) return;
  const i = Number(card.dataset.i);
  const res = flip(memory, i);
  if (res.kind === 'ignored') return;
  card.classList.add('up');
  sfx.flip();
  remindLater('Find the pairs!');
  if (res.kind === 'match') {
    const shown = [...stage().querySelectorAll<HTMLElement>('.card')].filter((c) => memory!.cards[Number(c.dataset.i)].pic === res.pic);
    setTimeout(() => {
      sfx.match();
      shown.forEach((c) => {
        c.classList.add('found');
        const [x, y] = centerOf(c);
        burst(stage(), x, y, CONFETTI, 14, 90);
      });
      say(`${cap(picOf(res.pic).name)}!`);
    }, 250);
    if (res.done) {
      busy = true;
      clearTimeout(idleTimer);
      wins++;
      level++;
      setTimeout(() => celebrate(() => memoryBoard()), 1300);
    }
  } else if (res.kind === 'miss') {
    busy = true;
    setTimeout(() => {
      hideMiss(memory!);
      stage().querySelectorAll('.card.up:not(.found)').forEach((c) => c.classList.remove('up'));
      busy = false;
    }, 1100);
  }
}

// ── Party, screens ─────────────────────────────────────────────

function celebrate(then: () => void): void {
  busy = true;
  sfx.fanfare();
  say('Hooray!');
  party($('party'), stage(), then);
}

const cap = (w: string) => w[0].toUpperCase() + w.slice(1);

function start(m: Mode): void {
  unlock();
  mode = m;
  wins = 0;
  level = 0;
  same = null;
  $('menu').hidden = true;
  $('game').hidden = false;
  keepAwake(true);
  if (m === 'same') sameRound(true);
  else memoryBoard(true);
}

function stop(): void {
  clearTimeout(idleTimer);
  speechSynthesis?.cancel();
  keepAwake(false);
  stage().innerHTML = '';
  $('party').hidden = true;
  $('game').hidden = true;
  $('menu').hidden = false;
}

function renderThemes(): void {
  const icons: Record<Theme, string> = { animals: '🐶', vehicles: '🚗', food: '🍎' };
  $('themes').innerHTML = (Object.keys(icons) as Theme[])
    .map((t) => `<button class="theme ${t === theme ? 'sel' : ''}" data-theme="${t}" aria-label="${t}">${icons[t]}</button>`)
    .join('');
}

function init(): void {
  renderThemes();
  $('themes').addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('[data-theme]');
    if (!b) return;
    theme = b.dataset.theme as Theme;
    localStorage.setItem('match.theme', theme);
    unlock();
    sfx.flip();
    renderThemes();
  });
  $('modes').addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('[data-mode]');
    if (b) start(b.dataset.mode as Mode);
  });
  bindVoiceButton($('voice'));
  holdToExit($('home'), stop);
  lockGestures();
  // Respond on touch-down: quicker and more forgiving than a full click for small fingers.
  stage().addEventListener('pointerdown', (e) => {
    if (busy) return;
    const card = (e.target as HTMLElement).closest<HTMLElement>('.board .card');
    if (!card) return;
    if (mode === 'same') onSameTap(card);
    else onMemoryTap(card);
  });
  let resizeTimer = 0;
  addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(() => {
      const board = document.getElementById('board');
      if (!board) return;
      if (mode === 'same') sameRound();
      else fit(board, board.children.length, 70);
    }, 150);
  });
}

init();
