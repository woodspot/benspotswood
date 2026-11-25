// Skyhold: the screen. Runs the clock, draws the city, and handles building, inspecting and saving.
import { isLinked, sync, syncOnOpen } from '../kids/sync';
import { isMuted, setMuted, sfx, unlock } from '../keepfall/sound';
import { cellAt, CW, draw, FH, toWorld, WORLD_BOUNDS, type Ghost, type View } from './render';
import {
  addCar, advice, BUILDABLE, canPlace, CAR_COST, COLS, demolish, DOCK_W, DOCK_X, envelopeCost, envelopeLift, inClouds, layout,
  LIFT_BASE_COST, LIFT_FLOOR_COST, liftAction, liftCap, MAX_CARS, MAX_ENVELOPE, MAX_FLOORS, meetsStar, moodTarget, newWorld,
  place, population, refund, repair, repairCost, ROOMS, STARS, targetAltitude, tick, upgradeEnvelope, type Lift, type Room,
  type RoomType, type World,
} from './sim';

const SAVE = 'skyhold.save';
const HOUR_MS = 2500; // one in-game hour at normal speed
const MAX_CATCHUP_HOURS = 24; // time away counts for at most one in-game day

const $ = (id: string) => document.getElementById(id)!;
const canvas = $('view') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;
const fine = matchMedia('(pointer: fine)').matches; // a mouse: build on click, preview on hover

type Tool = 'inspect' | 'lift' | 'demolish' | RoomType;

let world: World = load();
let tool: Tool = 'inspect';
let speed = Number(localStorage.getItem('skyhold.speed') ?? 1);
let acc = 0; // ms toward the next hour
let ghost: Ghost | null = null;
let pending: { type: RoomType; x: number; y: number } | null = null; // touch: tap again to build
let selected: { room?: Room; lift?: Lift } | null = null;
let liftLoad = new Map<number, number>();
let flash = 0;
const view: View = { cx: (DOCK_X + DOCK_W / 2) * CW, cy: -3 * FH, zoom: 1, W: 0, H: 0 };

// ── Saving ─────────────────────────────────────────────────────

function load(): World {
  try {
    const w = JSON.parse(localStorage.getItem(SAVE) ?? 'null');
    if (w && w.v === 1 && Array.isArray(w.rooms)) return w;
  } catch {
    /* start fresh */
  }
  return newWorld();
}

let saveTimer = 0;
function save(now = false): void {
  clearTimeout(saveTimer);
  const write = () => {
    localStorage.setItem(SAVE, JSON.stringify(world));
    localStorage.setItem('skyhold.savedAt', String(Date.now()));
  };
  if (now) write();
  else saveTimer = window.setTimeout(write, 800);
}

/** Time away: let Skyhold carry on (up to a day), then say what happened. */
function catchUp(): void {
  const at = Number(localStorage.getItem('skyhold.savedAt') ?? 0);
  if (!at) return;
  const hours = Math.min(MAX_CATCHUP_HOURS, Math.floor((Date.now() - at) / HOUR_MS));
  if (hours < 2) return;
  const before = { money: world.money, pop: population(world), stars: world.stars };
  const events: string[] = [];
  for (let i = 0; i < hours; i++) events.push(...tick(world).events.filter((e) => e.startsWith('⭐') || e.startsWith('⚡')));
  save(true);
  const gained = Math.round(world.money - before.money);
  feed(`🕰️ While you were away (${hours} hours in Skyhold): ${gained >= 0 ? '+' : ''}$${gained.toLocaleString()}, ${population(world) - before.pop >= 0 ? '+' : ''}${population(world) - before.pop} people.`);
  for (const e of events.slice(-4)) feed(e);
}

// ── Messages ───────────────────────────────────────────────────

function feed(text: string): void {
  const box = $('feed');
  const el = document.createElement('div');
  el.textContent = text;
  box.prepend(el);
  while (box.children.length > 4) box.lastElementChild!.remove();
  setTimeout(() => el.classList.add('out'), 6500);
  setTimeout(() => el.remove(), 7200);
}

