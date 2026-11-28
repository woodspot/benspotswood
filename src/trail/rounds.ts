// The hands-on rounds of Hoot's Trail. Each one draws itself on the board, handles little fingers,
// and resolves when the child has done it (the lesson then cheers and moves on).
import { sfx, type Part } from '../kids/audio';
import { burst, CONFETTI } from '../kids/fx';
import { drawing } from '../kids/art';
import type { Lang } from '../kids/words';
import { letterOf } from '../abc/game';
import { COLOR_HEX, type ColorId } from '../balloons/game';
import { bindDrag, flyInto } from './drag';
import {
  colorPart, countedParts, dotsDonePart, letterParts, letterWordPart, numberPart, shapePart, sizePart, thatsLetter, thingPart,
  YUM, type Round, type ShapeId, type Thing,
} from './game';

export interface Ctx {
  board: HTMLElement;
  lang: Lang;
  /** Say something and wait for it (never forever). */
  talk: (parts: Part[] | string, min?: number, max?: number) => Promise<void>;
  /** Say something now, cutting off whatever was being said. */
  say: (parts: Part[]) => void;
  /** False once the child has left the lesson. */
  alive: () => boolean;
}

let stopCurrent: (() => void) | null = null;
/** Stop listening to the round on screen (the child left the lesson). */
export function cancelRound(): void {
  stopCurrent?.();
  stopCurrent = null;
}

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const centerOf = (el: Element): [number, number] => {
  const r = el.getBoundingClientRect();
  return [r.left + r.width / 2, r.top + r.height / 2];
};
const sparkle = (el: Element, n = 10) => {
  const [x, y] = centerOf(el);
  burst(document.body, x, y, CONFETTI, n, 80);
};

/** Play one round. Resolves when it's done. */
export function playRound(r: Round, c: Ctx): Promise<void> {
  cancelRound();
  c.board.className = `board k-${r.kind}`;
  const ac = new AbortController();
  const cleanups: (() => void)[] = [() => ac.abort()];
  stopCurrent = () => cleanups.forEach((f) => f());
  const done = (() => {
    switch (r.kind) {
      case 'trace': return trace(r, c, ac.signal);
      case 'pop': return pop(r, c, cleanups);
      case 'tapcount': return tapCount(r, c, ac.signal);
      case 'dots': return dots(r, c, ac.signal);
      default: return dropRound(r, c, cleanups);
    }
  })();
  return done.then(() => cancelRound());
}

// ── Trace the letter ───────────────────────────────────────────

