import { describe, expect, it } from 'vitest';
import { MusicSettingsStore, readMusicSettings } from './musicSettings.ts';

function memory(initial?: string) {
  const data = new Map<string, string>();
  if (initial !== undefined) data.set('heliopause:music', initial);
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value);
    },
  };
}

describe('music settings', () => {
  it('defaults to unmuted when nothing is stored or storage is missing', () => {
    expect(readMusicSettings(memory()).muted).toBe(false);
    expect(readMusicSettings(null).muted).toBe(false);
  });

  it('falls back to the defaults for malformed values', () => {
    expect(readMusicSettings(memory('not json')).muted).toBe(false);
    expect(readMusicSettings(memory('{"muted":"yes","volume":"loud"}'))).toEqual(
      readMusicSettings(null),
    );
  });

  it('keeps mute and a clamped volume across visits', () => {
    const storage = memory();
    new MusicSettingsStore(storage).set({ muted: true, volume: 7 });
    expect(readMusicSettings(storage)).toEqual({ muted: true, volume: 1 });
  });

  it('plays on when storage refuses writes, and tells listeners', () => {
    const store = new MusicSettingsStore({
      getItem: () => null,
      setItem: () => {
        throw new Error('full');
      },
    });
    let calls = 0;
    store.subscribe(() => calls++);
    store.set({ muted: true });
    expect(store.get().muted).toBe(true);
    expect(calls).toBe(1);
  });
});
