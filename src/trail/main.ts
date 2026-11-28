// Hoot's Trail: pick your player, walk the trail stop by stop, earn stickers.
import { bindVoiceButton, en, preload, say, sfx, stopSpeech, unlock, type Part } from '../kids/audio';
import { burst, CONFETTI, party } from '../kids/fx';
import { keepAwake, lockGestures } from '../kids/hold';
import { bindLangButtons, getLang } from '../kids/lang';
import { bindKidsNav } from '../kids/nav';
import { drawing } from '../kids/art';
import { syncOnOpen } from '../kids/sync';
import { letterOf } from '../abc/game';
import { COLOR_HEX } from '../balloons/game';
import {
  AVATARS, choiceParts, finishStop, isOpen, isRight, KIND_ICON, LETS_COUNT, newLesson, newPlayer, newSticker, numberPart,
  PRAISE, promptParts, STICKERS, stickerParts, STOP_COUNT, STOPS, STOPS_PER_WORLD, TRY_AGAIN, WORLDS, worldParts,
  type Player, type Question, type ShapeId,
} from './game';

const $ = (id: string) => document.getElementById(id)!;
const rng = Math.random;
const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
/** Speak, and resolve when done (but never wait forever if the voice doesn't report back). */
const talk = (parts: Part[] | string, min = 600, max = 6000) => {
  const hoot = document.querySelector('.hoot-btn');
  hoot?.classList.add('talking');
  return Promise.race([Promise.all([say(parts), wait(min)]), wait(max)]).then(() => hoot?.classList.remove('talking'));
};
const pickOne = <T>(list: readonly T[]) => list[Math.floor(rng() * list.length)];

// ── Players, saved on this device (and shared by family sync) ──

const ROSTER_KEY = 'trail.roster';
const playerKey = (id: string) => `trail.p.${id}`;

function loadPlayers(): Player[] {
  let ids: string[] = [];
  try {
    ids = JSON.parse(localStorage.getItem(ROSTER_KEY) ?? '[]');
  } catch { /* start fresh */ }
  const list = ids
    .map((id) => {
      try {
        return { ...newPlayer('🐯', id), ...JSON.parse(localStorage.getItem(playerKey(id)) ?? 'null') } as Player;
      } catch {
        return null;
      }
    })
    .filter((p): p is Player => !!p);
  if (list.length) return list;
  // First time: two players, one each.
  const twins = [newPlayer('🐯'), newPlayer('🐼')];
  twins.forEach(savePlayer);
  saveRoster(twins);
  return twins;
}
const savePlayer = (p: Player) => localStorage.setItem(playerKey(p.id), JSON.stringify(p));
const saveRoster = (list: Player[]) => localStorage.setItem(ROSTER_KEY, JSON.stringify(list.map((p) => p.id)));

let players = loadPlayers();
let me: Player = players[0];

// ── Screens ────────────────────────────────────────────────────

type Screen = 'menu' | 'trail' | 'lesson' | 'book';
let screen: Screen = 'menu';

function show(s: Screen): void {
  screen = s;
  for (const id of ['menu', 'trail', 'lesson', 'book'] as Screen[]) $(id).hidden = id !== s;
  $('home').hidden = s === 'menu';
  keepAwake(s !== 'menu');
}

/** ⬅: lesson → trail → players. (From the players screen, ⬅ goes to Kids' Games.) */
function back(): void {
  stopSpeech();
  $('reward').hidden = true;
  $('party').hidden = true;
  lessonRun++; // anything still waiting in the lesson stops
  if (screen === 'lesson' || screen === 'book') openTrail(false);
  else showMenu();
}

// ── Who's playing? ─────────────────────────────────────────────

function showMenu(): void {
  players = loadPlayers();
  $('players').innerHTML = players
    .map(
      (p) => `<button class="player" data-id="${p.id}">
        <span class="avatar">${drawing(p.avatar)}</span>
        ${p.name ? `<span class="pname">${esc(p.name)}</span>` : ''}
        <span class="pstars">⭐ ${p.stars}</span>
      </button>`,
    )
    .join('');
  show('menu');
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);

