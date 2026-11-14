import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { GameObjects } from 'phaser';
import { afterEach, expect, it, vi } from 'vitest';
import { GameUI } from '../../ui/GameUI.tsx';
import { EventBus } from '../EventBus.ts';
import { GAME_HEIGHT, GAME_WIDTH, startGame } from '../main.ts';
import {
  findBody,
  homePlanet,
  launchHop,
  startRun,
  type BodyId,
  type ChassisId,
} from '../sim/index.ts';
import type { Flight, FlightData } from './Flight.ts';
import { SceneKey } from './keys.ts';
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
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
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

const frame = (): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, 40);
  });

/** Mounts the whole app and starts the playback of the Hop to the Home Planet's Moon on `chassis`. */
async function fly(chassis: ChassisId): Promise<{ scene: Flight; data: FlightData }> {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  const titleReady = nextSceneReady(SceneKey.Title);
  act(() => {
    root?.render(
      <div className="stage" style={{ width: GAME_WIDTH, height: GAME_HEIGHT }}>
        <div id="flight-test-game" />
        <div className="stage__ui">
          <GameUI />
        </div>
      </div>,
    );
  });
  game = startGame('flight-test-game');
  await titleReady;
  const run = startRun(123, chassis);
  const moon = homePlanet(run.starSystem).moons[0];
  if (!moon) throw new Error('The Home Planet has a Moon');
  const launched = launchHop(run, moon.id);
  if (launched.kind !== 'flown') throw new Error('The Moon is a target');
  const data: FlightData = { before: run, flight: launched.flight, after: launched.run };
  const ready = nextSceneReady(SceneKey.Flight);
  game.scene.start(SceneKey.Flight, data);
  await ready;
  await act(() => Promise.resolve());
  return { scene: game.scene.getScene<Flight>(SceneKey.Flight), data };
}

/** Every HUD panel the UI layer draws, in native 640x360 stage pixels. */
function hudPanels(): Box[] {
  const stage = document.querySelector('.stage');
  if (!stage) throw new Error('no stage');
  const s = stage.getBoundingClientRect();
  const k = s.width / GAME_WIDTH;
  return [...document.querySelectorAll('.stage__ui .game-ui > *')].map((el) => {
    const r = el.getBoundingClientRect();
    return {
      left: (r.left - s.left) / k,
      top: (r.top - s.top) / k,
      right: (r.right - s.left) / k,
      bottom: (r.bottom - s.top) / k,
    };
  });
}

/** The first and last ms of the playback spent on the Transfer. */
function transferSpan(scene: Flight): { start: number; end: number } {
  const ms: number[] = [];
  for (let t = 0; t <= scene.playback.duration; t += 10) {
    if (scene.playback.at(t).burn === 'transfer') ms.push(t);
  }
  const start = ms[0];
  const end = ms.at(-1);
  if (start === undefined || end === undefined) throw new Error('no Transfer');
  return { start, end };
}

it('the departure Body stays in view, clear of the HUD, and shrinks through the Transfer while the target grows', async () => {
  const { scene } = await fly('scout');
  const { start, end } = transferSpan(scene);
  const sizes: { from: number; to: number }[] = [];
  for (const share of [1 / 3, 2 / 3]) {
    scene.seek(start + (end - start) * share);
    await act(frame);
    const b = scene.fromBody.getBounds();
    const body: Box = { left: b.left, top: b.top, right: b.right, bottom: b.bottom };
    // On screen, and no panel covers any of it.
    expect(scene.fromBody.visible).toBe(true);
    expect(body.left).toBeGreaterThanOrEqual(0);
    expect(body.top).toBeGreaterThanOrEqual(0);
    for (const panel of hudPanels()) expect(overlaps(body, panel)).toBe(false);
    sizes.push({ from: b.width, to: scene.toBody.getBounds().width });
  }
  const [third, twoThirds] = sizes;
  expect(twoThirds?.from).toBeLessThan(third?.from ?? 0);
  expect(twoThirds?.to).toBeGreaterThan(third?.to ?? 0);
});

it('seeking to the end of an Arrived Hop hands off to the Landed view of the target', async () => {
  const { scene, data } = await fly('hauler');
  const landed = nextSceneReady(SceneKey.Landed);
  const runs: unknown[] = [];
  const off = EventBus.on('run-started', (run) => runs.push(run));
  scene.seek(scene.playback.duration);
  await landed;
  off();
  expect(runs).toEqual([data.after]);
  // The Flight scene let go of its listeners when it shut down.
  expect(EventBus.listenerCount('leave-run-requested')).toBe(1); // the Landed view's own
});

const wait = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

const emitters = (scene: Flight): GameObjects.Particles.ParticleEmitter[] =>
  scene.children.list.filter(
    (child): child is GameObjects.Particles.ParticleEmitter =>
      child instanceof GameObjects.Particles.ParticleEmitter,
  );

it('the F key turns fast-forward on and off: the clock runs about 4x as fast and the button shows it', async () => {
  const { scene } = await fly('scout');
  const button = document.querySelector<HTMLButtonElement>('.fast-forward');
  expect(button?.getAttribute('aria-pressed')).toBe('false');
  const advance = async (): Promise<number> => {
    const from = scene.playbackMs;
    const started = performance.now();
    await wait(1000);
    return (scene.playbackMs - from) / (performance.now() - started);
  };
  const normal = await advance();
  await act(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'f' }));
    return Promise.resolve();
  });
  expect(button?.getAttribute('aria-pressed')).toBe('true');
  const fast = await advance();
  expect(fast / normal).toBeGreaterThan(2.8);
  expect(fast / normal).toBeLessThan(5.2);
  await act(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'f' }));
    return Promise.resolve();
  });
  expect(button?.getAttribute('aria-pressed')).toBe('false');
});

it('Takeoff kicks up dust, and the Transfer trails sparks', async () => {
  const { scene } = await fly('scout');
  const { start } = transferSpan(scene);
  scene.seek(900);
  await act(() => wait(500));
  expect(emitters(scene).some((e) => e.getAliveParticleCount() > 0)).toBe(true);
  scene.seek(start + 200);
  await act(() => wait(500));
  const alive = emitters(scene).filter((e) => e.getAliveParticleCount() > 0);
  expect(alive.length).toBeGreaterThan(0);
});

it('under reduced motion there are no particles and no stage fade', async () => {
  vi.spyOn(window, 'matchMedia').mockImplementation(
    (query) => ({ matches: query.includes('reduce') }) as MediaQueryList,
  );
  const { scene } = await fly('scout');
  expect(emitters(scene)).toHaveLength(0);
  scene.seek(transferSpan(scene).start + 50);
  expect(scene.cameras.main.fadeEffect.isRunning).toBe(false);
});

it('the route inset names the two Bodies and shows how far along the Hop is', async () => {
  const { scene, data } = await fly('scout');
  const { start, end } = transferSpan(scene);
  const name = (id: BodyId): string | undefined => findBody(data.before.starSystem, id)?.name;
  scene.seek((start + end) / 2);
  await act(frame);
  const inset = document.querySelector('[data-testid="route-inset"]');
  expect(inset?.textContent).toContain(name(data.flight.plan.fromId) ?? '?');
  expect(inset?.textContent).toContain(name(data.flight.plan.toId) ?? '?');
  const bar = inset?.querySelector('[role="progressbar"]');
  const share = Number(bar?.getAttribute('aria-valuenow'));
  expect(share).toBeGreaterThan(30);
  expect(share).toBeLessThan(70);
});
