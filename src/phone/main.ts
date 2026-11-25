// Toy Phone: a pretend phone for toddlers. Every key beeps and says its number; the call button
// rings someone (family, animals, Santa) who chats back. Sometimes the phone rings by itself!
import { bindVoiceButton, en, es, playBlob, preload, say, sfx, stopSpeech, tone, unlock } from '../kids/audio';
import { burst } from '../kids/fx';
import { keepAwake, lockGestures } from '../kids/hold';
import { askGrownUp, guardExit, guardLinks } from '../kids/gate';
import { bindLangButtons, getLang } from '../kids/lang';
import { stayPortrait } from '../kids/orient';
import { downloadBackup, restoreBackup } from '../kids/backup';
import { forget, isLinked, lastSynced, link, sync, unlink } from '../kids/sync';
import {
  addExtra, allContacts, customOf, reloadContacts, extraOf, EXTRA_EMOJI, findContact, isExtra, isHidden, nameOf as contactName,
  removeExtra, setCustom, setHidden, updateExtra, visibleContacts,
} from './contacts';
import { DTMF, KEYS, keyWord, lineFor, whoAnswers, type Contact, type Key, type LineKind } from './game';
import {
  canRecord, countRecordings, deleteAllFor, deleteRecording, getRecording, loadRecordings, recordingFor,
  recordingStore, releaseMic, saveRecording, SLOT_INFO, SLOTS, startRecording, stopRecording, type Slot,
} from './recordings';

const $ = (id: string) => document.getElementById(id)!;
const rng = Math.random;
const INCOMING_AFTER_MS = 7000; // idle time before the phone rings by itself
const INCOMING_GAP_MS = 12000; // breathing room between surprise calls
const MAX_DIGITS = 10;

let digits = '';
let inCall: Contact | null = null;
let connected = false;
let callStart = 0;
let callTimer = 0;
let chatTimer = 0;
let chats = 0;
let idleTimer = 0;
let lastIncoming = 0;
let ringLoop = 0;
let incoming: Contact | null = null;
let playing = false;

// ── Contacts, names and photos (see contacts.ts) ──────────────

const nameOf = (c: Contact) => contactName(c, getLang());

function avatarHtml(c: Contact): string {
  const photo = customOf(c.id)?.photo;
  return photo
    ? `<img src="${photo}" alt="">`
    : `<span class="emoji" style="background:${c.color}">${c.emoji}</span>`;
}

function setAvatar(el: HTMLElement, c: Contact): void {
  el.innerHTML = avatarHtml(c);
}

// ── Sounds ─────────────────────────────────────────────────────

function dtmf(key: Key): void {
  const [lo, hi] = DTMF[key];
  tone(lo, 0, 0.16, 'sine', 0.1);
  tone(hi, 0, 0.16, 'sine', 0.1);
}

/** Two rings of the "brrr… brrr…" you hear while calling someone. */
function ringback(): void {
  for (const t of [0, 1.3]) {
    tone(440, t, 0.9, 'sine', 0.08);
    tone(480, t, 0.9, 'sine', 0.08);
  }
}

/** A cheerful ringtone for incoming calls; repeats until answered. */
function ringtone(): void {
  [988, 1319, 988, 1319, 988, 1319].forEach((f, i) => tone(f, i * 0.11, 0.1, 'triangle', 0.16));
}

function hangupTone(): void {
  tone(620, 0, 0.14, 'sine', 0.12);
  tone(480, 0.16, 0.2, 'sine', 0.12);
}

// ── Keypad ─────────────────────────────────────────────────────

function buildKeypad(): void {
  $('keypad').innerHTML = KEYS.map((k) => `<button class="key" data-key="${k}">${k}</button>`).join('');
}

function renderDisplay(): void {
  const d = $('display');
  if (!digits) {
    d.innerHTML = '<span class="placeholder">Press the numbers!</span>';
    return;
  }
  d.innerHTML = [...digits].map((ch, i) => `<span class="digit ${i === [...digits].length - 1 ? 'new' : ''}">${ch}</span>`).join('');
}

function pressKey(key: Key, el: HTMLElement): void {
  dtmf(key);
  say([keyWord(key, getLang())]);
  const chars = [...digits];
  if (chars.length >= MAX_DIGITS) chars.shift();
  digits = [...chars, key].join('');
  renderDisplay();
  el.classList.remove('pressed');
  void el.offsetWidth;
  el.classList.add('pressed');
}

// ── Contacts ───────────────────────────────────────────────────

