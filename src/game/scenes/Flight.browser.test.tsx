import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { GameObjects } from 'phaser';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GameUI } from '../../ui/GameUI.tsx';
import { paletteNumber } from '../../ui/kit/palette.ts';
import { EventBus } from '../EventBus.ts';
import { GAME_HEIGHT, GAME_WIDTH, startGame } from '../main.ts';
import {
  CHASSIS_IDS,
  findBody,
  HELIOPAUSE,
  install,
  kilograms,
  launchHop,
  listBodies,
  materials,
  refit,
  startRun,
  type BodyId,
  type ChassisId,
  type HopTarget,
  type Run,
} from '../sim/index.ts';
import type { Flight, FlightData } from './Flight.ts';
import type { Landed } from './Landed.ts';
import { FLIGHT_ANGLE, turn, type ShipPose } from './chassisArt.ts';
import { composeSpacecraft } from './spacecraftComposition.ts';
import { bodySprite, SHIP_PLACEMENT } from './landedView.ts';
import { music } from '../audio/music.ts';
import { flightPlayback } from './flightPlayback.ts';
import type { JumpStage } from './jumpPlayback.ts';
import { readBestScore } from '../lib/bestScore.ts';
import { JUMP_FLAVOUR_TEXT } from '../../ui/jumpFlavour.ts';
import { SceneKey } from './keys.ts';
import '../../style.css';
import { heliopauseFound } from '../sim/testing.ts';

/**
 * The same Run as if a Radar had found the Heliopause (#191): only then is it a Hop target, and
 * only within the Hop range (#283).
 */
const found = heliopauseFound;

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

/**
 * Seed 2046 stood on its innermost planet (rocky, with an Icy Moon), knowing every Body: Hops play out
 * from where Runs opened before the Starting Moon (#96), so the playback has a rocky departure.
 * Re-pinned for #247 (was seed 2026): the Isp rise settles seed 2026 on another Star System, whose
 * innermost planet's first Moon is not Icy.
 */
function onHome(run: Run): Run {
  const ids = listBodies(run.starSystem).map((body) => body.id);
  const home = run.starSystem.planets[0];
  if (!home) throw new Error('A Star System has planets');
  return {
    ...run,
    status: { kind: 'landed', bodyId: home.id },
    knowledge: { detected: ids, surveyed: ids, heliopauseFound: true },
  };
}

/** The innermost planet's nearest Moon: seed 2046's is Icy. */
const homeMoonId = (run: Run) => run.starSystem.planets[0]?.moons[0]?.id;

