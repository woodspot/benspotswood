// Skyhold: a city that hangs beneath great balloons. This file is the whole simulation (no drawing),
// so it can be tested. The city is a grid: columns across, floors up from the Sky Dock on floor 0.
//
//  * Rooms take a few cells on one floor. People walk along a floor through touching rooms, and
//    ride lifts between floors. A room nobody can reach from the dock stays empty.
//  * Everything has weight; the balloon envelope, gas cells and Aether engines give lift. Too heavy
//    and Skyhold sinks toward the cloud sea, where storms do damage and nobody wants to live.
//  * Time runs in hours. Each hour people commute, eat, shop and visit; lifts can get overcrowded.
//    At midnight rent comes in, upkeep goes out, people move in or out, and the star rating is checked.

export const COLS = 40;
export const MAX_FLOORS = 60;
export const DOCK_X = 16;
export const DOCK_W = 8;
export const CLOUD_TOP = 250; // the cloud sea, in metres
export const STORM_TOP = 450; // how high it boils up during a storm
export const MAX_ALT = 1100;
export const LIFT_FLOOR_COST = 400;
export const LIFT_BASE_COST = 2000;
export const CAR_COST = 1500;
export const MAX_CARS = 4;
export const MAX_LIFT_SPAN = 20;
export const MAX_ENVELOPE = 10;

export type RoomType =
  | 'dock' | 'walk' | 'cabin' | 'cafe' | 'gas' | 'shop' | 'workshop' | 'garden' | 'engine'
  | 'hotel' | 'theatre' | 'observatory' | 'harbor' | 'lighthouse';

type Kind = 'base' | 'path' | 'home' | 'food' | 'lift' | 'shop' | 'work' | 'garden' | 'engine' | 'stay' | 'fun';

export interface RoomDef {
  id: RoomType;
  name: string;
  icon: string;
  w: number; // cells wide
  cost: number;
  weight: number; // tons
  star: number; // star rating that unlocks it
  kind: Kind;
  cap?: number; // residents, workers, guests or seats per hour
  rent?: number; // per resident per day (homes), per day (work), per guest per night (hotels)
  spend?: number; // per customer (food, shops, fun)
  draw?: number; // how many visitors it attracts
  open?: [number, number]; // hours it's open (customers)
  lift?: number; // tons of lift it gives
  upkeep?: number; // per day
  noise?: number; // bothers homes next to it
  color: string;
  desc: string;
}

