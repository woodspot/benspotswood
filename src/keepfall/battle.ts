// The battle screen: renders a game, takes the human's moves, runs the AI, reports the result.
import { chooseAction, type Difficulty } from './ai';
import { building, card, choiceOf, describeCard, describeOp, describeOption, GEN_LABEL, RES_LABEL } from './cards';
import { canAfford, costOf, modsFor, newGame, previewCard, step } from './engine';
import { EVENT_MAP, FACTION_MAP, type FactionId } from './factions';
import { isMuted, setMuted, sfx, unlock } from './sound';
import { DEFAULT_RULES, RESOURCES } from './types';
import type { Action, GameState, Op, Player } from './types';
import { $, cardFace, esc, ICON, relicChip, toast } from './ui';

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
let selected: number | null = null; // hand index picked on the action sheet
let choice = 0; // option picked for a Choose card

/** Phones and tablets: tap to select, then confirm. Mouse users click to play straight away. */
const touchLayout = () => matchMedia('(max-width: 760px), (pointer: coarse)').matches;

export function currentDifficulty(): Difficulty {
  return config?.difficulty ?? 'normal';
}

// ── Rendering ──────────────────────────────────────────────────

const KEYWORDS: [RegExp, string][] = [
  [/Ward/, '💠 Ward blocks enemy damage, spells and burns before they reach your Wall or Tower.'],
  [/Burn/, '🔥 Burn: the enemy Tower loses that much at the start of each of their turns, ignoring the Wall.'],
  [/Rubble/, '🪨 Rubble is a junk card. It does nothing, but playing it removes it from the deck.'],
  [/Combo/, '⚡ Combo: the bonus happens if you already played a card this turn.'],
  [/Play again/, '↻ Play again: take another turn straight away.'],
  [/Each turn/, '🏗️ Buildings take one of your 3 slots and act at the start of every one of your turns.'],
];

function renderPanel(i: 0 | 1): void {
  const p = state.players[i];
  const f = FACTION_MAP[p.faction];
  const prod = modsFor(state, i).prodDelta;
  const el = $(`panel-${i}`);
  el.classList.toggle('active', state.current === i && state.winner === null);
  const slots = Array.from({ length: rules.buildingSlots }, (_, k) => {
    const id = p.buildings[k];
    if (!id) return '<div class="slot empty" data-info="Empty building slot"></div>';
    const b = building(id);
    const info = `${b.icon} ${b.name}: ${b.ops.map(describeOp).join(', ')} at the start of each turn`;
    return `<div class="slot" data-info="${esc(info)}">${b.icon}<small>${esc(b.name)}</small></div>`;
  }).join('');
  const status: string[] = [];
  if (p.ward) status.push(`<div class="stat ward" data-k="ward" data-info="${esc(KEYWORDS[0][1])}"><span>💠<em> Ward</em></span><b>${p.ward}</b></div>`);
  if (p.burnTurns)
    status.push(
      `<div class="stat burn" data-k="burn" data-info="Burning: loses ${p.burn} Tower at the start of each turn for ${p.burnTurns} more turn${p.burnTurns > 1 ? 's' : ''}."><span>🔥<em> Burn</em></span><b>${p.burn}×${p.burnTurns}</b></div>`,
    );
  el.innerHTML = `
    <div class="p-head">
      <h2>${esc(p.name)}</h2>
      <span class="faction-tag" data-info="${esc(`${f.icon} ${f.name}: ${f.perks.join(' · ')}`)}">${f.icon}<em> ${f.name}</em></span>
      ${p.relics.length ? `<span class="relics">${p.relics.map(relicChip).join('')}</span>` : ''}
      ${i === AI ? `<span class="hand-count" data-info="Cards in their hand">🃏${p.hand.length}</span>` : ''}
    </div>
    <div class="p-stats">
      <div class="stat" data-k="tower"><span>🏰<em> Tower</em></span><b>${p.tower}</b></div>
      <div class="stat" data-k="wall"><span>🧱<em> Wall</em></span><b>${p.wall}</b></div>
      ${status.join('')}
    </div>
    <div class="p-res">
    ${RESOURCES.map((r) => {
      const out = Math.max(1, p.gen[r] + prod);
      return `
      <div class="res r-${r}" data-k="${r}" data-info="${esc(`${ICON[r]} ${p.res[r]} ${RES_LABEL[r]}. ${GEN_LABEL[r]} level ${p.gen[r]} makes +${out} per turn.`)}">
        <span class="r-ico">${ICON[r]}</span><span class="r-name">${RES_LABEL[r]}</span>
        <b class="res-amt">${p.res[r]}</b><small class="res-gen">+${out}</small>
      </div>`;
    }).join('')}
    </div>
    <div class="slots" data-k="buildings">${slots}</div>`;
}

