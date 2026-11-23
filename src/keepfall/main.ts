import { chooseAction, type Difficulty } from './ai';
import { card, describeCard, GEN_LABEL, RES_LABEL } from './cards';
import { canAfford, costOf, modsFor, newGame, step } from './engine';
import { EVENT_MAP, FACTIONS, FACTION_MAP, type FactionId } from './factions';
import { isMuted, setMuted, sfx, unlock } from './sound';
import { DEFAULT_RULES, RESOURCES } from './types';
import type { Action, GameState, Resource } from './types';

const rules = DEFAULT_RULES;
const HUMAN = 0 as const;
const AI = 1 as const;
const AI_DELAY = 900;

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

const ICON: Record<Resource, string> = { stone: '⛏️', mana: '🔮', steel: '⚔️' };
const TYPE_TITLE: Record<Resource, string> = { stone: 'Build', mana: 'Magic', steel: 'War' };

type FactionChoice = FactionId | 'random';
let state: GameState;
let difficulty: Difficulty = (localStorage.getItem('keepfall.difficulty') as Difficulty) ?? 'normal';
let factionChoice: FactionChoice = (localStorage.getItem('keepfall.faction') as FactionChoice) ?? 'random';
let busy = false; // true while the AI is thinking/animating

// ── Rendering ──────────────────────────────────────────────────

/** A card face. With `who`, the cost shown includes that player's faction and event modifiers. */
function cardEl(id: string, who: 0 | 1 | null): HTMLElement {
  const c = card(id);
  const el = document.createElement('div');
  el.className = `card t-${c.type}`;
  const cost = who === null ? c.cost : costOf(state, who, id);
  const costCls = cost < c.cost ? 'cheaper' : cost > c.cost ? 'pricier' : '';
  if (who !== null && !canAfford(state, who, id)) el.classList.add('unaffordable');
  el.innerHTML = `
    <div class="card-head">
      <span class="cost ${costCls}" title="Costs ${cost} ${RES_LABEL[c.type]}">${cost}<i>${ICON[c.type]}</i></span>
      <span class="ctype">${TYPE_TITLE[c.type]}</span>
    </div>
    <div class="card-name">${c.name}</div>
    <ul class="card-text">${describeCard(c).map((t) => `<li>${t}</li>`).join('')}</ul>
    ${c.flavor ? `<div class="flavor">${c.flavor}</div>` : ''}`;
  return el;
}

function renderPanel(i: 0 | 1): void {
  const p = state.players[i];
  const f = FACTION_MAP[p.faction];
  const prod = modsFor(state, i).prodDelta;
  const el = $(`panel-${i}`);
  el.classList.toggle('active', state.current === i && state.winner === null);
  el.innerHTML = `
    <h2>${p.name}</h2>
    <div class="faction-tag" title="${f.perks.join(' · ')}">${f.icon} ${f.name}</div>
    <div class="stat" data-k="tower"><span>🏰 Tower</span><b>${p.tower}</b></div>
    <div class="stat" data-k="wall"><span>🧱 Wall</span><b>${p.wall}</b></div>
    ${RESOURCES.map((r) => {
      const out = Math.max(1, p.gen[r] + prod);
      return `
      <div class="res r-${r}" data-k="${r}">
        <div class="res-gen" title="${GEN_LABEL[r]} level ${p.gen[r]}: +${out} ${RES_LABEL[r]} per turn">
          <small>${GEN_LABEL[r]}</small><b>+${out}</b>
        </div>
        <div class="res-amt"><small>${ICON[r]} ${RES_LABEL[r]}</small><b>${p.res[r]}</b></div>
      </div>`;
    }).join('')}`;
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
}