export const ROOMS: Record<RoomType, RoomDef> = {
  dock: { id: 'dock', name: 'Sky Dock', icon: '⚓', w: DOCK_W, cost: 0, weight: 8, star: 1, kind: 'base', color: '#8a6a4a', desc: 'Where airships moor and everyone arrives. Every room must be reachable from here.' },
  walk: { id: 'walk', name: 'Walkway', icon: '', w: 1, cost: 100, weight: 0.3, star: 1, kind: 'path', color: '#9aa6b2', desc: 'A short bridge so people can walk between rooms on the same floor.' },
  cabin: { id: 'cabin', name: 'Cabin', icon: '🛏️', w: 2, cost: 1200, weight: 3, star: 1, kind: 'home', cap: 3, rent: 60, color: '#e9c89a', desc: 'Home for 3 residents. They want a lift, quiet neighbours and a café nearby.' },
  cafe: { id: 'cafe', name: 'Café', icon: '☕', w: 3, cost: 3500, weight: 4, star: 1, kind: 'food', cap: 24, spend: 14, draw: 15, open: [7, 21], color: '#d98b5f', desc: 'Breakfast, lunch and dinner for residents, workers and visitors.' },
  gas: { id: 'gas', name: 'Gas cell', icon: '🎈', w: 2, cost: 1500, weight: 0.5, star: 1, kind: 'lift', lift: 8, color: '#bfe3f2', desc: 'A bag of lifting gas: +8 tons of lift. Light and quiet, but storms tear it easily.' },
  shop: { id: 'shop', name: 'Shop', icon: '🛍️', w: 2, cost: 3000, weight: 3, star: 2, kind: 'shop', cap: 20, spend: 20, draw: 20, open: [9, 20], color: '#c49bd8', desc: 'Visitors browse and buy during the day.' },
  workshop: { id: 'workshop', name: 'Workshop', icon: '⚙️', w: 3, cost: 5000, weight: 6, star: 2, kind: 'work', cap: 6, rent: 450, noise: 1, color: '#9c9c8c', desc: '6 workers commute in each day and pay rent. A bit noisy for neighbours.' },
  garden: { id: 'garden', name: 'Sky garden', icon: '🌳', w: 2, cost: 4000, weight: 5, star: 2, kind: 'garden', upkeep: 30, color: '#7cc46c', desc: 'Homes and hotels within 2 floors are happier. Soil is heavy!' },
  engine: { id: 'engine', name: 'Aether engine', icon: '🌀', w: 2, cost: 8000, weight: 4, star: 2, kind: 'engine', lift: 30, upkeep: 150, noise: 2, color: '#6f8fd8', desc: '+30 tons of lift, but loud and costly to run.' },
  hotel: { id: 'hotel', name: 'Hotel suite', icon: '🛎️', w: 3, cost: 9000, weight: 5, star: 3, kind: 'stay', cap: 4, rent: 130, color: '#e8a0a8', desc: 'Visitors stay the night. Needs a lift, quiet and a busy Skyhold.' },
  theatre: { id: 'theatre', name: 'Theatre', icon: '🎭', w: 5, cost: 20000, weight: 10, star: 3, kind: 'fun', cap: 60, spend: 28, draw: 60, open: [18, 23], color: '#b0465a', desc: 'Evening shows that draw crowds from far away.' },
  observatory: { id: 'observatory', name: 'Observatory', icon: '🔭', w: 3, cost: 30000, weight: 4, star: 4, kind: 'fun', cap: 30, spend: 22, draw: 40, open: [10, 23], color: '#3d4f7a', desc: 'Stargazing and the view. Twice as popular above 800 m.' },
  harbor: { id: 'harbor', name: 'Sky harbor', icon: '🛳️', w: 4, cost: 40000, weight: 8, star: 4, kind: 'base', color: '#5f7f8f', desc: 'More airship berths: +50% visitors.' },
  lighthouse: { id: 'lighthouse', name: 'Lighthouse', icon: '🗼', w: 2, cost: 100000, weight: 6, star: 5, kind: 'fun', cap: 20, spend: 30, draw: 30, open: [17, 24], color: '#f2d36b', desc: 'The crowning glory: Skyhold becomes a legend.' },
};

export const BUILDABLE: RoomType[] = ['walk', 'cabin', 'cafe', 'gas', 'shop', 'workshop', 'garden', 'engine', 'hotel', 'theatre', 'observatory', 'harbor', 'lighthouse'];

/** What each star needs, and what it unlocks. */
export const STARS: { pop: number; need?: RoomType[]; alt?: number; text: string }[] = [
  { pop: 0, text: '' },
  { pop: 0, text: 'A new Skyhold' },
  { pop: 40, text: '40 people' },
  { pop: 150, need: ['garden'], text: '150 people and a Sky garden' },
  { pop: 400, need: ['hotel'], text: '400 people and a Hotel suite' },
  { pop: 900, need: ['theatre', 'observatory'], alt: 700, text: '900 people, a Theatre, an Observatory, flying above 700 m' },
];

export interface Room {
  id: number;
  type: RoomType;
  x: number;
  y: number;
  occ: number; // residents, workers or guests right now
  mood: number; // 0–100 (homes, work, hotels)
  damaged: boolean;
}

export interface Lift {
  id: number;
  x: number;
  y0: number; // bottom floor
  y1: number; // top floor
  cars: number;
}

export interface DayReport {
  day: number;
  rent: number;
  sales: number;
  hotel: number;
  upkeep: number;
  visitors: number;
  pop: number;
}

export interface World {
  v: 1;
  rng: number;
  money: number;
  day: number;
  hour: number; // 0–23: the hour about to be simulated
  stars: number;
  envelope: number; // balloon envelope level 1–10
  altitude: number;
  rooms: Room[];
  lifts: Lift[];
  nextId: number;
  storm: { at: number; hours: number; active: boolean } | null;
  today: DayReport;
  history: DayReport[];
  legend: boolean; // built the Lighthouse at 5 stars
  rev: number; // bumps when the structure changes
}

// ── Basics ─────────────────────────────────────────────────────

