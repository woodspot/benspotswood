// Drag-and-drop for little fingers: pick a piece up, carry it, let go over (or near) a target.
// Forgiving: letting go close to a target counts, and a tap without moving just "picks" (says its name).

export interface DragOptions {
  root: HTMLElement;
  piece: string; // selector for draggable pieces inside root
  target: string; // selector for drop targets inside root
  /** Picked up (or tapped): a good moment to say what it is. */
  onPick?: (piece: HTMLElement) => void;
  /** Let go. Return true to keep the piece where the caller put it; false sends it back. */
  onDrop: (piece: HTMLElement, target: HTMLElement | null, x: number, y: number) => boolean;
}

/** Start listening; returns a function that stops. */
export function bindDrag(o: DragOptions): () => void {
  let held: { el: HTMLElement; id: number; x0: number; y0: number; moved: boolean } | null = null;
  let over: HTMLElement | null = null;

  const targetAt = (x: number, y: number): HTMLElement | null => {
    const hit = document.elementFromPoint(x, y)?.closest<HTMLElement>(o.target);
    if (hit && o.root.contains(hit)) return hit;
    // Nearest target, if the finger is within about a target's size of it.
    let best: HTMLElement | null = null;
    let bestD = Infinity;
    for (const t of o.root.querySelectorAll<HTMLElement>(o.target)) {
      const r = t.getBoundingClientRect();
      const d = Math.hypot(x - (r.left + r.width / 2), y - (r.top + r.height / 2));
      if (d < Math.max(r.width, r.height) * 0.9 && d < bestD) [best, bestD] = [t, d];
    }
    return best;
  };

  const down = (e: PointerEvent) => {
    if (held) return;
    const el = (e.target as HTMLElement).closest<HTMLElement>(o.piece);
    if (!el || !o.root.contains(el) || el.classList.contains('placed')) return;
    e.preventDefault();
    held = { el, id: e.pointerId, x0: e.clientX, y0: e.clientY, moved: false };
    el.classList.add('held');
    el.style.transition = 'none';
    o.onPick?.(el);
  };
  const move = (e: PointerEvent) => {
    if (!held || e.pointerId !== held.id) return;
    const dx = e.clientX - held.x0;
    const dy = e.clientY - held.y0;
    if (Math.hypot(dx, dy) > 6) held.moved = true;
    held.el.style.transform = `translate(${dx}px, ${dy}px) scale(1.12)`;
    const t = targetAt(e.clientX, e.clientY);
    if (t !== over) {
      over?.classList.remove('over');
      t?.classList.add('over');
      over = t;
    }
  };
  const up = (e: PointerEvent) => {
    if (!held || e.pointerId !== held.id) return;
    const { el, moved } = held;
    held = null;
    over?.classList.remove('over');
    over = null;
    el.classList.remove('held');
    const t = moved ? targetAt(e.clientX, e.clientY) : null;
    const keep = moved && o.onDrop(el, t, e.clientX, e.clientY);
    if (!keep) {
      // Spring back home.
      el.style.transition = 'transform .35s cubic-bezier(.3,1.6,.5,1)';
      el.style.transform = '';
      if (moved && t) {
        el.classList.remove('nope');
        void el.offsetWidth;
        el.classList.add('nope');
      }
    }
  };

  o.root.addEventListener('pointerdown', down);
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
  window.addEventListener('pointercancel', up);
  return () => {
    o.root.removeEventListener('pointerdown', down);
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
    window.removeEventListener('pointercancel', up);
  };
}

/** Move a piece smoothly into a target's spot (the caller then re-parents or hides it). */
export function flyInto(piece: HTMLElement, target: HTMLElement, scale = 1): Promise<void> {
  const p = piece.getBoundingClientRect();
  const t = target.getBoundingClientRect();
  const cur = new DOMMatrix(getComputedStyle(piece).transform === 'none' ? undefined : getComputedStyle(piece).transform);
  const dx = t.left + t.width / 2 - (p.left + p.width / 2) + cur.e;
  const dy = t.top + t.height / 2 - (p.top + p.height / 2) + cur.f;
  piece.style.transition = 'transform .25s ease-out';
  piece.style.transform = `translate(${dx}px, ${dy}px) scale(${scale})`;
  piece.classList.add('placed');
  return new Promise((r) => setTimeout(r, 260));
}
