import { isLinked, lastSynced, link, sync, syncOnOpen, unlink } from '../kids/sync';
import { ICON_CREDIT } from './art';
import type { Difficulty } from './ai';
import { abandonBattle, getState, initBattleChrome, startBattle, voice } from './battle';
import { duelHandlers, duelsBody, handleInviteLink, inDuel, initDuels, leaveDuel, refreshDuels, yourTurnCount } from './duelui';
import { resetTips } from './tips';
import {
  ACT_INFO, ACTS, applyDailyMods, BOSSES, battleSetup, buyItem, buyService, camp, canCamp, canChoose, canService, chooseNode,
  currentNode, finishBattle, FLOORS_PER_ACT, isCurrentRun, leaveDock, leaveMarket, MAX_SIEGE, MIN_DECK, newRun, NODE_INFO,
  removePrice, rerollReward, resolveEvent, servicePrice, SIEGE_RULES, takeReward, takeTreasure, type RunState, type Service,
} from './campaign';
import { CAPTAIN_MAP, CAPTAINS, LEVEL_XP } from './captains';
import { card, ENCHANTS, enchantId, setLockedCards, STARTER_DECK, upgradeId } from './cards';
import { aiDeck, DRAFT_PICKS, offerCards, type RngHolder } from './draft';
import { EVENT_DEF } from './events';
import { FACTIONS, FACTION_MAP, type FactionId } from './factions';
import {
  applyRun, buy, canBuy, captainLevel, dailyAvailable, dailyFor, FEATS, FEAT_MAP, isOn, lockedContent, migrateMeta,
  nextUnlock, owns, runOptionsFromMeta, spendable, today, toggleUpgrade, UNLOCKS, type Meta, type RunResult,
} from './meta';
import { RELIC_MAP, setLockedRelics } from './relics';
import { SHOP, SHOP_MAP, type Slot } from './shipyard';
import { sfx, unlock } from './sound';
import { DEFAULT_RULES, type Enchant, type GameState } from './types';
import { $, bind, cardFace, esc, hideDialog, initInfoPops, relicChip, relicTile, showDialog, toast } from './ui';

const rules = DEFAULT_RULES;
type Mode = 'quick' | 'draft' | 'campaign' | 'duels' | 'shipyard' | 'progress';
type FactionChoice = FactionId | 'random';
type ShipTab = 'yard' | 'captain' | 'content' | 'cosmetic';

const store = {
  get: (k: string) => localStorage.getItem(`keepfall.${k}`),
  set: (k: string, v: string) => {
    localStorage.setItem(`keepfall.${k}`, v);
    syncSoon();
  },
  del: (k: string) => {
    localStorage.removeItem(`keepfall.${k}`);
    syncSoon();
  },
};

// ── Family sync: progress follows you between devices (same family code as Toy Phone) ──

let syncTimer = 0;
let syncBusy = false;
let syncMsg = '';

/** In a menu (not mid-battle): safe to reload so the game picks up the family's newer progress. */
const inMenu = () => document.getElementById('overlay')?.classList.contains('show') ?? false;

function afterSync(changedHere: boolean): void {
  if (changedHere && inMenu()) location.reload();
}

/** Save progress to the family a moment after it changes. */
function syncSoon(): void {
  if (!isLinked()) return;
  clearTimeout(syncTimer);
  syncTimer = window.setTimeout(() => {
    sync().then((r) => afterSync(r.changedHere)).catch(() => {});
  }, 2500);
}

function syncCard(): string {
  const msg = syncMsg ? `<p class="sync-msg">${esc(syncMsg)}</p>` : '';
  if (!isLinked())
    return `<div class="sync-card">
      <b>☁️ Save progress across devices</b>
      <p class="dim small">Enter your family code (the same one as Toy Phone) to keep your Renown, Shipyard, captains and campaign in step on every device.</p>
      <input id="sync-code" type="text" autocomplete="off" autocapitalize="none" spellcheck="false" placeholder="Family code (6+ characters)">
      <div class="sync-btns">
        <button class="diff-btn" data-act="sync-join" ${syncBusy ? 'disabled' : ''}>🔗 Join my family</button>
        <button class="diff-btn" data-act="sync-create" ${syncBusy ? 'disabled' : ''}>✨ Start a family</button>
      </div>${msg}</div>`;
  const when = lastSynced();
  const ago = !when ? 'not yet' : Date.now() - when < 60000 ? 'just now' : `${Math.round((Date.now() - when) / 60000)} min ago`;
  return `<div class="sync-card">
    <b>☁️ Progress syncs with your family</b>
    <p class="dim small">Last synced ${ago}. Play on any device with the family code and carry on where you left off.</p>
    <div class="sync-btns">
      <button class="diff-btn" data-act="sync-now" ${syncBusy ? 'disabled' : ''}>${syncBusy ? '⏳ Syncing…' : '🔄 Sync now'}</button>
      <button class="diff-btn" data-act="sync-unlink">Unlink this device</button>
    </div>${msg}</div>`;
}

async function runSync(what: () => Promise<{ changedHere: boolean }>, ok: string): Promise<void> {
  syncBusy = true;
  syncMsg = '';
  showMenu();
  try {
    const r = await what();
    syncMsg = ok;
    syncBusy = false;
    if (r.changedHere) return location.reload();
  } catch (e) {
    syncMsg = (e as Error).message;
  }
  syncBusy = false;
  showMenu();
}

const syncHandlers = {
  'sync-join': () => {
    const code = (document.getElementById('sync-code') as HTMLInputElement).value;
    if (code.trim().length < 6) return void ((syncMsg = 'The family code needs at least 6 characters.'), showMenu());
    if (!confirm('Switch this device to your family’s saved progress?')) return;
    void runSync(() => link(code, 'join'), 'Joined! Your family’s progress is on this device.');
  },
  'sync-create': () => {
    const code = (document.getElementById('sync-code') as HTMLInputElement).value;
    if (code.trim().length < 6) return void ((syncMsg = 'The family code needs at least 6 characters.'), showMenu());
    void runSync(() => link(code, 'create'), 'Family started! Use the same code on your other devices.');
  },
  'sync-now': () => void runSync(() => sync(), 'All synced.'),
  'sync-unlink': () => {
    if (!confirm('Stop syncing progress on this device? It keeps its progress as it is now.')) return;
    unlink();
    syncMsg = '';
    showMenu();
  },
};

// ── Settings and progress ──────────────────────────────────────

let mode: Mode = (store.get('mode') as Mode) ?? 'quick';
let difficulty: Difficulty = (store.get('difficulty') as Difficulty) ?? 'normal';
let factionChoice: FactionChoice = (store.get('faction') as FactionChoice) ?? 'random';
let shipTab: ShipTab = (store.get('shipTab') as ShipTab) ?? 'yard';
let inBattle = false;

