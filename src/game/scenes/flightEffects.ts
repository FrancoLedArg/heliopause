import type { GameObjects, Scene } from 'phaser';
import { paletteNumber, type PaletteColor } from '../../ui/kit/palette.ts';
import { hasAsset } from '../assets/manifest.ts';
import type { Point } from './chassisArt.ts';

/** Texture keys of the particle art. Until the art is in the manifest, white stand-ins are drawn at the same sizes (code tints both). */
const TEXTURES = {
  dust: { key: 'fx_dust', size: 6, color: 'wh3' },
  smoke: { key: 'fx_smoke', size: 10, color: 'wh3' },
  spark: { key: 'fx_spark', size: 3, color: 'wh3' },
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
  /** A trail of sparks from the nozzles firing rearward (their exits in the world) while `on`, taking turns. */
  readonly exhaust: (on: boolean, nozzles: readonly Point[]) => void;
  /** Tints the dust and smoke to read against the ground they rise from. */
  readonly setSurface: (color: PaletteColor) => void;
  /** How far the dust and smoke follow the camera's scroll: below 1 they fall away slower than the ground. */
  readonly setScrollFactor: (factor: number) => void;
  /** Hides the ground effects in space and the sparks never; clears what is in the air at a cut. */
  readonly setStage: (inSpace: boolean) => void;
  /** Particles keep pace with the playback when it is fast-forwarded. */
  readonly setSpeed: (speed: number) => void;
}

/**
 * The playback's particles: dust and smoke at Takeoff and Landing, sparks from the engine on the way.
 * Three pooled emitters made once; frames only switch them on or off and move them, so no emitter or texture is created per frame.
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
    // Rises slowly, grows 1x to 3x and fades over 2 to 3 s.
    lifespan: { min: 2000, max: 3000 },
    speed: { min: 8, max: 20 },
    angle: { min: 250, max: 290 },
    scale: { start: 1, end: 3 },
    alpha: { start: 0.45, end: 0 },
    maxAliveParticles: 36,
  });
  // The plume points back and down-left at 24° below the horizontal; sparks leave along it.
  const sparks = scene.add.particles(0, 0, ensureTexture(scene, 'spark'), {
    emitting: false,
    frequency: 35,
    quantity: 1,
    lifespan: { min: 350, max: 600 },
    speed: { min: 120, max: 210 },
    angle: { min: 146, max: 166 },
    tint: paletteNumber('am4'),
    scale: { start: 1, end: 0.2 },
    alpha: { start: 0.9, end: 0 },
    maxAliveParticles: 24,
  });
  // Each spark leaves the next nozzle in turn: offsets from the emitter, which sits at the first nozzle.
  const sparkExits: Point[] = [];
  let nextExit = 0;
  sparks.addEmitZone({
    type: 'random',
    source: {
      getRandomPoint: (point) => {
        const exit = sparkExits[nextExit % Math.max(sparkExits.length, 1)];
        nextExit++;
        point.x = exit?.x ?? 0;
        point.y = exit?.y ?? 0;
      },
    },
  });
  const ground = [dust, smoke];
  const all = [dust, smoke, sparks];
  const running = new Set<GameObjects.Particles.ParticleEmitter>();

  const drive = (
    emitters: readonly GameObjects.Particles.ParticleEmitter[],
    on: boolean,
    at?: GroundSpot,
  ): void => {
    for (const emitter of emitters) {
      if (at) emitter.setPosition(at.x, at.y);
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
      // The emitters stay at the world's origin and new puffs are born at `at`: a puff already in the air
      // keeps its place when the next frame's spot moves (moving the emitter would carry them all along).
      for (const emitter of ground) {
        emitter.particleX = at.x;
        emitter.particleY = at.y;
      }
      drive(ground, on);
    },
    exhaust: (on, nozzles) => {
      const [first] = nozzles;
      sparkExits.length = 0;
      for (const exit of nozzles) {
        sparkExits.push({ x: exit.x - (first?.x ?? 0), y: exit.y - (first?.y ?? 0) });
      }
      drive([sparks], on, first);
    },
    setSurface: (color) => {
      for (const emitter of ground) emitter.setParticleTint(paletteNumber(color));
    },
    setScrollFactor: (factor) => {
      for (const emitter of ground) emitter.setScrollFactor(factor);
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
