import { describe, expect, it } from 'vitest';
import {
  astronomicalUnits,
  currentBody,
  kilograms,
  listBodies,
  metersPerSecond,
  planHop,
  startRun,
  type BodyId,
  type Run,
} from '../game/sim/index.ts';
import {
  formatDistanceAu,
  formatFuel,
  formatGravity,
  formatMass,
  formatPlanDeltaV,
} from './format.ts';
import { describeHopPlan, LOW_SUCCESS_BELOW } from './hopPlanView.ts';

const mps = metersPerSecond;
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
      formatPlanDeltaV(plan.estimates.takeoff),
      formatPlanDeltaV(plan.estimates.transfer),
      formatPlanDeltaV(plan.estimates.landing),
    ]);
    expect(view.needed).toBe(formatPlanDeltaV(plan.totalEstimate));
    expect(view.available).toBe(formatPlanDeltaV(plan.availableDeltaV));
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

    const heavier = describeHopPlan(heavy, planFor(moon.id, heavy));
    expect(heavy.spacecraft.dryMass).toBeGreaterThan(run.spacecraft.dryMass);
    expect(planFor(moon.id, heavy).availableDeltaV).toBeLessThan(planFor(moon.id).availableDeltaV);
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

  it('gives each Burn a reason drawn from the Bodies involved', () => {
    const far = listBodies(run.starSystem).find((b) => b.name === 'Thakyxy');
    const here = currentBody(run);
    if (!far) throw new Error('seed 123 setup');
    const view = describeHopPlan(run, planFor(far.id));
    const [takeoff, transfer, landing] = view.burns.map((b) => b.reason);
    expect(takeoff).toContain(formatGravity(here.surfaceGravity));
    expect(landing).toContain(formatGravity(far.surfaceGravity));
    expect(transfer).toContain(
      formatDistanceAu(astronomicalUnits(Math.abs(far.distanceFromStar - here.distanceFromStar))),
    );
  });

  it("says a Transfer between Bodies of one planet stays in that planet's pull", () => {
    const view = describeHopPlan(run, planFor(moon.id));
    expect(view.burns[1]?.reason).toBe("stay in one planet's pull");
  });

  it('reads the Transfer as climbing outward or going inward', () => {
    // Seed 5's Home Planet has a planet on each side of it.
    const mid = startRun(5, 'scout');
    const here = currentBody(mid);
    const others = listBodies(mid.starSystem).filter((b) => b.landable && b.id !== here.id);
    const outer = others.find((p) => p.distanceFromStar > here.distanceFromStar);
    const inner = others.find((p) => p.distanceFromStar < here.distanceFromStar);
    if (!outer || !inner) throw new Error('seed 5 needs planets on both sides of home');
    expect(describeHopPlan(mid, planFor(outer.id, mid)).burns[1]?.reason).toMatch(/outward/);
    expect(describeHopPlan(mid, planFor(inner.id, mid)).burns[1]?.reason).toMatch(/inward/);
  });

  it('shows every Δv in the plan in whole m/s', () => {
    const view = describeHopPlan(run, planFor(moon.id));
    for (const text of [...view.burns.map((b) => b.estimate), view.needed, view.available]) {
      expect(text).toMatch(/^[\d,]+ m\/s$/);
    }
    expect(view.available).toBe('22,105 m/s');
  });

  it('shows the Margin as a whole percent of the available Δv, with its sign', () => {
    const plan = planFor(moon.id);
    // Needed 7,000 m/s: +420 is 6%, and a shortfall of 1,400 is 20%.
    const at = (margin: number) =>
      describeHopPlan(run, { ...plan, totalEstimate: mps(7000), margin: mps(margin) }).margin;
    expect(at(420)).toBe('+420 m/s (6%)');
    expect(at(-1400)).toBe('−1,400 m/s (20%)');
  });

  it('gives the same percentage as the why text for a hauler Hop on seed 123 that is short', () => {
    const hauler = startRun(123, 'hauler');
    const viormio = listBodies(hauler.starSystem).find((body) => body.name === 'Viormio');
    if (!viormio) throw new Error('seed 123 has no Viormio');
    expect(describeHopPlan(hauler, planFor(viormio.id, hauler)).margin).toBe('−1,336 m/s (6%)');
  });

  it('drops the percentage once the Margin is as big as the estimate', () => {
    const plan = planFor(moon.id);
    const view = describeHopPlan(run, {
      ...plan,
      totalEstimate: mps(7820),
      margin: mps(7900),
    });
    expect(view.margin).toBe('+7,900 m/s');
  });

  it('warns more strongly when the Fuel cannot cover even the estimate than when the chance is low', () => {
    const plan = planFor(moon.id);
    const low = describeHopPlan(run, { ...plan, margin: mps(100), successChance: 0.5 });
    const short = describeHopPlan(run, { ...plan, margin: mps(-100), successChance: 0.02 });
    expect(low.warning).toBe('Low chance: may run dry');
    expect(short.warning).toBe('Not enough Δv for this Hop');
    expect(short.low).toBe(true);
  });

  it('summarises the plan in one sentence for a screen reader', () => {
    const view = describeHopPlan(run, planFor(moon.id));
    expect(view.summary).toBe(
      `Hop plan for ${moon.name}: needs ${view.needed}, you have ${view.available}, success chance ${view.successChance}.`,
    );
  });
});