function loadMeta(): Meta {
  try {
    return migrateMeta(JSON.parse(store.get('meta') ?? 'null'));
  } catch {
    return migrateMeta(null);
  }
}
let meta = loadMeta();
let siege = Math.min(Number(store.get('siege') ?? 0), meta.siegeUnlocked);
const saveMeta = () => store.set('meta', JSON.stringify(meta));

function applyLocks(): void {
  const locked = lockedContent(meta);
  setLockedCards(locked.cards);
  setLockedRelics(locked.relics);
}

/** Cosmetics: the stylesheet reads these from the page root. */
function applyCosmetics(): void {
  const root = document.documentElement;
  const css = (slot: Slot, fallback: string) => SHOP_MAP[meta.equipped[slot] ?? '']?.css ?? fallback;
  const [color, pattern] = css('paint', '#4fae7c').split('|');
  root.style.setProperty('--paint', color);
  root.dataset.pattern = pattern ?? '';
  const flag = css('flag', 'currentColor');
  root.dataset.flag = flag === 'rainbow' ? 'rainbow' : '';
  root.style.setProperty('--flag', flag === 'rainbow' ? 'currentColor' : flag);
  root.dataset.sky = (meta.equipped.sky ?? 'sky-dusk').replace('sky-', '');
  root.dataset.cardback = (meta.equipped.cardback ?? 'back-classic').replace('back-', '');
}
applyLocks();
applyCosmetics();

const factionLocked = (id: FactionId) => lockedContent(meta).factions.includes(id);
if (factionChoice !== 'random' && factionLocked(factionChoice)) factionChoice = 'random';

/** A random faction for the player (unlocked only), or any faction for an opponent. */
function randomFaction(except?: FactionId, forPlayer = false): FactionId {
  const pool = FACTIONS.filter((f) => f.id !== except && !(forPlayer && factionLocked(f.id)));
  return pool[Math.floor(Math.random() * pool.length)].id;
}
const resolveFaction = (c: FactionChoice) => (c === 'random' ? randomFaction(undefined, true) : c);

// ── Campaign save ──────────────────────────────────────────────

let oldRunNote = false;
function loadRun(): RunState | null {
  try {
    const r = JSON.parse(store.get('run') ?? 'null');
    if (r && !isCurrentRun(r)) {
      // A campaign from before Campaign 2.0: it can't be continued.
      oldRunNote = true;
      store.del('run');
      return null;
    }
    return r;
  } catch {
    return null;
  }
}
const saveRun = (r: RunState) => store.set('run', JSON.stringify(r));

// ── Shared menu pieces ─────────────────────────────────────────

