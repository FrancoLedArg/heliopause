import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { GameObjects } from 'phaser';
import { afterEach, expect, it, vi } from 'vitest';
import { GameUI } from '../../ui/GameUI.tsx';
import { paletteNumber } from '../../ui/kit/palette.ts';
import { EventBus } from '../EventBus.ts';
import { GAME_HEIGHT, GAME_WIDTH, startGame } from '../main.ts';
import {
  CHASSIS_IDS,
  findBody,
  homePlanet,
  launchHop,
  listBodies,
  startRun,
  type BodyId,
  type ChassisId,
  type Run,
} from '../sim/index.ts';
import type { Flight, FlightData } from './Flight.ts';
import type { Landed } from './Landed.ts';
import { FLIGHT_ANGLE, nozzles, turn, type ShipPose } from './chassisArt.ts';
import { SHIP_PLACEMENT } from './landedView.ts';
import { flightPlayback } from './flightPlayback.ts';
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
async function fly(
  chassis: ChassisId,
  pick: (run: Run) => BodyId | undefined = (run) => homePlanet(run.starSystem).moons[0]?.id,
): Promise<{ scene: Flight; data: FlightData }> {
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
  const target = pick(run);
  if (target === undefined) throw new Error('No target to Hop to');
  const launched = launchHop(run, target);
  if (launched.kind !== 'flown') throw new Error('The target is not a Hop target');
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
  // Playback per millisecond of the tween clock (`tweens.time`, in seconds), not of wall time: the
  // tween manager advances both together every update, so the ratio is exactly the time scale the
  // feature sets (1 at 1x, 4 at 4x) however loaded the machine is.
  const advance = async (): Promise<number> => {
    const playbackStart = scene.playbackMs;
    const tweenStart = scene.tweens.time;
    await wait(1000);
    return (scene.playbackMs - playbackStart) / ((scene.tweens.time - tweenStart) * 1000);
  };
  await wait(300); // let the create frame's catch-up pass before the 1x window
  const normal = await advance();
  await act(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'f' }));
    return Promise.resolve();
  });
  expect(button?.getAttribute('aria-pressed')).toBe('true');
  // The cue is not colour alone: the rate shows while it is on.
  expect(button?.textContent).toContain('4×');
  const fast = await advance();
  expect(fast / normal).toBeGreaterThan(2.8);
  expect(fast / normal).toBeLessThan(5.2);
  await act(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'f' }));
    return Promise.resolve();
  });
  expect(button?.getAttribute('aria-pressed')).toBe('false');
  expect(button?.textContent).not.toContain('4×');
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
  const { scene, data } = await fly('scout');
  expect(emitters(scene)).toHaveLength(0);
  // The scene picks the shorter reduced pace (the playback itself is tested in flightPlayback.test.ts).
  expect(scene.playback.duration).toBe(
    flightPlayback(data.before.spacecraft, data.flight, 'reduced').duration,
  );
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

// It waits on the real (reduced) playback to end, so a loaded machine needs more than the default 15 s.
it('under reduced motion a Spacecraft that Fell Short in the Transfer rests clear of the report', async () => {
  vi.spyOn(window, 'matchMedia').mockImplementation(
    (query) => ({ matches: query.includes('reduce') }) as MediaQueryList,
  );
  const failed = new Promise<void>((resolve) => {
    const off = EventBus.on('hop-failed', () => {
      off();
      resolve();
    });
  });
  const { data } = await fly(
    'hauler',
    (run) =>
      listBodies(run.starSystem).find((body) => {
        const launched = launchHop(run, body.id);
        return (
          launched.kind === 'flown' &&
          launched.flight.outcome.kind === 'fell-short' &&
          launched.flight.outcome.burn === 'transfer'
        );
      })?.id,
  );
  expect(data.flight.outcome.kind).toBe('fell-short');
  await failed;
  // Let the clock's final update run: it must not pose the Spacecraft again.
  await act(frame);
  await act(frame);
  await act(frame);

  const report = document.querySelector('[data-testid="hop-report"]');
  const stage = document.querySelector('.stage');
  if (!report || !stage) throw new Error('no report on screen');
  const s = stage.getBoundingClientRect();
  const k = s.width / GAME_WIDTH;
  const reportRight = (report.getBoundingClientRect().right - s.left) / k;
  const scene = game?.scene.getScene<Flight>(SceneKey.Flight);
  if (!scene) throw new Error('no Flight scene');
  // The whole Spacecraft, plumes included, sits right of the report.
  expect(scene.ship.getBounds().left).toBeGreaterThanOrEqual(reportRight);
}, 60_000);

