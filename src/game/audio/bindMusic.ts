import { Core, Sound, type Game } from 'phaser';
import { audioFiles } from '../assets/manifest.ts';
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
async function loadTracks(game: Game, onLoaded: () => void): Promise<void> {
  const manager = game.sound;
  if (!(manager instanceof Sound.WebAudioSoundManager)) return;
  for (const { file, url } of audioFiles()) {
    try {
      const response = await fetch(url);
      const type = response.headers.get('content-type') ?? '';
      if (!response.ok || type.includes('text/html')) continue;
      const data = await response.arrayBuffer();
      await new Promise<void>((resolve) => {
        const done = (): void => {
          manager.off(Sound.Events.DECODED, onDecoded);
          resolve();
        };
        const onDecoded = (key: string): void => {
          if (key === file) done();
        };
        manager.on(Sound.Events.DECODED, onDecoded);
        manager.decodeAudio(file, data);
        // A file that fails to decode never fires DECODED: do not wait on it for long.
        setTimeout(done, 20000);
      });
      onLoaded();
    } catch {
      // Offline or blocked: this music is silence.
    }
  }
}

/**
 * Connects the music system to a running game: scenes and playback events set the contexts, the game's
 * clock moves the crossfade, and the tracks load once the title is on screen. Undone when the game is destroyed.
 */
export function bindMusic(game: Game, target: Music = music): void {
  target.attach(phaserPlayer(game));
  let loading = false;
  const offs = [
    EventBus.on('scene-ready', (key) => {
      target.setScene(key);
      if (key === SceneKey.Title && !loading) {
        loading = true;
        void loadTracks(game, () => {
          target.refresh();
        });
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
    for (const off of offs) off();
    game.events.off(Core.Events.PRE_STEP, onStep);
    target.setApproach(false);
    target.setCruiseEvent(false);
    target.detach();
  });
}