function renderContacts(): void {
  $('contacts').innerHTML = visibleContacts().map(
    (c) => `<button class="contact" data-id="${c.id}"><span class="avatar">${avatarHtml(c)}</span><span class="cname">${nameOf(c)}</span></button>`,
  ).join('');
}

function showTab(tab: 'keypad' | 'contacts'): void {
  $('screen-keypad').hidden = tab !== 'keypad';
  $('screen-contacts').hidden = tab !== 'contacts';
  document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('sel', (t as HTMLElement).dataset.tab === tab));
  if (tab === 'contacts') renderContacts();
}

// ── Calls ──────────────────────────────────────────────────────

/**
 * Say a line as the person on the phone, and make their picture "talk" while they do.
 * A grown-up's own recording wins; otherwise the natural voice clip or the device voice.
 */
let talkId = 0;
function speak(kind: LineKind): void {
  if (!inCall) return;
  const rec = recordingFor(inCall.id, kind);
  const done = rec ? playBlob(rec) : say([lineFor(inCall, kind, getLang(), rng, customOf(inCall.id))]);
  const av = $('call-avatar');
  const my = ++talkId;
  av.classList.add('talking');
  void done.then(() => my === talkId && av.classList.remove('talking'));
}

function startCall(c: Contact, ring = true): void {
  inCall = c;
  connected = false;
  chats = 0;
  clearIdle();
  setAvatar($('call-avatar'), c);
  $('call-name').textContent = nameOf(c);
  $('call-status').textContent = 'Calling…';
  $('call').hidden = false;
  $('call-avatar').classList.add('ringing');
  if (ring) {
    ringback();
    say(getLang() === 'es' ? [en('Calling'), es(nameOf(c))] : `Calling ${nameOf(c)}!`);
  }
  window.setTimeout(() => connect(c), ring ? 2600 : 200);
}

function connect(c: Contact): void {
  if (inCall !== c) return;
  connected = true;
  callStart = performance.now();
  $('call-avatar').classList.remove('ringing');
  tickTimer();
  callTimer = window.setInterval(tickTimer, 1000);
  speak('hello');
  scheduleChat();
}

function tickTimer(): void {
  const s = Math.floor((performance.now() - callStart) / 1000);
  $('call-status').textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** If the child just listens, the caller keeps chatting a little (not forever). */
function scheduleChat(): void {
  clearTimeout(chatTimer);
  if (chats >= 3) return;
  chatTimer = window.setTimeout(() => {
    chats++;
    speak('more');
    scheduleChat();
  }, 9000);
}

function hangUp(): void {
  if (!inCall) return;
  if (connected) speak('bye');
  hangupTone();
  clearInterval(callTimer);
  clearTimeout(chatTimer);
  inCall = null;
  connected = false;
  $('call-status').textContent = 'Call ended';
  window.setTimeout(() => {
    if (inCall) return; // a new call already started
    $('call').hidden = true;
    $('call-avatar').classList.remove('talking', 'ringing');
    digits = '';
    renderDisplay();
    resetIdle();
  }, 1500);
}

/** Where the caller's picture sits inside the call screen, in that screen's own coordinates. */
function avatarBox(): { x: number; y: number; w: number; h: number } {
  const av = $('call-avatar');
  let x = 0;
  let y = 0;
  for (let el: HTMLElement | null = av; el && el.id !== 'call'; el = el.offsetParent as HTMLElement | null) {
    x += el.offsetLeft;
    y += el.offsetTop;
  }
  return { x, y, w: av.offsetWidth, h: av.offsetHeight };
}

function floatEmoji(emoji: string, n: number): void {
  const r = avatarBox();
  for (let i = 0; i < n; i++) {
    const el = document.createElement('div');
    el.className = 'float-emoji';
    el.textContent = emoji;
    el.style.left = `${r.x + r.w * (0.2 + Math.random() * 0.6)}px`;
    el.style.top = `${r.y + r.h * 0.5}px`;
    el.style.animationDelay = `${i * 120}ms`;
    $('call').appendChild(el);
    setTimeout(() => el.remove(), 2000 + i * 120);
  }
}

// ── Incoming calls ─────────────────────────────────────────────

function clearIdle(): void {
  clearTimeout(idleTimer);
}

function resetIdle(): void {
  clearIdle();
  if (!playing) return;
  idleTimer = window.setTimeout(ringIn, INCOMING_AFTER_MS);
}

function ringIn(): void {
  if (!playing || inCall || incoming || performance.now() - lastIncoming < INCOMING_GAP_MS) return resetIdle();
  lastIncoming = performance.now();
  // Mostly family, sometimes a silly animal.
  const everyone = visibleContacts();
  const family = everyone.filter((c) => c.family);
  const friends = everyone.filter((c) => !c.family);
  const pool = (rng() < 0.7 ? family : friends).length ? (rng() < 0.7 ? family : friends) : everyone;
  const c = pool[Math.floor(rng() * pool.length)] ?? everyone[0];
  incoming = c;
  setAvatar($('in-avatar'), c);
  $('in-name').textContent = nameOf(c);
  $('incoming').hidden = false;
  ringtone();
  let rings = 0;
  ringLoop = window.setInterval(() => {
    if (++rings >= 10) return declineIncoming();
    ringtone();
  }, 1500);
  say(getLang() === 'es' ? [es(nameOf(c)), en('is calling!')] : `${nameOf(c)} is calling!`);
}

function stopRinging(): void {
  clearInterval(ringLoop);
  $('incoming').hidden = true;
}

function answerIncoming(): void {
  if (!incoming) return;
  const c = incoming;
  incoming = null;
  stopRinging();
  startCall(c, false);
}

function declineIncoming(): void {
  incoming = null;
  stopRinging();
  hangupTone();
  resetIdle();
}

// ── Grown-up editor: family, friends, photos, recordings ──────

let editing: string | null = null; // whose photo is being chosen
let recFor: string | null = null; // whose voice is being recorded
let recording: Slot | null = null;

const esc = (t: string) => t.replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]!);

