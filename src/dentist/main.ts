// Dentist: a patient sits in the chair and opens wide. Pick a tool and fix their teeth: brush the
// plaque, spray the germs, pull out stuck food, drill and fill cavities.
import { bindVoiceButton, en, say, sfx, stopSpeech, unlock, type Part } from '../kids/audio';
import { burst, party } from '../kids/fx';
import { awardSticker } from '../kids/stickers';
import { keepAwake, lockGestures } from '../kids/hold';
import { bindKidsNav } from '../kids/nav';
import { artUrl, drawing } from '../kids/art';
import { bindLangButtons, getLang } from '../kids/lang';
import { syncOnOpen } from '../kids/sync';
import {
  complaintFor, FIXES, newVisit, nextPatient, patientParts, patientSound, PRAISE, SAY, TOOLS, toolParts,
  type Patient, type Problem, type ToolId,
} from './game';
import { brushSound, eek, loopBusy, squish, startLoop, stopLoop, ting } from './sfx';

const $ = (id: string) => document.getElementById(id)!;
const rng = Math.random;
const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const pickOne = <T>(list: readonly T[]) => list[Math.floor(rng() * list.length)];
const stage = () => $('stage');
const talk = (parts: Part[] | string, min = 500, max = 6000) => Promise.race([Promise.all([say(parts), wait(min)]), wait(max)]);
const centerOf = (el: Element): [number, number] => {
  const r = el.getBoundingClientRect();
  return [r.left + r.width / 2, r.top + r.height / 2];
};
const SVGNS = 'http://www.w3.org/2000/svg';

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

// ── Tool pictures (tip at the bottom left, where the finger is) ─

const TOOL_SVG: Record<ToolId, string> = {
  brush: `<svg viewBox="0 0 100 100" aria-hidden="true">
      <line x1="26" y1="74" x2="92" y2="8" stroke="#3a9ff0" stroke-width="13" stroke-linecap="round"/>
      <line x1="62" y1="38" x2="92" y2="8" stroke="#7cc4ff" stroke-width="5" stroke-linecap="round"/>
      <rect x="2" y="66" width="34" height="16" rx="7" transform="rotate(-45 19 74)" fill="#e8f3ff" stroke="#3a9ff0" stroke-width="3"/>
      <g stroke="#ffffff" stroke-width="5" stroke-linecap="round" transform="rotate(-45 19 74)">
        <line x1="7" y1="64" x2="7" y2="56"/><line x1="14" y1="64" x2="14" y2="54"/><line x1="21" y1="64" x2="21" y2="54"/><line x1="28" y1="64" x2="28" y2="56"/>
      </g>
      <g stroke="#bfe0ff" stroke-width="2" transform="rotate(-45 19 74)" fill="none">
        <line x1="7" y1="64" x2="7" y2="56"/><line x1="14" y1="64" x2="14" y2="54"/><line x1="21" y1="64" x2="21" y2="54"/><line x1="28" y1="64" x2="28" y2="56"/>
      </g>
    </svg>`,
  spray: `<svg viewBox="0 0 100 100" aria-hidden="true">
      <line x1="10" y1="90" x2="38" y2="62" stroke="#9fb0bf" stroke-width="7" stroke-linecap="round"/>
      <line x1="38" y1="62" x2="86" y2="14" stroke="#2f8fe0" stroke-width="20" stroke-linecap="round"/>
      <line x1="48" y1="52" x2="80" y2="20" stroke="#78c0ff" stroke-width="6" stroke-linecap="round"/>
      <circle cx="58" cy="58" r="8" fill="#f7cf2d" stroke="#d49a12" stroke-width="3"/>
      <path d="M8 84 q-6 6 -2 12 q6 2 8 -6 z" fill="#8fd3ff"/>
    </svg>`,
  tweezers: `<svg viewBox="0 0 100 100" aria-hidden="true">
      <path d="M8 92 L74 6" stroke="#aab6c2" stroke-width="8" stroke-linecap="round" fill="none"/>
      <path d="M8 92 L94 26" stroke="#c9d3dc" stroke-width="8" stroke-linecap="round" fill="none"/>
      <path d="M60 24 L84 6 L96 22 L76 40 Z" fill="#7a55d6"/>
    </svg>`,
  drill: `<svg viewBox="0 0 100 100" aria-hidden="true">
      <line x1="6" y1="94" x2="18" y2="82" stroke="#6f7c88" stroke-width="5" stroke-linecap="round"/>
      <circle cx="22" cy="78" r="11" fill="#dfe7ee" stroke="#8e9daa" stroke-width="3"/>
      <line x1="26" y1="74" x2="86" y2="14" stroke="#e9eff4" stroke-width="16" stroke-linecap="round"/>
      <line x1="26" y1="74" x2="86" y2="14" stroke="#8e9daa" stroke-width="16" stroke-linecap="round" stroke-opacity=".25"/>
      <line x1="50" y1="50" x2="62" y2="38" stroke="#3fbf5a" stroke-width="17"/>
      <line x1="86" y1="14" x2="98" y2="2" stroke="#556270" stroke-width="7" stroke-linecap="round"/>
    </svg>`,
  fill: `<svg viewBox="0 0 100 100" aria-hidden="true">
      <circle cx="10" cy="90" r="9" fill="#f4f7fb" stroke="#c6d2dd" stroke-width="2"/>
      <line x1="16" y1="84" x2="36" y2="64" stroke="#c9d3dc" stroke-width="7" stroke-linecap="round"/>
      <line x1="36" y1="64" x2="80" y2="20" stroke="#f477b6" stroke-width="20" stroke-linecap="round"/>
      <line x1="46" y1="54" x2="74" y2="26" stroke="#ffc1df" stroke-width="6" stroke-linecap="round"/>
      <line x1="84" y1="16" x2="96" y2="4" stroke="#9b5de5" stroke-width="12" stroke-linecap="round"/>
    </svg>`,
};