const money = (n: number) => `$${Math.round(n).toLocaleString()}`;

// ── The clock ──────────────────────────────────────────────────

function runHour(): void {
  const s = tick(world);
  liftLoad = s.liftLoad;
  for (const e of s.events) {
    feed(e);
    if (e.startsWith('⭐')) {
      sfx.unlock();
      setTimeout(() => sfx.win(), 300);
      renderPalette();
    } else if (e.startsWith('⛈️ The storm')) sfx.event(true);
    else if (e.startsWith('⚡')) {
      sfx.creak();
      flash = 1;
    } else if (e.startsWith('🌙')) sfx.coin();
    else if (e.startsWith('🗼')) sfx.win();
  }
  if (world.hour === 0) save(true);
  if (selected) renderSheet();
  hud();
}

let last = performance.now();
function frame(now: number): void {
  const dt = Math.min(250, now - last);
  last = now;
  if (speed > 0 && $('overlay').hidden) {
    acc += dt * speed;
    while (acc >= HOUR_MS) {
      acc -= HOUR_MS;
      runHour();
    }
  }
  if (world.storm?.active && Math.random() < 0.004) flash = 1;
  flash = Math.max(0, flash - dt / 400);
  ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
  draw(ctx, view, world, { t: now, hourFrac: acc / HOUR_MS, ghost, selected, liftLoad, flash });
  clockText();
  requestAnimationFrame(frame);
}

// ── Top bar ────────────────────────────────────────────────────

function clockText(): void {
  const h = world.hour;
  const m = Math.floor((acc / HOUR_MS) * 60);
  $('clock').textContent = `Day ${world.day} · ${String(h).padStart(2, '0')}:${String(m - (m % 10)).padStart(2, '0')}${world.storm?.active ? ' ⛈️' : ''}`;
}

function hud(): void {
  const L = layout(world);
  $('money').textContent = money(world.money);
  $('pop').textContent = `👥 ${population(world)}`;
  $('stars').textContent = '⭐'.repeat(world.stars) + (world.legend ? ' 🗼' : '');
  const alt = $('alt');
  const low = world.altitude < 400 || L.lift < L.weight;
  alt.classList.toggle('low', low);
  const target = targetAltitude(world);
  const arrow = target > world.altitude + 5 ? '↑' : target < world.altitude - 5 ? '↓' : '';
  alt.innerHTML = `🎈 ${Math.round(world.altitude)} m${arrow}<span class="bar"><i style="width:${Math.min(100, (L.lift / Math.max(1, L.weight)) * 60)}%"></i></span>`;
  $('advice').textContent = advice(world, liftLoad);
  document.querySelectorAll<HTMLElement>('#speeds button').forEach((b) => b.classList.toggle('sel', Number(b.dataset.speed) === speed));
  // Prices turn red when you can't afford them.
  document.querySelectorAll<HTMLElement>('.tool[data-cost]').forEach((b) => b.classList.toggle('poor', Number(b.dataset.cost) > world.money));
}

// ── Build palette ──────────────────────────────────────────────

function renderPalette(): void {
  const t = (id: string, ic: string, nm: string, cost: number | null, locked = 0, extra = '') =>
    `<button class="tool ${tool === id ? 'sel' : ''} ${locked ? 'locked' : ''} ${extra}" data-tool="${id}" ${cost !== null ? `data-cost="${cost}"` : ''}>
      <span class="ic">${ic}</span><span class="nm">${nm}</span><span class="pr">${locked ? `⭐${locked}` : cost !== null ? money(cost) : '&nbsp;'}</span></button>`;
  $('palette').innerHTML = [
    t('inspect', '👆', 'Look', null),
    t('lift', '🚡', 'Lift', LIFT_BASE_COST + LIFT_FLOOR_COST),
    ...BUILDABLE.map((id) => {
      const d = ROOMS[id];
      return t(id, d.icon || '🌉', d.name, d.cost, d.star > world.stars ? d.star : 0);
    }),
    t('envelope', '🎈', 'Envelope', world.envelope < MAX_ENVELOPE ? envelopeCost(world.envelope) : null, 0, 'sep'),
    t('demolish', '🧨', 'Demolish', null),
  ].join('');
  hud();
}

