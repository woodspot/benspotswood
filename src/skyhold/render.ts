// Drawing Skyhold on a canvas: the sky by time of day, the cloud sea below (which rises up as the
// city sinks), the rooms with their little people, lifts with moving cars, and the balloon envelope.
import { cloudTop, COLS, DOCK_X, layout, ROOMS, type Lift, type Room, type World } from './sim';

export const CW = 30; // cell width in world pixels
export const FH = 40; // floor height

export interface View {
  cx: number; // world point at the centre of the screen
  cy: number;
  zoom: number;
  W: number;
  H: number;
}

export interface Ghost {
  x: number;
  y: number;
  w: number;
  ok: boolean;
}

export interface Extras {
  t: number; // ms, for animation
  hourFrac: number; // how far into the current hour (smooth sky)
  ghost: Ghost | null;
  selected: { room?: Room; lift?: Lift } | null;
  liftLoad: Map<number, number>;
  flash: number; // lightning, 0–1
}

export const toScreen = (v: View, wx: number, wy: number): [number, number] => [(wx - v.cx) * v.zoom + v.W / 2, (wy - v.cy) * v.zoom + v.H / 2];
export const toWorld = (v: View, sx: number, sy: number): [number, number] => [(sx - v.W / 2) / v.zoom + v.cx, (sy - v.H / 2) / v.zoom + v.cy];
export const cellAt = (v: View, sx: number, sy: number): [number, number] => {
  const [wx, wy] = toWorld(v, sx, sy);
  return [Math.floor(wx / CW), Math.floor(-wy / FH)];
};

// ── Sky ────────────────────────────────────────────────────────

type RGB = [number, number, number];
const hex = (h: string): RGB => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)) as RGB;
const SKY: [number, string, string][] = [
  [0, '#070b24', '#18204a'],
  [4.5, '#0b1030', '#262a5a'],
  [6, '#3b4a8c', '#f19a74'],
  [7.5, '#5f9fe6', '#cfe6fb'],
  [16.5, '#5f9fe6', '#d6ecff'],
  [18.5, '#4a5aa8', '#ff9a66'],
  [20, '#1a2050', '#5a3a6a'],
  [21.5, '#070b24', '#18204a'],
  [24, '#070b24', '#18204a'],
];
function mix(a: RGB, b: RGB, t: number): string {
  return `rgb(${a.map((v, i) => Math.round(v + (b[i] - v) * t)).join(',')})`;
}
function skyAt(h: number): [string, string, number] {
  let i = 0;
  while (i < SKY.length - 2 && SKY[i + 1][0] <= h) i++;
  const [h0, t0, b0] = SKY[i];
  const [h1, t1, b1] = SKY[i + 1];
  const t = (h - h0) / (h1 - h0);
  const dark = h < 5 || h > 21 ? 1 : h < 7 ? (7 - h) / 2 : h > 19 ? (h - 19) / 2 : 0;
  return [mix(hex(t0), hex(t1), t), mix(hex(b0), hex(b1), t), Math.max(0, Math.min(1, dark))];
}

const STARS = Array.from({ length: 90 }, (_, i) => [((i * 7919) % 1000) / 1000, ((i * 104729) % 997) / 997, 0.5 + ((i * 31) % 10) / 20]);

function drawSky(ctx: CanvasRenderingContext2D, v: View, h: number, t: number, storm: boolean): number {
  const [top, bottom, dark] = skyAt(h);
  const g = ctx.createLinearGradient(0, 0, 0, v.H);
  g.addColorStop(0, top);
  g.addColorStop(1, bottom);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, v.W, v.H);
  if (dark > 0) {
    for (const [x, y, s] of STARS) {
      ctx.globalAlpha = dark * s * (0.7 + 0.3 * Math.sin(t / 700 + x * 50));
      ctx.fillStyle = '#fff';
      ctx.fillRect(x * v.W, y * v.H * 0.8, 1.6, 1.6);
    }
    ctx.globalAlpha = 1;
  }
  // Sun or moon, crossing the sky.
  const day = h >= 6 && h <= 20;
  const p = day ? (h - 6) / 14 : ((h + 24 - 20) % 24) / 10;
  const sx = v.W * (0.1 + 0.8 * p);
  const sy = v.H * (0.55 - 0.4 * Math.sin(Math.PI * p));
  ctx.fillStyle = day ? (h < 8 || h > 18 ? '#ffc27a' : '#fff4c2') : '#e8ecff';
  ctx.globalAlpha = storm ? 0.3 : 0.9;
  ctx.beginPath();
  ctx.arc(sx, sy, day ? 22 : 15, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
  // Drifting clouds far away (slow parallax).
  ctx.fillStyle = storm ? 'rgba(90,96,110,.55)' : `rgba(255,255,255,${0.55 - dark * 0.4})`;
  for (let i = 0; i < 7; i++) {
    const cx = ((i * 263 + t / (80 + i * 15) - v.cx * 0.05) % (v.W + 400)) - 200;
    const cy = (i * 97) % (v.H * 0.6) + 40 - v.cy * 0.02;
    puff(ctx, cx < -200 ? cx + v.W + 400 : cx, cy, 40 + (i % 3) * 18);
  }
  return dark;
}