async function trace(r: Extract<Round, { kind: 'trace' }>, c: Ctx, signal: AbortSignal): Promise<void> {
  const l = letterOf(r.letter, c.lang);
  c.board.innerHTML = `<div class="trace-wrap"><canvas class="trace"></canvas><div class="trace-pic">${drawing(l.emoji)}</div></div>`;
  const canvas = c.board.querySelector('canvas')!;
  const S = Math.max(220, Math.min(c.board.clientWidth - 24, c.board.clientHeight - 30, 460));
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const W = Math.round(S * dpr);
  canvas.width = canvas.height = W;
  canvas.style.width = canvas.style.height = `${S}px`;
  const g = canvas.getContext('2d')!;
  const layer = () => {
    const cv = document.createElement('canvas');
    cv.width = cv.height = W;
    return [cv, cv.getContext('2d')!] as const;
  };

  // The letter's shape, a bit fatter than the font so little fingers can stay inside it.
  const [mask, m] = layer();
  m.font = `900 ${W * 0.84}px ui-rounded, "Arial Rounded MT Bold", "Arial Black", system-ui, sans-serif`;
  m.textAlign = 'center';
  const met = m.measureText(r.letter);
  const y = W / 2 + (met.actualBoundingBoxAscent - met.actualBoundingBoxDescent) / 2;
  m.lineJoin = 'round';
  m.lineWidth = W * 0.05;
  m.fillStyle = m.strokeStyle = '#fff';
  m.fillText(r.letter, W / 2, y);
  m.strokeText(r.letter, W / 2, y);

  // Points inside the letter, to see how much of it has been painted.
  const md = m.getImageData(0, 0, W, W).data;
  const step = Math.max(4, Math.round(W / 40));
  const inside: number[] = [];
  for (let py = 0; py < W; py += step) for (let px = 0; px < W; px += step) if (md[(py * W + px) * 4 + 3] > 128) inside.push(py * W + px);

  const [paint, p] = layer();
  p.lineCap = p.lineJoin = 'round';
  p.lineWidth = W * 0.14;
  let hue = Math.random() * 360;
  let finished = false;

  const draw = () => {
    g.clearRect(0, 0, W, W);
    g.save();
    g.shadowColor = 'rgba(0,0,0,.18)';
    g.shadowOffsetY = W * 0.015;
    g.drawImage(mask, 0, 0);
    g.restore();
    if (finished) {
      g.globalCompositeOperation = 'source-atop';
      g.fillStyle = '#ffd34d';
      g.fillRect(0, 0, W, W);
      g.globalCompositeOperation = 'source-over';
    }
    g.drawImage(paint, 0, 0);
  };
  draw();

  let last: [number, number] | null = null;
  let moves = 0;
  let shown = 0; // tenths painted, for the rising notes
  const pos = (e: PointerEvent): [number, number] => {
    const b = canvas.getBoundingClientRect();
    return [((e.clientX - b.left) * W) / b.width, ((e.clientY - b.top) * W) / b.height];
  };
  const covered = () => {
    const d = p.getImageData(0, 0, W, W).data;
    let n = 0;
    for (const i of inside) if (d[i * 4 + 3] > 0) n++;
    return n / Math.max(1, inside.length);
  };

  return new Promise<void>((resolve) => {
    const stroke = (to: [number, number]) => {
      const from = last ?? to;
      hue = (hue + 4) % 360;
      p.strokeStyle = `hsl(${hue} 85% 58%)`;
      p.beginPath();
      p.moveTo(from[0], from[1]);
      p.lineTo(to[0], to[1]);
      p.stroke();
      // Paint only shows inside the letter.
      p.globalCompositeOperation = 'destination-in';
      p.drawImage(mask, 0, 0);
      p.globalCompositeOperation = 'source-over';
      last = to;
      draw();
      if (++moves % 6 === 0) check();
    };
    const check = () => {
      if (finished) return;
      const f = covered();
      const tenths = Math.floor(f * 10);
      if (tenths > shown) {
        shown = tenths;
        sfx.count(Math.min(10, tenths));
      }
      if (f >= 0.6) void finish();
    };
    const finish = async () => {
      finished = true;
      draw();
      canvas.classList.add('done');
      c.board.querySelector('.trace-pic')!.classList.add('show');
      sfx.yay();
      sparkle(canvas, 24);
      await c.talk(letterParts(r.letter, c.lang), 1200);
      resolve();
    };
    let finger: number | null = null;
    canvas.addEventListener('pointerdown', (e) => {
      if (finished) return;
      e.preventDefault();
      finger = e.pointerId;
      last = null;
      stroke(pos(e));
    }, { signal });
    // Follow the finger even if it slips off the canvas for a moment.
    window.addEventListener('pointermove', (e) => {
      if (finished || e.pointerId !== finger) return;
      stroke(pos(e));
    }, { signal });
    const lift = (e: PointerEvent) => {
      if (e.pointerId !== finger) return;
      finger = null;
      last = null;
      check();
    };
    window.addEventListener('pointerup', lift, { signal });
    window.addEventListener('pointercancel', lift, { signal });
  });
}

// ── Pop the letter bubbles ─────────────────────────────────────

