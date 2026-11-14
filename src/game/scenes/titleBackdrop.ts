import { BlendModes, type GameObjects, type Scene, type Tweens } from 'phaser';
import { paletteNumber } from '../../ui/kit/palette.ts';
import { generateStars, starLayer } from './starfield.ts';
import {
  flybyLane,
  nextFlybyDelayMs,
  orbitPose,
  prefersReducedMotion,
  type Orbit,
  type OrbitPose,
} from './titleMotion.ts';

const STAR_COUNT = 140;
const STARFIELD_SEED = 1977; // Voyager launch year: same sky on every load.
const LAYER_COUNT = 3;
/** Milliseconds for a layer to drift one screen width: the nearest layer is the fastest. */
const LAYER_DRIFT_MS: readonly number[] = [320_000, 200_000, 120_000];
const TWINKLE_EVERY = 14;

const PLANET_HOME = { x: 560, y: 372 };
const ORBIT_MS = 150_000;
const ORBIT_START = Math.PI; // The moon starts at its familiar spot, up and left of the planet.
const FLYBY_MS = 16_000;
const FLYBY_MARGIN = 30;

const Depth = { Stars: 0, Star: 1, MoonBehind: 2, Planet: 3, MoonFront: 4, Flyby: 5 } as const;

export interface TitleBackdrop {
  /** True when the player prefers reduced motion: the sky is the same composition, held still. */
  readonly reducedMotion: boolean;
  /** Stops every tween and timer the backdrop started. Safe to call twice. */
  readonly dispose: () => void;
}

/** Draws the living title sky: parallax stars, the star's glow, the moon orbiting the gas giant, and Spacecraft fly-bys. */
export function createTitleBackdrop(scene: Scene): TitleBackdrop {
  const reducedMotion = prefersReducedMotion();
  const area = { width: scene.scale.width, height: scene.scale.height };
  const tweens: Tweens.Tween[] = [];
  let stopFlybys = (): void => undefined;

  addParallaxStarfield(scene, area, reducedMotion, tweens);

  const star = scene.add.image(84, 64, 'body_star').setDepth(Depth.Star);
  const planet = scene.add
    .image(PLANET_HOME.x, PLANET_HOME.y, 'body_gas_1')
    .setScale(5)
    .setDepth(Depth.Planet);
  const moon = scene.add.image(0, 0, 'body_moon_2');
  const orbit: Orbit = { cx: planet.x, cy: planet.y, rx: 170, ry: 52, tilt: 0.62 };
  const pose: OrbitPose = { x: 0, y: 0, behind: false, scale: 1 };
  const placeMoon = (phase: number): void => {
    orbit.cx = planet.x;
    orbit.cy = planet.y;
    orbitPose(orbit, phase, pose);
    moon
      .setPosition(pose.x, pose.y)
      .setScale(2 * pose.scale)
      .setDepth(pose.behind ? Depth.MoonBehind : Depth.MoonFront);
  };
  placeMoon(ORBIT_START);

  if (!reducedMotion) {
    // The star's glow: a faint additive copy that swells and fades.
    const glow = scene.add
      .image(star.x, star.y, 'body_star')
      .setScale(1.25)
      .setAlpha(0)
      .setBlendMode(BlendModes.ADD)
      .setDepth(Depth.Star);
    tweens.push(
      scene.tweens.add({
        targets: glow,
        alpha: 0.28,
        duration: 5200,
        ease: 'Sine.easeInOut',
        yoyo: true,
        repeat: -1,
      }),
      // The gas giant creeps a couple of pixels, the moon's orbit with it.
      scene.tweens.add({
        targets: planet,
        x: PLANET_HOME.x - 3,
        y: PLANET_HOME.y - 3,
        duration: 11_000,
        ease: 'Sine.easeInOut',
        yoyo: true,
        repeat: -1,
      }),
    );
    const clock = { phase: ORBIT_START };
    tweens.push(
      scene.tweens.add({
        targets: clock,
        phase: ORBIT_START + 2 * Math.PI,
        duration: ORBIT_MS,
        ease: 'Linear',
        repeat: -1,
        onUpdate: () => {
          placeMoon(clock.phase);
        },
      }),
    );
    stopFlybys = scheduleFlybys(scene, tweens);
  }

  let disposed = false;
  return {
    reducedMotion,
    dispose: () => {
      if (disposed) return;
      disposed = true;
      stopFlybys();
      for (const tween of tweens) tween.remove();
      tweens.length = 0;
    },
  };
}

