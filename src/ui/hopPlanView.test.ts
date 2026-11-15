import { describe, expect, it } from 'vitest';
import {
  astronomicalUnits,
  availableDeltaV,
  currentBody,
  firstDetectedBody,
  flyHop,
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
import type { Rng } from '../game/lib/rng.ts';
import {
  formatDistanceAu,
  formatFuel,
  formatGravity,
  formatMass,
  formatDeltaVKmS,
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
  it('says in its summary that it will yield nothing, and a plan to a fresh Body does not', () => {
    expect(describeHopPlan(run, planFor(moon.id)).summary).not.toContain('yield');
    const used = { ...run, depleted: [moon.id] };
    const view = describeHopPlan(used, planFor(moon.id, used));
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
      formatDeltaVKmS(planned.plan.estimates.takeoff),
      formatDeltaVKmS(planned.plan.estimates.transfer),
    ]);
    expect(view.needed).toBe(formatDeltaVKmS(planned.plan.totalEstimate));
  });

  it('says the Transfer climbs out to the edge of the Star System, from where the Spacecraft is', () => {
    const distance = ready.starSystem.heliopauseRadius - currentBody(ready).distanceFromStar;
    expect(view.burns[1]?.reason).toBe(
      `climb ${formatDistanceAu(astronomicalUnits(distance))} to the edge`,
    );
    expect(view.summary).toMatch(/^Hop plan for the Heliopause: needs /);
  });
});