const WALL_MAX = 50;

/** Tallest a tower can be drawn: whatever the battlefield leaves room for. */
function towerMaxPx(): number {
  const h = $('field').clientHeight || 370;
  return Math.max(70, Math.min(260, h - 110));
}

function renderCastle(i: 0 | 1): void {
  const p = state.players[i];
  const el = $(`castle-${i}`);
  const max = towerMaxPx();
  const towerPx = Math.max(8, Math.min(1, p.tower / rules.winTower) * max);
  const wallPx = Math.min(1, p.wall / WALL_MAX) * max * 0.6;
  el.querySelector<HTMLElement>('.tower-body')!.style.height = `${towerPx}px`;
  el.querySelector<HTMLElement>('.tower-num')!.textContent = String(p.tower);
  const wall = el.querySelector<HTMLElement>('.wall')!;
  wall.style.height = `${wallPx}px`;
  wall.classList.toggle('gone', p.wall === 0);
  el.querySelector<HTMLElement>('.wall-num')!.textContent = p.wall ? String(p.wall) : '';
  el.classList.toggle('warded', p.ward > 0);
  el.classList.toggle('burning', p.burnTurns > 0);
  el.querySelector<HTMLElement>('.yard')!.innerHTML = p.buildings
    .map((id) => `<span data-info="${esc(building(id).name)}">${building(id).icon}</span>`)
    .join('');
  $('goal-line').style.bottom = `${28 + max}px`;
}

const myTurn = () => state.current === HUMAN && state.winner === null && !busy;

function renderHands(): void {
  const hand = $('hand');
  hand.innerHTML = '';
  const mine = myTurn();
  if (!mine) selected = null;
  state.players[HUMAN].hand.forEach((id, index) => {
    const el = cardFace(id, { cost: costOf(state, HUMAN, id), unaffordable: !canAfford(state, HUMAN, id) });
    if (!mine) el.classList.add('waiting');
    if (index === selected) el.classList.add('selected');
    el.addEventListener('click', () => onCardClick(index, el));
    el.addEventListener('mouseenter', () => !touchLayout() && mine && selected === null && showPreview(id, 0));
    el.addEventListener('mouseleave', () => !touchLayout() && selected === null && clearPreview());
    el.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      if (myTurn()) act({ kind: 'discard', index }, el);
    });
    const btn = document.createElement('button');
    btn.className = 'discard-btn';
    btn.textContent = 'Discard';
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (myTurn()) act({ kind: 'discard', index }, el);
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
    hint.textContent = touchLayout()
      ? 'Your turn: tap a card to see what it does'
      : 'Your turn: click a card to play it. Hover to preview. Too expensive? Clicking discards it.';
  else hint.textContent = `${state.players[AI].name} is thinking…`;
}

function onCardClick(index: number, el: HTMLElement): void {
  if (!myTurn()) return;
  const id = state.players[HUMAN].hand[index];
  const hasChoice = !!choiceOf(card(id));
  if (touchLayout() || (hasChoice && canAfford(state, HUMAN, id))) {
    if (selected === index && !hasChoice && canAfford(state, HUMAN, id)) return confirmPlay(el); // second tap plays
    select(index);
    return;
  }
  act({ kind: canAfford(state, HUMAN, id) ? 'play' : 'discard', index }, el);
}

