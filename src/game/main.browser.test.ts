import { afterEach, expect, it } from 'vitest';
import { KIT_ATLAS_KEY } from '../ui/kit/kit.ts';
import { EventBus } from './EventBus.ts';
import { GAME_HEIGHT, GAME_WIDTH, startGame } from './main.ts';
import { SceneKey } from './scenes/keys.ts';
import { kilograms, launchHop, listBodies, startRun, type Run } from './sim/index.ts';

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
  const run = new Promise<Run>((resolve) => {
    const off = EventBus.on('run-started', (started) => {
      off();
      resolve(started);
    });
  });
  EventBus.emit('new-run-requested', 123, 'lancer');

  expect(await landed).toBe(SceneKey.Landed);
  expect((await run).spacecraft.chassisId).toBe('lancer');
  expect(game.scene.isActive(SceneKey.Title)).toBe(false);
});

it('a New Run request from any scene, not only the Title, starts a fresh Run on the Landed scene', async () => {
  const { game } = await bootToTitle();
  const first = nextSceneReady();
  EventBus.emit('new-run-requested', 123, 'scout');
  expect(await first).toBe(SceneKey.Landed);

  // From the Flight scene (a failed Hop leaves the player there).
  const flying = nextSceneReady();
  game.scene.stop(SceneKey.Landed);
  // Re-pinned for #189: seed 1's scout, low on Fuel, crashes on its first target. A sixteenth of its
  // Fuel since #247 (was a tenth): with the Isp 30% higher, a tenth now Arrives.
  const full = startRun(1, 'scout');
  const run = {
    ...full,
    spacecraft: { ...full.spacecraft, fuelMass: kilograms(full.spacecraft.fuelMass / 16) },
  };
  const target = listBodies(run.starSystem).find((body) => {
    const launched = launchHop(run, body.id);
    return launched.kind === 'flown' && launched.flight.outcome.kind === 'crashed';
  });
  if (!target) throw new Error('seed 1 has no crashing Hop');
  const launched = launchHop(run, target.id);
  if (launched.kind !== 'flown') throw new Error('not flown');
  game.scene.start(SceneKey.Flight, {
    before: run,
    flight: launched.flight,
    after: launched.run,
  });
  expect(await flying).toBe(SceneKey.Flight);

  const started = new Promise<Run>((resolve) => {
    const off = EventBus.on('run-started', (r) => {
      off();
      resolve(r);
    });
  });
  const landed = nextSceneReady();
  EventBus.emit('new-run-requested', 77, 'hauler');
  expect(await landed).toBe(SceneKey.Landed);
  const second = await started;
  expect(second.seed).toBe(77);
  expect(second.spacecraft.chassisId).toBe('hauler');
  expect(game.scene.isActive(SceneKey.Flight)).toBe(false);
  expect(game.scene.isActive(SceneKey.Landed)).toBe(true);
});
