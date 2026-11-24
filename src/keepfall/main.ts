import type { Difficulty } from './ai';
import { abandonBattle, getState, initBattleChrome, startBattle } from './battle';
import {
  battleSetup, camp, canCamp, chooseNode, currentNode, finishBattle, FLOORS, MIN_DECK, newRun, NODE_INFO,
  SIEGE_RULES, takeReward, takeTreasure, type RunState,
} from './campaign';
import { card, setLockedCards, STARTER_DECK } from './cards';
import { applyRun, isUnlocked, lockedContent, newMeta, nextUnlock, UNLOCKS, type Meta, type RunResult } from './meta';
import { setLockedRelics } from './relics';
import { aiDeck, DRAFT_PICKS, offerCards, type RngHolder } from './draft';
import { FACTIONS, FACTION_MAP, type FactionId } from './factions';
import { RELIC_MAP } from './relics';
import { sfx, unlock } from './sound';
import { DEFAULT_RULES } from './types';
import type { GameState } from './types';
import { $, bind, cardFace, esc, hideDialog, initInfoPops, relicChip, relicTile, showDialog } from './ui';

const rules = DEFAULT_RULES;
type Mode = 'quick' | 'draft' | 'campaign' | 'progress';
type FactionChoice = FactionId | 'random';

const store = {
  get: (k: string) => localStorage.getItem(`keepfall.${k}`),
  set: (k: string, v: string) => localStorage.setItem(`keepfall.${k}`, v),
  del: (k: string) => localStorage.removeItem(`keepfall.${k}`),
};

let mode: Mode = (store.get('mode') as Mode) ?? 'quick';
let difficulty: Difficulty = (store.get('difficulty') as Difficulty) ?? 'normal';
let factionChoice: FactionChoice = (store.get('faction') as FactionChoice) ?? 'random';
let inBattle = false;

// ── Progress between runs ──────────────────────────────────────

function loadMeta(): Meta {
  try {
    const m = JSON.parse(store.get('meta') ?? 'null') as Meta | null;
    return m && m.version === 1 ? { ...newMeta(), ...m } : newMeta();
  } catch {
    return newMeta();
  }
}
let meta = loadMeta();
let siege = Math.min(Number(store.get('siege') ?? 0), meta.siegeUnlocked);

function applyLocks(): void {
  const locked = lockedContent(meta);
  setLockedCards(locked.cards);
  setLockedRelics(locked.relics);
}
applyLocks();

const factionLocked = (id: FactionId) => lockedContent(meta).factions.includes(id);
const unlockFor = (id: FactionId) => UNLOCKS.find((u) => u.id === id);
if (factionChoice !== 'random' && factionLocked(factionChoice)) factionChoice = 'random';

/** A random faction for the player (unlocked only), or any faction for an opponent. */
function randomFaction(except?: FactionId, forPlayer = false): FactionId {
  const pool = FACTIONS.filter((f) => f.id !== except && !(forPlayer && factionLocked(f.id)));
  return pool[Math.floor(Math.random() * pool.length)].id;
}
const resolveFaction = (c: FactionChoice) => (c === 'random' ? randomFaction(undefined, true) : c);

// ── Campaign save ──────────────────────────────────────────────

function loadRun(): RunState | null {
  try {
    const r = JSON.parse(store.get('run') ?? 'null') as RunState | null;
    return r && r.version === 1 ? r : null;
  } catch {
    return null;
  }
}
const saveRun = (r: RunState) => store.set('run', JSON.stringify(r));

// ── Shared menu pieces ─────────────────────────────────────────

function factionPicker(allowRandom = true): string {
  const tiles = FACTIONS.map((f) =>
    factionLocked(f.id)
      ? `<button class="faction locked" disabled>
      <span class="f-icon">🔒</span><b>${f.name}</b>
      <small>${f.blurb}</small>
      <ul><li>Unlocks at ${unlockFor(f.id)?.at ?? '?'} Renown (you have ${meta.renown})</li></ul>
    </button>`
      : `
    <button class="faction ${factionChoice === f.id ? 'sel' : ''}" data-act="faction" data-f="${f.id}">
      <span class="f-icon">${f.icon}</span><b>${f.name}</b>
      <small>${f.blurb}</small>
      <ul>${f.perks.map((p) => `<li>${p}</li>`).join('')}</ul>
    </button>`,
  );
  if (allowRandom)
    tiles.push(`<button class="faction ${factionChoice === 'random' ? 'sel' : ''}" data-act="faction" data-f="random">
      <span class="f-icon">🎲</span><b>Random</b><small>Let fate decide.</small></button>`);
  return `<h3 class="pick">Choose your faction</h3><div class="factions">${tiles.join('')}</div>`;
}

