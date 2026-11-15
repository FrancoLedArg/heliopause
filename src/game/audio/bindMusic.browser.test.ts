import { afterEach, expect, it } from 'vitest';
import { EventBus } from '../EventBus.ts';
import { startGame } from '../main.ts';
import { SceneKey } from '../scenes/keys.ts';

let game: Phaser.Game | undefined;
const errors: unknown[] = [];
const onError = (event: ErrorEvent): void => {
  errors.push(event.error);
};
const onRejection = (event: PromiseRejectionEvent): void => {
  errors.push(event.reason);
};

afterEach(() => {
  game?.destroy(true);
  game = undefined;
  window.removeEventListener('error', onError);
  window.removeEventListener('unhandledrejection', onRejection);
  errors.length = 0;
});

function titleReady(): Promise<void> {
  return new Promise((resolve) => {
    const off = EventBus.on('scene-ready', (key) => {
      if (key === SceneKey.Title) {
        off();
        resolve();
      }
    });
  });
}

it('destroying the game while the tracks are still loading raises no error', async () => {
  window.addEventListener('error', onError);
  window.addEventListener('unhandledrejection', onRejection);
  const container = document.createElement('div');
  document.body.append(container);
  const ready = titleReady();
  game = startGame(container);
  await ready;
  // The lazy load has just begun; tear the game down under it.
  game.destroy(true);
  game = undefined;
  container.remove();
  await new Promise((resolve) => setTimeout(resolve, 1500));
  expect(errors.map((e) => String((e as Error).stack))).toEqual([]);
});

it('loads the tracks into the cache once the title is up', async () => {
  const container = document.createElement('div');
  document.body.append(container);
  const ready = titleReady();
  game = startGame(container);
  await ready;
  const started = game;
  await expect
    .poll(() => started.cache.audio.exists('audio/music_abandoned_craft_1.mp3'), {
      timeout: 15000,
    })
    .toBe(true);
  container.remove();
});