// ── The mouth ──────────────────────────────────────────────────

const VB_W = 400;
const VB_H = 300;
/** How much taller the mouth is drawn on a tall phone screen (1 = landscape), so the teeth are bigger. */
let stretch = 1;

interface Tooth { cx: number; w: number; y0: number; y1: number } // y0 → y1: gum to biting edge

/** Where every tooth goes: two rows following the curve of the mouth. */
function teethFor(p: Patient): Record<'top' | 'bottom', Tooth[]> {
  const n = p.teeth;
  const span = 300;
  const w = span / n;
  const make = (row: 'top' | 'bottom') =>
    Array.from({ length: n }, (_, i) => {
      const cx = 200 - span / 2 + w * (i + 0.5);
      const dx = (cx - 200) / 150;
      const h = 62 - 14 * dx * dx;
      if (row === 'top') {
        const gum = 54 + 34 * dx * dx;
        return { cx, w, y0: gum, y1: gum + h };
      }
      const gum = 250 - 34 * dx * dx;
      return { cx, w, y0: gum, y1: gum - h };
    });
  return { top: make('top'), bottom: make('bottom') };
}

const room = () => ({ w: Math.min(innerWidth * 0.98, 760), h: Math.max(200, innerHeight - 250) });
function fitMouth(): void {
  const { w, h } = room();
  stretch = Math.min(1.55, Math.max(1, (h * VB_W) / (w * VB_H)));
}
function mouthWidth(): number {
  const { w, h } = room();
  return Math.min(w, (h * VB_W) / (VB_H * stretch));
}

function toothPath(t: Tooth, pointy: boolean): string {
  const x0 = t.cx - t.w / 2 + 2;
  const x1 = t.cx + t.w / 2 - 2;
  const s = Math.sign(t.y1 - t.y0); // +1: top row (grows down), -1: bottom row
  const a = t.y0 - s * 8; // tucked into the gum
  if (pointy) {
    const tip = t.y1 + s * 6;
    return `M${x0} ${a} L${x1} ${a} L${x1} ${t.y0 + s * 10} Q${x1 - 4} ${t.y1 - s * 10} ${t.cx} ${tip} Q${x0 + 4} ${t.y1 - s * 10} ${x0} ${t.y0 + s * 10} Z`;
  }
  const r = (x1 - x0) * 0.36;
  return `M${x0} ${a} L${x1} ${a} L${x1} ${t.y1 - s * r} Q${x1} ${t.y1} ${x1 - r} ${t.y1} L${x0 + r} ${t.y1} Q${x0} ${t.y1} ${x0} ${t.y1 - s * r} Z`;
}

