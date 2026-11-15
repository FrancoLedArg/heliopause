import { act } from 'react';
import { BlendModes, GameObjects } from 'phaser';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { GameUI } from '../../ui/GameUI.tsx';
import { EventBus } from '../EventBus.ts';
import { GAME_HEIGHT, GAME_WIDTH, startGame } from '../main.ts';
import { paletteNumber } from '../../ui/kit/palette.ts';
import { nozzleExits } from './chassisArt.ts';
import { DRIFT_PERIOD_MS } from './landedMotion.ts';
import {
  GROUND_HEIGHT,
  GROUND_TOP,
  SHIP_FOOTPRINT_HALF_WIDTH,
  SHIP_PLACEMENT,
  SHIP_SWEEP_X,
  SKY_WIDTH,
  SURFACE_WIDTH,
} from './landedView.ts';
import { groundTexture, SKY_X } from './landscape.ts';
import { homePlanet, startRun, type ChassisId, type Run } from '../sim/index.ts';
import { manifest, type AssetEntry } from '../assets/manifest.ts';
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

for (const chassis of CHASSIS) {
  it(`the ${chassis}'s engines idle with a glow at every nozzle exit, not under the base`, async () => {
    const fresh = startRun(2026, chassis);
    const scene = await landOn({
      ...fresh,
      status: { kind: 'landed', bodyId: homePlanet(fresh.starSystem).id },
    });
    const glows = scene.layers.ship.list.filter(
      (child): child is GameObjects.Ellipse =>
        child instanceof GameObjects.Ellipse && child.blendMode === BlendModes.ADD,
    );
    const exits = nozzleExits(chassis, 'standing');
    expect(glows).toHaveLength(exits.length);
    for (const exit of exits) {
      expect(
        glows.some((glow) => Math.abs(glow.x - exit.x) < 0.5 && Math.abs(glow.y - exit.y) < 2),
        `a glow at (${String(exit.x)}, ${String(exit.y)})`,
      ).toBe(true);
    }
  });
}

function landedRun(): Run {
  const fresh = startRun(2026, 'scout');
  return { ...fresh, status: { kind: 'landed', bodyId: homePlanet(fresh.starSystem).id } };
}

it('drifts the ground further than the sky, the Spacecraft with the ground, and never shows a layer edge', async () => {
  const scene = await landOn(landedRun());
  const { sky, ground, ship } = scene.layers;
  expect(scene.reducedMotion).toBe(false);
  // Freeze the drift clock at 0 first: a tween still running would move the layer under `rest`.
  scene.ambient.seekDrift(0);
  const rest = ground.x;
  for (const ms of [DRIFT_PERIOD_MS / 4, (3 * DRIFT_PERIOD_MS) / 4]) {
    await seek(scene, ms);
    // Parallax: the ground, nearest, has moved further from centre than the sky.
    expect(Math.abs(ground.x - rest)).toBeGreaterThan(Math.abs(sky.x - SKY_X));
    expect(Math.abs(sky.x - SKY_X)).toBeGreaterThan(0);
    // The ship rides the ground it stands on, inside its swept span.
    expect(ship.x - SHIP_PLACEMENT.x).toBeCloseTo(ground.x - rest);
    expect(ship.x).toBeGreaterThanOrEqual(SHIP_SWEEP_X.min);
    expect(ship.x).toBeLessThanOrEqual(SHIP_SWEEP_X.max);
    // No layer edge shows: each still covers the whole 640 px screen.
    expect(ground.x).toBeLessThanOrEqual(0);
    expect(ground.x + SURFACE_WIDTH).toBeGreaterThanOrEqual(GAME_WIDTH);
    expect(sky.x).toBeLessThanOrEqual(0);
    expect(sky.x + SKY_WIDTH).toBeGreaterThanOrEqual(GAME_WIDTH);
  }
});

it('holds everything still when the player prefers reduced motion', async () => {
  vi.spyOn(window, 'matchMedia').mockImplementation(
    (query) => ({ matches: query.includes('reduce') }) as MediaQueryList,
  );
  const scene = await landOn(landedRun());
  const { ground, ship } = scene.layers;
  const before = [ground.x, ship.x];
  await pause(1000);
  expect(scene.reducedMotion).toBe(true);
  expect([ground.x, ship.x]).toEqual(before);
});

for (const where of ['Home Planet', 'Moon'] as const) {
  it(`draws the ${where}'s ground as one flat strip with the Spacecraft on its top edge`, async () => {
    const fresh = startRun(2026, 'scout');
    const home = homePlanet(fresh.starSystem);
    const bodyId = where === 'Moon' ? home.moons[0]?.id : home.id;
    if (!bodyId) throw new Error('no body to land on');
    const scene = await landOn({ ...fresh, status: { kind: 'landed', bodyId } });
    const { ground, ship } = scene.layers;
    // One strip: a single image, as wide as the layer, level, running to the bottom of the screen.
    const images = ground.list.filter(
      (o): o is GameObjects.Image => o instanceof GameObjects.Image,
    );
    expect(images).toHaveLength(1);
    const [strip] = images;
    if (!strip) throw new Error('no ground strip');
    expect(ground.y).toBe(GROUND_TOP);
    expect(ground.y).toBe(ship.y);
    expect(strip.width).toBe(SURFACE_WIDTH);
    expect(ground.y + strip.height).toBe(GAME_HEIGHT);
    // The old far and mid ground layers are gone.
    expect(scene.layers).not.toHaveProperty('far');
    expect(scene.layers).not.toHaveProperty('mid');
    // The whole Spacecraft, shadow included, stays inside the footprint the pebbles keep clear of.
    for (const ms of DRIFT_SAMPLES) {
      await seek(scene, ms);
      const b = ship.getBounds();
      expect(b.left).toBeGreaterThanOrEqual(ship.x - SHIP_FOOTPRINT_HALF_WIDTH);
      expect(b.right).toBeLessThanOrEqual(ship.x + SHIP_FOOTPRINT_HALF_WIDTH);
      // Its art rests exactly on the top edge: no gap below it and no overlap into the ground.
      const art = ship.list.filter((o): o is GameObjects.Image => o instanceof GameObjects.Image);
      expect(art.length).toBeGreaterThan(0);
      expect(Math.max(...art.map((a) => a.getBounds().bottom))).toBeCloseTo(GROUND_TOP, 3);
    }
  });
}

