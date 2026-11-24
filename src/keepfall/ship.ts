// The airship drawn on the battlefield. Both sides use the same drawing; the enemy's is mirrored in CSS.
// Hull colour comes from `currentColor`, so each side is tinted by its CSS `color`.

const PLATES = [38, 52, 66, 80, 94];

const SVG = `
<svg class="ship-svg" viewBox="0 -14 140 124" aria-hidden="true">
  <line x1="72" y1="8" x2="72" y2="-12" stroke="#ddd" stroke-width="1.5"/>
  <path d="M72 -12 L90 -8 L72 -3 Z" fill="currentColor"/>
  <g class="lines" stroke="#2b2b33" stroke-width="1.2">
    <line x1="42" y1="54" x2="46" y2="72"/><line x1="72" y1="60" x2="72" y2="72"/><line x1="102" y1="54" x2="98" y2="72"/>
  </g>
  <path d="M20 34 L4 16 L13 34 L4 52 Z" fill="currentColor"/>
  <path d="M20 34 L4 16 L13 34 L4 52 Z" fill="rgba(0,0,0,.25)"/>
  <ellipse cx="72" cy="34" rx="56" ry="26" fill="currentColor"/>
  <path d="M16 34 A56 26 0 0 0 128 34 Q72 48 16 34 Z" fill="rgba(0,0,0,.22)"/>
  <ellipse cx="62" cy="22" rx="32" ry="7" fill="rgba(255,255,255,.22)"/>
  <path d="M18 32 Q72 18 126 32" stroke="rgba(255,255,255,.28)" stroke-width="2.5" fill="none"/>
  <path d="M22 44 Q72 54 122 44" stroke="rgba(0,0,0,.25)" stroke-width="2" fill="none"/>
  <circle cx="127" cy="34" r="3" fill="#c9b27a"/>
  <rect x="28" y="68" width="92" height="5" rx="1.5" fill="#53361f"/>
  <path d="M30 72 H118 L108 92 Q74 100 40 92 Z" fill="#7a5132"/>
  <path d="M34 79 H114 M37 86 H110" stroke="rgba(0,0,0,.22)" stroke-width="1"/>
  <g class="plates">${PLATES.map((x) => `<rect class="plate" x="${x}" y="75" width="12" height="13" rx="2"/>`).join('')}</g>
  <rect class="cannon" x="110" y="77" width="18" height="5" rx="2" fill="#2b2b33"/>
  <path d="M30 72 L22 74 L24 90 L36 90 Z" fill="#5d3c22"/>
  <rect x="17" y="80" width="8" height="4" rx="1" fill="#444"/>
  <ellipse class="prop" cx="15" cy="82" rx="2.4" ry="11" fill="rgba(225,225,235,.75)"/>
</svg>`;

/** Fill a `.ship` element with its drawing and the overlays the battle screen updates. */
export function buildShip(el: HTMLElement): void {
  el.innerHTML = `
    <div class="ship-body">
      ${SVG}
      <div class="ward-bubble"></div>
      <div class="flame">🔥</div>
      <div class="alt-num"></div>
      <div class="armor-num"></div>
    </div>
    <div class="modules"></div>`;
}

/** Light up one armour plate per 8 Armor (up to 5). */
export function setPlates(el: HTMLElement, armor: number): void {
  const on = armor <= 0 ? 0 : Math.min(PLATES.length, Math.ceil(armor / 8));
  el.querySelectorAll('.plate').forEach((p, k) => p.classList.toggle('on', k < on));
}