function puff(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  ctx.beginPath();
  ctx.arc(x, y, r * 0.6, 0, Math.PI * 2);
  ctx.arc(x + r * 0.6, y + r * 0.1, r * 0.5, 0, Math.PI * 2);
  ctx.arc(x - r * 0.6, y + r * 0.15, r * 0.45, 0, Math.PI * 2);
  ctx.arc(x + r * 0.15, y - r * 0.3, r * 0.45, 0, Math.PI * 2);
  ctx.fill();
}

// ── The city ───────────────────────────────────────────────────

const VISIT = [0, 0, 0, 0, 0, 0, 0.1, 0.2, 0.3, 0.5, 0.6, 0.7, 0.9, 0.8, 0.7, 0.6, 0.6, 0.7, 0.8, 0.9, 0.8, 0.5, 0.2, 0.1];

/** How many little people to draw in a room right now. */
function peopleIn(r: Room, h: number): number {
  const d = ROOMS[r.type];
  if (r.damaged) return 0;
  switch (d.kind) {
    case 'home': return Math.round(r.occ * (h < 8 || h >= 18 ? 1 : 0.3));
    case 'work': return h >= 9 && h < 17 ? Math.min(4, r.occ) : 0;
    case 'stay': return r.occ;
    case 'food':
    case 'shop':
    case 'fun': return d.open && h >= d.open[0] && h < d.open[1] ? Math.round(d.w * 1.5 * VISIT[h]) + 1 : 0;
    case 'base': return Math.round(3 * VISIT[h]) + 1;
    default: return 0;
  }
}

function roomRect(r: Room): [number, number, number, number] {
  return [r.x * CW, -(r.y + 1) * FH, ROOMS[r.type].w * CW, FH];
}

