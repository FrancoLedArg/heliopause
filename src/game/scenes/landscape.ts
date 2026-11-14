import type { GameObjects, Scene } from 'phaser';
import { paletteNumber, type PaletteColor } from '../../ui/kit/palette.ts';
import { hasAsset } from '../assets/manifest.ts';
import { createRng, type Rng } from '../lib/rng.ts';
import { stringSeed } from '../lib/stringSeed.ts';
import { currentBody, type Run } from '../sim/index.ts';
import {
  SKY_WIDTH,
  SURFACE_WIDTH,
  skyBodies,
  surfaceKind,
  type SurfaceKind,
} from './landedView.ts';
import { addTwinklingStarfield, TWINKLE_EVERY, type TwinklingStarfield } from './starfield.ts';

/**
 * The landscape is built from separate layers, each wider than the 640 px screen and in its own
 * Container, so the ambient drift can scroll them at different speeds (parallax) and the flight can
 * let the ground fall away beneath the Spacecraft. Sizes and y positions match the surface art from #22.
 */
const LAYER_WIDTH = SURFACE_WIDTH;
/** Where the ground layers and the sky rest, centred on the 640 px screen. */
export const LAYER_X = (640 - LAYER_WIDTH) / 2;
export const SKY_X = (640 - SKY_WIDTH) / 2;
const FAR = { y: 90, height: 200 } as const;
const MID = { y: 180, height: 160 } as const;
const NEAR = { y: 240, height: 120 } as const;

const STAR_COUNT = 150;

interface SurfacePalette {
  readonly far: PaletteColor;
  readonly mid: PaletteColor;
  readonly near: PaletteColor;
  readonly rim: PaletteColor;
  readonly speck: PaletteColor;
  /** Dust motes: light enough to read against this ground. */
  readonly dust: PaletteColor;
}

/** Stand-in colours for each surface, all from the kit palette. */
const PALETTES: Record<SurfaceKind, SurfacePalette> = {
  rocky: { far: 'am0', mid: 'am1', near: 'am0', rim: 'am3', speck: 'am1', dust: 'am2' },
  moon: { far: 'gm1', mid: 'gm2', near: 'gm3', rim: 'gm6', speck: 'gm4', dust: 'gm5' },
  icy: { far: 'cy0', mid: 'cy1', near: 'cy2', rim: 'cy4', speck: 'cy3', dust: 'cy4' },
};

/** The limb curve in screen pixels: steep at lower left, flattening to upper right. */
function limbY(layerX: number): number {
  const t = layerX / LAYER_WIDTH;
  return 140 + 110 * (1 - t) ** 2;
}

/** The layers of a landscape, back to front. */
export type LandscapeLayers = Readonly<
  Record<'sky' | 'far' | 'mid' | 'near', GameObjects.Container>
>;

export interface Landscape {
  readonly layers: LandscapeLayers;
  /** The sky's stars, a child of the sky layer, so ambient life can twinkle them. */
  readonly starfield: TwinklingStarfield;
  /** A dust colour that reads against this ground. */
  readonly dustColor: PaletteColor;
}

/**
 * The view from the surface of the Body `run` is landed on: its sky (stars, the star and the nearby
 * Bodies) and its ground, far to near. The generated surface art when the manifest has it, a painted
 * stand-in otherwise. The same Run always draws the same landscape.
 */
export function buildLandscape(scene: Scene, run: Run): Landscape {
  const kind = surfaceKind(currentBody(run));
  const palette = PALETTES[kind];
  const { container: sky, field } = buildSky(scene, run);
  const layer = (
    key: string,
    area: { readonly y: number; readonly height: number },
    paint: (graphics: GameObjects.Graphics, p: SurfacePalette, rng: Rng) => void,
  ): GameObjects.Container => {
    const container = scene.add.container(LAYER_X, area.y);
    if (hasAsset(key)) {
      container.add(scene.add.image(0, 0, key).setOrigin(0, 0));
    } else {
      const graphics = scene.add.graphics();
      paint(graphics, palette, createRng(run.seed ^ stringSeed(key)));
      container.add(graphics);
    }
    return container;
  };
  const far = layer(`surface_${kind}_far`, FAR, paintFar);
  const mid = layer(`surface_${kind}_mid`, MID, paintMid);
  const near = layer(`surface_${kind}`, NEAR, paintNear);
  return { layers: { sky, far, mid, near }, starfield: field, dustColor: palette.dust };
}