function select(index: number | null): void {
  selected = index;
  choice = 0;
  sfx.click();
  renderHands();
  renderSheet();
}

function confirmPlay(el?: HTMLElement): void {
  if (selected === null) return;
  const index = selected;
  const id = state.players[HUMAN].hand[index];
  const target = el ?? ($('hand').children[index] as HTMLElement | undefined);
  act(canAfford(state, HUMAN, id) ? { kind: 'play', index, choice } : { kind: 'discard', index }, target);
}

/** The panel that opens over the battlefield when a card is selected. */
function renderSheet(): void {
  const sheet = $('action-sheet');
  if (selected === null || !myTurn()) {
    sheet.hidden = true;
    sheet.innerHTML = '';
    clearPreview();
    return;
  }
  const id = state.players[HUMAN].hand[selected];
  const c = card(id);
  const cost = costOf(state, HUMAN, id);
  const affordable = canAfford(state, HUMAN, id);
  const ch = choiceOf(c);
  const lines = describeCard(c);
  const help = KEYWORDS.filter(([re]) => lines.some((l) => re.test(l))).map(([, t]) => `<li>${esc(t)}</li>`).join('');
  const body = ch
    ? `<div class="sheet-opts">${ch.options
        .map((opt: Op[], i: number) => `<button class="opt ${i === choice ? 'sel' : ''}" data-choice="${i}">${'①②③④'[i]} ${esc(describeOption(opt))}</button>`)
        .join('')}</div>`
    : `<ul class="sheet-text">${lines.map((l) => `<li>${esc(l)}</li>`).join('')}</ul>`;
  const short = cost - state.players[HUMAN].res[c.type];
  sheet.innerHTML = `
    <div class="sheet-head">
      <span class="cost t-${c.type}">${cost}${ICON[c.type]}</span>
      <b>${esc(c.name)}</b>
      <button class="sheet-x" data-sheet="close" aria-label="Close">✕</button>
    </div>
    ${body}
    ${help ? `<ul class="sheet-help">${help}</ul>` : ''}
    <div class="sheet-actions">
      ${affordable ? `<button class="primary" data-sheet="play">Play${ch ? ` option ${choice + 1}` : ''}</button>` : `<span class="short">Need ${short} more ${RES_LABEL[c.type]}</span>`}
      <button class="ghost" data-sheet="discard">Discard</button>
    </div>`;
  sheet.hidden = false;
  sheet.querySelectorAll<HTMLElement>('[data-choice]').forEach((b) => {
    b.addEventListener('click', () => {
      choice = Number(b.dataset.choice);
      sfx.click();
      renderSheet();
    });
    b.addEventListener('mouseenter', () => affordable && showPreview(id, Number(b.dataset.choice)));
    b.addEventListener('mouseleave', () => affordable && showPreview(id, choice));
  });
  sheet.querySelector('[data-sheet="close"]')!.addEventListener('click', () => select(null));
  sheet.querySelector('[data-sheet="play"]')?.addEventListener('click', () => confirmPlay());
  sheet.querySelector('[data-sheet="discard"]')!.addEventListener('click', () => {
    const index = selected!;
    act({ kind: 'discard', index }, $('hand').children[index] as HTMLElement);
  });
  if (affordable) showPreview(id, choice);
  else clearPreview();
}

// ── Effect preview: little +/− badges on everything a card would change ──

function clearPreview(): void {
  document.querySelectorAll('.delta').forEach((d) => d.remove());
}

const signed = (n: number) => (n > 0 ? `+${n}` : `${n}`);
const badge = (up: boolean, text: string) => `<i class="delta ${up ? 'up' : 'down'}">${text}</i>`;

