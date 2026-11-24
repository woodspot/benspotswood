// English or Spanish words for the toddler games. Instructions stay in English either way;
// the word being learned (the colour, shape, number, animal…) is in the chosen language.
import { unlock, say } from './audio';
import { en, es, type Lang, type Part } from './words';

export type { Lang };
export { COLOR_WORDS, NUMBER_WORDS, SHAPE_WORDS } from './words';

let lang: Lang = localStorage.getItem('kids.lang') === 'es' ? 'es' : 'en';
export const getLang = () => lang;
export function setLang(l: Lang): void {
  lang = l;
  localStorage.setItem('kids.lang', l);
}

/** A learning word as speech, in the given language. */
export const word = (w: { en: string; es: string }, l: Lang = lang): Part => (l === 'es' ? es(w.es) : en(w.en));

/** The English / Español switch on a start screen. */
export function bindLangButtons(box: HTMLElement): void {
  const render = () => {
    box.innerHTML = (['en', 'es'] as Lang[])
      .map((l) => `<button class="lang-btn ${l === lang ? 'sel' : ''}" data-lang="${l}">${l === 'en' ? '🇺🇸 English' : '🇲🇽 Español'}</button>`)
      .join('');
  };
  render();
  box.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('[data-lang]');
    if (!b) return;
    setLang(b.dataset.lang as Lang);
    render();
    unlock();
    say(lang === 'es' ? [es('¡Hola!')] : 'Hello!');
  });
}
