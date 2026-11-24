// Toy Phone: a pretend phone for toddlers. Every key beeps and says its number; the call button
// rings someone (family, animals, Santa) who chats back. Sometimes the phone rings by itself!
import { bindVoiceButton, en, es, say, sfx, tone, unlock } from '../kids/audio';
import { burst } from '../kids/fx';
import { holdToExit, keepAwake, lockGestures } from '../kids/hold';
import { bindLangButtons, getLang } from '../kids/lang';
import {
  CONTACTS, CONTACT_MAP, displayName, DTMF, KEYS, keyWord, lineFor, whoAnswers,
  type Contact, type Custom, type Key, type LineKind,
} from './game';

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

// ── Grown-up edits: names and photos for family ────────────────

let custom: Record<string, Custom> = JSON.parse(localStorage.getItem('phone.custom') ?? '{}');
const saveCustom = () => localStorage.setItem('phone.custom', JSON.stringify(custom));
const nameOf = (c: Contact) => displayName(c, custom[c.id], getLang());

function avatarHtml(c: Contact): string {
  const photo = custom[c.id]?.photo;
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
  $('contacts').innerHTML = CONTACTS.map(
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

/** Say a line as the person on the phone, and make their picture "talk" while they do. */
function speak(kind: LineKind): void {
  if (!inCall) return;
  const line = lineFor(inCall, kind, getLang(), rng, custom[inCall.id]);
  say([line]);
  const av = $('call-avatar');
  av.classList.add('talking');
  clearTimeout(Number(av.dataset.t));
  av.dataset.t = String(window.setTimeout(() => av.classList.remove('talking'), 700 + line.text.length * 65));
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

function floatEmoji(emoji: string, n: number): void {
  const r = $('call-avatar').getBoundingClientRect();
  for (let i = 0; i < n; i++) {
    const el = document.createElement('div');
    el.className = 'float-emoji';
    el.textContent = emoji;
    el.style.left = `${r.left + r.width * (0.2 + Math.random() * 0.6)}px`;
    el.style.top = `${r.top + r.height * 0.5}px`;
    el.style.animationDelay = `${i * 120}ms`;
    document.body.appendChild(el);
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
  const pool = rng() < 0.7 ? CONTACTS.filter((c) => c.family) : CONTACTS.filter((c) => !c.family);
  const c = pool[Math.floor(rng() * pool.length)];
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

// ── Grown-up editor ────────────────────────────────────────────

let editing: string | null = null;

function renderEditor(): void {
  $('family').innerHTML = CONTACTS.filter((c) => c.family)
    .map(
      (c) => `<div class="fam-row" data-id="${c.id}">
        <button class="avatar pick" data-act="photo" aria-label="Choose photo">${avatarHtml(c)}<i>📷</i></button>
        <input class="fam-name" data-act="name" maxlength="16" placeholder="${c.name.en} / ${c.name.es}" value="${(custom[c.id]?.name ?? '').replace(/"/g, '&quot;')}">
        ${custom[c.id]?.photo ? '<button class="fam-x" data-act="clear" aria-label="Remove photo">✕</button>' : '<span class="fam-x"></span>'}
      </div>`,
    )
    .join('');
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
  $('edit').addEventListener('click', () => {
    renderEditor();
    $('menu').hidden = true;
    $('editor').hidden = false;
  });
  $('edit-done').addEventListener('click', () => {
    $('editor').hidden = true;
    $('menu').hidden = false;
  });
  $('family').addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLElement>('[data-act]');
    const id = btn?.closest<HTMLElement>('.fam-row')?.dataset.id;
    if (!btn || !id) return;
    if (btn.dataset.act === 'photo') {
      editing = id;
      ($('photo-input') as HTMLInputElement).click();
    } else if (btn.dataset.act === 'clear') {
      delete custom[id].photo;
      saveCustom();
      renderEditor();
    }
  });
  $('family').addEventListener('input', (e) => {
    const input = e.target as HTMLInputElement;
    const id = input.closest<HTMLElement>('.fam-row')?.dataset.id;
    if (!id) return;
    custom[id] = { ...custom[id], name: input.value };
    saveCustom();
  });
  $('photo-input').addEventListener('change', async () => {
    const input = $('photo-input') as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file || !editing) return;
    try {
      custom[editing] = { ...custom[editing], photo: await photoToDataUrl(file) };
      saveCustom();
    } catch {
      alert('Sorry, that photo could not be used. Try another one.');
    }
    renderEditor();
  });
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
  speechSynthesis?.cancel();
  keepAwake(false);
  $('game').hidden = true;
  $('menu').hidden = false;
}

function init(): void {
  buildKeypad();
  bindVoiceButton($('voice'));
  bindLangButtons($('lang'));
  bindEditor();
  holdToExit($('home'), stop);
  lockGestures();
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
    startCall(digits ? whoAnswers(digits) : CONTACTS[Math.floor(rng() * CONTACTS.length)]);
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
    if (b) startCall(CONTACT_MAP[b.dataset.id!]);
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
    const r = $('call-avatar').getBoundingClientRect();
    burst(document.body, r.left + r.width / 2, r.top + r.height / 2, ['#f477b6', '#ec4038', '#fff'], 12, 110);
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
