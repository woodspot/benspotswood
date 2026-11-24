// The battle screen: renders a game, takes the human's moves, runs the AI, reports the result.
import { chooseAction, type Difficulty } from './ai';
import { building, card, choiceOf, describeCard, describeOp, describeOption, GEN_LABEL, RES_LABEL } from './cards';
import { canAfford, costOf, modsFor, newGame, previewCard, step, type CaptainSetup } from './engine';
import { CAPTAIN_MAP } from './captains';
import { hasClips, say, unlock as unlockVoice, type Part } from '../kids/audio';
import { EVENT_MAP, FACTION_MAP, type FactionId } from './factions';
import { getVolumes, isMuted, setMuted, setStormy, setVolumes, sfx, startAmbience, stopAmbience, unlock } from './sound';
import { DEFAULT_RULES, RESOURCES } from './types';
import type { Action, Beat, GameState, Op, Player, Rules } from './types';
import { hideTip, initTips, maybeTip } from './tips';
import { buildShip, setPlates } from './ship';
import { $, cardFace, esc, ICON, relicChip, toast } from './ui';

let rules: Rules = DEFAULT_RULES; // per battle: some campaign fights change the weather more often
const HUMAN = 0 as const;
const AI = 1 as const;

export interface BattleConfig {
  enemyName: string;
  factions: [FactionId, FactionId];
  difficulty: Difficulty;
  decks?: [string[], string[]];
  relics?: [string[], string[]];
  intro?: string; // extra line for the opening toast
  captain?: CaptainSetup; // the human's captain (campaigns)
  eventEvery?: number; // weather changes this often (default 6 turns)
  taunt?: Part[]; // spoken at the start (natural voice clips only)
}

/** Voice lines play only when a natural voice clip exists (no robotic device speech in battles). */
export function voice(parts: Part[]): void {
  if (!isMuted() && hasClips(parts)) void say(parts);
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
  [/Ward/, '💠 Ward blocks enemy damage, spells and burns before they reach your Armor or Altitude.'],
  [/Burn/, '🔥 Burn: the enemy ship loses that much Altitude at the start of each of their turns, ignoring Armor.'],
  [/Junk/, '🗑️ Junk is a dud card. It does nothing, but playing it removes it from the deck.'],
  [/Combo/, '⚡ Combo: the bonus happens if you already played a card this turn.'],
  [/Play again/, '↻ Play again: take another turn straight away.'],
  [/Module/, '🔧 Modules stay aboard after you play them: each takes one of your 3 module slots and acts at the start of every one of your turns. A 4th module replaces your oldest.'],
];

const ALT_INFO = '🎈 Altitude: how high the ship flies. Reach 50 to win (the high harbor); at 0 the ship goes down. Damage only reaches it once the Armor is gone, but spells and Burns hit it directly.';
const ARMOR_INFO = '🛡️ Armor: plating that soaks up damage before Altitude drops. Spells and Burns go straight past it.';

/** What a module does, in a sentence. */
const moduleInfo = (id: string) => {
  const b = building(id);
  return `${b.icon} ${b.name} (module): ${b.ops.map(describeOp).join(', ')} at the start of each of its owner's turns.`;
};