// ── The trail ──────────────────────────────────────────────────

const ROW = 104; // px between stops
const TOP = 76; // room above the first stop for the player standing on it
const xAt = (i: number) => 50 + 28 * Math.sin(i * 1.05); // % across: a winding path

function renderTrail(): void {
  $('me').innerHTML = `<span class="avatar small">${drawing(me.avatar)}</span>${me.name ? esc(me.name) : ''}<span class="pstars">⭐ ${me.stars}</span>`;
  $('path').innerHTML = WORLDS.map((w, wi) => {
    const stops = STOPS.slice(wi * STOPS_PER_WORLD, (wi + 1) * STOPS_PER_WORLD);
    const h = STOPS_PER_WORLD * ROW + TOP - 20;
    // A smooth line through the stops (SVG units: x in %, y in px).
    const pts = stops.map((s, k) => [xAt(s.index), TOP + k * ROW]);
    const d = pts.map(([x, y], k) => (k ? `S ${(x + pts[k - 1][0]) / 2} ${y - ROW / 2} ${x} ${y}` : `M ${x} ${y}`)).join(' ');
    return `<div class="world w-${w.id}">
      <div class="world-title"><span>${w.emoji}</span> ${getLang() === 'es' ? capFirst(w.name.es) : capFirst(w.name.en)}</div>
      <div class="world-stops" style="height:${h}px">
        <svg class="road" viewBox="0 0 100 ${h}" preserveAspectRatio="none"><path d="${d}" vector-effect="non-scaling-stroke"/></svg>
        ${stops
          .map((s, k) => {
            const state = s.index < me.done ? 'done' : isOpen(me, s.index) ? 'next' : 'locked';
            return `<button class="stop ${state}" data-stop="${s.index}" style="left:${xAt(s.index)}%;top:${TOP + k * ROW}px" aria-label="Stop ${s.index + 1}">
              <span class="icon">${KIND_ICON[s.kind]}</span>
              ${state === 'done' ? '<span class="badge">⭐</span>' : state === 'locked' ? '<span class="badge lock">🔒</span>' : ''}
              ${s.index === Math.min(me.done, STOP_COUNT - 1) ? `<span class="here">${drawing(me.avatar)}</span>` : ''}
            </button>`;
          })
          .join('')}
      </div>
    </div>`;
  }).join('') + `<div class="trail-end">🏆</div>`;
}
const capFirst = (w: string) => w.charAt(0).toUpperCase() + w.slice(1);

function openTrail(greet: boolean): void {
  renderTrail();
  show('trail');
  // Scroll so the next stop is in view.
  const next = $('path').querySelector<HTMLElement>(`[data-stop="${Math.min(me.done, STOP_COUNT - 1)}"]`);
  requestAnimationFrame(() => next?.scrollIntoView({ block: 'center', behavior: greet ? 'auto' : 'smooth' }));
  if (greet) void talk("Let's go!");
}

// ── A lesson ───────────────────────────────────────────────────

let lesson: Question[] = [];
let qi = 0;
let stopIndex = 0;
let busy = false;
let lessonRun = 0; // bumps when a lesson starts or is left, so old timers know to stop

function startLesson(i: number): void {
  unlock();
  stopIndex = i;
  lesson = newLesson(STOPS[i], getLang(), rng);
  qi = 0;
  lessonRun++;
  show('lesson');
  preload(lesson.flatMap((q) => promptParts(q, getLang())));
  // First stop of a new world: say hello to it.
  const run = lessonRun;
  const w = WORLDS[STOPS[i].world];
  const intro = i % STOPS_PER_WORLD === 0 && i === me.done ? talk(worldParts(w, getLang())) : Promise.resolve();
  renderProgress();
  void intro.then(() => run === lessonRun && ask());
}

function renderProgress(): void {
  $('progress').innerHTML = lesson.map((_, k) => `<i class="${k < qi ? 'on' : k === qi ? 'now' : ''}"></i>`).join('');
}

