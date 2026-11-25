// The Duels tab and duel battles: invite someone with a link, then take turns whenever it suits
// you. Moves go to the duel server; the other player's moves are fetched and played back slowly.
import { getState, playRemote } from './battle';
import { duelDeck, opponentName, replay, seatWinner, statusOf, type DuelDoc, type DuelStatus, type Seat } from './duel';
import {
  createDuel, DuelError, findMine, getDuel, getDuels, inviteLink, joinDuel, myDuels, myName, resignDuel, sendMoves,
  setMyName, updateMine, type MyDuel,
} from './duelnet';
import { step } from './engine';
import { FACTIONS, FACTION_MAP, type FactionId } from './factions';
import { sfx, unlock } from './sound';
import type { Action, GameState } from './types';
import { bind, esc, showDialog, toast } from './ui';
import type { BattleConfig } from './battle';

export interface DuelDeps {
  showMenu: () => void;
  battle: (cfg: BattleConfig, done: (s: GameState) => void) => void;
}
let deps: DuelDeps;

const POLL_MS = 4000; // while waiting for the other player in a duel
const LIST_POLL_MS = 20000; // while the Duels tab is open

let cache: Record<string, DuelDoc | null> = {};
let pick: FactionId = (localStorage.getItem('skyduel.faction') as FactionId) ?? FACTIONS[0].id;
if (!FACTION_MAP[pick]) pick = FACTIONS[0].id;
let listTimer = 0;

// ── The duel being played ──────────────────────────────────────

let live: {
  mine: MyDuel;
  opp: string;
  server: number; // moves the server has
  pending: Action[]; // my moves not sent yet
  sending: boolean;
  poll: number;
  over: boolean;
} | null = null;

/** In a duel battle right now (leaving one needs no warning: it's saved after every move). */
export const inDuel = () => live !== null;

export function leaveDuel(): void {
  if (live) clearTimeout(live.poll);
  live = null;
}

// ── Duels tab ──────────────────────────────────────────────────

const visible = () => myDuels().filter((m) => !m.hidden);
const statusFor = (m: MyDuel): DuelStatus | 'gone' | 'loading' => {
  const d = cache[m.id];
  if (d === undefined) return 'loading';
  if (d === null) return 'gone';
  return statusOf(d, m.seat);
};

/** How many duels are waiting on you (for the tab badge). */
export const yourTurnCount = () => visible().filter((m) => statusFor(m) === 'yours').length;

function factionTiles(): string {
  return `<div class="factions duel-factions">${FACTIONS.map(
    (f) => `<button class="faction ${f.id === pick ? 'sel' : ''}" data-act="duel-faction" data-f="${f.id}">
      <span class="f-icon">${f.icon}</span><b>${f.name}</b><small>${f.blurb}</small>
      <ul>${f.perks.map((p) => `<li>${p}</li>`).join('')}</ul></button>`,
  ).join('')}</div>`;
}

const nameField = () =>
  `<label class="duel-name">Your name <input id="duel-name" maxlength="20" placeholder="e.g. Ben" value="${esc(myName())}" autocomplete="nickname"></label>`;

export function duelsBody(): string {
  return `<p class="lead">Play a friend or family member: send them an invite link, then take turns whenever it suits you. Each of you sees the other’s moves played back.</p>
    <div id="duel-list" class="duel-list">${listHtml()}</div>
    <h3 class="pick">Start a new duel</h3>
    ${nameField()}
    ${factionTiles()}
    <button class="primary" data-act="duel-new">⚔️ Create invite</button>
    <p class="dim small">A fair fight: both players use every card in the game (Shipyard unlocks don’t count) with no captains or relics, and any faction is allowed.</p>`;
}

const LABEL: Record<DuelStatus | 'gone' | 'loading', string> = {
  yours: '🟢 Your turn',
  theirs: '⏳ Their turn',
  invite: '✉️ Invite not accepted yet',
  won: '🏆 You won',
  lost: '💥 You lost',
  draw: '🤝 Draw',
  cancelled: 'Invite withdrawn',
  gone: 'This duel has expired',
  loading: '…',
};

