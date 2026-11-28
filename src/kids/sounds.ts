// Real animal recordings (made by scripts/gen-sounds.py into ./sounds/<id>.mp3; credits in
// public/sounds/CREDITS.txt). A speech Part with `sound: 'cow'` plays the recording in place of its
// spoken text; an animal without a recording keeps its spoken sound.
const files = import.meta.glob<string>('./sounds/*.mp3', { eager: true, query: '?url', import: 'default' });

/** The recording's URL for an animal id, if there is one. */
export const soundUrl = (id: string): string | undefined => files[`./sounds/${id}.mp3`];

export const hasSound = (id: string): boolean => !!soundUrl(id);