function renderPanel(i: 0 | 1): void {
  const p = state.players[i];
  const f = FACTION_MAP[p.faction];
  const prod = modsFor(state, i).prodDelta;
  const el = $(`panel-${i}`);
  el.classList.toggle('active', state.current === i && state.winner === null);
  const slots = Array.from({ length: rules.buildingSlots }, (_, k) => {
    const id = p.buildings[k];
    if (!id) return '<div class="slot empty" data-info="Empty module slot"></div>';
    const b = building(id);
    return `<div class="slot" data-info="${esc(moduleInfo(id))}">${b.icon}<small>${esc(b.name)}</small></div>`;
  }).join('');
  const status: string[] = [];
  if (p.ward) status.push(`<div class="stat ward" data-k="ward" data-info="${esc(KEYWORDS[0][1])}"><span>💠<em> Ward</em></span><b>${p.ward}</b></div>`);
  if (p.burnTurns)
    status.push(
      `<div class="stat burn" data-k="burn" data-info="Burning: loses ${p.burn} Altitude at the start of each turn for ${p.burnTurns} more turn${p.burnTurns > 1 ? 's' : ''}."><span>🔥<em> Burn</em></span><b>${p.burn}×${p.burnTurns}</b></div>`,
    );
  el.innerHTML = `
    <div class="p-head">
      <h2>${esc(p.name)}</h2>
      <span class="faction-tag" data-info="${esc(`${f.icon} ${f.name}: ${f.perks.join(' · ')}`)}">${f.icon}<em> ${f.name}</em></span>
      ${p.relics.length ? `<span class="relics">${p.relics.map(relicChip).join('')}</span>` : ''}
      ${i === AI ? `<span class="hand-count" data-info="Cards in their hand">🃏${p.hand.length}</span>` : ''}
    </div>
    <div class="p-stats">
      <div class="stat" data-k="tower" data-info="${esc(ALT_INFO)}"><span>🎈<em> Altitude</em></span><b>${p.tower}</b></div>
      <div class="stat" data-k="wall" data-info="${esc(ARMOR_INFO)}"><span>🛡️<em> Armor</em></span><b>${p.wall}</b></div>
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

const SEA = 26; // px of sea at the bottom of the battlefield

/** How far a ship can climb on screen: whatever the battlefield leaves room for. */
function climbPx(shipH: number): number {
  const h = $('field').clientHeight || 370;
  return Math.max(30, h - SEA - shipH - 24);
}

/** Ships fly higher the more Altitude they have; 0 is in the sea, the goal is at the top. */
function renderShip(i: 0 | 1): void {
  const p = state.players[i];
  const el = $(`ship-${i}`);
  if (!el.firstElementChild) buildShip(el);
  const shipH = el.offsetHeight || 120;
  const climb = climbPx(shipH);
  const frac = Math.max(0, Math.min(1, p.tower / rules.winTower));
  el.style.bottom = `${SEA - shipH * 0.12 + frac * climb}px`;
  el.classList.toggle('sunk', p.tower <= 0);
  el.querySelector<HTMLElement>('.alt-num')!.textContent = String(p.tower);
  el.querySelector<HTMLElement>('.alt-num')!.dataset.info = ALT_INFO;
  el.querySelector<HTMLElement>('.armor-num')!.dataset.info = ARMOR_INFO;
  el.querySelector<HTMLElement>('.armor-num')!.textContent = p.wall ? `🛡️${p.wall}` : '';
  setPlates(el, p.wall);
  el.classList.toggle('warded', p.ward > 0);
  el.classList.toggle('burning', p.burnTurns > 0);
  el.querySelector<HTMLElement>('.modules')!.innerHTML = p.buildings
    .map((id) => `<span data-info="${esc(moduleInfo(id))}">${building(id).icon}</span>`)
    .join('');
  const shadow = $(`shadow-${i}`);
  shadow.style.opacity = String(0.55 - frac * 0.4);
  shadow.style.transform = `scaleX(${1 - frac * 0.5})`;
  $('goal-line').style.bottom = `${SEA - shipH * 0.12 + climb + shipH * 0.9}px`;
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
  renderPower();

  const hint = $('hint');
  if (state.winner !== null) hint.textContent = '';
  else if (state.current === HUMAN)
    hint.textContent = touchLayout()
      ? 'Your turn: tap a card to see what it does'
      : 'Your turn: click a card to play it. Hover to preview. Too expensive? Clicking discards it.';
  else hint.textContent = `${state.players[AI].name} is thinking…`;
}

/** The captain's power button: once per battle (twice at level 5), doesn't end your turn. */
function renderPower(): void {
  const btn = $('power-btn') as HTMLButtonElement;
  const cap = state.players[HUMAN].captain;
  const def = cap && CAPTAIN_MAP[cap.id];
  btn.hidden = !def;
  if (!def || !cap) return;
  btn.disabled = !myTurn() || cap.uses <= 0;
  btn.innerHTML = `<span class="pw-icon">${def.icon}</span><span class="pw-name">${esc(def.power.name)}</span><span class="pw-uses">${cap.uses > 0 ? '×' + cap.uses : 'used'}</span>`;
  btn.dataset.info = `${def.icon} ${def.name}: ${def.power.name}: ${def.power.text(cap.level)}. Doesn't use up your turn.`;
}