function ask(): void {
  busy = false;
  renderQuestion(lesson[qi]);
  renderProgress();
  void talk(promptParts(lesson[qi], getLang()));
}

function tile(value: string | number, inner: string, cls = ''): string {
  return `<button class="tile ${cls}" data-v="${value}">${inner}</button>`;
}

function shapeSvg(s: ShapeId, fill: string): string {
  const shapes: Record<ShapeId, string> = {
    circle: '<circle cx="50" cy="50" r="40"/>',
    square: '<rect x="12" y="12" width="76" height="76" rx="6"/>',
    triangle: '<polygon points="50,10 92,86 8,86" stroke-linejoin="round" stroke-width="6"/>',
    star: `<polygon points="${Array.from({ length: 10 }, (_, i) => {
      const a = (Math.PI / 5) * i - Math.PI / 2;
      const r = i % 2 ? 19 : 44;
      return `${(50 + Math.cos(a) * r).toFixed(1)},${(54 + Math.sin(a) * r).toFixed(1)}`;
    }).join(' ')}" stroke-linejoin="round" stroke-width="5"/>`,
    heart: '<path d="M50 88 C10 60 6 30 26 18 C38 12 48 20 50 30 C52 20 62 12 74 18 C94 30 90 60 50 88 Z"/>',
    diamond: '<polygon points="50,6 90,50 50,94 10,50" stroke-linejoin="round" stroke-width="5"/>',
    oval: '<ellipse cx="50" cy="50" rx="44" ry="28"/>',
    rectangle: '<rect x="6" y="26" width="88" height="48" rx="5"/>',
  };
  return `<svg viewBox="0 0 100 100" fill="${fill}" stroke="${fill}" aria-hidden="true">${shapes[s]}</svg>`;
}

function crayonSvg(hex: string): string {
  return `<svg viewBox="0 0 40 120" aria-hidden="true">
    <path d="M8 30 L20 4 L32 30 Z" fill="${hex}"/><path d="M14 17 L20 4 L26 17 Z" fill="rgba(0,0,0,.25)"/>
    <rect x="6" y="30" width="28" height="84" rx="5" fill="${hex}"/>
    <rect x="6" y="46" width="28" height="9" fill="rgba(0,0,0,.18)"/><rect x="6" y="92" width="28" height="9" fill="rgba(0,0,0,.18)"/>
    <rect x="11" y="34" width="5" height="76" rx="2" fill="rgba(255,255,255,.35)"/>
  </svg>`;
}

function renderQuestion(q: Question): void {
  const lang = getLang();
  const board = $('board');
  board.className = `board k-${q.kind}`;
  let top = '';
  let tiles = '';
  switch (q.kind) {
    case 'letter':
      tiles = q.choices.map((ch) => tile(ch, `<span class="letter">${ch}</span>`)).join('');
      break;
    case 'sound':
      top = `<div class="show-letter">${q.target}</div>`;
      tiles = q.choices.map((ch) => tile(ch, `<span class="pic">${drawing(letterOf(ch, lang).emoji)}</span>`)).join('');
      break;
    case 'count':
      top = `<div class="things">${Array.from({ length: q.n }, (_, k) => `<span class="thing" data-k="${k}">${drawing(q.thing.e)}</span>`).join('')}</div>`;
      tiles = q.choices.map((n) => tile(n, `<span class="num">${n}</span>`)).join('');
      break;
    case 'color':
      tiles = q.choices.map((c) => tile(c, crayonSvg(COLOR_HEX[c]), 'crayon')).join('');
      break;
    case 'shape':
      tiles = q.choices.map((s, k) => tile(s, shapeSvg(s, q.colors[k]), 'shape')).join('');
      break;
    case 'size':
      tiles = q.choices.map((s) => tile(s, `<span class="pic ${s}">${drawing(q.thing)}</span>`, 'sizer')).join('');
      break;
    case 'pattern':
      top = `<div class="seq">${q.seq.map((t) => `<span>${drawing(t.e)}</span>`).join('')}<span class="blank">?</span></div>`;
      tiles = q.choices.map((t) => tile(t.e, `<span class="pic">${drawing(t.e)}</span>`)).join('');
      break;
    case 'dots':
      board.innerHTML = dotsSvg(q);
      return;
  }
  board.innerHTML = `${top}<div class="tiles n${(q as { choices: unknown[] }).choices.length}">${tiles}</div>`;
}

