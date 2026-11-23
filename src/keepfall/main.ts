import type { Difficulty } from './ai';
import { abandonBattle, getState, initBattleChrome, startBattle } from './battle';
import {
  battleSetup, camp, canCamp, chooseNode, currentNode, finishBattle, FLOORS, MIN_DECK, newRun, NODE_INFO,
  takeReward, takeTreasure, type RunState,
} from './campaign';
import { card, STARTER_DECK } from './cards';
import { aiDeck, DRAFT_PICKS, offerCards, type RngHolder } from './draft';
import { FACTIONS, FACTION_MAP, type FactionId } from './factions';
import { RELIC_MAP } from './relics';
import { sfx, unlock } from './sound';
import { DEFAULT_RULES } from './types';
import type { GameState } from './types';
import { $, bind, cardFace, esc, hideDialog, relicChip, relicTile, showDialog } from './ui';

const rules = DEFAULT_RULES;
type Mode = 'quick' | 'draft' | 'campaign';
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

function randomFaction(except?: FactionId): FactionId {
  const pool = FACTIONS.filter((f) => f.id !== except);
  return pool[Math.floor(Math.random() * pool.length)].id;
}
const resolveFaction = (c: FactionChoice) => (c === 'random' ? randomFaction() : c);

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
  const tiles = FACTIONS.map(
    (f) => `
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
    <p><b>Win</b> by raising your Tower to <b>${rules.winTower}</b>, knocking the enemy Tower to <b>0</b>, or stockpiling <b>${rules.winRes}</b> of any resource.</p>
    <p>Your <b>Quarry</b>, <b>Sanctum</b> and <b>Barracks</b> produce ⛏️ Stone, 🔮 Mana and ⚔️ Steel each turn. Build cards cost Stone, Magic cards cost Mana, War cards cost Steel. Play one card or discard one. Damage hits the <b>Wall</b> before the Tower.</p>
    <p><b>Buildings</b> take one of your ${rules.buildingSlots} slots and act at the start of every one of your turns. A new building replaces your oldest when the slots are full.</p>
    <p>Every ${rules.eventEvery} turns a new <b>event</b> changes the rules for both sides.</p>
  </details>`;

// ── Main menu ──────────────────────────────────────────────────

function showMenu(): void {
  const run = loadRun();
  const tabs = (['quick', 'draft', 'campaign'] as Mode[])
    .map((m) => `<button class="tab ${m === mode ? 'sel' : ''}" data-act="mode" data-m="${m}">${{ quick: '⚔️ Quick Battle', draft: '🃏 Draft', campaign: '🗺️ Campaign' }[m]}</button>`)
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
  } else if (run && run.status !== 'won' && run.status !== 'lost') {
    const f = FACTION_MAP[run.faction];
    body = `<p class="lead">Campaign in progress</p>
      <div class="run-summary">
        <div>${f.icon} <b>${f.name}</b></div>
        <div>Floor ${Math.max(1, run.floor + 1)} of ${FLOORS}</div>
        <div>${'🚩'.repeat(run.lives)}<span class="dim">${'🏳️'.repeat(run.maxLives - run.lives)}</span></div>
        <div>${run.deck.length} cards ${run.relics.map(relicChip).join('')}</div>
      </div>
      <button class="primary" data-act="continue-run">Continue campaign</button>
      <button class="ghost" data-act="abandon-run">Abandon and start over</button>`;
  } else {
    body = `<p class="lead">Fight across ${FLOORS} floors to reach ${esc('The Iron Warden')}. Grow your deck after each win, find relics, upgrade cards at camps. You have 3 banners; each lost battle costs one.</p>
      ${factionPicker(false)}
      <button class="primary" data-act="start-run">Begin campaign</button>`;
  }

  const d = showDialog(`<h2>Keepfall</h2><div class="tabs">${tabs}</div>${body}${HOW_TO}`);
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
    'start-quick': () => startQuick(),
    'start-draft': () => startDraft(),
    'start-run': () => {
      const run = newRun(factionChoice === 'random' ? randomFaction() : factionChoice);
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
    case 'destroy': return mine ? 'You toppled the enemy tower.' : 'Your tower has fallen.';
    case 'tower': return mine ? `Your tower reached ${rules.winTower}.` : `Their tower reached ${rules.winTower}.`;
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
          : `<p class="lead">You lose a banner. ${'🚩'.repeat(next.lives)} left.${node.type === 'boss' ? ' The Warden awaits your return.' : ''}</p>`
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
    const d = showDialog(
      `<h2>Spoils of war</h2>${runHeader(run)}
      <p class="lead">Add one card to your deck${run.pendingRelics ? ' and claim a relic' : ''}.</p>
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
    `<h2>Treasure</h2>${runHeader(run)}
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
    `<h2>🔥 Camp</h2>${runHeader(run)}
    <p class="lead">The fire crackles. Choose one.</p>
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
  const d = showDialog(`
    <h2 class="${won ? 'win' : 'lose'}">${won ? '👑 The Iron Warden falls!' : 'Campaign over'}</h2>
    <p class="lead">${won ? 'The last keep is yours.' : `You reached floor ${run.floor + 1} of ${FLOORS}.`}</p>
    ${runHeader(run)}
    <p class="record">Battles won ${run.battles.won} · lost ${run.battles.lost}</p>
    <button class="primary" data-act="new">New campaign</button>
    <button class="ghost" data-act="menu">Menu</button>`);
  bind(d, {
    new: () => {
      store.del('run');
      mode = 'campaign';
      showMenu();
    },
    menu: () => {
      store.del('run');
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
showMenu();
