import { describe, expect, it } from 'vitest';
import { Music, type Voice } from './music.ts';
import { MusicSettingsStore } from './musicSettings.ts';

class FakeVoice implements Voice {
  volume = 0;
  stopped = false;
  readonly file: string;
  constructor(file: string) {
    this.file = file;
  }
  setVolume(volume: number): void {
    this.volume = volume;
  }
  stop(): void {
    this.stopped = true;
  }
}

const FILES: Record<string, string> = {
  music_title: 'a.mp3',
  music_landed: 'a.mp3',
  music_cruise: 'b.mp3',
  music_approach: 'c.mp3',
};

function setup(loaded: string[] = ['a.mp3', 'b.mp3', 'c.mp3']) {
  const voices: FakeVoice[] = [];
  const settings = new MusicSettingsStore(null);
  const music = new Music({
    fileFor: (key) => FILES[key],
    settings,
    fadeMs: 1000,
  });
  const available = new Set(loaded);
  music.attach({
    start: (file) => {
      if (!available.has(file)) return undefined;
      const voice = new FakeVoice(file);
      voices.push(voice);
      return voice;
    },
  });
  return { music, voices, settings, available };
}

describe('Music', () => {
  it('fades the track in and loops one voice per file', () => {
    const { music, voices } = setup();
    music.setScene('Title');
    expect(voices).toHaveLength(1);
    music.tick(500);
    expect(voices[0]?.volume).toBeCloseTo(0.3); // half the fade at the default volume of 0.6
    music.tick(2000);
    expect(voices[0]?.volume).toBeCloseTo(0.6);
  });

  it('keeps playing across contexts that share a file', () => {
    const { music, voices } = setup();
    music.setScene('Title');
    music.tick(2000);
    music.setScene('Landed');
    expect(voices).toHaveLength(1);
  });

  it('crossfades to another file and stops the old voice when it is silent', () => {
    const { music, voices } = setup();
    music.setScene('Landed');
    music.tick(2000);
    music.setScene('Flight');
    expect(voices).toHaveLength(2);
    music.tick(500);
    expect(voices[0]?.volume).toBeCloseTo(0.3);
    expect(voices[1]?.volume).toBeCloseTo(0.3);
    music.tick(600);
    expect(voices[0]?.stopped).toBe(true);
    expect(voices[1]?.stopped).toBe(false);
  });

  it('lets the Approach overlay be set and cleared', () => {
    const { music, voices } = setup();
    music.setScene('Landed');
    music.tick(2000);
    music.setApproach(true);
    expect(voices.at(-1)?.file).toBe('c.mp3');
    music.setApproach(false);
    expect(voices.at(-1)?.file).toBe('a.mp3');
  });

  it('is silent while muted, and the volume slider scales the music', () => {
    const { music, voices, settings } = setup();
    music.setScene('Title');
    music.tick(2000);
    settings.set({ volume: 0.5 });
    expect(voices[0]?.volume).toBeCloseTo(0.5);
    settings.set({ muted: true });
    expect(voices[0]?.volume).toBe(0);
    settings.set({ muted: false });
    expect(voices[0]?.volume).toBeCloseTo(0.5);
  });

  it('plays silence without error when a file is missing, then starts once it arrives', () => {
    const { music, voices, available } = setup([]);
    music.setScene('Title');
    music.tick(100);
    expect(voices).toHaveLength(0);
    available.add('a.mp3');
    music.refresh();
    expect(voices).toHaveLength(1);
  });

  it('is silent for a key the manifest does not list', () => {
    const { music, voices } = setup();
    music.setScene('Landed');
    music.tick(2000);
    music.setCruiseEvent(true);
    music.setScene('Flight');
    // `music_cruise_event` has no file here: the old track fades out and nothing replaces it.
    expect(voices).toHaveLength(1);
    music.tick(2000);
    expect(voices[0]?.stopped).toBe(true);
  });

  it('takes state before a player is attached', () => {
    const music = new Music({
      fileFor: (key) => FILES[key],
      settings: new MusicSettingsStore(null),
    });
    music.setScene('Title');
    const voices: FakeVoice[] = [];
    music.attach({
      start: (file) => {
        const voice = new FakeVoice(file);
        voices.push(voice);
        return voice;
      },
    });
    expect(voices.map((voice) => voice.file)).toEqual(['a.mp3']);
  });
});