/** Mounts the whole app and starts the playback of the Hop to the home Moon on `chassis`. */
async function fly(
  chassis: ChassisId,
  pick: (run: Run) => HopTarget | undefined = homeMoonId,
  from: (run: Run) => Run = (run) => run,
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
  const run = from(onHome(startRun(2046, chassis)));
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

/** The arrival ground of a Hop to a Body. */
function arrivalOf(scene: Flight): NonNullable<Flight['layers']['arrival']> {
  const { arrival } = scene.layers;
  if (!arrival) throw new Error('A Hop to a Body has an arrival ground');
  return arrival;
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

/** The first and last ms of the playback spent on the Cruise. */
function cruiseSpan(scene: Flight): { start: number; end: number } {
  const span = scene.playback.shots.find((s) => s.shot === 'cruise');
  if (!span) throw new Error('no Cruise');
  return { start: span.start, end: span.end - 1 };
}

it('no Body zooms past in the Cruise: deep space holds only the sun glint and the one small target', async () => {
  // The human's playtest asked for the planets zooming in and out to go (#284).
  const { scene } = await fly('scout');
  const { start } = cruiseSpan(scene);
  const space = scene.children.list.find(
    (o): o is GameObjects.Container =>
      o instanceof GameObjects.Container && o.list.includes(scene.toBody),
  );
  if (!space) throw new Error('no deep space');
  for (const into of [3000, 20_000, 40_000]) {
    scene.seek(start + into);
    await act(frame);
    const images = space.list.filter((o) => o instanceof GameObjects.Image && o.visible);
    expect(images).toHaveLength(2);
    expect(images).toContain(scene.toBody);
  }
});

it.each([
  ['a Body', 'scout'],
  ['the Heliopause', 'lancer'],
] as const)(
  'the target, %s, stays small and far ahead the whole Cruise',
  async (_name, chassis) => {
    const { scene } = await (chassis === 'lancer'
      ? fly('lancer', () => HELIOPAUSE, readyForTheHeliopause)
      : fly('scout'));
    const { start, end } = cruiseSpan(scene);
    for (let t = start; t <= end; t += 6000) {
      scene.seek(t);
      expect(scene.toBody.visible).toBe(true);
      const b = scene.toBody.getBounds();
      expect(b.width).toBeLessThan(40);
      expect(b.left).toBeGreaterThanOrEqual(0);
      expect(b.right).toBeLessThanOrEqual(GAME_WIDTH);
      expect(b.top).toBeGreaterThanOrEqual(0);
    }
    scene.seek(end);
    expect(scene.toBody.getBounds().width).toBeLessThan(40);
  },
);

it('the Cruise is never a still image: the Spacecraft and the stars keep moving', async () => {
  const { scene } = await fly('scout');
  const { start } = cruiseSpan(scene);
  const look = (ms: number) => {
    scene.seek(ms);
    return { x: scene.ship.x, y: scene.ship.y, angle: scene.ship.angle };
  };
  // Long after the boost, deep in the coast: every second something has moved.
  for (const t of [15_000, 28_000, 42_000]) {
    expect(look(start + t + 1000)).not.toEqual(look(start + t));
  }
});

it.each(CHASSIS_IDS)(
  'the %s flies big in the Cruise: each installed Component’s bounds lie inside the frame, large enough to click, and clear of the HUD and its Fuel tank',
  async (chassis) => {
    const { scene, data } = await fly(chassis);
    const { start } = cruiseSpan(scene);
    scene.seek(start + 20_000);
    await act(frame);
    // The Fuel tank beside the Spacecraft is one of the HUD's panels checked below.
    expect(document.querySelector('[data-testid="cruise-fuel-gauge"]')).not.toBeNull();
    const installed = data.before.spacecraft.slots.flatMap((slot, i) => (slot === null ? [] : [i]));
    const bounds = scene.componentBounds();
    expect([...bounds.keys()]).toEqual(installed);
    const hull = hullOnScreen(scene);
    expect(hull.right - hull.left).toBeGreaterThan(200);
    for (const [slot, rect] of bounds) {
      const where = `Slot ${String(slot)}`;
      // The Component's centre mount point lies inside its own bounds.
      const centre = scene.anchor(slot, 'centre');
      expect(centre, where).toBeDefined();
      expect(centre?.x, where).toBeGreaterThanOrEqual(rect.x);
      expect(centre?.x, where).toBeLessThanOrEqual(rect.x + rect.width);
      expect(centre?.y, where).toBeGreaterThanOrEqual(rect.y);
      expect(centre?.y, where).toBeLessThanOrEqual(rect.y + rect.height);
      expect(rect.width, where).toBeGreaterThanOrEqual(24);
      expect(rect.height, where).toBeGreaterThanOrEqual(24);
      expect(rect.x, where).toBeGreaterThanOrEqual(0);
      expect(rect.y, where).toBeGreaterThanOrEqual(0);
      expect(rect.x + rect.width, where).toBeLessThanOrEqual(GAME_WIDTH);
      expect(rect.y + rect.height, where).toBeLessThanOrEqual(GAME_HEIGHT);
      // On the Spacecraft, and no HUD panel covers it.
      const box: Box = {
        left: rect.x,
        top: rect.y,
        right: rect.x + rect.width,
        bottom: rect.y + rect.height,
      };
      expect(overlaps(box, hull), where).toBe(true);
      for (const panel of hudPanels()) expect(overlaps(box, panel), where).toBe(false);
    }
  },
);

it('the Cruise draws its event layer between the starfield and the Spacecraft', async () => {
  const { scene } = await fly('scout');
  scene.seek(cruiseSpan(scene).start + 5000);
  const list = scene.children.list;
  const space = list.findIndex(
    (o) => o instanceof GameObjects.Container && o.list.includes(scene.toBody),
  );
  expect(scene.eventLayer.visible).toBe(true);
  expect(list.indexOf(scene.eventLayer)).toBeGreaterThan(space);
  expect(list.indexOf(scene.eventLayer)).toBeLessThan(list.indexOf(scene.ship));
  expect(scene.playback.events).toEqual([]);
});

it.each(['takeoff', 'cruise', 'approach', 'landing'] as const)(
  'seeking to the end of an Arrived Hop from the %s hands off to the Landed view of the target',
  async (shot) => {
    const { scene, data } = await fly('hauler');
    const span = scene.playback.shots.find((s) => s.shot === shot);
    if (!span) throw new Error(`no ${shot}`);
    scene.seek((span.start + span.end) / 2);
    await act(frame);
    expect(document.querySelector('[data-testid="phase-strip"]')?.getAttribute('data-shot')).toBe(
      shot,
    );
    const landed = nextSceneReady(SceneKey.Landed);
    const runs: unknown[] = [];
    const off = EventBus.on('run-started', (run) => runs.push(run));
    scene.seek(scene.playback.duration);
    await landed;
    off();
    expect(runs).toEqual([data.after]);
    // The Flight scene let go of its listeners when it shut down.
    expect(EventBus.listenerCount('leave-run-requested')).toBe(1); // the Landed view's own
  },
);

/** The span of the playback spent on the Approach. */
function approachSpan(scene: Flight): { start: number; end: number } {
  const span = scene.playback.shots.find((s) => s.shot === 'approach');
  if (!span) throw new Error('no Approach');
  return span;
}

it.each(CHASSIS_IDS)(
  'in the Approach the %s’s target Body is drawn big at lower right and grows, while the Spacecraft enters from the left, coasting, and shrinks to about a third',
  async (chassis) => {
    const { scene, data } = await fly(chassis);
    const { start, end } = approachSpan(scene);
    const looks: { body: Box; scale: number; x: number }[] = [];
    for (let i = 0; i <= 20; i++) {
      scene.seek(start + ((end - 1 - start) * i) / 20);
      expect(scene.approachBody.visible).toBe(true);
      // The Cruise's small target and the ground are not in this shot; the engine is off.
      expect(scene.toBody.parentContainer.visible).toBe(false);
      expect(shownPlumes(scene)).toHaveLength(0);
      const b = scene.approachBody.getBounds();
      looks.push({
        body: { left: b.left, top: b.top, right: b.right, bottom: b.bottom },
        scale: scene.ship.scaleX,
        x: scene.ship.x - scene.cameras.main.scrollX,
      });
    }
    const first = looks[0];
    const last = looks.at(-1);
    if (!first || !last) throw new Error('no looks');
    for (const { body } of looks) {
      // Big in frame: wider than a third of the frame, its centre in the lower right quarter.
      expect(body.right - body.left).toBeGreaterThan(GAME_WIDTH / 3);
      expect((body.left + body.right) / 2).toBeGreaterThan(GAME_WIDTH / 2);
      expect((body.top + body.bottom) / 2).toBeGreaterThan(GAME_HEIGHT / 2);
    }
    expect(first.body.right - first.body.left).toBeGreaterThanOrEqual(200);
    expect(last.body.right - last.body.left).toBeGreaterThanOrEqual(280);
    // The Spacecraft comes in from the left and shrinks the whole way, to about a third.
    expect(first.x).toBeLessThan(GAME_WIDTH / 4);
    looks.forEach(({ scale }, i) => {
      expect(scale).toBeLessThanOrEqual(looks[i - 1]?.scale ?? Infinity);
    });
    expect(last.scale / first.scale).toBeGreaterThan(0.25);
    expect(last.scale / first.scale).toBeLessThan(0.45);
    // The Body is the target's own: the same variant as on the Nav Chart, drawn from its Approach art.
    const { plan } = data.flight;
    if (plan.destination !== 'body') throw new Error('a Hop to a Body');
    const target = findBody(data.before.starSystem, plan.toId);
    if (!target) throw new Error('no target');
    expect(scene.approachBody.texture.key).toBe(`${bodySprite(data.before, target)}_approach`);
  },
);

it('the Approach fades in from the Cruise and out to the Landing, and holds the Approach music while it plays', async () => {
  const setApproach = vi.spyOn(music, 'setApproach');
  const { scene } = await fly('scout');
  const { start, end } = approachSpan(scene);
  const cam = scene.cameras.main;
  scene.seek(start - 50);
  expect(setApproach).not.toHaveBeenLastCalledWith(true);
  cam.resetFX();
  scene.seek(start + 10);
  expect(cam.fadeEffect.isRunning).toBe(true);
  expect(setApproach).toHaveBeenLastCalledWith(true);
  cam.resetFX();
  scene.seek(end + 10);
  expect(cam.fadeEffect.isRunning).toBe(true);
  expect(setApproach).toHaveBeenLastCalledWith(false);
});

it('leaving the Flight in the middle of the Approach lets go of the Approach music', async () => {
  const setApproach = vi.spyOn(music, 'setApproach');
  const { scene } = await fly('scout');
  const { start, end } = approachSpan(scene);
  scene.seek((start + end) / 2);
  expect(setApproach).toHaveBeenLastCalledWith(true);
  scene.scene.stop();
  await act(frame);
  expect(setApproach).toHaveBeenLastCalledWith(false);
});

it('a Hop to the Heliopause never shows the Approach', async () => {
  const { scene } = await fly('lancer', () => HELIOPAUSE, readyForTheHeliopause);
  for (let t = 0; t <= scene.playback.duration; t += 200) {
    scene.seek(t);
    expect(scene.approachBody.visible).toBe(false);
  }
});

/** A lancer on seed 1 with a Jump Drive: it reaches the Heliopause from its Starting Moon. */
function readyForTheHeliopause(): Run {
  const result = install(
    found({ ...startRun(1, 'lancer'), materials: materials(100) }),
    2,
    'jump-drive',
  );
  if (result.kind !== 'installed') throw new Error('Expected an install');
  return result.run;
}

it('a Hop to the Heliopause plays Takeoff and Transfer with the Spacecraft in view, then the Jump', async () => {
  const stages: JumpStage[] = [];
  const off = EventBus.on('jump-stage', (stage) => stages.push(stage));
  const { scene, data } = await fly('lancer', () => HELIOPAUSE, readyForTheHeliopause);
  expect(data.flight.outcome.kind).toBe('reached-heliopause');
  expect(scene.layers.arrival).toBeUndefined();
  // Takeoff then Transfer, and never a Landing.
  const burns = new Set<string>();
  for (let t = 0; t <= scene.playback.duration; t += 50) burns.add(scene.playback.at(t).burn);
  expect([...burns]).toEqual(['takeoff', 'transfer']);
  const phases = document.querySelector('[data-testid="phase-strip"]')?.textContent ?? '';
  expect(phases).toContain('Transfer');
  expect(phases).not.toContain('Landing');

  // The camera keeps the Spacecraft on screen through the Cruise, up to its last moment.
  const { start } = cruiseSpan(scene);
  for (const ms of [start + 100, scene.playback.duration - 1]) {
    scene.seek(ms);
    const cam = scene.cameras.main;
    const x = scene.ship.x - cam.scrollX;
    const y = scene.ship.y - cam.scrollY;
    expect(x).toBeGreaterThan(0);
    expect(x).toBeLessThan(GAME_WIDTH);
    expect(y).toBeGreaterThan(0);
    expect(y).toBeLessThan(GAME_HEIGHT);
    expect(scene.toBody.visible).toBe(true);
  }
  // The Jump Drive charges with the Spacecraft still in view, the Heliopause ahead.
  scene.seek(scene.playback.duration + 400);
  await act(frame);
  expect(stages).toEqual(['charge']);
  expect(scene.ship.visible).toBe(true);
  expect(scene.toBody.visible).toBe(true);
  off();
});

/** The ms of the Flight's whole playback (the Hop, then the Jump) at which the Jump is `stage`, `progress` through. */
function jumpAt(scene: Flight, stage: JumpStage, progress: number): number {
  const moment = scene.jump;
  if (!moment) throw new Error('No Jump follows this Hop');
  for (let t = 0; t <= moment.duration; t += 5) {
    const at = moment.at(t);
    if (at.stage === stage && at.progress >= progress) return scene.playback.duration + t;
  }
  throw new Error(`no ${stage} at ${String(progress)}`);
}

describe.each(['full', 'reduced'] as const)('the Jump, at %s motion', (pace) => {
  it('goes dark behind the flavour text, then ends on the Landed view of the next Starting Moon', async () => {
    if (pace === 'reduced') {
      vi.spyOn(window, 'matchMedia').mockImplementation(
        (query) => ({ matches: query.includes('reduce') }) as MediaQueryList,
      );
    }
    window.localStorage.clear();
    const stages: JumpStage[] = [];
    const offStage = EventBus.on('jump-stage', (stage) => stages.push(stage));
    const { scene, data } = await fly('lancer', () => HELIOPAUSE, readyForTheHeliopause);

    // At full motion the Jump Drive charges and fires first; the HUD gives way to the flash.
    if (pace === 'full') {
      scene.seek(jumpAt(scene, 'charge', 0.5));
      scene.seek(jumpAt(scene, 'fire', 0.3));
      await act(frame);
      expect(document.querySelector('[data-testid="flight-log"]')).toBeNull();
    }
    // Dark: only the flavour text is on screen, over the black.
    scene.seek(jumpAt(scene, 'dark', 0.9));
    await act(frame);
    expect(stages).toEqual(pace === 'full' ? ['charge', 'fire', 'dark'] : ['dark']);
    const caption = document.querySelector('[data-testid="jump-caption"]');
    expect(caption?.textContent).toBe(JUMP_FLAVOUR_TEXT);
    expect(document.querySelector('[data-testid="flight-log"]')).toBeNull();
    expect(document.querySelector('[data-testid="phase-strip"]')).toBeNull();
    expect(scene.darkness).toBe(1);

    // The hand-off: the Landed view of the next Starting Moon, the top bar on System 2.
    const runs: Run[] = [];
    const offRun = EventBus.on('run-started', (run) => runs.push(run));
    const landed = nextSceneReady(SceneKey.Landed);
    scene.seek(scene.duration);
    await landed;
    await act(frame);
    offRun();
    offStage();
    // The simulation made the Jump: the Flight only plays it and hands its Run on.
    expect(data.after.starSystemNumber).toBe(2);
    expect(runs).toEqual([data.after]);
    expect(document.querySelector('[data-testid="system-number"]')?.textContent).toBe('System 2');
    expect(document.querySelector('[data-testid="jump-caption"]')).toBeNull();
    // Not an Arrived Hop: no report, and the way on (the Nav Chart) takes focus.
    expect(document.querySelector('[data-testid="hop-report"]')).toBeNull();
    expect(document.activeElement?.textContent).toMatch(/Nav Chart/);
    // No Score is recorded: the Run goes on.
    expect(readBestScore()).toBeUndefined();

    // The Landed view's own composition, as a New Run on that Body opens on: nothing jumps into place.
    const view = game?.scene.getScene<Landed>(SceneKey.Landed);
    if (!view) throw new Error('no Landed view');
    // The ambient drift starts at once at full motion: compare at its rest, where it begins.
    view.ambient.seekDrift(0);
    expect(view.cameras.main.scrollX).toBe(0);
    expect(view.cameras.main.scrollY).toBe(0);
    expect(view.layers.ground.y).toBe(SHIP_PLACEMENT.baseY);
    expect(view.layers.ship.x).toBe(SHIP_PLACEMENT.x);
    expect(view.layers.ship.y).toBe(SHIP_PLACEMENT.baseY);
    // Out of the black, the way the Jump went into it: the canvas and the panels together.
    expect(view.cameras.main.fadeEffect.isRunning).toBe(true);
    expect(document.querySelector('[data-testid="game-ui"]')?.classList).toContain(
      'game-ui--after-jump',
    );
  });
});

/** A plume's art: the takeoff exhaust (`fx_plume`) once the manifest has it, `fx_thruster` otherwise and in flight. */
const isPlume = (image: GameObjects.Image): boolean =>
  ['fx_thruster', 'fx_plume'].includes(image.texture.key);

const emitters = (scene: Flight): GameObjects.Particles.ParticleEmitter[] =>
  scene.children.list.filter(
    (child): child is GameObjects.Particles.ParticleEmitter =>
      child instanceof GameObjects.Particles.ParticleEmitter,
  );

/**
 * Holds the game loop, so a test steps the Flight scene itself with fixed frame times: the clock it
 * shows then depends on nothing but those frames, however loaded the machine is.
 */
function holdLoop(scene: Flight): (frames: number, delta: number) => number {
  scene.game.loop.sleep();
  return (frames, delta) => {
    const from = scene.playbackMs;
    for (let i = 0; i < frames; i++) scene.update(0, delta);
    return scene.playbackMs - from;
  };
}

const pressF = async (): Promise<void> => {
  await act(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'f' }));
    return Promise.resolve();
  });
};

