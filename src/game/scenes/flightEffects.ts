import type { GameObjects, Scene } from 'phaser';
import { paletteNumber, type PaletteColor } from '../../ui/kit/palette.ts';
import { hasAsset } from '../assets/manifest.ts';

/** Texture keys of the particle art. Until the art is in the manifest, tiny stand-ins are drawn at the same sizes. */
const TEXTURES = {
  dust: { key: 'fx_dust', size: 6, color: 'gm5' },
  smoke: { key: 'fx_smoke', size: 10, color: 'gm4' },
  spark: { key: 'fx_spark', size: 3, color: 'cy3' },
} as const satisfies Record<string, { key: string; size: number; color: PaletteColor }>;

type TextureName = keyof typeof TEXTURES;

/** Draws a stand-in puff (a square with its corners cut) once; every scene run shares it. */
function ensureTexture(scene: Scene, name: TextureName): string {
  const { key, size, color } = TEXTURES[name];
  if (hasAsset(key) || scene.textures.exists(key)) return key;
  const graphics = scene.make.graphics({}, false);
  graphics.fillStyle(paletteNumber(color));
  graphics.fillRect(1, 0, size - 2, size);
  graphics.fillRect(0, 1, size, size - 2);
  graphics.generateTexture(key, size, size);
  graphics.destroy();
  return key;
}

/** Where the dust and smoke rise from: the ground under the Spacecraft. */
export interface GroundSpot {
  readonly x: number;
  readonly y: number;
}

export interface FlightEffects {
  /** Dust and smoke kicked up by the engine near the ground, while `on`. */
  readonly ground: (on: boolean, at: GroundSpot) => void;
  /** A trail of sparks from the rear nozzle while `on`. */
  readonly exhaust: (on: boolean, at: GroundSpot) => void;
  /** Hides the ground effects in space and the sparks never; clears what is in the air at a cut. */
  readonly setStage: (inSpace: boolean) => void;
  /** Particles keep pace with the playback when it is fast-forwarded. */
  readonly setSpeed: (speed: number) => void;
}

/**
 * The playback's particles: dust and smoke at Takeoff and Landing, sparks from the engine on the way.
 * Three pooled emitters made once; frames only switch them on or off and move them, so none allocates.
 */
export function createFlightEffects(scene: Scene): FlightEffects {
  const dust = scene.add.particles(0, 0, ensureTexture(scene, 'dust'), {
    emitting: false,
    frequency: 45,
    quantity: 2,
    lifespan: { min: 500, max: 900 },
    speed: { min: 30, max: 95 },
    angle: { min: 195, max: 345 },
    gravityY: 40,
    scale: { start: 1, end: 0.3 },
    alpha: { start: 0.65, end: 0 },
    maxAliveParticles: 40,
  });
  const smoke = scene.add.particles(0, 0, ensureTexture(scene, 'smoke'), {
    emitting: false,
    frequency: 80,
    quantity: 1,
    lifespan: { min: 900, max: 1500 },
    speed: { min: 8, max: 34 },
    angle: { min: 240, max: 300 },
    scale: { start: 0.5, end: 2 },
    alpha: { start: 0.45, end: 0 },
    maxAliveParticles: 24,
  });
  // The plume points back and down-left at 24° below the horizontal; sparks leave along it.
  const sparks = scene.add.particles(0, 0, ensureTexture(scene, 'spark'), {
    emitting: false,
    frequency: 35,
    quantity: 1,
    lifespan: { min: 350, max: 600 },
    speed: { min: 120, max: 210 },
    angle: { min: 146, max: 166 },
    scale: { start: 1, end: 0.2 },
    alpha: { start: 0.9, end: 0 },
    maxAliveParticles: 24,
  });
  const ground = [dust, smoke];
  const all = [dust, smoke, sparks];
  const running = new Set<GameObjects.Particles.ParticleEmitter>();

  const drive = (
    emitters: readonly GameObjects.Particles.ParticleEmitter[],
    on: boolean,
    at: GroundSpot,
  ): void => {
    for (const emitter of emitters) {
      emitter.setPosition(at.x, at.y);
      if (on === running.has(emitter)) continue;
      if (on) {
        emitter.start();
        running.add(emitter);
      } else {
        emitter.stop();
        running.delete(emitter);
      }
    }
  };

  return {
    ground: (on, at) => {
      drive(ground, on, at);
    },
    exhaust: (on, at) => {
      drive([sparks], on, at);
    },
    setStage: (inSpace) => {
      for (const emitter of ground) {
        emitter.setVisible(!inSpace);
        if (inSpace) {
          emitter.stop();
          running.delete(emitter);
        }
      }
      if (inSpace) for (const emitter of ground) emitter.killAll();
    },
    setSpeed: (speed) => {
      for (const emitter of all) emitter.timeScale = speed;
    },
  };
}