function difficultyPicker(): string {
  return `<div class="diff"><span>Opponent:</span>
    ${(['easy', 'normal', 'hard'] as Difficulty[])
      .map((d) => `<button class="diff-btn ${d === difficulty ? 'sel' : ''}" data-act="diff" data-d="${d}">${d[0].toUpperCase() + d.slice(1)}</button>`)
      .join('')}</div>`;
}

const HOW_TO = `
  <details class="rules">
    <summary>How to play</summary>
    <p><b>Win</b> by climbing to <b>${rules.winTower}</b> Altitude and reaching the high harbor, knocking the enemy ship down to <b>0</b>, or stockpiling <b>${rules.winRes}</b> of any resource.</p>
    <p>Your <b>Foundry</b>, <b>Aether Well</b> and <b>Powder Mill</b> produce ⚙️ Iron, 🔮 Aether and 💣 Powder each turn. Shipwright cards cost Iron, Aether cards cost Aether, Gunnery cards cost Powder. Play one card or discard one. Damage hits the <b>Armor</b> before it knocks the ship's Altitude down.</p>
    <p><b>Modules</b> take one of your ${rules.buildingSlots} slots and act at the start of every one of your turns. A new module replaces your oldest when the slots are full.</p>
    <p>Every ${rules.eventEvery} turns the <b>weather</b> changes the rules for both sides.</p>
    <p><b>Keywords.</b> 💠 <b>Ward</b> blocks enemy damage, spells and burns before your Armor. 🔥 <b>Burn</b> takes Altitude at the start of the enemy's turns, ignoring Armor. ⚡ <b>Combo</b> triggers if you already played a card this turn. <b>Choose</b> cards let you pick one effect. 🗑️ <b>Junk</b> does nothing and leaves the deck when played.</p>
    <p><b>On a phone</b>, tap a card to see what it would do (the +/− badges), then tap Play. Tap any icon for details.</p>
  </details>`;

function siegePicker(): string {
  if (meta.siegeUnlocked === 0) return '<p class="dim small">Beat the Iron Leviathan to unlock Storm levels: harder campaigns that pay more Renown.</p>';
  const btns = Array.from({ length: meta.siegeUnlocked + 1 }, (_, i) => `<button class="diff-btn ${i === siege ? 'sel' : ''}" data-act="siege" data-s="${i}">${i === 0 ? 'Off' : i}</button>`).join('');
  const rulesList = SIEGE_RULES.slice(1, siege + 1).map((r) => `<li>${r}</li>`).join('');
  return `<div class="diff"><span>Storm:</span>${btns}</div>
    ${siege ? `<ul class="siege-rules">${rulesList}<li class="dim">+${siege * 20}% Renown</li></ul>` : ''}`;
}

function renownBar(): string {
  const next = nextUnlock(meta);
  const prev = [...UNLOCKS].reverse().find((u) => meta.renown >= u.at)?.at ?? 0;
  const pct = next ? Math.round(((meta.renown - prev) / (next.at - prev)) * 100) : 100;
  return `<div class="renown">
    <div class="renown-top"><b>⭐ ${meta.renown} Renown</b><span>${next ? `Next: ${next.icon} ${next.name} at ${next.at}` : 'Everything unlocked'}</span></div>
    <div class="bar"><i style="width:${pct}%"></i></div>
  </div>`;
}

function progressBody(): string {
  const unlocks = UNLOCKS.map((u) => {
    const got = meta.renown >= u.at;
    return `<div class="unlock ${got ? 'got' : ''}"><span class="u-icon">${got ? u.icon : '🔒'}</span>
      <div><b>${u.name}</b> <small>${got ? 'Unlocked' : `${u.at} Renown`}</small><p>${u.text}</p></div></div>`;
  }).join('');
  const levels = SIEGE_RULES.slice(1)
    .map((r, i) => `<li class="${i + 1 <= meta.siegeUnlocked ? '' : 'dim'}"><b>Storm ${i + 1}</b> ${i + 1 <= meta.siegeUnlocked ? '' : '🔒'} ${r}</li>`)
    .join('');
  return `<p class="lead">Every campaign earns Renown, win or lose. Renown unlocks new content for good.</p>
    ${renownBar()}
    <div class="unlocks">${unlocks}</div>
    <h3 class="pick">Storm levels</h3>
    <p class="dim small">Win a campaign to unlock the next level. Each adds to the ones before.</p>
    <ol class="siege-list">${levels}</ol>
    <p class="record">Campaigns ${meta.runs} · won ${meta.wins} · best floor ${meta.bestFloor || '–'}</p>`;
}