function setTool(t: Tool | 'envelope'): void {
  if (t === 'envelope') return envelopeSheet();
  if (t !== 'inspect' && t !== 'lift' && t !== 'demolish' && ROOMS[t].star > world.stars) {
    sfx.error();
    return feed(`🔒 ${ROOMS[t].name} unlocks at ${ROOMS[t].star} stars. ${STARS[ROOMS[t].star].text}.`);
  }
  tool = t;
  ghost = null;
  pending = null;
  $('confirm').hidden = true;
  selected = null;
  $('sheet').hidden = true;
  sfx.click();
  renderPalette();
  if (t !== 'inspect' && t !== 'demolish') {
    const d = t === 'lift' ? null : ROOMS[t];
    feed(
      t === 'lift'
        ? `🚡 Lift: tap a cell to start a shaft (${money(LIFT_BASE_COST + LIFT_FLOOR_COST)}), then tap just above or below its end to add floors (${money(LIFT_FLOOR_COST)} each). Build one on top of the dock to carry people up.`
        : `${d!.icon} ${d!.name}: ${d!.desc}`,
    );
  } else if (t === 'demolish') feed('🧨 Tap something to remove it. You get a quarter of its cost back.');
}

// ── Tapping the city ───────────────────────────────────────────

function at(x: number, y: number): { room?: Room; lift?: Lift } | null {
  return layout(world).grid.get(`${x},${y}`) ?? null;
}

/** Where a room of width w goes when you tap cell x: centred on it. */
const originFor = (type: RoomType, x: number) => x - Math.floor((ROOMS[type].w - 1) / 2);

function build(type: RoomType, x: number, y: number): void {
  const r = place(world, type, x, y);
  if (!r.ok) {
    sfx.error();
    return feed(`✋ ${r.why}.`);
  }
  sfx.build(0);
  feed(`${ROOMS[type].icon} ${ROOMS[type].name} built on floor ${y} (${money(ROOMS[type].cost)}).`);
  afterChange();
}

function afterChange(): void {
  pending = null;
  ghost = null;
  $('confirm').hidden = true;
  save();
  hud();
}

function tap(sx: number, sy: number): void {
  unlock();
  const [x, y] = cellAt(view, sx, sy);
  if (tool === 'inspect') {
    const hit = at(x, y);
    if (hit) {
      selected = hit;
      sfx.click();
      return renderSheet();
    }
    // The balloon: anywhere above the top floor, over the city.
    const L = layout(world);
    if (y > L.top && y <= L.top + 4 && x >= L.minX - 2 && x <= L.maxX + 2) return envelopeSheet();
    selected = null;
    $('sheet').hidden = true;
    return;
  }
  if (tool === 'demolish') {
    const hit = at(x, y);
    if (!hit) return;
    selected = hit;
    return renderSheet(true);
  }
  if (tool === 'lift') {
    const r = liftAction(world, x, y);
    if (!r.ok) {
      sfx.error();
      return feed(`✋ ${r.why}.`);
    }
    sfx.module(0);
    if (!r.extended) feed(`🚡 New lift (${money(r.cost)}). Tap just above or below it to add floors.`);
    return afterChange();
  }
  const ox = originFor(tool, x);
  if (fine) return build(tool, ox, y);
  // Touch: the first tap shows where it'll go; tap again (or ✓) to build.
  if (pending && pending.type === tool && pending.x === ox && pending.y === y) return build(tool, ox, y);
  const ok = canPlace(world, tool, ox, y);
  pending = { type: tool, x: ox, y };
  ghost = { x: ox, y, w: ROOMS[tool].w, ok: ok.ok };
  const c = $('confirm');
  c.hidden = false;
  c.innerHTML = ok.ok
    ? `<span>${ROOMS[tool].icon} ${ROOMS[tool].name} here? <b>${money(ROOMS[tool].cost)}</b></span><button class="btn gold" data-c="yes">✓ Build</button><button class="btn ghost" data-c="no">✕</button>`
    : `<span>✋ ${ok.why}</span><button class="btn ghost" data-c="no">OK</button>`;
}