async function choose(el: HTMLElement): Promise<void> {
  const q = lesson[qi];
  if (busy || !q || el.classList.contains('nope')) return;
  const raw = el.dataset.v!;
  const value: string | number = q.kind === 'count' ? Number(raw) : raw;
  const lang = getLang();
  const run = lessonRun;
  const [x, y] = centerOf(el);
  if (isRight(q, value)) {
    busy = true;
    el.classList.add('yes');
    sfx.yay();
    burst(document.body, x, y, CONFETTI, 26, 150);
    if (q.kind === 'pattern') { const b = document.querySelector('.blank'); if (b) b.innerHTML = drawing(q.answer.e); }
    await talk([...choiceParts(q, value, lang), en(pickOne(PRAISE))], 1400);
    if (run === lessonRun) next();
    return;
  }
  // Not that one: it says what it is (so they still learn it) and steps aside.
  el.classList.add('nope');
  sfx.boop();
  if (q.kind === 'count') {
    // Wrong number: count them together, one at a time.
    busy = true;
    await talk([...choiceParts(q, value, lang), en(LETS_COUNT)], 400);
    for (let k = 0; k < q.n && run === lessonRun; k++) {
      const t = document.querySelector<HTMLElement>(`.thing[data-k="${k}"]`);
      t?.classList.add('counted');
      t?.setAttribute('data-n', String(k + 1));
      sfx.count(k + 1);
      await talk([numberPart(k + 1, lang)], 650, 1800);
    }
    busy = false;
    return;
  }
  void talk([...choiceParts(q, value, lang), en(TRY_AGAIN)]);
}

function centerOf(el: Element): [number, number] {
  const r = el.getBoundingClientRect();
  return [r.left + r.width / 2, r.top + r.height / 2];
}

function next(): void {
  qi++;
  if (qi < lesson.length) ask();
  else void finishLesson();
}

// ── Dot-to-dot ─────────────────────────────────────────────────

let dotNext = 0;

function dotsSvg(q: Extract<Question, { kind: 'dots' }>): string {
  dotNext = 0;
  const pts = q.pic.points;
  return `<svg class="dots" viewBox="-6 -6 112 112" data-pic="${q.pic.id}">
    <polygon class="fill" points="${pts.map((p) => p.join(',')).join(' ')}" fill="${q.pic.color}"/>
    <g class="lines"></g>
    ${pts
      .map(
        ([x, y], k) => `<g class="dot ${k === 0 ? 'next' : ''}" data-k="${k}" transform="translate(${x} ${y})">
          <circle class="hit" r="11"/><circle class="ring" r="6.5"/><text y="2.6">${k + 1}</text></g>`,
      )
      .join('')}
  </svg>`;
}

function hitDot(k: number): void {
  const q = lesson[qi];
  if (busy || q?.kind !== 'dots') return;
  const svg = document.querySelector<SVGSVGElement>('svg.dots')!;
  if (k !== dotNext) {
    // Show which one is next.
    const n = svg.querySelector(`.dot[data-k="${dotNext}"]`);
    n?.classList.remove('wiggle');
    void (n as HTMLElement | null)?.getBoundingClientRect();
    n?.classList.add('wiggle');
    return;
  }
  const pts = q.pic.points;
  const lang = getLang();
  const lineTo = (a: number, b: number) =>
    svg.querySelector('.lines')!.insertAdjacentHTML('beforeend', `<line x1="${pts[a][0]}" y1="${pts[a][1]}" x2="${pts[b][0]}" y2="${pts[b][1]}"/>`);
  if (k > 0) lineTo(k - 1, k);
  const dot = svg.querySelector(`.dot[data-k="${k}"]`)!;
  dot.classList.remove('next');
  dot.classList.add('on');
  sfx.count(k + 1);
  void say([numberPart(k + 1, lang)]);
  dotNext = k + 1;
  if (dotNext < pts.length) {
    svg.querySelector(`.dot[data-k="${dotNext}"]`)!.classList.add('next');
    return;
  }
  // Last dot: close the shape and colour it in.
  lineTo(k, 0);
  busy = true;
  svg.classList.add('complete');
  const run = lessonRun;
  const [x, y] = centerOf(svg);
  setTimeout(async () => {
    if (run !== lessonRun) return;
    sfx.yay();
    burst(document.body, x, y, CONFETTI, 30, 170);
    await talk([...choiceParts(q, q.pic.id, lang), en(pickOne(PRAISE))], 1600);
    if (run === lessonRun) next();
  }, 700);
}