function buildSky(
  scene: Scene,
  run: Run,
): { container: GameObjects.Container; field: TwinklingStarfield } {
  const container = scene.add.container(SKY_X, 0);
  // The starfield is a child so it scrolls with the sky; added first, behind the Bodies.
  const field = addTwinklingStarfield(
    scene,
    run.seed,
    STAR_COUNT,
    { width: SKY_WIDTH, height: 280 },
    TWINKLE_EVERY,
  );
  container.add(field.container);
  for (const sky of skyBodies(run)) {
    container.add(scene.add.image(sky.x, sky.y, sky.sprite).setScale(sky.scale));
  }
  return { container, field };
}

/** Far layer stand-in: the Body's limb, a big curve with a bright rim line. */
function paintFar(graphics: GameObjects.Graphics, palette: SurfacePalette, rng: Rng): void {
  graphics.fillStyle(paletteNumber(palette.far));
  fillBelow(graphics, FAR.height, (x) => limbY(x) - FAR.y);
  graphics.fillStyle(paletteNumber(palette.rim));
  for (let x = 0; x < LAYER_WIDTH; x += STEP) {
    graphics.fillRect(x, Math.round(limbY(x) - FAR.y), STEP, 1);
  }
  graphics.fillStyle(paletteNumber(palette.mid));
  for (let i = 0; i < 40; i++) {
    const x = rng.int(0, LAYER_WIDTH - 3);
    graphics.fillRect(x, Math.round(limbY(x) - FAR.y) + rng.int(4, 40), rng.int(2, 3), 1);
  }
}

/** Mid layer stand-in: rolling ridges that follow the limb's curve. */
function paintMid(graphics: GameObjects.Graphics, palette: SurfacePalette, rng: Rng): void {
  graphics.fillStyle(paletteNumber(palette.mid));
  // A random walk, so the ridge rolls instead of jittering column to column.
  let drift = 0;
  fillBelow(graphics, MID.height, (x) => {
    drift = Math.max(-8, Math.min(8, drift + rng.int(-2, 2)));
    return limbY(x) + 34 - MID.y + drift;
  });
}

/** Near layer stand-in: the ground the Spacecraft stands on, with specks and hatch strokes. */
function paintNear(graphics: GameObjects.Graphics, palette: SurfacePalette, rng: Rng): void {
  const top = (x: number): number => 22 + 40 * (1 - x / LAYER_WIDTH) ** 2;
  graphics.fillStyle(paletteNumber(palette.near));
  fillBelow(graphics, NEAR.height, top);
  graphics.fillStyle(paletteNumber(palette.speck));
  for (let i = 0; i < 110; i++) {
    const x = rng.int(0, LAYER_WIDTH - 3);
    graphics.fillRect(x, rng.int(Math.round(top(x)) + 6, NEAR.height - 2), rng.int(1, 3), 1);
  }
  graphics.lineStyle(1, paletteNumber(palette.speck), 0.6);
  for (let i = 0; i < 14; i++) {
    const x = rng.int(40, LAYER_WIDTH - 40);
    const y = rng.int(60, NEAR.height - 8);
    graphics.lineBetween(x, y + 6, x + 5, y);
  }
}

/** Width of one stand-in column: the skyline steps in whole pixels, like the pixel art it stands in for. */
const STEP = 4;

/** Fills a layer from `skyline(x)` down to `bottom`, column by column (concave polygons fill badly). */
function fillBelow(
  graphics: GameObjects.Graphics,
  bottom: number,
  skyline: (x: number) => number,
): void {
  for (let x = 0; x < LAYER_WIDTH; x += STEP) {
    const y = Math.min(Math.max(Math.round(skyline(x)), 0), bottom);
    graphics.fillRect(x, y, STEP, bottom - y);
  }
}