// ── Family sync and backup ─────────────────────────────────────

let syncBusy = false;
let syncMsg = '';
let syncTimer = 0;

function ago(t: number): string {
  if (!t) return 'not yet';
  const s = Math.round((Date.now() - t) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return new Date(t).toLocaleDateString();
}

function renderSync(): void {
  const card = $('sync-card');
  if (!isLinked()) {
    card.innerHTML = `
      <b>☁️ Family sync</b>
      <p>Share contacts, photos and voice recordings across all your devices, with a safe copy online.
      Use the same family code on every device. Pick something hard to guess.</p>
      <input id="sync-code" class="fam-name" type="text" autocomplete="off" autocapitalize="none" spellcheck="false" placeholder="Family code (6+ characters)">
      <div class="fam-actions">
        <button data-sync="create" ${syncBusy ? 'disabled' : ''}>✨ Start a family</button>
        <button data-sync="join" ${syncBusy ? 'disabled' : ''}>🔗 Join my family</button>
      </div>
      ${syncMsg ? `<p class="sync-msg">${esc(syncMsg)}</p>` : ''}`;
    return;
  }
  card.innerHTML = `
    <b>☁️ Family sync is on</b>
    <p>Last synced ${ago(lastSynced())}. Changes here show up on your other devices.</p>
    <div class="fam-actions">
      <button data-sync="now" ${syncBusy ? 'disabled' : ''}>${syncBusy ? '⏳ Syncing…' : '🔄 Sync now'}</button>
      <button data-sync="unlink">Unlink this device</button>
      <button data-sync="forget">🗑 Delete family data online</button>
    </div>
    ${syncMsg ? `<p class="sync-msg">${esc(syncMsg)}</p>` : ''}`;
}

/** Run a sync and refresh whatever is on screen if the family had newer things. */
async function runSync(what: () => Promise<{ changedHere: boolean }>, okMsg = ''): Promise<void> {
  syncBusy = true;
  syncMsg = '';
  renderSync();
  try {
    const r = await what();
    if (r.changedHere) {
      reloadContacts();
      await loadRecordings();
      if (!$('editor').hidden) renderEditor();
      if (!$('screen-contacts').hidden) renderContacts();
    }
    syncMsg = okMsg;
  } catch (e) {
    syncMsg = (e as Error).message;
  }
  syncBusy = false;
  renderSync();
}

/** Sync a moment after the grown-up stops changing things. */
function syncSoon(): void {
  if (!isLinked()) return;
  clearTimeout(syncTimer);
  syncTimer = window.setTimeout(() => void runSync(() => sync(recordingStore)), 1500);
}

function bindSyncAndBackup(): void {
  $('sync-card').addEventListener('click', async (e) => {
    const act = (e.target as HTMLElement).closest<HTMLElement>('[data-sync]')?.dataset.sync;
    if (!act || syncBusy) return;
    if (act === 'create' || act === 'join') {
      const code = ($('sync-code') as HTMLInputElement).value;
      if (code.trim().length < 6) {
        syncMsg = 'The family code needs at least 6 characters.';
        return renderSync();
      }
      if (act === 'join' && !confirm('Switch this device to your family’s contacts, photos and voices? Anything only on this device that the family doesn’t have will be added to the family.')) return;
      await runSync(() => link(code, act, recordingStore), act === 'create' ? 'Family started! Use the same code on your other devices.' : 'Joined! This device now has your family’s things.');
      renderEditor();
    } else if (act === 'now') {
      await runSync(() => sync(recordingStore), 'All synced.');
    } else if (act === 'unlink') {
      if (!confirm('Stop syncing this device? Everything stays on it as it is now.')) return;
      unlink();
      syncMsg = '';
      renderSync();
    } else if (act === 'forget') {
      if (!confirm('Delete your family’s data from the server? Each device keeps its own copy, but nothing will sync any more. This can’t be undone.')) return;
      await runSync(async () => (await forget(), { changedHere: false }), 'Family data deleted from the server.');
    }
  });
  $('backup').addEventListener('click', async () => {
    const n = await downloadBackup(recordingStore);
    alert(`Backup saved with ${n} recording${n === 1 ? '' : 's'}. Keep the file somewhere safe, like iCloud Drive or email.`);
  });
  $('restore').addEventListener('click', () => ($('restore-input') as HTMLInputElement).click());
  $('restore-input').addEventListener('change', async () => {
    const input = $('restore-input') as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    if (!confirm('Replace this device’s games setup with the backup?')) return;
    try {
      const r = await restoreBackup(file, recordingStore);
      reloadContacts();
      await loadRecordings();
      renderEditor();
      alert(`Restored ${r.recordings} recording${r.recordings === 1 ? '' : 's'} and your settings.`);
      syncSoon();
    } catch (e) {
      alert(`That file couldn’t be restored: ${(e as Error).message}`);
    }
  });
}

function renderEditor(): void {
  renderSync();
  const fam = allContacts().filter((c) => c.family);
  $('family').innerHTML = fam
    .map((c) => {
      const extra = extraOf(c.id);
      const hidden = isHidden(c.id);
      const n = countRecordings(c.id);
      const name = extra ? extra.name : (customOf(c.id)?.name ?? '');
      const placeholder = extra ? 'Name (e.g. Auntie Rosa)' : `${c.name.en} / ${c.name.es}`;
      return `<div class="fam-row ${hidden ? 'off' : ''}" data-id="${c.id}">
        <div class="fam-top">
          <button class="avatar pick" data-act="photo" aria-label="Choose photo">${avatarHtml(c)}<i>📷</i></button>
          <input class="fam-name" maxlength="18" placeholder="${esc(placeholder)}" value="${esc(name)}">
        </div>
        <div class="fam-actions">
          ${customOf(c.id)?.photo ? '<button data-act="clear">✕ Photo</button>' : ''}
          ${extra ? `<button data-act="face">${esc(extra.emoji)} Face</button><button data-act="gender">${extra.voice === 'male' ? '♂ Male voice' : '♀ Female voice'}</button>` : ''}
          ${canRecord() ? `<button data-act="record" class="${n ? 'has' : ''}">🎙️ Voice${n ? ` ${n}/${SLOTS.length}` : ''}</button>` : ''}
          ${extra ? '<button data-act="remove">🗑 Remove</button>' : `<button data-act="hide">${hidden ? '🙈 Hidden' : '👁 Shown'}</button>`}
        </div>
      </div>`;
    })
    .join('');
  $('friends').innerHTML = allContacts()
    .filter((c) => !c.family)
    .map((c) => `<button class="friend ${isHidden(c.id) ? 'off' : ''}" data-id="${c.id}"><span class="avatar">${avatarHtml(c)}</span><span>${esc(c.name.en)}</span></button>`)
    .join('');
}

function renderRecorder(): void {
  const c = recFor ? findContact(recFor) : null;
  if (!c) return;
  $('rec-title').textContent = `🎙️ ${nameOf(c)}’s voice`;
  $('slots').innerHTML = SLOTS.map((slot) => {
    const has = !!getRecording(c.id, slot);
    const live = recording === slot;
    return `<div class="slot-row ${has ? 'has' : ''}" data-slot="${slot}">
      <div class="slot-text"><b>${SLOT_INFO[slot].label}</b><small>${SLOT_INFO[slot].example}</small></div>
      <button class="rec ${live ? 'live' : ''}" data-act="rec" ${recording && !live ? 'disabled' : ''}>${live ? '■ Stop' : has ? '● Redo' : '● Record'}</button>
      <button data-act="play" ${has && !recording ? '' : 'disabled'}>▶</button>
      <button data-act="del" ${has && !recording ? '' : 'disabled'}>🗑</button>
    </div>`;
  }).join('');
}

function openRecorder(id: string): void {
  recFor = id;
  recording = null;
  renderRecorder();
  $('editor').hidden = true;
  $('recorder').hidden = false;
}

function closeRecorder(): void {
  releaseMic();
  stopSpeech();
  recording = null;
  recFor = null;
  $('recorder').hidden = true;
  renderEditor();
  $('editor').hidden = false;
}

async function toggleRecord(slot: Slot): Promise<void> {
  if (!recFor) return;
  if (recording === slot) return stopRecording();
  if (recording) return;
  const id = recFor;
  stopSpeech();
  try {
    recording = slot;
    const done = startRecording();
    renderRecorder();
    const blob = await done;
    if (blob.size > 0) {
      await saveRecording(id, slot, blob);
      syncSoon();
    }
  } catch {
    alert('The microphone could not be used. Check that this site is allowed to use it, then try again.');
  }
  recording = null;
  renderRecorder();
}

/** Shrink a chosen photo to a small square so it fits in local storage. */
async function photoToDataUrl(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const size = 240;
    const side = Math.min(img.naturalWidth, img.naturalHeight);
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    canvas.getContext('2d')!.drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0, 0, size, size);
    return canvas.toDataURL('image/jpeg', 0.82);
  } finally {
    URL.revokeObjectURL(url);
  }
}