function factionPicker(allowRandom = true): string {
  const tiles = FACTIONS.map((f) => {
    if (factionLocked(f.id)) {
      const how = f.id === 'stormcallers' ? `Buy in the Shipyard (⭐${SHOP_MAP['faction-stormcallers'].cost})` : `Unlocks at ${UNLOCKS.find((u) => u.id === f.id)?.at ?? '?'} Renown`;
      return `<button class="faction locked" disabled><span class="f-icon">🔒</span><b>${f.name}</b><small>${f.blurb}</small><ul><li>${how}</li></ul></button>`;
    }
    return `<button class="faction ${factionChoice === f.id ? 'sel' : ''}" data-act="faction" data-f="${f.id}">
      <span class="f-icon">${f.icon}</span><b>${f.name}</b><small>${f.blurb}</small>
      <ul>${f.perks.map((p) => `<li>${p}</li>`).join('')}</ul></button>`;
  });
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
    <p>Every ${rules.eventEvery} turns the <b>weather</b> changes the rules for both sides. Weather cards change it on the spot.</p>
    <p><b>Keywords.</b> 💠 <b>Ward</b> blocks enemy damage, spells and burns before your Armor. 🔥 <b>Burn</b> takes Altitude at the start of the enemy's turns, ignoring Armor. ⚡ <b>Combo</b> triggers if you already played a card this turn. <b>Choose</b> cards let you pick one effect. 🗑️ <b>Junk</b> does nothing and leaves the deck when played.</p>
    <p><b>Campaigns</b> cross three acts, each ending in a boss. Win battles for gold and cards, spend gold at 🛒 markets, take chances at ❓ events, and refit at ⚓ docks (upgrade, ✨ enchant or remove cards). Your <b>captain</b>'s power button can be used once per battle without ending your turn.</p>
    <p><b>On a phone</b>, tap a card to see what it would do (the +/− badges), then tap Play. Tap any icon for details.</p>
    <details class="glossary-box"><summary><b>📖 Glossary: what everything means</b></summary>
      <dl class="glossary">
        <dt>🎈 Altitude</dt><dd>How high your ship flies. Reach ${rules.winTower} to win; at 0 your ship goes down.</dd>
        <dt>🛡️ Armor</dt><dd>Plating that soaks up damage first. A 6-damage shot against 4 Armor removes the Armor and 2 Altitude.</dd>
        <dt>💠 Ward</dt><dd>A shield that blocks the next damage, spell or burn before it reaches Armor or Altitude.</dd>
        <dt>🔥 Burn</dt><dd>A burning ship loses Altitude at the start of each of its turns, straight past Armor. “Burn 2 for 3 turns” = 6 Altitude in total.</dd>
        <dt>⚙️🔮💣 Resources and income</dt><dd>Iron, Aether and Powder pay for cards. Your Foundry, Aether Well and Powder Mill add their level in resources at the start of every turn. Cards that say “+1 Foundry” raise your income for the rest of the battle.</dd>
        <dt>🔧 Modules</dt><dd>Cards that stay aboard after you play them. Each sits in one of your 3 module slots and acts at the start of every one of your turns. Example: the 🔧 Repair Crew gives +2 Armor every turn. A 4th module replaces your oldest. “Destroy an enemy module” removes their most valuable one.</dd>
        <dt>⚡ Combo</dt><dd>A bonus that happens only if you already played a card this turn (after a “Play again” card, for example).</dd>
        <dt>↻ Play again</dt><dd>After this card, you take another turn straight away.</dd>
        <dt>🔀 Choose</dt><dd>Cards with options: pick one when you play it.</dd>
        <dt>🗑️ Junk</dt><dd>Dud cards an enemy pushes into your deck. They do nothing; play or discard them to get rid of them.</dd>
        <dt>⛅ Weather</dt><dd>Every few turns the weather changes the rules for both ships (shown in the banner). Weather cards change it on the spot.</dd>
        <dt>✨ Enchantments</dt><dd>Made at docks and markets: Gilded (costs 1 less), Twin (adds Play again), Burning (adds Burn 2 for 2 turns).</dd>
        <dt>💍 Relics, 👥 crew and enemy traits</dt><dd>Permanent bonuses for a campaign. Some act every turn (for example “Each turn: +1 Armor”). Tap any icon in a battle to read it.</dd>
        <dt>🧑‍✈️ Captain’s power</dt><dd>The button above your hand: use it once per battle (twice at level 5). It doesn’t end your turn.</dd>
      </dl>
    </details>
    <p><b>Following a battle.</b> Each move plays out one effect at a time with a caption saying what happened; the <b>Last turn</b> strip above your hand lists everything since the opponent’s last turn began (tap it for the full log). Change the pace with the ▶️ speed button.</p>
    <p><button class="ghost small" data-act="tips-reset">💡 Show the battle tips again</button></p>
    <p class="dim small credit">${ICON_CREDIT} Sound effects by Kenney (kenney.nl), CC0.</p>
  </details>`;

function siegePicker(): string {
  if (meta.siegeUnlocked === 0) return '<p class="dim small">Win a campaign to unlock Storm levels: harder campaigns that pay more Renown (up to Storm 10).</p>';
  const btns = Array.from({ length: meta.siegeUnlocked + 1 }, (_, i) => `<button class="diff-btn ${i === siege ? 'sel' : ''}" data-act="siege" data-s="${i}">${i === 0 ? 'Off' : i}</button>`).join('');
  const rulesList = SIEGE_RULES.slice(1, siege + 1).map((r) => `<li>${r}</li>`).join('');
  return `<div class="diff wrap"><span>Storm:</span>${btns}</div>
    ${siege ? `<ul class="siege-rules">${rulesList}<li class="dim">+${siege * 20}% Renown</li></ul>` : ''}`;
}

function renownBar(): string {
  const next = nextUnlock(meta);
  const prev = [...UNLOCKS].reverse().find((u) => meta.renown >= u.at)?.at ?? 0;
  const pct = next ? Math.round(((meta.renown - prev) / (next.at - prev)) * 100) : 100;
  return `<div class="renown">
    <div class="renown-top"><b>⭐ ${spendable(meta)} Renown to spend</b><span>${meta.renown} lifetime${next ? ` · next unlock: ${next.icon} ${next.name} at ${next.at}` : ''}</span></div>
    <div class="bar"><i style="width:${pct}%"></i></div>
  </div>`;
}

const stars = (level: number) => '★'.repeat(level) + '☆'.repeat(5 - level);

function captainPicker(): string {
  const tiles = CAPTAINS.filter((c) => owns(meta, `captain-${c.id}`))
    .map((c) => {
      const lvl = captainLevel(meta, c.id);
      const p = c.passive(lvl);
      return `<button class="faction captain ${meta.captain === c.id ? 'sel' : ''}" data-act="captain" data-c="${c.id}">
        <span class="f-icon">${c.icon}</span><b>${esc(c.name)}</b><small class="lvl">${stars(lvl)} level ${lvl}</small>
        <ul><li>${esc(p.text)}</li><li><b>⚡ ${esc(c.power.name)}:</b> ${esc(c.power.text(lvl))}</li></ul></button>`;
    })
    .join('');
  const more = CAPTAINS.some((c) => !owns(meta, `captain-${c.id}`)) ? '<p class="dim small">More captains in the ⚓ Shipyard.</p>' : '';
  return `<h3 class="pick">Choose your captain</h3><div class="factions">${tiles}</div>${more}`;
}

function dailyCard(run: RunState | null): string {
  const d = dailyFor(today());
  const f = FACTION_MAP[d.faction];
  const mods = d.mods.map((m) => `<li>${m.icon} <b>${m.name}:</b> ${m.text}</li>`).join('');
  let action: string;
  if (!dailyAvailable(meta)) action = meta.daily?.done ? `<p class="dim small">✅ Voyage complete today: +${meta.daily.renown ?? 0} Renown. Back tomorrow!</p>` : '<p class="dim small">You’ve set sail today. A new voyage tomorrow.</p>';
  else if (run) action = '<p class="dim small">Finish or abandon your current campaign to take today’s voyage.</p>';
  else action = '<button class="primary small" data-act="start-daily">⛵ Set sail</button>';
  return `<div class="daily-card">
    <b>📅 Daily Voyage · ${today()}</b>
    <p class="dim small">The same seeded campaign for everyone today, as ${f.icon} ${f.name}. One attempt, Renown ×1.5 or more.</p>
    <ul>${mods}</ul>${action}</div>`;
}

// ── Shipyard ───────────────────────────────────────────────────

function shopTile(id: string): string {
  const item = SHOP_MAP[id];
  const have = owns(meta, id);
  let btn: string;
  if (!have) {
    const blocked = item.requires && !owns(meta, item.requires);
    btn = blocked
      ? `<button class="diff-btn" disabled>Needs ${esc(SHOP_MAP[item.requires!].name)}</button>`
      : `<button class="diff-btn buy" data-act="buy" data-id="${id}" ${canBuy(meta, id) ? '' : 'disabled'}>Buy ⭐${item.cost}</button>`;
  } else if (item.slot === 'yard') btn = `<button class="diff-btn ${isOn(meta, id) ? 'sel' : ''}" data-act="toggle" data-id="${id}">${isOn(meta, id) ? 'On' : 'Off'}</button>`;
  else if (item.slot === 'captain') {
    const cid = id.slice(8);
    btn = meta.captain === cid ? '<button class="diff-btn sel" disabled>Chosen</button>' : `<button class="diff-btn" data-act="captain" data-c="${cid}">Choose</button>`;
  } else if (item.slot === 'content') btn = '<span class="owned">✓ Owned</span>';
  else btn = meta.equipped[item.slot] === id || (!meta.equipped[item.slot] && item.cost === 0) ? '<button class="diff-btn sel" disabled>Wearing</button>' : `<button class="diff-btn" data-act="wear" data-id="${id}">Wear</button>`;
  let extra = '';
  if (item.slot === 'captain') {
    const c = CAPTAIN_MAP[id.slice(8)];
    const lvl = captainLevel(meta, c.id);
    extra = `<small>${stars(lvl)} · ${esc(c.passive(lvl).text)} · ⚡ ${esc(c.power.name)}: ${esc(c.power.text(lvl))}</small>`;
  }
  return `<div class="shop-item ${have ? 'owned' : ''} s-${item.slot}" ${item.css ? `style="--swatch:${item.css.split('|')[0]}"` : ''}>
    <span class="si-icon">${item.icon}</span><div class="si-text"><b>${esc(item.name)}</b><small>${esc(item.text)}</small>${extra}</div>${btn}</div>`;
}

function shipyardBody(): string {
  const tabs = (['yard', 'captain', 'content', 'cosmetic'] as ShipTab[])
    .map((t) => `<button class="tab small ${t === shipTab ? 'sel' : ''}" data-act="shiptab" data-t="${t}">${{ yard: '🔧 Upgrades', captain: '🧑‍✈️ Captains', content: '📦 New content', cosmetic: '🎨 Looks' }[t]}</button>`)
    .join('');
  let items: string;
  if (shipTab === 'captain') {
    const navigator = CAPTAIN_MAP.navigator;
    const lvl = captainLevel(meta, 'navigator');
    items = `<div class="shop-item owned"><span class="si-icon">${navigator.icon}</span><div class="si-text"><b>${navigator.name}</b><small>${navigator.blurb}</small><small>${stars(lvl)} · ${esc(navigator.passive(lvl).text)} · ⚡ ${esc(navigator.power.name)}: ${esc(navigator.power.text(lvl))}</small></div>${meta.captain === 'navigator' ? '<button class="diff-btn sel" disabled>Chosen</button>' : '<button class="diff-btn" data-act="captain" data-c="navigator">Choose</button>'}</div>`;
    items += SHOP.filter((i) => i.slot === 'captain').map((i) => shopTile(i.id)).join('');
    items += `<p class="dim small">Captains level up as you win campaign battles with them (XP needed: ${LEVEL_XP.slice(1).join(', ')}). Level 3 adds a passive bonus; level 5 lets you use the power twice per battle.</p>`;
  } else if (shipTab === 'cosmetic') {
    const group = (slot: Slot, title: string) => `<h4 class="shop-h">${title}</h4>${SHOP.filter((i) => i.slot === slot).map((i) => shopTile(i.id)).join('')}`;
    items = group('paint', 'Envelope paint') + group('flag', 'Flags') + group('sky', 'Battle skies') + group('cardback', 'Card backs');
  } else items = SHOP.filter((i) => i.slot === shipTab).map((i) => shopTile(i.id)).join('');
  return `<p class="lead">Spend Renown on upgrades, captains, new cards and new looks. Lifetime Renown still counts toward unlocks.</p>
    ${renownBar()}<div class="tabs">${tabs}</div><div class="shop">${items}</div>`;
}

// ── Progress ───────────────────────────────────────────────────

function progressBody(): string {
  const unlocks = UNLOCKS.map((u) => {
    const got = meta.renown >= u.at;
    return `<div class="unlock ${got ? 'got' : ''}"><span class="u-icon">${got ? u.icon : '🔒'}</span>
      <div><b>${u.name}</b> <small>${got ? 'Unlocked' : `${u.at} Renown`}</small><p>${u.text}</p></div></div>`;
  }).join('');
  const levels = SIEGE_RULES.slice(1)
    .map((r, i) => `<li class="${i + 1 <= meta.siegeUnlocked ? '' : 'dim'}"><b>Storm ${i + 1}</b> ${i + 1 <= meta.siegeUnlocked ? '' : '🔒'} ${r}</li>`)
    .join('');
  const feats = FEATS.map((f) => {
    const got = meta.feats.includes(f.id);
    return `<button class="feat ${got ? 'got' : ''} ${meta.title === f.id ? 'sel' : ''}" ${got ? `data-act="title" data-f="${f.id}"` : 'disabled'} title="${got ? 'Tap to wear this title' : ''}">
      <span>${got ? f.icon : '🔒'}</span><b>${esc(f.name)}</b><small>${esc(f.text)} · ⭐${f.renown}</small></button>`;
  }).join('');
  const log = meta.log.length
    ? meta.log
        .map((e, i) => {
          const f = FACTION_MAP[e.faction];
          const c = e.captain ? CAPTAIN_MAP[e.captain] : undefined;
          return `<button class="log-row" data-act="logdeck" data-i="${i}"><span>${e.result === 'won' ? '👑' : '🏳️'}</span>
            <span>${e.date}${e.daily ? ' · 📅' : ''}</span><span>${f?.icon ?? ''} ${c?.icon ?? ''}</span>
            <span>${e.siege ? `⛈️${e.siege} · ` : ''}Act ${e.act} · ${e.floors} floors</span><b>⭐${e.renown}</b></button>`;
        })
        .join('')
    : '<p class="dim small">Your finished campaigns will be logged here.</p>';
  return `<p class="lead">Every campaign earns Renown, win or lose.</p>
    ${renownBar()}
    <div class="unlocks">${unlocks}</div>
    <h3 class="pick">Feats ${meta.title ? `<small class="dim">· your title: ${esc(FEAT_MAP[meta.title]?.name ?? '')}</small>` : ''}</h3>
    <p class="dim small">Earn Renown for special achievements. Tap an earned feat to wear it as your title.</p>
    <div class="feats">${feats}</div>
    <h3 class="pick">Storm levels</h3>
    <p class="dim small">Win a campaign to unlock the next level, up to Storm ${MAX_SIEGE}. Each adds to the ones before.</p>
    <ol class="siege-list">${levels}</ol>
    <h3 class="pick">📖 Captain’s Log</h3>
    <div class="captain-log">${log}</div>
    <p class="record">Campaigns ${meta.runs} · won ${meta.wins} · most floors ${meta.bestFloor || '–'}</p>
    ${syncCard()}`;
}

// ── Main menu ──────────────────────────────────────────────────

function showMenu(): void {
  const run = loadRun();
  // A finished campaign whose results haven't been seen yet: show them (and award its Renown) first.
  if (mode === 'campaign' && run && (run.status === 'won' || run.status === 'lost')) return showRunEnd(run);
  const turns = yourTurnCount();
  const tabs = (['quick', 'draft', 'campaign', 'duels', 'shipyard', 'progress'] as Mode[])
    .map((m) => `<button class="tab ${m === mode ? 'sel' : ''}" data-act="mode" data-m="${m}">${{ quick: '⚔️ Quick', draft: '🃏 Draft', campaign: '🗺️ Campaign', duels: `🤝 Duels${turns ? ` <span class="badge">${turns}</span>` : ''}`, shipyard: '⚓ Shipyard', progress: '⭐ Progress' }[m]}</button>`)
    .join('');

  let body = '';
  if (mode === 'quick') {
    body = `<p class="lead">One battle with the full deck of every card you own.</p>
      ${factionPicker()}${difficultyPicker()}
      <button class="primary" data-act="start-quick">Start battle</button>`;
  } else if (mode === 'draft') {
    body = `<p class="lead">Build your deck: ${DRAFT_PICKS} times, pick 1 of 3 cards to add to an ${STARTER_DECK.length}-card starter deck. The opponent drafts too.</p>
      ${factionPicker()}${difficultyPicker()}
      <button class="primary" data-act="start-draft">Start draft</button>`;
  } else if (mode === 'duels') {
    body = duelsBody();
  } else if (mode === 'shipyard') {
    body = shipyardBody();
  } else if (mode === 'progress') {
    body = progressBody();
  } else if (run && run.status !== 'won' && run.status !== 'lost') {
    const f = FACTION_MAP[run.faction];
    const cap = run.captain ? CAPTAIN_MAP[run.captain.id] : undefined;
    body = `<p class="lead">${run.daily ? '📅 Daily Voyage in progress' : 'Campaign in progress'}${run.siege ? ` · Storm ${run.siege}` : ''}</p>
      <div class="run-summary">
        <div>${f.icon} <b>${f.name}</b> ${cap ? `· ${cap.icon} ${esc(cap.name)}` : ''}</div>
        <div>Act ${run.act} of ${ACTS} · floor ${Math.max(1, run.floor + 1)} of ${FLOORS_PER_ACT}</div>
        <div>${'🚩'.repeat(run.lives)}<span class="dim">${'🏳️'.repeat(Math.max(0, run.maxLives - run.lives))}</span> · 💰 ${run.gold}</div>
        <div>${run.deck.length} cards ${[...run.relics, ...run.crew].map(relicChip).join('')}</div>
      </div>
      <button class="primary" data-act="continue-run">Continue campaign</button>
      <button class="ghost" data-act="abandon-run">Abandon and start over</button>`;
  } else {
    const opts = runOptionsFromMeta(meta);
    const perks = [opts.startRelic && '🎒 choose a starting relic', opts.startCard && '📜 a free card pick', opts.gold && `👛 ${opts.gold} gold`, opts.extraLives && '🚩 a spare banner'].filter(Boolean);
    body = `${oldRunNote ? '<p class="dim small">Your previous campaign was from before the big campaign update and couldn’t be continued. Your Renown and unlocks are safe.</p>' : ''}
      <p class="lead">Cross ${ACTS} acts (${ACT_INFO.map((a) => `${a.icon} ${a.name}`).join(', ')}), each ending in a boss. Win gold and cards, buy at markets, take chances at events and refit at docks.</p>
      ${renownBar()}
      ${dailyCard(run)}
      ${factionPicker(false)}
      ${captainPicker()}
      ${siegePicker()}
      ${perks.length ? `<p class="dim small">You start with ${perks.join(', ')}.</p>` : ''}
      <button class="primary" data-act="start-run">Begin campaign</button>`;
  }

  const title = meta.title ? `<p class="title-badge">${FEAT_MAP[meta.title]?.icon ?? ''} ${esc(FEAT_MAP[meta.title]?.name ?? '')}</p>` : '';
  const d = showDialog(`<h2>Sky Armada</h2>${title}<div class="tabs">${tabs}</div>${body}${HOW_TO}`);
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
      sfx.click();
      showMenu();
    },
    captain: (el) => {
      meta.captain = el.dataset.c!;
      saveMeta();
      sfx.click();
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
    shiptab: (el) => {
      shipTab = el.dataset.t as ShipTab;
      store.set('shipTab', shipTab);
      sfx.click();
      showMenu();
    },
    buy: (el) => {
      const id = el.dataset.id!;
      if (!canBuy(meta, id)) return void sfx.error();
      meta = buy(meta, id);
      saveMeta();
      applyLocks();
      applyCosmetics();
      unlock();
      sfx.coin();
      setTimeout(sfx.unlock, 200);
      toast(`<div class="toast-icon">${SHOP_MAP[id].icon}</div><b>${esc(SHOP_MAP[id].name)}</b><span>Yours! ⭐${spendable(meta)} Renown left.</span>`);
      showMenu();
    },
    toggle: (el) => {
      meta = toggleUpgrade(meta, el.dataset.id!);
      saveMeta();
      sfx.click();
      showMenu();
    },
    wear: (el) => {
      const item = SHOP_MAP[el.dataset.id!];
      meta.equipped[item.slot] = item.id;
      saveMeta();
      applyCosmetics();
      sfx.confirm();
      showMenu();
    },
    title: (el) => {
      meta.title = meta.title === el.dataset.f ? undefined : el.dataset.f;
      saveMeta();
      sfx.click();
      showMenu();
    },
    logdeck: (el) => {
      const e = meta.log[Number(el.dataset.i)];
      if (e) showDeck(e.deck, showMenu, `Deck from ${e.date}`);
    },
    'start-quick': () => startQuick(),
    'start-draft': () => startDraft(),
    'start-run': () => {
      const run = newRun(resolveFaction(factionChoice), undefined, { ...runOptionsFromMeta(meta), siege });
      saveRun(run);
      unlock();
      sfx.confirm();
      route(run);
    },
    'start-daily': () => startDaily(),
    'continue-run': () => {
      unlock();
      sfx.click();
      route(loadRun()!);
    },
    'abandon-run': () => {
      if (!confirm('Abandon this campaign? It ends now (Renown is still awarded for how far you got).')) return;
      const run = loadRun();
      if (run) {
        run.status = 'lost';
        saveRun(run);
        return showRunEnd(run);
      }
      showMenu();
    },
    'tips-reset': () => {
      resetTips();
      toast('<b>💡 Tips are back on</b><span>They’ll appear in your next battle.</span>');
    },
    ...syncHandlers,
    ...duelHandlers,
  });
  // Duel list and the "your turn" badge, fetched in the background.
  void refreshDuels();
}

function startDaily(): void {
  if (!dailyAvailable(meta)) return;
  const date = today();
  const d = dailyFor(date);
  const mods = d.mods.map((m) => m.id);
  meta.daily = { date, done: false };
  saveMeta();
  const opts = runOptionsFromMeta(meta);
  let run = newRun(d.faction, d.seed, { ...opts, siege: mods.includes('storm') ? 3 : 0, daily: date, dailyMods: mods });
  run = applyDailyMods(run, mods);
  saveRun(run);
  unlock();
  sfx.confirm();
  route(run);
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
    case 'act': return showActComplete(run);
    case 'camp': return showCamp(run);
    case 'treasure': return showTreasure(run);
    case 'event': return showEvent(run);
    case 'market': return showMarket(run);
    default: return showRunEnd(run);
  }
}

function runHeader(run: RunState): string {
  const f = FACTION_MAP[run.faction];
  const act = ACT_INFO[run.act - 1];
  const cap = run.captain ? CAPTAIN_MAP[run.captain.id] : undefined;
  return `<div class="run-header">
    <span>${f.icon} ${f.name}</span>
    ${cap ? `<span data-info="${esc(`${cap.icon} ${cap.name} (level ${run.captain!.level}): ${cap.passive(run.captain!.level).text}. Power: ${cap.power.name}: ${cap.power.text(run.captain!.level)}`)}">${cap.icon} Lv${run.captain!.level}</span>` : ''}
    <span data-info="${esc(`${act.name}: ${act.text}`)}">${act.icon} Act ${run.act}</span>
    ${run.siege ? `<span class="siege-tag" data-info="${esc(SIEGE_RULES.slice(1, run.siege + 1).join(' · '))}">⛈️ Storm ${run.siege}</span>` : ''}
    ${run.daily ? '<span class="siege-tag">📅 Daily</span>' : ''}
    <span title="Banners: each lost battle costs one">${'🚩'.repeat(run.lives)}<span class="dim">${'🏳️'.repeat(Math.max(0, run.maxLives - run.lives))}</span></span>
    <span class="gold" data-info="Gold: spend it at markets">💰 ${run.gold}</span>
    <span class="relics">${run.relics.map(relicChip).join('')}${run.crew.length ? ` <span class="crew">${run.crew.map(relicChip).join('')}</span>` : ''}${!run.relics.length && !run.crew.length ? '<span class="dim">No relics</span>' : ''}</span>
    <button class="ghost small" data-act="deck">Deck (${run.deck.length})</button>
  </div>`;
}

function showMap(run: RunState): void {
  const act = ACT_INFO[run.act - 1];
  const rows = run.map
    .map((floor, fi) => {
      const nodes = floor
        .map((n, ni) => {
          const info = NODE_INFO[n.type];
          const chosen = run.path[fi] === ni;
          const state = fi <= run.floor ? (chosen ? 'done' : 'skipped') : fi === run.floor + 1 ? 'next' : 'locked';
          const sub = n.enemy ? `<small>${esc(n.enemy.name)}</small>` : '';
          const traits = n.enemy?.relics.filter((r) => r.startsWith('trait-')).map((r) => RELIC_MAP[r].icon).join('') ?? '';
          return `<button class="node n-${n.type} ${state}" ${state === 'next' ? `data-act="node" data-i="${ni}"` : 'disabled'} title="${esc(info.text)}">
            <span class="n-icon">${info.icon}</span><b>${info.label}</b>${sub}${traits ? `<small>${traits}</small>` : ''}</button>`;
        })
        .join('');
      return `<div class="floor"><span class="floor-num">${fi + 1}</span>${nodes}</div>`;
    })
    .reverse()
    .join('');
  const d = showDialog(
    `<h2>${act.icon} Act ${run.act}: ${act.name}</h2>${runHeader(run)}
    <p class="lead">${act.text} Choose where to go next.</p>
    ${run.eventResult ? `<p class="event-result">${esc(run.eventResult)}</p>` : ''}
    <div class="map">${rows}</div>
    <button class="ghost" data-act="menu">Save and quit to menu</button>`,
    true,
  );
  bind(d, {
    node: (el) => {
      sfx.confirm();
      const next = chooseNode(run, Number(el.dataset.i));
      saveRun(next);
      route(next);
    },
    deck: () => showDeck(run.deck, () => showMap(run)),
    menu: showMenu,
  });
  d.querySelector('.node.next')?.scrollIntoView({ block: 'center' });
}

function campaignBattle(run: RunState): void {
  const { run: r, enemy, enemyDeck, myRelics } = battleSetup(run);
  saveRun(r);
  const node = currentNode(r)!;
  const traits = enemy.relics.filter((x) => x.startsWith('trait-') || x.startsWith('boss-')).map((x) => `${RELIC_MAP[x].icon} ${RELIC_MAP[x].name}`);
  const taunt = enemy.boss ? BOSSES.find((b) => b.id === enemy.boss) : undefined;
  battle(
    {
      enemyName: enemy.name,
      factions: [r.faction, enemy.faction],
      difficulty: enemy.difficulty,
      decks: [r.deck, enemyDeck],
      relics: [myRelics, enemy.relics],
      captain: r.captain,
      eventEvery: enemy.eventEvery,
      taunt: taunt ? [{ text: taunt.start, lang: 'en', voice: taunt.voice }] : undefined,
      intro: `${NODE_INFO[node.type].label} · Act ${r.act}, floor ${r.floor + 1}${traits.length ? ' · ' + traits.join(', ') : ''}`,
    },
    (s) => {
      const won = s.winner === 0;
      const next = finishBattle(r, won, s.turn, s.winKind);
      saveRun(next);
      if (won && taunt) voice([{ text: taunt.end, lang: 'en', voice: taunt.voice }]);
      if (won && next.pendingGold) setTimeout(sfx.coin, 400);
      const lostLine = !won
        ? next.status === 'lost'
          ? '<p class="lead">Your last banner falls.</p>'
          : `<p class="lead">You lose a banner. ${'🚩'.repeat(next.lives)} left.${node.type === 'boss' ? ` ${esc(enemy.name)} awaits your return.` : ''}</p>`
        : `<p class="lead gold-line">💰 +${next.pendingGold ?? 0} gold</p>`;
      const d = showDialog(`
        <h2 class="${won ? 'win' : 'lose'}">${won && node.type === 'boss' ? `👑 ${esc(enemy.name)} defeated!` : titleFor(s)}</h2>
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
    const start = run.floor < 0 && run.act === 1;
    const d = showDialog(
      `<h2>${start ? '🎒 Supplies for the voyage' : 'Spoils of war'}</h2>${runHeader(run)}
      <p class="lead">${start ? 'Your Renown has earned you a head start.' : ''} ${run.pendingCards ? 'Add one card to your deck' : ''}${run.pendingCards && run.pendingRelics ? ' and claim a relic' : run.pendingRelics ? 'Claim a relic' : ''}.</p>
      <div class="offer" id="offer"></div>
      ${run.pendingCards && run.rerolls > 0 ? `<button class="ghost small" data-act="reroll">🔭 Reroll cards (${run.rerolls} left)</button>` : ''}
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
      reroll: () => {
        run = rerollReward(run);
        saveRun(run);
        pickedCard = null;
        sfx.shuffle();
        render();
      },
      deck: () => showDeck(run.deck, render),
    });
  };
  render();
}

function showActComplete(run: RunState): void {
  let pickedCard: string | null = null;
  let pickedRelic: string | null = null;
  const boss = BOSSES[run.act - 1];
  const nextAct = ACT_INFO[run.act];
  const render = () => {
    const d = showDialog(
      `<h2 class="win">👑 Act ${run.act} complete!</h2>${runHeader(run)}
      <p class="lead">${esc(boss.name)} is defeated. Claim a <b>legendary card</b> and a relic, then sail on to ${nextAct.icon} ${nextAct.name}. Your crew recovered a banner.</p>
      <div class="offer legendary" id="offer"></div>
      <div class="relic-row">${(run.pendingRelics ?? []).map((id) => relicTile(id, id === pickedRelic)).join('')}</div>
      <button class="primary" data-act="take">${pickedCard || pickedRelic ? `Onward to Act ${run.act + 1}` : 'Skip and sail on'}</button>`,
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
        sfx.unlock();
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

// ── Docks ──────────────────────────────────────────────────────

function showCamp(run: RunState): void {
  const canRest = canCamp(run, { kind: 'rest' });
  const canRemove = run.deck.length > MIN_DECK;
  const left = run.dockLeft ?? 1;
  const d = showDialog(
    `<h2>⚓ Dock</h2>${runHeader(run)}
    <p class="lead">The ground crew salutes. ${left > 1 ? `Choose <b>${left}</b> refits.` : 'Choose one refit.'}</p>
    <div class="camp-options four">
      <button class="camp-opt" data-act="upgrade"><span>⚒️</span><b>Upgrade a card</b><small>Bigger numbers, permanently.</small></button>
      <button class="camp-opt" data-act="enchant"><span>✨</span><b>Enchant a card</b><small>Gilded, Twin or Burning.</small></button>
      <button class="camp-opt" data-act="remove" ${canRemove ? '' : 'disabled'}><span>✂️</span><b>Remove a card</b><small>${canRemove ? 'Thin your deck.' : `Deck can't go below ${MIN_DECK}.`}</small></button>
      <button class="camp-opt" data-act="rest" ${canRest ? '' : 'disabled'}><span>🚩</span><b>Rest</b><small>${canRest ? 'Recover a banner.' : 'Banners are full.'}</small></button>
    </div>
    ${left < run.dockActions ? '<button class="ghost" data-act="leave">Set sail</button>' : ''}`,
    true,
  );
  const after = (next: RunState) => {
    saveRun(next);
    route(next);
  };
  bind(d, {
    upgrade: () =>
      pickCard(run, '⚒️ Upgrade which card?', 'Cards show their upgraded version.', (i) => canCamp(run, { kind: 'upgrade', index: i }), (id) => upgradeId(id), (i) => after(camp(run, { kind: 'upgrade', index: i })), () => showCamp(run)),
    enchant: () => pickEnchant((ench) =>
      pickCard(run, `${ENCHANTS[ench].icon} ${ENCHANTS[ench].name}: enchant which card?`, ENCHANTS[ench].text, (i) => canCamp(run, { kind: 'enchant', index: i, ench }), (id) => enchantId(id, ench), (i) => after(camp(run, { kind: 'enchant', index: i, ench })), () => showCamp(run)),
      () => showCamp(run)),
    remove: () =>
      pickCard(run, '✂️ Remove which card?', 'Tap a card to remove it from your deck.', (i) => canCamp(run, { kind: 'remove', index: i }), (id) => id, (i) => after(camp(run, { kind: 'remove', index: i })), () => showCamp(run)),
    rest: () => {
      sfx.build();
      after(camp(run, { kind: 'rest' }));
    },
    leave: () => after(leaveDock(run)),
    deck: () => showDeck(run.deck, () => showCamp(run)),
  });
}

function pickEnchant(then: (e: Enchant) => void, back: () => void): void {
  const d = showDialog(
    `<h2>✨ Choose an enchantment</h2>
    <div class="camp-options">${(Object.keys(ENCHANTS) as Enchant[]).map((e) => `<button class="camp-opt" data-act="e" data-e="${e}"><span>${ENCHANTS[e].icon}</span><b>${ENCHANTS[e].name}</b><small>${ENCHANTS[e].text}</small></button>`).join('')}</div>
    <button class="ghost" data-act="back">Back</button>`,
    true,
  );
  bind(d, { e: (el) => then(el.dataset.e as Enchant), back });
}

/** Pick a card from the deck: shows each card as it would become, greys out ones that can't be chosen. */
function pickCard(run: RunState, title: string, lead: string, ok: (i: number) => boolean, preview: (id: string) => string, onPick: (i: number) => void, back: () => void): void {
  const d = showDialog(`<h2>${title}</h2><p class="lead">${lead}</p><div class="deck-grid" id="grid"></div><button class="ghost" data-act="back">Back</button>`, true);
  const grid = $('grid');
  const order = run.deck.map((id, i) => ({ id, i })).sort((a, b) => card(a.id).type.localeCompare(card(b.id).type) || card(a.id).cost - card(b.id).cost);
  for (const { id, i } of order) {
    const can = ok(i);
    const el = cardFace(can ? preview(id) : id);
    el.classList.add(can ? 'pickable' : 'unaffordable');
    if (can)
      el.addEventListener('click', () => {
        sfx.build();
        onPick(i);
      });
    grid.appendChild(el);
  }
  bind(d, { back });
}

// ── Markets ────────────────────────────────────────────────────

function showMarket(run: RunState): void {
  const after = (next: RunState) => {
    saveRun(next);
    sfx.coin();
    showMarket(next);
  };
  const items = run.market ?? [];
  const relicItems = items
    .map((it, i) => ({ it, i }))
    .filter((x) => x.it.kind !== 'card')
    .map(({ it, i }) => {
      const r = RELIC_MAP[it.id];
      return `<button class="relic-tile market ${it.sold ? 'sold' : ''}" ${it.sold || run.gold < it.price ? 'disabled' : ''} data-act="buy" data-i="${i}">
        <span class="r-icon">${r.icon}</span><b>${esc(r.name)}</b><small>${esc(r.text)}</small><span class="price">${it.sold ? 'Sold' : `💰 ${it.price}`}</span></button>`;
    })
    .join('');
  const svc = (kind: string, icon: string, label: string, price: number, enabled: boolean) =>
    `<button class="camp-opt" data-act="svc" data-k="${kind}" ${enabled ? '' : 'disabled'}><span>${icon}</span><b>${label}</b><small>💰 ${price}</small></button>`;
  const anyIndex = (pred: (id: string, i: number) => boolean) => run.deck.some((id, i) => pred(id, i));
  const d = showDialog(
    `<h2>🛒 Sky Market</h2>${runHeader(run)}
    <p class="lead">Merchants call from their stalls. You have <b>💰 ${run.gold}</b> gold.</p>
    <div class="offer" id="offer"></div>
    <div class="relic-row">${relicItems}</div>
    <h3 class="pick">Services</h3>
    <div class="camp-options four">
      ${svc('remove', '✂️', 'Remove a card', removePrice(run), anyIndex((_id, i) => canService(run, { kind: 'remove', index: i })))}
      ${svc('upgrade', '⚒️', 'Upgrade a card', servicePrice(run, 'upgrade'), anyIndex((_id, i) => canService(run, { kind: 'upgrade', index: i })))}
      ${svc('enchant', '✨', 'Enchant a card', servicePrice(run, 'enchant'), anyIndex((_id, i) => canService(run, { kind: 'enchant', index: i, ench: 'g' })))}
      ${svc('banner', '🚩', 'Recover a banner', servicePrice(run, 'banner'), canService(run, { kind: 'banner' }))}
    </div>
    <button class="primary" data-act="leave">Leave market</button>`,
    true,
  );
  const offer = $('offer');
  items.forEach((it, i) => {
    if (it.kind !== 'card') return;
    const el = cardFace(it.id);
    const can = !it.sold && run.gold >= it.price;
    el.classList.add(can ? 'pickable' : 'unaffordable');
    if (it.sold) el.classList.add('sold');
    el.insertAdjacentHTML('beforeend', `<span class="price-tag">${it.sold ? 'Sold' : `💰 ${it.price}`}</span>`);
    if (can) el.addEventListener('click', () => after(buyItem(run, i)));
    offer.appendChild(el);
  });
  const back = () => showMarket(run);
  bind(d, {
    buy: (el) => after(buyItem(run, Number(el.dataset.i))),
    svc: (el) => {
      const k = el.dataset.k as Service['kind'];
      if (k === 'banner') return after(buyService(run, { kind: 'banner' }));
      if (k === 'remove')
        return pickCard(run, '✂️ Remove which card?', `Costs 💰 ${removePrice(run)}.`, (i) => canService(run, { kind: 'remove', index: i }), (id) => id, (i) => after(buyService(run, { kind: 'remove', index: i })), back);
      if (k === 'upgrade')
        return pickCard(run, '⚒️ Upgrade which card?', `Costs 💰 ${servicePrice(run, 'upgrade')}.`, (i) => canService(run, { kind: 'upgrade', index: i }), (id) => upgradeId(id), (i) => after(buyService(run, { kind: 'upgrade', index: i })), back);
      pickEnchant(
        (ench) => pickCard(run, `${ENCHANTS[ench].icon} Enchant which card?`, `Costs 💰 ${servicePrice(run, 'enchant')}. ${ENCHANTS[ench].text}`, (i) => canService(run, { kind: 'enchant', index: i, ench }), (id) => enchantId(id, ench), (i) => after(buyService(run, { kind: 'enchant', index: i, ench })), back),
        back,
      );
    },
    leave: () => {
      const next = leaveMarket(run);
      saveRun(next);
      route(next);
    },
    deck: () => showDeck(run.deck, back),
  });
}

// ── Events ─────────────────────────────────────────────────────

function showEvent(run: RunState): void {
  const ev = EVENT_DEF[currentNode(run)!.event!];
  const d = showDialog(
    `<h2>${ev.icon} ${esc(ev.title)}</h2>${runHeader(run)}
    <p class="lead event-text">${esc(ev.text)}</p>
    <div class="event-choices">${ev.choices
      .map((c, i) => `<button class="event-choice" data-act="choose" data-i="${i}" ${canChoose(run, i) ? '' : 'disabled'}><b>${esc(c.label)}</b><small>${esc(c.hint)}${c.needGold && run.gold < c.needGold ? ' (not enough gold)' : ''}</small></button>`)
      .join('')}</div>`,
    true,
  );
  sfx.event();
  bind(d, {
    choose: (el) => {
      sfx.confirm();
      const next = resolveEvent(run, Number(el.dataset.i));
      saveRun(next);
      if (next.status === 'battle') return route(next);
      const dd = showDialog(`<h2>${ev.icon} ${esc(ev.title)}</h2><p class="lead">${esc(next.eventResult ?? '')}</p><button class="primary" data-act="go">Continue</button>`);
      bind(dd, { go: () => route(next) });
    },
    deck: () => showDeck(run.deck, () => showEvent(run)),
  });
}

function showDeck(deck: string[], back: () => void, title = `Your deck (${deck.length})`): void {
  const d = showDialog(`<h2>${esc(title)}</h2><div class="deck-grid" id="grid"></div><button class="primary" data-act="back">Back</button>`, true);
  const grid = $('grid');
  [...deck]
    .sort((a, b) => card(a).type.localeCompare(card(b).type) || card(a).cost - card(b).cost)
    .forEach((id) => grid.appendChild(cardFace(id)));
  bind(d, { back });
}

// ── End of a campaign ──────────────────────────────────────────

function showRunEnd(run: RunState): void {
  const won = run.status === 'won';
  if (won) sfx.win();
  // Award Renown once per run; keep the breakdown so a reload shows the same screen.
  let result: RunResult | null = JSON.parse(store.get('runResult') ?? 'null');
  if (!run.scored) {
    result = applyRun(meta, run);
    meta = result.meta;
    saveMeta();
    store.set('runResult', JSON.stringify(result));
    run.scored = true;
    saveRun(run);
    applyLocks();
    if (result.feats.length || result.levelUp) setTimeout(sfx.unlock, 600);
  }
  const level = result?.levelUp ? CAPTAIN_MAP[result.levelUp.captain] : undefined;
  const breakdown = result
    ? `<div class="renown-gain">
        ${result.lines.map((l) => `<div><span>${esc(l.label)}</span><b>+${l.amount}</b></div>`).join('')}
        ${result.feats.map((f) => `<div class="feat-line"><span>${f.icon} Feat: ${esc(f.name)}</span><b>+${f.renown}</b></div>`).join('')}
        <div class="total"><span>Renown earned</span><b>⭐ +${result.gained}</b></div>
      </div>
      ${level ? `<div class="unlock got new"><span class="u-icon">${level.icon}</span><div><b>${esc(level.name)} reached level ${result!.levelUp!.to}!</b><p>${esc(level.passive(result!.levelUp!.to).text)} · ⚡ ${esc(level.power.text(result!.levelUp!.to))}</p></div></div>` : ''}
      ${result.unlocked.map((u) => `<div class="unlock got new"><span class="u-icon">${u.icon}</span><div><b>Unlocked: ${u.name}</b><p>${u.text}</p></div></div>`).join('')}
      ${result.newSiege ? `<div class="unlock got new"><span class="u-icon">⛈️</span><div><b>Unlocked: Storm ${result.newSiege}</b><p>${SIEGE_RULES[result.newSiege]}</p></div></div>` : ''}
      ${renownBar()}`
    : '';
  const d = showDialog(`
    <h2 class="${won ? 'win' : 'lose'}">${won ? '👑 The skies are yours!' : 'Campaign over'}</h2>
    <p class="lead">${won ? `All ${ACTS} bosses defeated. The High Harbor is yours.` : `You reached Act ${run.act}, floor ${run.floor + 1}.`}</p>
    ${runHeader(run)}
    <p class="record">Battles won ${run.battles.won} · lost ${run.battles.lost} · bosses ${run.bosses} · gold spent ${run.goldSpent}</p>
    ${breakdown}
    <button class="primary" data-act="shipyard">⚓ Visit the Shipyard</button>
    <button class="ghost" data-act="new">New campaign</button>
    <button class="ghost" data-act="menu">Menu</button>`);
  const clear = () => {
    store.del('run');
    store.del('runResult');
  };
  bind(d, {
    shipyard: () => {
      clear();
      mode = 'shipyard';
      showMenu();
    },
    new: () => {
      clear();
      mode = 'campaign';
      showMenu();
    },
    menu: () => {
      clear();
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
  if (inDuel()) {
    // Duels are saved after every move: leave without asking.
    leaveDuel();
    abandonBattle();
    inBattle = false;
    mode = 'duels';
  } else if (inBattle && getState().winner === null) {
    const campaignNote = mode === 'campaign' && loadRun()?.status === 'battle' ? ' Your campaign is saved; the battle will restart.' : '';
    if (!confirm(`Leave this battle?${campaignNote}`)) return;
    abandonBattle();
    inBattle = false;
  }
  showMenu();
});

initBattleChrome();
initInfoPops();
initDuels({ showMenu, battle });
showMenu();
// Opened from a duel invite link: accept it (or open it, if it's already ours).
void handleInviteLink().then((opened) => {
  if (opened) mode = 'duels';
});
// Pick up progress made on other devices (reloads once if there was any, while still in the menu).
syncOnOpen(undefined, () => afterSync(true));
// Leaving the page (switching apps): save straight away rather than waiting.
document.addEventListener('visibilitychange', () => {
  if (document.hidden && isLinked()) void sync().catch(() => {});
});
