// The battle screen: renders a game, takes the human's moves, runs the AI, reports the result.
import { chooseAction, type Difficulty } from './ai';
import { building, card, describeOp, GEN_LABEL, RES_LABEL } from './cards';
import { canAfford, costOf, modsFor, newGame, step } from './engine';
import { EVENT_MAP, FACTION_MAP, type FactionId } from './factions';
import { isMuted, setMuted, sfx, unlock } from './sound';
import { DEFAULT_RULES, RESOURCES } from './types';
import type { Action, GameState } from './types';
import { $, cardFace, esc, relicChip, toast } from './ui';

const rules = DEFAULT_RULES;
const HUMAN = 0 as const;
const AI = 1 as const;
const AI_DELAY = 900;

export interface BattleConfig {
  enemyName: string;
  factions: [FactionId, FactionId];
  difficulty: Difficulty;
  decks?: [string[], string[]];
  relics?: [string[], string[]];
  intro?: string; // extra line for the opening toast
}

let state: GameState = newGame({ rules });
let config: BattleConfig | null = null;
let onEnd: ((s: GameState) => void) | null = null;
let busy = false;
let generation = 0; // bumps on each new battle so stale AI timers do nothing

export function currentDifficulty(): Difficulty {
  return config?.difficulty ?? 'normal';
}

// ── Rendering ──────────────────────────────────────────────────

function renderPanel(i: 0 | 1): void {
  const p = state.players[i];
  const f = FACTION_MAP[p.faction];
  const prod = modsFor(state, i).prodDelta;
  const el = $(`panel-${i}`);
  el.classList.toggle('active', state.current === i && state.winner === null);
  const slots = Array.from({ length: rules.buildingSlots }, (_, k) => {
    const id = p.buildings[k];
    if (!id) return '<div class="slot empty" title="Empty building slot"></div>';
    const b = building(id);
    return `<div class="slot" title="${esc(b.name)}: ${esc(b.ops.map(describeOp).join(', '))} each turn">${b.icon}<small>${esc(b.name)}</small></div>`;
  }).join('');
  el.innerHTML = `
    <h2>${esc(p.name)}</h2>
    <div class="faction-tag" title="${esc(f.perks.join(' · '))}">${f.icon} ${f.name}</div>
    ${p.relics.length ? `<div class="relics">${p.relics.map(relicChip).join('')}</div>` : ''}
    <div class="stat" data-k="tower"><span>🏰 Tower</span><b>${p.tower}</b></div>
    <div class="stat" data-k="wall"><span>🧱 Wall</span><b>${p.wall}</b></div>
    ${RESOURCES.map((r) => {
      const out = Math.max(1, p.gen[r] + prod);
      return `
      <div class="res r-${r}" data-k="${r}">
        <div class="res-gen" title="${GEN_LABEL[r]} level ${p.gen[r]}: +${out} ${RES_LABEL[r]} per turn">
          <small>${GEN_LABEL[r]}</small><b>+${out}</b>
        </div>
        <div class="res-amt"><small>${RES_LABEL[r]}</small><b>${p.res[r]}</b></div>
      </div>`;
    }).join('')}
    <div class="slots" data-k="buildings">${slots}</div>`;
}

const TOWER_MAX_PX = 260;
const WALL_MAX = 50;

function renderCastle(i: 0 | 1): void {
  const p = state.players[i];
  const el = $(`castle-${i}`);
  const towerPx = Math.max(8, Math.min(1, p.tower / rules.winTower) * TOWER_MAX_PX);
  const wallPx = Math.min(1, p.wall / WALL_MAX) * TOWER_MAX_PX * 0.6;
  el.querySelector<HTMLElement>('.tower-body')!.style.height = `${towerPx}px`;
  el.querySelector<HTMLElement>('.tower-num')!.textContent = String(p.tower);
  const wall = el.querySelector<HTMLElement>('.wall')!;
  wall.style.height = `${wallPx}px`;
  wall.classList.toggle('gone', p.wall === 0);
  el.querySelector<HTMLElement>('.wall-num')!.textContent = p.wall ? String(p.wall) : '';
  el.querySelector<HTMLElement>('.yard')!.innerHTML = p.buildings
    .map((id) => `<span title="${esc(building(id).name)}">${building(id).icon}</span>`)
    .join('');
}

