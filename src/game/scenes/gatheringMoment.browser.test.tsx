import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { userEvent } from 'vitest/browser';
import { GameUI } from '../../ui/GameUI.tsx';
import { formatFuel } from '../../ui/format.ts';
import { EventBus } from '../EventBus.ts';
import { GAME_HEIGHT, GAME_WIDTH, startGame } from '../main.ts';
import { firstDetectedBody, launchHop, startRun } from '../sim/index.ts';
import { READOUT_ICON } from './gathering.ts';
import { SceneKey } from './keys.ts';
import type { LandedData } from './Landed.ts';
import '../../style.css';

let root: Root | undefined;
let game: Phaser.Game | undefined;
let host: HTMLElement | undefined;

afterEach(() => {
  vi.restoreAllMocks();
  act(() => {
    root?.unmount();
  });
  game?.destroy(true);
  host?.remove();
  root = host = game = undefined;
});

// An Arrived Hop that collects Fuel: seed 123's Scout to its first target, Viormio (an Icy Moon).
// Re-pinned for #189 (was seed 2026's Home Moon).
const before = startRun(123, 'scout');
const moon = firstDetectedBody(before.starSystem);
const launched = launchHop(before, moon.id);
if (launched.kind !== 'flown' || launched.flight.collection?.kind !== 'fuel') {
  throw new Error('seed 123: the Scout should Arrive on its first target and collect Fuel');
}
const arrival: LandedData = { run: launched.run, report: { before, flight: launched.flight } };
/** What the top bar reads before the Fuel arrives (what the Hop left) and once it has. */
const FUEL_BEFORE = formatFuel(launched.flight.fuelRemaining);
const FUEL_AFTER = formatFuel(launched.run.spacecraft.fuelMass);

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

/** Mounts the whole app and opens the Landed view with `data`, resolving once it is on screen. */
async function land(data: LandedData): Promise<void> {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  const titleReady = nextSceneReady(SceneKey.Title);
  act(() => {
    root?.render(
      <div className="stage" style={{ width: GAME_WIDTH, height: GAME_HEIGHT }}>
        <div id="gathering-test-game" />
        <div className="stage__ui">
          <GameUI />
        </div>
      </div>,
    );
  });
  game = startGame('gathering-test-game');
  await titleReady;
  const landedReady = nextSceneReady(SceneKey.Landed);
  game.scene.start(SceneKey.Landed, data);
  await landedReady;
  await act(() => Promise.resolve());
}

const topBarFuel = (): string | null | undefined =>
  document.querySelector('[data-testid="fuel"]')?.textContent;
const report = (): Element | null => document.querySelector('[data-testid="hop-report"]');

function gatheringEnded(): Promise<void> {
  return new Promise((resolve) => {
    const off = EventBus.on('gathering-ended', () => {
      off();
      resolve();
    });
  });
}

it('the gathering moment ends with the top bar showing the new Fuel, then opens the Hop report', async () => {
  const ended = gatheringEnded();
  await land(arrival);
  // The Fuel has not arrived yet: the top bar still reads what the Hop left, and the report waits.
  expect(topBarFuel()).toBe(FUEL_BEFORE);
  expect(report()).toBeNull();
  await ended;
  await act(() => Promise.resolve());
  expect(topBarFuel()).toBe(FUEL_AFTER);
  expect(report()).not.toBeNull();
});

it('the gathering moment ends at once under reduced motion', async () => {
  vi.spyOn(window, 'matchMedia').mockImplementation(
    (query) => ({ matches: query.includes('reduce') }) as MediaQueryList,
  );
  await land(arrival);
  expect(topBarFuel()).toBe(FUEL_AFTER);
  expect(report()).not.toBeNull();
});

/** Lets the skip settle: React renders the report and its focus effect runs. */
async function settle(): Promise<void> {
  await act(() => new Promise((resolve) => setTimeout(resolve, 100)));
}

// The keys that also press a button: the skip must take the whole keypress, so the report it opens
// stays up instead of being dismissed by the same key on its newly focused Continue button.
for (const [key, typed] of [
  ['Enter', '{Enter}'],
  ['Space', ' '],
] as const) {
  it(`${key} skips the gathering moment to its end and leaves the Hop report open`, async () => {
    await land(arrival);
    expect(topBarFuel()).toBe(FUEL_BEFORE);
    await userEvent.keyboard(typed);
    await settle();
    expect(topBarFuel()).toBe(FUEL_AFTER);
    expect(report()).not.toBeNull();
  });
}

it('a click skips the gathering moment to its end, without pressing the Continue button that appears under it', async () => {
  await land(arrival);
  expect(topBarFuel()).toBe(FUEL_BEFORE);
  const canvas = document.querySelector('#gathering-test-game canvas');
  if (!canvas) throw new Error('no canvas');
  // Where the report's Continue button will be: bottom right of the 392×226 panel at (8, 40).
  // Forced: Playwright would otherwise retry once the report appears under the pointer mid-click.
  await userEvent.click(canvas, { position: { x: 333, y: 248 }, force: true });
  await settle();
  expect(topBarFuel()).toBe(FUEL_AFTER);
  expect(report()).not.toBeNull();
  // The next click is the player's own again: it is not swallowed.
  const proceed = document.querySelector<HTMLButtonElement>(
    '[data-testid="hop-report"] button[data-primary]',
  );
  if (!proceed) throw new Error('no Continue button');
  await userEvent.click(proceed);
  await settle();
  expect(report()).toBeNull();
});

it('the flow lands on the top bar icon of the resource it fills', async () => {
  await land(arrival);
  const stage = document.querySelector('.stage')?.getBoundingClientRect();
  for (const resource of ['fuel', 'materials'] as const) {
    const icon = document.querySelector(`.top-bar__${resource}-icon`)?.getBoundingClientRect();
    if (!stage || !icon) throw new Error(`no ${resource} icon in the top bar`);
    expect({
      x: icon.left - stage.left + icon.width / 2,
      y: icon.top - stage.top + icon.height / 2,
    }).toEqual(READOUT_ICON[resource]);
  }
});
