import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { GameUI } from '../../ui/GameUI.tsx';
import { EventBus } from '../EventBus.ts';
import { GAME_HEIGHT, GAME_WIDTH, startGame } from '../main.ts';
import { DRIFT_PERIOD_MS } from './landedMotion.ts';
import { SHIP_PLACEMENT, SHIP_SWEEP_X, SKY_WIDTH, SURFACE_WIDTH } from './landedView.ts';
import { homePlanet, startRun, type ChassisId, type Run } from '../sim/index.ts';
import { SceneKey } from './keys.ts';
import type { Landed } from './Landed.ts';
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

interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

const overlaps = (a: Box, b: Box): boolean =>
  a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;

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

/** Mounts the whole app, then lands the given Run, resolving once the Landed scene is on screen. */
async function landOn(run: Run): Promise<Landed> {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  const titleReady = nextSceneReady(SceneKey.Title);
  act(() => {
    // The app's stage at scale 1: the canvas and the React panels over it, in native pixels.
    root?.render(
      <div className="stage" style={{ width: GAME_WIDTH, height: GAME_HEIGHT }}>
        <div id="landed-test-game" />
        <div className="stage__ui">
          <GameUI />
        </div>
      </div>,
    );
  });
  game = startGame('landed-test-game');
  await titleReady;
  const landedReady = nextSceneReady(SceneKey.Landed);
  game.scene.start(SceneKey.Landed, { run });
  await landedReady;
  await act(() => Promise.resolve());
  return game.scene.getScene<Landed>(SceneKey.Landed);
}

/** The panels' DOM rects and the ship's canvas bounds, all in native 640x360 stage pixels. */
function measure(scene: Landed): { ship: Box; panels: Map<string, Box> } {
  const stage = document.querySelector('.stage');
  if (!stage) throw new Error('no stage');
  const stageRect = stage.getBoundingClientRect();
  const k = stageRect.width / GAME_WIDTH;
  const toStage = (r: DOMRect): Box => ({
    left: (r.left - stageRect.left) / k,
    top: (r.top - stageRect.top) / k,
    right: (r.right - stageRect.left) / k,
    bottom: (r.bottom - stageRect.top) / k,
  });
  const panels = new Map<string, Box>();
  // Every panel the UI layer draws, so a new one (the Nav Chart button, #29) is covered automatically.
  const elements = [...document.querySelectorAll('.stage__ui .game-ui > *')];
  expect(elements.length).toBeGreaterThanOrEqual(3); // top bar, plate, AI-art label
  elements.forEach((el, i) => {
    panels.set(`${el.className} #${String(i)}`, toStage(el.getBoundingClientRect()));
  });
  // The ship container holds the sprite and its shadow, so these bounds include both.
  const b = scene.layers.ship.getBounds();
  return { ship: { left: b.left, top: b.top, right: b.right, bottom: b.bottom }, panels };
}

const CHASSIS: readonly ChassisId[] = ['scout', 'hauler', 'lancer'];

const pause = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

/** Eight evenly spaced moments over one drift cycle: the centre, both extremes (25 s, 75 s) and between. */
const DRIFT_SAMPLES: readonly number[] = Array.from(
  { length: 8 },
  (_, i) => (i * DRIFT_PERIOD_MS) / 8,
);

/** Jumps the drift to `ms` and lets a frame render. */
async function seek(scene: Landed, ms: number): Promise<void> {
  scene.ambient.seekDrift(ms);
  await pause(32);
}

for (const chassis of CHASSIS) {
  for (const where of ['Home Planet', 'Moon'] as const) {
    it(`no panel covers the ${chassis} Spacecraft on the ${where}, at any point of the drift`, async () => {
      const fresh = startRun(2026, chassis);
      const home = homePlanet(fresh.starSystem);
      const bodyId = where === 'Moon' ? home.moons[0]?.id : home.id;
      if (!bodyId) throw new Error('no body to land on');
      const run: Run = { ...fresh, status: { kind: 'landed', bodyId } };
      const scene = await landOn(run);

      for (const ms of DRIFT_SAMPLES) {
        await seek(scene, ms);
        const { ship, panels } = measure(scene);
        expect(ship.bottom).toBeLessThan(GAME_HEIGHT);
        // The in-Run Menu button must be among the boxes checked, wherever the layout puts it.
        const menu = document.querySelector('.run-menu__button');
        expect(menu, 'the Menu button is on screen').not.toBeNull();
        const stageRect = document.querySelector('.stage')?.getBoundingClientRect();
        const m = menu?.getBoundingClientRect();
        if (stageRect && m) {
          const k = stageRect.width / GAME_WIDTH;
          const menuBox = {
            left: (m.left - stageRect.left) / k,
            top: (m.top - stageRect.top) / k,
            right: (m.right - stageRect.left) / k,
            bottom: (m.bottom - stageRect.top) / k,
          };
          expect(overlaps(ship, menuBox), `Menu button vs ship at ${String(ms)} ms`).toBe(false);
        }
        for (const [name, box] of panels) {
          expect(
            overlaps(ship, box),
            `at ${String(ms)} ms: ${name} ${JSON.stringify(box)} vs ship ${JSON.stringify(ship)}`,
          ).toBe(false);
        }
      }
    });
  }
}

function landedRun(): Run {
  const fresh = startRun(2026, 'scout');
  return { ...fresh, status: { kind: 'landed', bodyId: homePlanet(fresh.starSystem).id } };
}

it('drifts the layers at different speeds, the Spacecraft with the ground, and never shows a layer edge', async () => {
  const scene = await landOn(landedRun());
  const { sky, far, mid, near, ship } = scene.layers;
  expect(scene.reducedMotion).toBe(false);
  const rest = near.x;
  for (const ms of [DRIFT_PERIOD_MS / 4, (3 * DRIFT_PERIOD_MS) / 4]) {
    await seek(scene, ms);
    // Parallax: the nearer the layer, the further it has moved from centre.
    expect(Math.abs(near.x - rest)).toBeGreaterThan(Math.abs(mid.x - rest));
    expect(Math.abs(mid.x - rest)).toBeGreaterThan(Math.abs(far.x - rest));
    expect(Math.abs(far.x - rest)).toBeGreaterThan(0);
    // The ship rides the ground it stands on, inside its swept span.
    expect(ship.x - SHIP_PLACEMENT.x).toBeCloseTo(near.x - rest);
    expect(ship.x).toBeGreaterThanOrEqual(SHIP_SWEEP_X.min);
    expect(ship.x).toBeLessThanOrEqual(SHIP_SWEEP_X.max);
    // No layer edge shows: each still covers the whole 640 px screen.
    for (const layer of [far, mid, near]) {
      expect(layer.x).toBeLessThanOrEqual(0);
      expect(layer.x + SURFACE_WIDTH).toBeGreaterThanOrEqual(GAME_WIDTH);
    }
    expect(sky.x).toBeLessThanOrEqual(0);
    expect(sky.x + SKY_WIDTH).toBeGreaterThanOrEqual(GAME_WIDTH);
  }
});

it('holds everything still when the player prefers reduced motion', async () => {
  vi.spyOn(window, 'matchMedia').mockImplementation(
    (query) => ({ matches: query.includes('reduce') }) as MediaQueryList,
  );
  const scene = await landOn(landedRun());
  const { far, mid, near, ship } = scene.layers;
  const before = [far.x, mid.x, near.x, ship.x];
  await pause(1000);
  expect(scene.reducedMotion).toBe(true);
  expect([far.x, mid.x, near.x, ship.x]).toEqual(before);
});