function renderHands(): void {
  const hand = $('hand');
  hand.innerHTML = '';
  const myTurn = state.current === HUMAN && state.winner === null && !busy;
  state.players[HUMAN].hand.forEach((id, index) => {
    const el = cardFace(id, { cost: costOf(state, HUMAN, id), unaffordable: !canAfford(state, HUMAN, id) });
    if (!myTurn) el.classList.add('waiting');
    el.addEventListener('click', () => myTurn && act({ kind: canAfford(state, HUMAN, id) ? 'play' : 'discard', index }, el));
    el.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      if (myTurn) act({ kind: 'discard', index }, el);
    });
    const btn = document.createElement('button');
    btn.className = 'discard-btn';
    btn.textContent = 'Discard';
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (myTurn) act({ kind: 'discard', index }, el);
    });
    el.appendChild(btn);
    hand.appendChild(el);
  });

  $('opp-hand').innerHTML = state.players[AI].hand.map(() => '<div class="card-back"></div>').join('');
  const me = state.players[HUMAN];
  $('deck-count').textContent = `Deck ${me.deck.length} · Discard ${me.discard.length}`;

  const hint = $('hint');
  if (state.winner !== null) hint.textContent = '';
  else if (state.current === HUMAN)
    hint.textContent = 'Your turn: tap a card to play it. Greyed-out cards are too expensive; tapping one discards it.';
  else hint.textContent = `${state.players[AI].name} is thinking…`;
}

function renderPlayed(): void {
  const slot = $('played-slot');
  const la = state.lastAction;
  slot.innerHTML = '';
  if (!la) {
    slot.innerHTML = '<div class="slot-empty">Last card played shows here</div>';
    return;
  }
  const el = cardFace(la.cardId);
  el.classList.add('pop', la.player === HUMAN ? 'from-me' : 'from-opp');
  if (la.kind === 'discard') el.classList.add('discarded');
  slot.appendChild(el);
  const tag = document.createElement('div');
  tag.className = 'played-by';
  tag.textContent = `${state.players[la.player].name} ${la.kind === 'play' ? 'played' : 'discarded'}`;
  slot.appendChild(tag);
}

function turnsUntilNextEvent(): number {
  if (!rules.eventEvery) return Infinity;
  return rules.eventEvery - ((state.turn - 1) % rules.eventEvery);
}

function renderEvent(): void {
  const el = $('event-banner');
  const e = state.event ? EVENT_MAP[state.event] : null;
  const next = turnsUntilNextEvent();
  const when = next === 1 ? 'next turn' : `in ${next} turns`;
  if (e) {
    el.innerHTML = `<b>${e.icon} ${e.name}</b> <span>${e.text}</span> <small>Changes ${when}</small>`;
    el.className = 'event-banner on';
  } else if (rules.eventEvery) {
    el.innerHTML = `<small>Calm skies · first event ${when}</small>`;
    el.className = 'event-banner';
  } else {
    el.className = 'event-banner hidden';
  }
}

function renderLog(): void {
  $('log-list').innerHTML = state.log
    .slice(-60)
    .reverse()
    .map((l) => `<li class="p${l.player} ${l.kind}">${esc(l.text)}</li>`)
    .join('');
}

function render(): void {
  renderPanel(0);
  renderPanel(1);
  renderCastle(0);
  renderCastle(1);
  renderHands();
  renderPlayed();
  renderEvent();
  renderLog();
  const ti = $('turn-indicator');
  ti.textContent = state.winner !== null ? 'Game over' : state.current === HUMAN ? 'Your turn' : `${state.players[AI].name}'s turn`;
  ti.className = `turn ${state.current === HUMAN ? 'mine' : 'theirs'}`;
  $('btn-mute').textContent = isMuted() ? '🔇' : '🔊';
}

// ── Juice ──────────────────────────────────────────────────────

function floatAt(target: Element, text: string, cls: string): void {
  const r = target.getBoundingClientRect();
  if (!r.width) return;
  const f = document.createElement('div');
  f.className = `float ${cls}`;
  f.textContent = text;
  f.style.left = `${r.left + r.width / 2}px`;
  f.style.top = `${r.top + r.height / 2}px`;
  document.body.appendChild(f);
  setTimeout(() => f.remove(), 1200);
}

