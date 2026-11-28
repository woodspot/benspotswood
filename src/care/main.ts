// Pet Care: give a muddy animal a bath (scrub, rinse, dry) or feed the hungry animals at meal time.
import { bindVoiceButton, en, say, sfx, stopSpeech, unlock, type Part } from '../kids/audio';
import { burst, CONFETTI, party } from '../kids/fx';
import { awardSticker } from '../kids/stickers';
import { keepAwake, lockGestures } from '../kids/hold';
import { bindKidsNav } from '../kids/nav';
import { artUrl, drawing } from '../kids/art';
import { bindLangButtons, getLang } from '../kids/lang';
import { syncOnOpen } from '../kids/sync';
import { bindDrag, flyInto } from '../trail/drag';
import {
  BATH_STEPS, countPart, eats, foodName, MEALS, mudSpots, newMealRound, nextBather, PRAISE, petName, petSound, SAY, STEP_SAY,
  type BathStep, type MealRound, type Pet,
} from './game';

type Mode = 'bath' | 'meal';

const $ = (id: string) => document.getElementById(id)!;
const rng = Math.random;
const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const pickOne = <T>(list: readonly T[]) => list[Math.floor(rng() * list.length)];
const stage = () => $('stage');
const talk = (parts: Part[] | string, min = 500, max = 6000) => Promise.race([Promise.all([say(parts), wait(min)]), wait(max)]);
/** A drawing, or a stand-in emoji while the drawing doesn't exist yet. */
const pic = (key: string, stand: string) => (artUrl(key) ? drawing(key) : stand);
const centerOf = (el: Element): [number, number] => {
  const r = el.getBoundingClientRect();
  return [r.left + r.width / 2, r.top + r.height / 2];
};

let mode: Mode = 'bath';
let run = 0;
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

function bounce(el: Element, cls: string): void {
  el.classList.remove(cls);
  void (el as HTMLElement).offsetWidth;
  el.classList.add(cls);
}

// ── Bath ───────────────────────────────────────────────────────

const TOOLS: Record<BathStep, () => string> = {
  scrub: () => pic('🧽', '🧽'),
  rinse: () => pic('🚿', '🚿'),
  dry: () => pic('towel', '🧺'),
};

interface Spot { el: HTMLElement; left: number; } // left: how much is still to do, 1 → 0

let baths = 0;
let bather: Pet | null = null;
let bathStep: BathStep = 'scrub';
let spots: Spot[] = [];
let counted = 0;
let holding: { id: number; x: number; y: number } | null = null;
let sprayTimer = 0;

function startBath(): void {
  const my = run;
  bather = nextBather(rng, bather?.e);
  bathStep = 'scrub';
  counted = 0;
  busy = true;
  stage().className = 'stage bath';
  stage().innerHTML = `
    <div class="tub-wrap">
      <div class="bather"><span class="pet">${drawing(bather.e)}</span><div class="marks"></div></div>
      <div class="tub"><i class="foam"></i><i class="leg l"></i><i class="leg r"></i></div>
    </div>
    <div class="tool-dock"><span class="tool-home">${TOOLS.scrub()}</span></div>
    <div id="tool" class="tool" hidden></div>`;
  const marks = stage().querySelector<HTMLElement>('.marks')!;
  marks.innerHTML = mudSpots(baths, rng)
    .map((s) => `<i class="mud" style="left:${s.x}%;top:${s.y}%;--r:${s.r}%"></i>`)
    .join('');
  spots = [...marks.querySelectorAll<HTMLElement>('.mud')].map((el) => ({ el, left: 1 }));
  void (async () => {
    await talk([en(SAY.muddy)], 600, 3000);
    if (my !== run) return;
    await talk([...petName(bather!, getLang())], 300, 2500);
    if (my !== run) return;
    busy = false;
    void say(STEP_SAY.scrub);
  })();
}

function showTool(x: number, y: number): void {
  const t = $('tool');
  t.hidden = false;
  t.style.transform = `translate(${x}px, ${y}px)`;
}

function toolDown(e: PointerEvent): void {
  if (busy || holding || mode !== 'bath' || !bather) return;
  if ((e.target as HTMLElement).closest('.home')) return;
  e.preventDefault();
  unlock();
  holding = { id: e.pointerId, x: e.clientX, y: e.clientY };
  const t = $('tool');
  t.innerHTML = TOOLS[bathStep]();
  t.className = `tool t-${bathStep}`;
  stage().querySelector('.tool-dock')!.classList.add('used');
  showTool(e.clientX, e.clientY);
  if (bathStep === 'rinse') startSpray();
}

