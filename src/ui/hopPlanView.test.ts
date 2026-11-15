import { describe, expect, it } from 'vitest';
import {
  astronomicalUnits,
  currentBody,
  firstDetectedBody,
  HELIOPAUSE,
  install,
  kilograms,
  listBodies,
  materials,
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
/** The first Body Comms Detected: seed 123 opens on a Gas Giant's Moon, so it is a sibling Moon. */
const moon = firstDetectedBody(run.starSystem);

/** The same Run knowing every Body, so it can plan a Hop anywhere (#96). */
function knowingAll(from: Run): Run {
  const ids = listBodies(from.starSystem).map((b) => b.id);
  return { ...from, knowledge: { detected: ids, surveyed: ids, heliopauseFound: true } };
}

/** The same Run knowing every Body, stood on its innermost planet (where Runs opened before #96). */
function onInnerPlanet(from: Run): Run {
  const [inner] = from.starSystem.planets;
  if (!inner) throw new Error('A Star System has planets');
  return { ...knowingAll(from), status: { kind: 'landed', bodyId: inner.id } };
}

function planFor(id: BodyId, from: Run = run) {
  const result = planHop(from, id);
  if (result.kind !== 'planned') throw new Error('expected a plan');
  return result.plan;
}

describe('a Hop plan to a Depleted Body', () => {
  it('says in words that it will yield nothing, and a plan to a fresh Body does not', () => {
    expect(describeHopPlan(run, planFor(moon.id)).yieldNote).toBeUndefined();
    const used = { ...run, depleted: [moon.id] };
    const view = describeHopPlan(used, planFor(moon.id, used));
    expect(view.yieldNote).toBe('Depleted: this Hop will yield nothing.');
    expect(view.summary).toContain('will yield nothing');
  });
});

describe('a Hop plan to the Heliopause', () => {
  const withDrive = install({ ...run, materials: materials(100) }, 2, 'jump-drive');
  if (withDrive.kind !== 'installed') throw new Error('Expected an install');
  const ready = withDrive.run;
  const planned = planHop(ready, HELIOPAUSE);
  if (planned.kind !== 'planned') throw new Error('expected a plan');
  const view = describeHopPlan(ready, planned.plan);

  it('lists Takeoff and Transfer, and no Landing', () => {
    expect(view.burns.map((b) => b.label)).toEqual(['Takeoff', 'Transfer']);
    expect(view.burns.map((b) => b.estimate)).toEqual([
      formatPlanDeltaV(planned.plan.estimates.takeoff),
      formatPlanDeltaV(planned.plan.estimates.transfer),
    ]);
    expect(view.needed).toBe(formatPlanDeltaV(planned.plan.totalEstimate));
  });

  it('says the Transfer climbs out to the edge of the Star System, from where the Spacecraft is', () => {
    const distance = ready.starSystem.heliopauseRadius - currentBody(ready).distanceFromStar;
    expect(view.burns[1]?.reason).toBe(
      `climb ${formatDistanceAu(astronomicalUnits(distance))} to the edge`,
    );
    expect(view.summary).toMatch(/^Hop plan for the Heliopause: needs /);
    expect(view.yieldNote).toBeUndefined();
  });
});

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
    // Re-pinned for #188: a full scout reaches every Body of seed 123 for sure, so half its Fuel.
    const half: Run = onInnerPlanet({
      ...run,
      spacecraft: { ...run.spacecraft, fuelMass: kilograms(run.spacecraft.fuelMass / 2) },
    });
    const chances: number[] = [];
    for (const body of listBodies(half.starSystem)) {
      const result = planHop(half, body.id);
      if (result.kind !== 'planned') continue;
      const view = describeHopPlan(half, result.plan);
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
    // Re-pinned for #189: Rexsio, a Gas Giant's Moon far out, stands in for Sircer.
    const knowing = knowingAll(run);
    const far = listBodies(run.starSystem).find((b) => b.name === 'Rexsio');
    const here = currentBody(run);
    if (!far) throw new Error('seed 123 setup');
    const view = describeHopPlan(knowing, planFor(far.id, knowing));
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
    // Seed 5's second planet has a planet on each side of it; stood there knowing every Body.
    const start = startRun(5, 'scout');
    const ids = listBodies(start.starSystem).map((b) => b.id);
    const here = start.starSystem.planets[1];
    if (!here) throw new Error('seed 5 has a second planet');
    const mid: Run = {
      ...start,
      status: { kind: 'landed', bodyId: here.id },
      knowledge: { detected: ids, surveyed: ids, heliopauseFound: true },
    };
    const others = listBodies(mid.starSystem).filter((b) => b.landable && b.id !== here.id);
    const outer = others.find((p) => p.distanceFromStar > here.distanceFromStar);
    const inner = others.find((p) => p.distanceFromStar < here.distanceFromStar);
    if (!outer || !inner) throw new Error('seed 5 needs planets on both sides of its second');
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
    // Re-pinned for #189: from the innermost planet, a half-fuelled hauler's Hop to Rexsio is short.
    const full = onInnerPlanet(startRun(123, 'hauler'));
    const hauler: Run = {
      ...full,
      spacecraft: { ...full.spacecraft, fuelMass: kilograms(full.spacecraft.fuelMass / 2) },
    };
    const rexsio = listBodies(hauler.starSystem).find((body) => body.name === 'Rexsio');
    if (!rexsio) throw new Error('seed 123 has no Rexsio');
    expect(describeHopPlan(hauler, planFor(rexsio.id, hauler)).margin).toBe('−7,035 m/s (34%)');
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