function mouthSvg(p: Patient, teeth: Record<'top' | 'bottom', Tooth[]>): string {
  const gum = (row: Tooth[], top: boolean) => {
    const pts = row.map((t) => `${t.cx} ${t.y0 + (top ? -6 : 6)}`);
    const first = row[0];
    const last = row[row.length - 1];
    return `M${first.cx - first.w * 0.45} ${first.y0 + (top ? -14 : 14)} L${pts.join(' L')} L${last.cx + last.w * 0.45} ${last.y0 + (top ? -14 : 14)}`;
  };
  const toothEls = (['top', 'bottom'] as const)
    .map((row) =>
      teeth[row]
        .map((t, i) => {
          const s = Math.sign(t.y1 - t.y0);
          const hx = t.cx - t.w * 0.18;
          return `<g class="tooth" data-row="${row}" data-i="${i}">
            <path d="${toothPath(t, !!p.pointy)}" fill="#fffdf6" stroke="#e3d8c2" stroke-width="2"/>
            <path d="M${hx} ${t.y0 + s * 6} L${hx} ${t.y0 + (t.y1 - t.y0) * 0.55}" stroke="#ffffff" stroke-width="${t.w * 0.12}" stroke-linecap="round" opacity=".9"/>
          </g>`;
        })
        .join(''),
    )
    .join('');
  return `<svg class="mouth-svg" viewBox="0 0 ${VB_W} ${VB_H * stretch}" style="width:${mouthWidth()}px" aria-label="An open mouth">
    <g transform="scale(1 ${stretch})">
    <ellipse cx="200" cy="150" rx="198" ry="148" fill="${p.lips}"/>
    <ellipse cx="200" cy="150" rx="198" ry="148" fill="url(#lipShine)"/>
    <ellipse cx="200" cy="152" rx="174" ry="126" fill="#5c1426"/>
    <ellipse cx="200" cy="158" rx="96" ry="58" fill="#3a0916"/>
    <ellipse cx="200" cy="120" rx="11" ry="18" fill="#d8667a"/>
    <ellipse cx="200" cy="236" rx="128" ry="62" fill="#ea7686"/>
    <path d="M200 192 Q196 220 200 250" stroke="#cf5a6c" stroke-width="4" fill="none" stroke-linecap="round"/>
    <path d="${gum(teeth.top, true)}" stroke="#f08ea0" stroke-width="30" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="${gum(teeth.bottom, false)}" stroke="#f08ea0" stroke-width="30" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
    ${toothEls}
    </g>
    <g class="probs"></g>
    <defs><radialGradient id="lipShine" cx=".35" cy=".2" r=".9"><stop offset="0" stop-color="#fff" stop-opacity=".28"/><stop offset=".5" stop-color="#fff" stop-opacity="0"/></radialGradient></defs>
  </svg>`;
}

// ── Problems on the teeth ──────────────────────────────────────

interface Live {
  p: Problem;
  el: SVGGElement;
  cx: number; // its centre, in the mouth's own units
  cy: number;
  r: number;
  step: 0 | 1; // a cavity: 0 = to drill, 1 = to fill
  left: number; // 1 → 0
  grabbed?: { x: number; y: number }; // stuck food held in the tweezers (where it was picked up, on screen)
}

const needs = (l: Live): ToolId => FIXES[l.p.kind][l.step];