function renderHands(): void {
  const hand = $('hand');
  hand.innerHTML = '';
  const myTurn = state.current === HUMAN && state.winner === null && !busy;
  state.players[HUMAN].hand.forEach((id, index) => {
    const el = cardEl(id, HUMAN);
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

  const hint = $('hint');
  if (state.winner !== null) hint.textContent = '';
  else if (state.current === HUMAN)
    hint.textContent = 'Your turn: tap a card to play it. Greyed-out cards are too expensive; tapping one discards it.';
  else hint.textContent = 'Opponent is thinking…';
}

function renderPlayed(): void {
  const slot = $('played-slot');
  const la = state.lastAction;
  slot.innerHTML = '';
  if (!la) {
    slot.innerHTML = '<div class="slot-empty">Last card played shows here</div>';
    return;
  }
  const el = cardEl(la.cardId, null);
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
    .map((l) => `<li class="p${l.player} ${l.kind}">${l.text}</li>`)
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
  ti.textContent = state.winner !== null ? 'Game over' : state.current === HUMAN ? 'Your turn' : "Opponent's turn";
  ti.className = `turn ${state.current === HUMAN ? 'mine' : 'theirs'}`;
  $('btn-mute').textContent = isMuted() ? '🔇' : '🔊';
}

// ── Juice: floating numbers, shakes, sounds, toasts ────────────

function floatAt(target: Element, text: string, cls: string): void {
  const r = target.getBoundingClientRect();
  const f = document.createElement('div');
  f.className = `float ${cls}`;
  f.textContent = text;
  f.style.left = `${r.left + r.width / 2}px`;
  f.style.top = `${r.top + r.height / 2}px`;
  document.body.appendChild(f);
  setTimeout(() => f.remove(), 1200);
}

function toast(html: string): void {
  const t = $('toast');
  t.innerHTML = html;
  t.classList.remove('show');
  void t.offsetWidth;
  t.classList.add('show');
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
    if (b.tower < a.tower || b.wall < a.wall) {
      hit = true;
      castle.classList.remove('hit');
      void castle.offsetWidth; // restart animation
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

// ── Game flow ──────────────────────────────────────────────────

function apply(action: Action): void {
  const before = state;
  state = step(state, action, rules);
  render(); // floats include the next player's start-of-turn production too
  showDiffs(before, state);
  if (state.winner !== null) setTimeout(showGameOver, 900);
}

function act(action: Action, el?: HTMLElement): void {
  if (busy) return;
  el?.classList.add(action.kind === 'play' ? 'leaving' : 'tossing');
  busy = true;
  setTimeout(() => {
    busy = false;
    apply(action);
    maybeAiTurn();
  }, 180);
}

function maybeAiTurn(): void {
  if (state.winner !== null || state.current !== AI) return;
  busy = true;
  renderHands();
  setTimeout(() => {
    const action = chooseAction(state, difficulty, rules);
    busy = false;
    apply(action);
    maybeAiTurn(); // play-again cards
  }, AI_DELAY);
}

function randomFaction(except?: FactionId): FactionId {
  const pool = FACTIONS.filter((f) => f.id !== except);
  return pool[Math.floor(Math.random() * pool.length)].id;
}

function start(): void {
  unlock();
  sfx.click();
  const mine = factionChoice === 'random' ? randomFaction() : factionChoice;
  const theirs = randomFaction(mine);
  state = newGame({ names: ['You', 'Opponent'], factions: [mine, theirs], rules });
  $('overlay').classList.remove('show');
  $('goal-label').textContent = `Tower goal ${rules.winTower}`;
  busy = false;
  render();
  const f = FACTION_MAP[theirs];
  toast(`<div class="toast-icon">${f.icon}</div><b>vs ${f.name}</b><span>${f.perks.join(' · ')}</span>`);
  maybeAiTurn();
}

// ── Menus ──────────────────────────────────────────────────────

function showMenu(): void {
  const factionTiles = [
    ...FACTIONS.map(
      (f) => `
      <button class="faction ${factionChoice === f.id ? 'sel' : ''}" data-f="${f.id}">
        <span class="f-icon">${f.icon}</span><b>${f.name}</b>
        <small>${f.blurb}</small>
        <ul>${f.perks.map((p) => `<li>${p}</li>`).join('')}</ul>
      </button>`,
    ),
    `<button class="faction ${factionChoice === 'random' ? 'sel' : ''}" data-f="random">
      <span class="f-icon">🎲</span><b>Random</b><small>Let fate decide.</small></button>`,
  ].join('');

  $('dialog').innerHTML = `
    <h2>Keepfall</h2>
    <p class="lead">Raise your tower, crack theirs.</p>
    <div class="rules">
      <p><b>Win</b> by raising your Tower to <b>${rules.winTower}</b>, knocking the enemy Tower to <b>0</b>, or stockpiling <b>${rules.winRes}</b> of any resource.</p>
      <p>Your <b>Quarry</b>, <b>Sanctum</b> and <b>Barracks</b> produce ⛏️ Stone, 🔮 Mana and ⚔️ Steel each turn. Build cards cost Stone, Magic cards cost Mana, War cards cost Steel. Play one card or discard one. Damage hits the <b>Wall</b> before the Tower.</p>
      <p>Every ${rules.eventEvery} turns a new <b>event</b> changes the rules for both sides.</p>
    </div>
    <h3 class="pick">Choose your faction</h3>
    <div class="factions">${factionTiles}</div>
    <div class="diff">
      <span>Opponent:</span>
      ${(['easy', 'normal', 'hard'] as Difficulty[])
        .map((d) => `<button class="diff-btn ${d === difficulty ? 'sel' : ''}" data-d="${d}">${d[0].toUpperCase() + d.slice(1)}</button>`)
        .join('')}
    </div>
    <button class="primary" id="btn-start">Start battle</button>`;
  $('dialog').querySelectorAll<HTMLButtonElement>('.diff-btn').forEach((b) =>
    b.addEventListener('click', () => {
      difficulty = b.dataset.d as Difficulty;
      localStorage.setItem('keepfall.difficulty', difficulty);
      showMenu();
    }),
  );
  $('dialog').querySelectorAll<HTMLButtonElement>('.faction').forEach((b) =>
    b.addEventListener('click', () => {
      factionChoice = b.dataset.f as FactionChoice;
      localStorage.setItem('keepfall.faction', factionChoice);
      showMenu();
    }),
  );
  $('btn-start').addEventListener('click', start);
  $('overlay').classList.add('show');
}

function gameOverText(): string {
  const w = state.winner;
  if (w === 'draw') return 'Both sides won at the same moment.';
  const mine = w === HUMAN;
  switch (state.winKind) {
    case 'destroy': return mine ? 'You toppled the enemy tower.' : 'Your tower has fallen.';
    case 'tower': return mine ? `Your tower reached ${rules.winTower}.` : `Their tower reached ${rules.winTower}.`;
    case 'hoard': return mine ? `You stockpiled ${rules.winRes} of a resource.` : `They stockpiled ${rules.winRes} of a resource.`;
    default: return state.winReason ?? '';
  }
}

function showGameOver(): void {
  const w = state.winner;
  const title = w === HUMAN ? 'Victory!' : w === 'draw' ? 'Draw' : 'Defeat';
  if (w === HUMAN) sfx.win();
  else sfx.lose();
  const record = JSON.parse(localStorage.getItem('keepfall.record') ?? '{"w":0,"l":0}');
  if (w === HUMAN) record.w++;
  else if (w === AI) record.l++;
  localStorage.setItem('keepfall.record', JSON.stringify(record));
  const me = FACTION_MAP[state.players[HUMAN].faction];
  const them = FACTION_MAP[state.players[AI].faction];
  $('dialog').innerHTML = `
    <h2 class="${w === HUMAN ? 'win' : 'lose'}">${title}</h2>
    <p class="lead">${gameOverText()} (turn ${state.turn})</p>
    <p class="record">${me.icon} ${me.name} vs ${them.icon} ${them.name} · ${difficulty}</p>
    <p class="record">Your record: ${record.w} wins · ${record.l} losses</p>
    <button class="primary" id="btn-again">Play again</button>
    <button class="ghost" id="btn-menu2">Change faction or difficulty</button>`;
  $('btn-again').addEventListener('click', start);
  $('btn-menu2').addEventListener('click', showMenu);
  $('overlay').classList.add('show');
}

$('btn-menu').addEventListener('click', showMenu);
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
  render();
});

state = newGame({ rules });
render();
showMenu();
