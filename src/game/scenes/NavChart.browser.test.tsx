import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, expect, it } from 'vitest';
import { GameUI } from '../../ui/GameUI.tsx';
import { EventBus } from '../EventBus.ts';
import { GAME_HEIGHT, GAME_WIDTH, startGame } from '../main.ts';
import { isInHopRange, startRun, type Run } from '../sim/index.ts';
import { knowingEverything } from '../sim/testing.ts';
import type { NavChart } from './NavChart.ts';
import { SceneKey } from './keys.ts';
import type { LandedData } from './Landed.ts';
import { hitTest, toScreen } from './navChartMap.ts';
import { layoutChart, targetStatus, type ChartState } from './navChartView.ts';
import '../../style.css';

let game: Phaser.Game | undefined;
let root: Root | undefined;
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

/** Mounts the app, lands `run` and opens its Nav Chart, resolving with the chart's first state. */
async function openChart(
  run: Run,
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
  const data: LandedData = { run };
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

it.each([123, 7])(
  'seed %i: a Body out of Hop range is dimmed, named so and cannot be targeted; one in range can',
  async (seed) => {
    const run = knowingEverything(startRun(seed, 'scout'));
    const { latest } = await openChart(run);
    const layout = layoutChart(run);
    const out = layout.nodes.find((n) => !isInHopRange(run, n.body.id));
    const inside = layout.nodes.find((n) => targetStatus(run, n.body.id).valid);
    if (!out || !inside) throw new Error('seed needs a Body in and a Body out of range');
    const chart = game?.scene.getScene('NavChart') as NavChart;
    expect(chart.bodyAlpha(out.body.id)).toBeLessThan(chart.bodyAlpha(inside.body.id) ?? 0);
    const option = (id: string): HTMLElement | null => document.getElementById(`nav-option-${id}`);
    await until(() => option(out.body.id) !== null);
    expect(option(out.body.id)?.textContent).toContain('out of Hop range');
    expect(option(out.body.id)?.getAttribute('aria-disabled')).toBe('true');
    expect(option(inside.body.id)?.textContent).not.toContain('out of Hop range');

    EventBus.emit('nav-chart-command', { kind: 'click', id: out.body.id });
    EventBus.emit('nav-chart-command', { kind: 'plan' });
    await frames();
    expect(latest().selectedId).toBeUndefined();
    EventBus.emit('nav-chart-command', { kind: 'click', id: inside.body.id });
    EventBus.emit('nav-chart-command', { kind: 'plan' });
    await frames();
    expect(latest().selectedId).toBe(inside.body.id);
  },
);