function problemSvg(l: Live): string {
  const { cx, cy } = l;
  const r = l.p.kind === 'stuck' ? l.r : l.r * 1.25;
  switch (l.p.kind) {
    case 'plaque': {
      const blobs = [[-0.35, -0.3, 0.42], [0.3, -0.1, 0.46], [-0.15, 0.35, 0.4], [0.35, 0.42, 0.3], [0, 0, 0.44]];
      return `<g class="plaque">${blobs
        .map(([dx, dy, s]) => `<circle cx="${cx + dx * r}" cy="${cy + dy * r}" r="${s * r}" fill="#d8c25a"/>`)
        .join('')}${blobs
        .slice(0, 3)
        .map(([dx, dy]) => `<circle cx="${cx + dx * r * 1.1 + 2}" cy="${cy + dy * r * 0.8}" r="${r * 0.1}" fill="#8a6d2a"/>`)
        .join('')}</g>`;
    }
    case 'cavity':
      return `<path class="cav" d="M${cx - r * 0.5} ${cy} q${r * 0.1} ${-r * 0.55} ${r * 0.5} ${-r * 0.5} q${r * 0.55} ${r * 0.05} ${r * 0.5} ${r * 0.5} q${-r * 0.1} ${r * 0.55} ${-r * 0.55} ${r * 0.45} q${-r * 0.4} ${-r * 0.05} ${-r * 0.45} ${-r * 0.45} z" fill="#4a2a14"/>
        <circle class="cav" cx="${cx + r * 0.35}" cy="${cy - r * 0.45}" r="${r * 0.12}" fill="#6b4320"/>
        <circle class="hole" cx="${cx}" cy="${cy}" r="${r * 0.42}" fill="#7d8594" stroke="#5f6674" stroke-width="2" opacity="0"/>
        <g class="filling" transform="translate(${cx} ${cy}) scale(0)"><circle r="${r * 0.44}" fill="#e9eef4" stroke="#b9c4cf" stroke-width="2"/><circle cx="${-r * 0.14}" cy="${-r * 0.14}" r="${r * 0.12}" fill="#fff"/></g>`;
    case 'germ': {
      const spikes = Array.from({ length: 8 }, (_, k) => {
        const a = (k / 8) * Math.PI * 2;
        return `<circle cx="${Math.cos(a) * r * 0.62}" cy="${Math.sin(a) * r * 0.62}" r="${r * 0.14}" fill="#4aa43a"/>`;
      }).join('');
      return `<g transform="translate(${cx} ${cy})"><g class="germ-body">${spikes}
        <circle r="${r * 0.58}" fill="#6cc644"/>
        <circle cx="${-r * 0.2}" cy="${-r * 0.1}" r="${r * 0.16}" fill="#fff"/><circle cx="${r * 0.2}" cy="${-r * 0.1}" r="${r * 0.16}" fill="#fff"/>
        <circle cx="${-r * 0.17}" cy="${-r * 0.07}" r="${r * 0.08}" fill="#222"/><circle cx="${r * 0.23}" cy="${-r * 0.07}" r="${r * 0.08}" fill="#222"/>
        <path d="M${-r * 0.22} ${r * 0.2} Q0 ${r * 0.42} ${r * 0.22} ${r * 0.2}" stroke="#2e6b22" stroke-width="2.5" fill="none" stroke-linecap="round"/>
      </g></g>`;
    }
    case 'stuck': {
      const s = r * 2.1;
      const url = artUrl(l.p.snack!);
      const pic = url
        ? `<image href="${url}" x="${-s / 2}" y="${-s / 2}" width="${s}" height="${s}"/>`
        : `<text font-size="${s * 0.8}" text-anchor="middle" dominant-baseline="central">${l.p.snack}</text>`;
      return `<g class="snack" transform="translate(${cx} ${cy})">${pic}</g>`;
    }
  }
}

// ── A visit ────────────────────────────────────────────────────

let patients = 0;
let patient: Patient | null = null;
let live: Live[] = [];
let tool: ToolId = 'brush';
let svgScale = 1; // screen px per mouth unit
let fixed = 0;

function startPatient(): void {
  const my = run;
  busy = true;
  patient = nextPatient(rng, patient?.e);
  const visit = newVisit(patient, patients, rng);
  const teeth = teethFor(patient);
  fitMouth();
  fixed = 0;
  stage().className = 'stage';
  stage().innerHTML = `
    <div class="patient"><span class="face">${drawing(patient.e)}</span></div>
    <div class="mouth">${mouthSvg(patient, teeth)}</div>
    <div class="tray">${TOOLS.map((t) => `<button class="tool-btn${t.id === tool ? ' on' : ''}" data-tool="${t.id}" aria-label="${t.name}">${TOOL_SVG[t.id]}</button>`).join('')}</div>
    <div id="tool" class="tool" hidden></div>`;
  const probs = stage().querySelector<SVGGElement>('.probs')!;
  live = visit.map((p) => {
    const row = teeth[p.row];
    const t = row[p.i];
    let cx = t.cx;
    let cy = (t.y0 + t.y1) / 2;
    let r = t.w * 0.42;
    if (p.kind === 'stuck') {
      cx = (t.cx + row[p.i + 1].cx) / 2;
      cy = (t.y0 + t.y1 + row[p.i + 1].y0 + row[p.i + 1].y1) / 4;
      r = t.w * 0.45;
    }
    if (p.kind === 'germ') cy = t.y0 + (t.y1 - t.y0) * 0.6;
    cy *= stretch;
    const el = document.createElementNS(SVGNS, 'g') as SVGGElement;
    el.setAttribute('class', `prob p-${p.kind}`);
    const l: Live = { p, el, cx, cy, r, step: 0, left: 1 };
    el.innerHTML = problemSvg(l);
    probs.append(el);
    return l;
  });
  // Germs come last so they sit on top.
  for (const l of live) if (l.p.kind === 'germ') probs.append(l.el);
  void (async () => {
    await talk(SAY.next, 500, 2500);
    if (my !== run) return;
    stage().querySelector('.patient')!.classList.add('in');
    await talk(patientParts(patient!, getLang()), 300, 2500);
    if (my !== run) return;
    await talk(complaintFor(visit), 500, 4000);
    if (my !== run) return;
    stage().querySelector('.mouth')!.classList.add('open');
    await talk(SAY.open, 400, 2500);
    if (my !== run) return;
    busy = false;
    lastProgress = performance.now();
    lastHint = 0;
  })();
}

