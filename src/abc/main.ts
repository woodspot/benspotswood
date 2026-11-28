// ABC: tap any letter to see it big and hear it ("B! Ball!"), or play Find it! ("Find the letter B!").
import { bindVoiceButton, preload, say, sfx, stopSpeech, unlock } from '../kids/audio';
import { burst, CONFETTI, party } from '../kids/fx';
import { keepAwake, lockGestures } from '../kids/hold';
import { bindKidsNav } from '../kids/nav';
import { drawing } from '../kids/art';
import { bindLangButtons, getLang } from '../kids/lang';
import { syncOnOpen } from '../kids/sync';
import { isRight, LETTERS, letterOf, meetParts, newQuiz, questionParts, type Letter, type QuizRound } from './game';

type Mode = 'abc' | 'find';

const $ = (id: string) => document.getElementById(id)!;
const rng = Math.random;
const PARTY_ABC = 8; // letters looked at
const PARTY_FIND = 6; // right answers
const CARD_MS = 3500;
const IDLE_REMIND_MS = 25000;
const COLORS = ['#ff6b6b', '#ff9f43', '#f7c531', '#4cc274', '#2fb5d9', '#5b8def', '#9b6cf0', '#e766b5'];

let mode: Mode = 'abc';
let busy = false;
let seen = 0;
let wins = 0;
let quiz: QuizRound | null = null;
let idleTimer = 0;
let cardTimer = 0;

const stage = () => $('stage');
const colorOf = (ch: string) => COLORS[LETTERS[getLang()].findIndex((l) => l.ch === ch) % COLORS.length];

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function centerOf(el: Element): [number, number] {
  const r = el.getBoundingClientRect();
  return [r.left + r.width / 2, r.top + r.height / 2];
}

function restart(el: Element, cls: string): void {
  el.classList.remove(cls);
  void (el as HTMLElement).offsetWidth;
  el.classList.add(cls);
}

function celebrate(then: () => void): void {
  busy = true;
  sfx.fanfare();
  say('Hooray!');
  party($('party'), stage(), () => {
    busy = false;
    then();
  });
}

const tile = (ch: string, i: number) =>
  `<button class="tile" data-ch="${ch}" style="--bg:${colorOf(ch)};animation-delay:${i * 25}ms">${ch}</button>`;

/** The word with its letter picked out in colour: "<b>B</b>all". */
function wordHtml(l: Letter): string {
  const w = l.word.charAt(0).toUpperCase() + l.word.slice(1);
  const i = w.toUpperCase().indexOf(l.ch);
  return i < 0 ? w : `${w.slice(0, i)}<b>${w[i]}</b>${w.slice(i + 1)}`;
}

// ── ABC ────────────────────────────────────────────────────────

function renderBoard(): void {
  stage().className = 'stage';
  stage().innerHTML = `<div class="board">${LETTERS[getLang()].map((l, i) => tile(l.ch, i)).join('')}</div>`;
}

function closeCard(): void {
  clearTimeout(cardTimer);
  $('card').hidden = true;
  $('card').innerHTML = '';
}

function showLetter(el: HTMLElement): void {
  const l = letterOf(el.dataset.ch!, getLang());
  restart(el, 'pop');
  sfx.flip();
  const card = $('card');
  card.innerHTML = `<div class="card" style="--bg:${colorOf(l.ch)}">
    <div class="big">${l.ch}<small>${l.ch.toLowerCase()}</small></div>
    <div class="pic-word">${drawing(l.emoji)}</div>
    <div class="word">${wordHtml(l)}</div>
  </div>`;
  card.hidden = false;
  const [x, y] = centerOf(card.firstElementChild!);
  setTimeout(() => burst(stage(), x, y, CONFETTI, 16, 120), 250);
  void say(meetParts(l, getLang()));
  seen++;
  clearTimeout(cardTimer);
  cardTimer = window.setTimeout(() => {
    closeCard();
    if (seen % PARTY_ABC === 0) celebrate(() => {});
  }, CARD_MS);
}

