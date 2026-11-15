import { BlendModes, GameObjects, type Scene, type Types } from 'phaser';
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

/** The code-drawn soft textures (not art): a round glow, and a soft puff for the smoke column. */
const SOFT = {
  glow: { key: 'fx_glow', size: 32 },
  puff: { key: 'fx_puff', size: 12 },
} as const;

/** Draws a white disc fading out from its centre once; every scene run shares it. Code tints it. */
function ensureSoftTexture(scene: Scene, name: keyof typeof SOFT): string {
  const { key, size } = SOFT[name];
  if (scene.textures.exists(key)) return key;
  const canvas = scene.textures.createCanvas(key, size, size);
  if (!canvas) throw new Error(`Could not create the ${key} texture`);
  const centre = size / 2;
  const gradient = canvas.context.createRadialGradient(centre, centre, 0, centre, centre, centre);
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(0.35, 'rgba(255,255,255,0.6)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  canvas.context.fillStyle = gradient;
  canvas.context.fillRect(0, 0, size, size);
  canvas.refresh();
  return key;
}

/** The texture of a round, additive glow, drawn in code: the ground glow and the glow at the nozzle exits. */
export function glowTexture(scene: Scene): string {
  return ensureSoftTexture(scene, 'glow');
}

/**
 * The burst of light as the engine lights, at touchdown and at a Crash: the generated flash art
 * (`fx_flash`, 64x64, centred, for an additive blend) once the manifest has it, else the code glow.
 */
export function flashTexture(scene: Scene): string {
  return hasAsset('fx_flash') && scene.textures.exists('fx_flash')
    ? 'fx_flash'
    : glowTexture(scene);
}

/** Slows particles flying sideways, so the blast shoots out fast and spreads to a stop low over the ground. */
class Drag extends GameObjects.Particles.ParticleProcessor {
  private readonly perSecond: number;

  constructor(perSecond: number) {
    super(0, 0, true);
    this.perSecond = perSecond;
  }

  override update(particle: GameObjects.Particles.Particle, _delta: number, step: number): void {
    particle.velocityX *= Math.max(0, 1 - this.perSecond * step);
  }
}

/** Where the dust and smoke rise from: the ground under the Spacecraft. */
export interface GroundSpot {
  readonly x: number;
  readonly y: number;
}

export interface FlightEffects {
  /**
   * The engine's blast on the ground near it, while `on`: dust and smoke kicked up, and blown out
   * sideways both ways along the strip, low and fast.
   */
  readonly ground: (on: boolean, at: GroundSpot) => void;
  /** A trail of sparks from the nozzles firing rearward (their exits in the world) while `on`, taking turns. */
  readonly exhaust: (on: boolean, nozzles: readonly Point[]) => void;
  /**
   * Sparks streaming down in the exhaust of the nozzles firing down (their exits in the world) while
   * `on`, and while `column` a column of smoke left hanging in the air behind the climb.
   */
  readonly downExhaust: (on: boolean, column: boolean, nozzles: readonly Point[]) => void;
  /** A Crash hitting the ground: a heavy burst of dust and smoke thrown out both ways. */
  readonly impact: (at: GroundSpot) => void;
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
 * The playback's particles: dust and smoke kicked up and blasted sideways at Takeoff and Landing, a
 * smoke column behind the climb, sparks in the exhaust, and the burst of a Crash. Pooled emitters
 * made once; frames only switch them on or off and move them, so no emitter or texture is created
 * per frame.
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
  // The blast: out sideways both ways along the strip, low and fast, slowing to a stop as it spreads.
  const sideways = {
    onEmit: (): number => (Math.random() < 0.5 ? 180 : 0) + (Math.random() - 0.5) * 16,
  };
  const blastDust = scene.add.particles(0, 0, ensureTexture(scene, 'dust'), {
    emitting: false,
    frequency: 20,
    quantity: 2,
    lifespan: { min: 450, max: 800 },
    speed: { min: 170, max: 320 },
    angle: sideways,
    gravityY: 70,
    scale: { start: 1.2, end: 0.4 },
    alpha: { start: 0.8, end: 0 },
    maxAliveParticles: 70,
  });
  const blastSmoke = scene.add.particles(0, 0, ensureTexture(scene, 'smoke'), {
    emitting: false,
    frequency: 40,
    quantity: 2,
    lifespan: { min: 1100, max: 1800 },
    speed: { min: 110, max: 230 },
    angle: sideways,
    accelerationY: -8,
    scale: { start: 1, end: 3.2 },
    alpha: { start: 0.55, end: 0 },
    maxAliveParticles: 90,
  });
  const drag = new Drag(2.2);
  blastDust.addParticleProcessor(drag);
  blastSmoke.addParticleProcessor(drag);
  // Sparks falling in the exhaust of the nozzles firing down, and the smoke column the climb leaves.
  const downSparks = scene.add.particles(0, 0, ensureTexture(scene, 'spark'), {
    emitting: false,
    frequency: 30,
    quantity: 1,
    lifespan: { min: 220, max: 420 },
    speed: { min: 150, max: 280 },
    angle: { min: 82, max: 98 },
    tint: paletteNumber('am4'),
    scale: { start: 1, end: 0.2 },
    alpha: { start: 0.95, end: 0 },
    maxAliveParticles: 24,
  });
  const column = scene.add.particles(0, 0, ensureSoftTexture(scene, 'puff'), {
    emitting: false,
    // Dense enough to read as one column even as the climb speeds up.
    frequency: 12,
    quantity: 1,
    lifespan: { min: 1800, max: 2600 },
    speed: { min: 4, max: 14 },
    angle: { min: 0, max: 360 },
    scale: { start: 1.6, end: 4.5 },
    alpha: { start: 0.3, end: 0 },
    tint: paletteNumber('wh2'),
    maxAliveParticles: 200,
  });
  const downExits: Point[] = [];
  let nextDown = 0;
  const fromNextExit = {
    getRandomPoint: (point: Types.Math.Vector2Like): void => {
      const exit = downExits[nextDown % Math.max(downExits.length, 1)];
      nextDown++;
      point.x = exit?.x ?? 0;
      point.y = exit?.y ?? 0;
    },
  };
  downSparks.addEmitZone({ type: 'random', source: fromNextExit });
  column.addEmitZone({ type: 'random', source: fromNextExit });
  const ground = [dust, smoke, blastDust, blastSmoke];
  const all = [dust, smoke, sparks, blastDust, blastSmoke, downSparks, column];
  // Additive, so the exhaust's sparks and smoke read as lit.
  for (const emitter of [downSparks]) emitter.setBlendMode(BlendModes.ADD);
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
    downExhaust: (on, isColumn, nozzles) => {
      const [first] = nozzles;
      downExits.length = 0;
      for (const exit of nozzles) {
        downExits.push({ x: exit.x - (first?.x ?? 0), y: exit.y - (first?.y ?? 0) });
      }
      drive([downSparks], on, first);
      // The column's puffs stay where they were born, hanging in the air as the Spacecraft climbs on.
      column.particleX = first?.x ?? 0;
      column.particleY = first?.y ?? 0;
      drive([column], on && isColumn);
    },
    impact: (at) => {
      blastDust.emitParticleAt(at.x, at.y, 40);
      blastSmoke.emitParticleAt(at.x, at.y, 30);
    },
    setSurface: (color) => {
      for (const emitter of ground) emitter.setParticleTint(paletteNumber(color));
    },
    setScrollFactor: (factor) => {
      for (const emitter of ground) emitter.setScrollFactor(factor);
    },
    setStage: (inSpace) => {
      for (const emitter of [...ground, column, downSparks]) {
        emitter.setVisible(!inSpace);
        if (inSpace) {
          emitter.stop();
          running.delete(emitter);
        }
      }
      if (inSpace) for (const emitter of [...ground, column, downSparks]) emitter.killAll();
    },
    setSpeed: (speed) => {
      for (const emitter of all) emitter.timeScale = speed;
    },
  };
}