function bindEditor(): void {
  $('edit').addEventListener('click', () => askGrownUp(() => {
    unlock(); // so recordings can be played back here
    renderEditor();
    $('menu').hidden = true;
    $('editor').hidden = false;
  }, $('edit')));
  $('edit-done').addEventListener('click', () => {
    $('editor').hidden = true;
    $('menu').hidden = false;
    if (isLinked()) void runSync(() => sync(recordingStore));
  });
  $('add-family').addEventListener('click', () => {
    const x = addExtra();
    renderEditor();
    document.querySelector<HTMLInputElement>(`.fam-row[data-id="${x.id}"] .fam-name`)?.focus();
  });
  $('family').addEventListener('click', async (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLElement>('[data-act]');
    const id = btn?.closest<HTMLElement>('.fam-row')?.dataset.id;
    if (!btn || !id) return;
    const act = btn.dataset.act;
    if (act === 'photo') {
      editing = id;
      ($('photo-input') as HTMLInputElement).click();
      return;
    }
    if (act === 'clear') setCustom(id, { photo: undefined });
    else if (act === 'hide') {
      // Keep at least one person in the phone.
      if (!isHidden(id) && visibleContacts().length <= 1) return;
      setHidden(id, !isHidden(id));
    } else if (act === 'face') {
      const x = extraOf(id)!;
      updateExtra(id, { emoji: EXTRA_EMOJI[(EXTRA_EMOJI.indexOf(x.emoji) + 1) % EXTRA_EMOJI.length] });
    } else if (act === 'gender') updateExtra(id, { voice: extraOf(id)!.voice === 'male' ? 'female' : 'male' });
    else if (act === 'record') return openRecorder(id);
    else if (act === 'remove') {
      const who = extraOf(id)?.name || 'this person';
      if (!confirm(`Remove ${who} and their recordings from the phone?`)) return;
      await deleteAllFor(id);
      removeExtra(id);
    }
    renderEditor();
    syncSoon();
  });
  $('family').addEventListener('input', (e) => {
    const input = e.target as HTMLInputElement;
    const id = input.closest<HTMLElement>('.fam-row')?.dataset.id;
    if (!id) return;
    if (isExtra(id)) updateExtra(id, { name: input.value });
    else setCustom(id, { name: input.value });
    syncSoon();
  });
  $('friends').addEventListener('click', (e) => {
    const id = (e.target as HTMLElement).closest<HTMLElement>('[data-id]')?.dataset.id;
    if (!id) return;
    if (!isHidden(id) && visibleContacts().length <= 1) return;
    setHidden(id, !isHidden(id));
    renderEditor();
    syncSoon();
  });
  $('photo-input').addEventListener('change', async () => {
    const input = $('photo-input') as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file || !editing) return;
    try {
      setCustom(editing, { photo: await photoToDataUrl(file) });
    } catch {
      alert('Sorry, that photo could not be used. Try another one.');
    }
    renderEditor();
    syncSoon();
  });
  $('slots').addEventListener('click', async (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLElement>('[data-act]');
    const slot = btn?.closest<HTMLElement>('[data-slot]')?.dataset.slot as Slot | undefined;
    if (!btn || !slot || !recFor || (btn as HTMLButtonElement).disabled) return;
    if (btn.dataset.act === 'rec') return void toggleRecord(slot);
    const rec = getRecording(recFor, slot);
    if (btn.dataset.act === 'play' && rec) void playBlob(rec);
    if (btn.dataset.act === 'del') {
      await deleteRecording(recFor, slot);
      renderRecorder();
      syncSoon();
    }
  });
  $('rec-done').addEventListener('click', closeRecorder);
}

