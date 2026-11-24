// First-battle tips: short one-time pointers that appear the first time each thing matters,
// next to the thing they explain. "Got it" hides one; "No more tips" turns them all off.
import type { GameState } from './types';

interface Tip {
  id: string;
  anchor: string; // CSS selector of what the tip points at
  text: string;
  when: (s: GameState) => boolean;
}

const TIPS: Tip[] = [
  { id: 'altitude', anchor: '#ship-0 .alt-num', text: 'This number is your Altitude. Climb to 50 to reach the high harbor and win, or knock the enemy ship down to 0.', when: () => true },
  { id: 'armor', anchor: '#panel-0 [data-k="wall"]', text: 'Armor soaks up damage before your Altitude drops. Spells and Burns skip past it.', when: () => true },
  { id: 'resources', anchor: '#panel-0 .p-res', text: 'You earn Iron, Aether and Powder at the start of every turn. Each card costs the resource shown on its corner.', when: () => true },
  { id: 'cards', anchor: '#hand', text: 'Tap a card to see exactly what it would do, then play it. Can’t afford one? Discard it to draw a new card.', when: () => true },
  { id: 'lastturn', anchor: '#last-turn', text: 'Missed something? Everything from the last turn is listed here, with before → after numbers. Tap it for the full battle log.', when: (s) => s.turn > 2 },
  { id: 'speed', anchor: '#btn-speed', text: 'Moves too quick (or too slow)? Change the battle speed here.', when: (s) => s.turn > 4 },
  { id: 'module', anchor: '#panel-0 .slots, #panel-1 .slots', text: 'Modules stay aboard after they’re played and act at the start of every turn. Tap one to see what it does.', when: (s) => s.players.some((p) => p.buildings.length > 0) },
  { id: 'weather', anchor: '#event-banner', text: 'The weather changes the rules for both ships every few turns. Tap the banner to read it again.', when: (s) => !!s.event },
  { id: 'ward', anchor: '[data-k="ward"]', text: 'Ward is a shield that blocks damage, spells and burns before they touch Armor or Altitude.', when: (s) => s.players.some((p) => p.ward > 0) },
  { id: 'burn', anchor: '[data-k="burn"]', text: 'A burning ship loses Altitude at the start of each of its turns, straight past its Armor.', when: (s) => s.players.some((p) => p.burnTurns > 0) },
  { id: 'power', anchor: '#power-btn', text: 'Your captain’s power: use it once per battle, and it doesn’t end your turn.', when: (s) => !!s.players[0].captain },
];

const SEEN_KEY = 'keepfall.tips';
const OFF_KEY = 'keepfall.tipsOff';
const seen = (): string[] => JSON.parse(localStorage.getItem(SEEN_KEY) ?? '[]');
const tipsOff = () => localStorage.getItem(OFF_KEY) === '1';

let getState: () => GameState;
let isMyTurn: () => boolean;
let isBusy: () => boolean;
let current: Tip | null = null;

export function initTips(state: () => GameState, myTurn: () => boolean, busy: () => boolean): void {
  getState = state;
  isMyTurn = myTurn;
  isBusy = busy;
  const el = document.getElementById('tip')!;
  el.addEventListener('click', (e) => {
    const act = (e.target as HTMLElement).closest<HTMLElement>('[data-tip]')?.dataset.tip;
    if (!act || !current) return;
    if (act === 'off') localStorage.setItem(OFF_KEY, '1');
    localStorage.setItem(SEEN_KEY, JSON.stringify([...new Set([...seen(), current.id])]));
    hideTip();
    if (act === 'ok') setTimeout(maybeTip, 400);
  });
  addEventListener('resize', () => current && place(current));
}

/** Turn tips back on and show them all again (from the How to play section). */
export function resetTips(): void {
  localStorage.removeItem(SEEN_KEY);
  localStorage.removeItem(OFF_KEY);
}

export const tipsEnabled = () => !tipsOff();

export function hideTip(): void {
  current = null;
  const el = document.getElementById('tip');
  if (el) el.hidden = true;
}

function place(tip: Tip): boolean {
  const target = [...document.querySelectorAll<HTMLElement>(tip.anchor)].find((t) => t.getBoundingClientRect().width > 0);
  if (!target) return false;
  const el = document.getElementById('tip')!;
  const r = target.getBoundingClientRect();
  el.hidden = false;
  const w = Math.min(280, innerWidth - 20);
  el.style.width = `${w}px`;
  const left = Math.max(10, Math.min(innerWidth - w - 10, r.left + r.width / 2 - w / 2));
  const below = r.bottom + el.offsetHeight + 14 < innerHeight;
  el.style.left = `${left}px`;
  el.style.top = below ? `${r.bottom + 10}px` : `${Math.max(10, r.top - el.offsetHeight - 10)}px`;
  el.dataset.side = below ? 'below' : 'above';
  el.style.setProperty('--arrow', `${Math.max(16, Math.min(w - 16, r.left + r.width / 2 - left))}px`);
  return true;
}

/** Show the next tip that applies right now, if any (only on your turn, between moves). */
export function maybeTip(): void {
  if (!getState || tipsOff() || current || !isMyTurn() || isBusy()) return;
  if (document.getElementById('overlay')?.classList.contains('show')) return;
  const done = seen();
  const s = getState();
  for (const tip of TIPS) {
    if (done.includes(tip.id) || !tip.when(s)) continue;
    const el = document.getElementById('tip')!;
    el.innerHTML = `<p>💡 ${tip.text}</p><div><button data-tip="ok">Got it</button><button data-tip="off" class="tip-off">No more tips</button></div>`;
    current = tip;
    if (place(tip)) return;
    current = null;
    el.hidden = true;
  }
}