function showPreview(cardId: string, ch: number): void {
  clearPreview();
  if (!canAfford(state, HUMAN, cardId)) return;
  const after = previewCard(state, HUMAN, cardId, ch);
  ([0, 1] as const).forEach((i) => {
    const a = state.players[i];
    const b: Player = after[i];
    const panel = $(`panel-${i}`);
    const stats = panel.querySelector('.p-stats');
    const pairs: [string, number, number][] = [
      ['tower', a.tower, b.tower],
      ['wall', a.wall, b.wall],
      ...RESOURCES.map((r) => [r, a.res[r], b.res[r]] as [string, number, number]),
    ];
    for (const [k, x, y] of pairs) if (x !== y) panel.querySelector(`[data-k="${k}"]`)?.insertAdjacentHTML('beforeend', badge(y > x, signed(y - x)));
    if (b.ward !== a.ward) (panel.querySelector('[data-k="ward"]') ?? stats)?.insertAdjacentHTML('beforeend', badge(b.ward > a.ward, `💠${signed(b.ward - a.ward)}`));
    for (const r of RESOURCES)
      if (a.gen[r] !== b.gen[r]) panel.querySelector(`[data-k="${r}"]`)?.insertAdjacentHTML('beforeend', badge(b.gen[r] > a.gen[r], `${signed(b.gen[r] - a.gen[r])}/turn`));
    if (b.burn !== a.burn) stats?.insertAdjacentHTML('beforeend', badge(false, `🔥${b.burn}×${b.burnTurns}`));
    const added = b.buildings.filter((x) => !a.buildings.includes(x)).map((x) => building(x).icon);
    const lost = a.buildings.filter((x) => !b.buildings.includes(x)).map((x) => building(x).icon);
    const slots = panel.querySelector('[data-k="buildings"]');
    if (added.length) slots?.insertAdjacentHTML('beforeend', badge(true, `+${added.join('')}`));
    if (lost.length) slots?.insertAdjacentHTML('beforeend', badge(false, `−${lost.join('')}`));
    const rubble = (p: Player) => p.deck.filter((x) => x === 'rubble').length;
    if (rubble(b) > rubble(a)) panel.querySelector('.p-head')?.insertAdjacentHTML('beforeend', badge(false, `+${rubble(b) - rubble(a)} 🪨`));
    // The castles too, so the battlefield shows the hit.
    const castle = $(`castle-${i}`);
    if (b.tower !== a.tower) castle.querySelector('.tower-num')?.insertAdjacentHTML('beforeend', badge(b.tower > a.tower, signed(b.tower - a.tower)));
    if (b.wall !== a.wall) castle.querySelector('.wall-num')?.insertAdjacentHTML('beforeend', badge(b.wall > a.wall, signed(b.wall - a.wall)));
  });
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
  tag.textContent = `${la.player === HUMAN ? 'You' : state.players[la.player].name} ${la.kind === 'play' ? 'played' : 'discarded'}`;
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
    el.dataset.info = `${e.icon} ${e.name}: ${e.text} Changes ${when}.`;
    el.className = 'event-banner on';
  } else if (rules.eventEvery) {
    el.innerHTML = `<small>Calm skies · first event ${when}</small>`;
    el.dataset.info = `Every ${rules.eventEvery} turns an event changes the rules for both sides. First one ${when}.`;
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

let lastTurnOwner: 0 | 1 | null = null;

function render(): void {
  renderPanel(0);
  renderPanel(1);
  renderCastle(0);
  renderCastle(1);
  renderHands();
  renderSheet();
  renderPlayed();
  renderEvent();
  renderLog();
  const ti = $('turn-indicator');
  ti.textContent = state.winner !== null ? 'Game over' : state.current === HUMAN ? 'Your turn' : `${state.players[AI].name}'s turn`;
  ti.className = `turn ${state.current === HUMAN ? 'mine' : 'theirs'}`;
  if (lastTurnOwner !== state.current) {
    void ti.offsetWidth;
    ti.classList.add('flash');
    lastTurnOwner = state.current;
  }
  $('btn-mute').textContent = isMuted() ? '🔇' : '🔊';
}

// ── Juice ──────────────────────────────────────────────────────

function floatAt(target: Element | null, text: string, cls: string): void {
  if (!target) return;
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
    const keys: [string, number, number][] = RESOURCES.map((r) => [r, a.res[r], b.res[r]] as [string, number, number]);
    for (const [k, x, y] of keys) if (x !== y) floatAt(panel.querySelector(`[data-k="${k}"]`), signed(y - x), y > x ? 'up' : 'down');
    // Tower and wall changes float over the castles, big enough to see on a phone.
    if (b.tower !== a.tower) floatAt(castle.querySelector('.tower-body'), signed(b.tower - a.tower), `big ${b.tower > a.tower ? 'up' : 'down'}`);
    if (b.wall !== a.wall) floatAt(castle.querySelector('.wall-num'), `🧱${signed(b.wall - a.wall)}`, b.wall > a.wall ? 'up' : 'down');
    if (b.ward !== a.ward) floatAt(castle.querySelector('.flag'), `💠${signed(b.ward - a.ward)}`, b.ward > a.ward ? 'up' : 'down');
    if (b.burn > a.burn) floatAt(castle.querySelector('.flag'), '🔥 Burning', 'down');
    for (const r of RESOURCES) {
      if (a.gen[r] !== b.gen[r]) {
        floatAt(panel.querySelector(`[data-k="${r}"]`), `${signed(b.gen[r] - a.gen[r])} ${GEN_LABEL[r]}`, b.gen[r] > a.gen[r] ? 'up' : 'down');
        if (b.gen[r] > a.gen[r]) built = true;
      }
    }
    const slotsEl = panel.querySelector('[data-k="buildings"]');
    const added = b.buildings.filter((id) => !a.buildings.includes(id));
    const lost = a.buildings.filter((id) => !b.buildings.includes(id));
    for (const id of added) floatAt(slotsEl, `${building(id).icon} built`, 'up');
    for (const id of lost) floatAt(slotsEl, `${building(id).icon} destroyed`, 'down');
    if (added.length) built = true;
    if (lost.length) hit = true;
    const rub = (p: Player) => [...p.deck, ...p.hand, ...p.discard].filter((x) => x === 'rubble').length;
    if (rub(b) > rub(a)) floatAt(panel.querySelector('.p-head'), `+${rub(b) - rub(a)} 🪨 Rubble`, 'down');
    if (b.tower < a.tower || b.wall < a.wall) {
      hit = true;
      castle.classList.remove('hit');
      void castle.offsetWidth;
      castle.classList.add('hit');
    }
    if (b.tower > a.tower || b.wall > a.wall || b.ward > a.ward) built = true;
  });

  const la = after.lastAction;
  if (la?.kind === 'discard') sfx.discard();
  else if (la) {
    sfx.card();
    if (card(la.cardId).type === 'mana') sfx.magic();
    if (hit) setTimeout(sfx.hit, 120);
    else if (built) setTimeout(sfx.build, 80);
  }
  if (hit && la?.player === AI && !isMuted()) navigator.vibrate?.(40);

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
  selected = null;
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
  selected = null;
  renderSheet();
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
  selected = null;
  lastTurnOwner = null;
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
  selected = null;
}

export function getState(): GameState {
  return state;
}

export function initBattleChrome(): void {
  // Dev builds only: poke at the live battle from the console.
  if (import.meta.env.DEV) Object.assign(window, { keepfall: { state: () => state, render } });
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
  // Tap the battlefield to put a selected card back.
  $('field').addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    // A tapped sheet button may already be gone (the sheet re-renders), so ignore detached targets.
    if (selected !== null && t.isConnected && !t.closest('.action-sheet, [data-info]')) select(null);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && selected !== null) select(null);
  });
  let resizeTimer = 0;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(() => {
      renderCastle(0);
      renderCastle(1);
      renderHands();
    }, 120);
  });
  render();
}
