import { afterEach, expect, it } from 'vitest';
import { EventBus } from './EventBus.ts';
import { startGame } from './main.ts';
import { SceneKey } from './scenes/keys.ts';

let game: Phaser.Game | undefined;

afterEach(() => {
  game?.destroy(true);
  game = undefined;
});

it('boots through to the Title scene', async () => {
  const container = document.createElement('div');
  document.body.append(container);

  const ready = new Promise<string>((resolve) => {
    const off = EventBus.on('scene-ready', (key) => {
      off();
      resolve(key);
    });
  });

  game = startGame(container);

  expect(await ready).toBe(SceneKey.Title);
  expect(game.scene.isActive(SceneKey.Title)).toBe(true);
  expect(container.querySelector('canvas')).not.toBeNull();
});
