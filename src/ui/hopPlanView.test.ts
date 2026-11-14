import { describe, expect, it } from 'vitest';
import {
  kilograms,
  listBodies,
  planHop,
  startRun,
  type BodyId,
  type Run,
} from '../game/sim/index.ts';
import { formatDeltaV, formatFuel, formatMass } from './format.ts';
import { describeHopPlan, LOW_SUCCESS_BELOW } from './hopPlanView.ts';

const run: Run = startRun(123, 'scout');
const home = run.starSystem.planets.find((p) => p.id === run.starSystem.homePlanetId);
const moon = home?.moons[0];
if (!moon) throw new Error('seed 123 has no Home Planet Moon');

function planFor(id: BodyId, from: Run = run) {
  const result = planHop(from, id);
  if (result.kind !== 'planned') throw new Error('expected a plan');
  return result.plan;
}

describe('the Hop plan as the player reads it', () => {
  it('shows each Burn, the total, the available Δv and the Margin as the simulation planned them', () => {
    const plan = planFor(moon.id);
    const view = describeHopPlan(run, plan);
    expect(view.burns.map((b) => b.label)).toEqual(['Takeoff', 'Transfer', 'Landing']);
    expect(view.burns.map((b) => b.estimate)).toEqual([
      formatDeltaV(plan.estimates.takeoff),
      formatDeltaV(plan.estimates.transfer),
      formatDeltaV(plan.estimates.landing),
    ]);
    expect(view.needed).toBe(formatDeltaV(plan.totalEstimate));
    expect(view.available).toBe(formatDeltaV(plan.availableDeltaV));
    expect(view.margin.startsWith(plan.margin >= 0 ? '+' : '−')).toBe(true);
  });

  it('names the mass and Fuel the available Δv comes from', () => {
    const view = describeHopPlan(run, planFor(moon.id));
    expect(view.availableBasis).toBe(
      `${formatMass(run.spacecraft.dryMass)} craft + ${formatFuel(run.spacecraft.fuelMass)} Fuel`,
    );
  });

  it('shows a heavier Spacecraft with the same Fuel getting less Δv, and says why', () => {
    const heavy: Run = {
      ...run,
      spacecraft: { ...run.spacecraft, dryMass: kilograms(run.spacecraft.dryMass * 2) },
    };
    const light = describeHopPlan(run, planFor(moon.id));
    const heavier = describeHopPlan(heavy, planFor(moon.id, heavy));
    expect(heavier.available).not.toBe(light.available);
    expect(heavier.availableBasis).toContain(formatMass(heavy.spacecraft.dryMass));
    expect(heavier.availableBasis).toContain(formatFuel(run.spacecraft.fuelMass));
  });

  it('flags a low Success Chance in words, and not a high one', () => {
    const chances: number[] = [];
    for (const body of listBodies(run.starSystem)) {
      const result = planHop(run, body.id);
      if (result.kind !== 'planned') continue;
      const view = describeHopPlan(run, result.plan);
      expect(view.low).toBe(result.plan.successChance < LOW_SUCCESS_BELOW);
      expect(view.warning !== undefined).toBe(view.low);
      chances.push(result.plan.successChance);
    }
    expect(Math.min(...chances)).toBeLessThan(Math.max(...chances));
  });

  it('never rounds a chance that is not certain up to 100% or a possible one down to 0%', () => {
    const plan = planFor(moon.id);
    const at = (successChance: number) =>
      describeHopPlan(run, { ...plan, successChance }).successChance;
    expect(at(0.9996)).toBe('>99%');
    expect(at(0.0004)).toBe('<1%');
    expect(at(1)).toBe('100%');
    expect(at(0)).toBe('0%');
    expect(at(0.874)).toBe('87%');
  });
});