// ── Using the tools ────────────────────────────────────────────

let holding: { id: number; x: number; y: number } | null = null;
let timer = 0;
let lastProgress = 0;
let wrongFor = 0;
let lastHint = 0;
let idleTimer = 0;

function pickTool(id: ToolId): void {
  tool = id;
  stage().querySelectorAll('.tool-btn').forEach((b) => b.classList.toggle('on', (b as HTMLElement).dataset.tool === id));
  stage().querySelectorAll('.tool-btn.pick-me').forEach((b) => b.classList.remove('pick-me'));
  sfx.pop();
  void say(toolParts(TOOLS.find((t) => t.id === id)!, getLang()));
}

function showTool(x: number, y: number): void {
  const t = $('tool');
  t.hidden = false;
  t.style.transform = `translate(${x}px, ${y}px)`;
}

/** Where a problem is on screen, and how close the tool must come. */
function screenOf(l: Live): { x: number; y: number; reach: number } {
  const svg = stage().querySelector('.mouth-svg')!.getBoundingClientRect();
  svgScale = svg.width / VB_W;
  return { x: svg.left + l.cx * svgScale, y: svg.top + l.cy * svgScale, reach: l.r * svgScale + 34 };
}
const near = (l: Live, x: number, y: number) => {
  const s = screenOf(l);
  return Math.hypot(x - s.x, y - s.y) < s.reach;
};

function down(e: PointerEvent): void {
  const b = (e.target as HTMLElement).closest<HTMLElement>('.tool-btn');
  if (b) {
    unlock();
    pickTool(b.dataset.tool as ToolId);
    return;
  }
  if (busy || holding || !patient || !(e.target as HTMLElement).closest('.mouth')) return;
  e.preventDefault();
  unlock();
  holding = { id: e.pointerId, x: e.clientX, y: e.clientY };
  const t = $('tool');
  t.innerHTML = TOOL_SVG[tool];
  t.className = `tool t-${tool}`;
  showTool(e.clientX, e.clientY);
  if (tool === 'drill' || tool === 'spray') startLoop(tool);
  clearInterval(timer);
  timer = window.setInterval(tick, 60);
  if (tool === 'tweezers') grab(e.clientX, e.clientY);
}

function move(e: PointerEvent): void {
  if (!holding || e.pointerId !== holding.id) return;
  const d = Math.hypot(e.clientX - holding.x, e.clientY - holding.y);
  holding.x = e.clientX;
  holding.y = e.clientY;
  showTool(e.clientX, e.clientY);
  if (tool === 'brush' && d > 0) brushAt(e.clientX, e.clientY, d);
  if (tool === 'tweezers') pull(e.clientX, e.clientY);
}

function up(e: PointerEvent): void {
  if (!holding || e.pointerId !== holding.id) return;
  holding = null;
  clearInterval(timer);
  stopLoop();
  $('tool').hidden = true;
  // Let go of stuck food that wasn't pulled out far enough: it pops back in.
  for (const l of live) if (l.grabbed && l.left > 0) {
    l.grabbed = undefined;
    l.el.querySelector('.snack')!.setAttribute('transform', `translate(${l.cx} ${l.cy})`);
  }
}

const todo = () => live.filter((l) => l.left > 0);

