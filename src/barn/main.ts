// Barnyard: a farm full of hiding places. Peek: tap the barn, the haystack, the pond… and an animal
// pops out, makes its sound and says its name. Who says?: find the animal that says "moo".
import { bindVoiceButton, say, sfx, stopSpeech, tone, unlock } from '../kids/audio';
import { burst, CONFETTI, party } from '../kids/fx';
import { keepAwake, lockGestures } from '../kids/hold';
import { bindKidsNav } from '../kids/nav';
import { bindLangButtons, getLang } from '../kids/lang';
import { syncOnOpen } from '../kids/sync';
import {
  ANIMAL_MAP, hideAnimals, isRight, meetParts, newQuiz, questionParts, rehide, SPOTS,
  type QuizRound, type Spot,
} from './game';

type Mode = 'peek' | 'quiz';

const $ = (id: string) => document.getElementById(id)!;
const rng = Math.random;
const PARTY_EVERY = 6; // Peek: animals found; Who says: right answers
const IDLE_REMIND_MS = 25000;

let mode: Mode = 'peek';
let busy = false;
let found = 0;
let wins = 0;
let hidden = hideAnimals(rng);
let open: Spot | null = null;
let quiz: QuizRound | null = null;
let idleTimer = 0;

const stage = () => $('stage');
const word = (id: string) => (getLang() === 'es' ? ANIMAL_MAP[id].name.es : ANIMAL_MAP[id].name.en);

/** A happy little "boing" when something opens. */
function boing(): void {
  tone(392, 0, 0.12, 'triangle', 0.18);
  tone(587, 0.07, 0.16, 'triangle', 0.16);
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

function remindLater(): void {
  clearTimeout(idleTimer);
  if (mode === 'quiz' && quiz) idleTimer = window.setTimeout(() => say(questionParts(quiz!.question, getLang())), IDLE_REMIND_MS);
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

// ── Peek ───────────────────────────────────────────────────────

/** The hiding places, drawn with CSS (and a couple of emoji). */
const COVER: Record<Spot, string> = {
  barn: '<span class="barn"><i class="roof"></i><i class="door l"></i><i class="door r"></i></span>',
  hay: '<span class="hay"></span>',
  tree: '<span class="emoji-cover">🌳</span>',
  pond: '<span class="pond"></span>',
  coop: '<span class="coop"><i class="roof"></i><i class="hole"></i></span>',
  tractor: '<span class="emoji-cover">🚜</span>',
  flowers: '<span class="emoji-cover flowers">🌻🌼🌷</span>',
  fence: '<span class="fence"><i></i><i></i><i></i><i></i></span>',
};

function renderFarm(): void {
  stage().className = 'stage farm';
  stage().innerHTML = `<div class="spots">${SPOTS.map(
    (s) => `<button class="spot s-${s}" data-spot="${s}" aria-label="${s}">
      <span class="animal">${ANIMAL_MAP[hidden[s]].emoji}</span>
      ${COVER[s]}
      <span class="name"></span>
    </button>`,
  ).join('')}</div>`;
}

function peek(spotEl: HTMLElement): void {
  const spot = spotEl.dataset.spot as Spot;
  if (open) return; // one at a time, so every animal gets its moment
  const id = hidden[spot];
  open = spot;
  boing();
  spotEl.querySelector('.animal')!.textContent = ANIMAL_MAP[id].emoji;
  spotEl.querySelector('.name')!.textContent = word(id);
  spotEl.classList.add('open');
  const [x, y] = centerOf(spotEl);
  setTimeout(() => burst(stage(), x, y - 20, CONFETTI, 12, 80), 200);
  void say(meetParts(ANIMAL_MAP[id], getLang()));
  found++;
  setTimeout(() => {
    spotEl.classList.remove('open');
    open = null;
    // Someone new hides there next time.
    hidden = rehide(hidden, spot, rng);
    setTimeout(() => {
      spotEl.querySelector('.animal')!.textContent = ANIMAL_MAP[hidden[spot]].emoji;
    }, 400);
    if (found % PARTY_EVERY === 0) celebrate(() => {});
  }, 2600);
}

// ── Who says? ──────────────────────────────────────────────────

function quizRound(): void {
  quiz = newQuiz(wins, rng, quiz ?? undefined);
  stage().className = 'stage meadow';
  stage().innerHTML = `<div class="field">${quiz.animals
    .map((id, i) => `<button class="critter" data-animal="${id}" style="animation-delay:${i * 90}ms"><span>${ANIMAL_MAP[id].emoji}</span><span class="name"></span></button>`)
    .join('')}</div>`;
  const ask = $('ask');
  ask.hidden = false;
  const a = ANIMAL_MAP[quiz.question.animal];
  ask.innerHTML = quiz.question.kind === 'sound'
    ? `<span class="spk">🔊</span><span class="said">${getLang() === 'es' ? a.sound.es : a.sound.en}</span>`
    : `<span class="spk">🔊</span><span class="said">${word(a.id)}?</span>`;
  void say(questionParts(quiz.question, getLang()));
  remindLater();
  busy = false;
}

function answer(el: HTMLElement): void {
  if (!quiz || busy) return;
  const id = el.dataset.animal!;
  el.querySelector('.name')!.textContent = word(id);
  if (!isRight(quiz, id)) {
    // Not that one: it says its own sound and name, so they learn it anyway.
    wiggle(el);
    sfx.boop();
    void say(meetParts(ANIMAL_MAP[id], getLang()));
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
  void say(meetParts(ANIMAL_MAP[id], getLang()));
  if (wins % PARTY_EVERY === 0) setTimeout(() => celebrate(() => quizRound()), 1400);
  else setTimeout(() => quizRound(), 2200);
}

// ── Screens ────────────────────────────────────────────────────

function start(m: Mode): void {
  unlock();
  mode = m;
  found = 0;
  wins = 0;
  busy = false;
  open = null;
  quiz = null;
  $('menu').hidden = true;
  $('game').hidden = false;
  $('ask').hidden = true;
  keepAwake(true);
  if (m === 'peek') {
    hidden = hideAnimals(rng);
    renderFarm();
    void say('Who’s hiding on the farm?');
  } else quizRound();
}

function stop(): void {
  clearTimeout(idleTimer);
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
    const t = e.target as HTMLElement;
    const spot = t.closest<HTMLElement>('.spot');
    if (spot) return peek(spot);
    const critter = t.closest<HTMLElement>('.critter');
    if (critter) answer(critter);
  });
  $('ask').addEventListener('pointerdown', () => {
    if (quiz) void say(questionParts(quiz.question, getLang()));
    remindLater();
  });
}

init();
// Family sync: if the family has newer settings (language, voice…), start again with them.
syncOnOpen(undefined, () => !document.getElementById('menu')!.hidden && location.reload());
