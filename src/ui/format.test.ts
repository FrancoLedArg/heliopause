import { describe, expect, it } from 'vitest';
import type {
  AstronomicalUnits,
  Kilograms,
  MetersPerSecond,
  MetersPerSecondSquared,
} from '../game/sim/index.ts';
import { CHASSIS_IDS, homePlanet, listBodies, startRun } from '../game/sim/index.ts';
import {
  bodyTypeLabel,
  formatDeltaV,
  formatDistanceAu,
  formatFuel,
  formatGravity,
  formatMass,
} from './format.ts';

// Test fixtures: casts build the branded quantities the simulation would produce.
const g = (v: number) => v as MetersPerSecondSquared;
const au = (v: number) => v as AstronomicalUnits;
const kg = (v: number) => v as Kilograms;
const dv = (v: number) => v as MetersPerSecond;

describe('numbers shown to the player', () => {
  it('shows gravity in m/s² to one decimal', () => {
    expect(formatGravity(g(3.7))).toBe('3.7 m/s²');
    expect(formatGravity(g(0.1134))).toBe('0.1 m/s²');
  });

  it('shows distance from the star in AU', () => {
    expect(formatDistanceAu(au(0.3912))).toBe('0.39 AU');
    expect(formatDistanceAu(au(30.2))).toBe('30.2 AU');
  });

  it('shows Fuel in tonnes', () => {
    expect(formatFuel(kg(8000))).toBe('8.0 t');
    expect(formatFuel(kg(12_340))).toBe('12.3 t');
  });

  it('shows a mass in tonnes', () => {
    expect(formatMass(kg(4000))).toBe('4.0 t');
    expect(formatMass(kg(15_000))).toBe('15.0 t');
  });

  it('shows Δv in m/s, switching to km/s when large, and a dash when unknown', () => {
    expect(formatDeltaV(dv(5050))).toBe('5,050 m/s');
    expect(formatDeltaV(dv(320.4))).toBe('320 m/s');
    expect(formatDeltaV(dv(12_500))).toBe('12.5 km/s');
    expect(formatDeltaV(undefined)).toBe('—');
  });
});

describe('Body type label', () => {
  const run = startRun(123, CHASSIS_IDS[0]);
  const bodies = listBodies(run.starSystem);

  it('says Icy or Rocky for every landable Body, as text', () => {
    const home = homePlanet(run.starSystem);
    expect(bodyTypeLabel(run, home)).toBe('Home Planet · Rocky');
    expect(bodyTypeLabel(run, home.moons[0] ?? home)).toBe(`Icy Moon of ${home.name}`);
    for (const body of bodies) {
      if (!body.landable || body.id === home.id) continue;
      const word = body.composition === 'icy' ? 'Icy' : 'Rocky';
      expect(bodyTypeLabel(run, body)).toMatch(new RegExp(`^${word} (planet|Moon of )`));
    }
  });

  it('names a Gas Giant without a resource type', () => {
    for (const body of bodies.filter((b) => b.kind === 'gas-giant')) {
      expect(bodyTypeLabel(run, body)).toBe('Gas Giant');
    }
  });
});
