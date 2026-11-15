import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { GameUI } from '../../ui/GameUI.tsx';
import { formatFuel } from '../../ui/format.ts';
import { EventBus } from '../EventBus.ts';
import { GAME_HEIGHT, GAME_WIDTH, startGame } from '../main.ts';
import { homePlanet, launchHop, startRun } from '../sim/index.ts';
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

// An Arrived Hop that collects Fuel: seed 2026's Scout to the Home Planet's first Moon (an Icy Moon).
const before = startRun(2026, 'scout');
const moon = homePlanet(before.starSystem).moons[0];
if (!moon) throw new Error('seed 2026 has a Home Planet Moon');
const launched = launchHop(before, moon.id);
if (launched.kind !== 'flown' || launched.flight.collection?.kind !== 'fuel') {
  throw new Error('seed 2026: the Scout should Arrive on the first Moon and collect Fuel');
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

for (const skip of ['a key', 'a click'] as const) {
  it(`${skip} skips the gathering moment to its end`, async () => {
    await land(arrival);
    expect(topBarFuel()).toBe(FUEL_BEFORE);
    act(() => {
      window.dispatchEvent(
        skip === 'a key'
          ? new KeyboardEvent('keydown', { key: ' ' })
          : new PointerEvent('pointerdown', { bubbles: true }),
      );
    });
    await act(() => Promise.resolve());
    expect(topBarFuel()).toBe(FUEL_AFTER);
    expect(report()).not.toBeNull();
  });
}

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