it('the F key turns fast-forward on and off: the clock runs exactly 4x as fast and the button shows it', async () => {
  const { scene } = await fly('scout');
  const button = document.querySelector<HTMLButtonElement>('.fast-forward');
  expect(button?.getAttribute('aria-pressed')).toBe('false');
  const step = holdLoop(scene);
  // Ten 100 ms frames: a second of playback at 1x, four on fast-forward.
  expect(step(10, 100)).toBeCloseTo(1000, 6);
  await pressF();
  expect(button?.getAttribute('aria-pressed')).toBe('true');
  // The cue is not colour alone: the rate shows while it is on.
  expect(button?.textContent).toContain('4×');
  expect(step(10, 100)).toBeCloseTo(4000, 6);
  // A long stall (a hidden tab) steps at most 250 ms of real time, then the speed applies.
  expect(step(1, 1000)).toBeCloseTo(1000, 6);
  await pressF();
  expect(button?.getAttribute('aria-pressed')).toBe('false');
  expect(button?.textContent).not.toContain('4×');
  expect(step(1, 1000)).toBeCloseTo(250, 6);
});

it('fast-forward stays on for the next Hop of the Run', async () => {
  const { scene, data } = await fly('scout');
  await pressF();
  const landed = nextSceneReady(SceneKey.Landed);
  scene.seek(scene.playback.duration);
  await landed;
  // The next Hop's playback starts already fast.
  const ready = nextSceneReady(SceneKey.Flight);
  game?.scene.start(SceneKey.Flight, data);
  await ready;
  await act(() => Promise.resolve());
  const next = game?.scene.getScene<Flight>(SceneKey.Flight);
  if (!next) throw new Error('no Flight scene');
  expect(document.querySelector('.fast-forward')?.getAttribute('aria-pressed')).toBe('true');
  expect(holdLoop(next)(10, 100)).toBeCloseTo(4000, 6);
});

