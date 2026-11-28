import { describe, expect, it } from 'vitest';
import list from './art-list.json';
import { drawing } from './art';
import { PICS } from '../match/game';
import { LETTERS } from '../abc/game';
import { ANIMALS } from '../barn/game';
import { AVATARS, SIZE_THINGS, THINGS } from '../trail/game';
import { CONTACTS } from '../phone/game';

const entries = list as Record<string, string[]>;

describe('storybook pictures', () => {
  it('has a picture planned for every emoji the games show', () => {
    const used = [
      ...Object.values(PICS).flat().map((p) => p.e),
      ...Object.values(LETTERS).flat().map((l) => (l.emoji.startsWith('<svg') ? /aria-label="([^"]+)"/.exec(l.emoji)![1] : l.emoji)),
      ...ANIMALS.map((a) => a.emoji),
      ...THINGS.map((t) => t.e),
      ...SIZE_THINGS,
      ...AVATARS,
      ...CONTACTS.filter((c) => !c.family).map((c) => c.emoji),
      '🦉',
    ];
    const missing = [...new Set(used)].filter((e) => !(e in entries));
    expect(missing).toEqual([]);
  });

  it('gives every picture its own file name', () => {
    const ids = Object.values(entries).map(([id]) => id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-z-]+$/);
  });

  it('falls back to the emoji when a picture is not drawn', () => {
    expect(drawing('🦖')).toBe('🦖');
  });
});
