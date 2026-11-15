import { BlendModes, type GameObjects, type Scene, type Time, type Tweens } from 'phaser';
import { KIT_ATLAS_KEY } from '../../ui/kit/kit.ts';
import { paletteNumber, type PaletteColor } from '../../ui/kit/palette.ts';
import {
  GATHERING_TIMING as BEAT,
  READOUT_ICON,
  readoutAt,
  type GatheredResource,
  type Gathering,
  type GatheringReadout,
} from './gathering.ts';

/** Each resource in the colour of its top-bar readout, so the flow and the number it fills read as one. */
const COLOUR: Record<GatheredResource, PaletteColor> = { fuel: 'am3', materials: 'gr3' };

/**
 * The particle art, drawn in code (white, tinted per resource) so no asset request is needed: Fuel
 * rises as droplets, Materials as small crystals; the shapes differ, not only the colours.
 */
const PARTICLE = {
  fuel: { key: 'fx_gather_drop', width: 3, height: 4 },
  materials: { key: 'fx_gather_crystal', width: 3, height: 5 },
} as const;

/** How many icons fly to the top bar (presentation tuning). */
const FLYING_ICONS = 6;
/** Each flying icon is drawn at half the kit's 32 px. */
const ICON_SCALE = 0.5;
/** How long one icon takes from the Spacecraft to the top bar (ms). */
const FLIGHT_MS = 480;
/** Where the resource goes in: this share of the standing Spacecraft's height above its base. */
const INTAKE_HEIGHT = 0.45;

export interface GatheringStage {
  /** The Spacecraft's layer: its origin is the centre of the Spacecraft's base, on the ground's top edge. */
  readonly ship: GameObjects.Container;
  /** The standing Spacecraft art, from the centre of its base: how far it reaches either side and up. */
  readonly shipExtent: { readonly halfWidth: number; readonly height: number };
}

export interface GatheringMoment {
  /** Jumps to the end state now: everything in the air is cleared and `onEnd` is called. Safe to call twice. */
  readonly skip: () => void;
}

/** Draws a particle texture once; every scene run shares it. */
function ensureParticle(scene: Scene, resource: GatheredResource): string {
  const { key, width, height } = PARTICLE[resource];
  if (scene.textures.exists(key)) return key;
  const g = scene.make.graphics({}, false);
  g.fillStyle(paletteNumber('wh3'));
  if (resource === 'fuel') {
    // A droplet: a point on top of a round body.
    g.fillRect(1, 0, 1, 1);
    g.fillRect(0, 1, 3, 3);
  } else {
    // A crystal: a diamond.
    g.fillTriangle(1.5, 0, 3, 2.5, 1.5, 5);
    g.fillTriangle(1.5, 0, 0, 2.5, 1.5, 5);
  }
  g.generateTexture(key, width, height);
  g.destroy();
  return key;
}

/**
 * Plays the gathering moment: the resource rises out of the ground under the Spacecraft into it (with
 * a pulse at its foot when a Drill is installed), a full Tank's leftover spills back onto the ground,
 * then a short stream of icons flies to the top bar's readout, which counts up as they land
 * (`onReadout`, sent only on a visible change). About 1.5 s, then `onEnd`. Only presentation: the
 * numbers all come from `gathering`. Every object, tween and timer it makes is cleared at the end.
 */