it('the particles use the real sprites, tinted: dust and smoke by surface, sparks amber', async () => {
  const { scene } = await fly('scout');
  scene.seek(900);
  const byTexture = (key: string): GameObjects.Particles.ParticleEmitter | undefined =>
    emitters(scene).find((e) => e.texture.key === key);
  const dust = byTexture('fx_dust');
  const smoke = byTexture('fx_smoke');
  const spark = byTexture('fx_spark');
  // Real art, not the code-drawn stand-ins (which are drawn at these same sizes): only the human's grids
  // have a transparent corner on the dust clump and a dimmer arm on the spark glint.
  const hex = (key: string, x: number, y: number): number =>
    scene.textures.getPixel(x, y, key)?.color ?? -1;
  expect(scene.textures.getPixelAlpha(1, 0, 'fx_dust')).toBe(0);
  expect(hex('fx_spark', 0, 1)).toBe(paletteNumber('wh2'));
  expect(hex('fx_spark', 1, 1)).toBe(paletteNumber('wh3'));
  expect(smoke?.texture.getSourceImage()).toBeInstanceOf(HTMLImageElement);
  // The Home Planet's Moon is departed from a rocky Planet: pale amber puffs (am3, lighter than the
  // am2 mote of the Landed view so they read against the amber ground); sparks are am4.
  expect(dust?.ops.tint.current).toBe(paletteNumber('am3'));
  expect(smoke?.ops.tint.current).toBe(paletteNumber('am3'));
  expect(spark?.ops.tint.current).toBe(paletteNumber('am4'));
});

it('the smoke rises slowly, grows 1x to 3x and fades over 2 to 3 s', async () => {
  const { scene } = await fly('scout');
  const smoke = emitters(scene).find((e) => e.texture.key === 'fx_smoke');
  expect(smoke?.ops.lifespan.propertyValue).toEqual({ min: 2000, max: 3000 });
  expect(smoke?.ops.scaleX.propertyValue).toEqual({ start: 1, end: 3 });
  expect(smoke?.ops.speedX.propertyValue).toEqual({ min: 8, max: 20 });
  expect(smoke?.ops.angle.propertyValue).toEqual({ min: 250, max: 290 });
  expect(smoke?.ops.alpha.propertyValue).toMatchObject({ end: 0 });
});

/** Where a world point of `emitter` shows on screen: the camera's scroll scaled by the emitter's own factor. */
const shownAt = (
  scene: Flight,
  emitter: GameObjects.Particles.ParticleEmitter,
  p: { x: number; y: number },
) => ({
  x: p.x + emitter.x - scene.cameras.main.scrollX * emitter.scrollFactorX,
  y: p.y + emitter.y - scene.cameras.main.scrollY * emitter.scrollFactorY,
});

it('Takeoff dust and smoke start at the strip top edge under the Spacecraft', async () => {
  const { scene } = await fly('scout');
  scene.seek(60);
  const edge = SHIP_PLACEMENT.baseY - scene.cameras.main.scrollY;
  for (const e of emitters(scene).filter((o) => ['fx_dust', 'fx_smoke'].includes(o.texture.key))) {
    const at = shownAt(scene, e, { x: Number(e.particleX), y: Number(e.particleY) });
    expect(at.y).toBe(edge);
    expect(at.x).toBe(scene.ship.x - scene.cameras.main.scrollX);
  }
});

it('Takeoff smoke is still on screen 1.5 s after it was kicked up, while the strip has dropped away', async () => {
  const { scene } = await fly('scout');
  await act(() => wait(1700));
  const smoke = emitters(scene).find((e) => e.texture.key === 'fx_smoke');
  if (!smoke) throw new Error('no smoke emitter');
  // The camera has climbed: the strip's top edge is off the bottom of the screen.
  expect(SHIP_PLACEMENT.baseY - scene.cameras.main.scrollY).toBeGreaterThan(GAME_HEIGHT);
  let visible = 0;
  smoke.forEachAlive((p) => {
    const at = shownAt(scene, smoke, p);
    if (at.y > 0 && at.y < GAME_HEIGHT) visible++;
  }, smoke);
  expect(visible).toBeGreaterThan(0);
});

