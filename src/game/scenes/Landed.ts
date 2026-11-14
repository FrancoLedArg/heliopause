import { Scene, type GameObjects } from 'phaser';
import { paletteNumber, type PaletteColor } from '../../ui/kit/palette.ts';
import { hasAsset } from '../assets/manifest.ts';
import { EventBus } from '../EventBus.ts';
import { createRng, type Rng } from '../lib/rng.ts';
import { stringSeed } from '../lib/stringSeed.ts';
import { currentBody, type Run } from '../sim/index.ts';
import {
  SHIP_PLACEMENT,
  SKY_WIDTH,
  skyBodies,
  surfaceKind,
  type SurfaceKind,
} from './landedView.ts';
import { SceneKey } from './keys.ts';
import { onLeaveRun } from './leaveRun.ts';
import { addStarfield } from './starfield.ts';

export interface LandedData {
  /** The Run to show: the Spacecraft landed on its current Body. */
  readonly run: Run;
}

/**
 * The scene is built from separate layers, each wider than the 640 px screen and in its own
 * Container, so the ambient-motion ticket can scroll them at different speeds (parallax) without
 * rebuilding anything. Sizes and y positions match the surface art from #22.
 */
const LAYER_WIDTH = 800;
const LAYER_X = (640 - LAYER_WIDTH) / 2;
const SKY_X = (640 - SKY_WIDTH) / 2;
const FAR = { y: 90, height: 200 } as const;
const MID = { y: 180, height: 160 } as const;
const NEAR = { y: 240, height: 120 } as const;

const SHIP_SCALE = 4;
// The `spacecraft` sprite points right; its tail sits 5px past the centre, so stood upright
// (rotated -90°) its base is 5px below its middle.
const SHIP_STAND_IN_BASE_OFFSET = 5 * SHIP_SCALE;

const STAR_COUNT = 150;

interface SurfacePalette {
  readonly far: PaletteColor;
  readonly mid: PaletteColor;
  readonly near: PaletteColor;
  readonly rim: PaletteColor;
  readonly speck: PaletteColor;
}

/** Stand-in colours for each surface, all from the kit palette. */
const PALETTES: Record<SurfaceKind, SurfacePalette> = {
  rocky: { far: 'am0', mid: 'am1', near: 'am0', rim: 'am3', speck: 'am1' },
  moon: { far: 'gm1', mid: 'gm2', near: 'gm3', rim: 'gm6', speck: 'gm4' },
  icy: { far: 'cy0', mid: 'cy1', near: 'cy2', rim: 'cy4', speck: 'cy3' },
};

/** The limb curve in screen pixels: steep at lower left, flattening to upper right. */
function limbY(layerX: number): number {
  const t = layerX / LAYER_WIDTH;
  return 140 + 110 * (1 - t) ** 2;
}

/** Landed view: the whole Spacecraft on the ground of the Body it stands on, under that Body's sky. */
export class Landed extends Scene {
  private run!: Run;
  /** The layers, back to front: ambient motion (parallax drift) moves these. */
  layers!: Readonly<Record<'sky' | 'far' | 'mid' | 'near' | 'ship', GameObjects.Container>>;

  constructor() {
    super(SceneKey.Landed);
  }

  init(data: LandedData): void {
    this.run = data.run;
  }

  create(): void {
    const kind = surfaceKind(currentBody(this.run));
    const sky = this.buildSky();
    const far = this.buildSurfaceLayer(`surface_${kind}_far`, FAR, kind, (g, p, rng) => {
      this.paintFar(g, p, rng);
    });
    const mid = this.buildSurfaceLayer(`surface_${kind}_mid`, MID, kind, (g, p, rng) => {
      this.paintMid(g, p, rng);
    });
    const near = this.buildSurfaceLayer(`surface_${kind}`, NEAR, kind, (g, p, rng) => {
      this.paintNear(g, p, rng);
    });
    this.layers = { sky, far, mid, near, ship: this.buildShip() };

    onLeaveRun(this);
    EventBus.emit('run-started', this.run);
    EventBus.emit('scene-ready', SceneKey.Landed);
  }

  private buildSky(): GameObjects.Container {
    const container = this.add.container(SKY_X, 0);
    // The starfield is a child so it scrolls with the sky; added first, behind the Bodies.
    container.add(addStarfield(this, this.run.seed, STAR_COUNT, { width: SKY_WIDTH, height: 280 }));
    for (const sky of skyBodies(this.run)) {
      container.add(this.add.image(sky.x, sky.y, sky.sprite).setScale(sky.scale));
    }
    return container;
  }

  /** One ground layer: the generated art when its key is in the manifest, a painted stand-in otherwise. */
  private buildSurfaceLayer(
    key: string,
    area: { readonly y: number; readonly height: number },
    kind: SurfaceKind,
    paint: (graphics: GameObjects.Graphics, palette: SurfacePalette, rng: Rng) => void,
  ): GameObjects.Container {
    const container = this.add.container(LAYER_X, area.y);
    if (hasAsset(key)) {
      container.add(this.add.image(0, 0, key).setOrigin(0, 0));
    } else {
      const graphics = this.add.graphics();
      paint(graphics, PALETTES[kind], createRng(this.run.seed ^ stringSeed(key)));
      container.add(graphics);
    }
    return container;
  }

  /** Far layer stand-in: the Body's limb, a big curve with a bright rim line. */
  private paintFar(graphics: GameObjects.Graphics, palette: SurfacePalette, rng: Rng): void {
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
  private paintMid(graphics: GameObjects.Graphics, palette: SurfacePalette, rng: Rng): void {
    graphics.fillStyle(paletteNumber(palette.mid));
    // A random walk, so the ridge rolls instead of jittering column to column.
    let drift = 0;
    fillBelow(graphics, MID.height, (x) => {
      drift = Math.max(-8, Math.min(8, drift + rng.int(-2, 2)));
      return limbY(x) + 34 - MID.y + drift;
    });
  }

  /** Near layer stand-in: the ground the Spacecraft stands on, with specks and hatch strokes. */
  private paintNear(graphics: GameObjects.Graphics, palette: SurfacePalette, rng: Rng): void {
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

  /** The whole Spacecraft, in the foreground: its Chassis art when present, the 4x `spacecraft` otherwise. */
  private buildShip(): GameObjects.Container {
    const container = this.add.container(SHIP_PLACEMENT.x, SHIP_PLACEMENT.baseY);
    const shadow = this.add.ellipse(0, 2, 72, 8, paletteNumber('void'), 0.45);
    container.add(shadow);
    const chassis = `chassis_${this.run.spacecraft.chassisId}`;
    if (hasAsset(chassis)) {
      container.add(this.add.image(0, 0, chassis, 'landed').setOrigin(0.5, 1));
    } else {
      container.add(
        this.add
          .image(0, -SHIP_STAND_IN_BASE_OFFSET, 'spacecraft')
          .setScale(SHIP_SCALE)
          .setAngle(-90),
      );
    }
    return container;
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