function hover(sx: number, sy: number): void {
  if (!fine || tool === 'inspect' || tool === 'demolish') {
    if (fine && ghost) ghost = null;
    return;
  }
  const [x, y] = cellAt(view, sx, sy);
  if (tool === 'lift') {
    const free = !at(x, y) && y >= 0 && x >= 0 && x < COLS;
    ghost = { x, y, w: 1, ok: free };
    return;
  }
  const ox = originFor(tool, x);
  ghost = { x: ox, y, w: ROOMS[tool].w, ok: canPlace(world, tool, ox, y).ok };
}

// ── Inspect sheet ──────────────────────────────────────────────

function moodColor(m: number): string {
  return m >= 65 ? '#4caf6a' : m >= 40 ? '#e0a83a' : '#d0503f';
}

function renderSheet(demolishing = false): void {
  const s = $('sheet');
  if (!selected) {
    s.hidden = true;
    return;
  }
  const L = layout(world);
  let html = '';
  if (selected.lift) {
    const l = selected.lift;
    if (!world.lifts.includes(l)) return void ((selected = null), (s.hidden = true));
    const load = liftLoad.get(l.id) ?? 0;
    html = `<h3>🚡 Lift <span class="dim">floors ${l.y0 > 0 ? l.y0 - 1 : l.y0}–${l.y1}</span><button class="x" data-s="close">✕</button></h3>
      <p>${l.cars} car${l.cars > 1 ? 's' : ''} · carries about ${Math.round(liftCap(l))} people an hour</p>
      <p>Busy: <b style="color:${load > 1.05 ? '#d0503f' : load > 0.75 ? '#c08a20' : '#2d8a4e'}">${Math.round(load * 100)}%</b> right now${load > 1.05 ? ': people are queueing!' : ''}</p>
      <p class="dim">Tall shafts are slower. Upkeep $40 a day per car.</p>
      <div class="row">
        <button class="btn gold" data-s="car" ${l.cars >= MAX_CARS || world.money < CAR_COST ? 'disabled' : ''}>+ Car ${money(CAR_COST)}</button>
        <button class="btn red" data-s="demolish">${demolishing ? 'Remove lift' : 'Demolish'}</button>
      </div>`;
  } else if (selected.room) {
    const r = selected.room;
    if (!world.rooms.includes(r)) return void ((selected = null), (s.hidden = true));
    const d = ROOMS[r.type];
    const reach = L.path.get(r.id) !== null;
    const lines: string[] = [];
    if (d.kind === 'home') lines.push(`${r.occ} of ${d.cap} residents · rent about ${money(r.occ * (d.rent ?? 0) * (0.5 + r.mood / 200))} a night`);
    if (d.kind === 'work') lines.push(r.occ ? `${r.occ} workers · rent about ${money((d.rent ?? 0) * (0.5 + r.mood / 200))} a day` : 'Empty: workers move in overnight if they can get here and like it.');
    if (d.kind === 'stay') lines.push(`${r.occ} of ${d.cap} guests tonight · ${money(d.rent ?? 0)} a guest`);
    if (d.spend) lines.push(`Open ${d.open![0]}:00–${d.open![1]}:00 · up to ${d.cap} customers an hour at ${money(d.spend)}`);
    if (d.lift) lines.push(`Gives ${r.damaged ? 0 : d.lift} t of lift`);
    if (d.upkeep) lines.push(`Upkeep ${money(d.upkeep)} a day`);
    lines.push(`Weighs ${d.weight} t`);
    const moody = d.kind === 'home' || d.kind === 'work' || d.kind === 'stay';
    const why = moody ? moodTarget(world, r, 0).why : [];
    html = `<h3>${d.icon || '🌉'} ${d.name} <span class="dim">floor ${r.y}</span><button class="x" data-s="close">✕</button></h3>
      ${r.type === 'dock' ? `<p>${d.desc}</p><p class="dim">Lift ${Math.round(L.lift)} t · weight ${Math.round(L.weight)} t. Tap the balloon to enlarge the envelope.</p>` : ''}
      ${!reach && r.type !== 'dock' ? '<p style="color:#c8463c"><b>🚧 Nobody can get here.</b> Connect it to the dock: rooms touching on a floor share a walkway; lifts link floors.</p>' : ''}
      ${r.damaged ? `<p style="color:#c8463c"><b>🔧 Damaged by lightning.</b> It does nothing until repaired.</p>` : ''}
      ${r.type !== 'dock' ? lines.map((l) => `<p>${l}</p>`).join('') : ''}
      ${moody ? `<div class="moodbar"><i style="width:${r.mood}%;background:${moodColor(r.mood)}"></i></div><p class="dim">Happiness ${Math.round(r.mood)}%</p>${why.length ? `<ul>${why.map((w) => `<li>${w}</li>`).join('')}</ul>` : ''}` : ''}
      ${r.type !== 'dock' ? `<div class="row">
        ${r.damaged ? `<button class="btn gold" data-s="repair" ${world.money < repairCost(r) ? 'disabled' : ''}>Repair ${money(repairCost(r))}</button>` : ''}
        <button class="btn red" data-s="demolish">Demolish (+${money(refund(d.cost))})</button>
      </div>` : `<div class="row"><button class="btn gold" data-s="envelope">🎈 Envelope</button></div>`}`;
  }
  s.innerHTML = html;
  s.hidden = false;
}