/** The strip's RGBA pixels, read back through a canvas. */
function stripPixels(scene: Landed, key: string): Uint8ClampedArray {
  const source = scene.textures.get(key).getSourceImage();
  expect(source.width).toBe(SURFACE_WIDTH);
  expect(source.height).toBe(GROUND_HEIGHT);
  const canvas = document.createElement('canvas');
  canvas.width = SURFACE_WIDTH;
  canvas.height = GROUND_HEIGHT;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('no 2d context');
  context.drawImage(source as CanvasImageSource, 0, 0);
  return context.getImageData(0, 0, SURFACE_WIDTH, GROUND_HEIGHT).data;
}

/** The pixel at (x, y) as 0xRRGGBB. */
function rgbAt(data: Uint8ClampedArray, x: number, y: number): number {
  const i = (y * SURFACE_WIDTH + x) * 4;
  return ((data[i] ?? 0) << 16) | ((data[i + 1] ?? 0) << 8) | (data[i + 2] ?? 0);
}

const luma = (c: number) => (c >> 16) * 3 + ((c >> 8) & 255) * 6 + (c & 255);

/** Each kind's dust colour (see `landscape.ts`): the motes must read against the ground's top rows. */
const DUST = { moon: 'gm5', rocky: 'am2', icy: 'cy4' } as const;

it('draws a one-colour surface line and an opaque strip for every surface kind: Moon, Rocky and Icy', async () => {
  const scene = await landOn(landedRun());
  const topLeft: number[] = [];
  for (const kind of ['moon', 'rocky', 'icy'] as const) {
    const data = stripPixels(scene, groundTexture(scene, kind));
    for (let x = 0; x < SURFACE_WIDTH; x++) {
      // The surface line is one colour along the whole strip, and the whole strip is opaque.
      expect(rgbAt(data, x, 0)).toBe(rgbAt(data, 0, 0));
      for (let y = 0; y < GROUND_HEIGHT; y++) {
        expect(data[(y * SURFACE_WIDTH + x) * 4 + 3]).toBe(255);
      }
    }
    topLeft.push(rgbAt(data, 0, 0));
  }
  expect(new Set(topLeft).size).toBe(3);
});

it('falls back to the stand-in strip when a listed surface PNG fails to load', async () => {
  // The manifest lists every surface, but point each at a file that is not served: each load fails (404).
  const listed = (manifest.images as AssetEntry[]).filter((entry) =>
    entry.key.startsWith('surface_'),
  );
  expect(listed).toHaveLength(3);
  const files = listed.map((entry) => entry.file);
  listed.forEach((entry) => {
    entry.file = `missing/${entry.key}.png`;
  });
  const errors = vi.spyOn(console, 'error');
  try {
    const scene = await landOn(landedRun());
    for (const { key } of listed) expect(scene.textures.exists(key)).toBe(false);
    expect(groundTexture(scene, 'rocky')).toBe('surface_rocky_standin');
    // The ground draws the stand-in strip, filling the screen from the ground line down.
    const { ground } = scene.layers;
    const strip = ground.list.find((o): o is GameObjects.Image => o instanceof GameObjects.Image);
    expect(strip?.texture.key).toMatch(/_standin$/);
    expect(ground.y).toBe(GROUND_TOP);
    expect(ground.y + (strip?.height ?? 0)).toBe(GAME_HEIGHT);
    // Only the failed loads complain (the browser's 404 and Phaser's report of it); the fallback is silent.
    const loud = errors.mock.calls
      .map((call) => String(call[0]))
      .filter((m) => !m.startsWith('Failed to process file') && !m.includes('support act('));
    expect(loud).toEqual([]);
  } finally {
    listed.forEach((entry, i) => {
      entry.file = files[i] ?? entry.file;
    });
  }
});
it('uses the generated ground art, with mortar no stone fills and dust that reads against it', async () => {
  const scene = await landOn(landedRun());
  for (const kind of ['moon', 'rocky', 'icy'] as const) {
    // The manifest has the art, so no stand-in is painted.
    expect(groundTexture(scene, kind)).toBe(`surface_${kind}`);
    const data = stripPixels(scene, `surface_${kind}`);
    const colours: number[] = [];
    for (let y = 0; y < GROUND_HEIGHT; y++) {
      for (let x = 0; x < SURFACE_WIDTH; x++) colours.push(rgbAt(data, x, y));
    }
    // The mortar is the strip's darkest colour: never on the surface rows, and a thin share of
    // the strip, so no stone is filled with it.
    const mortar = colours.reduce((a, b) => (luma(b) < luma(a) ? b : a));
    const rows01 = colours.slice(0, 2 * SURFACE_WIDTH);
    expect(rows01.includes(mortar)).toBe(false);
    expect(colours.filter((c) => c === mortar).length / colours.length).toBeLessThan(0.25);
    // Dust blows over the top rows: its colour is a small share of them.
    const dust = paletteNumber(DUST[kind]);
    const topRows = colours.slice(2 * SURFACE_WIDTH, 18 * SURFACE_WIDTH);
    expect(topRows.filter((c) => c === dust).length / topRows.length).toBeLessThan(0.1);
  }
});