describe('the Hop plan as the player reads it', () => {
  it('shows each Burn, the total, the available Δv and the Margin as the simulation planned them', () => {
    const plan = planFor(moon.id);
    const view = describeHopPlan(run, plan);
    expect(view.burns.map((b) => b.label)).toEqual(['Takeoff', 'Transfer', 'Landing']);
    expect(view.burns.map((b) => b.estimate)).toEqual([
      formatDeltaVKmS(plan.estimates.takeoff),
      formatDeltaVKmS(plan.estimates.transfer),
      formatDeltaVKmS(plan.estimates.landing),
    ]);
    expect(view.needed).toBe(formatDeltaVKmS(plan.totalEstimate));
    expect(view.available).toBe(formatDeltaVKmS(plan.availableDeltaV));
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

  it('km/s formatting matches the top bar', () => {
    // From the innermost planet to its nearest Moon (as from the Home Planet before #189).
    const home = onInnerPlanet(run);
    const innerMoon = home.starSystem.planets[0]?.moons[0];
    if (!innerMoon) throw new Error('The innermost planet has a Moon');
    const view = describeHopPlan(home, planFor(innerMoon.id, home));
    // The top bar reads the same Spacecraft's Δv: 28,754 m/s is 28.8 km/s in both (#247's Isp).
    expect(view.available).toBe(formatDeltaVKmS(availableDeltaV(home.spacecraft)));
    expect(view.available).toBe('28.8 km/s');
    for (const text of [...view.burns.map((b) => b.estimate), view.needed, view.available]) {
      // Two decimals under 1 km/s, as everywhere (re-pinned for #189: this Transfer is short).
      expect(text).toMatch(/^\d+\.\d{1,2} km\/s$/);
    }
    // Seed 123's innermost planet to its Moon (re-pinned for #189; was the Home Planet's Moon).
    expect(view.burns.map((b) => b.estimate)).toEqual(['3.8 km/s', '1.3 km/s', '0.24 km/s']);
    expect(view.needed).toBe('5.4 km/s');

    // Below 10 km/s too: a scout with 3.14 t of Fuel has 1600 s × g0 × ln(7.14 / 4) ≈ 9,091 m/s,
    // which the top bar and the plan both read as 9.1 km/s.
    const low: Run = { ...home, spacecraft: { ...home.spacecraft, fuelMass: kilograms(3140) } };
    const lowView = describeHopPlan(low, planFor(innerMoon.id, low));
    expect(lowView.available).toBe(formatDeltaVKmS(availableDeltaV(low.spacecraft)));
    expect(lowView.available).toBe('9.1 km/s');
  });

  it('shows the Margin as a whole percent of the available Δv, with its sign', () => {
    const plan = planFor(moon.id);
    // Needed 7,000 m/s: +420 is 6%, and a shortfall of 1,400 is 20%.
    const at = (margin: number) =>
      describeHopPlan(run, { ...plan, totalEstimate: mps(7000), margin: mps(margin) }).margin;
    expect(at(420)).toBe('+0.42 km/s (6%)');
    // Under 1 km/s it keeps two decimals, so a thin Margin never reads as +0.0.
    expect(at(46)).toBe('+0.05 km/s (1%)');
    expect(at(-1400)).toBe('−1.4 km/s (20%)');
  });

  it('gives the same percentage as the why text for a hauler Hop on seed 123 that is short', () => {
    // Re-pinned for #189: from the innermost planet, a half-fuelled hauler's Hop to Rexsio is short.
    // #247's Isp leaves it less short. A quarter, not half, since #231 gave the Hauler two Tanks.
    const full = onInnerPlanet(startRun(123, 'hauler'));
    const hauler: Run = {
      ...full,
      spacecraft: { ...full.spacecraft, fuelMass: kilograms(full.spacecraft.fuelMass / 4) },
    };
    const rexsio = listBodies(hauler.starSystem).find((body) => body.name === 'Rexsio');
    if (!rexsio) throw new Error('seed 123 has no Rexsio');
    expect(describeHopPlan(hauler, planFor(rexsio.id, hauler)).margin).toBe('−3.9 km/s (19%)');
  });

  it('drops the percentage once the Margin is as big as the estimate', () => {
    const plan = planFor(moon.id);
    const view = describeHopPlan(run, {
      ...plan,
      totalEstimate: mps(7820),
      margin: mps(7900),
    });
    expect(view.margin).toBe('+7.9 km/s');
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

describe('the Hop plan’s Fuel gauge', () => {
  // Every Burn costs exactly its estimate: the middle of the dispersion range.
  const onEstimate: Rng = { next: () => 0.5, int: (min) => min };

  it("the plan's Fuel after the Hop matches the simulation's estimate", () => {
    const plan = planFor(moon.id);
    const { flight } = flyHop(run, plan, onEstimate);
    const fuel = describeHopPlan(run, plan).fuel;
    expect(fuel.after).toBeCloseTo(flight.fuelRemaining);
    expect(fuel.afterText).toBe(formatFuel(flight.fuelRemaining));
    // A full scout Tank: 21.0 t now, and the gauge's chunk is the Fuel the Hop burns.
    expect(fuel.now).toBe(run.spacecraft.fuelMass);
    expect(fuel.nowShare).toBe(1);
    expect(fuel.afterShare).toBeCloseTo(flight.fuelRemaining / run.spacecraft.fuelCapacity);
    expect(fuel.label).toBe(`Fuel: 21.0 t now, ${formatFuel(flight.fuelRemaining)} after the Hop.`);
  });

  it('shows the Fuel running dry when the Hop needs more Δv than it gives', () => {
    const dry: Run = { ...run, spacecraft: { ...run.spacecraft, fuelMass: kilograms(500) } };
    const fuel = describeHopPlan(dry, planFor(moon.id, dry)).fuel;
    expect(fuel.after).toBe(0);
    expect(fuel.afterText).toBe('0.0 t');
    expect(fuel.nowShare).toBeCloseTo(500 / run.spacecraft.fuelCapacity);
  });
});

describe('the Hop plan’s Δv bar', () => {
  // A worked example: Burns of 1.0, 5.0 and 1.0 km/s against the available Δv.
  const worked = (available: number) => {
    const plan = planFor(moon.id);
    const estimates = { takeoff: mps(1000), transfer: mps(5000), landing: mps(1000) };
    return describeHopPlan(run, {
      ...plan,
      estimates,
      totalEstimate: mps(7000),
      availableDeltaV: mps(available),
      margin: mps(available - 7000),
    }).bar;
  };

  it("the Hop plan's bar segments sum to the needed Δv and the Margin is the gap to the available Δv", () => {
    const bar = worked(10_000);
    expect(bar.segments.map((s) => s.burn)).toEqual(['takeoff', 'transfer', 'landing']);
    expect(bar.segments.map((s) => s.start)).toEqual([0, 0.1, 0.6]);
    expect(bar.segments.map((s) => s.width)).toEqual([0.1, 0.5, 0.1]);
    expect(bar.needed).toBe(7000);
    expect(bar.margin).toBe(3000);
    expect(bar.short).toBe(false);
    // The gap runs from the end of the Landing to the available Δv, the end of the bar.
    expect(bar.availableAt).toBe(1);
    expect(bar.gap.start).toBeCloseTo(0.7);
    expect(bar.gap.width).toBeCloseTo(0.3);

    // The simulation's own plan: the segments add up to its total, and the gap is its Margin.
    const plan = planFor(moon.id);
    const real = describeHopPlan(run, plan).bar;
    const sum = real.segments.reduce((total, s) => total + s.deltaV, 0);
    expect(sum).toBeCloseTo(plan.totalEstimate);
    expect(real.margin).toBeCloseTo(plan.margin);
    expect(real.gap.width * plan.availableDeltaV).toBeCloseTo(plan.margin);
  });

  it('draws a Margin below zero as the part of the Burns the available Δv does not reach', () => {
    // 7.0 km/s needed against 5.6 km/s: the bar spans the need, and its last fifth is short.
    const bar = worked(5600);
    expect(bar.short).toBe(true);
    expect(bar.margin).toBe(-1400);
    expect(bar.availableAt).toBeCloseTo(0.8);
    expect(bar.gap.start).toBeCloseTo(0.8);
    expect(bar.gap.width).toBeCloseTo(0.2);
    expect(bar.segments.at(-1)?.start).toBeCloseTo(6 / 7);
  });

  it('reads every value it shows in its accessible name', () => {
    expect(worked(10_000).label).toBe(
      'Δv: Takeoff 1.0 km/s, Transfer 5.0 km/s, Landing 1.0 km/s. Needs 7.0 of 10.0 km/s, Margin +3.0 km/s.',
    );
    expect(worked(5600).label).toBe(
      'Δv: Takeoff 1.0 km/s, Transfer 5.0 km/s, Landing 1.0 km/s. Needs 7.0 of 5.6 km/s, short by 1.4 km/s.',
    );
  });
});