function usePower(): void {
  const cap = state.players[HUMAN].captain;
  if (!myTurn() || !cap || cap.uses <= 0) return;
  const def = CAPTAIN_MAP[cap.id];
  sfx.power();
  voice([{ text: def.shout, lang: 'en', voice: def.voice }]);
  toast(`<div class="toast-icon">${def.icon}</div><b>${esc(def.power.name)}!</b><span>${esc(def.power.text(cap.level))}</span>`);
  act({ kind: 'power' });
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
    if (rubble(b) > rubble(a)) panel.querySelector('.p-head')?.insertAdjacentHTML('beforeend', badge(false, `+${rubble(b) - rubble(a)} 🗑️`));
    // The ships too, so the battlefield shows the hit.
    const ship = $(`ship-${i}`);
    if (b.tower !== a.tower) ship.querySelector('.alt-num')?.insertAdjacentHTML('beforeend', badge(b.tower > a.tower, signed(b.tower - a.tower)));
    if (b.wall !== a.wall) ship.querySelector('.armor-num')?.insertAdjacentHTML('beforeend', badge(b.wall > a.wall, `🛡️${signed(b.wall - a.wall)}`));
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

let lastTurnOwner: 0 | 1 | null = null;

function render(): void {
  renderPanel(0);
  renderPanel(1);
  renderShip(0);
  renderShip(1);
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

// ── Pace: how long each effect stays on screen ─────────────────

type Speed = 'slow' | 'normal' | 'fast';
const SPEEDS: Speed[] = ['slow', 'normal', 'fast'];
const PACE: Record<Speed, number> = { slow: 1.7, normal: 1, fast: 0.35 };
const SPEED_LABEL: Record<Speed, [string, string]> = { slow: ['🐢', 'Slow'], normal: ['▶️', 'Normal'], fast: ['⏩', 'Fast'] };
let speed: Speed = (localStorage.getItem('keepfall.speed') as Speed) || 'normal';
const wait = (n: number) => new Promise<void>((r) => setTimeout(r, Math.round(n * PACE[speed])));

function renderSpeed(): void {
  const [icon, label] = SPEED_LABEL[speed];
  $('btn-speed').innerHTML = `<span class="ico">${icon}</span><span class="lbl">${label}</span>`;
  $('btn-speed').title = `Battle speed: ${label} (tap to change)`;
}

// ── What happened: captions, the last-turn strip and the log ───

interface Line {
  turn: number;
  player: 0 | 1;
  icon: string;
  text: string;
}
let history: Line[] = []; // the whole battle, oldest first
let roundLines: Line[] = []; // since the opponent last started a turn

const whose = (i: 0 | 1) => (i === HUMAN ? 'your' : 'their');
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const junkCount = (p: Player) => [...p.deck, ...p.hand, ...p.discard].filter((x) => x === 'rubble').length;

/** Plain-English list of what changed between two moments, e.g. "your Armor 10→1". */
function changes(a: [Player, Player], b: [Player, Player], only?: 0 | 1): string[] {
  const out: string[] = [];
  for (const i of [0, 1] as const) {
    if (only !== undefined && i !== only) continue;
    const x = a[i];
    const y = b[i];
    const w = whose(i);
    const num = (label: string, p: number, q: number) => p !== q && out.push(`${w} ${label} ${p}→${q}`);
    num('Altitude', x.tower, y.tower);
    num('Armor', x.wall, y.wall);
    num('Ward', x.ward, y.ward);
    for (const r of RESOURCES) num(RES_LABEL[r], x.res[r], y.res[r]);
    for (const r of RESOURCES) num(GEN_LABEL[r], x.gen[r], y.gen[r]);
    if (y.burnTurns > 0 && (y.burn !== x.burn || y.burnTurns > x.burnTurns)) out.push(`${w} ship is burning (${y.burn} a turn for ${y.burnTurns} turns)`);
    for (const id of y.buildings.filter((m) => !x.buildings.includes(m))) out.push(`${w} new module ${building(id).icon} ${building(id).name}`);
    for (const id of x.buildings.filter((m) => !y.buildings.includes(m))) out.push(`${w} ${building(id).icon} ${building(id).name} is destroyed`);
    const j = junkCount(y) - junkCount(x);
    if (j > 0) out.push(`${j} Junk shuffled into ${w} deck`);
  }
  return out;
}

function describeBeat(b: Beat, prev: [Player, Player]): Line {
  const actor = b.player === HUMAN ? 'You' : state.players[AI].name;
  const owner = b.player === HUMAN ? 'Your' : 'Their';
  const ch = changes(prev, b.after);
  const tail = ch.length ? `: ${ch.join(', ')}` : '';
  let text: string;
  switch (b.kind) {
    case 'card': text = `${actor} played ${b.name}${tail}`; break;
    case 'discard': text = `${actor} discarded ${b.name}`; break;
    case 'power': text = `${actor} used ${b.name}${tail}`; break;
    case 'income': {
      const gains = RESOURCES.map((r) => b.after[b.player].res[r] - prev[b.player].res[r]).map((d, k) => `+${d} ${RES_LABEL[RESOURCES[k]]}`);
      text = `${owner} income: ${gains.join(', ')}`;
      break;
    }
    case 'module': text = `${owner} module ${b.name}${tail}`; break;
    case 'relic': text = `${b.name} (${b.player === HUMAN ? 'yours' : 'theirs'})${tail}`; break;
    case 'burn': text = `${owner} ship burns${tail}`; break;
    case 'weather': text = `The weather changes: ${b.name}. ${b.text}`; break;
  }
  return { turn: state.turn, player: b.player, icon: b.kind === 'card' || b.kind === 'discard' ? (b.player === HUMAN ? '🟢' : '🔴') : b.icon, text: cap(text) };
}

function narrate(line: Line, record = true): void {
  const n = $('narration');
  n.innerHTML = `<span class="nar-icon">${line.icon}</span><span>${esc(line.text)}</span>`;
  n.className = `narration p${line.player}`;
  void n.offsetWidth;
  n.classList.add('show');
  if (!record) return;
  history.push(line);
  roundLines.push(line);
  renderLastTurn();
  renderLog();
}

function renderLastTurn(): void {
  const el = $('last-turn');
  el.innerHTML = roundLines.length
    ? `<b>Last turn</b>${roundLines.map((l) => `<span class="lt p${l.player}">${l.icon} ${esc(l.text)}</span>`).join('')}`
    : '<b>Last turn</b><span class="lt dim">Nothing yet. Every move will be listed here.</span>';
  el.scrollLeft = el.scrollWidth;
}

function renderLog(): void {
  let lastTurn = -1;
  $('log-list').innerHTML = [...history]
    .reverse()
    .map((l) => {
      const head = l.turn !== lastTurn ? `<li class="log-turn">Turn ${l.turn}</li>` : '';
      lastTurn = l.turn;
      return `${head}<li class="p${l.player}">${l.icon} ${esc(l.text)}</li>`;
    })
    .join('') || '<li class="dim">Nothing has happened yet.</li>';
}

// ── Juice for one effect: floating numbers, shakes and sounds ──

function effects(prev: [Player, Player], next: [Player, Player], b: Beat): void {
  let hitMe = false;
  const loss: [number, number] = [0, 0]; // Altitude lost per ship
  const dent: [boolean, boolean] = [false, false]; // Armor lost per ship
  const gain: [boolean, boolean] = [false, false]; // Armor/Altitude gained per ship
  const fitted: [boolean, boolean] = [false, false]; // a module installed
  const shield: [boolean, boolean] = [false, false];
  ([0, 1] as const).forEach((i) => {
    const a = prev[i];
    const c = next[i];
    const panel = $(`panel-${i}`);
    const ship = $(`ship-${i}`);
    for (const r of RESOURCES) if (a.res[r] !== c.res[r]) floatAt(panel.querySelector(`[data-k="${r}"]`), signed(c.res[r] - a.res[r]), c.res[r] > a.res[r] ? 'up' : 'down');
    if (c.tower !== a.tower) floatAt(ship.querySelector('.alt-num'), signed(c.tower - a.tower), `big ${c.tower > a.tower ? 'up' : 'down'}`);
    if (c.wall !== a.wall) floatAt(ship.querySelector('.ship-svg'), `🛡️${signed(c.wall - a.wall)}`, c.wall > a.wall ? 'up' : 'down');
    if (c.ward !== a.ward) floatAt(ship.querySelector('.ship-body'), `💠${signed(c.ward - a.ward)}`, c.ward > a.ward ? 'up' : 'down');
    if (c.burnTurns > a.burnTurns || (c.burnTurns && c.burn > a.burn)) floatAt(ship.querySelector('.ship-body'), '🔥 Burning', 'down');
    for (const r of RESOURCES)
      if (a.gen[r] !== c.gen[r]) floatAt(panel.querySelector(`[data-k="${r}"]`), `${signed(c.gen[r] - a.gen[r])} ${GEN_LABEL[r]}`, c.gen[r] > a.gen[r] ? 'up' : 'down');
    const slotsEl = panel.querySelector('[data-k="buildings"]');
    for (const id of c.buildings.filter((m) => !a.buildings.includes(m))) floatAt(slotsEl, `${building(id).icon} installed`, 'up');
    for (const id of a.buildings.filter((m) => !c.buildings.includes(m))) floatAt(slotsEl, `${building(id).icon} destroyed`, 'down');
    const j = junkCount(c) - junkCount(a);
    if (j > 0) floatAt(panel.querySelector('.p-head'), `+${j} 🗑️ Junk`, 'down');
    loss[i] = Math.max(0, a.tower - c.tower);
    dent[i] = c.wall < a.wall;
    gain[i] = c.tower > a.tower || c.wall > a.wall;
    fitted[i] = c.buildings.some((m) => !a.buildings.includes(m));
    shield[i] = c.ward > a.ward;
    if (c.tower < a.tower || c.wall < a.wall) {
      if (i === HUMAN) hitMe = true;
      ship.classList.remove('hit');
      void ship.offsetWidth;
      ship.classList.add('hit');
    }
  });
  const type = b.cardId ? card(b.cardId).type : undefined;
  if (b.kind === 'discard') sfx.discard();
  if (b.kind === 'card') {
    if (b.player === HUMAN) sfx.card();
    if (type === 'mana') sfx.magic(b.player);
  }
  if (b.kind === 'power' && b.player === AI) sfx.power();
  if (b.kind === 'weather') {
    sfx.event(isStormy(b.event));
    setStormy(isStormy(b.event));
    toast(`<div class="toast-icon">${b.icon}</div><b>${esc(b.name)}</b><span>${esc(b.text ?? '')}</span>`);
  }
  if (b.kind === 'income') {
    if (b.player === HUMAN) sfx.bell(); // the ship's bell: your turn
    return;
  }
  // Each ship gets its own sound, placed on its side: cannon fire (or a crackling zap for
  // Aether attacks) where Altitude drops, clanging plates where only Armor takes it,
  // hammering where a ship is repaired, a clunk where a module is fitted.
  for (const i of [0, 1] as const) {
    const d = 110 + i * 60;
    if (loss[i] > 0) setTimeout(() => (type === 'mana' || b.kind === 'relic' ? sfx.spell(loss[i], i) : sfx.hit(loss[i] + (dent[i] ? 3 : 0), i)), d);
    else if (dent[i]) setTimeout(() => sfx.armor(i), d);
    else if (fitted[i]) setTimeout(() => sfx.module(i), 80);
    else if (shield[i]) setTimeout(() => sfx.ward(i), 80);
    else if (gain[i]) setTimeout(() => sfx.build(i), 80);
  }
  if (b.kind === 'burn') sfx.burn(b.player);
  if (hitMe && !isMuted()) navigator.vibrate?.(40);
}

const isStormy = (event: string | null) => event === 'storm' || event === 'eclipse' || rules.eventEvery <= 2;

/** Show a card in the middle of the battlefield; `spotlight` makes it big for the opponent's play. */
function showCard(cardId: string, player: 0 | 1, discarded: boolean, spotlight: boolean): void {
  const slot = $('played-slot');
  slot.innerHTML = '';
  slot.classList.toggle('spotlight', spotlight);
  const el = cardFace(cardId);
  el.classList.add('pop', player === HUMAN ? 'from-me' : 'from-opp');
  if (discarded) el.classList.add('discarded');
  slot.appendChild(el);
  const tag = document.createElement('div');
  tag.className = 'played-by';
  tag.textContent = `${player === HUMAN ? 'You' : state.players[player].name} ${discarded ? 'discarded' : 'played'}`;
  slot.appendChild(tag);
}

/** How long each kind of effect stays on screen (before the speed setting). */
const HOLD: Record<Beat['kind'], number> = { card: 750, discard: 600, power: 750, income: 420, module: 800, relic: 800, burn: 800, weather: 1400 };

/** Play one step back slowly: each effect lands on its own, with a caption saying what happened. */
async function playStep(before: GameState, after: GameState): Promise<boolean> {
  const gen = generation;
  let prev = before.players;
  let prevEvent = before.event;
  for (const b of after.beats ?? []) {
    if (gen !== generation) return false;
    // The opponent's turn begins with their income: start a fresh "Last turn" strip.
    if (b.kind === 'income' && b.player === AI) {
      roundLines = [];
      renderLastTurn();
    }
    const line = describeBeat(b, prev);
    const quiet = changes(prev, b.after).length === 0 && b.kind !== 'card' && b.kind !== 'discard' && b.kind !== 'weather' && b.kind !== 'power';
    if (quiet) {
      prev = b.after;
      continue;
    }
    // The opponent's card gets a moment in the spotlight before it lands, so you can read it.
    if (b.player === AI && b.cardId && (b.kind === 'card' || b.kind === 'discard')) {
      showCard(b.cardId, AI, b.kind === 'discard', true);
      narrate({ ...line, text: `${state.players[AI].name} ${b.kind === 'card' ? 'plays' : 'discards'} ${b.name}…` }, false);
      sfx.card();
      await wait(1000);
      if (gen !== generation) return false;
    } else if (b.player === HUMAN && b.cardId) showCard(b.cardId, HUMAN, b.kind === 'discard', false);
    state = { ...after, players: b.after, event: b.event };
    renderPanel(0);
    renderPanel(1);
    renderShip(0);
    renderShip(1);
    if (b.event !== prevEvent) renderEvent();
    effects(prev, b.after, { ...b, kind: b.kind === 'card' && b.player === AI ? 'card' : b.kind });
    narrate(line);
    await wait(HOLD[b.kind]);
    prev = b.after;
    prevEvent = b.event;
  }
  $('played-slot').classList.remove('spotlight');
  return gen === generation;
}

// ── Flow ───────────────────────────────────────────────────────

async function apply(action: Action): Promise<void> {
  const gen = generation;
  const before = state;
  const after = step(state, action, rules, true);
  selected = null;
  busy = true;
  renderHands();
  renderSheet();
  const ok = await playStep(before, after);
  if (!ok || gen !== generation) return;
  state = after;
  busy = false;
  render();
  if (state.winner !== null) {
    const done = state;
    narrate({ turn: done.turn, player: done.winner === HUMAN ? HUMAN : AI, icon: done.winner === HUMAN ? '🏆' : '💥', text: done.winReason ?? 'The battle is over' });
    setTimeout(() => {
      if (gen !== generation) return;
      if (done.winner === HUMAN) sfx.win();
      else sfx.lose();
      stopAmbience();
      onEnd?.(done);
    }, 1400);
    return;
  }
  maybeTip();
}

function act(action: Action, el?: HTMLElement): void {
  if (busy) return;
  hideTip();
  if (action.kind !== 'power') el?.classList.add(action.kind === 'play' ? 'leaving' : 'tossing');
  busy = true;
  selected = null;
  renderSheet();
  const gen = generation;
  setTimeout(async () => {
    if (gen !== generation) return;
    busy = false;
    await apply(action);
    if (gen === generation) maybeAiTurn();
  }, 180);
}

function maybeAiTurn(): void {
  if (state.winner !== null || state.current !== AI || !config) return;
  busy = true;
  hideTip();
  renderHands();
  narrate({ turn: state.turn, player: AI, icon: '🤔', text: `${state.players[AI].name} is thinking…` }, false);
  const gen = generation;
  setTimeout(async () => {
    if (gen !== generation) return;
    const action = chooseAction(state, config!.difficulty, rules);
    busy = false;
    await apply(action);
    if (gen === generation) maybeAiTurn();
  }, Math.round(650 * PACE[speed]));
}

export function startBattle(cfg: BattleConfig, done: (s: GameState) => void): void {
  generation++;
  unlock();
  unlockVoice();
  config = cfg;
  rules = cfg.eventEvery ? { ...DEFAULT_RULES, eventEvery: cfg.eventEvery } : DEFAULT_RULES;
  onEnd = done;
  selected = null;
  lastTurnOwner = null;
  state = newGame({
    names: ['You', cfg.enemyName],
    factions: cfg.factions,
    decks: cfg.decks,
    relics: cfg.relics,
    rules,
    captains: [cfg.captain, undefined],
  });
  $('goal-label').textContent = `⚓ High harbor · ${rules.winTower}`;
  busy = false;
  history = [];
  roundLines = [];
  renderLastTurn();
  renderLog();
  $('narration').className = 'narration';
  render();
  setTimeout(() => maybeTip(), 1200);
  const f = FACTION_MAP[cfg.factions[1]];
  toast(
    `<div class="toast-icon">${f.icon}</div><b>vs ${esc(cfg.enemyName)}</b><span>${f.name}: ${f.perks.join(' · ')}</span>` +
      (cfg.intro ? `<span>${esc(cfg.intro)}</span>` : ''),
  );
  if (cfg.taunt) voice(cfg.taunt);
  setStormy(rules.eventEvery <= 2);
  startAmbience();
  maybeAiTurn();
}

/** Stop the current battle (e.g. when leaving for a menu). */
export function abandonBattle(): void {
  stopAmbience();
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
  $('power-btn').addEventListener('click', usePower);
  renderSpeed();
  $('btn-speed').addEventListener('click', () => {
    speed = SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length];
    localStorage.setItem('keepfall.speed', speed);
    renderSpeed();
    sfx.click();
    toast(`<b>${SPEED_LABEL[speed][0]} ${SPEED_LABEL[speed][1]} speed</b><span>${speed === 'slow' ? 'Every move stays on screen longer.' : speed === 'fast' ? 'Moves play out quickly.' : 'The standard pace.'}</span>`);
  });
  // The battle log: open from the Log button or the Last turn strip; close with ✕, Escape or a tap elsewhere.
  const log = $('log');
  const setLog = (open: boolean) => {
    log.hidden = !open;
    if (open) log.scrollTop = 0;
  };
  $('last-turn').addEventListener('click', (e) => {
    e.stopPropagation();
    setLog(log.hidden === true);
  });
  $('log-close').addEventListener('click', () => setLog(false));
  document.addEventListener('pointerdown', (e) => {
    const t = e.target as HTMLElement;
    if (!log.hidden && !t.closest('#log, #btn-log, #last-turn')) setLog(false);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') setLog(false);
  });
  initTips(() => state, () => myTurn(), () => busy);
  $('btn-log').addEventListener('click', () => {
    const el = $('log');
    el.hidden = !el.hidden;
  });
  const panel = $('sound-panel');
  const renderSound = () => {
    const v = getVolumes();
    $('btn-mute').textContent = isMuted() ? '🔇' : '🔊';
    panel.innerHTML = `<b>Sound</b>
      <label><span>Effects</span><input type="range" min="0" max="100" value="${Math.round(v.fx * 100)}" data-v="fx"></label>
      <label><span>Atmosphere</span><input type="range" min="0" max="100" value="${Math.round(v.amb * 100)}" data-v="amb"></label>
      <button class="ghost small" data-v="mute">${isMuted() ? '🔊 Turn sound on' : '🔇 Mute everything'}</button>`;
  };
  $('btn-mute').addEventListener('click', (e) => {
    e.stopPropagation();
    unlock();
    renderSound();
    panel.hidden = !panel.hidden;
  });
  panel.addEventListener('input', (e) => {
    const el = e.target as HTMLInputElement;
    const v = getVolumes();
    if (el.dataset.v === 'fx') setVolumes(Number(el.value) / 100, v.amb);
    if (el.dataset.v === 'amb') setVolumes(v.fx, Number(el.value) / 100);
  });
  panel.addEventListener('change', (e) => {
    if ((e.target as HTMLInputElement).dataset.v === 'fx') sfx.hit(6, 1);
  });
  panel.addEventListener('click', (e) => {
    if ((e.target as HTMLElement).dataset.v !== 'mute') return;
    setMuted(!isMuted());
    if (!isMuted()) {
      unlock();
      sfx.click();
      if (config && state.winner === null) startAmbience();
    }
    renderSound();
  });
  document.addEventListener('pointerdown', (e) => {
    if (!panel.hidden && !(e.target as HTMLElement).closest('#sound-panel, #btn-mute')) panel.hidden = true;
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
      renderShip(0);
      renderShip(1);
      renderHands();
    }, 120);
  });
  render();
}