it('Takeoff kicks up dust, and the Cruise trails sparks through the boost', async () => {
  const { scene } = await fly('scout');
  const { start } = cruiseSpan(scene);
  // Hold the loop and step the scene (clock and particles) in fixed frames, so the emitters have
  // their 500 ms however loaded the machine is.
  scene.game.loop.sleep();
  const emit = (): void => {
    for (let time = 0; time < 500; time += 16) scene.sys.step(time, 16);
  };
  scene.seek(900);
  emit();
  expect(emitters(scene).some((e) => e.getAliveParticleCount() > 0)).toBe(true);
  scene.seek(start + 200);
  emit();
  const alive = emitters(scene).filter((e) => e.getAliveParticleCount() > 0);
  expect(alive.length).toBeGreaterThan(0);
});

/**
 * Every `every` ms of the playback, except through the long coast of the Cruise, which is sampled
 * once a second (its first seconds, with the boost, are stepped finely like the other shots).
 */
function sampleMs(scene: Flight, every: number): number[] {
  const cruise = scene.playback.cruise;
  const coastFrom = cruise ? cruise.start + 10_000 : Infinity;
  const coastTo = cruise ? cruise.start + cruise.length - 2000 : -Infinity;
  const ms: number[] = [];
  for (let t = 0; t < scene.playback.duration; t += t >= coastFrom && t < coastTo ? 1000 : every) {
    ms.push(t);
  }
  return ms;
}