it('Landing comes down onto the strip and ends on exactly the Landed view composition', async () => {
  const { scene, data } = await fly('scout');
  scene.seek(scene.playback.duration - 1);
  const arrival = scene.layers.arrival;
  const cam = scene.cameras.main;
  const frame = {
    groundTop: arrival.ground.y - cam.scrollY,
    groundX: arrival.ground.x - cam.scrollX,
    shipX: scene.ship.x - cam.scrollX,
    shipY: scene.ship.y - cam.scrollY,
  };
  const landed = nextSceneReady(SceneKey.Landed);
  scene.seek(scene.playback.duration);
  await landed;
  const view = game?.scene.getScene<Landed>(SceneKey.Landed);
  if (!view) throw new Error('no Landed view');
  expect(data.after.status.kind).toBe('landed');
  expect(frame.groundTop).toBeCloseTo(view.layers.ground.y, 0);
  expect(frame.groundX).toBeCloseTo(view.layers.ground.x, 0);
  expect(frame.shipX).toBeCloseTo(view.layers.ship.x, 0);
  expect(frame.shipY).toBeCloseTo(view.layers.ship.y, 0);
  expect(frame.groundTop).toBe(SHIP_PLACEMENT.baseY);
});

/** The first ms of the playback at `progress` through `burn` with the engine firing. */
function momentOf(scene: Flight, burn: string, progress: number): number {
  for (let t = 0; t <= scene.playback.duration; t += 5) {
    const at = scene.playback.at(t);
    if (at.burn === burn && at.progress >= progress && at.thrusting) return t;
  }
  throw new Error(`no thrusting ${burn} at ${String(progress)}`);
}

/** The visible plumes on the Spacecraft: where each starts in the world, and which way it points (degrees clockwise from straight down). */
function shownPlumes(scene: Flight): { x: number; y: number; angle: number }[] {
  return scene.ship.list
    .filter(
      (child): child is GameObjects.Image =>
        child instanceof GameObjects.Image && child.texture.key === 'fx_thruster' && child.visible,
    )
    .map((plume) => {
      const m = plume.getWorldTransformMatrix();
      return { x: m.tx, y: m.ty, angle: (Math.atan2(m.b, m.a) * 180) / Math.PI };
    });
}

const PLUME_MOMENTS = [
  { name: 'rising off the ground', burn: 'takeoff', progress: 0.3, pose: 'standing' },
  { name: 'tipping toward its heading', burn: 'takeoff', progress: 0.61, pose: 'standing' },
  { name: 'boosting away', burn: 'takeoff', progress: 0.85, pose: 'flight' },
  { name: 'in the Transfer', burn: 'transfer', progress: 0.3, pose: 'flight' },
  { name: 'hovering down', burn: 'landing', progress: 0.5, pose: 'standing' },
] as const satisfies readonly { name: string; burn: string; progress: number; pose: ShipPose }[];

it.each(CHASSIS_IDS)(
  'the %s fires one plume from every nozzle exit, down while standing and rearward in flight',
  async (chassis) => {
    const { scene } = await fly(chassis);
    for (const moment of PLUME_MOMENTS) {
      scene.seek(momentOf(scene, moment.burn, moment.progress));
      const { x, y, angle } = scene.ship;
      const expected = nozzles(chassis, moment.pose).map((nozzle) => {
        const at = turn(nozzle.exit, angle);
        return { x: x + at.x, y: y + at.y };
      });
      const shown = shownPlumes(scene);
      expect(shown, moment.name).toHaveLength(expected.length);
      for (const exit of expected) {
        const plume = shown.find((p) => Math.hypot(p.x - exit.x, p.y - exit.y) < 0.5);
        expect(
          plume,
          `${moment.name}: a plume at (${exit.x.toFixed(1)}, ${exit.y.toFixed(1)})`,
        ).toBeDefined();
        // Straight down from the ship standing; back along the flight heading, turned with the ship.
        const heading = moment.pose === 'standing' ? 0 : FLIGHT_ANGLE;
        expect(plume?.angle, moment.name).toBeCloseTo(heading + angle, 1);
      }
    }
  },
);
