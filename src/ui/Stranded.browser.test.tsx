import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { EventBus } from '../game/EventBus.ts';
import { readBestScore } from '../game/lib/bestScore.ts';
import { GAME_HEIGHT, GAME_WIDTH, startGame } from '../game/main.ts';
import { SceneKey } from '../game/scenes/keys.ts';
import type { LandedData } from '../game/scenes/Landed.ts';
import { endIfStranded, kilograms } from '../game/sim/index.ts';
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
  const { seed, path } = STRANDED_ON_LANDING;
  const { before, flight, run } = landing(seed, path);
  const ui = await land({ run, report: { before, flight } });

  const screen = find(ui, 'end-of-run');
  expect(screen?.querySelector('h2')?.textContent).toBe('Stranded');
  expect(find(ui, 'end-of-run-why')?.textContent).toBe(
    // Re-pinned for #189: seed 12, back on Laquun (was seed 305's Lyquin); for #247: seed 27, back on
    // Dryli (seed 12's Run no longer strands once the Isp rose 30%); for #280: seed 10, back on
    // Lanpraen (Comms Detects a Fuel source first, so seed 27's Siolmel is never Detected).
    'However you change its Components, your Spacecraft has at most 4.7 km/s of Δv, and the ' +
      'cheapest Hop needs 5.2 km/s.',
  );
  expect(find(ui, 'end-of-run-score')?.getAttribute('aria-label')).toBe(
    'Score: 0 Star Systems escaped, 4 Hops flown',
  );
  // No Hop report, and nothing left to plan with: the Run is over.
  expect(find(ui, 'hop-report')).toBeNull();
  expect(ui.querySelector('.landed-plate')).toBeNull();
  expect(ui.querySelector('.landed-nav-button')).toBeNull();
  expect(readBestScore()).toEqual({ starSystemsEscaped: 0, hopsFlown: 4 });
  expect(document.activeElement?.textContent).toBe('New Run');
  // M does not open the Nav Chart under the End-of-Run screen.
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'm' }));
  await act(() => Promise.resolve());
  expect(game?.scene.isActive(SceneKey.NavChart)).toBe(false);
});

it('a Run that arrives in a new Star System with no way out ends there too, whatever started the Landed view', async () => {
  // As after a Jump: the Landed view comes up with no Hop report, in System 2,
  // with about 250 kg of Fuel (the case PR #180 found on seed 5). The Jump returns its Run through
  // `endIfStranded`, like every operation that leaves the Spacecraft on a Body.
  const { before } = landing(STRANDED_ON_LANDING.seed, STRANDED_ON_LANDING.path);
  const lowFuel = { ...before.spacecraft, fuelMass: kilograms(250) };
  const arrived = endIfStranded({
    ...before,
    starSystemNumber: 2,
    hopsFlown: 1,
    spacecraft: lowFuel,
  });
  expect(arrived.status).toMatchObject({ kind: 'ended', end: { kind: 'stranded' } });
  const ui = await land({ run: arrived });
  expect(find(ui, 'end-of-run')?.querySelector('h2')?.textContent).toBe('Stranded');
  expect(find(ui, 'end-of-run-score')?.getAttribute('aria-label')).toBe(
    'Score: 1 Star System escaped, 1 Hop flown',
  );
  expect(readBestScore()).toEqual({ starSystemsEscaped: 1, hopsFlown: 1 });
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
  expect(readBestScore()).toEqual({ starSystemsEscaped: 0, hopsFlown: 4 });
});

it('New Run from a Stranded Run asks for a Chassis, then starts a new Star System', async () => {
  const { seed, path } = STRANDED_ON_LANDING;
  const { before, flight, run } = landing(seed, path);
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