// ── Main menu ──────────────────────────────────────────────────

function showMenu(): void {
  const run = loadRun();
  const tabs = (['quick', 'draft', 'campaign', 'progress'] as Mode[])
    .map((m) => `<button class="tab ${m === mode ? 'sel' : ''}" data-act="mode" data-m="${m}">${{ quick: '⚔️ Quick', draft: '🃏 Draft', campaign: '🗺️ Campaign', progress: '⭐ Progress' }[m]}</button>`)
    .join('');

  let body = '';
  if (mode === 'quick') {
    body = `<p class="lead">One battle with the full deck of every card.</p>
      ${factionPicker()}${difficultyPicker()}
      <button class="primary" data-act="start-quick">Start battle</button>`;
  } else if (mode === 'draft') {
    body = `<p class="lead">Build your deck: ${DRAFT_PICKS} times, pick 1 of 3 cards to add to an ${STARTER_DECK.length}-card starter deck. The opponent drafts too.</p>
      ${factionPicker()}${difficultyPicker()}
      <button class="primary" data-act="start-draft">Start draft</button>`;
  } else if (mode === 'progress') {
    body = progressBody();
  } else if (run && run.status !== 'won' && run.status !== 'lost') {
    const f = FACTION_MAP[run.faction];
    body = `<p class="lead">Campaign in progress${run.siege ? ` · Storm ${run.siege}` : ''}</p>
      <div class="run-summary">
        <div>${f.icon} <b>${f.name}</b></div>
        <div>Floor ${Math.max(1, run.floor + 1)} of ${FLOORS}</div>
        <div>${'🚩'.repeat(run.lives)}<span class="dim">${'🏳️'.repeat(run.maxLives - run.lives)}</span></div>
        <div>${run.deck.length} cards ${run.relics.map(relicChip).join('')}</div>
      </div>
      <button class="primary" data-act="continue-run">Continue campaign</button>
      <button class="ghost" data-act="abandon-run">Abandon and start over</button>`;
  } else {
    const perks = [isUnlocked(meta, 'startRelic') && '🎒 choose a starting relic', isUnlocked(meta, 'startCard') && '📜 a free card pick'].filter(Boolean);
    body = `<p class="lead">Fight across ${FLOORS} floors to reach ${esc('The Iron Leviathan')}. Grow your deck after each win, find relics, upgrade cards at docks. You have 3 banners; each lost battle costs one.</p>
      ${renownBar()}
      ${factionPicker(false)}
      ${siegePicker()}
      ${perks.length ? `<p class="dim small">You start with ${perks.join(' and ')}.</p>` : ''}
      <button class="primary" data-act="start-run">Begin campaign</button>`;
  }

  const d = showDialog(`<h2>Sky Armada</h2><div class="tabs">${tabs}</div>${body}${HOW_TO}`);
  bind(d, {
    mode: (el) => {
      mode = el.dataset.m as Mode;
      store.set('mode', mode);
      sfx.click();
      showMenu();
    },
    faction: (el) => {
      factionChoice = el.dataset.f as FactionChoice;
      store.set('faction', factionChoice);
      showMenu();
    },
    diff: (el) => {
      difficulty = el.dataset.d as Difficulty;
      store.set('difficulty', difficulty);
      showMenu();
    },
    siege: (el) => {
      siege = Number(el.dataset.s);
      store.set('siege', String(siege));
      showMenu();
    },
    'start-quick': () => startQuick(),
    'start-draft': () => startDraft(),
    'start-run': () => {
      const run = newRun(resolveFaction(factionChoice), undefined, {
        siege,
        startRelic: isUnlocked(meta, 'startRelic'),
        startCard: isUnlocked(meta, 'startCard'),
      });
      saveRun(run);
      unlock();
      sfx.click();
      route(run);
    },
    'continue-run': () => {
      unlock();
      sfx.click();
      route(loadRun()!);
    },
    'abandon-run': () => {
      if (!confirm('Abandon this campaign? Progress will be lost.')) return;
      store.del('run');
      showMenu();
    },
  });
}

