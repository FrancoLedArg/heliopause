import { audioFile } from '../assets/manifest.ts';
import type { SceneKey } from '../scenes/keys.ts';
import { musicKeyFor, type MusicState } from './musicPlan.ts';
import { MusicSettingsStore } from './musicSettings.ts';

/** One playing, looping track. */
export interface Voice {
  setVolume(volume: number): void;
  stop(): void;
}

/** Starts a looping voice for an audio file; `undefined` when the file is not loaded (silence). */
export interface Player {
  start(file: string): Voice | undefined;
}

interface Playing {
  readonly file: string;
  readonly voice: Voice;
  /** Fade level, 0 to 1. */
  level: number;
}

export const CROSSFADE_MS = 1500;

interface MusicOptions {
  fileFor?: (key: string) => string | undefined;
  settings?: MusicSettingsStore;
  fadeMs?: number;
}

/**
 * The music system: one track per context, crossfaded, looping. Contexts come from the scene on screen
 * plus two overlays other features set and clear: `setApproach` (the Approach shot, the Stranded
 * warning) and `setCruiseEvent` (a Component Damaged during a Cruise). A key with no file, or a file not
 * loaded, plays silence.
 */
export class Music {
  private state: MusicState = {
    scene: undefined,
    chartOpen: false,
    jumping: false,
    ended: false,
    approach: false,
    cruiseEvent: false,
  };
  private player: Player | undefined;
  private current: Playing | undefined;
  private fading: Playing[] = [];
  private readonly fileFor: (key: string) => string | undefined;
  private readonly fadeMs: number;
  readonly settings: MusicSettingsStore;

  constructor(options: MusicOptions = {}) {
    this.fileFor = options.fileFor ?? ((key) => audioFile(key));
    this.fadeMs = options.fadeMs ?? CROSSFADE_MS;
    this.settings = options.settings ?? new MusicSettingsStore();
    this.settings.subscribe(() => {
      this.applyVolumes();
    });
  }

  attach(player: Player): void {
    this.detach();
    this.player = player;
    this.reconcile();
  }

  /**
   * Drops the player (the game is gone). The voices are not stopped here: destroying the game
   * tears down its sound manager, which removes them. With `player`, it only detaches if that player
   * is still the attached one: a game destroyed after a newer game attached (React StrictMode mounts
   * twice in dev, and Phaser destroys on its next step) must not silence the newer game.
   */
  detach(player?: Player): void {
    if (player !== undefined && player !== this.player) return;
    this.player = undefined;
    this.current = undefined;
    this.fading = [];
  }

  /** Whether `player` is the one attached now. */
  isAttached(player: Player): boolean {
    return this.player === player;
  }

  setScene(scene: SceneKey): void {
    // A scene change ends the Jump moment; the Run's end carries on until the Title or a new Run.
    this.update({ scene, jumping: false, ended: scene === 'Title' ? false : this.state.ended });
  }

  setChartOpen(chartOpen: boolean): void {
    this.update({ chartOpen });
  }

  setJumping(jumping: boolean): void {
    this.update({ jumping });
  }

  setEnded(ended: boolean): void {
    this.update({ ended });
  }

  /** The Approach shot and the Stranded warning: `music_approach` plays while set. */
  setApproach(approach: boolean): void {
    this.update({ approach });
  }

  /** A Component is Damaged during a Cruise: `music_cruise_event` plays while set, `music_cruise` otherwise. */
  setCruiseEvent(cruiseEvent: boolean): void {
    this.update({ cruiseEvent });
  }

  /** Looks again at what should play, e.g. after a file finished loading. */
  refresh(): void {
    this.reconcile();
  }

  /** Moves the crossfades on by `deltaMs`. */
  tick(deltaMs: number): void {
    const step = deltaMs / this.fadeMs;
    if (this.current && this.current.level < 1) {
      this.current.level = Math.min(1, this.current.level + step);
    }
    for (const old of this.fading) old.level -= step;
    const gone = this.fading.filter((old) => old.level <= 0);
    for (const old of gone) old.voice.stop();
    this.fading = this.fading.filter((old) => old.level > 0);
    this.applyVolumes();
  }

  private update(patch: Partial<MusicState>): void {
    this.state = { ...this.state, ...patch };
    this.reconcile();
  }

  private reconcile(): void {
    if (!this.player) return;
    const key = musicKeyFor(this.state);
    const file = key === undefined ? undefined : this.fileFor(key);
    if (file !== undefined && this.current?.file === file) return;
    if (file === undefined && this.current === undefined) return;
    if (this.current) {
      this.fading.push(this.current);
      this.current = undefined;
    }
    const voice = file === undefined ? undefined : this.player.start(file);
    if (file !== undefined && voice) {
      voice.setVolume(0);
      this.current = { file, voice, level: 0 };
    }
  }

  private applyVolumes(): void {
    const { muted, volume } = this.settings.get();
    const gain = muted ? 0 : volume;
    if (this.current) this.current.voice.setVolume(this.current.level * gain);
    for (const old of this.fading) old.voice.setVolume(Math.max(0, old.level) * gain);
  }
}

/** The one music system of the game. Features set and clear their contexts on it. */
export const music = new Music();
