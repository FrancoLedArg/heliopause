import { afterEach, expect, it } from 'vitest';
import { KIT_ATLAS_KEY } from '../ui/kit/kit.ts';
import { EventBus } from './EventBus.ts';
import { GAME_HEIGHT, GAME_WIDTH, startGame } from './main.ts';
import { SceneKey } from './scenes/keys.ts';

let game: Phaser.Game | undefined;

afterEach(() => {
  game?.destroy(true);
  game = undefined;
});

function nextSceneReady(): Promise<string> {
  return new Promise((resolve) => {
    const off = EventBus.on('scene-ready', (key) => {
      off();
      resolve(key);
    });
  });
}

async function bootToTitle(): Promise<{ game: Phaser.Game; container: HTMLElement }> {
  const container = document.createElement('div');
  document.body.append(container);
  const ready = nextSceneReady();
  game = startGame(container);
  expect(await ready).toBe(SceneKey.Title);
  return { game, container };
}

it('boots through to the Title scene', async () => {
  const { game, container } = await bootToTitle();

  expect(game.scene.isActive(SceneKey.Title)).toBe(true);
  expect(container.querySelector('canvas')).not.toBeNull();
});

it('renders at the native 640x360 pixel-art resolution', async () => {
  const { game } = await bootToTitle();

  expect([GAME_WIDTH, GAME_HEIGHT]).toEqual([640, 360]);
  expect([game.canvas.width, game.canvas.height]).toEqual([640, 360]);
  expect(game.config.antialias).toBe(false);
});

it('loads the UI kit atlas through the asset manifest by its key', async () => {
  const { game } = await bootToTitle();

  const kit = game.textures.get(KIT_ATLAS_KEY);
  expect(kit.has('btn_primary_normal')).toBe(true);
  expect(kit.get('panel_metal').width).toBe(48);
});

it('a New Run request on the Title screen lands on the Landed scene', async () => {
  const { game } = await bootToTitle();

  const landed = nextSceneReady();
  EventBus.emit('new-run-requested', 123);

  expect(await landed).toBe(SceneKey.Landed);
  expect(game.scene.isActive(SceneKey.Title)).toBe(false);
});
