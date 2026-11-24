// Confetti and the big star party, shared by the toddler games.

export const CONFETTI = ['#ec4038', '#3a7ff0', '#f7cf2d', '#3fbf5a', '#f68b28', '#9b5de5', '#f477b6', '#ffffff'];

/** A burst of confetti bits flying out from (x, y), in page pixels. */
export function burst(parent: HTMLElement, x: number, y: number, colors: string[], n: number, spread: number): void {
  for (let i = 0; i < n; i++) {
    const p = document.createElement('i');
    p.className = 'bit';
    const a = (Math.PI * 2 * i) / n + Math.random() * 0.5;
    const d = spread * (0.6 + Math.random() * 0.6);
    p.style.left = `${x}px`;
    p.style.top = `${y}px`;
    p.style.background = colors[i % colors.length];
    p.style.setProperty('--dx', `${Math.cos(a) * d}px`);
    p.style.setProperty('--dy', `${Math.sin(a) * d}px`);
    p.style.setProperty('--r', `${Math.round(Math.random() * 360)}deg`);
    parent.appendChild(p);
    setTimeout(() => p.remove(), 900);
  }
}

/** Show the party overlay (a spinning star) with confetti; calls done() when it's over. */
export function party(overlay: HTMLElement, parent: HTMLElement, done: () => void): void {
  overlay.hidden = false;
  const w = innerWidth;
  const h = innerHeight;
  for (let k = 0; k < 4; k++) setTimeout(() => burst(parent, w * (0.2 + 0.2 * k), h * (0.25 + 0.15 * (k % 2)), CONFETTI, 26, 160), k * 300);
  setTimeout(() => {
    overlay.hidden = true;
    done();
  }, 3200);
}