function brushAt(x: number, y: number, d: number): void {
  brushSound();
  if (Math.random() < 0.3) foam(x, y);
  for (const l of todo()) {
    if (needs(l) !== 'brush' || !near(l, x, y)) continue;
    l.left -= d / 260;
    l.el.style.opacity = String(Math.max(0, l.left) * 0.9 + 0.1);
    progress();
    if (l.left <= 0) done(l);
  }
}

/** Every 60 ms while a tool is held: the drill, the filling and the water work while held still. */
function tick(): void {
  if (!holding || busy) return;
  const { x, y } = holding;
  let working = false;
  let wrong: Live | null = null;
  for (const l of todo()) {
    if (!near(l, x, y)) continue;
    if (needs(l) !== tool) {
      wrong = l;
      continue;
    }
    if (tool === 'drill') {
      working = true;
      l.left -= 0.045;
      const cav = l.el.querySelectorAll<SVGElement>('.cav');
      cav.forEach((c) => (c.style.opacity = String(Math.max(0, l.left))));
      l.el.querySelector<SVGElement>('.hole')!.style.opacity = String(1 - Math.max(0, l.left));
      if (Math.random() < 0.5) {
        const s = screenOf(l);
        burst(stage(), s.x, s.y, ['#6b4a2b', '#ffffff', '#c9b9a0'], 3, 40);
      }
    } else if (tool === 'fill') {
      working = true;
      l.left -= 0.06;
      const k = 1 - Math.max(0, l.left);
      l.el.querySelector('.filling')!.setAttribute('transform', `translate(${l.cx} ${l.cy}) scale(${k})`);
      if (Math.random() < 0.25) squish();
    } else if (tool === 'spray') {
      l.left -= 0.08;
      const k = 0.4 + Math.max(0, l.left) * 0.6;
      l.el.firstElementChild!.setAttribute('transform', `translate(${l.cx} ${l.cy}) scale(${k}) rotate(${(1 - l.left) * 90})`);
    } else continue;
    progress();
    if (l.left <= 0) done(l);
  }
  if (tool === 'drill') loopBusy(working);
  if (tool === 'spray') spray(x, y);
  // Holding the wrong tool on something: after a little while, say which tool it needs.
  if (wrong && tool !== 'brush' && tool !== 'tweezers') wrongTool(wrong, 60);
  else if (!wrong) wrongFor = 0;
}

function grab(x: number, y: number): void {
  const l = todo().find((p) => needs(p) === 'tweezers' && near(p, x, y));
  if (l) {
    l.grabbed = { x, y };
    sfx.pop();
    progress();
    return;
  }
  const other = todo().find((p) => near(p, x, y));
  if (other) wrongTool(other, 1000);
}

/** Pulling stuck food: it comes along with the tweezers, and once it's far enough out, it's gone. */
function pull(x: number, y: number): void {
  const l = live.find((p) => p.grabbed && p.left > 0);
  if (!l) {
    grab(x, y);
    return;
  }
  const dx = (x - l.grabbed!.x) / svgScale;
  const dy = (y - l.grabbed!.y) / svgScale;
  const far = Math.hypot(dx, dy);
  const give = Math.min(1, far / 18); // it's stuck: it comes slowly at first
  l.el.querySelector('.snack')!.setAttribute('transform', `translate(${l.cx + dx * give} ${l.cy + dy * give}) rotate(${dx * 0.6})`);
  if (far * svgScale > 80) {
    l.left = 0;
    l.grabbed = undefined;
    const snack = l.el.querySelector<SVGGElement>('.snack')!;
    snack.classList.add('out');
    done(l);
  }
}

function wrongTool(l: Live, ms: number): void {
  wrongFor += ms;
  if (wrongFor < 900 || performance.now() - lastHint < 3500) return;
  wrongFor = 0;
  hintFor(l);
}

function hintFor(l: Live): void {
  lastHint = performance.now();
  const want = needs(l);
  const btn = stage().querySelector(`.tool-btn[data-tool="${want}"]`);
  if (btn) bounce(btn, 'pick-me');
  void say(SAY.hint[want]);
}

/** Nothing fixed for a while: point at something to do. */
function idleHint(): void {
  if (busy || !patient || performance.now() - lastProgress < 9000 || performance.now() - lastHint < 6000) return;
  const l = todo()[0];
  if (l) hintFor(l);
}
const progress = () => (lastProgress = performance.now());