function envelopeSheet(): void {
  selected = null;
  const s = $('sheet');
  const L = layout(world);
  const lvl = world.envelope;
  const max = lvl >= MAX_ENVELOPE;
  s.innerHTML = `<h3>🎈 Balloon envelope <span class="dim">level ${lvl}</span><button class="x" data-s="close">✕</button></h3>
    <p>Gives ${envelopeLift(lvl)} t of lift. Skyhold has ${Math.round(L.lift)} t of lift for ${Math.round(L.weight)} t of weight.</p>
    <p class="dim">Even lift and weight float at 600 m. More lift climbs higher (up to 1,100 m); less sinks toward the cloud sea at ${250} m.</p>
    <div class="row">${max ? '<b>The envelope is as big as it gets.</b>' : `<button class="btn gold" data-s="upgrade" ${world.money < envelopeCost(lvl) ? 'disabled' : ''}>Enlarge to level ${lvl + 1}: +30 t for ${money(envelopeCost(lvl))}</button>`}</div>`;
  s.hidden = false;
}

$('sheet').addEventListener('click', (e) => {
  const act = (e.target as HTMLElement).closest<HTMLElement>('[data-s]')?.dataset.s;
  if (!act) return;
  if (act === 'close') {
    selected = null;
    $('sheet').hidden = true;
    return;
  }
  if (act === 'envelope') return envelopeSheet();
  if (act === 'upgrade') {
    const r = upgradeEnvelope(world);
    if (!r.ok) return void (sfx.error(), feed(`✋ ${r.why}.`));
    sfx.unlock();
    feed(`🎈 The envelope grows to level ${world.envelope}: ${envelopeLift(world.envelope)} t of lift.`);
    afterChange();
    renderPalette();
    return envelopeSheet();
  }
  if (!selected) return;
  if (act === 'car' && selected.lift) {
    const r = addCar(world, selected.lift.id);
    if (!r.ok) return void (sfx.error(), feed(`✋ ${r.why}.`));
    sfx.module(0);
    afterChange();
  }
  if (act === 'repair' && selected.room) {
    const r = repair(world, selected.room.id);
    if (!r.ok) return void (sfx.error(), feed(`✋ ${r.why}.`));
    sfx.armor(0);
    afterChange();
  }
  if (act === 'demolish') {
    const r = demolish(world, selected);
    if (!r.ok) return void (sfx.error(), feed(`✋ ${r.why}.`));
    sfx.hit(4, 0);
    feed(`🧨 Demolished. ${money(r.refund)} back.`);
    selected = null;
    afterChange();
  }
  renderSheet();
});