function showDiffs(before: GameState, after: GameState): void {
  let hit = false;
  let built = false;
  ([0, 1] as const).forEach((i) => {
    const a = before.players[i];
    const b = after.players[i];
    const panel = $(`panel-${i}`);
    const castle = $(`castle-${i}`);
    const keys: [string, number, number][] = [
      ['tower', a.tower, b.tower],
      ['wall', a.wall, b.wall],
      ...RESOURCES.map((r) => [r, a.res[r], b.res[r]] as [string, number, number]),
    ];
    for (const [k, x, y] of keys) {
      if (x === y) continue;
      const el = panel.querySelector(`[data-k="${k}"]`);
      if (el) floatAt(el, y > x ? `+${y - x}` : `${y - x}`, y > x ? 'up' : 'down');
    }
    for (const r of RESOURCES) {
      if (a.gen[r] !== b.gen[r]) {
        const el = panel.querySelector(`[data-k="${r}"] .res-gen`);
        if (el) floatAt(el, `${b.gen[r] > a.gen[r] ? '+' : ''}${b.gen[r] - a.gen[r]} ${GEN_LABEL[r]}`, b.gen[r] > a.gen[r] ? 'up' : 'down');
        if (b.gen[r] > a.gen[r]) built = true;
      }
    }
    const slotsEl = panel.querySelector('[data-k="buildings"]');
    if (slotsEl) {
      const added = b.buildings.filter((id) => !a.buildings.includes(id));
      const lost = a.buildings.filter((id) => !b.buildings.includes(id));
      for (const id of added) floatAt(slotsEl, `${building(id).icon} built`, 'up');
      for (const id of lost) floatAt(slotsEl, `${building(id).icon} destroyed`, 'down');
      if (added.length) built = true;
      if (lost.length) hit = true;
    }
    if (b.tower < a.tower || b.wall < a.wall) {
      hit = true;
      castle.classList.remove('hit');
      void castle.offsetWidth;
      castle.classList.add('hit');
    }
    if (b.tower > a.tower || b.wall > a.wall) built = true;
  });

  const la = after.lastAction;
  if (la?.kind === 'discard') sfx.discard();
  else if (la) {
    sfx.card();
    if (card(la.cardId).type === 'mana') sfx.magic();
    if (hit) setTimeout(sfx.hit, 120);
    else if (built) setTimeout(sfx.build, 80);
  }

  if (after.event !== before.event && after.event) {
    const e = EVENT_MAP[after.event];
    setTimeout(() => {
      sfx.event();
      toast(`<div class="toast-icon">${e.icon}</div><b>${e.name}</b><span>${e.text}</span>`);
    }, 350);
  }
}

// ── Flow ───────────────────────────────────────────────────────

function apply(action: Action): void {
  const before = state;
  state = step(state, action, rules);
  render();
  showDiffs(before, state);
  if (state.winner !== null) {
    const done = state;
    const gen = generation;
    setTimeout(() => {
      if (gen !== generation) return;
      if (done.winner === HUMAN) sfx.win();
      else sfx.lose();
      onEnd?.(done);
    }, 900);
  }
}

function act(action: Action, el?: HTMLElement): void {
  if (busy) return;
  el?.classList.add(action.kind === 'play' ? 'leaving' : 'tossing');
  busy = true;
  const gen = generation;
  setTimeout(() => {
    if (gen !== generation) return;
    busy = false;
    apply(action);
    maybeAiTurn();
  }, 180);
}

function maybeAiTurn(): void {
  if (state.winner !== null || state.current !== AI || !config) return;
  busy = true;
  renderHands();
  const gen = generation;
  setTimeout(() => {
    if (gen !== generation) return;
    const action = chooseAction(state, config!.difficulty, rules);
    busy = false;
    apply(action);
    maybeAiTurn();
  }, AI_DELAY);
}

export function startBattle(cfg: BattleConfig, done: (s: GameState) => void): void {
  generation++;
  unlock();
  config = cfg;
  onEnd = done;
  state = newGame({
    names: ['You', cfg.enemyName],
    factions: cfg.factions,
    decks: cfg.decks,
    relics: cfg.relics,
    rules,
  });
  $('goal-label').textContent = `Tower goal ${rules.winTower}`;
  busy = false;
  render();
  const f = FACTION_MAP[cfg.factions[1]];
  toast(
    `<div class="toast-icon">${f.icon}</div><b>vs ${esc(cfg.enemyName)}</b><span>${f.name}: ${f.perks.join(' · ')}</span>` +
      (cfg.intro ? `<span>${esc(cfg.intro)}</span>` : ''),
  );
  maybeAiTurn();
}

/** Stop the current battle (e.g. when leaving for a menu). */
export function abandonBattle(): void {
  generation++;
  busy = false;
  config = null;
}

export function getState(): GameState {
  return state;
}

export function initBattleChrome(): void {
  $('btn-log').addEventListener('click', () => {
    const log = $('log');
    log.hidden = !log.hidden;
  });
  $('btn-mute').addEventListener('click', () => {
    setMuted(!isMuted());
    if (!isMuted()) {
      unlock();
      sfx.click();
    }
    $('btn-mute').textContent = isMuted() ? '🔇' : '🔊';
  });
  render();
}