function recordResult(s: GameState): { w: number; l: number } {
  const record = JSON.parse(store.get('record') ?? '{"w":0,"l":0}');
  if (s.winner === 0) record.w++;
  else if (s.winner === 1) record.l++;
  store.set('record', JSON.stringify(record));
  return record;
}

function outcomeText(s: GameState): string {
  if (s.winner === 'draw') return 'Both sides won at the same moment.';
  const mine = s.winner === 0;
  switch (s.winKind) {
    case 'destroy': return mine ? 'The enemy ship goes down in flames.' : 'Your ship goes down.';
    case 'tower': return mine ? `You reached the high harbor at ${rules.winTower} Altitude.` : `They reached the high harbor at ${rules.winTower} Altitude.`;
    case 'hoard': return mine ? `You stockpiled ${rules.winRes} of a resource.` : `They stockpiled ${rules.winRes} of a resource.`;
    default: return s.winReason ?? '';
  }
}

const titleFor = (s: GameState) => (s.winner === 0 ? 'Victory!' : s.winner === 'draw' ? 'Draw' : 'Defeat');

// ── Quick battle ───────────────────────────────────────────────

function startQuick(): void {
  const mine = resolveFaction(factionChoice);
  const theirs = randomFaction(mine);
  battle({ enemyName: 'Opponent', factions: [mine, theirs], difficulty }, (s) => {
    const rec = recordResult(s);
    const d = showDialog(`
      <h2 class="${s.winner === 0 ? 'win' : 'lose'}">${titleFor(s)}</h2>
      <p class="lead">${outcomeText(s)} (turn ${s.turn})</p>
      <p class="record">${FACTION_MAP[mine].icon} ${FACTION_MAP[mine].name} vs ${FACTION_MAP[theirs].icon} ${FACTION_MAP[theirs].name} · ${difficulty}</p>
      <p class="record">Your record: ${rec.w} wins · ${rec.l} losses</p>
      <button class="primary" data-act="again">Play again</button>
      <button class="ghost" data-act="menu">Menu</button>`);
    bind(d, { again: startQuick, menu: showMenu });
  });
}

// ── Draft ──────────────────────────────────────────────────────

interface DraftSession extends RngHolder {
  faction: FactionId;
  picks: string[];
  offer: string[];
}

function startDraft(): void {
  unlock();
  const ds: DraftSession = { rng: (Math.random() * 2 ** 32) | 0, faction: resolveFaction(factionChoice), picks: [], offer: [] };
  ds.offer = offerCards(ds);
  showDraft(ds);
}

function showDraft(ds: DraftSession): void {
  const f = FACTION_MAP[ds.faction];
  const d = showDialog(
    `<h2>Draft</h2>
    <p class="lead">${f.icon} ${f.name} · Pick ${ds.picks.length + 1} of ${DRAFT_PICKS}: tap a card to add it to your deck.</p>
    <div class="offer" id="offer"></div>
    <div class="deck-strip">${ds.picks.length ? ds.picks.map((id) => `<span class="chip t-${card(id).type}">${esc(card(id).name)}</span>`).join('') : '<span class="dim">Your picks will appear here.</span>'}</div>
    <p class="dim small">Plus the ${STARTER_DECK.length}-card starter deck.</p>
    <button class="ghost" data-act="menu">Back to menu</button>`,
    true,
  );
  const offer = $('offer');
  for (const id of ds.offer) {
    const el = cardFace(id);
    el.classList.add('pickable');
    el.addEventListener('click', () => {
      sfx.card();
      ds.picks.push(id);
      if (ds.picks.length >= DRAFT_PICKS) return draftBattle(ds, [...STARTER_DECK, ...ds.picks], aiDeck(ds, DRAFT_PICKS));
      ds.offer = offerCards(ds);
      showDraft(ds);
    });
    offer.appendChild(el);
  }
  bind(d, { menu: showMenu });
}