function listHtml(): string {
  const list = visible();
  if (!list.length) return '<p class="dim small">No duels yet. Start one below and send the invite.</p>';
  return list
    .map((m) => {
      const d = cache[m.id];
      const st = statusFor(m);
      const f = d ? [d.factions[m.seat], d.factions[(1 - m.seat) as Seat]].map((x) => (x ? FACTION_MAP[x]?.icon ?? '' : '❔')).join(' vs ') : '';
      const vs = d ? esc(opponentName(d, m.seat)) : '…';
      const turn = d && (st === 'yours' || st === 'theirs') ? ` · turn ${replay(d, m.seat).turn}` : '';
      const btns: string[] = [];
      if (st === 'yours') btns.push(`<button class="primary small" data-act="duel-open" data-id="${m.id}">Play</button>`);
      if (st === 'theirs' || st === 'won' || st === 'lost' || st === 'draw') btns.push(`<button class="ghost small" data-act="duel-open" data-id="${m.id}">View</button>`);
      if (st === 'invite') btns.push(`<button class="primary small" data-act="duel-share" data-id="${m.id}">Send invite</button>`);
      if (st === 'yours' || st === 'theirs') btns.push(`<button class="ghost small" data-act="duel-resign" data-id="${m.id}">Resign</button>`);
      if (st === 'invite') btns.push(`<button class="ghost small" data-act="duel-resign" data-id="${m.id}">Withdraw</button>`);
      if (st === 'won' || st === 'lost' || st === 'draw' || st === 'cancelled' || st === 'gone') btns.push(`<button class="ghost small" data-act="duel-hide" data-id="${m.id}">Clear</button>`);
      return `<div class="duel-row s-${st}">
        <div class="duel-info"><b>${d && st !== 'invite' ? `vs ${vs}` : `Duel ${m.id}`}</b><span>${f}</span><small>${LABEL[st]}${turn}</small></div>
        <div class="duel-btns">${btns.join('')}</div></div>`;
    })
    .join('');
}

/** Fetch every duel on the list and redraw it (and the tab badge). */
export async function refreshDuels(): Promise<void> {
  clearTimeout(listTimer);
  const ids = myDuels().filter((m) => !m.hidden).map((m) => m.id);
  try {
    cache = { ...cache, ...(await getDuels(ids)) };
  } catch {
    /* offline: keep what we had */
  }
  const el = document.getElementById('duel-list');
  if (el) {
    el.innerHTML = listHtml();
    bind(el, duelHandlers); // the redrawn buttons need wiring again
  }
  const n = yourTurnCount();
  const tab = document.querySelector<HTMLElement>('.tab[data-m="duels"]');
  if (tab) tab.innerHTML = `🤝 Duels${n ? ` <span class="badge">${n}</span>` : ''}`;
  document.title = n ? `(${n}) Sky Armada` : 'Sky Armada';
  // Keep the list fresh while it's on screen.
  if (el && !live) listTimer = window.setTimeout(() => !document.hidden && refreshDuels(), LIST_POLL_MS);
}

function readName(): string | null {
  const input = document.getElementById('duel-name') as HTMLInputElement | null;
  const name = (input?.value ?? myName()).trim();
  if (!name) {
    toast('<b>What’s your name?</b><span>So the other player knows who they’re up against.</span>');
    input?.focus();
    return null;
  }
  setMyName(name);
  return name;
}

function choose(el: HTMLElement): void {
  pick = el.dataset.f as FactionId;
  localStorage.setItem('skyduel.faction', pick);
  sfx.click();
  el.parentElement?.querySelectorAll('.faction').forEach((b) => b.classList.toggle('sel', b === el));
}

const errorText = (e: unknown) => (e instanceof DuelError ? e.message : 'Something went wrong. Try again.');

export const duelHandlers: Record<string, (el: HTMLElement) => void> = {
  'duel-faction': choose,
  'duel-new': async (el) => {
    const name = readName();
    if (!name) return;
    unlock();
    (el as HTMLButtonElement).disabled = true;
    try {
      const d = await createDuel(name, pick, duelDeck());
      cache[d.id] = d;
      sfx.confirm();
      shareDialog(d);
    } catch (e) {
      (el as HTMLButtonElement).disabled = false;
      toast(`<b>Couldn’t create the duel</b><span>${esc(errorText(e))}</span>`);
    }
  },
  'duel-share': (el) => {
    const d = cache[el.dataset.id!];
    if (d) shareDialog(d);
  },
  'duel-open': (el) => void openDuel(el.dataset.id!),
  'duel-resign': async (el) => {
    const m = findMine(el.dataset.id!);
    if (!m) return;
    const invite = statusFor(m) === 'invite';
    if (!confirm(invite ? 'Withdraw this invite?' : 'Resign this duel? The other player wins.')) return;
    try {
      cache[m.id] = await resignDuel(m);
      if (invite) updateMine(m.id, { hidden: true });
      deps.showMenu();
    } catch (e) {
      toast(`<b>Couldn’t do that</b><span>${esc(errorText(e))}</span>`);
    }
  },
  'duel-hide': (el) => {
    updateMine(el.dataset.id!, { hidden: true });
    deps.showMenu();
  },
};

// ── Invites ────────────────────────────────────────────────────

