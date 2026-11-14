import { Time } from 'phaser';
import { afterEach, expect, it, vi } from 'vitest';
import { EventBus } from '../EventBus.ts';
import { startGame } from '../main.ts';
import { SceneKey } from './keys.ts';
import type { Title } from './Title.ts';

let game: Phaser.Game | undefined;

afterEach(() => {
  game?.destroy(true);
  game = undefined;
  vi.restoreAllMocks();
});

function forceReducedMotion(reduced: boolean): void {
  vi.spyOn(window, 'matchMedia').mockImplementation(
    (query) => ({ matches: reduced && query.includes('reduce') }) as MediaQueryList,
  );
}

async function bootToTitle(): Promise<{ title: Title; game: Phaser.Game }> {
  const container = document.createElement('div');
  document.body.append(container);
  const ready = new Promise<void>((resolve) => {
    const off = EventBus.on('scene-ready', () => {
      off();
      resolve();
    });
  });
  const started = startGame(container);
  game = started;
  await ready;
  return { title: started.scene.getScene<Title>(SceneKey.Title), game: started };
}

it('animates the backdrop: stars drift, the moon orbits, the star glows', async () => {
  forceReducedMotion(false);
  const { title } = await bootToTitle();

  expect(title.reducedMotion).toBe(false);
  expect(title.tweens.getTweens().length).toBeGreaterThan(5);
});

it('holds the backdrop still when the player prefers reduced motion', async () => {
  forceReducedMotion(true);
  const delayedCall = vi.spyOn(Time.Clock.prototype, 'delayedCall');
  const { title } = await bootToTitle();

  expect(title.reducedMotion).toBe(true);
  expect(title.tweens.getTweens()).toHaveLength(0);
  expect(delayedCall).not.toHaveBeenCalled();
});

it('stops every tween and timer when the scene shuts down', async () => {
  forceReducedMotion(false);
  const removeTimer = vi.spyOn(Time.TimerEvent.prototype, 'remove');
  const { title, game: started } = await bootToTitle();
  expect(title.tweens.getTweens().length).toBeGreaterThan(0);

  started.scene.stop(SceneKey.Title);

  expect(title.tweens.getTweens()).toHaveLength(0);
  expect(removeTimer).toHaveBeenCalled();
});
