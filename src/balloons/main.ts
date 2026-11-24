// Balloon Pop: a tapping game for toddlers. Balloons float up; a voice asks for a colour,
// a shape or a number of pops. Every tap pops something, and nothing ever goes wrong.
import { isVoiceOn, setVoiceOn, sfx, say, unlock } from './audio';
import {
  COLOR_HEX, newSession, nextBalloon, nextPrompt, pop, praiseFor, promptFor,
  type Mode, type Session, type ShapeId, type Spec, type Target,
} from './game';

const $ = (id: string) => document.getElementById(id)!;
const rng = Math.random;
const CELEBRATE_EVERY = 5; // a big party after this many right answers
const IDLE_REPROMPT_MS = 25000; // one gentle reminder per target, only after a long pause

// ── Drawing ────────────────────────────────────────────────────

function starPoints(cx: number, cy: number, r: number): string {
  return Array.from({ length: 10 }, (_, i) => {
    const a = (Math.PI / 5) * i - Math.PI / 2;
    const rr = i % 2 ? r * 0.45 : r;
    return `${(cx + Math.cos(a) * rr).toFixed(1)},${(cy + Math.sin(a) * rr).toFixed(1)}`;
  }).join(' ');
}

export function shapeSvg(shape: ShapeId, cx = 50, cy = 56, r = 19, fill = '#fff'): string {
  switch (shape) {
    case 'circle': return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}"/>`;
    case 'square': return `<rect x="${cx - r * 0.9}" y="${cy - r * 0.9}" width="${r * 1.8}" height="${r * 1.8}" rx="3" fill="${fill}"/>`;
    case 'triangle': return `<polygon points="${cx},${cy - r} ${cx + r * 1.1},${cy + r * 0.9} ${cx - r * 1.1},${cy + r * 0.9}" fill="${fill}" stroke="${fill}" stroke-width="3" stroke-linejoin="round"/>`;
    case 'star': return `<polygon points="${starPoints(cx, cy, r * 1.15)}" fill="${fill}" stroke="${fill}" stroke-width="2" stroke-linejoin="round"/>`;
    case 'heart': {
      const s = r / 18;
      return `<path transform="translate(${cx} ${cy}) scale(${s})" d="M0 18 C-24 2 -20 -18 -8 -16 C-3 -15 0 -10 0 -10 C0 -10 3 -15 8 -16 C20 -18 24 2 0 18 Z" fill="${fill}"/>`;
    }
  }
}

function balloonSvg(spec: Spec, withString = true): string {
  const c = COLOR_HEX[spec.color];
  return `<svg viewBox="0 0 100 ${withString ? 150 : 122}" aria-hidden="true">
    <path d="M50 4 C22 4 6 28 6 54 C6 84 30 106 50 112 C70 106 94 84 94 54 C94 28 78 4 50 4 Z" fill="${c}"/>
    <path d="M50 4 C22 4 6 28 6 54 C6 84 30 106 50 112 C70 106 94 84 94 54 C94 28 78 4 50 4 Z" fill="url(#shade)"/>
    <ellipse cx="32" cy="32" rx="9" ry="16" transform="rotate(-22 32 32)" fill="rgba(255,255,255,.45)"/>
    <path d="M43 111 L57 111 L50 120 Z" fill="${c}"/>
    ${spec.shape ? `<g class="mark">${shapeSvg(spec.shape)}</g>` : ''}
    ${withString ? '<path d="M50 120 Q43 130 50 138 T50 150" stroke="rgba(255,255,255,.75)" stroke-width="1.6" fill="none"/>' : ''}
  </svg>`;
}

// ── Balloons on screen ─────────────────────────────────────────

interface Balloon {
  id: number;
  spec: Spec;
  el: HTMLElement;
  x: number;
  y: number;
  speed: number; // px per second, upward
  phase: number; // sway
}

let session: Session = newSession('free', rng);
let balloons: Balloon[] = [];
let nextId = 1;
let running = false;
let paused = false; // during a celebration
let lastSpawn = 0;
let lastTouch = 0;
let lastFrame = 0;
let rightAnswers = 0;
let reminded = false;
let wakeLock: { release(): Promise<void> } | null = null;

