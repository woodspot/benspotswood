// Shared bits of UI used by the battle screen and the menus.
import { card, describeCard, rarity, RES_LABEL } from './cards';
import { RELIC_MAP } from './relics';
import type { Resource } from './types';

export const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

export const ICON: Record<Resource, string> = { stone: '⛏️', mana: '🔮', steel: '⚔️' };
export const TYPE_TITLE: Record<Resource, string> = { stone: 'Build', mana: 'Magic', steel: 'War' };

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
      <span class="ctype">${isBuilding ? 'Building' : TYPE_TITLE[c.type]}</span>
    </div>
    <div class="card-name">${esc(c.name)}</div>
    <ul class="card-text">${describeCard(c).map((t) => `<li>${esc(t)}</li>`).join('')}</ul>
    ${c.flavor ? `<div class="flavor">${esc(c.flavor)}</div>` : ''}`;
  return el;
}

export function relicChip(id: string): string {
  const r = RELIC_MAP[id];
  return r ? `<span class="relic" title="${esc(r.name)}: ${esc(r.text)}">${r.icon}</span>` : '';
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