// ── Screens ────────────────────────────────────────────────────

function start(): void {
  unlock();
  playing = true;
  digits = '';
  renderDisplay();
  showTab('keypad');
  $('menu').hidden = true;
  $('game').hidden = false;
  keepAwake(true);
  say(getLang() === 'es' ? [en('Press the numbers!')] : 'Press the numbers!');
  preload(KEYS.map((k) => keyWord(k, getLang()))); // so every number speaks instantly
  if (isLinked()) void runSync(() => sync(recordingStore));
  resetIdle();
}

function stop(): void {
  playing = false;
  if (inCall) {
    inCall = null;
    clearInterval(callTimer);
    clearTimeout(chatTimer);
  }
  incoming = null;
  stopRinging();
  clearIdle();
  $('call').hidden = true;
  stopSpeech();
  keepAwake(false);
  $('game').hidden = true;
  $('menu').hidden = false;
}

function init(): void {
  void loadRecordings().then(() => {
    if (isLinked()) void runSync(() => sync(recordingStore));
  });
  bindSyncAndBackup();
  buildKeypad();
  bindVoiceButton($('voice'));
  bindLangButtons($('lang'));
  bindEditor();
  guardExit($('home'), stop);
  guardLinks();
  lockGestures();
  stayPortrait();
  $('play').addEventListener('click', start);

  // Respond on touch-down: quicker and more forgiving than a full click for small fingers.
  $('keypad').addEventListener('pointerdown', (e) => {
    const k = (e.target as HTMLElement).closest<HTMLElement>('[data-key]');
    if (k) pressKey(k.dataset.key as Key, k);
  });
  $('del').addEventListener('pointerdown', () => {
    digits = [...digits].slice(0, -1).join('');
    tone(300, 0, 0.08, 'sine', 0.12);
    renderDisplay();
  });
  $('dial').addEventListener('pointerdown', () => {
    // No number dialled? Call a surprise friend.
    const everyone = visibleContacts();
    startCall(digits ? whoAnswers(digits, everyone) : everyone[Math.floor(rng() * everyone.length)]);
  });
  document.querySelector('.tabs')!.addEventListener('pointerdown', (e) => {
    const t = (e.target as HTMLElement).closest<HTMLElement>('[data-tab]');
    if (t) {
      sfx.flip();
      showTab(t.dataset.tab as 'keypad' | 'contacts');
    }
  });
  $('contacts').addEventListener('pointerdown', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('[data-id]');
    const c = b && findContact(b.dataset.id!);
    if (c) startCall(c);
  });

  // In a call: tap the picture to hear more, wave, blow a kiss, hang up.
  $('call-avatar').addEventListener('pointerdown', () => {
    if (!connected) return;
    speak('more');
    scheduleChat();
  });
  $('wave').addEventListener('pointerdown', () => {
    if (!connected) return;
    floatEmoji('👋', 3);
    speak('wave');
    scheduleChat();
  });
  $('kiss').addEventListener('pointerdown', () => {
    if (!connected) return;
    floatEmoji('❤️', 6);
    const r = avatarBox();
    burst($('call'), r.x + r.w / 2, r.y + r.h / 2, ['#f477b6', '#ec4038', '#fff'], 12, 110);
    speak('kiss');
    scheduleChat();
  });
  $('hang').addEventListener('pointerdown', hangUp);
  $('answer').addEventListener('pointerdown', answerIncoming);
  $('decline').addEventListener('pointerdown', declineIncoming);

  // Any tap counts as "still playing", so the phone only rings by itself when things go quiet.
  $('game').addEventListener('pointerdown', () => {
    if (!inCall && !incoming) resetIdle();
  });
}

init();