function pop(r: Extract<Round, { kind: 'pop' }>, c: Ctx, cleanups: (() => void)[]): Promise<void> {
  const target = r.letter;
  c.board.innerHTML = `<div class="pop-sky"><div class="pop-goal"><span class="pop-letter">${target}</span>
    <span class="pop-dots">${'<i></i>'.repeat(r.need)}</span></div></div>`;
  const sky = c.board.querySelector<HTMLElement>('.pop-sky')!;
  let popped = 0;
  let count = 0;
  const hues = ['#ff8fb1', '#8fd3ff', '#b6f08f', '#ffd36b', '#c9a6ff'];
  const spawn = () => {
    // At least every other bubble is the one to pop, so nobody waits long.
    const isTarget = count % 2 === 0 || Math.random() < 0.35;
    const ch = isTarget ? target : r.others[Math.floor(Math.random() * r.others.length)] ?? target;
    count++;
    const b = document.createElement('button');
    b.className = 'bubble';
    b.dataset.ch = ch;
    b.textContent = ch;
    b.style.left = `${6 + Math.random() * 70}%`;
    b.style.setProperty('--c', hues[count % hues.length]);
    b.style.animationDuration = `${6.5 + Math.random() * 2.5}s`;
    b.addEventListener('animationend', () => b.remove());
    sky.appendChild(b);
  };
  spawn();
  const timer = window.setInterval(spawn, 1100);
  const ac = new AbortController();
  cleanups.push(() => clearInterval(timer), () => ac.abort());

  return new Promise<void>((resolve) => {
    sky.addEventListener('pointerdown', async (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>('.bubble');
      if (!b || b.classList.contains('popped') || popped >= r.need) return;
      if (b.dataset.ch !== target) {
        b.classList.remove('wobble');
        void b.offsetWidth;
        b.classList.add('wobble');
        sfx.boop();
        c.say(thatsLetter(b.dataset.ch!, c.lang));
        return;
      }
      popped++;
      b.classList.add('popped');
      sfx.pop();
      burst(document.body, e.clientX, e.clientY, ['✨', '💧', '⭐'], 8, 60);
      setTimeout(() => b.remove(), 300);
      sky.querySelectorAll('.pop-dots i')[popped - 1]?.classList.add('on');
      c.say(thatsLetter(target, c.lang));
      if (popped < r.need) return;
      clearInterval(timer);
      await wait(500);
      for (const x of sky.querySelectorAll('.bubble')) x.classList.add('fade');
      await c.talk(letterParts(target, c.lang), 1000);
      resolve();
    }, { signal: ac.signal });
  });
}

// ── Tap to count ───────────────────────────────────────────────

function tapCount(r: Extract<Round, { kind: 'tapcount' }>, c: Ctx, signal: AbortSignal): Promise<void> {
  const spots = scatter(r.n);
  c.board.innerHTML = `<div class="count-field">${spots
    .map(([x, y], k) => `<button class="counter" data-k="${k}" style="left:${x}%;top:${y}%">${drawing(r.thing.e)}</button>`)
    .join('')}<div class="count-big" hidden></div></div>`;
  let counted = 0;
  return new Promise<void>((resolve) => {
    c.board.querySelector('.count-field')!.addEventListener('pointerdown', async (e) => {
      const t = (e.target as HTMLElement).closest<HTMLElement>('.counter');
      if (!t || t.classList.contains('counted') || counted >= r.n) return;
      counted++;
      t.classList.add('counted');
      t.dataset.n = String(counted);
      sfx.count(counted);
      c.say([numberPart(counted, c.lang)]);
      if (counted < r.n) return;
      await wait(700);
      const big = c.board.querySelector<HTMLElement>('.count-big')!;
      big.innerHTML = `${r.n} ${drawing(r.thing.e)}`;
      big.hidden = false;
      await c.talk(countedParts(r.thing, r.n, c.lang), 1200);
      resolve();
    }, { signal });
  });
}

/** Loose, non-overlapping spots (percent) for n things. */
function scatter(n: number): [number, number][] {
  const cols = n <= 3 ? n : n <= 6 ? 3 : 4;
  const rows = Math.ceil(n / cols);
  const cells = Array.from({ length: cols * rows }, (_, i) => i).sort(() => Math.random() - 0.5).slice(0, n).sort((a, b) => a - b);
  return cells.map((i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const jx = (Math.random() - 0.5) * (40 / cols);
    const jy = (Math.random() - 0.5) * (30 / rows);
    return [((col + 0.5) / cols) * 100 + jx, ((row + 0.5) / rows) * 100 + jy];
  });
}

