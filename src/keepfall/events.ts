// Story encounters (❓ nodes on the campaign map). Each offers two or three choices; effects are data,
// applied by resolveEvent() in campaign.ts.

export interface Effect {
  gold?: number; // + or −
  lives?: number; // banners: + heals (up to max), − costs one
  card?: 'random' | 'rare' | 'legendary' | string; // add a card (a specific id, or a random one)
  cards?: number; // how many cards of that kind (default 1)
  junk?: number; // Junk cards shuffled into your deck
  remove?: number; // remove N random cards (never below the minimum deck size)
  upgrade?: number; // upgrade N random cards
  enchant?: number; // enchant N random cards
  relic?: boolean; // a random relic
  crew?: boolean; // a random crew member
  fight?: 'battle' | 'elite'; // start a battle here (normal rewards if you win)
  chance?: { p: number; win: Effect; lose: Effect }; // a gamble
}

export interface EventChoice {
  label: string;
  hint: string; // what it does, shown under the label
  needGold?: number;
  effect: Effect;
}

export interface EventDef {
  id: string;
  icon: string;
  title: string;
  text: string;
  choices: EventChoice[];
}

export const EVENTS: EventDef[] = [
  {
    id: 'merchant', icon: '🎈', title: 'A drifting merchant blimp',
    text: 'A cheerful trader waves from a patched balloon. “Mystery crates! Fair prices! Mostly not haunted!”',
    choices: [
      { label: 'Buy a mystery crate', hint: '−40 gold: a random rare card', needGold: 40, effect: { gold: -40, card: 'rare' } },
      { label: 'Sell a card', hint: 'Remove a random card, +40 gold', effect: { remove: 1, gold: 40 } },
      { label: 'Wave and sail on', hint: 'Nothing happens', effect: {} },
    ],
  },
  {
    id: 'stormfront', icon: '⛈️', title: 'A storm front ahead',
    text: 'Black clouds boil across your path. Lightning crackles. Something glints inside the storm.',
    choices: [
      { label: 'Fly straight through', hint: '50%: +70 gold and a relic. 50%: lose a banner', effect: { chance: { p: 0.5, win: { gold: 70, relic: true }, lose: { lives: -1 } } } },
      { label: 'Go the long way round', hint: 'Safe, but nothing gained', effect: {} },
    ],
  },
  {
    id: 'pirates', icon: '☠️', title: 'Sky pirates demand a toll',
    text: '“Nice ship. Shame if something happened to it.” Three gunships circle you.',
    choices: [
      { label: 'Pay the toll', hint: '−50 gold', needGold: 50, effect: { gold: -50 } },
      { label: 'Fight!', hint: 'Battle an elite crew', effect: { fight: 'elite' } },
      { label: 'Throw them some cargo', hint: 'Remove 2 random cards', effect: { remove: 2 } },
    ],
  },
  {
    id: 'stowaway', icon: '🐀', title: 'A stowaway in the hold',
    text: 'Behind the powder barrels, a scruffy figure grins up at you. “I can be useful, honest!”',
    choices: [
      { label: 'Let them join the crew', hint: 'A random crew member', effect: { crew: true } },
      { label: 'Hand them to the harbor master', hint: '+25 gold reward', effect: { gold: 25 } },
    ],
  },
  {
    id: 'shrine', icon: '🔮', title: 'An ancient aether shrine',
    text: 'A floating stone ring hums with old power. Offerings of junk and gold lie at its feet.',
    choices: [
      { label: 'Pray for power', hint: 'A legendary card… and 2 Junk', effect: { card: 'legendary', junk: 2 } },
      { label: 'Leave an offering', hint: '−30 gold: upgrade 2 random cards', needGold: 30, effect: { gold: -30, upgrade: 2 } },
      { label: 'Leave it be', hint: 'Nothing happens', effect: {} },
    ],
  },
  {
    id: 'derelict', icon: '🛸', title: 'A derelict airship',
    text: 'An abandoned frigate drifts in silence, its envelope torn. The cargo hold looks intact.',
    choices: [
      { label: 'Search the hold', hint: 'A relic, but 30% chance of losing a banner', effect: { relic: true, chance: { p: 0.7, win: {}, lose: { lives: -1 } } } },
      { label: 'Strip it for parts', hint: '+35 gold', effect: { gold: 35 } },
    ],
  },
  {
    id: 'whale', icon: '🐋', title: 'A friendly sky whale',
    text: 'An enormous sky whale glides alongside, singing. Its slipstream is warm and calm.',
    choices: [
      { label: 'Rest in its slipstream', hint: 'Recover a banner', effect: { lives: 1 } },
      { label: 'Follow it home', hint: '+25 gold and a random card', effect: { gold: 25, card: 'random' } },
    ],
  },
  {
    id: 'gambling', icon: '🎲', title: 'A cloud-top gambling den',
    text: 'Music, lanterns and the clatter of dice drift from a floating casino.',
    choices: [
      { label: 'Small bet (50 gold)', hint: '50%: win 120 gold', needGold: 50, effect: { gold: -50, chance: { p: 0.5, win: { gold: 120 }, lose: {} } } },
      { label: 'Big bet (100 gold)', hint: '40%: win 260 gold', needGold: 100, effect: { gold: -100, chance: { p: 0.4, win: { gold: 260 }, lose: {} } } },
      { label: 'Keep your gold', hint: 'Nothing happens', effect: {} },
    ],
  },
  {
    id: 'lightning', icon: '⚡', title: 'Caught in a lightning storm',
    text: 'Bolts arc across the rigging. Your cards fizz and spark in their deck box.',
    choices: [
      { label: 'Ride the lightning', hint: 'Enchant 2 random cards', effect: { enchant: 2 } },
      { label: 'Batten the hatches', hint: 'Lose 15 gold of spoiled supplies', effect: { gold: -15 } },
    ],
  },
  {
    id: 'shipwright', icon: '🔨', title: 'An old shipwright',
    text: '“I built ships before your grandmother could walk. Let me take a look at that deck of yours.”',
    choices: [
      { label: 'Pay for a full refit', hint: '−45 gold: upgrade 3 random cards', needGold: 45, effect: { gold: -45, upgrade: 3 } },
      { label: 'Ask for a quick tip', hint: 'Upgrade 1 random card', effect: { upgrade: 1 } },
    ],
  },
  {
    id: 'convoy', icon: '🚢', title: 'A refugee convoy',
    text: 'A string of battered barges limps through the clouds, hounded by raiders.',
    choices: [
      { label: 'Share your supplies', hint: '−30 gold: a grateful captain gives you a relic', needGold: 30, effect: { gold: -30, relic: true } },
      { label: 'Escort them', hint: 'Fight the raiders, +60 gold', effect: { fight: 'battle', gold: 60 } },
      { label: 'Sail past', hint: 'Nothing happens', effect: {} },
    ],
  },
  {
    id: 'cache', icon: '🗝️', title: 'A smugglers’ cache',
    text: 'A crate of gold, roped to a cloud anchor. A note reads: “DON’T TOUCH. — the Smuggler King”.',
    choices: [
      { label: 'Take it', hint: '+80 gold, but 2 Junk sneak into your deck', effect: { gold: 80, junk: 2 } },
      { label: 'Leave it', hint: 'Nothing happens', effect: {} },
    ],
  },
  {
    id: 'hollow', icon: '👻', title: 'The Hollow Zeppelin',
    text: 'A ghostly ship drifts by, lanterns glowing green. Its crew are… not quite there.',
    choices: [
      { label: 'Board her', hint: 'Battle an elite; win to claim a relic', effect: { fight: 'elite' } },
      { label: 'Fire a flaming shot', hint: 'Add a Fire Shot card', effect: { card: 'firearrows' } },
    ],
  },
  {
    id: 'orchard', icon: '🍑', title: 'A floating orchard',
    text: 'A little island of fruit trees, buzzing with bees. The air smells of honey.',
    choices: [
      { label: 'Rest a while', hint: 'Recover a banner', effect: { lives: 1 } },
      { label: 'Gather fruit to sell', hint: '+30 gold', effect: { gold: 30 } },
    ],
  },
  {
    id: 'duel', icon: '🤺', title: 'A rival captain’s challenge',
    text: '“They say you’re the finest captain in the skies. Prove it.”',
    choices: [
      { label: 'Accept the duel', hint: 'Battle, +50 gold if you win', effect: { fight: 'battle', gold: 50 } },
      { label: 'Decline politely', hint: 'Nothing happens', effect: {} },
    ],
  },
  {
    id: 'inventor', icon: '🧪', title: 'A mad inventor',
    text: '“My aether-amplifier is perfectly safe! Probably! Hold still!”',
    choices: [
      { label: 'Test her device', hint: '70%: enchant 2 cards. 30%: 2 Junk', effect: { chance: { p: 0.7, win: { enchant: 2 }, lose: { junk: 2 } } } },
      { label: 'Buy a gadget', hint: '−50 gold: a random relic', needGold: 50, effect: { gold: -50, relic: true } },
      { label: 'Back away slowly', hint: 'Nothing happens', effect: {} },
    ],
  },
  {
    id: 'bottle', icon: '🍾', title: 'A message in a bottle',
    text: 'A bottle bobs on the wind. Inside: a map, scribbled with an X.',
    choices: [
      { label: 'Follow the map', hint: '+40 gold and a random card', effect: { gold: 40, card: 'random' } },
      { label: 'Toss it back', hint: 'Nothing happens', effect: {} },
    ],
  },
  {
    id: 'rain', icon: '🌧️', title: 'Aether rain',
    text: 'Glowing droplets patter on the deck, pooling in shimmering puddles.',
    choices: [
      { label: 'Collect it', hint: 'Add an Aether Tap card and +20 gold', effect: { card: 'leyline', gold: 20 } },
      { label: 'Bathe the deck in it', hint: 'Upgrade 1 random card', effect: { upgrade: 1 } },
    ],
  },
  {
    id: 'mutiny', icon: '😤', title: 'Grumbling crew',
    text: 'The crew mutter in the galley. Long voyage, short rations, and no shore leave.',
    choices: [
      { label: 'Pay a bonus', hint: '−40 gold', needGold: 40, effect: { gold: -40 } },
      { label: 'Give a rousing speech', hint: '60%: a new crew member joins. 40%: lose a banner', effect: { chance: { p: 0.6, win: { crew: true }, lose: { lives: -1 } } } },
    ],
  },
  {
    id: 'temple', icon: '🛕', title: 'The Temple of the Winds',
    text: 'Wind chimes ring from a temple carved into a cloud. Monks bow as you pass.',
    choices: [
      { label: 'Offer a card', hint: 'Remove a random card and upgrade another', effect: { remove: 1, upgrade: 1 } },
      { label: 'Ring the great bell', hint: 'Recover a banner (or +30 gold if full)', effect: { lives: 1 } },
    ],
  },
];

export const EVENT_DEF: Record<string, EventDef> = Object.fromEntries(EVENTS.map((e) => [e.id, e]));