/** Stars in depth layers that drift left at different speeds. Each layer is drawn twice, side by side, and slides one screen width, so it wraps without a seam. */
function addParallaxStarfield(
  scene: Scene,
  area: { width: number; height: number },
  reducedMotion: boolean,
  tweens: Tweens.Tween[],
): void {
  const stars = generateStars(STARFIELD_SEED, STAR_COUNT, area);
  const layers: GameObjects.Container[] = [];
  const bodies: GameObjects.Graphics[] = [];
  for (let layer = 0; layer < LAYER_COUNT; layer++) {
    const body = scene.add.graphics();
    bodies.push(body);
    layers.push(scene.add.container(0, 0, [body]).setDepth(Depth.Stars));
  }
  stars.forEach((star, index) => {
    const layerIndex = starLayer(star, LAYER_COUNT);
    const layer = layers[layerIndex];
    const body = bodies[layerIndex];
    if (!layer || !body) return;
    const twinkles = star.size === 1 && index % TWINKLE_EVERY === 0 && !reducedMotion;
    // A twinkler is its own object so its alpha can pulse; the rest share the layer's Graphics.
    const target = twinkles ? scene.add.graphics() : body;
    if (twinkles) layer.add(target);
    target.fillStyle(paletteNumber(star.color), star.alpha);
    target.fillRect(star.x, star.y, star.size, star.size);
    target.fillRect(star.x + area.width, star.y, star.size, star.size);
    if (twinkles) {
      tweens.push(
        scene.tweens.add({
          targets: target,
          alpha: 0.15,
          duration: 1400 + (index % 7) * 300,
          delay: (index % 11) * 400,
          ease: 'Sine.easeInOut',
          yoyo: true,
          repeat: -1,
        }),
      );
    }
  });
  if (reducedMotion) return;
  layers.forEach((layer, index) => {
    tweens.push(
      scene.tweens.add({
        targets: layer,
        x: -area.width,
        duration: LAYER_DRIFT_MS[index] ?? LAYER_DRIFT_MS[0],
        ease: 'Linear',
        repeat: -1,
      }),
    );
  });
}

/** One Spacecraft that crosses the sky now and then, always in a lane clear of the menu. Returns a function that stops them. */
function scheduleFlybys(scene: Scene, tweens: Tweens.Tween[]): () => void {
  const ship = scene.add.image(0, 0, 'spacecraft').setScale(2);
  const flame = scene.add.image(-11, 0, 'spacecraft_flame').setScale(2);
  const flyby = scene.add.container(0, 0, [flame, ship]).setDepth(Depth.Flyby).setVisible(false);
  tweens.push(
    scene.tweens.add({
      targets: flame,
      scaleX: 1.4,
      alpha: 0.7,
      duration: 120,
      yoyo: true,
      repeat: -1,
    }),
  );

  let timer: ReturnType<Scene['time']['delayedCall']> | undefined;
  let crossing: Tweens.Tween | undefined;
  const wait = (): void => {
    timer = scene.time.delayedCall(nextFlybyDelayMs(Math.random), launch);
  };
  const launch = (): void => {
    const leftToRight = Math.random() < 0.5;
    const width = scene.scale.width;
    flyby
      .setPosition(leftToRight ? -FLYBY_MARGIN : width + FLYBY_MARGIN, flybyLane(Math.random))
      .setScale(leftToRight ? 1 : -1, 1)
      .setVisible(true);
    crossing = scene.tweens.add({
      targets: flyby,
      x: leftToRight ? width + FLYBY_MARGIN : -FLYBY_MARGIN,
      duration: FLYBY_MS,
      ease: 'Linear',
      onComplete: () => {
        flyby.setVisible(false);
        wait();
      },
    });
  };
  wait();
  return () => {
    timer?.remove();
    crossing?.remove();
  };
}