// ── Find it! ───────────────────────────────────────────────────

function remindLater(): void {
  clearTimeout(idleTimer);
  if (mode === 'find' && quiz) {
    const q = quiz;
    idleTimer = window.setTimeout(() => say(questionParts(letterOf(q.target, getLang()), getLang())), IDLE_REMIND_MS);
  }
}

function findRound(): void {
  quiz = newQuiz(wins, getLang(), rng, quiz ?? undefined);
  stage().className = 'stage';
  stage().innerHTML = `<div class="field">${quiz.letters.map((ch, i) => tile(ch, i * 3)).join('')}</div>`;
  const ask = $('ask');
  ask.hidden = false;
  ask.innerHTML = `<span class="spk">🔊</span><span style="color:${colorOf(quiz.target)}">${quiz.target}</span>`;
  void say(questionParts(letterOf(quiz.target, getLang()), getLang()));
  remindLater();
  busy = false;
}

function answer(el: HTMLElement): void {
  if (!quiz || busy) return;
  const l = letterOf(el.dataset.ch!, getLang());
  if (!el.querySelector('.emo')) el.insertAdjacentHTML('beforeend', `<span class="emo">${drawing(l.emoji)}</span>`);
  if (!isRight(quiz, l.ch)) {
    // Not that one: it says its own name and word, so they learn it anyway.
    restart(el, 'wiggle');
    sfx.boop();
    void say(meetParts(l, getLang()));
    remindLater();
    return;
  }
  busy = true;
  clearTimeout(idleTimer);
  wins++;
  el.classList.add('found');
  sfx.match();
  const [x, y] = centerOf(el);
  burst(stage(), x, y, CONFETTI, 22, 130);
  // Let it finish saying "K is for key!" before the next letter (at least a moment to enjoy it,
  // and never stuck waiting if the voice doesn't report back).
  const spoken = say(meetParts(l, getLang()));
  const next = wins % PARTY_FIND === 0 ? () => celebrate(() => findRound()) : () => findRound();
  void Promise.race([Promise.all([spoken, wait(1500)]), wait(7000)]).then(() => setTimeout(next, 600));
}

// ── Screens ────────────────────────────────────────────────────

function start(m: Mode): void {
  unlock();
  mode = m;
  seen = 0;
  wins = 0;
  busy = false;
  quiz = null;
  $('menu').hidden = true;
  $('game').hidden = false;
  $('ask').hidden = true;
  closeCard();
  keepAwake(true);
  const lang = getLang();
  preload(LETTERS[lang].flatMap((l) => meetParts(l, lang)));
  if (m === 'abc') {
    renderBoard();
    void say('Tap a letter!');
  } else findRound();
}

function stop(): void {
  clearTimeout(idleTimer);
  closeCard();
  stopSpeech();
  keepAwake(false);
  stage().innerHTML = '';
  $('party').hidden = true;
  $('ask').hidden = true;
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
  // Respond on touch-down: quicker and more forgiving than a full click for small fingers.
  stage().addEventListener('pointerdown', (e) => {
    if (busy) return;
    const t = (e.target as HTMLElement).closest<HTMLElement>('.tile');
    if (!t) return;
    if (mode === 'abc') showLetter(t);
    else answer(t);
  });
  // Tap the card (or anywhere around it) to put it away and pick another letter.
  $('card').addEventListener('pointerdown', () => {
    closeCard();
    if (seen % PARTY_ABC === 0) celebrate(() => {});
  });
  $('ask').addEventListener('pointerdown', () => {
    if (quiz) void say(questionParts(letterOf(quiz.target, getLang()), getLang()));
    remindLater();
  });
}

init();
// Family sync: if the family has newer settings (language, voice…), start again with them.
syncOnOpen(undefined, () => !document.getElementById('menu')!.hidden && location.reload());