function toolMove(e: PointerEvent): void {
  if (!holding || e.pointerId !== holding.id) return;
  const d = Math.hypot(e.clientX - holding.x, e.clientY - holding.y);
  holding.x = e.clientX;
  holding.y = e.clientY;
  showTool(e.clientX, e.clientY);
  if (bathStep === 'scrub' || bathStep === 'dry') rub(e.clientX, e.clientY, d);
}

function toolUp(e: PointerEvent): void {
  if (!holding || e.pointerId !== holding.id) return;
  holding = null;
  clearInterval(sprayTimer);
  $('tool').hidden = true;
}

/** Scrubbing (or drying): moving the tool over a spot wears it away. */
function rub(x: number, y: number, moved: number): void {
  for (const s of spots) {
    if (s.left <= 0) continue;
    const r = s.el.getBoundingClientRect();
    const reach = r.width / 2 + 46;
    if (Math.hypot(x - (r.left + r.width / 2), y - (r.top + r.height / 2)) > reach) continue;
    s.left -= moved / (bathStep === 'scrub' ? 260 : 200);
    s.el.style.opacity = String(Math.max(0, s.left) * 0.85 + 0.15);
    if (bathStep === 'scrub' && Math.random() < 0.25) bubble(x, y);
    if (s.left <= 0) spotDone(s);
  }
}

function bubble(x: number, y: number): void {
  const b = document.createElement('i');
  b.className = 'bub';
  b.style.left = `${x + (Math.random() - 0.5) * 60}px`;
  b.style.top = `${y + (Math.random() - 0.5) * 40}px`;
  b.style.setProperty('--s', `${14 + Math.random() * 22}px`);
  document.body.append(b);
  setTimeout(() => b.remove(), 1400);
}

/** The shower: water falls from it, and bubbles underneath are rinsed away while it's held there. */
function startSpray(): void {
  clearInterval(sprayTimer);
  sprayTimer = window.setInterval(() => {
    if (!holding) return clearInterval(sprayTimer);
    const { x, y } = holding;
    for (let k = 0; k < 3; k++) {
      const d = document.createElement('i');
      d.className = 'water';
      d.style.left = `${x + (Math.random() - 0.5) * 70}px`;
      d.style.top = `${y + 30}px`;
      document.body.append(d);
      setTimeout(() => d.remove(), 700);
    }
    for (const s of spots) {
      if (s.left <= 0) continue;
      const r = s.el.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      // Anywhere in the spray below the shower head.
      if (Math.abs(cx - x) < r.width / 2 + 55 && cy > y - 30 && cy - y < 380) {
        s.left -= 0.12;
        s.el.style.opacity = String(Math.max(0, s.left));
        if (s.left <= 0) spotDone(s);
      }
    }
  }, 70);
}

function spotDone(s: Spot): void {
  s.left = 0;
  const [x, y] = centerOf(s.el);
  if (bathStep === 'scrub') {
    // The mud turns into bubbles, and we count it.
    s.el.className = 'soap';
    s.el.style.opacity = '1';
    counted++;
    sfx.count(counted);
    void say([countPart(counted, getLang())]);
    for (let k = 0; k < 5; k++) bubble(x, y);
  } else {
    s.el.remove();
    sfx.pop();
    if (bathStep === 'dry') burst(stage(), x, y, ['#ffffff', '#bfe6ff'], 6, 40);
  }
  if (spots.every((p) => p.left <= 0)) void nextStep();
}

async function nextStep(): Promise<void> {
  const my = run;
  busy = true;
  holding = null;
  clearInterval(sprayTimer);
  $('tool').hidden = true;
  const i = BATH_STEPS.indexOf(bathStep);
  sfx.yay();
  await talk(pickOne(PRAISE), 600, 2500);
  if (my !== run) return;
  if (i === BATH_STEPS.length - 1) return finishBath();
  bathStep = BATH_STEPS[i + 1];
  // Rinse: the soap spots are the bubbles to rinse. Dry: water drops all over.
  if (bathStep === 'rinse') spots = [...stage().querySelectorAll<HTMLElement>('.soap')].map((el) => ({ el, left: 1 }));
  else {
    const marks = stage().querySelector<HTMLElement>('.marks')!;
    marks.innerHTML = mudSpots(baths + 2, rng)
      .map((s) => `<i class="wet" style="left:${s.x}%;top:${s.y}%;--r:${s.r * 0.8}%"></i>`)
      .join('');
    spots = [...marks.querySelectorAll<HTMLElement>('.wet')].map((el) => ({ el, left: 1 }));
  }
  const dock = stage().querySelector('.tool-dock')!;
  dock.classList.remove('used');
  dock.querySelector('.tool-home')!.innerHTML = TOOLS[bathStep]();
  bounce(dock, 'pop');
  busy = false;
  void say(STEP_SAY[bathStep]);
}

