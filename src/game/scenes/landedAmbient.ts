import { BlendModes, type GameObjects, type Scene, type Time, type Tweens } from 'phaser';
import { paletteNumber, type PaletteColor } from '../../ui/kit/palette.ts';
import { createRng } from '../lib/rng.ts';
import {
  DRIFT_PERIOD_MS,
  DUST_SPAN,
  blowX,
  driftOffsets,
  newDriftOffsets,
  phaseAt,
} from './landedMotion.ts';
import { prefersReducedMotion } from '../lib/motion.ts';
import type { TwinklingStarfield } from './starfield.ts';
import { twinkle } from './starfield.ts';

const MOTE_COUNT = 22;
/** Dust hugs the ground: low on the screen, over the ground. It blows in screen space, so the camera's drift does not move it. */
const DUST_Y = { min: 272, max: 346 } as const;
const DUST_SPEED = { min: 9, max: 26 } as const;
const LIGHTS_ON_MS = 700;
const LIGHTS_OFF_MS = 1500;

export interface AmbientTargets {
  /** The scene's layers, back to front. */
  readonly layers: Readonly<Record<'sky' | 'ground' | 'ship', GameObjects.Container>>;
  /** Where each layer rests when the camera is centred. */
  readonly rest: { readonly sky: number; readonly layer: number; readonly ship: number };
  readonly starfield: TwinklingStarfield;
  /** Turns the Spacecraft's lights on or off. */
  readonly setShipLights: (on: boolean) => void;
  readonly dustColor: PaletteColor;
  readonly seed: number;
}

export interface LandedAmbient {
  /** True when the player prefers reduced motion: nothing moves. */
  readonly reducedMotion: boolean;
  /** Test seam: jumps the drift clock to `ms` into its cycle and holds it there. Does nothing under reduced motion. */
  readonly seekDrift: (ms: number) => void;
  /** Stops every tween, timer and listener the ambient life started. Safe to call twice. */
  readonly dispose: () => void;
}

/**
 * The Landed scene's ambient life: the camera's slow parallax drift, twinkling stars, dust blown
 * over the ground, and the Spacecraft's blinking lights and pulsing thruster glow. Built once from
 * tweens, timers and one update listener over a fixed pool of objects, so no frame allocates.
 * Reduced motion is read once; then nothing starts and the scene is the same composition, held still.
 */
export function createLandedAmbient(scene: Scene, targets: AmbientTargets): LandedAmbient {
  const reducedMotion = prefersReducedMotion();
  const tweens: Tweens.Tween[] = [];
  let seekDrift: (ms: number) => void = () => undefined;
  let stopLights = (): void => undefined;
  let stopDust = (): void => undefined;

  if (!reducedMotion) {
    const drift = driftTween(scene, targets);
    seekDrift = drift.seek;
    tweens.push(
      drift.tween,
      ...targets.starfield.twinklers.map(({ star, index }) => twinkle(scene, star, index)),
    );
    stopLights = blinkLights(scene, targets.setShipLights);
    tweens.push(glowTween(scene, targets.layers.ship));
    stopDust = blowDust(scene, targets);
  }

  let disposed = false;
  return {
    reducedMotion,
    seekDrift: (ms) => {
      seekDrift(ms);
    },
    dispose: () => {
      if (disposed) return;
      disposed = true;
      stopLights();
      stopDust();
      for (const tween of tweens) tween.remove();
      tweens.length = 0;
    },
  };
}

/** One tween is the camera's clock; each frame it sets every layer's x from the shared offsets. The Spacecraft rides the ground it stands on. */
function driftTween(
  scene: Scene,
  t: AmbientTargets,
): { tween: Tweens.Tween; seek: (ms: number) => void } {
  const offsets = newDriftOffsets();
  const clock = { ms: 0 };
  const place = (): void => {
    driftOffsets(phaseAt(clock.ms), offsets);
    t.layers.sky.x = t.rest.sky + offsets.sky;
    // The stars are farther than the Bodies, so they trail them a little inside the sky.
    t.starfield.container.x = offsets.stars - offsets.sky;
    t.layers.ground.x = t.rest.layer + offsets.ground;
    t.layers.ship.x = t.rest.ship + offsets.ground;
  };
  const tween = scene.tweens.add({
    targets: clock,
    ms: DRIFT_PERIOD_MS,
    duration: DRIFT_PERIOD_MS,
    ease: 'Linear',
    repeat: -1,
    onUpdate: place,
  });
  return {
    tween,
    seek: (ms) => {
      tween.pause();
      clock.ms = ms;
      place();
    },
  };
}

/** The lights come on for a moment, then go dark for a longer one. Returns a function that stops them. */
function blinkLights(scene: Scene, setLights: (on: boolean) => void): () => void {
  let timer: Time.TimerEvent | undefined;
  const wait = (on: boolean): void => {
    timer = scene.time.delayedCall(on ? LIGHTS_ON_MS : LIGHTS_OFF_MS, () => {
      setLights(!on);
      wait(!on);
    });
  };
  wait(false);
  return () => {
    timer?.remove();
  };
}

/** A faint warm glow under the Spacecraft that swells and fades, as if its thrusters idled. */
function glowTween(scene: Scene, ship: GameObjects.Container): Tweens.Tween {
  const glow = scene.add
    .ellipse(0, -3, 56, 9, paletteNumber('am3'), 1)
    .setAlpha(0.04)
    .setBlendMode(BlendModes.ADD);
  ship.addAt(glow, 1); // above the shadow, below the Chassis
  return scene.tweens.add({
    targets: glow,
    alpha: 0.24,
    duration: 2600,
    ease: 'Sine.easeInOut',
    yoyo: true,
    repeat: -1,
  });
}

/** A fixed pool of thin motes blown left to right low over the ground, moved by one update listener. Returns a function that stops them. */
function blowDust(scene: Scene, t: AmbientTargets): () => void {
  const rng = createRng(t.seed ^ 0xd057);
  const container = scene.add.container(0, 0);
  const motes: GameObjects.Rectangle[] = [];
  const speeds: number[] = [];
  for (let i = 0; i < MOTE_COUNT; i++) {
    const mote = scene.add
      .rectangle(
        DUST_SPAN.min + rng.next() * (DUST_SPAN.max - DUST_SPAN.min),
        rng.int(DUST_Y.min, DUST_Y.max),
        rng.int(2, 5),
        1,
        paletteNumber(t.dustColor),
        0.25 + rng.next() * 0.3,
      )
      .setOrigin(0, 0);
    motes.push(mote);
    speeds.push(DUST_SPEED.min + rng.next() * (DUST_SPEED.max - DUST_SPEED.min));
    container.add(mote);
  }
  const onUpdate = (_time: number, delta: number): void => {
    for (let i = 0; i < motes.length; i++) {
      const mote = motes[i];
      const speed = speeds[i];
      if (mote && speed !== undefined) mote.x = blowX(mote.x, speed, delta);
    }
  };
  scene.events.on('update', onUpdate);
  return () => {
    scene.events.off('update', onUpdate);
  };
}
