import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { GameUI } from '../../ui/GameUI.tsx';
import { EventBus } from '../EventBus.ts';
import { GAME_HEIGHT, GAME_WIDTH, startGame } from '../main.ts';
import { SHIP_PLACEMENT } from './landedView.ts';
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

for (const chassis of CHASSIS) {
  for (const where of ['Home Planet', 'Moon'] as const) {
    it(`no panel covers the ${chassis} Spacecraft on the ${where}`, async () => {
      const fresh = startRun(2026, chassis);
      const home = homePlanet(fresh.starSystem);
      const bodyId = where === 'Moon' ? home.moons[0]?.id : home.id;
      if (!bodyId) throw new Error('no body to land on');
      const run: Run = { ...fresh, status: { kind: 'landed', bodyId } };

      const { ship, panels } = measure(await landOn(run));

      expect(ship.bottom).toBeLessThan(GAME_HEIGHT);
      for (const [name, box] of panels) {
        expect(
          overlaps(ship, box),
          `${name} ${JSON.stringify(box)} vs ship ${JSON.stringify(ship)}`,
        ).toBe(false);
      }
    });
  }
}

function landedRun(): Run {
  const fresh = startRun(2026, 'scout');
  return { ...fresh, status: { kind: 'landed', bodyId: homePlanet(fresh.starSystem).id } };
}

const pause = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

it('drifts the layers at different speeds, the Spacecraft with the ground, and never shows a layer edge', async () => {
  const scene = await landOn(landedRun());
  const { far, mid, near, ship } = scene.layers;
  const rest = near.x;
  await pause(1500);
  expect(scene.reducedMotion).toBe(false);
  expect(near.x).not.toBe(rest);
  // Parallax: the nearer the layer, the further it has moved from centre.
  expect(Math.abs(near.x - rest)).toBeGreaterThan(Math.abs(mid.x - rest));
  expect(Math.abs(mid.x - rest)).toBeGreaterThan(Math.abs(far.x - rest));
  // The ship rides the ground it stands on.
  expect(ship.x - SHIP_PLACEMENT.x).toBeCloseTo(near.x - rest);
  // A surface layer is 800 px wide on a 640 px screen: its edges stay off screen.
  for (const layer of [far, mid, near]) {
    expect(layer.x).toBeLessThanOrEqual(0);
    expect(layer.x + 800).toBeGreaterThanOrEqual(GAME_WIDTH);
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
