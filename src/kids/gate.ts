// Grown-ups only: leaving a toddler game asks a quick sum (like "7 + 8") typed on a keypad.
// Little ones can tap the house as much as they like; without the answer nothing happens.

let open: (() => void) | null = null;

function problem(): { text: string; answer: number } {
  const a = 6 + Math.floor(Math.random() * 4); // 6–9
  const b = 3 + Math.floor(Math.random() * 7); // 3–9 → answers 9–18, mostly two digits
  return { text: `${a} + ${b}`, answer: a + b };
}

/** Ask the sum; calls `pass` only when it's answered right. */
export function askGrownUp(pass: () => void, from?: Element | null): void {
  if (open) return;
  const host = from?.closest('#app') ?? document.body;
  const el = document.createElement('div');
  el.className = 'gate';
  el.innerHTML = `
    <div class="gate-box" role="dialog" aria-label="Grown-ups only">
      <button class="gate-x" aria-label="Close">✕</button>
      <p class="gate-title">Grown-ups only</p>
      <p class="gate-q"><span class="gate-sum"></span> = <span class="gate-ans"></span></p>
      <div class="gate-keys">
        ${[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => `<button data-k="${n}">${n}</button>`).join('')}
        <button data-k="del" aria-label="Delete">⌫</button><button data-k="0">0</button><button data-k="ok" class="gate-ok">OK</button>
      </div>
    </div>`;
  const $ = <T extends HTMLElement>(s: string) => el.querySelector(s) as T;
  let p = problem();
  let typed = '';
  let idle = 0;
  const show = () => {
    $('.gate-sum').textContent = p.text;
    $('.gate-ans').textContent = typed || '?';
  };
  const close = () => {
    clearTimeout(idle);
    el.remove();
    open = null;
  };
  const poke = () => {
    clearTimeout(idle);
    idle = window.setTimeout(close, 20000); // walk away and it closes itself
  };
  const check = () => {
    if (Number(typed) === p.answer) {
      close();
      pass();
      return;
    }
    // Wrong: shake and ask a different sum, so guessing doesn't get anywhere.
    const box = $('.gate-box');
    box.classList.remove('shake');
    void box.offsetWidth;
    box.classList.add('shake');
    p = problem();
    typed = '';
    show();
  };
  el.addEventListener('pointerdown', (e) => e.stopPropagation());
  el.addEventListener('click', (e) => {
    e.stopPropagation();
    poke();
    const t = e.target as HTMLElement;
    if (t === el || t.closest('.gate-x')) return close();
    const k = t.closest<HTMLElement>('[data-k]')?.dataset.k;
    if (!k) return;
    if (k === 'del') typed = typed.slice(0, -1);
    else if (k === 'ok') return check();
    else if (typed.length < 2) {
      typed += k;
      // Two digits typed (or one that can only be the answer): check straight away.
      if (typed.length === 2 || (p.answer < 10 && typed.length === 1)) return check();
    }
    show();
  });
  show();
  poke();
  host.appendChild(el);
  open = close;
}

/** The 🏠 button in a game: asks the grown-up sum, then leaves. */
export function guardExit(btn: HTMLElement, onExit: () => void): void {
  btn.addEventListener('pointerdown', (e) => e.stopPropagation());
  btn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    askGrownUp(onExit, btn);
  });
}

/** Links out of a toddler game (like "← Games") ask the sum too. */
export function guardLinks(root: ParentNode = document): void {
  root.querySelectorAll<HTMLAnchorElement>('a.back').forEach((a) =>
    a.addEventListener('click', (e) => {
      e.preventDefault();
      askGrownUp(() => (location.href = a.href), a);
    }),
  );
}
