import { describe, expect, it } from 'vitest';
import { CHASSIS_IDS } from '../sim/index.ts';
import {
  FLIGHT_ANGLE,
  frameGeometry,
  nozzleExits,
  nozzles,
  standingExtent,
  turn,
  type ShipPose,
} from './chassisArt.ts';

const POSES: readonly ShipPose[] = ['standing', 'flight'];

describe.each(CHASSIS_IDS)('the %s nozzle data', (id) => {
  it.each(POSES)('lists every exit of the %s pose inside its frame', (pose) => {
    const { width, height, pivot } = frameGeometry(id, pose === 'standing' ? 'landed' : 'flight');
    const exits = nozzleExits(id, pose);
    expect(exits.length).toBeGreaterThanOrEqual(3);
    for (const exit of exits) {
      expect(pivot.x + exit.x).toBeGreaterThan(0);
      expect(pivot.x + exit.x).toBeLessThan(width);
      expect(pivot.y + exit.y).toBeGreaterThan(0);
      expect(pivot.y + exit.y).toBeLessThanOrEqual(height);
    }
  });

  it('lists the same number of nozzle exits standing and in flight', () => {
    expect(nozzleExits(id, 'flight')).toHaveLength(nozzleExits(id, 'standing').length);
  });

  it('turns the standing exits into the flight exits by the flight angle', () => {
    const standing = nozzleExits(id, 'standing');
    nozzleExits(id, 'flight').forEach((exit, i) => {
      const expected = turn(standing[i] ?? { x: NaN, y: NaN }, FLIGHT_ANGLE);
      expect(exit.x).toBeCloseTo(expected.x, 1);
      expect(exit.y).toBeCloseTo(expected.y, 1);
    });
  });

  it.each(POSES)('lists every %s nozzle once, with its kind, in the order of its exits', (pose) => {
    expect(nozzles(id, pose).map((nozzle) => nozzle.exit)).toEqual(nozzleExits(id, pose));
  });

  it('puts the flight frame origin at the base centre, so the turn swaps frames unseen', () => {
    const standing = frameGeometry(id, 'landed');
    expect(standing.pivot).toEqual({ x: standing.width / 2, y: standing.height });
    const flight = frameGeometry(id, 'flight');
    expect(flight.pivot.x).toBeGreaterThan(0);
    expect(flight.pivot.x).toBeLessThan(flight.width);
    expect(flight.pivot.y).toBeGreaterThan(0);
    expect(flight.pivot.y).toBeLessThan(flight.height);
  });
});

// From spec #134's table: Herald Mk II (Nacelles, Cluster), Bastion (Quad boosters, Cluster), Lancer (Nacelles, Twin).
describe.each([
  { id: 'scout', side: 2, main: 3 },
  { id: 'hauler', side: 4, main: 3 },
  { id: 'lancer', side: 2, main: 2 },
] as const)('the $id propulsors', ({ id, side, main }) => {
  it.each(POSES)('fire from every side propulsor and main engine nozzle in the %s pose', (pose) => {
    const kinds = nozzles(id, pose).map((nozzle) => nozzle.kind);
    expect(kinds.filter((kind) => kind === 'side')).toHaveLength(side);
    expect(kinds.filter((kind) => kind === 'main')).toHaveLength(main);
  });

  it('has side propulsors either side of the main engine', () => {
    const standing = nozzles(id, 'standing');
    const sideX = standing.filter((n) => n.kind === 'side').map((n) => n.exit.x);
    const mainX = standing.filter((n) => n.kind === 'main').map((n) => n.exit.x);
    expect(Math.min(...sideX)).toBeLessThan(Math.min(...mainX));
    expect(Math.max(...sideX)).toBeGreaterThan(Math.max(...mainX));
  });
});

describe('turn', () => {
  it('turns a point clockwise on the screen: straight down at 66 degrees points down and to the left', () => {
    const at = turn({ x: 0, y: 1 }, 66);
    expect(at.x).toBeLessThan(0);
    expect(at.y).toBeGreaterThan(0);
    expect(turn({ x: 0, y: -1 }, 90).x).toBeCloseTo(1);
  });
});

describe('the standing Spacecraft extent', () => {
  it('is the widest and tallest standing frame of the Chassis', () => {
    const extent = standingExtent(CHASSIS_IDS);
    for (const id of CHASSIS_IDS) {
      const { width, height } = frameGeometry(id, 'landed');
      expect(width / 2).toBeLessThanOrEqual(extent.halfWidth);
      expect(height).toBeLessThanOrEqual(extent.height);
    }
    // The upright ships are taller than the old 96x64 landers.
    expect(extent.height).toBeGreaterThan(100);
  });
});
