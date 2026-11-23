import { chooseAction, type Difficulty } from './ai';
import { card, describeCard, GEN_LABEL, RES_LABEL } from './cards';
import { canAfford, newGame, step } from './engine';
import { DEFAULT_RULES, RESOURCES } from './types';
import type { Action, GameState, Player, Resource } from './types';

const rules = DEFAULT_RULES;
const HUMAN = 0 as const;
const AI = 1 as const;
const AI_DELAY = 900;

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

const ICON: Record<Resource, string> = { stone: '⛏️', mana: '🔮', steel: '⚔️' };
const TYPE_TITLE: Record<Resource, string> = { stone: 'Build', mana: 'Magic', steel: 'War' };

let state: GameState;
let difficulty: Difficulty = (localStorage.getItem('keepfall.difficulty') as Difficulty) ?? 'normal';
let busy = false; // true while the AI is thinking/animating

// ── Rendering ──────────────────────────────────────────────────

function cardEl(id: string, p: Player | null): HTMLElement {
  const c = card(id);
  const el = document.createElement('div');
  el.className = `card t-${c.type}`;
  if (p && !canAfford(p, id)) el.classList.add('unaffordable');
  el.innerHTML = `
    <div class="card-head"><span class="cost">${c.cost}</span><span class="ctype">${ICON[c.type]} ${TYPE_TITLE[c.type]}</span></div>
    <div class="card-name">${c.name}</div>
    <ul class="card-text">${describeCard(c).map((t) => `<li>${t}</li>`).join('')}</ul>
    ${c.flavor ? `<div class="flavor">${c.flavor}</div>` : ''}`;
  return el;
}

function renderPanel(i: 0 | 1): void {
  const p = state.players[i];
  const el = $(`panel-${i}`);
  el.classList.toggle('active', state.current === i && state.winner === null);
  el.innerHTML = `
    <h2>${p.name}</h2>
    <div class="stat" data-k="tower"><span>🏰 Tower</span><b>${p.tower}</b></div>
    <div class="stat" data-k="wall"><span>🧱 Wall</span><b>${p.wall}</b></div>
    ${RESOURCES.map(
      (r) => `
      <div class="res r-${r}" data-k="${r}">
        <div class="res-gen" title="${GEN_LABEL[r]}: +${p.gen[r]} ${RES_LABEL[r]} per turn">
          <small>${GEN_LABEL[r]}</small><b>+${p.gen[r]}</b>
        </div>
        <div class="res-amt"><small>${ICON[r]} ${RES_LABEL[r]}</small><b>${p.res[r]}</b></div>
      </div>`,
    ).join('')}`;
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
  const me = state.players[HUMAN];
  const hand = $('hand');
  hand.innerHTML = '';
  const myTurn = state.current === HUMAN && state.winner === null && !busy;
  me.hand.forEach((id, index) => {
    const el = cardEl(id, me);
    if (!myTurn) el.classList.add('waiting');
    el.addEventListener('click', () => myTurn && act({ kind: canAfford(me, id) ? 'play' : 'discard', index }, el));
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

  const opp = $('opp-hand');
  opp.innerHTML = state.players[AI].hand.map(() => '<div class="card-back"></div>').join('');

  const hint = $('hint');
  if (state.winner !== null) hint.textContent = '';
  else if (state.current === HUMAN)
    hint.textContent = 'Your turn: click a card to play it. Cards you can’t afford get discarded (or right-click / Discard to drop any card).';
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
  renderLog();
  const ti = $('turn-indicator');
  ti.textContent = state.winner !== null ? 'Game over' : state.current === HUMAN ? 'Your turn' : "Opponent's turn";
  ti.className = `turn ${state.current === HUMAN ? 'mine' : 'theirs'}`;
}

// ── Juice: floating numbers and shakes ─────────────────────────

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

function showDiffs(before: GameState, after: GameState): void {
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
      }
    }
    if (b.tower < a.tower || b.wall < a.wall) {
      castle.classList.remove('hit');
      void castle.offsetWidth; // restart animation
      castle.classList.add('hit');
    }
  });
}

// ── Game flow ──────────────────────────────────────────────────

function apply(action: Action): void {
  const before = state;
  state = step(state, action, rules);
  // Floats include the next player's start-of-turn production too.
  render();
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

function start(): void {
  state = newGame({ names: ['You', 'Opponent'], rules });
  $('overlay').classList.remove('show');
  $('goal-label').textContent = `Tower goal ${rules.winTower}`;
  busy = false;
  render();
  maybeAiTurn();
}

// ── Menus ──────────────────────────────────────────────────────

function showMenu(): void {
  $('dialog').innerHTML = `
    <h2>Keepfall</h2>
    <p class="lead">Raise your tower, crack theirs.</p>
    <div class="rules">
      <p><b>Win</b> by raising your Tower to <b>${rules.winTower}</b>, knocking the enemy Tower to <b>0</b>, or stockpiling <b>${rules.winRes}</b> of any resource.</p>
      <p>Each turn your <b>Quarry</b>, <b>Sanctum</b> and <b>Barracks</b> produce Stone, Mana and Steel. Play one card you can afford, or discard one. Damage hits the <b>Wall</b> before the Tower.</p>
    </div>
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
  const record = JSON.parse(localStorage.getItem('keepfall.record') ?? '{"w":0,"l":0}');
  if (w === HUMAN) record.w++;
  else if (w === AI) record.l++;
  localStorage.setItem('keepfall.record', JSON.stringify(record));
  $('dialog').innerHTML = `
    <h2 class="${w === HUMAN ? 'win' : 'lose'}">${title}</h2>
    <p class="lead">${gameOverText()} (turn ${state.turn})</p>
    <p class="record">Your record: ${record.w} wins · ${record.l} losses</p>
    <button class="primary" id="btn-again">Play again</button>
    <button class="ghost" id="btn-menu2">Change difficulty</button>`;
  $('btn-again').addEventListener('click', start);
  $('btn-menu2').addEventListener('click', showMenu);
  $('overlay').classList.add('show');
}

$('btn-menu').addEventListener('click', showMenu);
$('btn-log').addEventListener('click', () => {
  const log = $('log');
  log.hidden = !log.hidden;
});

state = newGame({ rules });
render();
showMenu();