const stage = () => $('stage');
const size = () => {
  const w = innerWidth;
  const h = innerHeight;
  const bw = Math.round(Math.max(88, Math.min(170, Math.min(w, h) * 0.22)));
  return { w, h, bw, bh: bw * 1.5, max: w >= 700 ? 8 : 6 };
};

function spawn(now: number): void {
  const { w, h, bw, bh } = size();
  const spec = nextBalloon(session, balloons.map((b) => b.spec), rng);
  // Find a spot that doesn't overlap balloons that are still low on the screen.
  let x = 0;
  for (let tries = 0; tries < 8; tries++) {
    x = rng() * Math.max(1, w - bw);
    if (!balloons.some((b) => b.y > h - bh * 1.6 && Math.abs(b.x - x) < bw * 0.95)) break;
  }
  const el = document.createElement('div');
  el.className = 'balloon';
  el.style.width = `${bw}px`;
  el.innerHTML = balloonSvg(spec);
  const b: Balloon = { id: nextId++, spec, el, x, y: h + 10, speed: h / (8 + rng() * 3), phase: rng() * Math.PI * 2 };
  el.dataset.id = String(b.id);
  stage().appendChild(el);
  balloons.push(b);
  lastSpawn = now;
}

function frame(now: number): void {
  if (!running) return;
  const dt = Math.min(0.05, (now - (lastFrame || now)) / 1000);
  lastFrame = now;
  const { bh, max } = size();
  if (!paused) {
    // A steady stream: about one new balloon every 1.4 s, so the sky is never empty.
    if (balloons.length < max && now - lastSpawn > (balloons.length < 2 ? 500 : 1400)) spawn(now);
    for (const b of balloons) {
      b.y -= b.speed * dt;
      b.phase += dt * 1.3;
      const sway = Math.sin(b.phase) * 10;
      b.el.style.transform = `translate(${b.x + sway}px, ${b.y}px) rotate(${Math.sin(b.phase) * 4}deg)`;
    }
    // Balloons that float off the top just go; new ones keep coming.
    for (const b of balloons.filter((x) => x.y < -bh)) remove(b);
    if (!reminded && now - lastTouch > IDLE_REPROMPT_MS && session.target.kind !== 'any') {
      reminded = true;
      say(promptFor(session.target));
    }
  }
  requestAnimationFrame(frame);
}

function remove(b: Balloon): void {
  b.el.remove();
  balloons = balloons.filter((x) => x !== b);
}

// ── Popping ────────────────────────────────────────────────────

function burst(x: number, y: number, colors: string[], n: number, spread: number): void {
  for (let i = 0; i < n; i++) {
    const p = document.createElement('i');
    p.className = 'bit';
    const a = (Math.PI * 2 * i) / n + rng() * 0.5;
    const d = spread * (0.6 + rng() * 0.6);
    p.style.left = `${x}px`;
    p.style.top = `${y}px`;
    p.style.background = colors[i % colors.length];
    p.style.setProperty('--dx', `${Math.cos(a) * d}px`);
    p.style.setProperty('--dy', `${Math.sin(a) * d}px`);
    p.style.setProperty('--r', `${Math.round(rng() * 360)}deg`);
    stage().appendChild(p);
    setTimeout(() => p.remove(), 900);
  }
}

const CONFETTI = ['#ec4038', '#3a7ff0', '#f7cf2d', '#3fbf5a', '#f68b28', '#9b5de5', '#f477b6', '#ffffff'];

function bigText(x: number, y: number, text: string): void {
  const el = document.createElement('div');
  el.className = 'big-pop';
  el.textContent = text;
  el.style.left = `${x}px`;
  el.style.top = `${y}px`;
  stage().appendChild(el);
  setTimeout(() => el.remove(), 1100);
}

