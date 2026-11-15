/** A point, in pixels. */
interface Spot {
  readonly x: number;
  readonly y: number;
}

/**
 * Where to put a game object whose scroll factor is `factor`, so that it shows at the same place on
 * screen as the world point `world` does under a camera scrolled to `scroll`. With a factor of 1 that
 * is `world` itself. The Takeoff's dust and smoke use a smaller factor, so they fall away slower than
 * the ground and stay on screen after the camera has climbed, yet still start at the ground's edge.
 */
export function anchorFx(world: Spot, scroll: Spot, factor: number): Spot {
  return {
    x: world.x - (1 - factor) * scroll.x,
    y: world.y - (1 - factor) * scroll.y,
  };
}