function draftBattle(ds: DraftSession, myDeck: string[], theirDeck: string[]): void {
  const theirs = randomFaction(ds.faction);
  battle({ enemyName: 'Rival Drafter', factions: [ds.faction, theirs], difficulty, decks: [myDeck, theirDeck] }, (s) => {
    const rec = recordResult(s);
    const d = showDialog(`
      <h2 class="${s.winner === 0 ? 'win' : 'lose'}">${titleFor(s)}</h2>
      <p class="lead">${outcomeText(s)} (turn ${s.turn})</p>
      <p class="record">Your record: ${rec.w} wins · ${rec.l} losses</p>
      <button class="primary" data-act="rematch">Rematch with this deck</button>
      <button class="ghost" data-act="redraft">New draft</button>
      <button class="ghost" data-act="menu">Menu</button>`);
    bind(d, { rematch: () => draftBattle(ds, myDeck, theirDeck), redraft: startDraft, menu: showMenu });
  });
}

// ── Campaign ───────────────────────────────────────────────────

function route(run: RunState): void {
  switch (run.status) {
    case 'map': return showMap(run);
    case 'battle': return campaignBattle(run);
    case 'reward': return showReward(run);
    case 'camp': return showCamp(run);
    case 'treasure': return showTreasure(run);
    default: return showRunEnd(run);
  }
}

function runHeader(run: RunState): string {
  const f = FACTION_MAP[run.faction];
  return `<div class="run-header">
    <span>${f.icon} ${f.name}</span>
    ${run.siege ? `<span class="siege-tag" data-info="${esc(SIEGE_RULES.slice(1, run.siege + 1).join(' · '))}">⛈️ Storm ${run.siege}</span>` : ''}
    <span title="Banners: each lost battle costs one">${'🚩'.repeat(run.lives)}<span class="dim">${'🏳️'.repeat(Math.max(0, run.maxLives - run.lives))}</span></span>
    <span class="relics">${run.relics.map(relicChip).join('') || '<span class="dim">No relics</span>'}</span>
    <button class="ghost small" data-act="deck">Deck (${run.deck.length})</button>
  </div>`;
}

function showMap(run: RunState): void {
  const rows = run.map
    .map((floor, fi) => {
      const nodes = floor
        .map((n, ni) => {
          const info = NODE_INFO[n.type];
          const chosen = run.path[fi] === ni;
          const state = fi <= run.floor ? (chosen ? 'done' : 'skipped') : fi === run.floor + 1 ? 'next' : 'locked';
          const sub = n.enemy ? `<small>${esc(n.enemy.name)}</small>` : '';
          return `<button class="node n-${n.type} ${state}" ${state === 'next' ? `data-act="node" data-i="${ni}"` : 'disabled'} title="${esc(info.text)}">
            <span class="n-icon">${info.icon}</span><b>${info.label}</b>${sub}</button>`;
        })
        .join('');
      return `<div class="floor"><span class="floor-num">${fi + 1}</span>${nodes}</div>`;
    })
    .reverse()
    .join('');
  const d = showDialog(
    `<h2>Campaign</h2>${runHeader(run)}
    <p class="lead">Choose where to go next. Hover a stop for details.</p>
    <div class="map">${rows}</div>
    <button class="ghost" data-act="menu">Save and quit to menu</button>`,
    true,
  );
  bind(d, {
    node: (el) => {
      sfx.click();
      const next = chooseNode(run, Number(el.dataset.i));
      saveRun(next);
      route(next);
    },
    deck: () => showDeck(run.deck, () => showMap(run)),
    menu: showMenu,
  });
  // Keep the next choice in view on small screens.
  d.querySelector('.node.next')?.scrollIntoView({ block: 'center' });
}

function campaignBattle(run: RunState): void {
  const { run: r, enemy, enemyDeck } = battleSetup(run);
  saveRun(r);
  const node = currentNode(r)!;
  battle(
    {
      enemyName: enemy.name,
      factions: [r.faction, enemy.faction],
      difficulty: enemy.difficulty,
      decks: [r.deck, enemyDeck],
      relics: [r.relics, enemy.relics],
      intro: `${NODE_INFO[node.type].label} · floor ${r.floor + 1}${enemy.relics.length ? ' · carries ' + enemy.relics.map((x) => RELIC_MAP[x].icon).join('') : ''}`,
    },
    (s) => {
      const won = s.winner === 0;
      const next = finishBattle(r, won);
      saveRun(next);
      const lostLine = !won
        ? next.status === 'lost'
          ? '<p class="lead">Your last banner falls.</p>'
          : `<p class="lead">You lose a banner. ${'🚩'.repeat(next.lives)} left.${node.type === 'boss' ? ' The Leviathan awaits your return.' : ''}</p>`
        : '';
      const d = showDialog(`
        <h2 class="${won ? 'win' : 'lose'}">${titleFor(s)}</h2>
        <p class="lead">${outcomeText(s)} (turn ${s.turn})</p>${lostLine}
        <button class="primary" data-act="go">Continue</button>`);
      bind(d, { go: () => route(next) });
    },
  );
}