$('confirm').addEventListener('click', (e) => {
  const c = (e.target as HTMLElement).closest<HTMLElement>('[data-c]')?.dataset.c;
  if (c === 'yes' && pending) build(pending.type, pending.x, pending.y);
  else if (c === 'no') afterChange();
});

// ── Camera: drag to pan, pinch or scroll to zoom ───────────────

function resize(): void {
  view.W = innerWidth;
  view.H = innerHeight;
  canvas.width = Math.round(view.W * devicePixelRatio);
  canvas.height = Math.round(view.H * devicePixelRatio);
}

function clampView(): void {
  view.zoom = Math.max(0.35, Math.min(2.5, view.zoom));
  view.cx = Math.max(WORLD_BOUNDS.minX, Math.min(WORLD_BOUNDS.maxX, view.cx));
  view.cy = Math.max(-(MAX_FLOORS + 6) * FH, Math.min(8 * FH, view.cy));
}

function zoomAt(sx: number, sy: number, factor: number): void {
  const [wx, wy] = toWorld(view, sx, sy);
  view.zoom *= factor;
  clampView();
  const [nx, ny] = toWorld(view, sx, sy);
  view.cx += wx - nx;
  view.cy += wy - ny;
  clampView();
}

const pointers = new Map<number, { x: number; y: number }>();
let drag: { x: number; y: number; cx: number; cy: number; moved: boolean } | null = null;
let pinch: { d: number; zoom: number } | null = null;

canvas.addEventListener('pointerdown', (e) => {
  canvas.setPointerCapture(e.pointerId);
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pointers.size === 1) drag = { x: e.clientX, y: e.clientY, cx: view.cx, cy: view.cy, moved: false };
  if (pointers.size === 2) {
    const [a, b] = [...pointers.values()];
    pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), zoom: view.zoom };
    if (drag) drag.moved = true;
  }
});
canvas.addEventListener('pointermove', (e) => {
  if (!pointers.has(e.pointerId)) return hover(e.clientX, e.clientY);
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pinch && pointers.size === 2) {
    const [a, b] = [...pointers.values()];
    const mid = [(a.x + b.x) / 2, (a.y + b.y) / 2];
    zoomAt(mid[0], mid[1], (pinch.zoom * (Math.hypot(a.x - b.x, a.y - b.y) / pinch.d)) / view.zoom);
    return;
  }
  if (drag) {
    const dx = e.clientX - drag.x;
    const dy = e.clientY - drag.y;
    if (Math.hypot(dx, dy) > 7) drag.moved = true;
    if (drag.moved) {
      view.cx = drag.cx - dx / view.zoom;
      view.cy = drag.cy - dy / view.zoom;
      clampView();
    }
  }
  hover(e.clientX, e.clientY);
});
const up = (e: PointerEvent) => {
  const wasTap = drag && !drag.moved && pointers.size === 1;
  pointers.delete(e.pointerId);
  if (pointers.size < 2) pinch = null;
  if (wasTap && e.type === 'pointerup') tap(e.clientX, e.clientY);
  if (!pointers.size) drag = null;
};
canvas.addEventListener('pointerup', up);
canvas.addEventListener('pointercancel', up);
canvas.addEventListener('pointerleave', () => fine && !pointers.size && (ghost = null));
canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  zoomAt(e.clientX, e.clientY, Math.exp(-e.deltaY * 0.0015));
}, { passive: false });

