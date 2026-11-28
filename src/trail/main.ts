// Hoot's Trail: pick your player, walk the trail stop by stop, play hands-on rounds, earn stickers
// and stick them in each world's picture.
import { bindVoiceButton, en, preload, say, sfx, stopSpeech, unlock, type Part } from '../kids/audio';
import { burst, CONFETTI, party } from '../kids/fx';
import { keepAwake, lockGestures } from '../kids/hold';
import { bindLangButtons, getLang } from '../kids/lang';
import { bindKidsNav } from '../kids/nav';
import { drawing } from '../kids/art';
import { loadPlayers, playerKey, savePlayer, saveRoster, stickerPartsWithSound } from '../kids/stickers';
import { syncOnOpen } from '../kids/sync';
import { bindDrag } from './drag';
import { cancelRound, playRound, shapeSvg } from './rounds';
import {
  AVATARS, finishStop, isOpen, newLesson, newPlayer, newSticker, openWorlds, placeSticker, PRAISE, promptParts,
  STICKER_PLACE, STICKERS, STOP_COUNT, STOPS, STOPS_PER_WORLD, unplaced, WORLDS, worldParts,
  type Kind, type Player, type Round,
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
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
const capFirst = (w: string) => w.charAt(0).toUpperCase() + w.slice(1);
const centerOf = (el: Element): [number, number] => {
  const r = el.getBoundingClientRect();
  return [r.left + r.width / 2, r.top + r.height / 2];
};

// ── Players: saved on this device and shared by family sync (see kids/stickers.ts) ──

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

/** ⬅: lesson or picture → trail → players. (From the players screen, ⬅ goes to Kids' Games.) */
function back(): void {
  stopSpeech();
  $('reward').hidden = true;
  $('party').hidden = true;
  leaveLesson();
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

// ── The trail ──────────────────────────────────────────────────

const ROW = 112; // px between stops
const TOP = 80; // room above the first stop for the player standing on it
const xAt = (i: number) => 50 + 26 * Math.sin(i * 1.05); // % across: a winding path

/** A little picture of what each stop is about. */
function kindIcon(k: Kind): string {
  switch (k) {
    case 'letter': return '<b class="ic-text">Aa</b>';
    case 'sound': return `<span class="ic-pair"><b>B</b>${drawing('⚽')}</span>`;
    case 'count': return '<b class="ic-text">123</b>';
    case 'color': return '<svg viewBox="0 0 60 60"><circle cx="18" cy="22" r="12" fill="#ec4038"/><circle cx="42" cy="22" r="12" fill="#3a7ff0"/><circle cx="30" cy="42" r="12" fill="#f7cf2d"/></svg>';
    case 'shape': return shapeSvg('star', '#f68b28');
    case 'size': return `<span class="ic-size">${drawing('🐻')}<i>${drawing('🐻')}</i></span>`;
    case 'pattern': return `<span class="ic-row">${drawing('🍎')}${drawing('🍌')}${drawing('🍎')}</span>`;
    case 'dots': return '<svg viewBox="0 0 60 60"><path d="M12 46 L30 12 L48 46 Z" fill="none" stroke="#7a4fd6" stroke-width="3" stroke-dasharray="4 4"/><circle cx="12" cy="46" r="5" fill="#7a4fd6"/><circle cx="30" cy="12" r="5" fill="#7a4fd6"/><circle cx="48" cy="46" r="5" fill="#7a4fd6"/></svg>';
  }
}

function renderTrail(): void {
  $('me').innerHTML = `<span class="avatar small">${drawing(me.avatar)}</span>${me.name ? esc(me.name) : ''}<span class="pstars">⭐ ${me.stars}</span>`;
  $('path').innerHTML = WORLDS.map((w, wi) => {
    const stops = STOPS.slice(wi * STOPS_PER_WORLD, (wi + 1) * STOPS_PER_WORLD);
    const h = STOPS_PER_WORLD * ROW + TOP - 20;
    // A smooth line through the stops (SVG units: x in %, y in px).
    const pts = stops.map((s, k) => [xAt(s.index), TOP + k * ROW]);
    const d = pts.map(([x, y], k) => (k ? `S ${(x + pts[k - 1][0]) / 2} ${y - ROW / 2} ${x} ${y}` : `M ${x} ${y}`)).join(' ');
    // Pictures along the way, on the side of the path with more room.
    const deco = stops
      .map((s, k) => {
        const x = xAt(s.index) > 50 ? 14 + (k % 2) * 6 : 80 - (k % 2) * 6;
        return `<span class="deco" style="left:${x}%;top:${TOP + k * ROW - 10}px">${drawing(w.deco[k % w.deco.length])}</span>`;
      })
      .join('');
    return `<div class="world w-${w.id}">
      <div class="world-title"><span>${drawing(w.emoji)}</span> ${getLang() === 'es' ? capFirst(w.name.es) : capFirst(w.name.en)}</div>
      <div class="world-stops" style="height:${h}px">
        <svg class="road" viewBox="0 0 100 ${h}" preserveAspectRatio="none"><path d="${d}" vector-effect="non-scaling-stroke"/></svg>
        ${deco}
        ${stops
          .map((s, k) => {
            const state = s.index < me.done ? 'done' : isOpen(me, s.index) ? 'next' : 'locked';
            return `<button class="stop ${state}" data-stop="${s.index}" style="left:${xAt(s.index)}%;top:${TOP + k * ROW}px" aria-label="Stop ${s.index + 1}">
              <span class="icon">${kindIcon(s.kind)}</span>
              ${state === 'done' ? '<span class="badge">⭐</span>' : state === 'locked' ? '<span class="badge lock">🔒</span>' : ''}
              ${s.index === Math.min(me.done, STOP_COUNT - 1) ? `<span class="here">${drawing(me.avatar)}</span>` : ''}
            </button>`;
          })
          .join('')}
      </div>
    </div>`;
  }).join('') + `<div class="trail-end">🏆</div>`;
}

function openTrail(greet: boolean): void {
  renderTrail();
  show('trail');
  // Scroll so the next stop is in view.
  const next = $('path').querySelector<HTMLElement>(`[data-stop="${Math.min(me.done, STOP_COUNT - 1)}"]`);
  requestAnimationFrame(() => next?.scrollIntoView({ block: 'center', behavior: greet ? 'auto' : 'smooth' }));
  if (greet) void talk("Let's go!");
}

// ── A lesson: a few hands-on rounds ────────────────────────────

let lesson: Round[] = [];
let qi = 0;
let stopIndex = 0;
let lessonRun = 0; // bumps when a lesson starts or is left, so old waits know to stop

function leaveLesson(): void {
  lessonRun++;
  cancelRound();
}

async function startLesson(i: number): Promise<void> {
  unlock();
  leaveLesson();
  const run = lessonRun;
  stopIndex = i;
  const lang = getLang();
  lesson = newLesson(STOPS[i], lang, rng);
  const w = WORLDS[STOPS[i].world];
  $('lesson').className = `screen lesson w-${w.id}`;
  $('board').innerHTML = '';
  show('lesson');
  preload(lesson.flatMap((r) => promptParts(r, lang)));
  // First stop of a new world: say hello to it.
  if (i % STOPS_PER_WORLD === 0 && i === me.done) await talk(worldParts(w, lang));
  for (qi = 0; qi < lesson.length; qi++) {
    if (run !== lessonRun) return;
    renderProgress();
    const r = lesson[qi];
    const done = playRound(r, { board: $('board'), lang, talk, say: (p) => void say(p), alive: () => run === lessonRun });
    void talk(promptParts(r, lang));
    await done;
    if (run !== lessonRun) return;
    await cheer();
    if (run !== lessonRun) return;
  }
  renderProgress();
  void finishLesson();
}

/** Hoot cheers between rounds. */
async function cheer(): Promise<void> {
  const hoot = $('hoot');
  hoot.classList.remove('cheer');
  void hoot.offsetWidth;
  hoot.classList.add('cheer');
  sfx.yay();
  const [x, y] = centerOf($('board'));
  burst(document.body, x, y, CONFETTI, 22, 160);
  $('progress').querySelectorAll('i')[qi]?.classList.add('on');
  await talk(pickOne(PRAISE), 700, 2500);
}

function renderProgress(): void {
  $('progress').innerHTML = lesson.map((_, k) => `<i class="${k < qi ? 'on' : k === qi ? 'now' : ''}">⭐</i>`).join('');
}

// ── Finishing a stop: a present with a sticker inside ──────────

async function finishLesson(): Promise<void> {
  const run = lessonRun;
  const sticker = newSticker(me.stickers, rng);
  const wasNewest = stopIndex === me.done;
  const world = WORLDS[STOPS[stopIndex].world];
  finishStop(me, stopIndex, sticker);
  savePlayer(me);
  const r = $('reward');
  r.innerHTML = `<div class="present" role="button" aria-label="Open the present">🎁</div><p class="reward-title">⭐</p>`;
  r.hidden = false;
  sfx.fanfare();
  await talk([en('You got a sticker!'), en('Tap the present!')]);
  if (run !== lessonRun) return;
  r.onclick = async () => {
    r.onclick = null;
    r.innerHTML = `<div class="sticker-big">${drawing(sticker.e)}</div><p class="reward-title">⭐ ${me.stars}</p>`;
    const [x, y] = centerOf(r.querySelector('.sticker-big')!);
    burst(document.body, x, y, CONFETTI, 34, 180);
    sfx.yay();
    await talk(stickerPartsWithSound(sticker.e), 1500);
    if (run !== lessonRun) return;
    r.onclick = () => {
      r.onclick = null;
      r.hidden = true;
      afterBook = wasNewest && me.done === STOP_COUNT ? 'party' : null;
      openBook(world.id, sticker.e);
      void talk(STICKER_PLACE);
    };
    r.insertAdjacentHTML('beforeend', '<p class="tap-on">👆</p>');
  };
}

// ── The sticker picture: one scene per world, decorated with stickers ──

let bookWorld = WORLDS[0].id;
let fresh: string | null = null; // the sticker just won, waiting to be stuck in
let afterBook: 'party' | null = null;
let unbindScene: (() => void) | null = null;

function openBook(world = bookWorld, newOne: string | null = null): void {
  const open = openWorlds(me);
  bookWorld = open.some((w) => w.id === world) ? world : open[open.length - 1]?.id ?? WORLDS[0].id;
  fresh = newOne;
  renderBook();
  show('book');
}

function renderBook(): void {
  const open = openWorlds(me);
  $('scene-tabs').innerHTML = open
    .map((w) => `<button class="scene-tab ${w.id === bookWorld ? 'on' : ''}" data-world="${w.id}" aria-label="${w.name.en}">${drawing(w.emoji)}</button>`)
    .join('');
  const w = WORLDS.find((x) => x.id === bookWorld)!;
  const placed = me.scenes?.[w.id] ?? [];
  $('scene').className = `scene drop s-${w.id}`;
  $('scene').innerHTML =
    `<div class="scene-deco">${w.deco.slice(0, 4).map((e, k) => `<span class="sd sd${k}">${drawing(e)}</span>`).join('')}</div>` +
    placed.map((s) => `<div class="sticker piece placed-s" data-e="${s.e}" style="left:${s.x}%;top:${s.y}%">${drawing(s.e)}</div>`).join('');
  const tray = unplaced(me);
  $('tray').innerHTML = tray.length
    ? tray.map((e) => `<div class="sticker piece ${e === fresh ? 'new' : ''}" data-e="${e}">${drawing(e)}</div>`).join('')
    : `<p class="tray-empty">${drawing('⭐')}</p>`;
  $('book-count').textContent = `${me.stickers.length} / ${STICKERS.length}`;
}

function bindBook(): void {
  unbindScene?.();
  unbindScene = bindDrag({
    root: $('book'),
    piece: '.sticker',
    target: '.scene',
    onPick: (el) => {
      el.classList.remove('boing');
      void el.offsetWidth;
      el.classList.add('boing');
      void say(stickerPartsWithSound(el.dataset.e!));
    },
    onDrop: (el, target, x, y) => {
      if (!target) return false;
      const s = target.getBoundingClientRect();
      if (x < s.left || x > s.right || y < s.top || y > s.bottom) return false;
      placeSticker(me, bookWorld, el.dataset.e!, ((x - s.left) / s.width) * 100, ((y - s.top) / s.height) * 100);
      savePlayer(me);
      if (el.dataset.e === fresh) fresh = null;
      sfx.pop();
      burst(document.body, x, y, ['✨', '⭐'], 10, 70);
      renderBook();
      return true;
    },
  });
  $('scene-tabs').addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('[data-world]');
    if (!b) return;
    bookWorld = b.dataset.world!;
    renderBook();
  });
  $('scene-done').addEventListener('click', () => {
    const p = afterBook;
    afterBook = null;
    openTrail(false);
    if (p === 'party') {
      party($('party'), document.body, () => {});
      void talk('You finished the whole trail!');
    }
  });
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
      Object.assign(p, { done: 0, stickers: [], stars: 0, scenes: {} });
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

/** /trail/?book: straight to the chosen player's sticker book. */
let wantBook = new URLSearchParams(location.search).has('book');

function init(): void {
  bindVoiceButton($('voice'));
  bindLangButtons($('lang'));
  bindKidsNav(back);
  // Hoot, drawn.
  for (const el of document.querySelectorAll<HTMLElement>('.hoot-hello, #hoot')) el.innerHTML = drawing('🦉');
  $('gear').addEventListener('click', renderRoster); // fills the editor as the panel opens
  bindRoster();
  bindBook();
  lockGestures();

  $('players').addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('[data-id]');
    const p = b && players.find((x) => x.id === b.dataset.id);
    if (!p) return;
    unlock();
    me = p;
    if (wantBook) {
      // Came from the sticker book button on the Kids' Games page.
      wantBook = false;
      openBook(WORLDS[STOPS[Math.min(me.done, STOP_COUNT - 1)].world].id);
      void talk(STICKER_PLACE);
    } else openTrail(true);
  });
  $('path').addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('[data-stop]');
    if (!b) return;
    const i = Number(b.dataset.stop);
    unlock();
    if (isOpen(me, i)) void startLesson(i);
    else {
      b.classList.remove('wiggle');
      void b.offsetWidth;
      b.classList.add('wiggle');
      sfx.boop();
      void talk('Not yet!');
    }
  });
  $('book-btn').addEventListener('click', () => {
    unlock();
    openBook(WORLDS[STOPS[Math.min(me.done, STOP_COUNT - 1)].world].id);
  });
  $('hoot').addEventListener('click', () => {
    const r = lesson[qi];
    if (r && screen === 'lesson') void talk(promptParts(r, getLang()));
  });
  showMenu();
}

init();
// Family sync: if the family has newer settings or progress, start again with them (only on the players screen).
syncOnOpen(undefined, () => screen === 'menu' && $('grown').hidden && location.reload());
