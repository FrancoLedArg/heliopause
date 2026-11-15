import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, expect, it } from 'vitest';
import { GameUI } from '../../ui/GameUI.tsx';
import { EventBus } from '../EventBus.ts';
import { GAME_HEIGHT, GAME_WIDTH, startGame } from '../main.ts';
import { landing } from '../../ui/landingFixtures.ts';
import { startRun, type Run } from '../sim/index.ts';
import { SceneKey } from './keys.ts';
import type { LandedData } from './Landed.ts';
import { hitTest, toScreen } from './navChartMap.ts';
import { layoutChart, type ChartState } from './navChartView.ts';
import '../../style.css';

let game: Phaser.Game | undefined;
let root: Root | undefined;
let host: HTMLElement | undefined;

const realMatchMedia = window.matchMedia.bind(window);

afterEach(() => {
  window.matchMedia = realMatchMedia;
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

/** Mounts the app, lands `run` and opens its Nav Chart, resolving with the chart's first state. */
async function openChart(
  run: Run,
  report?: LandedData['report'],
): Promise<{ canvas: HTMLCanvasElement; latest: () => ChartState }> {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  const titleReady = nextSceneReady(SceneKey.Title);
  act(() => {
    root?.render(
      <div className="stage" style={{ width: GAME_WIDTH, height: GAME_HEIGHT }}>
        <div id="nav-chart-test-game" />
        <div className="stage__ui">
          <GameUI />
        </div>
      </div>,
    );
  });
  game = startGame('nav-chart-test-game');
  await titleReady;
  const landedReady = nextSceneReady(SceneKey.Landed);
  const data: LandedData = report ? { run, report } : { run };
  game.scene.start(SceneKey.Landed, data);
  await landedReady;
  let state: ChartState | undefined;
  EventBus.on('nav-chart-state', (next) => {
    state = next;
  });
  EventBus.emit('nav-chart-open-requested');
  await until(() => state !== undefined);
  const canvas = host.querySelector('canvas');
  if (!canvas) throw new Error('no canvas');
  return {
    canvas,
    latest: () => {
      if (!state) throw new Error('the chart is closed');
      return state;
    },
  };
}

async function until(ready: () => boolean, ms = 4_000): Promise<void> {
  const end = performance.now() + ms;
  while (!ready()) {
    if (performance.now() > end) throw new Error('timed out');
    await new Promise((resolve) => setTimeout(resolve, 16));
  }
}

/** A mouse event at a point on the 640x360 stage, as the browser would send it. */
function mouse(canvas: HTMLCanvasElement, type: string, x: number, y: number): void {
  const box = canvas.getBoundingClientRect();
  const scale = box.width / GAME_WIDTH;
  const init = {
    bubbles: true,
    cancelable: true,
    clientX: box.left + x * scale,
    clientY: box.top + y * scale,
    button: 0,
    buttons: type === 'mouseup' ? 0 : 1,
  };
  canvas.dispatchEvent(new MouseEvent(type, init));
}

/** Waits a few frames, so Phaser handles the input it has queued. */
const frames = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 100));

it('a drag over a Body pans the map and never selects it; a click then opens its card', async () => {
  const run = startRun(123, 'scout');
  const { canvas, latest } = await openChart(run);
  const layout = layoutChart(run);
  const before = latest();
  expect(before.card).toBe(false);
  // Start the drag right on the Body Comms Detected.
  const blip = layout.nodes.find((n) => hitTest(before.view, layout, toScreen(before.view, n)));
  if (!blip) throw new Error('no Body on screen');
  const start = toScreen(before.view, blip);
  mouse(canvas, 'mousedown', start.x, start.y);
  await frames();
  mouse(canvas, 'mousemove', start.x - 30, start.y - 20);
  await frames();
  mouse(canvas, 'mousemove', start.x - 80, start.y - 40);
  await frames();
  mouse(canvas, 'mouseup', start.x - 80, start.y - 40);
  await frames();
  const dragged = latest();
  expect(dragged.view).not.toEqual(before.view);
  expect(dragged.card).toBe(false);
  expect(dragged.selectedId).toBeUndefined();

  // A click without moving opens the card of the Body under it.
  const at = toScreen(dragged.view, blip);
  mouse(canvas, 'mousedown', at.x, at.y);
  await frames();
  mouse(canvas, 'mouseup', at.x, at.y);
  await frames();
  expect(latest()).toMatchObject({ card: true, focusedId: blip.body.id, selectedId: undefined });
  expect(latest().view).toEqual(dragged.view);
});

interface Layered {
  readonly name: string;
  readonly depth: number;
  readonly scrollFactorX: number;
}

it('the starfield sits below every Body, and nothing pings without a new Detection (#303)', async () => {
  await openChart(startRun(123, 'scout'));
  const chart = game?.scene.getScene(SceneKey.NavChart);
  if (!chart) throw new Error('no chart');
  const objects = chart.children.list as unknown as Layered[];
  const layers = objects.filter((o) => o.name === 'starfield');
  expect(layers.length).toBeGreaterThan(1);
  const top = Math.max(...layers.map((o) => o.depth));
  for (const o of objects.filter((o) => o.name !== 'starfield')) {
    expect(o.depth).toBeGreaterThan(top);
  }
  // The far layer follows the camera less than the near one, and none is glued to the map.
  const factors = layers.map((o) => o.scrollFactorX);
  expect(Math.min(...factors)).toBeLessThan(Math.max(...factors));
  expect(Math.max(...factors)).toBeLessThan(1);
  expect(objects.filter((o) => o.name === 'new-blip-ping')).toHaveLength(0);
});

/** A Run just landed on a Body whose landing Detected another, as the Hop report would carry it. */
function landedWithDetection(): { run: Run; report: NonNullable<LandedData['report']> } {
  const { before, flight, run } = landing(123, ['Viormio'], undefined, 0, false);
  expect(flight.reveal?.detected.length).toBeGreaterThan(0);
  return { run, report: { before, flight } };
}

const pings = (): number =>
  (game?.scene.getScene(SceneKey.NavChart).children.list ?? []).filter(
    (o) => o.name === 'new-blip-ping',
  ).length;

it('the new-blip ping plays on the first chart open after a landing that Detected a Body, not on reopening (#313)', async () => {
  const { run, report } = landedWithDetection();
  await openChart(run, report);
  expect(pings()).toBe(report.flight.reveal?.detected.length);

  EventBus.emit('nav-chart-close-requested');
  await until(() => game?.scene.isActive(SceneKey.NavChart) !== true);
  EventBus.emit('nav-chart-open-requested');
  await until(() => game?.scene.isActive(SceneKey.NavChart) === true);
  await frames();
  expect(pings()).toBe(0);
});

it('under reduced motion the star layers stick to the map and nothing pings (#313)', async () => {
  window.matchMedia = (query: string): MediaQueryList =>
    ({
      matches: query.includes('prefers-reduced-motion'),
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }) as unknown as MediaQueryList;
  const { run, report } = landedWithDetection();
  await openChart(run, report);
  const chart = game?.scene.getScene(SceneKey.NavChart);
  if (!chart) throw new Error('no chart');
  const objects = chart.children.list as unknown as Layered[];
  const layers = objects.filter((o) => o.name === 'starfield');
  expect(layers.length).toBeGreaterThan(1);
  for (const layer of layers) expect(layer.scrollFactorX).toBe(1);
  expect(pings()).toBe(0);
});
