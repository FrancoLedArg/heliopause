import { MusicSettingsStore, SFX_STORAGE_KEY } from './musicSettings.ts';
import { hasRecipe } from './sfxRecipes.ts';

/** Plays one sound effect, once, at `volume` (0 to 1). */
export interface SfxPlayer {
  play(key: string, volume: number): void;
}

interface SfxOptions {
  settings?: MusicSettingsStore;
  has?: (key: string) => boolean;
}

/**
 * The sound effects: `play(key)` fires a one-shot at the effects volume. A key with no sound, a muted
 * or silent setting, or no player (the game is gone) plays silence.
 */
export class Sfx {
  private player: SfxPlayer | undefined;
  private readonly has: (key: string) => boolean;
  readonly settings: MusicSettingsStore;

  constructor(options: SfxOptions = {}) {
    this.settings = options.settings ?? new MusicSettingsStore(undefined, SFX_STORAGE_KEY);
    this.has = options.has ?? hasRecipe;
  }

  attach(player: SfxPlayer): void {
    this.player = player;
  }

  /** Drops `player`, or whichever is attached when none is given: a destroyed game must not detach a newer game's player. */
  detach(player?: SfxPlayer): void {
    if (player === undefined || this.player === player) this.player = undefined;
  }

  play(key: string): void {
    const { muted, volume } = this.settings.get();
    if (!this.player || muted || volume <= 0 || !this.has(key)) return;
    this.player.play(key, volume);
  }
}

/** The one sound-effects system of the game. */
export const sfx = new Sfx();