export function playGatheringMoment(
  scene: Scene,
  gathering: Gathering,
  stage: GatheringStage,
  onReadout: (readout: GatheringReadout) => void,
  onEnd: () => void,
): GatheringMoment {
  const { ship, shipExtent } = stage;
  const colour = paletteNumber(COLOUR[gathering.resource]);
  const intakeY = -Math.round(shipExtent.height * INTAKE_HEIGHT);
  const objects: GameObjects.GameObject[] = [];
  const tweens: Tweens.Tween[] = [];
  const timers: Time.TimerEvent[] = [];
  const at = (ms: number, then: () => void): void => {
    timers.push(scene.time.delayedCall(ms, then));
  };

  // 1. The source: the ground under the Spacecraft glows where the resource comes up.
  const seep = scene.add
    .ellipse(0, 5, shipExtent.halfWidth * 2.2, 10, colour, 0)
    .setBlendMode(BlendModes.ADD);
  // Above the shadow (index 0), under the Spacecraft's art.
  ship.addAt(seep, 1);
  objects.push(seep);
  tweens.push(
    scene.tweens.add({
      targets: seep,
      fillAlpha: { from: 0, to: 0.8 },
      duration: (BEAT.rise.end - BEAT.rise.start) / 2,
      yoyo: true,
      ease: 'Sine.easeInOut',
    }),
  );

  // 2. The flow: droplets or crystals rise from the ground strip into the Spacecraft. The emitter sits
  // at the layer's origin, so its zone and target are in the Spacecraft's own frame and ride the drift.
  const lifespan = { min: 320, max: 460 };
  const rise = scene.add.particles(0, 0, ensureParticle(scene, gathering.resource), {
    emitting: false,
    frequency: 16,
    quantity: 3,
    lifespan,
    // Anywhere in the ground strip under the Spacecraft, a little wider in the middle than at the edges.
    emitZone: {
      type: 'random',
      source: {
        getRandomPoint: (point) => {
          const spread = (Math.random() + Math.random() - 1) * shipExtent.halfWidth * 0.9;
          point.x = spread;
          point.y = 3 + Math.random() * 12;
        },
      },
    },
    moveToX: { min: -3, max: 3 },
    moveToY: intakeY,
    scale: { start: 2, end: 1 },
    alpha: { start: 0.95, end: 0.35 },
    tint: colour,
    maxAliveParticles: 120,
  });
  ship.add(rise);
  objects.push(rise);
  rise.start(0, BEAT.rise.end - BEAT.rise.start - lifespan.max);

  // The Spacecraft takes it in: a soft glow where the flow enters.
  const intake = scene.add
    .ellipse(0, intakeY, shipExtent.halfWidth * 1.2, shipExtent.height * 0.5, colour, 0)
    .setBlendMode(BlendModes.ADD);
  ship.add(intake);
  objects.push(intake);
  tweens.push(
    scene.tweens.add({
      targets: intake,
      fillAlpha: { from: 0, to: 0.4 },
      delay: lifespan.min,
      duration: (BEAT.rise.end - lifespan.min) / 2,
      yoyo: true,
      ease: 'Sine.easeInOut',
    }),
  );

  // 3. The Drill: rings pulse out from the Spacecraft's foot while the resource rises.
  if (gathering.drill) {
    const pulses = Math.ceil((BEAT.rise.end - BEAT.rise.start) / BEAT.drillEvery);
    for (let i = 0; i < pulses; i++) {
      at(BEAT.rise.start + i * BEAT.drillEvery, () => {
        // A bright ring over a dark one, so it reads on pale ice and dark rock alike.
        const rings = (
          [
            [3, 'void', 0.6],
            [1, 'cy4', 1],
          ] as const
        ).map(([width, colour, alpha]) =>
          scene.add
            .ellipse(0, 3, 16, 5)
            .setFillStyle()
            .setStrokeStyle(width, paletteNumber(colour), alpha),
        );
        ship.add(rings);
        objects.push(...rings);
        tweens.push(
          scene.tweens.add({
            targets: rings,
            scaleX: 6,
            scaleY: 2.5,
            alpha: 0,
            duration: 520,
            ease: 'Quad.easeOut',
          }),
        );
      });
    }
  }

  // 4. A full Tank: the leftover sprays out of the top and falls back onto the ground beside it.
  if (gathering.resource === 'fuel' && gathering.leftBehind > 0) {
    const share =
      gathering.leftBehind / Math.max(gathering.leftBehind + gathering.to - gathering.from, 1);
    const spill = scene.add.particles(0, -shipExtent.height * 0.8, ensureParticle(scene, 'fuel'), {
      emitting: false,
      lifespan: 1100,
      speed: { min: 45, max: 95 },
      angle: { min: 205, max: 335 },
      gravityY: 300,
      tint: colour,
      scale: 1.5,
      alpha: { start: 1, end: 0.6 },
      // Gone where it meets the ground (zones test world positions): it is left there, as the puddles show.
      deathZone: {
        type: 'onEnter',
        source: { contains: (_x: number, y: number) => y > ship.y + 4 },
      },
    });
    ship.add(spill);
    objects.push(spill);
    at(BEAT.spill.start, () => {
      spill.explode(Math.round(16 + 24 * share));
    });
    for (const side of [-1, 1]) {
      const puddle = scene.add
        .ellipse(side * (shipExtent.halfWidth + 10), 4, 26, 4, colour, 0.7)
        .setScale(0, 1);
      ship.addAt(puddle, 1);
      objects.push(puddle);
      tweens.push(
        scene.tweens.add({
          targets: puddle,
          scaleX: 1,
          delay: BEAT.spill.start + 380,
          duration: 260,
          ease: 'Quad.easeOut',
        }),
        scene.tweens.add({
          targets: puddle,
          alpha: 0,
          delay: BEAT.end - 300,
          duration: 300,
        }),
      );
    }
  }

  // 5. On to the top bar: icons leave the Spacecraft and arc up to the readout's icon.
  const target = READOUT_ICON[gathering.resource];
  for (let i = 0; i < FLYING_ICONS; i++) {
    const delay =
      BEAT.fly.start + ((BEAT.fly.end - BEAT.fly.start - FLIGHT_MS) * i) / (FLYING_ICONS - 1);
    at(delay, () => {
      const start = { x: ship.x, y: ship.y + intakeY };
      // The arc sweeps across the sky and comes up into the icon from below, clear of the readout's number.
      const control = { x: target.x, y: start.y - 40 };
      const icon = (
        gathering.resource === 'fuel'
          ? scene.add.image(start.x, start.y, KIT_ATLAS_KEY, 'res_fuel')
          : scene.add.image(start.x, start.y, 'res_materials')
      )
        .setScale(ICON_SCALE * 0.6)
        .setAlpha(0);
      objects.push(icon);
      tweens.push(
        scene.tweens.addCounter({
          from: 0,
          to: 1,
          duration: FLIGHT_MS,
          ease: 'Sine.easeIn',
          onUpdate: (tween) => {
            const t = tween.getValue() ?? 0;
            const u = 1 - t;
            icon.setPosition(
              u * u * start.x + 2 * u * t * control.x + t * t * target.x,
              u * u * start.y + 2 * u * t * control.y + t * t * target.y,
            );
            icon.setAlpha(Math.min(1, t * 4));
            icon.setScale(ICON_SCALE * (0.6 + 0.6 * Math.sin(Math.PI * t) + 0.4 * t));
          },
          onComplete: () => {
            icon.setVisible(false);
          },
        }),
      );
    });
  }

  // The readout counts up while the icons land, from the first arrival to the last.
  let shown: number | undefined;
  tweens.push(
    scene.tweens.addCounter({
      from: 0,
      to: 1,
      delay: BEAT.fly.start + FLIGHT_MS,
      duration: BEAT.fly.end - BEAT.fly.start - FLIGHT_MS,
      onUpdate: (tween) => {
        const readout = readoutAt(gathering, tween.getValue() ?? 0);
        // Only a change the top bar can show: Fuel reads in tenths of a tonne, Materials in units.
        const step = Math.round(readout.value / (readout.resource === 'fuel' ? 100 : 1));
        if (step === shown) return;
        shown = step;
        onReadout(readout);
      },
    }),
  );

  let ended = false;
  const finish = (): void => {
    if (ended) return;
    ended = true;
    for (const timer of timers) timer.remove(false);
    for (const tween of tweens) tween.stop();
    for (const object of objects) object.destroy();
    onEnd();
  };
  at(BEAT.end, finish);
  return { skip: finish };
}
