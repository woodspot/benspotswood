// Words for the toddler games, in English and Spanish. No browser APIs here, so it can be tested.

export type Lang = 'en' | 'es';

/** A piece of speech in one language. */
export interface Part {
  text: string;
  lang: Lang;
  pitch?: number; // characters can sound higher or lower (1 = normal)
  rate?: number; // speed (1 = normal)
  voice?: VoiceKey; // who is speaking (default 'female')
}

/**
 * Who is speaking. 'female'/'male' are the game's narrators; the rest are phone characters.
 * Each gets its own voice in the pre-recorded clips; on the device's own speech they map to a gender.
 */
export type VoiceKey =
  | 'female' | 'male' | 'grandma' | 'grandpa' | 'mommy' | 'daddy' | 'santa' | 'critter' | 'bigcritter'
  | 'heroF' | 'heroM' | 'villain' | 'queen' | 'narrator';

export const VOICE_GENDER: Record<VoiceKey, 'female' | 'male'> = {
  female: 'female', male: 'male', grandma: 'female', grandpa: 'male', mommy: 'female', daddy: 'male',
  santa: 'male', critter: 'female', bigcritter: 'male',
  heroF: 'female', heroM: 'male', villain: 'male', queen: 'female', narrator: 'male',
};

/** How a pre-recorded clip is looked up: language, voice and exact words. */
export const clipKey = (p: Part) => `${p.lang}|${p.voice ?? 'female'}|${p.text}`;
export const en = (text: string): Part => ({ text, lang: 'en' });
export const es = (text: string): Part => ({ text, lang: 'es' });

export const COLOR_WORDS: Record<string, { en: string; es: string }> = {
  red: { en: 'red', es: 'rojo' },
  blue: { en: 'blue', es: 'azul' },
  yellow: { en: 'yellow', es: 'amarillo' },
  green: { en: 'green', es: 'verde' },
  orange: { en: 'orange', es: 'naranja' },
  purple: { en: 'purple', es: 'morado' },
  pink: { en: 'pink', es: 'rosa' },
};

export const SHAPE_WORDS: Record<string, { en: string; es: string }> = {
  circle: { en: 'circle', es: 'círculo' },
  star: { en: 'star', es: 'estrella' },
  heart: { en: 'heart', es: 'corazón' },
  square: { en: 'square', es: 'cuadrado' },
  triangle: { en: 'triangle', es: 'triángulo' },
};

export const NUMBER_WORDS: { en: string; es: string }[] = [
  { en: 'zero', es: 'cero' },
  { en: 'one', es: 'uno' },
  { en: 'two', es: 'dos' },
  { en: 'three', es: 'tres' },
  { en: 'four', es: 'cuatro' },
  { en: 'five', es: 'cinco' },
  { en: 'six', es: 'seis' },
  { en: 'seven', es: 'siete' },
  { en: 'eight', es: 'ocho' },
  { en: 'nine', es: 'nueve' },
];

