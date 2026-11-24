// Keep a game upright when the device turns sideways.
//
// iPhone and iPad Safari don't let web pages lock the screen orientation, so instead we turn the
// whole game the other way whenever the device goes sideways: to a toddler it simply never rotates.
// The CSS for this lives in kids.css (.turn-90 / .turn-270 on <html>, applied to #app).

function angle(): number {
  const a = screen.orientation?.angle ?? Number((window as Window & { orientation?: number }).orientation ?? 0);
  return ((a % 360) + 360) % 360;
}

export function stayPortrait(): void {
  const root = document.documentElement;
  const apply = () => {
    // Only turn when the screen really is wider than tall (desktop browsers report angle 0 anyway).
    const a = innerWidth > innerHeight ? angle() : 0;
    root.classList.toggle('turn-90', a === 90);
    root.classList.toggle('turn-270', a === 270);
  };
  apply();
  screen.orientation?.addEventListener?.('change', apply);
  addEventListener('orientationchange', apply);
  addEventListener('resize', apply);
  // Android (and iOS home-screen apps one day) can lock for real; try it, ignore failure.
  void (screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> })?.lock?.('portrait').catch(() => {});
}