function foam(x: number, y: number): void {
  const b = document.createElement('i');
  b.className = 'bub';
  b.style.left = `${x + (Math.random() - 0.5) * 50}px`;
  b.style.top = `${y + (Math.random() - 0.5) * 30}px`;
  b.style.setProperty('--s', `${10 + Math.random() * 16}px`);
  document.body.append(b);
  setTimeout(() => b.remove(), 1200);
}

function spray(x: number, y: number): void {
  for (let k = 0; k < 3; k++) {
    const d = document.createElement('i');
    d.className = 'water';
    const a = Math.random() * Math.PI * 2;
    d.style.left = `${x}px`;
    d.style.top = `${y}px`;
    d.style.setProperty('--dx', `${Math.cos(a) * (20 + Math.random() * 30)}px`);
    d.style.setProperty('--dy', `${Math.sin(a) * (20 + Math.random() * 30)}px`);
    document.body.append(d);
    setTimeout(() => d.remove(), 500);
  }
}

function done(l: Live): void {
  const s = screenOf(l);
  if (l.p.kind === 'cavity' && l.step === 0) {
    // Drilled clean: now it needs filling.
    l.step = 1;
    l.left = 1;
    stopLoop();
    sfx.pop();
    hintFor(l);
    return;
  }
  l.left = 0;
  fixed++;
  ting(fixed);
  burst(stage(), s.x, s.y, l.p.kind === 'germ' ? ['#6cc644', '#ffffff', '#8fd3ff'] : ['#ffffff', '#ffd34d', '#bfe6ff'], 14, 70);
  if (l.p.kind === 'germ') {
    eek();
    l.el.classList.add('gone');
    if (!live.some((x) => x !== l && x.p.kind === 'germ' && x.left <= 0)) void say(SAY.germGone);
  } else if (l.p.kind === 'plaque') l.el.remove();
  else if (l.p.kind === 'stuck') setTimeout(() => l.el.remove(), 600);
  else l.el.classList.add('done');
  if (!todo().length) void finish();
  else if (fixed % 2 === 0) void say(pickOne(PRAISE));
}

async function finish(): Promise<void> {
  const my = run;
  busy = true;
  holding = null;
  clearInterval(timer);
  stopLoop();
  $('tool').hidden = true;
  patients++;
  await wait(500);
  if (my !== run) return;
  const mouth = stage().querySelector('.mouth')!;
  mouth.classList.add('shiny');
  sfx.yay();
  for (const t of stage().querySelectorAll('.tooth')) {
    const [x, y] = centerOf(t);
    if (Math.random() < 0.5) burst(stage(), x, y, ['#ffffff', '#fff6a8'], 4, 40);
  }
  await talk(SAY.allBetter, 1200, 5000);
  if (my !== run) return;
  stage().querySelector('.patient')!.classList.add('happy');
  await talk([...patientSound(patient!), en(SAY.thanks)], 800, 6000);
  if (my !== run) return;
  if (patients % 2 === 0) celebrate(() => startPatient());
  else {
    await wait(600);
    if (my === run) startPatient();
  }
}

// ── Screens ────────────────────────────────────────────────────

function start(): void {
  unlock();
  run++;
  clearInterval(idleTimer);
  idleTimer = window.setInterval(idleHint, 1000);
  busy = false;
  patients = 0;
  tool = 'brush';
  $('menu').hidden = true;
  $('game').hidden = false;
  keepAwake(true);
  startPatient();
}

function stop(): void {
  run++;
  clearInterval(idleTimer);
  holding = null;
  clearInterval(timer);
  stopLoop();
  stopSpeech();
  keepAwake(false);
  stage().innerHTML = '';
  $('party').hidden = true;
  $('game').hidden = true;
  $('menu').hidden = false;
}

function init(): void {
  $('play').addEventListener('click', start);
  bindVoiceButton($('voice'));
  bindLangButtons($('lang'));
  bindKidsNav(stop);
  lockGestures();
  stage().addEventListener('pointerdown', down);
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
  window.addEventListener('pointercancel', up);
  // Turning the tablet: keep the mouth fitting the screen (its shape stays until the next patient).
  window.addEventListener('resize', () => {
    const svg = stage().querySelector<SVGElement>('.mouth-svg');
    if (svg) svg.style.width = `${mouthWidth()}px`;
  });
}

init();
syncOnOpen(undefined, () => !document.getElementById('menu')!.hidden && location.reload());
