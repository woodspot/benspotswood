import { describe, expect, it } from 'vitest';
import { pickVoice, type VoiceInfo } from './voices';

const v = (name: string, lang: string, voiceURI = `com.apple.voice.compact.${lang}.${name}`): VoiceInfo => ({ name, lang, voiceURI });

const IOS: VoiceInfo[] = [
  v('Samantha', 'en-US'),
  v('Samantha', 'en-US', 'com.apple.voice.enhanced.en-US.Samantha'),
  v('Ava', 'en-US', 'com.apple.voice.premium.en-US.Ava'),
  v('Aaron', 'en-US'),
  v('Evan', 'en-US', 'com.apple.voice.enhanced.en-US.Evan'),
  v('Grandma', 'en-US', 'com.apple.eloquence.en-US.Grandma'),
  v('Zarvox', 'en-US', 'com.apple.speech.synthesis.voice.Zarvox'),
  v('Mónica', 'es-ES'),
  v('Paulina', 'es-MX'),
  v('Juan', 'es-MX'),
];

describe('voice picking', () => {
  it('prefers Premium and Enhanced voices', () => {
    expect(pickVoice(IOS, 'en', 'female')?.name).toBe('Ava');
    expect(pickVoice(IOS, 'en', 'male')?.name).toBe('Evan');
  });

  it('never picks the novelty or robotic voices', () => {
    const junk = [v('Grandma', 'en-US', 'com.apple.eloquence.en-US.Grandma'), v('Zarvox', 'en-US', 'com.apple.speech.synthesis.voice.Zarvox'), v('Fred', 'en-US')];
    expect(pickVoice(junk, 'en', 'female')).toBeNull();
  });

  it('picks the right gender, and Latin American Spanish first', () => {
    expect(pickVoice(IOS, 'es', 'female')?.name).toBe('Paulina');
    expect(pickVoice(IOS, 'es', 'male')?.name).toBe('Juan');
  });

  it('knows the Windows voices too', () => {
    const win = [v('Microsoft David - English (United States)', 'en-US', 'David'), v('Microsoft Zira - English (United States)', 'en-US', 'Zira')];
    expect(pickVoice(win, 'en', 'female')?.name).toContain('Zira');
    expect(pickVoice(win, 'en', 'male')?.name).toContain('David');
  });

  it('falls back to any decent voice in the language', () => {
    expect(pickVoice([v('Samantha', 'en-US')], 'en', 'male')?.name).toBe('Samantha');
    expect(pickVoice([v('Samantha', 'en-US')], 'es', 'female')).toBeNull();
  });
});