function onPop(b: Balloon): void {
  const r = b.el.getBoundingClientRect();
  const cx = r.left + r.width / 2;
  const cy = r.top + r.width * 0.55;
  const color = COLOR_HEX[b.spec.color];
  remove(b);
  sfx.pop();
  lastTouch = performance.now();
  const asked: Target = session.target;
  const res = pop(session, b.spec, rng);
  if (res.kind === 'right' && res.done) reminded = false;

  if (res.kind === 'free') {
    burst(cx, cy, [color, '#fff'], 14, 90);
    if (session.correct % 3 === 0) setTimeout(sfx.yay, 60);
    if (session.correct % 15 === 0) celebrate();
  } else if (res.kind === 'other') {
    burst(cx, cy, [color], 10, 60);
    setTimeout(sfx.boop, 80);
    nudgeTarget(); // no talking: the picture at the top wiggles to show what to look for
  } else {
    burst(cx, cy, [color, ...CONFETTI], 22, 140);
    if (res.count) {
      bigText(cx, cy, String(res.count));
      sfx.count(res.count);
    }
    if (res.done) {
      setTimeout(sfx.yay, res.count ? 250 : 60);
      rightAnswers++;
      renderTarget(asked, true);
      if (rightAnswers % CELEBRATE_EVERY === 0) {
        say(praiseFor(asked));
        setTimeout(celebrate, 1200);
      } else {
        // One short line: name what they found, then the next thing. "Red! Now blue."
        say(`${praiseFor(asked)} ${nextPrompt(session.target)}`);
        setTimeout(() => renderTarget(session.target), 900);
      }
    }
  }
  if (res.kind !== 'right' || !res.done) renderTarget(session.target);
}

function nudgeTarget(): void {
  const el = $('target');
  el.classList.remove('nudge');
  void el.offsetWidth;
  el.classList.add('nudge');
}

function celebrate(): void {
  paused = true;
  sfx.fanfare();
  say('Hooray!');
  const el = $('party');
  el.hidden = false;
  const { w, h } = size();
  for (let k = 0; k < 4; k++) setTimeout(() => burst(w * (0.2 + 0.2 * k), h * (0.25 + 0.15 * (k % 2)), CONFETTI, 26, 160), k * 300);
  setTimeout(() => {
    el.hidden = true;
    paused = false;
    renderTarget(session.target);
    if (session.target.kind !== 'any') say(promptFor(session.target));
  }, 3200);
}

// ── The target chip: shows what to find, tap it to hear it again ──

function renderTarget(t: Target, cheer = false): void {
  const el = $('target');
  el.classList.toggle('cheer', cheer);
  if (t.kind === 'any') {
    el.hidden = true;
    return;
  }
  el.hidden = false;
  if (t.kind === 'color') el.innerHTML = `<span class="t-balloon">${balloonSvg({ color: t.id, shape: null }, false)}</span>`;
  else if (t.kind === 'shape') el.innerHTML = `<svg class="t-shape" viewBox="20 26 60 60">${shapeSvg(t.id, 50, 56, 22, '#ffd34d')}</svg>`;
  else
    el.innerHTML = Array.from({ length: t.n }, (_, i) => `<span class="dot ${cheer || i < session.progress ? 'on' : ''}">${i + 1}</span>`).join('');
}

// ── Screens ────────────────────────────────────────────────────

function start(mode: Mode): void {
  unlock();
  session = newSession(mode, rng);
  rightAnswers = 0;
  for (const b of [...balloons]) remove(b);
  $('menu').hidden = true;
  $('game').hidden = false;
  renderTarget(session.target);
  reminded = false;
  if (mode !== 'free') say(promptFor(session.target));
  running = true;
  paused = false;
  lastFrame = 0;
  lastTouch = performance.now();
  requestAnimationFrame(frame);
  void (navigator as Navigator & { wakeLock?: { request(t: 'screen'): Promise<{ release(): Promise<void> }> } }).wakeLock
    ?.request('screen')
    .then((l) => (wakeLock = l))
    .catch(() => {});
}