/** Steps through the playback (see `sampleMs`), calling `look` at each moment. */
function stepThrough(scene: Flight, every: number, look: (ms: number) => void): void {
  for (const t of sampleMs(scene, every)) {
    scene.seek(t);
    look(t);
  }
}

it('the engine lights with a flash and rumbles the camera, harder at liftoff, calming as it climbs and again at touchdown', async () => {
  const { scene } = await fly('scout');
  const flashes: number[] = [];
  const rumble: { burn: string; progress: number; amount: number }[] = [];
  stepThrough(scene, 20, (t) => {
    const { burn, progress } = scene.playback.at(t);
    flashes.push(scene.flash);
    rumble.push({ burn, progress, amount: scene.rumble });
  });
  expect(Math.max(...flashes)).toBeGreaterThan(0);
  // A warm, low flash: the scene stays readable under it.
  expect(Math.max(...flashes)).toBeLessThan(0.5);
  const peak = (from: number, to: number, burn: string): number =>
    Math.max(
      ...rumble
        .filter((r) => r.burn === burn && r.progress >= from && r.progress < to)
        .map((r) => r.amount),
    );
  const onThePad = peak(0.03, 0.15, 'takeoff');
  const liftoff = peak(0.15, 0.3, 'takeoff');
  expect(onThePad).toBeGreaterThan(0);
  expect(liftoff).toBeGreaterThan(onThePad);
  expect(peak(0.9, 1, 'takeoff')).toBe(0);
  expect(peak(0.8, 0.95, 'landing')).toBeGreaterThan(0);
  // Settled when the Landed view takes over.
  expect(rumble.at(-1)?.amount).toBe(0);
});

it('a ground glow lights the strip under the engine at liftoff and is gone once the Spacecraft has climbed away', async () => {
  const { scene } = await fly('scout');
  scene.seek(momentOf(scene, 'takeoff', 0.2));
  expect(scene.groundGlow.visible).toBe(true);
  expect(scene.groundGlow.alpha).toBeGreaterThan(0.3);
  expect(scene.groundGlow.x).toBe(scene.ship.x);
  expect(scene.groundGlow.y).toBe(SHIP_PLACEMENT.baseY);
  scene.seek(momentOf(scene, 'takeoff', 0.9));
  expect(scene.groundGlow.visible && scene.groundGlow.alpha > 0).toBe(false);
});

it('the plumes lengthen as the Spacecraft climbs', async () => {
  const { scene } = await fly('scout');
  const length = (): number => {
    const plume = scene.ship.list.find(
      (child): child is GameObjects.Image =>
        child instanceof GameObjects.Image && isPlume(child) && child.visible,
    );
    return plume?.getBounds().height ?? 0;
  };
  scene.seek(momentOf(scene, 'takeoff', 0.25));
  const low = length();
  scene.seek(momentOf(scene, 'takeoff', 0.9));
  expect(length()).toBeGreaterThan(low * 1.2);
});

it('under reduced motion there are no particles, flashes, shakes or stage fades, and the plumes still fire', async () => {
  vi.spyOn(window, 'matchMedia').mockImplementation(
    (query) => ({ matches: query.includes('reduce') }) as MediaQueryList,
  );
  const { scene, data } = await fly('scout');
  expect(emitters(scene)).toHaveLength(0);
  // The scene picks the shorter reduced pace (the playback itself is tested in flightPlayback.test.ts).
  expect(scene.playback.duration).toBe(
    flightPlayback(data.before.spacecraft, data.flight, 'reduced').duration,
  );
  const cam = scene.cameras.main;
  let plumes = 0;
  stepThrough(scene, 10, () => {
    expect(scene.flash).toBe(0);
    expect(scene.rumble).toBe(0);
    expect(cam.shakeEffect.isRunning).toBe(false);
    expect(cam.flashEffect.isRunning).toBe(false);
    expect(cam.fadeEffect.isRunning).toBe(false);
    plumes = Math.max(plumes, shownPlumes(scene).length);
  });
  expect(plumes).toBeGreaterThan(0);
});

