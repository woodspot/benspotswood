// Small helpers for the toddler games. (Leaving a game is guarded in gate.ts.)

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