async function finishBath(): Promise<void> {
  const my = run;
  baths++;
  stage().querySelector('.tool-dock')!.classList.add('used');
  const b = stage().querySelector('.bather')!;
  b.classList.add('clean');
  const [x, y] = centerOf(b);
  burst(stage(), x, y, ['#ffffff', '#ffd34d', '#bfe6ff', '#f7b2e0'], 30, 160);
  await talk([...petSound(bather!), en(SAY.clean)], 1200, 7000);
  if (my !== run) return;
  if (baths % 2 === 0) celebrate(() => startBath());
  else {
    await wait(700);
    if (my === run) startBath();
  }
}

// ── Meal time ──────────────────────────────────────────────────

let meals = 0;
let round: MealRound | null = null;
let unbindDrag: (() => void) | null = null;

function startMeal(): void {
  const my = run;
  round = newMealRound(meals, rng, round ?? undefined);
  const hints = meals < 3; // at first, each animal shows what it would like
  stage().className = 'stage meal';
  stage().innerHTML = `
    <div class="diners">${round.meals
      .map((m, k) => `<div class="diner drop ${hints ? 'hinting' : ''}" data-pet="${m.pet.e}" style="animation-delay:${k * 120}ms">
        <span class="wish">${drawing(m.food.e)}</span>
        <span class="pet">${drawing(m.pet.e)}</span>
        <span class="bowl"></span>
      </div>`)
      .join('')}</div>
    <div class="basket">${round.tray.map((f) => `<span class="food piece" data-food="${f}">${drawing(f)}</span>`).join('')}</div>`;
  bindMeal();
  busy = true;
  void (async () => {
    await talk(SAY.meal, 600, 4000);
    if (my !== run) return;
    busy = false;
  })();
}

const mealOf = (petE: string) => MEALS.find((m) => m.pet.e === petE)!;

function bindMeal(): void {
  unbindDrag?.();
  unbindDrag = bindDrag({
    root: stage(),
    piece: '.food',
    target: '.diner:not(.fed)',
    onPick: (el) => {
      unlock();
      const m = MEALS.find((x) => x.food.e === el.dataset.food);
      if (m) void say(foodName(m.food, getLang()));
    },
    onDrop: (el, target) => {
      if (!target || busy) return false;
      const petE = target.dataset.pet!;
      if (!eats(petE, el.dataset.food!)) {
        // Not this one's favourite: a polite "no thank you", and now it shows what it wants.
        bounce(target, 'shake');
        target.classList.add('hinting');
        void say([...petName(mealOf(petE).pet, getLang()), en(SAY.noThanks)]);
        return false;
      }
      void feed(el, target);
      return true;
    },
  });
}

async function feed(food: HTMLElement, diner: HTMLElement): Promise<void> {
  const my = run;
  const m = mealOf(diner.dataset.pet!);
  diner.classList.add('fed');
  await flyInto(food, diner.querySelector('.pet')!, 0.5);
  food.classList.add('eaten');
  bounce(diner, 'chomp');
  sfx.match();
  const [x, y] = centerOf(diner);
  burst(stage(), x, y, CONFETTI, 16, 100);
  await talk([...petSound(m.pet), en(SAY.yum)], 800, 6000);
  if (my !== run || !round) return;
  if (stage().querySelectorAll('.diner:not(.fed)').length) return;
  busy = true;
  meals++;
  await talk(SAY.full, 600, 3000);
  if (my !== run) return;
  if (meals % 2 === 0) celebrate(() => startMeal());
  else {
    busy = false;
    startMeal();
  }
}

// ── Screens ────────────────────────────────────────────────────

function start(m: Mode): void {
  unlock();
  run++;
  mode = m;
  busy = false;
  baths = 0;
  meals = 0;
  $('menu').hidden = true;
  $('game').hidden = false;
  keepAwake(true);
  if (m === 'bath') {
    const my = run;
    void say(SAY.bath);
    setTimeout(() => my === run && startBath(), 900);
  } else startMeal();
}

function stop(): void {
  run++;
  holding = null;
  clearInterval(sprayTimer);
  unbindDrag?.();
  unbindDrag = null;
  round = null;
  stopSpeech();
  keepAwake(false);
  stage().innerHTML = '';
  $('party').hidden = true;
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
  stage().addEventListener('pointerdown', toolDown);
  window.addEventListener('pointermove', toolMove);
  window.addEventListener('pointerup', toolUp);
  window.addEventListener('pointercancel', toolUp);
}

init();
// Family sync: pick up the family's newer settings (language, voice…).
syncOnOpen(undefined, () => !document.getElementById('menu')!.hidden && location.reload());