export function random(w: World): number {
  let t = (w.rng = (w.rng + 0x6d2b79f5) | 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

const blankDay = (day: number): DayReport => ({ day, rent: 0, sales: 0, hotel: 0, upkeep: 0, visitors: 0, pop: 0 });

export function newWorld(seed = (Math.random() * 2 ** 31) | 0): World {
  return {
    v: 1,
    rng: seed,
    money: 30000,
    day: 1,
    hour: 6,
    stars: 1,
    envelope: 1,
    altitude: 700,
    rooms: [{ id: 1, type: 'dock', x: DOCK_X, y: 0, occ: 0, mood: 100, damaged: false }],
    lifts: [],
    nextId: 2,
    storm: null,
    today: blankDay(1),
    history: [],
    legend: false,
    rev: 0,
  };
}

export const envelopeLift = (level: number) => 40 + 30 * level;
export const envelopeCost = (level: number) => 3000 * (level + 1) ** 2; // the cost to go up from `level`
export const liftCost = (floors: number) => LIFT_BASE_COST + LIFT_FLOOR_COST * floors;
/** People a lift carries per hour: 30 per car, fewer in tall shafts (longer trips). */
export const liftCap = (l: Lift) => (l.cars * 30 * 8) / Math.max(8, l.y1 - l.y0 + 2);
export const repairCost = (r: Room) => Math.round(ROOMS[r.type].cost * 0.25);
const cell = (x: number, y: number) => `${x},${y}`;

// ── Structure: what's where, who can get where ─────────────────

export interface Layout {
  grid: Map<string, { room?: Room; lift?: Lift }>;
  /** Lifts on the way from the dock to each room's floor (null: can't get there). */
  path: Map<number, Lift[] | null>;
  weight: number;
  lift: number;
  top: number; // highest floor in use
  minX: number;
  maxX: number;
}

let cached: { rev: number; world: World; layout: Layout } | null = null;

export function layout(w: World): Layout {
  if (cached && cached.world === w && cached.rev === w.rev) {
    // People count toward weight and change by the hour; the rest is cached.
    cached.layout.weight = structureWeight(w) + peopleWeight(w);
    return cached.layout;
  }
  const grid = new Map<string, { room?: Room; lift?: Lift }>();
  let top = 0;
  let minX = DOCK_X;
  let maxX = DOCK_X + DOCK_W - 1;
  for (const r of w.rooms) {
    for (let i = 0; i < ROOMS[r.type].w; i++) grid.set(cell(r.x + i, r.y), { room: r });
    top = Math.max(top, r.y);
    minX = Math.min(minX, r.x);
    maxX = Math.max(maxX, r.x + ROOMS[r.type].w - 1);
  }
  for (const l of w.lifts) {
    for (let y = l.y0; y <= l.y1; y++) grid.set(cell(l.x, y), { lift: l });
    top = Math.max(top, l.y1);
    minX = Math.min(minX, l.x);
    maxX = Math.max(maxX, l.x);
  }

  // Walkable stretches: runs of touching cells on one floor.
  const seg = new Map<string, number>();
  const segFloor: number[] = [];
  let n = 0;
  for (let y = 0; y <= top; y++) {
    let cur = -1;
    for (let x = 0; x < COLS; x++) {
      if (grid.has(cell(x, y))) {
        if (cur < 0) {
          cur = n++;
          segFloor.push(y);
        }
        seg.set(cell(x, y), cur);
      } else cur = -1;
    }
  }
  // From the dock, ride lifts: each stretch remembers the lifts it took to get there.
  const via: (Lift[] | null)[] = Array(n).fill(null);
  const start = seg.get(cell(DOCK_X, 0))!;
  via[start] = [];
  const queue = [start];
  // A lift stops on every floor it spans, and also on the floor it stands on (so a lift built
  // on top of the dock carries people up from the dock).
  const stops = (l: Lift) => {
    const floors: number[] = [];
    if (l.y0 > 0 && grid.has(cell(l.x, l.y0 - 1)) && !grid.get(cell(l.x, l.y0 - 1))!.lift) floors.push(l.y0 - 1);
    for (let y = l.y0; y <= l.y1; y++) floors.push(y);
    return floors;
  };
  while (queue.length) {
    const s = queue.shift()!;
    for (const l of w.lifts) {
      const floors = stops(l);
      const y = segFloor[s];
      if (!floors.includes(y) || seg.get(cell(l.x, y)) !== s) continue;
      for (const fy of floors) {
        const t = seg.get(cell(l.x, fy))!;
        if (via[t] === null) {
          via[t] = [...via[s]!, l];
          queue.push(t);
        }
      }
    }
  }
  const path = new Map<number, Lift[] | null>();
  for (const r of w.rooms) path.set(r.id, via[seg.get(cell(r.x, r.y))!]);

  const lift = envelopeLift(w.envelope) + w.rooms.reduce((t, r) => t + (r.damaged ? 0 : ROOMS[r.type].lift ?? 0), 0);
  const out: Layout = { grid, path, weight: structureWeight(w) + peopleWeight(w), lift, top, minX, maxX };
  cached = { rev: w.rev, world: w, layout: out };
  return out;
}

const structureWeight = (w: World) =>
  w.rooms.reduce((t, r) => t + ROOMS[r.type].weight, 0) + w.lifts.reduce((t, l) => t + (l.y1 - l.y0 + 1) + l.cars * 0.5, 0);
const peopleWeight = (w: World) => w.rooms.reduce((t, r) => t + r.occ, 0) * 0.05;

export const population = (w: World) =>
  w.rooms.reduce((t, r) => t + (ROOMS[r.type].kind === 'home' || ROOMS[r.type].kind === 'work' ? r.occ : 0), 0);

/** Where Skyhold settles for its lift/weight: 1.0 floats at 600 m. */
export function targetAltitude(w: World): number {
  const L = layout(w);
  const ratio = L.lift / Math.max(1, L.weight);
  return Math.max(0, Math.min(MAX_ALT, 600 + (ratio - 1) * 1000));
}

export const cloudTop = (w: World) => (w.storm?.active ? STORM_TOP : CLOUD_TOP);
export const inClouds = (w: World) => w.altitude < cloudTop(w);

// ── Building ───────────────────────────────────────────────────

export type PlaceResult = { ok: true } | { ok: false; why: string };

function touches(L: Layout, cells: [number, number][]): boolean {
  return cells.some(([x, y]) => [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => L.grid.has(cell(x + dx, y + dy))));
}

export function canPlace(w: World, type: RoomType, x: number, y: number): PlaceResult {
  const def = ROOMS[type];
  if (def.star > w.stars) return { ok: false, why: `Unlocks at ${def.star} stars` };
  if (y < 0 || y >= MAX_FLOORS || x < 0 || x + def.w > COLS) return { ok: false, why: 'Off the edge' };
  const L = layout(w);
  const cells: [number, number][] = Array.from({ length: def.w }, (_, i) => [x + i, y]);
  if (cells.some(([cx, cy]) => L.grid.has(cell(cx, cy)))) return { ok: false, why: 'Something is already there' };
  if (!touches(L, cells)) return { ok: false, why: 'Must touch the rest of Skyhold' };
  if (type === 'lighthouse' && w.rooms.some((r) => r.type === 'lighthouse')) return { ok: false, why: 'There is only one Lighthouse' };
  if (w.money < def.cost) return { ok: false, why: 'Not enough money' };
  return { ok: true };
}

export function place(w: World, type: RoomType, x: number, y: number): PlaceResult {
  const ok = canPlace(w, type, x, y);
  if (!ok.ok) return ok;
  w.money -= ROOMS[type].cost;
  w.rooms.push({ id: w.nextId++, type, x, y, occ: 0, mood: 60, damaged: false });
  w.rev++;
  return ok;
}

/** The lift tool: extend a lift whose end is next to (x, y), or start a new one there. */
export function liftAction(w: World, x: number, y: number): { ok: true; cost: number; extended: boolean } | { ok: false; why: string } {
  if (y < 0 || y >= MAX_FLOORS || x < 0 || x >= COLS) return { ok: false, why: 'Off the edge' };
  const L = layout(w);
  if (L.grid.has(cell(x, y))) return { ok: false, why: 'Something is already there' };
  const end = w.lifts.find((l) => l.x === x && (l.y1 === y - 1 || l.y0 === y + 1));
  if (end) {
    if (end.y1 - end.y0 + 1 >= MAX_LIFT_SPAN) return { ok: false, why: `A lift can span ${MAX_LIFT_SPAN} floors at most` };
    if (w.money < LIFT_FLOOR_COST) return { ok: false, why: 'Not enough money' };
    w.money -= LIFT_FLOOR_COST;
    if (end.y1 === y - 1) end.y1 = y;
    else end.y0 = y;
    w.rev++;
    return { ok: true, cost: LIFT_FLOOR_COST, extended: true };
  }
  if (!touches(L, [[x, y]])) return { ok: false, why: 'Must touch the rest of Skyhold' };
  const cost = liftCost(1);
  if (w.money < cost) return { ok: false, why: 'Not enough money' };
  w.money -= cost;
  w.lifts.push({ id: w.nextId++, x, y0: y, y1: y, cars: 1 });
  w.rev++;
  return { ok: true, cost, extended: false };
}

export function addCar(w: World, liftId: number): PlaceResult {
  const l = w.lifts.find((k) => k.id === liftId);
  if (!l) return { ok: false, why: 'No such lift' };
  if (l.cars >= MAX_CARS) return { ok: false, why: `${MAX_CARS} cars is the most a shaft holds` };
  if (w.money < CAR_COST) return { ok: false, why: 'Not enough money' };
  w.money -= CAR_COST;
  l.cars++;
  w.rev++;
  return { ok: true };
}

export function upgradeEnvelope(w: World): PlaceResult {
  if (w.envelope >= MAX_ENVELOPE) return { ok: false, why: 'The envelope is as big as it gets' };
  const cost = envelopeCost(w.envelope);
  if (w.money < cost) return { ok: false, why: 'Not enough money' };
  w.money -= cost;
  w.envelope++;
  w.rev++;
  return { ok: true };
}

export function repair(w: World, roomId: number): PlaceResult {
  const r = w.rooms.find((k) => k.id === roomId);
  if (!r || !r.damaged) return { ok: false, why: 'Nothing to repair' };
  const cost = repairCost(r);
  if (w.money < cost) return { ok: false, why: 'Not enough money' };
  w.money -= cost;
  r.damaged = false;
  w.rev++;
  return { ok: true };
}

/** Would everything still hang together (all connected to the dock) without these cells? */
function stillConnected(w: World, without: Set<string>): boolean {
  const L = layout(w);
  const cells = [...L.grid.keys()].filter((k) => !without.has(k));
  const left = new Set(cells);
  const start = cell(DOCK_X, 0);
  const seen = new Set([start]);
  const queue = [start];
  while (queue.length) {
    const [x, y] = queue.shift()!.split(',').map(Number);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const k = cell(x + dx, y + dy);
      if (left.has(k) && !seen.has(k)) {
        seen.add(k);
        queue.push(k);
      }
    }
  }
  return seen.size === left.size;
}

export const refund = (cost: number) => Math.round(cost * 0.25);

export function demolish(w: World, target: { room?: Room; lift?: Lift }): { ok: true; refund: number } | { ok: false; why: string } {
  let cells: string[];
  let back: number;
  if (target.room) {
    const r = target.room;
    if (r.type === 'dock') return { ok: false, why: 'The Sky Dock holds everything up' };
    cells = Array.from({ length: ROOMS[r.type].w }, (_, i) => cell(r.x + i, r.y));
    back = refund(ROOMS[r.type].cost);
  } else if (target.lift) {
    const l = target.lift;
    cells = Array.from({ length: l.y1 - l.y0 + 1 }, (_, i) => cell(l.x, l.y0 + i));
    back = refund(liftCost(l.y1 - l.y0 + 1) + (l.cars - 1) * CAR_COST);
  } else return { ok: false, why: 'Nothing there' };
  if (!stillConnected(w, new Set(cells))) return { ok: false, why: 'Part of Skyhold would fall off! Remove what hangs from it first' };
  if (target.room) w.rooms = w.rooms.filter((r) => r !== target.room);
  else w.lifts = w.lifts.filter((l) => l !== target.lift);
  w.money += back;
  w.rev++;
  return { ok: true, refund: back };
}

// ── An hour of life ────────────────────────────────────────────

/** Share of a day's visitors arriving in each hour. */
const VISIT = [0, 0, 0, 0, 0, 0, 0.01, 0.02, 0.03, 0.05, 0.06, 0.07, 0.09, 0.08, 0.07, 0.06, 0.06, 0.07, 0.08, 0.09, 0.08, 0.05, 0.02, 0.01];
const isOpen = (d: RoomDef, h: number) => !!d.open && h >= d.open[0] && h < d.open[1];

export interface HourStats {
  income: number;
  visitors: number;
  liftLoad: Map<number, number>; // demand ÷ capacity for each lift this hour
  events: string[];
}

/** How happy a home, workplace or hotel would be right now (before moving toward it). */
export function moodTarget(w: World, r: Room, wait: number): { mood: number; why: string[] } {
  const L = layout(w);
  if (L.path.get(r.id) === null) return { mood: 0, why: ['No way to get here from the dock'] };
  const kind = ROOMS[r.type].kind;
  let m = kind === 'work' ? 70 : 60;
  const why: string[] = [];
  const near = (dy: number, k: Kind) =>
    w.rooms.some((o) => o !== r && !o.damaged && ROOMS[o.type].kind === k && Math.abs(o.y - r.y) <= dy && L.path.get(o.id) !== null);
  if (kind === 'home' || kind === 'stay') {
    if (near(2, 'garden')) m += 12;
    else why.push('No Sky garden within 2 floors');
    if (near(3, 'food')) m += 10;
    else why.push('No café within 3 floors');
    if (w.altitude >= 800) m += 6;
  }
  // Noise from next door (same floor, touching).
  const w0 = r.x - 1;
  const w1 = r.x + ROOMS[r.type].w;
  for (const o of w.rooms) {
    const n = ROOMS[o.type].noise ?? 0;
    if (!n || o === r || o.y !== r.y) continue;
    if (o.x + ROOMS[o.type].w - 1 === w0 || o.x === w1) {
      if (kind !== 'work') {
        m -= 12 * n;
        why.push(`Noisy ${ROOMS[o.type].name.toLowerCase()} next door`);
      }
    }
  }
  if (wait > 0.05) {
    m -= Math.round(35 * Math.min(1, wait));
    why.push('Long waits for the lift');
  }
  if (inClouds(w)) {
    m -= w.storm?.active ? 25 : 15;
    why.push(w.storm?.active ? 'Caught in a storm' : 'Damp and grey in the clouds');
  }
  if (r.damaged) {
    m -= 40;
    why.push('Damaged: needs repair');
  }
  return { mood: Math.max(0, Math.min(100, m)), why };
}

function visitorsPerDay(w: World): number {
  const L = layout(w);
  let draw = 0;
  for (const r of w.rooms) {
    const d = ROOMS[r.type];
    if (!d.draw || r.damaged || L.path.get(r.id) === null) continue;
    draw += d.draw * (r.type === 'observatory' && w.altitude >= 800 ? 2 : 1);
  }
  let v = (30 + 0.9 * draw) * (1 + 0.25 * (w.stars - 1));
  if (w.rooms.some((r) => r.type === 'harbor' && !r.damaged)) v *= 1.5;
  if (inClouds(w)) v *= 0.6;
  else if (w.altitude >= 800) v *= 1.15;
  return v;
}

/** Simulate one hour. Returns what happened (for the screen); the world changes in place. */
export function tick(w: World): HourStats {
  const h = w.hour;
  const L = layout(w);
  const stats: HourStats = { income: 0, visitors: 0, liftLoad: new Map(), events: [] };

  // Storms: forecast in the morning, then the cloud sea boils up for a few hours.
  if (h === 6 && !w.storm && w.day > 3 && random(w) < 0.22) {
    w.storm = { at: 10 + Math.floor(random(w) * 10), hours: 3 + Math.floor(random(w) * 4), active: false };
    stats.events.push(`⛈️ Storm forecast around ${w.storm.at}:00. The clouds will boil up to ${STORM_TOP} m: fly above them if you can.`);
  }
  if (w.storm && !w.storm.active && h === w.storm.at) {
    w.storm.active = true;
    stats.events.push('⛈️ The storm has arrived!');
  }
  if (w.storm?.active) {
    if (inClouds(w)) {
      const fragile = w.rooms.filter((r) => r.type !== 'dock' && !r.damaged);
      if (fragile.length && random(w) < 0.3) {
        // Gas cells are twice as likely to tear.
        const weights = fragile.map((r) => (r.type === 'gas' ? 2 : 1));
        let pick = random(w) * weights.reduce((a, b) => a + b, 0);
        const hit = fragile.find((_, i) => (pick -= weights[i]) < 0) ?? fragile[0];
        hit.damaged = true;
        w.rev++;
        stats.events.push(`⚡ Lightning damaged a ${ROOMS[hit.type].name.toLowerCase()} on floor ${hit.y}. Tap it to repair.`);
      }
    }
    if (--w.storm.hours <= 0) {
      w.storm = null;
      stats.events.push('🌤️ The storm has passed.');
    }
  }

  // Who's moving around this hour, and through which lifts.
  const demand = new Map<number, number>();
  const ride = (r: Room, people: number) => {
    for (const l of L.path.get(r.id) ?? []) demand.set(l.id, (demand.get(l.id) ?? 0) + people);
  };
  const residents = w.rooms.reduce((t, r) => t + (ROOMS[r.type].kind === 'home' ? r.occ : 0), 0);
  const workers = w.rooms.reduce((t, r) => t + (ROOMS[r.type].kind === 'work' ? r.occ : 0), 0);
  for (const r of w.rooms) {
    const k = ROOMS[r.type].kind;
    if (k === 'home') ride(r, r.occ * (h === 7 || h === 8 || h === 17 || h === 18 ? 0.4 : h >= 9 && h <= 21 ? 0.08 : 0));
    if (k === 'work') ride(r, r.occ * (h === 8 || h === 17 ? 0.5 : h === 12 ? 0.3 : 0));
    if (k === 'stay') ride(r, r.occ * (h >= 18 && h <= 20 ? 0.3 : h === 8 || h === 9 ? 0.4 : 0));
  }

  // Customers: visitors, plus residents and workers at mealtimes.
  const visitors = visitorsPerDay(w) * VISIT[h];
  stats.visitors = visitors;
  const open = w.rooms.filter((r) => isOpen(ROOMS[r.type], h) && !r.damaged && L.path.get(r.id) !== null);
  const drawTotal = open.reduce((t, r) => t + (ROOMS[r.type].draw ?? 0), 0);
  const meal = h === 7 ? 0.2 : h === 12 ? 0.3 : h === 19 ? 0.4 : 0;
  const foodRooms = open.filter((r) => ROOMS[r.type].kind === 'food');
  // Waits are worked out from last hour's crowds first, then customers who'd wait too long give up.
  const waitFor = (r: Room) => {
    let worst = 0;
    for (const l of L.path.get(r.id) ?? []) {
      worst = Math.max(worst, (demand.get(l.id) ?? 0) / liftCap(l) - 1);
    }
    return Math.max(0, worst);
  };
  for (const r of open) {
    const d = ROOMS[r.type];
    let want = drawTotal ? (visitors * (d.draw ?? 0)) / drawTotal : 0;
    if (d.kind === 'food' && foodRooms.length) want += ((residents + (h === 12 ? workers * 2 : 0)) * meal) / foodRooms.length;
    const served = Math.min(want, d.cap ?? 0) * (1 - Math.min(0.8, waitFor(r) * 0.5));
    stats.income += served * (d.spend ?? 0);
    ride(r, served * 2); // there and back
  }
  w.today.sales += stats.income;
  w.today.visitors += visitors;

  for (const l of w.lifts) stats.liftLoad.set(l.id, (demand.get(l.id) ?? 0) / liftCap(l));

  // Moods drift toward how things are.
  for (const r of w.rooms) {
    const k = ROOMS[r.type].kind;
    if (k !== 'home' && k !== 'work' && k !== 'stay') continue;
    const target = moodTarget(w, r, waitFor(r)).mood;
    r.mood += (target - r.mood) * 0.15;
  }

  // Hotels fill in the evening.
  if (h === 20) {
    const demandFactor = Math.min(1, visitorsPerDay(w) / 160);
    for (const r of w.rooms) {
      if (ROOMS[r.type].kind !== 'stay') continue;
      const ok = L.path.get(r.id) !== null && !r.damaged;
      r.occ = ok ? Math.round((ROOMS[r.type].cap ?? 0) * demandFactor * (r.mood / 100)) : 0;
      const pay = r.occ * (ROOMS[r.type].rent ?? 0);
      w.today.hotel += pay;
      stats.income += pay;
    }
  }
  if (h === 10) for (const r of w.rooms) if (ROOMS[r.type].kind === 'stay') r.occ = 0; // check-out

  // Drift toward the altitude the lift can hold.
  const target = targetAltitude(w);
  w.altitude += Math.max(-20, Math.min(20, target - w.altitude));

  w.money += stats.income;
  w.hour++;
  if (w.hour >= 24) {
    w.hour = 0;
    stats.events.push(...endOfDay(w));
  }
  return stats;
}

/** Midnight: rent and upkeep, people move in and out, the star rating. */
function endOfDay(w: World): string[] {
  const L = layout(w);
  const events: string[] = [];
  const t = w.today;
  for (const r of w.rooms) {
    const d = ROOMS[r.type];
    const reach = L.path.get(r.id) !== null && !r.damaged;
    if (d.kind === 'home') {
      t.rent += r.occ * (d.rent ?? 0) * (0.5 + r.mood / 200);
      if (!reach) r.occ = 0;
      else if (r.mood >= 55) r.occ = Math.min(d.cap ?? 0, r.occ + (r.mood >= 75 ? 2 : 1));
      else if (r.mood < 35) r.occ = Math.max(0, r.occ - 1);
    }
    if (d.kind === 'work') {
      if (r.occ) t.rent += (d.rent ?? 0) * (0.5 + r.mood / 200);
      r.occ = reach && r.mood >= 40 ? d.cap ?? 0 : 0;
    }
    t.upkeep += d.upkeep ?? 0;
  }
  for (const l of w.lifts) t.upkeep += 40 * l.cars;
  t.rent = Math.round(t.rent);
  t.sales = Math.round(t.sales);
  t.visitors = Math.round(t.visitors);
  w.money += t.rent - t.upkeep;
  t.pop = population(w);
  w.history = [...w.history.slice(-13), t];
  events.push(`🌙 Day ${w.day}: rent $${t.rent.toLocaleString()}, sales $${(t.sales + t.hotel).toLocaleString()}, upkeep $${t.upkeep.toLocaleString()}.`);

  const next = STARS[w.stars + 1];
  if (next && meetsStar(w, w.stars + 1)) {
    w.stars++;
    const unlocked = BUILDABLE.filter((id) => ROOMS[id].star === w.stars).map((id) => `${ROOMS[id].icon} ${ROOMS[id].name}`);
    events.push(`⭐ Skyhold is now a ${w.stars}-star city!${unlocked.length ? ` New: ${unlocked.join(', ')}.` : ''}`);
  }
  if (!w.legend && w.stars >= 5 && w.rooms.some((r) => r.type === 'lighthouse')) {
    w.legend = true;
    events.push('🗼 The Lighthouse shines over the clouds. Skyhold is a legend!');
  }
  w.day++;
  w.today = blankDay(w.day);
  return events;
}

export function meetsStar(w: World, star: number): boolean {
  const s = STARS[star];
  if (!s) return false;
  if (population(w) < s.pop) return false;
  if (s.need && !s.need.every((t) => w.rooms.some((r) => r.type === t))) return false;
  if (s.alt && w.altitude < s.alt) return false;
  return true;
}

// ── Advice: the most useful thing to look at next ─────────────

export function advice(w: World, liftLoad: Map<number, number>): string {
  const L = layout(w);
  const ratio = L.lift / Math.max(1, L.weight);
  if (w.altitude < cloudTop(w) + 50 && ratio < 1)
    return `⚠️ Too heavy (${Math.round(L.weight)} t vs ${Math.round(L.lift)} t of lift): Skyhold is sinking. Add gas cells, an Aether engine, or a bigger envelope.`;
  const cut = w.rooms.filter((r) => r.type !== 'walk' && L.path.get(r.id) === null);
  if (cut.length) return `🚧 ${cut.length} room${cut.length > 1 ? 's' : ''} can't be reached from the dock. Connect ${cut.length > 1 ? 'them' : 'it'} with a lift or walkway.`;
  const busy = [...liftLoad.entries()].sort((a, b) => b[1] - a[1])[0];
  if (busy && busy[1] > 1.1) return '🚡 A lift is overcrowded (shown in red). Tap it to add a car, or build a second lift.';
  if (w.storm && !w.storm.active && w.altitude < STORM_TOP) return `⛈️ Storm at ${w.storm.at}:00 and you're at ${Math.round(w.altitude)} m. Climb above ${STORM_TOP} m to stay safe.`;
  const damaged = w.rooms.filter((r) => r.damaged);
  if (damaged.length) return `🔧 ${damaged.length} room${damaged.length > 1 ? 's' : ''} damaged. Tap to repair.`;
  const sad = w.rooms.filter((r) => ROOMS[r.type].kind === 'home' && r.mood < 45);
  if (sad.length) return `😟 ${sad.length} cabin${sad.length > 1 ? 's are' : ' is'} unhappy. Tap one to see why.`;
  if (!w.lifts.length) return '👋 Start with a lift from the dock (tap the lift tool, then a cell above the dock), then build cabins beside it.';
  if (!w.rooms.some((r) => r.type === 'cabin')) return '🛏️ Build some cabins next to your lift: residents pay rent every night.';
  if (!w.rooms.some((r) => r.type === 'cafe')) return '☕ A café feeds residents and brings in visitors.';
  const next = STARS[w.stars + 1];
  if (next) return `⭐ Next star: ${next.text} (you have ${population(w)} people).`;
  if (!w.legend) return '🗼 Build the Lighthouse to make Skyhold a legend.';
  return '🗼 Skyhold is a legend. Keep growing, or just enjoy the view.';
}
