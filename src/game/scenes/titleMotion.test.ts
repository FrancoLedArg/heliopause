import { describe, expect, it } from 'vitest';
import { generateStars, starLayer } from './starfield.ts';
import {
  FLYBY_LANES,
  FLYBY_MAX_MS,
  FLYBY_MIN_MS,
  flybyLane,
  nextFlybyDelayMs,
  orbitPose,
  type Orbit,
} from './titleMotion.ts';

const flat: Orbit = { cx: 100, cy: 50, rx: 40, ry: 10, tilt: 0 };

describe('orbitPose', () => {
  it('starts at the right-hand end of an untilted orbit', () => {
    const pose = orbitPose(flat, 0);
    expect(pose.x).toBeCloseTo(140);
    expect(pose.y).toBeCloseTo(50);
  });

  it('is on the far half, behind the planet, when it passes above the centre of the orbit', () => {
    const pose = orbitPose(flat, -Math.PI / 2);
    expect(pose.behind).toBe(true);
    expect(pose.x).toBeCloseTo(100);
    expect(pose.y).toBeCloseTo(40);
  });

  it('is on the near half, in front of the planet, when it passes below the centre', () => {
    const pose = orbitPose(flat, Math.PI / 2);
    expect(pose.behind).toBe(false);
    expect(pose.y).toBeCloseTo(60);
  });

  it('looks bigger in front of the planet than behind it', () => {
    expect(orbitPose(flat, Math.PI / 2).scale).toBeGreaterThan(orbitPose(flat, -Math.PI / 2).scale);
  });

  it('turns the whole ellipse by the tilt', () => {
    const pose = orbitPose({ ...flat, tilt: Math.PI / 2 }, 0);
    expect(pose.x).toBeCloseTo(100);
    expect(pose.y).toBeCloseTo(90);
  });

  it('returns to the same spot after a full turn', () => {
    const a = orbitPose(flat, 0.7);
    const b = orbitPose(flat, 0.7 + 2 * Math.PI);
    expect(b.x).toBeCloseTo(a.x);
    expect(b.y).toBeCloseTo(a.y);
  });
});

describe('fly-by scheduling', () => {
  it('waits between 20 and 40 seconds', () => {
    expect(nextFlybyDelayMs(() => 0)).toBe(FLYBY_MIN_MS);
    expect(nextFlybyDelayMs(() => 0.5)).toBe(30_000);
    expect(nextFlybyDelayMs(() => 0.999999)).toBeLessThanOrEqual(FLYBY_MAX_MS);
  });

  it('never flies through the logo, tagline or New Run panel', () => {
    for (let i = 0; i < FLYBY_LANES.length; i++) {
      const y = flybyLane(() => i / FLYBY_LANES.length);
      const clearOfMenu = y + 16 < 72 || y > 240;
      expect(clearOfMenu).toBe(true);
    }
  });
});

describe('the starfield depth layers', () => {
  const area = { width: 640, height: 360 };

  it('makes the same sky for the same seed', () => {
    expect(generateStars(1977, 140, area)).toEqual(generateStars(1977, 140, area));
  });

  it('keeps every star on screen', () => {
    for (const star of generateStars(1977, 140, area)) {
      expect(star.x).toBeGreaterThanOrEqual(0);
      expect(star.x).toBeLessThan(640);
      expect(star.y).toBeGreaterThanOrEqual(0);
      expect(star.y).toBeLessThan(360);
    }
  });

  it('puts dim stars in the far layer and bright stars in the near one', () => {
    const dim = { x: 0, y: 0, size: 1, color: 'wh1', alpha: 0.5 } as const;
    expect(starLayer(dim, 3)).toBe(0);
    expect(starLayer({ ...dim, alpha: 1 }, 3)).toBe(2);
  });

  it('fills all three layers from the title seed', () => {
    const layers = new Set(generateStars(1977, 140, area).map((s) => starLayer(s, 3)));
    expect([...layers].sort()).toEqual([0, 1, 2]);
  });
});
