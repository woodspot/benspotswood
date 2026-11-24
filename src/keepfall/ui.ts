// Shared bits of UI used by the battle screen and the menus.
import { card, describeCard, rarity, RES_LABEL } from './cards';
import { cardArt } from './art';
import { RELIC_MAP } from './relics';
import type { Resource } from './types';

export const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

export const ICON: Record<Resource, string> = { stone: '⚙️', mana: '🔮', steel: '💣' };
export const TYPE_TITLE: Record<Resource, string> = { stone: 'Shipwright', mana: 'Aether', steel: 'Gunnery' };

export function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
}

/** A card face. `cost` overrides the printed cost (e.g. after faction/event modifiers). */
export function cardFace(id: string, opts: { cost?: number; unaffordable?: boolean } = {}): HTMLElement {
  const c = card(id);
  const el = document.createElement('div');
  const isBuilding = c.ops.some((o) => o.op === 'build');
  el.className = `card t-${c.type} r-${rarity(id)}${c.upgraded ? ' upgraded' : ''}${isBuilding ? ' building' : ''}`;
  const cost = opts.cost ?? c.cost;
  const costCls = cost < c.cost ? 'cheaper' : cost > c.cost ? 'pricier' : '';
  if (opts.unaffordable) el.classList.add('unaffordable');
  el.innerHTML = `
    <div class="card-head">
      <span class="cost ${costCls}" title="Costs ${cost} ${RES_LABEL[c.type]}">${cost}<i>${ICON[c.type]}</i></span>
      <span class="ctype">${isBuilding ? 'Module' : TYPE_TITLE[c.type]}</span>
    </div>
    ${cardArt(id)}
    <div class="card-name">${esc(c.name)}</div>
    <ul class="card-text">${describeCard(c).map((t) => `<li>${esc(t)}</li>`).join('')}</ul>
    ${c.flavor ? `<div class="flavor">${esc(c.flavor)}</div>` : ''}`;
  return el;
}

export function relicChip(id: string): string {
  const r = RELIC_MAP[id];
  return r ? `<span class="relic" data-info="${esc(`${r.icon} ${r.name}: ${r.text}`)}">${r.icon}</span>` : '';
}

export function relicTile(id: string, selected = false): string {
  const r = RELIC_MAP[id];
  return `<button class="relic-tile ${selected ? 'sel' : ''}" data-relic="${id}">
    <span class="r-icon">${r.icon}</span><b>${esc(r.name)}</b><small>${esc(r.text)}</small></button>`;
}

export function showDialog(html: string, wide = false): HTMLElement {
  const d = $('dialog');
  d.className = `dialog${wide ? ' wide' : ''}`;
  d.innerHTML = html;
  d.scrollTop = 0;
  $('overlay').classList.add('show');
  return d;
}

export function hideDialog(): void {
  $('overlay').classList.remove('show');
  $('dialog').innerHTML = ''; // stale buttons must not stay clickable
}

export function toast(html: string): void {
  const t = $('toast');
  t.innerHTML = html;
  t.classList.remove('show');
  void t.offsetWidth;
  t.classList.add('show');
}

/** Wire every `[data-act]` button in an element to a handler map. */
export function bind(root: HTMLElement, handlers: Record<string, (el: HTMLElement) => void>): void {
  root.querySelectorAll<HTMLElement>('[data-act]').forEach((el) => {
    const h = handlers[el.dataset.act!];
    if (h) el.addEventListener('click', () => h(el));
  });
}

/**
 * Anything with `data-info` shows its text in a bubble when tapped (phones have no hover),
 * or hovered with a mouse.
 */
export function initInfoPops(): void {
  const pop = $('info-pop');
  let owner: Element | null = null;
  const show = (el: HTMLElement) => {
    owner = el;
    pop.textContent = el.dataset.info ?? '';
    pop.hidden = false;
    const r = el.getBoundingClientRect();
    const w = pop.offsetWidth;
    const left = Math.min(window.innerWidth - w - 8, Math.max(8, r.left + r.width / 2 - w / 2));
    const above = r.top - pop.offsetHeight - 8;
    pop.style.left = `${left}px`;
    pop.style.top = `${above > 8 ? above : r.bottom + 8}px`;
  };
  const hide = () => {
    owner = null;
    pop.hidden = true;
  };
  document.addEventListener('click', (e) => {
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-info]');
    if (el && el !== owner && el.dataset.info) show(el);
    else hide();
  });
  document.addEventListener('mouseover', (e) => {
    if (matchMedia('(pointer: coarse)').matches) return;
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-info]');
    if (el && el.dataset.info) {
      if (el !== owner) show(el);
    } else if (owner) hide();
  });
  window.addEventListener('scroll', hide, true);
}
