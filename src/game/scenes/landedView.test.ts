import { describe, expect, it } from 'vitest';
import {
  CHASSIS_IDS,
  currentBody,
  findBody,
  firstDetectedBody,
  listBodies,
  startRun,
  type LandableBody,
  type Run,
} from '../sim/index.ts';
import { frameGeometry } from './chassisArt.ts';
import {
  SHIP_PLACEMENT,
  SHIP_SWEEP,
  SHIP_SWEEP_X,
  SKY_VISIBLE,
  SPRITE_SIZE,
  horizonY,
  skyBodies,
  surfaceKind,
} from './landedView.ts';

/** A New Run with the default Chassis, as the player starts it, knowing only the opening. */
const freshRun = (seed: number): Run => startRun(seed, 'scout');

/**
 * A New Run with the default Chassis stood on its innermost planet (always rocky), knowing every
 * Body: the sky's placement rules do not depend on which Chassis, and a full sky tests them hardest.
 * This is the sky Runs opened on before the Starting Moon (#96).
 */
const newRun = (seed: number): Run => {
  const run = freshRun(seed);
  const ids = listBodies(run.starSystem).map((body) => body.id);
  const [inner] = run.starSystem.planets;
  if (!inner) throw new Error('A Star System has planets');
  return {
    ...run,
    status: { kind: 'landed', bodyId: inner.id },
    knowledge: { detected: ids, surveyed: ids, heliopauseFound: true },
  };
};

/** A New Run stood on the first Body Comms Detected, as if it had Hopped there. */
function runOnFirstTarget(seed: number): Run {
  const run = freshRun(seed);
  return { ...run, status: { kind: 'landed', bodyId: firstDetectedBody(run.starSystem).id } };
}

describe('the Landed surface', () => {
  const bodies = (run: Run): LandableBody[] =>
    listBodies(run.starSystem).filter((b): b is LandableBody => b.landable);

  it('gives an Icy Body the Icy ground and a Rocky Planet the Rocky ground', () => {
    for (let seed = 1; seed <= 40; seed++) {
      for (const body of bodies(newRun(seed))) {
        if (body.composition === 'icy') expect(surfaceKind(body)).toBe('icy');
        else if (body.kind === 'rocky-planet') expect(surfaceKind(body)).toBe('rocky');
      }
    }
  });

  it('keeps the grey Moon ground for Rocky Moons only', () => {
    let rockyMoons = 0;
    for (let seed = 1; seed <= 40; seed++) {
      for (const body of bodies(newRun(seed))) {
        if (body.kind === 'moon' && body.composition === 'rocky') {
          rockyMoons++;
          expect(surfaceKind(body)).toBe('moon');
        }
      }
    }
    expect(rockyMoons).toBeGreaterThan(0);
  });

  it('never draws an Icy label on a non-Icy ground, or a Rocky label on the Icy ground', () => {
    for (let seed = 1; seed <= 40; seed++) {
      for (const body of bodies(newRun(seed))) {
        expect(surfaceKind(body) === 'icy').toBe(body.composition === 'icy');
      }
    }
  });
});