function stop(): void {
  running = false;
  for (const b of [...balloons]) remove(b);
  speechSynthesis?.cancel();
  void wakeLock?.release();
  wakeLock = null;
  $('game').hidden = true;
  $('party').hidden = true;
  $('menu').hidden = false;
}

function buildMenu(): void {
  const pics: Record<Mode, string> = {
    free: [{ color: 'red' }, { color: 'yellow' }, { color: 'blue' }].map((s) => `<span class="mini">${balloonSvg({ ...s, shape: null } as Spec, false)}</span>`).join(''),
    colors: (['red', 'blue', 'yellow', 'green'] as const).map((c) => `<i class="swatch" style="background:${COLOR_HEX[c]}"></i>`).join(''),
    shapes: `<svg viewBox="0 0 120 60">${shapeSvg('star', 30, 30, 20, '#ffd34d')}${shapeSvg('heart', 90, 30, 20, '#f477b6')}</svg>`,
    count: '<b class="nums">1 2 3</b>',
  };
  const label: Record<Mode, string> = { free: 'Pop!', colors: 'Colors', shapes: 'Shapes', count: 'Count' };
  $('modes').innerHTML = (Object.keys(pics) as Mode[])
    .map((m) => `<button class="mode m-${m}" data-mode="${m}"><span class="pic">${pics[m]}</span><span class="lbl">${label[m]}</span></button>`)
    .join('');
  const voiceBtn = $('voice');
  const showVoice = () => (voiceBtn.textContent = isVoiceOn() ? '🔊 Voice on' : '🔇 Voice off');
  showVoice();
  voiceBtn.addEventListener('click', () => {
    setVoiceOn(!isVoiceOn());
    showVoice();
    unlock();
    if (isVoiceOn()) say('Hello!');
  });
  $('modes').addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLElement>('[data-mode]');
    if (btn) start(btn.dataset.mode as Mode);
  });
}

/** Grown-ups only: hold the home button for 1.5 seconds to leave the game. */
function holdToExit(): void {
  const btn = $('home');
  let timer = 0;
  let t0 = 0;
  let raf = 0;
  let hintTimer = 0;
  const reset = () => {
    // Let go too early: leave the "Keep holding…" hint up for a moment so grown-ups learn the trick.
    if (btn.classList.contains('holding')) {
      btn.classList.add('hinting');
      clearTimeout(hintTimer);
      hintTimer = window.setTimeout(() => btn.classList.remove('hinting'), 1800);
    }
    btn.classList.remove('holding');
    clearTimeout(timer);
    cancelAnimationFrame(raf);
    btn.style.setProperty('--p', '0');
  };
  const tick = () => {
    btn.style.setProperty('--p', String(Math.min(1, (performance.now() - t0) / 1500)));
    raf = requestAnimationFrame(tick);
  };
  // iOS turns a long press into its own gesture and cancels the touch; stop that so holding works.
  btn.addEventListener('touchstart', (e) => e.preventDefault(), { passive: false });
  btn.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    btn.setPointerCapture?.(e.pointerId);
    btn.classList.add('holding');
    t0 = performance.now();
    tick();
    timer = window.setTimeout(() => {
      btn.classList.remove('holding');
      reset();
      stop();
    }, 1500);
  });
  for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) btn.addEventListener(ev, reset);
}

function init(): void {
  buildMenu();
  holdToExit();
  // Pop on touch-down: quicker and more forgiving than a full click for small fingers.
  stage().addEventListener('pointerdown', (e) => {
    if (paused) return;
    const el = (e.target as HTMLElement).closest<HTMLElement>('.balloon');
    const b = el && balloons.find((x) => String(x.id) === el.dataset.id);
    if (b) onPop(b);
  });
  $('target').addEventListener('pointerdown', () => {
    lastTouch = performance.now();
    say(promptFor(session.target));
  });
  // Stop pinch-zoom, double-tap zoom and the long-press menu on iOS.
  for (const ev of ['gesturestart', 'dblclick', 'contextmenu']) document.addEventListener(ev, (e) => e.preventDefault());
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) speechSynthesis?.cancel();
    else if (running) lastFrame = 0;
  });
}

init();