function shareDialog(d: DuelDoc): void {
  const link = inviteLink(d.id);
  const text = `${d.names[0]} challenges you to a Sky Armada duel! Tap to accept:`;
  const dlg = showDialog(`<h2>✉️ Send the invite</h2>
    <p class="lead">Send this link to the person you want to play. Whoever opens it first takes the other side.</p>
    <div class="invite-link"><code>${esc(link)}</code></div>
    <button class="primary" data-act="share">📤 Share link</button>
    <button class="ghost" data-act="copy">📋 Copy link</button>
    <button class="ghost" data-act="back">Back to duels</button>
    <p class="dim small">When they accept, the duel shows up under Duels. Whoever’s turn it is, the other one gets to wait.</p>`);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(`${text} ${link}`);
      toast('<b>📋 Link copied</b><span>Paste it into a text or email.</span>');
    } catch {
      toast(`<b>Copy this link</b><span>${esc(link)}</span>`);
    }
  };
  bind(dlg, {
    share: async () => {
      if (navigator.share) {
        try {
          await navigator.share({ title: 'Sky Armada duel', text, url: link });
        } catch {
          /* cancelled */
        }
      } else await copy();
    },
    copy: () => void copy(),
    back: () => deps.showMenu(),
  });
}

/** Someone opened an invite link: offer to accept it (or open it, if it's already one of ours). */
export async function handleInviteLink(): Promise<boolean> {
  const id = new URLSearchParams(location.search).get('duel')?.toUpperCase();
  if (!id) return false;
  history.replaceState(null, '', location.pathname);
  if (findMine(id)) {
    updateMine(id, { hidden: false });
    void openDuel(id);
    return true;
  }
  let d: DuelDoc | null;
  try {
    d = await getDuel(id);
  } catch (e) {
    toast(`<b>Couldn’t open the duel</b><span>${esc(errorText(e))}</span>`);
    return false;
  }
  if (!d || d.winner === 'cancelled') {
    toast('<b>That duel isn’t there any more</b><span>The invite may have been withdrawn or expired.</span>');
    return false;
  }
  if (d.names[1] !== null) {
    toast('<b>This duel already has two players</b><span>Ask for a new invite.</span>');
    return false;
  }
  const doc = d;
  const f = FACTION_MAP[doc.factions[0]];
  const dlg = showDialog(`<h2>⚔️ You’re challenged!</h2>
    <p class="lead"><b>${esc(doc.names[0])}</b> challenges you to a Sky Armada duel. They fly ${f.icon} ${f.name}.</p>
    <p class="dim small">Take turns whenever it suits you: you’ll each see the other’s moves played back. New to Sky Armada? Try a Quick battle first; it’s the same game.</p>
    ${nameField()}
    <h3 class="pick">Choose your faction</h3>
    ${factionTiles()}
    <button class="primary" data-act="accept">Accept the duel</button>
    <button class="ghost" data-act="no">Not now</button>`);
  bind(dlg, {
    'duel-faction': choose,
    accept: async (el) => {
      const name = readName();
      if (!name) return;
      unlock();
      (el as HTMLButtonElement).disabled = true;
      try {
        const joined = await joinDuel(id, name, pick);
        cache[id] = joined;
        sfx.confirm();
        void openDuel(id);
      } catch (e) {
        (el as HTMLButtonElement).disabled = false;
        toast(`<b>Couldn’t join</b><span>${esc(errorText(e))}</span>`);
      }
    },
    no: () => deps.showMenu(),
  });
  return true;
}

// ── Playing a duel ─────────────────────────────────────────────

export async function openDuel(id: string): Promise<void> {
  const mine = findMine(id);
  if (!mine) return;
  let d: DuelDoc | null;
  try {
    d = await getDuel(id);
  } catch (e) {
    return toast(`<b>Couldn’t load the duel</b><span>${esc(errorText(e))}</span>`);
  }
  cache[id] = d;
  if (!d) return toast('<b>That duel has expired</b>');
  if (statusOf(d, mine.seat) === 'invite') return shareDialog(d);
  if (d.resigned !== null) {
    const opp = opponentName(d, mine.seat);
    return resultDialog({ mine, opp }, d.winner === mine.seat ? 'won' : 'lost', d.resigned === mine.seat ? 'You resigned.' : `${opp} resigned.`);
  }
  unlock();
  clearTimeout(listTimer);
  const doc = d;
  const opp = opponentName(doc, mine.seat);

  // Start from what this phone has already shown, plus any of my own moves; the rest is played back.
  let at = Math.min(mine.seen, doc.actions.length);
  let start = replay(doc, mine.seat, at);
  while (at < doc.actions.length && start.current === 0 && start.winner === null) start = step(start, doc.actions[at++]);
  start.players[0].name = 'You';
  start.players[1].name = opp;

  leaveDuel();
  live = { mine, opp, server: doc.actions.length, pending: [], sending: false, poll: 0, over: false };
  const me = live;
  deps.battle(
    {
      enemyName: opp,
      factions: [start.players[0].faction, start.players[1].faction],
      difficulty: 'normal',
      start,
      intro: 'A duel: take your turn whenever you like. Your moves are sent as you play.',
      duel: { onMove: (a, after) => onMyMove(me, a, after) },
    },
    (s) => finished(me, s),
  );
  for (const a of doc.actions.slice(at)) playRemote(a);
  updateMine(id, { seen: doc.actions.length, hidden: false });
  schedulePoll(me);
}