function drawRoom(ctx: CanvasRenderingContext2D, r: Room, h: number, dark: number, t: number, reachable: boolean): void {
  const d = ROOMS[r.type];
  const [x, y, w, hh] = roomRect(r);
  if (r.type === 'walk') {
    ctx.fillStyle = '#6b5a48';
    ctx.fillRect(x, y + hh - 5, w, 5);
    ctx.strokeStyle = '#c9b9a4';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x, y + hh - 16);
    ctx.lineTo(x + w, y + hh - 16);
    for (let i = 0; i <= 3; i++) {
      ctx.moveTo(x + (w * i) / 3, y + hh - 16);
      ctx.lineTo(x + (w * i) / 3, y + hh - 5);
    }
    ctx.stroke();
    return;
  }
  // Walls and interior, darker at night (lit windows if anyone's in).
  const people = peopleIn(r, h);
  const g = ctx.createLinearGradient(0, y, 0, y + hh);
  g.addColorStop(0, d.color);
  g.addColorStop(1, shade(d.color, -0.25));
  ctx.fillStyle = g;
  ctx.fillRect(x + 1, y + 2, w - 2, hh - 4);
  if (dark > 0) {
    ctx.fillStyle = `rgba(10,12,40,${dark * (people ? 0.25 : 0.6)})`;
    ctx.fillRect(x + 1, y + 2, w - 2, hh - 4);
    if (people) {
      ctx.fillStyle = `rgba(255,214,120,${0.35 * dark})`;
      ctx.fillRect(x + 4, y + 6, w - 8, hh - 18);
    }
  }
  if (r.type === 'gas') {
    ctx.fillStyle = r.damaged ? '#7f8a90' : '#e4f6ff';
    roundRect(ctx, x + 4, y + 5, w - 8, hh - 12, 12);
    ctx.fill();
    ctx.strokeStyle = '#8fbcd0';
    ctx.lineWidth = 1;
    for (let i = 1; i < 4; i++) {
      ctx.beginPath();
      ctx.moveTo(x + 4 + ((w - 8) * i) / 4, y + 6);
      ctx.lineTo(x + 4 + ((w - 8) * i) / 4, y + hh - 8);
      ctx.stroke();
    }
  }
  if (r.type === 'engine' && !r.damaged) {
    // A spinning rotor.
    const cx = x + w / 2;
    const cy = y + hh / 2 - 2;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(t / 120);
    ctx.fillStyle = 'rgba(220,235,255,.85)';
    for (let i = 0; i < 3; i++) {
      ctx.rotate((Math.PI * 2) / 3);
      ctx.beginPath();
      ctx.ellipse(0, -8, 3, 9, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
  // Floor slab and ceiling.
  ctx.fillStyle = '#5a4634';
  ctx.fillRect(x, y + hh - 4, w, 4);
  ctx.fillStyle = 'rgba(0,0,0,.25)';
  ctx.fillRect(x, y, w, 2);
  // The room's sign, then its people.
  if (d.icon && r.type !== 'gas' && r.type !== 'engine') {
    ctx.font = `${hh * 0.42}px system-ui, "Apple Color Emoji", "Segoe UI Emoji"`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.globalAlpha = 0.95;
    ctx.fillText(d.icon, x + Math.min(w / 2, 18), y + hh * 0.42);
    ctx.globalAlpha = 1;
  }
  for (let i = 0; i < Math.min(people, d.w * 3); i++) {
    const px = x + 10 + ((i * 17 + Math.sin(t / 900 + i * 2 + r.id) * 6 + 400) % Math.max(8, w - 16));
    const py = y + hh - 6;
    ctx.fillStyle = ['#2b3a67', '#7a2e3b', '#2d6a4f', '#5c3d99', '#8a5a1c'][(i + r.id) % 5];
    ctx.fillRect(px - 2, py - 9, 4, 7);
    ctx.fillStyle = '#f1c9a5';
    ctx.beginPath();
    ctx.arc(px, py - 11.5, 2.5, 0, Math.PI * 2);
    ctx.fill();
  }
  // Trouble markers.
  if (r.damaged) {
    ctx.fillStyle = 'rgba(30,30,30,.55)';
    ctx.fillRect(x + 1, y + 2, w - 2, hh - 4);
    ctx.strokeStyle = '#111';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x + w * 0.3, y + 3);
    ctx.lineTo(x + w * 0.45, y + hh * 0.5);
    ctx.lineTo(x + w * 0.35, y + hh - 6);
    ctx.stroke();
    badge(ctx, x + w - 9, y + 9, '🔧');
  } else if (!reachable && r.type !== 'dock') {
    ctx.strokeStyle = '#e8513f';
    ctx.setLineDash([4, 3]);
    ctx.lineWidth = 2;
    ctx.strokeRect(x + 2, y + 3, w - 4, hh - 7);
    ctx.setLineDash([]);
    badge(ctx, x + w - 9, y + 9, '🚧');
  } else if ((d.kind === 'home' || d.kind === 'stay' || d.kind === 'work') && r.mood < 40) badge(ctx, x + w - 9, y + 9, '😟');
}

function badge(ctx: CanvasRenderingContext2D, x: number, y: number, e: string): void {
  ctx.font = '11px system-ui, "Apple Color Emoji", "Segoe UI Emoji"';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(e, x, y);
}

function shade(hexColor: string, amt: number): string {
  const c = hex(hexColor);
  return `rgb(${c.map((v) => Math.max(0, Math.min(255, Math.round(v * (1 + amt))))).join(',')})`;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawLift(ctx: CanvasRenderingContext2D, l: Lift, load: number, t: number): void {
  const x = l.x * CW;
  const top = -(l.y1 + 1) * FH;
  const h = (l.y1 - l.y0 + 1) * FH;
  ctx.fillStyle = '#353b48';
  ctx.fillRect(x + 2, top, CW - 4, h);
  ctx.strokeStyle = '#596173';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x + 6, top);
  ctx.lineTo(x + 6, top + h);
  ctx.moveTo(x + CW - 6, top);
  ctx.lineTo(x + CW - 6, top + h);
  ctx.stroke();
  for (let y = l.y0; y <= l.y1; y++) {
    ctx.fillStyle = '#5a4634';
    ctx.fillRect(x, -y * FH - 4, CW, 4);
  }
  // Stops include the floor the lift stands on, so cars travel down into it.
  const bottom = l.y0 > 0 ? l.y0 - 1 : l.y0;
  const span = l.y1 - bottom;
  const color = load > 1.05 ? '#e8513f' : load > 0.75 ? '#f0b43c' : '#5fc27a';
  for (let c = 0; c < l.cars; c++) {
    const speed = 0.0006 + Math.min(load, 1.5) * 0.0004;
    const phase = Math.sin(t * speed + c * 2.1 + l.id) * 0.5 + 0.5;
    const fy = bottom + phase * span;
    const cy = -(fy + 1) * FH + 6;
    ctx.fillStyle = color;
    ctx.fillRect(x + 5 + (c % 2) * 2, cy, CW - 10 - 2, FH - 14);
    ctx.fillStyle = 'rgba(255,255,255,.35)';
    ctx.fillRect(x + 7 + (c % 2) * 2, cy + 3, CW - 16, 6);
  }
  if (load > 1.05) {
    ctx.strokeStyle = '#e8513f';
    ctx.lineWidth = 2;
    ctx.strokeRect(x + 1, top, CW - 2, h);
  }
}

/** The great balloon over the city. */
function drawEnvelope(ctx: CanvasRenderingContext2D, w: World, minX: number, maxX: number, top: number, t: number): void {
  const L = w.envelope;
  const cx = ((minX + maxX + 1) / 2) * CW;
  const width = Math.max((maxX - minX + 1) * CW * 0.95, 160) * (0.85 + L * 0.04);
  const height = 80 + L * 12;
  const bob = Math.sin(t / 1500) * 3;
  const by = -(top + 1) * FH - 50 + bob; // bottom of the envelope
  const ey = by - height / 2;
  // Ropes down to the top floor.
  ctx.strokeStyle = 'rgba(80,60,40,.8)';
  ctx.lineWidth = 1.2;
  const roofY = -(top + 1) * FH;
  for (let i = 0; i <= 4; i++) {
    const fx = minX * CW + ((maxX - minX + 1) * CW * i) / 4;
    ctx.beginPath();
    ctx.moveTo(cx + (width * 0.38 * (i - 2)) / 2, by - 4);
    ctx.lineTo(fx, roofY);
    ctx.stroke();
  }
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(cx, ey, width / 2, height / 2, 0, 0, Math.PI * 2);
  ctx.clip();
  const stripes = 6 + L;
  for (let i = 0; i < stripes; i++) {
    ctx.fillStyle = i % 2 ? '#c8463c' : '#f2e3c4';
    ctx.fillRect(cx - width / 2 + (width * i) / stripes, ey - height / 2, width / stripes + 1, height);
  }
  const shine = ctx.createRadialGradient(cx - width * 0.2, ey - height * 0.25, 4, cx, ey, width * 0.6);
  shine.addColorStop(0, 'rgba(255,255,255,.45)');
  shine.addColorStop(1, 'rgba(0,0,0,.25)');
  ctx.fillStyle = shine;
  ctx.fillRect(cx - width / 2, ey - height / 2, width, height);
  ctx.restore();
  ctx.strokeStyle = 'rgba(60,30,20,.5)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(cx, ey, width / 2, height / 2, 0, 0, Math.PI * 2);
  ctx.stroke();
  // Little pennant on top.
  ctx.fillStyle = '#ffd34d';
  ctx.beginPath();
  ctx.moveTo(cx, ey - height / 2);
  ctx.lineTo(cx, ey - height / 2 - 18);
  ctx.lineTo(cx + 14 + Math.sin(t / 300) * 2, ey - height / 2 - 13);
  ctx.lineTo(cx, ey - height / 2 - 8);
  ctx.fill();
}

/** The hull under the dock, and a visiting airship moored alongside. */
function drawHull(ctx: CanvasRenderingContext2D, minX: number, maxX: number, t: number): void {
  const x0 = Math.min(minX, DOCK_X) * CW;
  const x1 = (Math.max(maxX, DOCK_X + 7) + 1) * CW;
  ctx.fillStyle = '#6b4a2e';
  ctx.beginPath();
  ctx.moveTo(x0 - 10, 0);
  ctx.lineTo(x1 + 10, 0);
  ctx.lineTo(x1 - 20, 34);
  ctx.lineTo(x0 + 20, 34);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,.25)';
  ctx.lineWidth = 1;
  for (let i = 1; i < 4; i++) {
    ctx.beginPath();
    ctx.moveTo(x0 - 10 + i * 6, i * 8);
    ctx.lineTo(x1 + 10 - i * 6, i * 8);
    ctx.stroke();
  }
  // A visiting airship moored at the dock.
  const bob = Math.sin(t / 900) * 2;
  const ax = DOCK_X * CW - 70;
  const ay = -FH * 0.9 + bob;
  ctx.fillStyle = '#d9cdb5';
  ctx.beginPath();
  ctx.ellipse(ax, ay - 14, 42, 13, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#7a5a3a';
  ctx.fillRect(ax - 14, ay - 2, 28, 8);
  ctx.strokeStyle = 'rgba(80,60,40,.8)';
  ctx.beginPath();
  ctx.moveTo(ax + 20, ay + 2);
  ctx.lineTo(DOCK_X * CW, -FH * 0.5);
  ctx.stroke();
}

/** The cloud sea below. Its top is (altitude − cloud top) below the dock: sink, and it swallows the lower floors. */
function drawCloudSea(ctx: CanvasRenderingContext2D, v: View, w: World, t: number, flash: number, dark: number): void {
  const storm = !!w.storm?.active;
  const topWorld = (w.altitude - cloudTop(w)) * 0.35 + 40;
  const [, sy] = toScreen(v, 0, topWorld);
  if (sy > v.H + 40) return;
  const lit = 1 - dark * 0.7; // greyer at night
  ctx.fillStyle = storm ? 'rgba(70,76,92,.93)' : `rgba(${Math.round(236 * lit)},${Math.round(241 * lit)},${Math.round(248 * lit + 30 * dark)},.93)`;
  ctx.beginPath();
  ctx.moveTo(0, v.H);
  for (let x = 0; x <= v.W + 20; x += 20) {
    const wy = sy + Math.sin(x / 60 + t / 1800) * 8 + Math.sin(x / 23 + t / 900) * 4;
    ctx.lineTo(x, wy);
  }
  ctx.lineTo(v.W, v.H);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = storm ? 'rgba(40,44,56,.5)' : 'rgba(190,205,225,.5)';
  ctx.fillRect(0, Math.max(0, sy + 40), v.W, v.H);
  if (flash > 0) {
    ctx.fillStyle = `rgba(255,255,240,${flash * 0.5})`;
    ctx.fillRect(0, 0, v.W, v.H);
  }
}

export function draw(ctx: CanvasRenderingContext2D, v: View, w: World, x: Extras): void {
  const h = (w.hour + x.hourFrac) % 24; // living through w.hour; tick() finishes it
  const dark = drawSky(ctx, v, h, x.t, !!w.storm?.active);
  const L = layout(w);
  ctx.save();
  ctx.translate(v.W / 2, v.H / 2);
  ctx.scale(v.zoom, v.zoom);
  ctx.translate(-v.cx, -v.cy);

  drawEnvelope(ctx, w, L.minX, L.maxX, L.top, x.t);
  drawHull(ctx, L.minX, L.maxX, x.t);
  for (const l of w.lifts) drawLift(ctx, l, x.liftLoad.get(l.id) ?? 0, x.t);
  for (const r of w.rooms) drawRoom(ctx, r, Math.floor(h), dark, x.t, L.path.get(r.id) !== null);

  // Floor numbers down the left side.
  ctx.font = '10px system-ui';
  ctx.textAlign = 'right';
  ctx.fillStyle = dark > 0.5 ? 'rgba(255,255,255,.5)' : 'rgba(20,30,60,.45)';
  for (let y = 0; y <= L.top; y++) ctx.fillText(String(y), L.minX * CW - 8, -y * FH - FH / 2);

  if (x.selected) {
    ctx.strokeStyle = '#ffd34d';
    ctx.lineWidth = 3;
    if (x.selected.room) ctx.strokeRect(...roomRect(x.selected.room));
    if (x.selected.lift) {
      const l = x.selected.lift;
      ctx.strokeRect(l.x * CW, -(l.y1 + 1) * FH, CW, (l.y1 - l.y0 + 1) * FH);
    }
  }
  if (x.ghost) {
    const g = x.ghost;
    ctx.fillStyle = g.ok ? 'rgba(95,194,122,.35)' : 'rgba(232,81,63,.3)';
    ctx.strokeStyle = g.ok ? '#5fc27a' : '#e8513f';
    ctx.lineWidth = 2;
    ctx.fillRect(g.x * CW, -(g.y + 1) * FH, g.w * CW, FH);
    ctx.strokeRect(g.x * CW, -(g.y + 1) * FH, g.w * CW, FH);
  }
  ctx.restore();
  drawCloudSea(ctx, v, w, x.t, x.flash, dark);
}

export const WORLD_BOUNDS = { minX: -6 * CW, maxX: (COLS + 6) * CW };
