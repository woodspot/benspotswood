// The family sticker book. Every kids' game can give a sticker; they all go into that child's book
// in Hoot's Trail, where they're stuck into the world pictures. Players (one per child) are the
// Hoot's Trail players, saved on this device and shared by family sync.
import { drawing } from './art';
import { en, say, sfx, type Part } from './audio';
import { burst, CONFETTI } from './fx';
import { getLang } from './lang';
import { hasSound } from './sounds';
import { IN_BOOK, newPlayer, newSticker, STICKER_SOUND, STICKERS, stickerParts, type Player } from '../trail/game';
import type { Pic } from '../match/game';

const ROSTER_KEY = 'trail.roster';
export const playerKey = (id: string) => `trail.p.${id}`;

export function loadPlayers(): Player[] {
  let ids: string[] = [];
  try {
    ids = JSON.parse(localStorage.getItem(ROSTER_KEY) ?? '[]');
  } catch { /* start fresh */ }
  const list = ids
    .map((id) => {
      try {
        return { ...newPlayer('🐯', id), ...JSON.parse(localStorage.getItem(playerKey(id)) ?? 'null') } as Player;
      } catch {
        return null;
      }
    })
    .filter((p): p is Player => !!p);
  if (list.length) return list;
  // First time: two players, one each.
  const twins = [newPlayer('🐯'), newPlayer('🐼')];
  twins.forEach(savePlayer);
  saveRoster(twins);
  return twins;
}
export const savePlayer = (p: Player) => localStorage.setItem(playerKey(p.id), JSON.stringify(p));
export const saveRoster = (list: Player[]) => localStorage.setItem(ROSTER_KEY, JSON.stringify(list.map((p) => p.id)));

/** A sticker's name, with the animal's real sound first when there is one. */
export function stickerPartsWithSound(e: string): Part[] {
  const pic = STICKERS.find((s) => s.e === e);
  if (!pic) return [];
  const id = STICKER_SOUND[e];
  const name = stickerParts(pic, getLang());
  return id && hasSound(id) ? [{ ...en(pic.name), sound: id }, ...name] : name;
}

/** Put a new sticker in a player's book (one they don't have yet, while there are any). */
export function giveSticker(p: Player, rng: () => number = Math.random): Pic {
  const s = newSticker(p.stickers, rng);
  if (!p.stickers.includes(s.e)) p.stickers.push(s.e);
  return s;
}


// ── The sticker moment, for games other than Hoot's Trail ──────

/** Stickers come with a game's big parties, but not more often than this (so play isn't interrupted). */
const GAP_MS = 90_000;
let lastAward = 0;
const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const talk = (parts: Part[], min = 600, max = 6000) => Promise.race([Promise.all([say(parts), wait(min)]), wait(max)]);
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);

/**
 * A present to open with a sticker inside: "Who's playing?" (when there's more than one child),
 * then the sticker, which goes in that child's book. Calls done() when it's closed.
 */
export function awardSticker(done: () => void, opts: { always?: boolean } = {}): void {
  if (!opts.always && Date.now() - lastAward < GAP_MS) return done();
  lastAward = Date.now();
  const players = loadPlayers();
  const box = document.createElement('div');
  box.className = 'reward award';
  document.body.append(box);
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    box.remove();
    done();
  };
  box.addEventListener('pointerdown', (e) => e.stopPropagation());

  const reveal = async (p: Player) => {
    const s = giveSticker(p);
    savePlayer(p);
    box.innerHTML = `<div class="sticker-big">${drawing(s.e)}</div>
      <p class="in-book"><span>${drawing(p.avatar)}</span>📒 ${p.stickers.length}</p>`;
    const r = box.querySelector('.sticker-big')!.getBoundingClientRect();
    burst(document.body, r.left + r.width / 2, r.top + r.height / 2, CONFETTI, 34, 180);
    sfx.yay();
    await talk([...stickerPartsWithSound(s.e), en(IN_BOOK)], 1500, 9000);
    if (closed) return;
    box.insertAdjacentHTML('beforeend', '<p class="tap-on">👆</p>');
    box.onclick = close;
  };

  const ask = () => {
    if (players.length === 1) return void reveal(players[0]);
    box.innerHTML = `<div class="who">${players
      .map((p) => `<button class="who-btn" data-id="${p.id}"><span>${drawing(p.avatar)}</span>${p.name ? `<small>${esc(p.name)}</small>` : ''}</button>`)
      .join('')}</div>`;
    void say("Who's playing?");
    box.onclick = (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>('[data-id]');
      const p = b && players.find((x) => x.id === b.dataset.id);
      if (!p) return;
      box.onclick = null;
      void reveal(p);
    };
  };

  box.innerHTML = '<div class="present" role="button" aria-label="Open the present">🎁</div>';
  sfx.fanfare();
  void say([en('You got a sticker!'), en('Tap the present!')]);
  box.onclick = () => {
    box.onclick = null;
    sfx.pop();
    ask();
  };
}