/** Dots work by tapping, or by dragging a finger from one to the next. */
function dotAt(e: PointerEvent): number | null {
  const svg = (e.target as Element).closest?.('svg.dots') ?? document.querySelector('svg.dots');
  if (!svg) return null;
  const el = document.elementFromPoint(e.clientX, e.clientY)?.closest<SVGGElement>('.dot');
  return el ? Number(el.dataset.k) : null;
}

// ── Finishing a stop: a present with a sticker inside ──────────

async function finishLesson(): Promise<void> {
  const run = lessonRun;
  const sticker = newSticker(me.stickers, rng);
  const wasNewest = stopIndex === me.done;
  finishStop(me, stopIndex, sticker);
  savePlayer(me);
  renderProgress();
  const r = $('reward');
  r.innerHTML = `<div class="present" role="button" aria-label="Open the present">🎁</div><p class="reward-title">⭐</p>`;
  r.hidden = false;
  sfx.fanfare();
  await talk('You got a sticker! Tap the present!');
  if (run !== lessonRun) return;
  r.onclick = async () => {
    r.onclick = null;
    r.innerHTML = `<div class="sticker-big">${drawing(sticker.e)}</div><p class="reward-title">⭐ ${me.stars}</p>`;
    const [x, y] = centerOf(r.querySelector('.sticker-big')!);
    burst(document.body, x, y, CONFETTI, 34, 180);
    sfx.yay();
    await talk(stickerParts(sticker, getLang()), 1500);
    if (run !== lessonRun) return;
    r.onclick = () => {
      r.onclick = null;
      r.hidden = true;
      const finishedAll = wasNewest && me.done === STOP_COUNT;
      openTrail(false);
      if (finishedAll) {
        party($('party'), document.body, () => {});
        void talk('You finished the whole trail!');
      }
    };
    r.insertAdjacentHTML('beforeend', '<p class="tap-on">👆</p>');
  };
}

// ── Sticker book ───────────────────────────────────────────────

function openBook(): void {
  $('stickers').innerHTML = STICKERS.map((s) =>
    me.stickers.includes(s.e) ? `<button class="sticker" data-e="${s.e}">${drawing(s.e)}</button>` : '<span class="sticker empty"></span>',
  ).join('');
  $('book-count').textContent = `${me.stickers.length} / ${STICKERS.length}`;
  show('book');
}

// ── Grown-ups: players editor (inside ⚙️ settings) ─────────────

function renderRoster(): void {
  $('roster').innerHTML =
    players
      .map(
        (p) => `<div class="roster-row" data-id="${p.id}">
          <button class="r-avatar" aria-label="Change animal">${drawing(p.avatar)}</button>
          <input class="r-name" value="${esc(p.name)}" placeholder="Name" maxlength="14" />
          <span class="r-info">${Math.min(p.done, STOP_COUNT)}/${STOP_COUNT}</span>
          <button class="r-reset" aria-label="Start again">↺</button>
          ${players.length > 1 ? '<button class="r-del" aria-label="Remove">✕</button>' : ''}
        </div>`,
      )
      .join('') + (players.length < 4 ? '<button class="r-add">➕ Add player</button>' : '');
}