// ── Menu and help ──────────────────────────────────────────────

function dialog(html: string): HTMLElement {
  const d = $('dialog');
  d.innerHTML = html;
  $('overlay').hidden = false;
  return d;
}
const closeDialog = () => ($('overlay').hidden = true);

const HELP = `<h3>How Skyhold works</h3>
  <ul>
    <li><b>Everyone arrives at the ⚓ Sky Dock.</b> People walk along a floor through rooms that touch, and ride 🚡 lifts between floors. A lift built on top of the dock carries people up from it. Rooms nobody can reach stay empty (🚧).</li>
    <li><b>Cabins</b> pay rent every night. Residents move in when they’re happy: they want a lift that isn’t packed, a café within 3 floors, a garden within 2, and no noisy neighbours.</li>
    <li><b>Cafés, shops and the theatre</b> earn from visitors and residents. More attractions bring more visitors.</li>
    <li><b>Lifts get crowded</b> at rush hour (7–9 and 17–19): busy ones turn yellow, then red. Tap one to add cars, or build another shaft. Tall shafts are slower.</li>
    <li><b>Weight vs lift:</b> everything has weight. The 🎈 envelope, gas cells and Aether engines give lift. Even lift and weight float at 600 m; too heavy and Skyhold sinks toward the cloud sea, where it’s damp and grey and storms strike. Fly above ${'450'} m when a storm is forecast.</li>
    <li><b>Stars</b> unlock new rooms as Skyhold grows. Build the 🗼 Lighthouse at 5 stars to make it a legend.</li>
    <li>Drag to look around, pinch or scroll to zoom. Skyhold keeps going while you’re away (up to a day).</li>
  </ul>`;

function menu(): void {
  const rows = world.history
    .slice(-7)
    .reverse()
    .map((d) => `<tr><td>Day ${d.day}</td><td>${money(d.rent)}</td><td>${money(d.sales + d.hotel)}</td><td>−${money(d.upkeep)}</td><td>${d.visitors}</td><td>${d.pop}</td></tr>`)
    .join('');
  const stars = STARS.slice(2)
    .map((s, i) => `<li class="${world.stars >= i + 2 ? 'done' : ''}">${'⭐'.repeat(i + 2)} ${s.text}${world.stars >= i + 2 ? ' ✓' : meetsStar(world, i + 2) ? ' (at midnight)' : ''}</li>`)
    .join('');
  const d = dialog(`<h2>🎈 Skyhold</h2>
    <p class="dim">Day ${world.day} · ${population(world)} people · ${money(world.money)} · ${Math.round(world.altitude)} m${inClouds(world) ? ' (in the clouds!)' : ''}</p>
    <h3>Star rating</h3><ul class="stars-list">${stars}</ul>
    <h3>Last days</h3>
    ${rows ? `<table><tr><th></th><th>Rent</th><th>Sales</th><th>Upkeep</th><th>Visitors</th><th>People</th></tr>${rows}</table>` : '<p class="dim">Nothing yet: the first night’s takings come at midnight.</p>'}
    ${HELP}
    <div class="row">
      <button class="btn" data-m="close">Back to Skyhold</button>
      <button class="btn ghost" data-m="sound">${isMuted() ? '🔊 Sound on' : '🔇 Sound off'}</button>
      <a class="btn ghost" href="/" style="text-decoration:none">← All games</a>
      <button class="btn red" data-m="new">Start over</button>
    </div>`);
  d.onclick = (e) => {
    const m = (e.target as HTMLElement).closest<HTMLElement>('[data-m]')?.dataset.m;
    if (m === 'close') closeDialog();
    if (m === 'sound') {
      setMuted(!isMuted());
      menu();
    }
    if (m === 'new' && confirm('Start a brand new Skyhold? This one will be gone.')) {
      world = newWorld();
      save(true);
      closeDialog();
      renderPalette();
      welcome();
    }
  };
}