function showReward(run: RunState): void {
  let pickedCard: string | null = null;
  let pickedRelic: string | null = null;
  const render = () => {
    const start = run.floor < 0;
    const d = showDialog(
      `<h2>${start ? '🎒 Supplies for the voyage' : 'Spoils of war'}</h2>${runHeader(run)}
      <p class="lead">${start ? 'Your Renown has earned you a head start.' : ''} ${run.pendingCards ? 'Add one card to your deck' : ''}${run.pendingCards && run.pendingRelics ? ' and claim a relic' : run.pendingRelics ? 'Claim a relic' : ''}.</p>
      <div class="offer" id="offer"></div>
      ${run.pendingRelics ? `<div class="relic-row">${run.pendingRelics.map((id) => relicTile(id, id === pickedRelic)).join('')}</div>` : ''}
      <button class="primary" data-act="take">${pickedCard || pickedRelic ? 'Take and continue' : 'Skip'}</button>`,
      true,
    );
    const offer = $('offer');
    for (const id of run.pendingCards ?? []) {
      const el = cardFace(id);
      el.classList.add('pickable');
      if (id === pickedCard) el.classList.add('picked');
      el.addEventListener('click', () => {
        pickedCard = pickedCard === id ? null : id;
        sfx.click();
        render();
      });
      offer.appendChild(el);
    }
    d.querySelectorAll<HTMLElement>('[data-relic]').forEach((el) =>
      el.addEventListener('click', () => {
        pickedRelic = pickedRelic === el.dataset.relic ? null : el.dataset.relic!;
        sfx.click();
        render();
      }),
    );
    bind(d, {
      take: () => {
        const next = takeReward(run, pickedCard, pickedRelic);
        saveRun(next);
        route(next);
      },
      deck: () => showDeck(run.deck, render),
    });
  };
  render();
}

function showTreasure(run: RunState): void {
  const d = showDialog(
    `<h2>💎 Salvage</h2>${runHeader(run)}
    <p class="lead">A forgotten vault. Take one relic.</p>
    <div class="relic-row">${(run.pendingRelics ?? []).map((id) => relicTile(id)).join('')}</div>`,
    true,
  );
  d.querySelectorAll<HTMLElement>('[data-relic]').forEach((el) =>
    el.addEventListener('click', () => {
      sfx.build();
      const next = takeTreasure(run, el.dataset.relic!);
      saveRun(next);
      route(next);
    }),
  );
  bind(d, { deck: () => showDeck(run.deck, () => showTreasure(run)) });
}

