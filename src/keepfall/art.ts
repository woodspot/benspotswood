// Card art. Every card has an emoji picture today. To use a real image instead, drop
// `public/cards/<id>.webp` into the project and add the id to IMAGE_CARDS.

const ART: Record<string, string> = {
  // Iron: shipwrights
  mortar: '🔩', cornerstone: '⚖️', stonecutters: '⛴️', rampart: '🛡️', watchtower: '🎈', buttress: '⚓',
  tunnel: '✂️', guild: '🏭', landslide: '🌨️', greatwall: '🚢', spire: '🎈', bastion: '🛠️',
  // Aether: magic
  rune: '🌬️', spark: '⚡', leyline: '🔮', mend: '🕊️', siphon: '🌀', transmute: '⚗️', bolt: '💫',
  rust: '💧', conclave: '🧙', quake: '⛓️', storm: '🌩️', citadel: '🌠',
  // Powder: guns
  drums: '💥', skirmish: '🎯', recruiter: '🏗️', archers: '💣', raiders: '⚔️', warband: '🔥',
  ram: '🐏', mercs: '📜', saboteurs: '🧨', assassin: '🔭', siege: '☄️', dragon: '🐉',
  // Modules and the rest
  'b-lodge': '🔧', 'b-market': '📦', 'b-shrine': '🎈', 'b-beacon': '🏮', 'b-catapult': '☄️', 'b-ballista': '🎯',
  'b-obelisk': '🔮', 'b-den': '🗝️', sappers: '🧨', dispel: '✨',
  scaffold: '🔀', bulwark: '🚪', renovate: '🛠️', glyph: '💠', echo: '🔔', pact: '🤝', blitz: '✈️',
  flank: '↪️', pillage: '💰',
  hexfire: '🔥', plague: '🌫️', firearrows: '🎆', rubblecart: '🛢️', marauders: '🏴', rubble: '🗑️',
};

/** Cards that have a painted image in public/cards/. */
const IMAGE_CARDS = new Set<string>([]);

const baseId = (id: string) => id.replace(/\+$/, '');

/** The picture strip at the top of a card face. */
export function cardArt(id: string): string {
  const b = baseId(id);
  if (IMAGE_CARDS.has(b)) return `<div class="card-art img"><img src="/cards/${b}.webp" alt="" loading="lazy"></div>`;
  return `<div class="card-art"><span>${ART[b] ?? '🎈'}</span></div>`;
}
