import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, expect, it } from 'vitest';
import { EventBus } from '../game/EventBus.ts';
import { SceneKey } from '../game/scenes/keys.ts';
import type { Landed } from '../game/scenes/Landed.ts';
import { GAME_HEIGHT, GAME_WIDTH, startGame } from '../game/main.ts';
import { startRun } from '../game/sim/index.ts';
import { GameUI } from './GameUI.tsx';
import '../style.css';

let root: Root | undefined;
let game: Phaser.Game | undefined;
let host: HTMLElement | undefined;

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  game?.destroy(true);
  host?.remove();
  root = host = game = undefined;
});

function nextSceneReady(wanted: SceneKey): Promise<void> {
  return new Promise((resolve) => {
    const off = EventBus.on('scene-ready', (key) => {
      if (key === wanted) {
        off();
        resolve();
      }
    });
  });
}

async function boot(): Promise<Phaser.Game> {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  const titleReady = nextSceneReady(SceneKey.Title);
  act(() => {
    root?.render(
      <div className="stage" style={{ width: GAME_WIDTH, height: GAME_HEIGHT }}>
        <div id="run-menu-test-game" />
        <div className="stage__ui">
          <GameUI />
        </div>
      </div>,
    );
  });
  game = startGame('run-menu-test-game');
  await titleReady;
  return game;
}

it('leaving the Run and starting another many times leaves one handler per event', async () => {
  const started = await boot();
  const baseline = {
    newRun: EventBus.listenerCount('new-run-requested'),
    leave: EventBus.listenerCount('leave-run-requested'),
  };

  for (let cycle = 0; cycle < 4; cycle++) {
    const landed = nextSceneReady(SceneKey.Landed);
    EventBus.emit('new-run-requested', 100 + cycle, 'scout');
    await landed;
    expect(EventBus.listenerCount('leave-run-requested')).toBe(baseline.leave + 1);
    expect(started.scene.isActive(SceneKey.Landed)).toBe(true);
    const landedScene = started.scene.getScene<Landed>(SceneKey.Landed);
    // The ambient life is running: drift and twinkle tweens, the lights timer, the dust listener.
    expect(landedScene.tweens.getTweens().length).toBeGreaterThan(0);

    const title = nextSceneReady(SceneKey.Title);
    EventBus.emit('leave-run-requested');
    await title;
    await act(() => Promise.resolve());

    expect(started.scene.isActive(SceneKey.Landed)).toBe(false);
    // Leaving the Run stops every ambient tween, timer and update listener.
    expect(landedScene.tweens.getTweens()).toHaveLength(0);
    // Phaser has no public list of a Clock's timers, so read its two queues.
    const clock = landedScene.time as unknown as {
      _active: unknown[];
      _pendingInsertion: unknown[];
    };
    expect(clock._active).toHaveLength(0);
    expect(clock._pendingInsertion).toHaveLength(0);
    expect(landedScene.events.listenerCount('update')).toBe(0);
    expect(EventBus.listenerCount('leave-run-requested')).toBe(baseline.leave);
    expect(EventBus.listenerCount('new-run-requested')).toBe(baseline.newRun);
  }
});

it('Esc does not open the Menu when another handler already used it to close an overlay', async () => {
  const started = await boot();
  const landed = nextSceneReady(SceneKey.Landed);
  started.scene.start(SceneKey.Landed, { run: startRun(9, 'scout') });
  await landed;
  await act(() => Promise.resolve());

  const consume = (event: KeyboardEvent): void => {
    event.preventDefault();
  };
  window.addEventListener('keydown', consume); // added after the Menu's own handler
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', cancelable: true }));
  await act(() => new Promise((resolve) => setTimeout(resolve, 20)));
  expect(document.querySelector('[role="dialog"]')).toBeNull();
  window.removeEventListener('keydown', consume);

  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', cancelable: true }));
  await act(() => new Promise((resolve) => setTimeout(resolve, 20)));
  expect(document.querySelector('[role="dialog"]')).not.toBeNull();
});
