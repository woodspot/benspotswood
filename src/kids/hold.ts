// Grown-ups only: hold a button for 1.5 seconds to leave a toddler game.
// A quick tap does nothing except show a "Keep holding…" hint, so little hands can't exit by accident.

const HOLD_MS = 1500;

export function holdToExit(btn: HTMLElement, onExit: () => void): void {
  let timer = 0;
  let hintTimer = 0;
  let t0 = 0;
  let raf = 0;
  const reset = () => {
    // Let go too early: leave the hint up for a moment so grown-ups learn the trick.
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
    btn.style.setProperty('--p', String(Math.min(1, (performance.now() - t0) / HOLD_MS)));
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
      onExit();
    }, HOLD_MS);
  });
  for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) btn.addEventListener(ev, reset);
}

/** Stop pinch-zoom, double-tap zoom and the long-press menu on iOS. */
export function lockGestures(): void {
  for (const ev of ['gesturestart', 'dblclick', 'contextmenu']) document.addEventListener(ev, (e) => e.preventDefault());
}

type WakeLockNav = Navigator & { wakeLock?: { request(t: 'screen'): Promise<{ release(): Promise<void> }> } };
let wake: { release(): Promise<void> } | null = null;

/** Keep the screen on while a game is playing (where the browser supports it). */
export function keepAwake(on: boolean): void {
  if (on) {
    void (navigator as WakeLockNav).wakeLock?.request('screen').then((l) => (wake = l)).catch(() => {});
  } else {
    void wake?.release();
    wake = null;
  }
}
