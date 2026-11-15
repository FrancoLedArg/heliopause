import { browserStorage, type ScoreStorage } from '../lib/bestScore.ts';

export interface MusicSettings {
  muted: boolean;
  /** 0 (silent) to 1 (full). */
  volume: number;
}

export const DEFAULT_MUSIC_SETTINGS: MusicSettings = { muted: false, volume: 0.6 };

const KEY = 'heliopause:music';

/** Where the sound effects keep their mute and volume (the same shape as the music's). */
export const SFX_STORAGE_KEY = 'heliopause:sfx';

function clampVolume(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/** Settings remembered on this device; anything unreadable or malformed falls back to the defaults. */
export function readMusicSettings(
  storage: ScoreStorage | null = browserStorage(),
  key: string = KEY,
): MusicSettings {
  try {
    const raw = storage?.getItem(key);
    if (raw === null || raw === undefined) return DEFAULT_MUSIC_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<Record<keyof MusicSettings, unknown>> | null;
    const muted = parsed?.muted;
    const volume = parsed?.volume;
    return {
      muted: typeof muted === 'boolean' ? muted : DEFAULT_MUSIC_SETTINGS.muted,
      volume:
        typeof volume === 'number' && Number.isFinite(volume)
          ? clampVolume(volume)
          : DEFAULT_MUSIC_SETTINGS.volume,
    };
  } catch {
    return DEFAULT_MUSIC_SETTINGS;
  }
}

/** A live copy of the settings: changes are saved (when storage allows) and announced to listeners. */
export class MusicSettingsStore {
  private current: MusicSettings;
  private readonly listeners = new Set<() => void>();

  private readonly storage: ScoreStorage | null;
  private readonly key: string;

  /** `key` names the storage entry: the music and the effects each keep their own mute and volume. */
  constructor(storage: ScoreStorage | null = browserStorage(), key: string = KEY) {
    this.storage = storage;
    this.key = key;
    this.current = readMusicSettings(storage, key);
  }

  get = (): MusicSettings => this.current;

  set(patch: Partial<MusicSettings>): void {
    const next = {
      muted: patch.muted ?? this.current.muted,
      volume: clampVolume(patch.volume ?? this.current.volume),
    };
    if (next.muted === this.current.muted && next.volume === this.current.volume) return;
    this.current = next;
    try {
      this.storage?.setItem(this.key, JSON.stringify(next));
    } catch {
      // Without storage the settings last for this visit only.
    }
    for (const listener of this.listeners) listener();
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
}
