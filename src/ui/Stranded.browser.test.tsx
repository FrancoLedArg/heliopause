import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { EventBus } from '../game/EventBus.ts';
import { readBestScore } from '../game/lib/bestScore.ts';
import { GAME_HEIGHT, GAME_WIDTH, startGame } from '../game/main.ts';
import { SceneKey } from '../game/scenes/keys.ts';
import type { LandedData } from '../game/scenes/Landed.ts';
import { GameUI } from './GameUI.tsx';
import { landing, saveByRefitting, STRANDED_ON_LANDING } from './landingFixtures.ts';
import '../style.css';

let root: Root | undefined;
let game: Phaser.Game | undefined;
let host: HTMLElement | undefined;

beforeEach(() => {
  window.localStorage.clear();
});

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

/** Mounts the whole app at 640×360, then starts the Landed view with `data`. */
async function land(data: LandedData): Promise<HTMLElement> {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  const titleReady = nextSceneReady(SceneKey.Title);
  act(() => {
    root?.render(
      <div className="stage" style={{ width: GAME_WIDTH, height: GAME_HEIGHT }}>
        <div id="stranded-test-game" />
        <div className="stage__ui">
          <GameUI />
        </div>
      </div>,
    );
  });
  game = startGame('stranded-test-game');
  await titleReady;
  const landedReady = nextSceneReady(SceneKey.Landed);
  game.scene.start(SceneKey.Landed, data);
  await landedReady;
  await act(() => Promise.resolve());
  return host;
}

const find = (within: HTMLElement, id: string): HTMLElement | null =>
  within.querySelector<HTMLElement>(`[data-testid="${id}"]`);

it('a Run Stranded on Landing goes straight to the End-of-Run screen with the Stranded why, and records its Score once', async () => {
  const { seed, body } = STRANDED_ON_LANDING;
  const { before, flight, run } = landing(seed, body);
  const ui = await land({ run, report: { before, flight } });

  const screen = find(ui, 'end-of-run');
  expect(screen?.querySelector('h2')?.textContent).toBe('Stranded');
  expect(find(ui, 'end-of-run-why')?.textContent).toBe(
    'However you change its Components, your Spacecraft has at most 3.4 km/s of Δv, and the ' +
      'cheapest Hop needs 4.0 km/s.',
  );
  expect(find(ui, 'end-of-run-score')?.textContent).toBe('0 Star Systems escaped, 1 Hop flown');
  // No Hop report, and nothing left to plan with: the Run is over.
  expect(find(ui, 'hop-report')).toBeNull();
  expect(ui.querySelector('.landed-plate')).toBeNull();
  expect(ui.querySelector('.landed-nav-button')).toBeNull();
  expect(readBestScore()).toEqual({ starSystemsEscaped: 0, hopsFlown: 1 });
  expect(document.activeElement?.textContent).toBe('New Run');
  // M does not open the Nav Chart under the End-of-Run screen.
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'm' }));
  await act(() => Promise.resolve());
  expect(game?.scene.isActive(SceneKey.NavChart)).toBe(false);
});

it('spending the Materials that could have saved the Run strands it on the spot', async () => {
  const ui = await land({ run: saveByRefitting() });
  expect(find(ui, 'stranded-advice')?.textContent).toMatch(/^No Hop is possible as built/);
  expect(find(ui, 'end-of-run')).toBeNull();

  // A level-1 Drill leaves too few Materials for the level-2 Engine that was the way out.
  act(() => {
    EventBus.emit('component-install-requested', 2, 'drill-1');
  });
  await act(() => Promise.resolve());
  expect(find(ui, 'end-of-run')?.querySelector('h2')?.textContent).toBe('Stranded');
  expect(find(ui, 'stranded-warning')).toBeNull();
  expect(readBestScore()).toEqual({ starSystemsEscaped: 0, hopsFlown: 1 });
});

it('New Run from a Stranded Run asks for a Chassis, then starts a new Star System', async () => {
  const { seed, body } = STRANDED_ON_LANDING;
  const { before, flight, run } = landing(seed, body);
  const ui = await land({ run, report: { before, flight } });
  const newRun = [...ui.querySelectorAll('button')].find((b) => b.textContent === 'New Run');
  act(() => {
    newRun?.click();
  });
  const launch = [...ui.querySelectorAll('button')].find((b) => b.textContent === 'Launch');
  if (!launch) throw new Error('no Chassis picker');
  expect(find(ui, 'end-of-run')).toBeNull();
  const started = new Promise<number>((resolve) => {
    const off = EventBus.on('run-started', (next) => {
      off();
      resolve(next.seed);
    });
  });
  act(() => {
    launch.click();
  });
  expect(await started).not.toBe(run.seed);
  await act(() => Promise.resolve());
  expect(ui.querySelector('.landed-plate')).not.toBeNull();
  expect(find(ui, 'end-of-run')).toBeNull();
});
