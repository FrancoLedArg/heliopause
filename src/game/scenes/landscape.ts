import type { GameObjects, Scene } from 'phaser';
import { paletteNumber, type PaletteColor } from '../../ui/kit/palette.ts';
import { hasAsset } from '../assets/manifest.ts';
import { currentBody, type Run } from '../sim/index.ts';
import { groundShades, RAMP_SHADES } from './groundArt.ts';
import {
  GROUND_HEIGHT,
  GROUND_TOP,
  SKY_WIDTH,
  SURFACE_WIDTH,
  pebbles,
  skyBodies,
  surfaceKind,
  type SurfaceKind,
} from './landedView.ts';
import { addTwinklingStarfield, TWINKLE_EVERY, type TwinklingStarfield } from './starfield.ts';

/**
 * The landscape is two layers, each wider than the 640 px screen and in its own Container: the sky,
 * and one flat ground strip. The ambient drift scrolls them at different speeds (parallax) and the
 * flight lets the ground fall away beneath the Spacecraft.
 *
 * What the generated ground art (#132) must provide: texture key `surface_<kind>` (`surface_moon`,
 * `surface_rocky`, `surface_icy`), 800 x 64 px (`SURFACE_WIDTH` x `GROUND_HEIGHT`), fully opaque,
 * its top row the level surface line (drawn at y `GROUND_TOP`, the Spacecraft's base line), no
 * pebbles (the code places those), and its left edge continuing seamlessly from its right edge so
 * it repeats without a seam. Replacing the stand-in then needs only manifest entries.
 */
const LAYER_WIDTH = SURFACE_WIDTH;
/** Where the ground strip and the sky rest, centred on the 640 px screen. */
export const LAYER_X = (640 - LAYER_WIDTH) / 2;
export const SKY_X = (640 - SKY_WIDTH) / 2;

const STAR_COUNT = 150;

type Ramp = readonly [
  PaletteColor,
  PaletteColor,
  PaletteColor,
  PaletteColor,
  PaletteColor,
  PaletteColor,
  PaletteColor,
];

interface SurfacePalette {
  /** The seven shades of the ground, darkest (mortar) to brightest (the surface line). */
  readonly ramp: Ramp;
  /** Dust motes: light enough to read against this ground. */
  readonly dust: PaletteColor;
  /** The flight's dust and smoke puffs, larger than motes and set against the ground: lighter where the ground is amber. */
  readonly puff: PaletteColor;
}

/** Stand-in colours for each surface, all from the kit palette. */
const PALETTES: Record<SurfaceKind, SurfacePalette> = {
  rocky: { ramp: ['rd0', 'rd0', 'rd1', 'am0', 'am1', 'am2', 'am3'], dust: 'am2', puff: 'am3' },
  moon: { ramp: ['gm0', 'gm1', 'gm2', 'gm3', 'gm4', 'gm5', 'gm6'], dust: 'gm5', puff: 'gm5' },
  icy: { ramp: ['scr2', 'cy0', 'cy1', 'cy2', 'wh1', 'wh2', 'wh3'], dust: 'cy4', puff: 'cy4' },
};

/** The layers of a landscape, back to front. */
export type LandscapeLayers = Readonly<Record<'sky' | 'ground', GameObjects.Container>>;

export interface Landscape {
  readonly layers: LandscapeLayers;
  /** The sky's stars, a child of the sky layer, so ambient life can twinkle them. */
  readonly starfield: TwinklingStarfield;
  /** A dust colour that reads against this ground. */
  readonly dustColor: PaletteColor;
  /** The colour of the flight's dust and smoke puffs. */
  readonly puffColor: PaletteColor;
}

/**
 * The view from the surface of the Body `run` is landed on: its sky (stars, the star and the nearby
 * Bodies) and its ground, one flat strip whose top edge is the Spacecraft's base line. The generated
 * surface art when the manifest has it, a painted stand-in otherwise, with pebbles placed on top by
 * code either way. The same Run always draws the same landscape.
 */
export function buildLandscape(scene: Scene, run: Run): Landscape {
  const kind = surfaceKind(currentBody(run));
  const palette = PALETTES[kind];
  const { container: sky, field } = buildSky(scene, run);
  const ground = scene.add.container(LAYER_X, GROUND_TOP);
  ground.add(scene.add.image(0, 0, groundTexture(scene, kind)).setOrigin(0, 0));
  ground.add(paintPebbles(scene, run, palette));
  return {
    layers: { sky, ground },
    starfield: field,
    dustColor: palette.dust,
    puffColor: palette.puff,
  };
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

/**
 * The texture key of the ground strip: the generated art when the manifest lists it and it loaded,
 * else the stand-in, painted once into a texture every scene run shares (so a frame draws one image).
 */
export function groundTexture(scene: Scene, kind: SurfaceKind): string {
  const palette = PALETTES[kind];
  const key = `surface_${kind}`;
  // A listed texture that failed to load (a 404) is never added to the texture manager.
  if (hasAsset(key) && scene.textures.exists(key)) return key;
  const standIn = `${key}_standin`;
  if (scene.textures.exists(standIn)) return standIn;
  const canvas = scene.textures.createCanvas(standIn, SURFACE_WIDTH, GROUND_HEIGHT);
  if (!canvas) throw new Error(`Could not create the ${standIn} texture`);
  const rgb = palette.ramp.map((color) => paletteNumber(color));
  const image = canvas.context.createImageData(SURFACE_WIDTH, GROUND_HEIGHT);
  const shades = groundShades();
  for (let i = 0; i < shades.length; i++) {
    const color = rgb[Math.min(shades[i] ?? 0, RAMP_SHADES - 1)] ?? 0;
    image.data[i * 4] = (color >> 16) & 0xff;
    image.data[i * 4 + 1] = (color >> 8) & 0xff;
    image.data[i * 4 + 2] = color & 0xff;
    image.data[i * 4 + 3] = 255;
  }
  canvas.context.putImageData(image, 0, 0);
  canvas.refresh();
  return standIn;
}

/** The Body's pebbles, resting on the ground's top edge: one small Graphics, in the ground's own coordinates. */
function paintPebbles(scene: Scene, run: Run, palette: SurfacePalette): GameObjects.Graphics {
  const graphics = scene.add.graphics();
  const lit = paletteNumber(palette.ramp[5]);
  const body = paletteNumber(palette.ramp[3]);
  for (const pebble of pebbles(run)) {
    graphics.fillStyle(body);
    graphics.fillRect(pebble.x, -pebble.height, pebble.width, pebble.height);
    // Lit on the upper left: a bright top edge and left edge.
    graphics.fillStyle(lit);
    graphics.fillRect(pebble.x, -pebble.height, pebble.width, 1);
    graphics.fillRect(pebble.x, -pebble.height, 1, pebble.height);
  }
  return graphics;
}