function showCamp(run: RunState): void {
  const canRest = canCamp(run, { kind: 'rest' });
  const canRemove = run.deck.length > MIN_DECK;
  const d = showDialog(
    `<h2>⚓ Dock</h2>${runHeader(run)}
    <p class="lead">The ground crew salutes. Choose one.</p>
    <div class="camp-options">
      <button class="camp-opt" data-act="upgrade"><span>⚒️</span><b>Upgrade a card</b><small>Bigger numbers, permanently.</small></button>
      <button class="camp-opt" data-act="remove" ${canRemove ? '' : 'disabled'}><span>✂️</span><b>Remove a card</b><small>${canRemove ? 'Thin your deck.' : `Deck can't go below ${MIN_DECK}.`}</small></button>
      <button class="camp-opt" data-act="rest" ${canRest ? '' : 'disabled'}><span>🚩</span><b>Rest</b><small>${canRest ? 'Recover a banner.' : 'Banners are full.'}</small></button>
    </div>`,
    true,
  );
  bind(d, {
    upgrade: () => pickFromDeck(run, 'upgrade'),
    remove: () => pickFromDeck(run, 'remove'),
    rest: () => {
      sfx.build();
      const next = camp(run, { kind: 'rest' });
      saveRun(next);
      route(next);
    },
    deck: () => showDeck(run.deck, () => showCamp(run)),
  });
}

function pickFromDeck(run: RunState, kind: 'upgrade' | 'remove'): void {
  const d = showDialog(
    `<h2>${kind === 'upgrade' ? '⚒️ Upgrade which card?' : '✂️ Remove which card?'}</h2>
    <p class="lead">${kind === 'upgrade' ? 'Cards show their upgraded version.' : 'Tap a card to remove it from your deck.'}</p>
    <div class="deck-grid" id="grid"></div>
    <button class="ghost" data-act="back">Back</button>`,
    true,
  );
  const grid = $('grid');
  const order = run.deck.map((id, i) => ({ id, i })).sort((a, b) => card(a.id).type.localeCompare(card(b.id).type) || card(a.id).cost - card(b.id).cost);
  for (const { id, i } of order) {
    const ok = canCamp(run, { kind, index: i });
    const el = cardFace(kind === 'upgrade' && ok ? id + '+' : id);
    el.classList.add(ok ? 'pickable' : 'unaffordable');
    if (ok)
      el.addEventListener('click', () => {
        sfx.build();
        const next = camp(run, { kind, index: i });
        saveRun(next);
        route(next);
      });
    grid.appendChild(el);
  }
  bind(d, { back: () => showCamp(run) });
}

function showDeck(deck: string[], back: () => void): void {
  const d = showDialog(
    `<h2>Your deck (${deck.length})</h2><div class="deck-grid" id="grid"></div><button class="primary" data-act="back">Back</button>`,
    true,
  );
  const grid = $('grid');
  [...deck]
    .sort((a, b) => card(a).type.localeCompare(card(b).type) || card(a).cost - card(b).cost)
    .forEach((id) => grid.appendChild(cardFace(id)));
  bind(d, { back });
}

function showRunEnd(run: RunState): void {
  const won = run.status === 'won';
  if (won) sfx.win();
  // Award Renown once per run; keep the breakdown so a reload shows the same screen.
  let result: RunResult | null = JSON.parse(store.get('runResult') ?? 'null');
  if (!run.scored) {
    result = applyRun(meta, run);
    meta = result.meta;
    store.set('meta', JSON.stringify(meta));
    store.set('runResult', JSON.stringify(result));
    run.scored = true;
    saveRun(run);
    applyLocks();
  }
  const breakdown = result
    ? `<div class="renown-gain">
        ${result.lines.map((l) => `<div><span>${esc(l.label)}</span><b>+${l.amount}</b></div>`).join('')}
        <div class="total"><span>Renown earned</span><b>⭐ +${result.gained}</b></div>
      </div>
      ${result.unlocked.map((u) => `<div class="unlock got new"><span class="u-icon">${u.icon}</span><div><b>Unlocked: ${u.name}</b><p>${u.text}</p></div></div>`).join('')}
      ${result.newSiege ? `<div class="unlock got new"><span class="u-icon">⛈️</span><div><b>Unlocked: Storm ${result.newSiege}</b><p>${SIEGE_RULES[result.newSiege]}</p></div></div>` : ''}
      ${renownBar()}`
    : '';
  const d = showDialog(`
    <h2 class="${won ? 'win' : 'lose'}">${won ? '👑 The Iron Leviathan falls!' : 'Campaign over'}</h2>
    <p class="lead">${won ? 'The high harbor is yours.' : `You reached floor ${run.floor + 1} of ${FLOORS}.`}</p>
    ${runHeader(run)}
    <p class="record">Battles won ${run.battles.won} · lost ${run.battles.lost}</p>
    ${breakdown}
    <button class="primary" data-act="new">New campaign</button>
    <button class="ghost" data-act="menu">Menu</button>`);
  bind(d, {
    new: () => {
      store.del('run');
      store.del('runResult');
      mode = 'campaign';
      showMenu();
    },
    menu: () => {
      store.del('run');
      store.del('runResult');
      showMenu();
    },
    deck: () => showDeck(run.deck, () => showRunEnd(run)),
  });
}

// ── Battle wrapper ─────────────────────────────────────────────

function battle(cfg: Parameters<typeof startBattle>[0], done: (s: GameState) => void): void {
  hideDialog();
  inBattle = true;
  startBattle(cfg, (s) => {
    inBattle = false;
    done(s);
  });
}

$('btn-menu').addEventListener('click', () => {
  if (inBattle && getState().winner === null) {
    const campaignNote = mode === 'campaign' && loadRun()?.status === 'battle' ? ' Your campaign is saved; the battle will restart.' : '';
    if (!confirm(`Leave this battle?${campaignNote}`)) return;
    abandonBattle();
    inBattle = false;
  }
  showMenu();
});

initBattleChrome();
initInfoPops();
showMenu();
