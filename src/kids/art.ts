// Storybook pictures for the toddler games, shared by every game. Each emoji in art-list.json has a
// drawing in ./art/<id>.webp (made by scripts/gen-art.mjs). Where a drawing is missing, the emoji is
// shown instead, so a game never breaks while pictures are still being drawn.
import list from './art-list.json';

const files = import.meta.glob<string>('./art/*.webp', { eager: true, query: '?url', import: 'default' });

const URLS: Record<string, string> = {};
for (const [e, [id]] of Object.entries(list as Record<string, string[]>)) {
  const url = files[`./art/${id}.webp`];
  if (url) URLS[e] = url;
}

/** The drawing's URL for an emoji, if there is one. */
export const artUrl = (e: string): string | undefined => URLS[e];

/** HTML for a picture: the drawing when there is one, else the emoji itself. Sized like the emoji (1em). */
export function drawing(e: string): string {
  // A hand-made SVG (like ABC's xylophone) is looked up by its label.
  const key = e.startsWith('<svg') ? (/aria-label="([^"]+)"/.exec(e)?.[1] ?? e) : e;
  const url = URLS[key];
  return url ? `<img class="art" src="${url}" alt="" draggable="false">` : e;
}

/** Swap the emoji written into a page's HTML (start screens, tiles) for their drawings. */
export function drawPage(root: ParentNode = document.body): void {
  for (const el of root.querySelectorAll<HTMLElement>('*')) {
    if (el.childElementCount || el.closest('svg, script, style')) continue;
    const e = el.textContent?.trim() ?? '';
    if (URLS[e]) el.innerHTML = drawing(e);
  }
}
