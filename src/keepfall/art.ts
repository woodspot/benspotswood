// Card art: one icon per card from game-icons.net (CC BY 3.0, credited in "How to play").
// Files live in public/icons/<card id>.svg and are tinted with a CSS mask.

const baseId = (id: string) => id.replace(/\+$/, '');

/** The picture strip at the top of a card face. */
export function cardArt(id: string): string {
  return `<div class="card-art"><i class="gi" style="--icon:url(/icons/${baseId(id)}.svg)"></i></div>`;
}

export const ICON_CREDIT =
  'Card icons by Lorc, Delapouite, Skoll, Sbed, Cathelineau and Quoting from <a href="https://game-icons.net" target="_blank" rel="noopener">game-icons.net</a>, used under <a href="https://creativecommons.org/licenses/by/3.0/" target="_blank" rel="noopener">CC BY 3.0</a>.';