function welcome(): void {
  const d = dialog(`<h2>🎈 Welcome to Skyhold</h2>
    <p>You’re the keeper of a city that hangs beneath a great balloon, high above the cloud sea. Build homes, cafés and attractions, keep the lifts moving and the people happy, and don’t let it get too heavy.</p>
    <h3>Getting started</h3>
    <ol>
      <li>Pick <b>🚡 Lift</b> and tap the cell just above the ⚓ dock. Tap above it again to add floors.</li>
      <li>Pick <b>🛏️ Cabin</b> and build them beside the lift on each floor.</li>
      <li>Add a <b>☕ Café</b> nearby. Rent arrives at midnight.</li>
    </ol>
    ${HELP}
    <div class="row"><button class="btn gold" data-m="go">Let’s build</button></div>`);
  d.onclick = (e) => {
    if ((e.target as HTMLElement).closest('[data-m="go"]')) {
      unlock();
      localStorage.setItem('skyhold.welcomed', '1');
      closeDialog();
    }
  };
}

// ── Start ──────────────────────────────────────────────────────

$('palette').addEventListener('click', (e) => {
  const t = (e.target as HTMLElement).closest<HTMLElement>('[data-tool]')?.dataset.tool;
  if (t) setTool(t as Tool);
});
$('speeds').addEventListener('click', (e) => {
  const s = (e.target as HTMLElement).closest<HTMLElement>('[data-speed]')?.dataset.speed;
  if (s === undefined) return;
  speed = Number(s);
  localStorage.setItem('skyhold.speed', String(speed));
  unlock();
  sfx.click();
  hud();
});
$('menu-btn').addEventListener('click', menu);
$('alt').addEventListener('click', envelopeSheet);
$('advice').addEventListener('click', () => {
  // Jump to whatever the advice is about.
  const L = layout(world);
  const trouble = world.rooms.find((r) => r.damaged) ?? world.rooms.find((r) => r.type !== 'walk' && L.path.get(r.id) === null);
  if (trouble) {
    view.cx = (trouble.x + ROOMS[trouble.type].w / 2) * CW;
    view.cy = -(trouble.y + 0.5) * FH;
    selected = { room: trouble };
    tool = 'inspect';
    renderPalette();
    renderSheet();
  }
});
$('overlay').addEventListener('click', (e) => e.target === $('overlay') && closeDialog());
addEventListener('resize', resize);
addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (!$('overlay').hidden) closeDialog();
    else setTool('inspect');
  }
  if (e.key === ' ' && $('overlay').hidden) {
    speed = speed ? 0 : 1;
    hud();
  }
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    save(true);
    if (isLinked()) void sync().catch(() => {});
  } else {
    // Back from another app: catch up on the time away.
    catchUp();
    hud();
  }
});

// Dev builds only: drive Skyhold from the console (tap a cell, run hours).
if (import.meta.env.DEV) {
  const tapCell = (x: number, y: number) => {
    const [sx, sy] = [(x * CW + CW / 2 - view.cx) * view.zoom + view.W / 2, (-(y + 0.5) * FH - view.cy) * view.zoom + view.H / 2];
    tap(sx, sy);
  };
  Object.assign(window, { skyhold: { world: () => world, view, setTool, tapCell, hours: (n: number) => { for (let i = 0; i < n; i++) runHour(); } } });
}

resize();
view.zoom = Math.max(0.6, Math.min(1.4, view.W / (16 * CW)));
view.cy = -Math.max(3, layout(world).top / 2) * FH;
catchUp();
renderPalette();
hud();
requestAnimationFrame(frame);
if (!localStorage.getItem('skyhold.welcomed')) welcome();
// Family sync: pick up Skyhold from your other devices (reloads once if it changed elsewhere).
syncOnOpen(undefined, () => location.reload());