describe('the Landed sky', () => {
  it('shows the star and is the same for the same seed', () => {
    const a = skyBodies(newRun(11));
    expect(a).toEqual(skyBodies(newRun(11)));
    expect(a.some((s) => s.kind === 'star')).toBe(true);
  });

  it('never shows the Body the Spacecraft stands on', () => {
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const run = newRun(seed);
      const here = currentBody(run).id;
      expect(skyBodies(run).every((s) => s.bodyId !== here)).toBe(true);
    }
  });

  it('shows only Bodies that exist in the Star System', () => {
    for (const seed of [1, 2, 3]) {
      const run = newRun(seed);
      for (const sky of skyBodies(run)) {
        if (sky.bodyId !== undefined) expect(findBody(run.starSystem, sky.bodyId)).toBeDefined();
        expect(sky.scale).toBeGreaterThanOrEqual(1);
      }
    }
  });

  it('keeps every sky Body inside the part of the sky the first screen shows', () => {
    for (let seed = 1; seed <= 100; seed++) {
      for (const sky of skyBodies(newRun(seed))) {
        expect(sky.x).toBeGreaterThanOrEqual(SKY_VISIBLE.left);
        expect(sky.x).toBeLessThanOrEqual(SKY_VISIBLE.right);
      }
    }
  });

  it('from the Starting Moon, the first Detected Body is in view on the first screen (seeds 1 to 300)', () => {
    for (let seed = 1; seed <= 300; seed++) {
      const run = freshRun(seed);
      const target = skyBodies(run).find((s) => s.bodyId === firstDetectedBody(run.starSystem).id);
      expect(target, `seed ${seed}`).toBeDefined();
    }
  });

  it('shows the Starting Moon from the first target', () => {
    const run = newRun(7);
    expect(
      skyBodies(runOnFirstTarget(7)).some((s) => s.bodyId === run.starSystem.startingMoonId),
    ).toBe(true);
  });

  it('shows only the Bodies the player knows of (#96)', () => {
    for (let seed = 1; seed <= 100; seed++) {
      const run = freshRun(seed);
      for (const sky of skyBodies(run)) {
        if (sky.bodyId !== undefined) expect(run.knowledge.detected).toContain(sky.bodyId);
      }
    }
  });

  it('draws farther Bodies first so nearer ones sit in front of them', () => {
    for (let seed = 1; seed <= 100; seed++) {
      const distances = skyBodies(newRun(seed)).map((s) => s.distanceAu);
      expect(distances).toEqual([...distances].sort((a, b) => b - a));
    }
  });

  it('gives a Body the same sprite whether seen from the Home Planet or from its Moon', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const fromMoon = skyBodies(runOnFirstTarget(seed));
      for (const a of skyBodies(newRun(seed))) {
        const b = fromMoon.find((s) => s.bodyId === a.bodyId);
        if (a.bodyId !== undefined && b) expect(b.sprite).toBe(a.sprite);
      }
    }
  });

  it('a Moon whose planet is in the sky sits beside it, never over it', () => {
    let checked = 0;
    for (let seed = 1; seed <= 200; seed++) {
      const run = newRun(seed);
      const sky = skyBodies(run);
      for (const moon of sky.filter((s) => s.kind === 'moon')) {
        if (moon.bodyId === undefined) throw new Error('sky Moon has no Body');
        const body = findBody(run.starSystem, moon.bodyId);
        if (body?.kind !== 'moon') throw new Error('sky Moon is not a Moon');
        const planet = sky.find((s) => s.bodyId === body.planetId);
        if (!planet) continue;
        checked++;
        const half = (s: (typeof sky)[number]) => (SPRITE_SIZE[s.kind] * s.scale) / 2;
        const apart = Math.hypot(moon.x - planet.x, moon.y - planet.y);
        expect(apart, `seed ${seed}`).toBeGreaterThanOrEqual(half(moon) + half(planet));
        // Moons fan out sideways, so "beside" bounds the sideways distance: a Moon at the end of its
        // fan may also sit a pixel or two higher or lower (#188 seed 191: 48 px across, 1 px down).
        expect(Math.abs(moon.x - planet.x), `seed ${seed}`).toBeLessThanOrEqual(
          half(moon) + half(planet) + 2 * 2 * half(moon) + 6,
        );
      }
    }
    expect(checked).toBeGreaterThan(100);
  });

  it('keeps planets above the horizon the art draws, and below the top bar', () => {
    for (let seed = 1; seed <= 200; seed++) {
      for (const s of skyBodies(newRun(seed))) {
        if (s.kind === 'star' || s.kind === 'moon' || s.scale > 2) continue;
        const half = (SPRITE_SIZE[s.kind] * s.scale) / 2;
        expect(s.y + half, `seed ${seed}`).toBeLessThanOrEqual(horizonY(s.x));
        expect(s.y - half).toBeGreaterThanOrEqual(46);
      }
    }
  });
});