function onMyMove(me: NonNullable<typeof live>, a: Action, after: GameState): void {
  me.pending.push(a);
  if (after.winner !== null) me.over = true;
  void flush(me, after);
}

/** Send my moves (one request at a time; retried if the connection drops). */
async function flush(me: NonNullable<typeof live>, after?: GameState): Promise<void> {
  // Keeps trying even after leaving the duel, so a move is never lost.
  if (me.sending || !me.pending.length) return;
  me.sending = true;
  const batch = [...me.pending];
  const state = after ?? getState();
  try {
    const d = await sendMoves(me.mine, me.server, batch, seatWinner(state, me.mine.seat));
    me.pending.splice(0, batch.length);
    me.server = d.actions.length;
    cache[d.id] = d;
    updateMine(me.mine.id, { seen: me.server });
  } catch (e) {
    me.sending = false;
    if (e instanceof DuelError && e.status === 409) {
      me.pending.length = 0;
      if (live !== me) return;
      toast('<b>This duel changed</b><span>Loading the latest moves…</span>');
      leaveDuel();
      return void openDuel(me.mine.id);
    }
    toast(`<b>Couldn’t send your move</b><span>${esc(errorText(e))} Retrying…</span>`);
    setTimeout(() => void flush(me), 4000);
    return;
  }
  me.sending = false;
  if (me.pending.length) void flush(me);
  else schedulePoll(me);
}

/** While it's their turn, check for their moves every few seconds. */
function schedulePoll(me: NonNullable<typeof live>): void {
  clearTimeout(me.poll);
  if (live !== me || me.over) return;
  me.poll = window.setTimeout(async () => {
    if (live !== me) return;
    const s = getState();
    if (document.hidden || s.current === 0 || me.pending.length) return schedulePoll(me);
    try {
      const d = await getDuel(me.mine.id);
      if (!d || live !== me) return;
      cache[d.id] = d;
      if (d.actions.length > me.server) {
        for (const a of d.actions.slice(me.server)) playRemote(a);
        me.server = d.actions.length;
        updateMine(me.mine.id, { seen: me.server });
        sfx.bell();
      }
      if (d.resigned !== null && d.winner !== null && getState().winner === null) return resigned(me, d);
    } catch {
      /* offline for a moment: try again */
    }
    schedulePoll(me);
  }, POLL_MS);
}

function resigned(me: NonNullable<typeof live>, d: DuelDoc): void {
  const iWon = d.winner === me.mine.seat;
  leaveDuel();
  resultDialog(me, iWon ? 'won' : 'lost', iWon ? `${me.opp} resigned.` : 'You resigned.');
}

function finished(me: NonNullable<typeof live>, s: GameState): void {
  // Make sure the winning move reached the server before leaving.
  if (me.pending.length) void flush(me, s);
  clearTimeout(me.poll);
  if (live === me) live = null;
  const r = s.winner === 'draw' ? 'draw' : s.winner === 0 ? 'won' : 'lost';
  resultDialog(me, r, s.winReason ?? '');
}

function resultDialog(me: { mine: MyDuel; opp: string }, r: 'won' | 'lost' | 'draw', why: string): void {
  const dlg = showDialog(`
    <h2 class="${r === 'won' ? 'win' : 'lose'}">${r === 'won' ? 'Victory!' : r === 'draw' ? 'Draw' : 'Defeat'}</h2>
    <p class="lead">${esc(why)}</p>
    <p class="record">Duel vs ${esc(me.opp)}</p>
    <button class="primary" data-act="rematch">⚔️ Rematch (new invite)</button>
    <button class="ghost" data-act="duels">Back to duels</button>`);
  bind(dlg, {
    rematch: async () => {
      const name = myName() || 'Captain';
      try {
        const d = await createDuel(name, pick, duelDeck());
        cache[d.id] = d;
        shareDialog(d);
      } catch (e) {
        toast(`<b>Couldn’t create the duel</b><span>${esc(errorText(e))}</span>`);
      }
    },
    duels: () => deps.showMenu(),
  });
}

export function initDuels(d: DuelDeps): void {
  deps = d;
  // Remember the name as it's typed.
  document.addEventListener('change', (e) => {
    const t = e.target as HTMLElement;
    if (t.id === 'duel-name') setMyName((t as HTMLInputElement).value);
  });
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && document.getElementById('duel-list')) void refreshDuels();
  });
}