// ── Drag-and-drop rounds ───────────────────────────────────────

function basketSvg(hex = '#c98a4b'): string {
  return `<svg class="basket-svg" viewBox="0 0 120 80" aria-hidden="true">
    <path d="M8 22 H112 L100 74 Q98 78 92 78 H28 Q22 78 20 74 Z" fill="${hex}"/>
    <path d="M8 22 H112" stroke="rgba(0,0,0,.25)" stroke-width="8" stroke-linecap="round"/>
    <path d="M30 34 L36 70 M52 34 L54 70 M68 34 L66 70 M90 34 L84 70" stroke="rgba(0,0,0,.18)" stroke-width="4" stroke-linecap="round"/>
  </svg>`;
}

function ballSvg(hex: string): string {
  return `<svg viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="44" fill="${hex}"/>
    <circle cx="34" cy="32" r="12" fill="rgba(255,255,255,.55)"/></svg>`;
}

export function shapeSvg(s: ShapeId, fill: string): string {
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

interface DropSpec {
  html: string;
  total: number; // right drops needed
  pick?: (piece: HTMLElement) => Part[] | null;
  /** Where a right drop lands (or null if it's not right there). */
  spotFor: (piece: HTMLElement, target: HTMLElement | null) => HTMLElement | null;
  /** Said when it lands. */
  landed: (piece: HTMLElement, spot: HTMLElement, n: number) => Part[];
  wrong?: (piece: HTMLElement) => Part[] | null;
  /** After the last one. */
  finish?: () => Promise<void>;
  /** How the piece sits once it lands: tucked into a basket, filling a hole, or eaten. */
  land?: 'tuck' | 'fill' | 'eat';
}

function dropRound(r: Round, c: Ctx, cleanups: (() => void)[]): Promise<void> {
  const s = dropSpec(r, c);
  c.board.innerHTML = s.html;
  let n = 0;
  return new Promise<void>((resolve) => {
    const unbind = bindDrag({
      root: c.board,
      piece: '.piece',
      target: '.drop',
      onPick: (piece) => {
        const parts = s.pick?.(piece);
        if (parts) c.say(parts);
      },
      onDrop: (piece, target) => {
        if (n >= s.total) return false;
        const spot = s.spotFor(piece, target);
        if (!spot) {
          if (target) {
            sfx.boop();
            const parts = s.wrong?.(piece);
            if (parts) c.say(parts);
          }
          return false;
        }
        n++;
        const mine = n;
        void (async () => {
          await flyInto(piece, spot, s.land === 'fill' ? 1 : 0.7);
          piece.style.transition = 'none';
          piece.style.transform = '';
          if (s.land === 'eat') piece.remove();
          else {
            spot.querySelector('.in')?.appendChild(piece) ?? spot.appendChild(piece);
            piece.classList.add(s.land === 'fill' ? 'filled' : 'tucked');
          }
          spot.classList.remove('bounce');
          void spot.offsetWidth;
          spot.classList.add('bounce');
          sfx.pop();
          sparkle(spot, 8);
          const parts = s.landed(piece, spot, mine);
          if (mine < s.total) return void c.say(parts);
          await c.talk(parts, 700);
          await s.finish?.();
          resolve();
        })();
        return true;
      },
    });
    cleanups.push(unbind);
  });
}

const goes = (el: HTMLElement) => el.dataset.goes ?? '';
const match = (piece: HTMLElement, target: HTMLElement | null) => (target && goes(target) === goes(piece) ? target : null);
const pieceRow = (pieces: string[]) => `<div class="tray">${shuffleDom(pieces).join('')}</div>`;
const shuffleDom = (list: string[]) => [...list].sort(() => Math.random() - 0.5);

function dropSpec(r: Round, c: Ctx): DropSpec {
  const L = c.lang;
  switch (r.kind) {
    case 'sound':
      return {
        html: `<div class="targets">${r.letters
          .map((ch) => `<div class="basket drop" data-goes="${ch}"><span class="b-letter">${ch}</span><div class="in"></div>${basketSvg()}</div>`)
          .join('')}</div>${pieceRow(r.letters.map((ch) => `<div class="piece pic" data-goes="${ch}">${drawing(letterOf(ch, L).emoji)}</div>`))}`,
        total: r.letters.length,
        pick: (p) => [letterWordPart(goes(p), L)],
        spotFor: match,
        landed: (p) => letterParts(goes(p), L),
        wrong: (p) => [letterWordPart(goes(p), L)],
        land: 'tuck',
      };
    case 'sort':
      return {
        html: `<div class="targets">${r.colors
          .map((col) => `<div class="basket drop" data-goes="${col}"><div class="in"></div>${basketSvg(COLOR_HEX[col])}</div>`)
          .join('')}</div>${pieceRow(r.items.map((col) => `<div class="piece ball" data-goes="${col}">${ballSvg(COLOR_HEX[col])}</div>`))}`,
        total: r.items.length,
        pick: (p) => [colorPart(goes(p) as ColorId, L)],
        spotFor: match,
        landed: (p) => [colorPart(goes(p) as ColorId, L)],
        land: 'tuck',
      };
    case 'shapes':
      return {
        html: `<div class="shape-board">${r.shapes
          .map((s) => `<div class="hole drop" data-goes="${s}">${shapeSvg(s, 'rgba(60,35,10,.35)')}</div>`)
          .join('')}</div>${pieceRow(r.shapes.map((s, k) => `<div class="piece shape" data-goes="${s}">${shapeSvg(s, r.colors[k])}</div>`))}`,
        total: r.shapes.length,
        pick: (p) => [shapePart(goes(p) as ShapeId, L)],
        spotFor: match,
        landed: (p) => [shapePart(goes(p) as ShapeId, L)],
        land: 'fill',
      };
    case 'size':
      return {
        html: `<div class="targets bears">
            <div class="bear drop big" data-goes="big">${drawing('🐻')}<div class="in"></div></div>
            <div class="bear drop small" data-goes="small">${drawing('🐻')}<div class="in"></div></div>
          </div>${pieceRow(r.things.flatMap((t) => [
            `<div class="piece sized big" data-goes="big">${drawing(t)}</div>`,
            `<div class="piece sized small" data-goes="small">${drawing(t)}</div>`,
          ]))}`,
        total: r.things.length * 2,
        spotFor: match,
        landed: (p) => [sizePart(goes(p) as 'big' | 'small', L)],
        wrong: (p) => [sizePart(goes(p) as 'big' | 'small', L)],
        land: 'tuck',
      };
    case 'pattern': {
      const byE = (e: string) => [...r.seq, ...r.blanks, ...r.tray].find((t) => t.e === e) as Thing;
      return {
        html: `<div class="string">${r.seq.map((t) => `<span class="bead">${drawing(t.e)}</span>`).join('')}${r.blanks
          .map((t) => `<span class="blank drop" data-goes="${t.e}">?</span>`)
          .join('')}</div>${pieceRow(r.tray.map((t) => `<div class="piece bead-piece" data-goes="${t.e}">${drawing(t.e)}</div>`))}`,
        total: r.blanks.length,
        pick: (p) => [thingPart(byE(goes(p)), L)],
        // Blanks fill in order: whichever blank it's dropped on, it's the next empty one that counts.
        spotFor: (p, t) => {
          if (!t) return null;
          const next = c.board.querySelector<HTMLElement>('.blank.drop:not(.full)');
          if (!next || goes(next) !== goes(p)) return null;
          next.classList.add('full');
          next.textContent = '';
          return next;
        },
        landed: (p) => [thingPart(byE(goes(p)), L)],
        land: 'fill',
      };
    }
    case 'feed':
      return {
        html: `<div class="feed">
            <div class="friend drop" data-goes="friend">${drawing(r.friend.e)}<div class="want">${r.n}<span>${drawing(r.food.e)}</span></div></div>
            <div class="fed">${'<i></i>'.repeat(r.n)}</div>
          </div>${pieceRow(Array.from({ length: r.n + 2 }, () => `<div class="piece food" data-goes="friend">${drawing(r.food.e)}</div>`))}`,
        total: r.n,
        spotFor: match,
        landed: (_p, spot, k) => {
          spot.classList.remove('chomp');
          void spot.offsetWidth;
          spot.classList.add('chomp');
          c.board.querySelectorAll('.fed i')[k - 1]?.classList.add('on');
          return [numberPart(k, L)];
        },
        finish: async () => {
          for (const x of c.board.querySelectorAll('.tray .piece')) x.classList.add('fade');
          c.board.querySelector('.friend')?.classList.add('happy');
          await c.talk(YUM, 1200);
        },
        land: 'eat',
      };
    default:
      throw new Error(`not a drag round: ${r.kind}`);
  }
}

// ── Dot-to-dot ─────────────────────────────────────────────────

function dots(r: Extract<Round, { kind: 'dots' }>, c: Ctx, signal: AbortSignal): Promise<void> {
  const pts = r.pic.points;
  c.board.innerHTML = `<svg class="dots" viewBox="-6 -6 112 112">
    <polygon class="fill" points="${pts.map((p) => p.join(',')).join(' ')}" fill="${r.pic.color}"/>
    <g class="lines"></g>
    ${pts
      .map(([x, y], k) => `<g class="dot ${k === 0 ? 'next' : ''}" data-k="${k}" transform="translate(${x} ${y})">
          <circle class="hit" r="11"/><circle class="ring" r="6.5"/><text y="2.6">${k + 1}</text></g>`)
      .join('')}
  </svg>`;
  const svg = c.board.querySelector<SVGSVGElement>('svg.dots')!;
  let nextDot = 0;
  let finished = false;
  return new Promise<void>((resolve) => {
    const lineTo = (a: number, b: number) =>
      svg.querySelector('.lines')!.insertAdjacentHTML('beforeend', `<line x1="${pts[a][0]}" y1="${pts[a][1]}" x2="${pts[b][0]}" y2="${pts[b][1]}"/>`);
    const hit = (k: number) => {
      if (finished) return;
      if (k !== nextDot) {
        const n = svg.querySelector(`.dot[data-k="${nextDot}"]`);
        n?.classList.remove('wiggle');
        void (n as HTMLElement | null)?.getBoundingClientRect();
        n?.classList.add('wiggle');
        return;
      }
      if (k > 0) lineTo(k - 1, k);
      const dot = svg.querySelector(`.dot[data-k="${k}"]`)!;
      dot.classList.remove('next');
      dot.classList.add('on');
      sfx.count(k + 1);
      c.say([numberPart(k + 1, c.lang)]);
      nextDot = k + 1;
      if (nextDot < pts.length) return void svg.querySelector(`.dot[data-k="${nextDot}"]`)!.classList.add('next');
      // Last dot: close the shape and colour it in.
      lineTo(k, 0);
      finished = true;
      svg.classList.add('complete');
      setTimeout(async () => {
        if (!c.alive()) return;
        sfx.yay();
        sparkle(svg, 30);
        await c.talk([dotsDonePart(r.pic, c.lang)], 1200);
        resolve();
      }, 700);
    };
    const dotAt = (e: PointerEvent) => {
      const el = document.elementFromPoint(e.clientX, e.clientY)?.closest<SVGGElement>('.dot');
      return el && svg.contains(el) ? Number(el.dataset.k) : null;
    };
    // Dots work by tapping, or by dragging a finger from one to the next.
    svg.addEventListener('pointerdown', (e) => {
      const k = dotAt(e);
      if (k !== null) hit(k);
      const t = e.target as Element;
      if (t.hasPointerCapture?.(e.pointerId)) t.releasePointerCapture(e.pointerId);
    }, { signal });
    svg.addEventListener('pointermove', (e) => {
      if (e.buttons === 0 && e.pointerType === 'mouse') return;
      const k = dotAt(e);
      if (k !== null && k === nextDot) hit(k);
    }, { signal });
  });
}