describe('the Landed sky layout', () => {
  type Sky = ReturnType<typeof skyBodies>;
  const half = (s: Sky[number]) => (SPRITE_SIZE[s.kind] * s.scale) / 2;
  const apart = (a: Sky[number], b: Sky[number]) => Math.hypot(a.x - b.x, a.y - b.y);
  const planetOfMoon = (run: Run, s: Sky[number]) => {
    if (s.bodyId === undefined) return undefined;
    const body = findBody(run.starSystem, s.bodyId);
    return body?.kind === 'moon' ? body.planetId : undefined;
  };
  /** Every sky Body paired with every other one that is not the star. */
  function pairs(sky: Sky) {
    const bodies = sky.filter((s) => s.kind !== 'star');
    return bodies.flatMap((a, i) => bodies.slice(i + 1).map((b) => [a, b] as const));
  }

  it('never lets two planets overlap, so none hides behind another', () => {
    for (let seed = 1; seed <= 500; seed++) {
      const sky = skyBodies(newRun(seed));
      for (const [a, b] of pairs(sky)) {
        if (a.kind === 'moon' || b.kind === 'moon') continue;
        expect(apart(a, b), `seed ${seed}`).toBeGreaterThanOrEqual(half(a) + half(b));
      }
    }
  });

  // Re-pinned for #188: generation changed, and a Home Planet's sky no longer shows a Gas Giant.
  // From a Gas Giant's Moon on seed 1, its planet's bearing puts it on a rocky planet near the star.
  it("seed 1, from a Gas Giant's Moon: the Gas Giant no longer sits on the rocky planet", () => {
    const run = newRun(1);
    const moonId = listBodies(run.starSystem).find((b) => b.id === 'planet-5-moon-1')?.id;
    if (!moonId) throw new Error('seed 1 has no planet-5-moon-1');
    const sky = skyBodies({ ...run, status: { kind: 'landed', bodyId: moonId } });
    const gas = sky.find((s) => s.kind === 'gas-giant');
    const rocky = sky.find((s) => s.kind === 'rocky-planet');
    if (!gas || !rocky) throw new Error('this sky should show a Gas Giant and a rocky planet');
    expect(apart(gas, rocky)).toBeGreaterThanOrEqual(half(gas) + half(rocky));
  });

  it('fans sibling Moons of a planet that is not in the sky out by at least a sprite width', () => {
    let checked = 0;
    for (let seed = 1; seed <= 500; seed++) {
      const run = newRun(seed);
      const sky = skyBodies(run);
      const orphans = sky.filter(
        (s) =>
          s.kind === 'moon' &&
          !sky.some((p) => p.bodyId !== undefined && p.bodyId === planetOfMoon(run, s)),
      );
      for (const [a, b] of pairs(orphans)) {
        if (planetOfMoon(run, a) !== planetOfMoon(run, b)) continue;
        checked++;
        expect(apart(a, b), `seed ${seed}`).toBeGreaterThanOrEqual(
          Math.max(SPRITE_SIZE.moon * a.scale, SPRITE_SIZE.moon * b.scale),
        );
      }
    }
    expect(checked).toBeGreaterThan(10);
  });

  it('never draws a Moon on a planet other than its own', () => {
    for (let seed = 1; seed <= 500; seed++) {
      const run = newRun(seed);
      const sky = skyBodies(run);
      for (const moon of sky.filter((s) => s.kind === 'moon')) {
        for (const planet of sky.filter((s) => s.kind !== 'star' && s.kind !== 'moon')) {
          expect(apart(moon, planet), `seed ${seed}`).toBeGreaterThanOrEqual(
            half(moon) + half(planet),
          );
        }
      }
    }
  });

  it('keeps the Moons of a planet hidden behind the star out of the sky', () => {
    let hiddenPlanets = 0;
    for (let seed = 1; seed <= 500; seed++) {
      const run = newRun(seed);
      const sky = skyBodies(run);
      const star = sky.find((s) => s.kind === 'star');
      if (!star) throw new Error('no star');
      for (const planet of sky.filter((s) => s.kind === 'rocky-planet' || s.kind === 'gas-giant')) {
        if (planet.distanceAu <= star.distanceAu) continue;
        if (apart(planet, star) + half(planet) > half(star)) continue;
        hiddenPlanets++;
        expect(
          sky.some((s) => planetOfMoon(run, s) === planet.bodyId),
          `seed ${seed}`,
        ).toBe(false);
      }
    }
    expect(hiddenPlanets).toBeGreaterThan(10);
  });

  it('keeps every sky Body above the art horizon and below the top bar, Moons included', () => {
    for (let seed = 1; seed <= 300; seed++) {
      for (const s of skyBodies(newRun(seed))) {
        if (s.kind === 'star') continue;
        expect(s.y + half(s), `seed ${seed}`).toBeLessThanOrEqual(horizonY(s.x));
        expect(s.y - half(s)).toBeGreaterThanOrEqual(46);
      }
      // From the Starting Moon its planet can hang huge and near (4x): too tall for both, the top
      // bar wins and it may dip a pixel or two behind the hills (#192 reworks this sky).
      for (const s of skyBodies(freshRun(seed))) {
        if (s.kind === 'star') continue;
        if (s.scale <= 2) expect(s.y + half(s), `seed ${seed}`).toBeLessThanOrEqual(horizonY(s.x));
        expect(s.y - half(s)).toBeGreaterThanOrEqual(46);
      }
    }
  });

  it("keeps the first target in the Starting Moon's sky and the Starting Moon in the first target's (seeds 1 to 300)", () => {
    for (let seed = 1; seed <= 300; seed++) {
      const run = freshRun(seed);
      expect(
        skyBodies(run).some((s) => s.bodyId === firstDetectedBody(run.starSystem).id),
        `seed ${seed}`,
      ).toBe(true);
      expect(
        skyBodies(runOnFirstTarget(seed)).some((s) => s.bodyId === run.starSystem.startingMoonId),
        `seed ${seed} from the first target`,
      ).toBe(true);
    }
  });
});

describe('the Spacecraft sweep', () => {
  it('covers every Chassis, whole, at both ends of the ground drift', () => {
    for (const id of CHASSIS_IDS) {
      for (const frame of ['landed', 'landed_lit'] as const) {
        const { width, pivot } = frameGeometry(id, frame);
        expect(SHIP_SWEEP.left).toBeLessThanOrEqual(SHIP_SWEEP_X.min - pivot.x);
        expect(SHIP_SWEEP.right).toBeGreaterThanOrEqual(SHIP_SWEEP_X.max + (width - pivot.x));
        expect(SHIP_SWEEP.top).toBeLessThanOrEqual(SHIP_PLACEMENT.baseY - pivot.y);
      }
    }
  });

  it('reaches from the top of the tallest ship down to the shadow under it', () => {
    expect(SHIP_SWEEP.bottom).toBeGreaterThan(SHIP_PLACEMENT.baseY);
    expect(SHIP_SWEEP.bottom).toBeLessThan(SHIP_PLACEMENT.baseY + 12);
    expect(SHIP_SWEEP.top).toBeLessThan(SHIP_PLACEMENT.baseY - 120);
  });
});
