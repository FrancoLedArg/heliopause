import { Core, Sound, type Game } from 'phaser';
import { audioFiles } from '../assets/manifest.ts';
import { anyDamaged } from '../../ui/repairView.ts';
import { EventBus } from '../EventBus.ts';
import { SceneKey } from '../scenes/keys.ts';
import { music, type Music, type Player } from './music.ts';

/** Drives Phaser's sound manager. Sounds start while the audio context is locked and play once the first gesture unlocks it. */
function phaserPlayer(game: Game): Player {
  return {
    start(file) {
      if (!game.cache.audio.exists(file)) return undefined;
      const sound = game.sound.add(file, { loop: true, volume: 0 });
      sound.play();
      return {
        setVolume(volume) {
          // Both the Web Audio and HTML5 sounds have `volume`; the plain interface does not declare it.
          (sound as Sound.WebAudioSound).volume = volume;
        },
        stop() {
          sound.destroy();
        },
      };
    },
  };
}

/**
 * Fetches and decodes one track at a time, after the title is up, so the several MB never delay the
 * first paint. A file that is missing or cannot be decoded is skipped: that music plays silence.
 */
export async function loadTracks(
  game: Game,
  onLoaded: () => void,
  signal: AbortSignal,
  files: readonly { file: string; url: string }[] = audioFiles(),
): Promise<void> {
  const manager = game.sound;
  if (!(manager instanceof Sound.WebAudioSoundManager)) return;
  // A function, so the checks after each await are not narrowed away: the signal changes meanwhile.
  const aborted = (): boolean => signal.aborted;
  for (const { file, url } of files) {
    if (aborted()) return;
    try {
      const response = await fetch(url, { signal });
      const type = response.headers.get('content-type') ?? '';
      if (!response.ok || type.includes('text/html')) continue;
      const data = await response.arrayBuffer();
      if (aborted()) return;
      // Decoded through the audio context, not the sound manager's callback API: once `signal`
      // aborts (the game is destroyed) nothing is left that could touch the torn-down cache.
      const buffer = await manager.context.decodeAudioData(data);
      if (aborted()) return;
      game.cache.audio.add(file, buffer);
      onLoaded();
    } catch {
      // Offline, blocked, aborted or undecodable: this music is silence.
    }
  }
}

/**
 * Connects the music system to a running game: scenes and playback events set the contexts, the game's
 * clock moves the crossfade, and the tracks load once the title is on screen. Undone when the game is destroyed.
 */
export function bindMusic(game: Game, target: Music = music): void {
  const player = phaserPlayer(game);
  target.attach(player);
  let loading = false;
  const loadAbort = new AbortController();
  const offs = [
    EventBus.on('scene-ready', (key) => {
      target.setScene(key);
      if (key === SceneKey.Title && !loading) {
        loading = true;
        void loadTracks(
          game,
          () => {
            target.refresh();
          },
          loadAbort.signal,
        );
      }
    }),
    EventBus.on('nav-chart-state', (state) => {
      target.setChartOpen(state !== undefined);
    }),
    EventBus.on('jump-stage', () => {
      target.setJumping(true);
    }),
    EventBus.on('hop-failed', () => {
      target.setEnded(true);
    }),
    // The Cruise's music turns tense while anything aboard is Damaged, until it is Repaired (#250).
    EventBus.on('cruise-updated', (run) => {
      target.setCruiseEvent(anyDamaged(run));
    }),
    EventBus.on('hop-flight-settled', () => {
      target.setCruiseEvent(false);
    }),
    EventBus.on('run-stranded', () => {
      target.setEnded(true);
    }),
    EventBus.on('run-started', () => {
      target.setEnded(false);
    }),
    EventBus.on('new-run-requested', () => {
      target.setEnded(false);
    }),
  ];
  const onStep = (_time: number, delta: number): void => {
    target.tick(delta);
  };
  game.events.on(Core.Events.PRE_STEP, onStep);
  game.events.once(Core.Events.DESTROY, () => {
    loadAbort.abort();
    for (const off of offs) off();
    game.events.off(Core.Events.PRE_STEP, onStep);
    // Only this game's player: a newer game may already be attached (StrictMode double mount).
    if (!target.isAttached(player)) return;
    // Detach first: clearing the overlays reconciles, and must not reach the dying sound manager.
    target.detach(player);
    target.setApproach(false);
    target.setCruiseEvent(false);
  });
}