function bindRoster(): void {
  const box = $('roster');
  const find = (el: Element) => players.find((p) => p.id === el.closest<HTMLElement>('.roster-row')?.dataset.id);
  box.addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    const p = find(t);
    if (t.closest('.r-add')) {
      const used = players.map((x) => x.avatar);
      players.push(newPlayer(AVATARS.find((a) => !used.includes(a)) ?? AVATARS[0]));
    } else if (p && t.closest('.r-avatar')) {
      p.avatar = AVATARS[(AVATARS.indexOf(p.avatar) + 1) % AVATARS.length];
    } else if (p && t.closest('.r-reset')) {
      if (!confirm(`Start ${p.name || p.avatar}'s trail again from the first stop? Stickers and stars go too.`)) return;
      Object.assign(p, { done: 0, stickers: [], stars: 0 });
    } else if (p && t.closest('.r-del')) {
      if (!confirm(`Remove ${p.name || p.avatar} and their progress?`)) return;
      players = players.filter((x) => x !== p);
      localStorage.removeItem(playerKey(p.id));
    } else return;
    players.forEach(savePlayer);
    saveRoster(players);
    renderRoster();
    showMenu();
  });
  box.addEventListener('input', (e) => {
    const t = e.target as HTMLInputElement;
    const p = t.classList.contains('r-name') && find(t);
    if (!p) return;
    p.name = t.value.trim();
    savePlayer(p);
  });
  box.addEventListener('change', () => showMenu());
}

// ── Wiring ─────────────────────────────────────────────────────

function init(): void {
  bindVoiceButton($('voice'));
  bindLangButtons($('lang'));
  bindKidsNav(back);
  // Hoot, drawn.
  for (const el of document.querySelectorAll<HTMLElement>('.hoot-hello, #hoot')) el.innerHTML = drawing('🦉');
  $('gear').addEventListener('click', renderRoster); // fills the editor as the panel opens
  bindRoster();
  lockGestures();

  $('players').addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('[data-id]');
    const p = b && players.find((x) => x.id === b.dataset.id);
    if (!p) return;
    unlock();
    me = p;
    openTrail(true);
  });
  $('path').addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('[data-stop]');
    if (!b) return;
    const i = Number(b.dataset.stop);
    unlock();
    if (isOpen(me, i)) startLesson(i);
    else {
      b.classList.remove('wiggle');
      void b.offsetWidth;
      b.classList.add('wiggle');
      sfx.boop();
      void talk('Not yet!');
    }
  });
  $('book-btn').addEventListener('click', openBook);
  $('stickers').addEventListener('click', (e) => {
    const s = (e.target as HTMLElement).closest<HTMLElement>('[data-e]');
    const pic = s && STICKERS.find((x) => x.e === s.dataset.e);
    if (!pic) return;
    s.classList.remove('boing');
    void s.offsetWidth;
    s.classList.add('boing');
    void say(stickerParts(pic, getLang()));
  });
  // Respond on touch-down: quicker and more forgiving than a full click for small fingers.
  $('board').addEventListener('pointerdown', (e) => {
    const t = (e.target as HTMLElement).closest<HTMLElement>('.tile');
    if (t) return void choose(t);
    const k = dotAt(e);
    if (k !== null) {
      hitDot(k);
      // Let a finger drag on to the next dot (touch captures the pointer to the first dot otherwise).
      const t = e.target as Element;
      if (t.hasPointerCapture?.(e.pointerId)) t.releasePointerCapture(e.pointerId);
    }
  });
  $('board').addEventListener('pointermove', (e) => {
    if (e.buttons === 0 && e.pointerType === 'mouse') return;
    const k = dotAt(e);
    if (k !== null && k === dotNext) hitDot(k);
  });
  $('hoot').addEventListener('click', () => {
    const q = lesson[qi];
    if (q && screen === 'lesson') void talk(promptParts(q, getLang()));
  });
  showMenu();
}

init();
// Family sync: if the family has newer settings or progress, start again with them (only on the players screen).
syncOnOpen(undefined, () => screen === 'menu' && $('grown').hidden && location.reload());