it('the route inset names the two Bodies and shows how far along the Hop is', async () => {
  const { scene, data } = await fly('scout');
  const { start, end } = cruiseSpan(scene);
  const name = (id: BodyId): string | undefined => findBody(data.before.starSystem, id)?.name;
  scene.seek((start + end) / 2);
  await act(frame);
  const inset = document.querySelector('[data-testid="route-inset"]');
  expect(inset?.textContent).toContain(name(data.flight.plan.fromId) ?? '?');
  const { plan } = data.flight;
  expect(inset?.textContent).toContain(
    plan.destination === 'body' ? (name(plan.toId) ?? '?') : 'Heliopause',
  );
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
    // No Hop of a full hauler from seed 2046's innermost planet falls short; a tenth of its Fuel, since
    // half still reaches every Body within the Hop range (#283).
    (run) => ({
      ...run,
      spacecraft: { ...run.spacecraft, fuelMass: kilograms(run.spacecraft.fuelMass / 10) },
    }),
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

/** Resolves on the next `hop-failed`: the report of a failed Hop is on its way. */
function nextFailure(): Promise<void> {
  return new Promise((resolve) => {
    const off = EventBus.on('hop-failed', () => {
      off();
      resolve();
    });
  });
}

/** The Run with only `share` of its Fuel in the tank. */
const withFuel =
  (share: number) =>
  (run: Run): Run => ({
    ...run,
    spacecraft: { ...run.spacecraft, fuelMass: kilograms(run.spacecraft.fuelMass * share) },
  });

it('a Spacecraft that Fell Short in the Takeoff sputters out mid-climb and sags, x fixed, then the report follows', async () => {
  const { scene, data } = await fly('scout', homeMoonId, withFuel(0.05));
  const { outcome } = data.flight;
  expect(outcome.kind === 'fell-short' && outcome.burn).toBe('takeoff');
  const { stopsAt } = scene.playback;
  // Mid-climb: off the ground, the engine still firing.
  scene.seek(stopsAt - 600);
  expect(scene.ship.y).toBeLessThan(SHIP_PLACEMENT.baseY - 20);
  expect(shownPlumes(scene).length).toBeGreaterThan(0);
  // It sputters: the plumes flicker out before the Fuel is gone.
  const shown = new Set<number>();
  for (let t = stopsAt - 300; t < stopsAt; t += 10) {
    scene.seek(t);
    shown.add(shownPlumes(scene).length);
  }
  expect(shown.has(0)).toBe(true);
  expect(shown.size).toBeGreaterThan(1);
  // Dead, the glow under it gone, and it sags, still upright over the same spot.
  scene.seek(stopsAt + 400);
  const cutOut = scene.ship.y;
  expect(shownPlumes(scene)).toHaveLength(0);
  expect(scene.groundGlow.visible && scene.groundGlow.alpha > 0).toBe(false);
  const failed = nextFailure();
  scene.seek(scene.playback.duration);
  await failed;
  expect(scene.ship.y).toBeGreaterThan(cutOut);
  expect(scene.ship.y).toBeLessThanOrEqual(SHIP_PLACEMENT.baseY);
  expect(scene.ship.x).toBe(SHIP_PLACEMENT.x);
});

/**
 * The Run with just enough Fuel to reach the home Moon but run dry about halfway through
 * the Landing: a Crash well above the ground, whatever the Star System generation does to Fuel.
 */
function crashingRun(run: Run): Run {
  const moon = homeMoonId(run);
  if (!moon) throw new Error('The innermost planet has no Moon');
  for (let share = 1; share > 0; share -= 0.001) {
    const short = withFuel(share)(run);
    const launched = launchHop(short, moon);
    if (launched.kind !== 'flown' || launched.flight.outcome.kind !== 'crashed') continue;
    const landing = launched.flight.burns.find((burn) => burn.burn === 'landing');
    if (landing?.status === 'ran-out' && landing.delivered < landing.actual * 0.6) return short;
  }
  throw new Error('No Fuel load Crashes halfway through the Landing');
}

it('a Spacecraft that Crashed cuts out above the ground, drops straight down, hits hard and tips over', async () => {
  const { scene, data } = await fly('scout', homeMoonId, crashingRun);
  expect(data.flight.outcome.kind).toBe('crashed');
  const { stopsAt } = scene.playback;
  scene.seek(stopsAt);
  expect(scene.ship.y).toBeLessThan(SHIP_PLACEMENT.baseY - 5);
  expect(shownPlumes(scene)).toHaveLength(0);
  // The hit: a stronger flash and a hard shake than the touchdown of a Landing.
  let flash = 0;
  let rumble = 0;
  for (let t = stopsAt; t < scene.playback.duration; t += 10) {
    scene.seek(t);
    flash = Math.max(flash, scene.flash);
    rumble = Math.max(rumble, scene.rumble);
  }
  expect(flash).toBeGreaterThan(0.2);
  expect(rumble).toBeGreaterThan(3);
  const failed = nextFailure();
  scene.seek(scene.playback.duration);
  await failed;
  expect(scene.ship.y).toBe(SHIP_PLACEMENT.baseY);
  expect(scene.ship.x).toBe(SHIP_PLACEMENT.x);
  expect(scene.ship.angle).toBeGreaterThan(10);
  // The camera came down with it: the wreck lies on the strip where the Landed view has its ground.
  expect(scene.cameras.main.scrollY).toBe(0);
});

it('the Heliopause is drawn from its real sprite, not the code-drawn stand-in', async () => {
  const { scene } = await fly('lancer', () => HELIOPAUSE, readyForTheHeliopause);
  expect(scene.toBody.texture.key).toBe('body_heliopause');
  // The loaded PNG is an image element; the stand-in is a canvas.
  expect(scene.toBody.texture.getSourceImage()).toBeInstanceOf(HTMLImageElement);
});

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
  // The home Moon is departed from a rocky Planet: pale amber puffs (am3, lighter than the
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
  // Step the whole scene (its clock and the particles) in fixed 16 ms frames, with the game loop
  // held, until the playback is 1.5 s past Launch, as the name says. Counting to the playback's own
  // time, not a number of frames, keeps it exact however much played before the loop was held
  // (#189: from the innermost planet, 1.7 s of frames left the smoke at the screen's edge).
  scene.game.loop.sleep();
  for (let time = 0; scene.playbackMs < 1500; time += 16) scene.sys.step(time, 16);
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

it.each(CHASSIS_IDS)(
  'the %s comes down upright onto the strip and ends on exactly the Landed view composition',
  async (chassis) => {
    const { scene, data } = await fly(chassis);
    scene.seek(scene.playback.duration - 1);
    const arrival = arrivalOf(scene);
    const cam = scene.cameras.main;
    const frame = {
      groundTop: arrival.ground.y - cam.scrollY,
      groundX: arrival.ground.x - cam.scrollX,
      shipX: scene.ship.x - cam.scrollX,
      shipY: scene.ship.y - cam.scrollY,
      shipAngle: scene.ship.angle,
      pose: hullOf(scene.ship).frame.name,
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
    // Upright on its fins or legs, in the same standing pose the Landed view opens on.
    expect(frame.shipAngle).toBe(0);
    expect(frame.pose).toBe('chassis.landed');
    expect(hullOf(view.layers.ship).frame.name).toBe(frame.pose);
  },
);

/** The first ms of the playback at `progress` through `shot` with the engine firing. */
function momentOf(scene: Flight, shot: string, progress: number): number {
  for (const { start, end, shot: name } of scene.playback.shots) {
    if (name !== shot) continue;
    for (let t = start; t < end; t += 5) {
      const at = scene.playback.at(t);
      if (at.shotProgress >= progress && at.thrusting) return t;
    }
  }
  throw new Error(`no thrusting ${shot} at ${String(progress)}`);
}

/** The visible plumes on the Spacecraft: where each starts in the world, and which way it points (degrees clockwise from straight down). */
function shownPlumes(scene: Flight): { x: number; y: number; angle: number }[] {
  return scene.ship.list
    .filter(
      (child): child is GameObjects.Image =>
        child instanceof GameObjects.Image && isPlume(child) && child.visible,
    )
    .map((plume) => {
      const m = plume.getWorldTransformMatrix();
      return { x: m.tx, y: m.ty, angle: (Math.atan2(m.b, m.a) * 180) / Math.PI };
    });
}

/** The nozzles of the Spacecraft that flies, as its composition draws them in a pose. */
function nozzlesOf(data: FlightData, pose: ShipPose) {
  const { chassisId, slots } = data.before.spacecraft;
  return composeSpacecraft(chassisId, slots, pose === 'flight' ? 'flight' : 'landed').nozzles;
}

const PLUME_MOMENTS = [
  { name: 'lighting on the ground', burn: 'takeoff', progress: 0.1, pose: 'standing' },
  { name: 'rising off the ground', burn: 'takeoff', progress: 0.3, pose: 'standing' },
  { name: 'climbing away', burn: 'takeoff', progress: 0.85, pose: 'standing' },
  { name: 'boosting in the Cruise', burn: 'cruise', progress: 0.03, pose: 'flight' },
  { name: 'hovering down', burn: 'landing', progress: 0.5, pose: 'standing' },
] as const satisfies readonly { name: string; burn: string; progress: number; pose: ShipPose }[];

/** A loadout with a second Engine beside the first, so the Spacecraft has two nozzles. */
function twinEngine(run: Run): Run {
  const slots = [...run.spacecraft.slots];
  const free = slots.indexOf(null);
  slots[free] = 'engine-2';
  return { ...run, spacecraft: refit(run.spacecraft, slots) };
}

describe.each([
  ['stock', (run: Run) => run],
  ['two-engine', twinEngine],
] as const)('with the %s loadout', (_loadout, from) => {
  it.each(CHASSIS_IDS)(
    'the %s fires one plume from every nozzle exit, down while standing and rearward in flight',
    async (chassis) => {
      const { scene, data } = await fly(chassis, homeMoonId, from);
      if (_loadout === 'two-engine') {
        expect(nozzlesOf(data, 'flight').length).toBeGreaterThanOrEqual(2);
      }
      for (const moment of PLUME_MOMENTS) {
        scene.seek(momentOf(scene, moment.burn, moment.progress));
        const { x, y, angle, scaleX: k } = scene.ship;
        const expected = nozzlesOf(data, moment.pose).map((nozzle) => {
          const at = turn(nozzle.exit, angle);
          return { x: x + k * at.x, y: y + k * at.y };
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
});

/** The Chassis art in a ship's container, inside the drawn Spacecraft (the plumes, glow and Component art left out). */
function hullOf(ship: GameObjects.Container): GameObjects.Image {
  const art = ship.list.flatMap((child) =>
    child instanceof GameObjects.Container ? child.list : [child],
  );
  const hull = art.find(
    (child): child is GameObjects.Image =>
      child instanceof GameObjects.Image && child.frame.name.startsWith('chassis.'),
  );
  if (!hull) throw new Error('no Chassis art on the ship');
  return hull;
}

/** The Chassis art on screen (its whole frame, plumes left out), in 640x360 stage pixels. */
function hullOnScreen(scene: Flight): Box {
  const b = hullOf(scene.ship).getBounds();
  const { scrollX, scrollY } = scene.cameras.main;
  return {
    left: b.left - scrollX,
    top: b.top - scrollY,
    right: b.right - scrollX,
    bottom: b.bottom - scrollY,
  };
}

/** Every ms of the playback spent on `shot`, every 25 ms. */
function msOf(scene: Flight, shot: string): number[] {
  const span = scene.playback.shots.find((s) => s.shot === shot);
  const ms: number[] = [];
  if (span) for (let t = span.start; t < span.end; t += 25) ms.push(t);
  return ms;
}

it.each(CHASSIS_IDS)(
  'the %s rises straight up at Takeoff: its x fixed, upright and standing, then climbs out through the top edge',
  async (chassis) => {
    const { scene } = await fly(chassis);
    const takeoff = msOf(scene, 'takeoff');
    let lastY = Infinity;
    for (const t of takeoff) {
      scene.seek(t);
      const where = `Takeoff at ${String(t)} ms`;
      expect(scene.ship.x, where).toBe(SHIP_PLACEMENT.x);
      expect(scene.ship.angle, where).toBe(0);
      expect(hullOf(scene.ship).frame.name, where).toMatch(/^chassis\.landed/);
      // It never sinks back while the engine pushes it up.
      expect(scene.ship.y, where).toBeLessThanOrEqual(lastY);
      lastY = scene.ship.y;
    }
    expect(SHIP_PLACEMENT.baseY - lastY).toBeGreaterThan(300);
    // By the end of the Takeoff the whole hull has left the frame through the top edge.
    expect(hullOnScreen(scene).bottom).toBeLessThan(0);
  },
);

it.each(CHASSIS_IDS)(
  'the %s comes straight down at Landing: it enters through the top edge, x fixed and upright, and never climbs',
  async (chassis) => {
    const { scene } = await fly(chassis);
    const landing = msOf(scene, 'landing');
    const [first] = landing;
    if (first === undefined) throw new Error('no Landing');
    scene.seek(first);
    expect(hullOnScreen(scene).bottom).toBeLessThanOrEqual(0);
    let lastY = -Infinity;
    for (const t of landing) {
      scene.seek(t);
      const where = `Landing at ${String(t)} ms`;
      expect(scene.ship.x, where).toBe(SHIP_PLACEMENT.x);
      expect(scene.ship.angle, where).toBe(0);
      expect(hullOf(scene.ship).frame.name, where).toMatch(/^chassis\.landed/);
      expect(scene.ship.y, where).toBeGreaterThanOrEqual(lastY);
      lastY = scene.ship.y;
    }
  },
);

it.each(CHASSIS_IDS)(
  'the %s stays on screen through the whole Hop, leaving and coming back only through the top edge',
  async (chassis) => {
    const { scene } = await fly(chassis);
    for (const t of sampleMs(scene, 25)) {
      scene.seek(t);
      const hull = hullOnScreen(scene);
      const { shot } = scene.playback.at(t);
      const where = `${shot} at ${String(t)} ms`;
      expect(hull.left, where).toBeGreaterThanOrEqual(0);
      expect(hull.right, where).toBeLessThanOrEqual(GAME_WIDTH);
      expect(hull.bottom, where).toBeLessThanOrEqual(GAME_HEIGHT);
      // Only the vertical climb and descent take it past the top edge.
      if (shot === 'cruise') expect(hull.top, where).toBeGreaterThanOrEqual(0);
    }
  },
);

it.each(CHASSIS_IDS)(
  'the %s trails sparks from each of its rear nozzles in turn',
  async (chassis) => {
    const { scene, data } = await fly(chassis);
    scene.seek(momentOf(scene, 'cruise', 0.03));
    const sparks = emitters(scene).find((e) => e.texture.key === 'fx_spark');
    if (!sparks) throw new Error('no spark emitter');
    const born: { x: number; y: number }[] = [];
    sparks.onParticleEmit((p) => born.push({ x: sparks.x + p.x, y: sparks.y + p.y }));
    // Hold the loop and step the scene (clock and particles) in fixed frames: 600 ms of emission.
    scene.game.loop.sleep();
    for (let time = 0; time < 600; time += 16) scene.sys.step(time, 16);
    const { x, y, angle, scaleX: k } = scene.ship;
    const exits = nozzlesOf(data, 'flight').map((nozzle) => {
      const at = turn(nozzle.exit, angle);
      return { x: x + k * at.x, y: y + k * at.y };
    });
    const near = (a: { x: number; y: number }, b: { x: number; y: number }): boolean =>
      Math.hypot(a.x - b.x, a.y - b.y) < 0.5;
    expect(born.length).toBeGreaterThan(0);
    for (const spark of born) expect(exits.some((exit) => near(exit, spark))).toBe(true);
    for (const exit of exits) expect(born.some((spark) => near(exit, spark))).toBe(true);
  },
);

/** The texture key of the ground strip a landscape drew. */
function groundKey(layers: { readonly ground: GameObjects.Container }): string | undefined {
  const image = layers.ground.list.find(
    (o): o is GameObjects.Image => o instanceof GameObjects.Image,
  );
  return image?.texture.key.replace(/_standin$/, '');
}

const standOnHomeMoon = (run: Run): Run => {
  const moon = homeMoonId(run);
  if (!moon) throw new Error('The innermost planet has no Moon');
  return { ...run, status: { kind: 'landed', bodyId: moon } };
};

it("seed 2046's Icy Moon: Landing on it and the Landed view after use the Icy strip", async () => {
  const { scene } = await fly('scout');
  expect(groundKey(arrivalOf(scene))).toBe('surface_icy');
  expect(groundKey(scene.layers.departure)).toBe('surface_rocky');
  const landed = nextSceneReady(SceneKey.Landed);
  scene.seek(scene.playback.duration);
  await landed;
  const view = game?.scene.getScene<Landed>(SceneKey.Landed);
  if (!view) throw new Error('no Landed view');
  expect(groundKey(view.layers)).toBe('surface_icy');
});

it("Takeoff from seed 2046's Icy Moon uses the same Icy strip and Icy dust and smoke", async () => {
  const { scene } = await fly('scout', (run) => run.starSystem.planets[0]?.id, standOnHomeMoon);
  expect(groundKey(scene.layers.departure)).toBe('surface_icy');
  scene.seek(60);
  const tint = (key: string) =>
    emitters(scene).find((e) => e.texture.key === key)?.ops.tint.current;
  expect(tint('fx_dust')).toBe(paletteNumber('cy4'));
  expect(tint('fx_smoke')).toBe(paletteNumber('cy4'));
});
