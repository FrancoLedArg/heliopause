import { describe, expect, it } from 'vitest';
import type {
  AstronomicalUnits,
  Kilograms,
  MetersPerSecond,
  MetersPerSecondSquared,
} from '../game/sim/index.ts';
import {
  CHASSIS_IDS,
  listBodies,
  startRun,
  type Moon,
  type RockyPlanet,
} from '../game/sim/index.ts';
import {
  bodyCompositionLabel,
  bodyFullLabel,
  bodyStatusLabel,
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
  // The innermost planet is always rocky, with two Moons.
  const home = run.starSystem.planets[0] as RockyPlanet;
  const icyMoon = bodies.find((b): b is Moon => b.kind === 'moon' && b.composition === 'icy');
  if (!icyMoon) throw new Error('seed 123 has an Icy Moon');
  const planetOfIcy = bodies.find((b) => b.id === icyMoon.planetId);

  it('names the kind only, never the composition', () => {
    expect(bodyTypeLabel(run, home)).toBe('Planet');
    const moon = home.moons[0];
    if (!moon) throw new Error('seed 123 has a Moon of its innermost planet');
    expect(bodyTypeLabel(run, moon)).toBe(`Moon of ${home.name}`);
    for (const body of bodies) {
      if (body.kind === 'rocky-planet') expect(bodyTypeLabel(run, body)).toBe('Planet');
    }
  });

  it('says Icy or Rocky as a separate word for every landable Body', () => {
    for (const body of bodies) {
      if (!body.landable) continue;
      expect(bodyCompositionLabel(body)).toBe(body.composition === 'icy' ? 'Icy' : 'Rocky');
    }
    expect(bodyFullLabel(run, icyMoon)).toBe(`Moon of ${planetOfIcy?.name ?? '?'} · Icy`);
  });

  it('puts Depleted in the place of Icy or Rocky in the status label, leaving the full label alone', () => {
    const moon = icyMoon;
    const fresh = { ...run, depleted: [] };
    const used = { ...run, depleted: [moon.id] };
    expect(bodyStatusLabel(fresh, moon)).toBe('Icy');
    expect(bodyStatusLabel(used, moon)).toBe('Depleted');
    expect(bodyFullLabel(used, moon)).toBe(`Moon of ${planetOfIcy?.name ?? '?'} · Icy`);
  });

  it('gives a Gas Giant no composition', () => {
    for (const body of bodies.filter((b) => b.kind === 'gas-giant')) {
      expect(bodyCompositionLabel(body)).toBeUndefined();
      expect(bodyFullLabel(run, body)).toBe('Gas Giant');
    }
  });
});
