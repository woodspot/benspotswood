// Getting around the toddler games, for the kids themselves:
//  - ⬅ in a game goes back to that game's start screen (pick another way to play),
//  - ⬅ on the start screen goes back to the Kids' Games page (pick another game),
//  - ⚙️ is for grown-ups: it asks the sum (gate.ts), then opens the settings panel.
import { askGrownUp } from './gate';

const byId = (id: string) => document.getElementById(id);

/** Open the grown-ups' settings panel (#grown) after the sum; ⚙️ is #gear. */
export function bindSettings(): void {
  const gear = byId('gear');
  const panel = byId('grown');
  if (!gear || !panel) return;
  gear.addEventListener('click', (e) => {
    e.preventDefault();
    askGrownUp(() => (panel.hidden = false), gear);
  });
  // Tap Done or outside the box to close it.
  panel.addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    if (t === panel || t.closest('.grown-done')) panel.hidden = true;
  });
}

export const closeSettings = () => {
  const panel = byId('grown');
  if (panel) panel.hidden = true;
};

/** The game's ⬅ (#home) and ⚙️. `stop` returns from the game to its start screen. */
export function bindKidsNav(stop: () => void): void {
  const back = byId('home');
  if (back) {
    // Keep the tap from reaching the game underneath.
    back.addEventListener('pointerdown', (e) => e.stopPropagation());
    back.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      stop();
    });
  }
  bindSettings();
}
