import { describe, expect, it } from 'vitest';
import { createRng } from '../lib/rng.ts';
import {
  astronomicalUnits,
  availableDeltaV,
  flyHop,
  homePlanet,
  listBodies,
  metersPerSecond,
  planHop,
  startRun,
  type Run,
} from './index.ts';
import { farLandables, homeMoon, landedOn, plan, withBodies, withDeltaV } from './testing.ts';

const run: Run = startRun(2026, 'scout');
const SEEDS = Array.from({ length: 200 }, (_, i) => i * 104_729 + 7);

describe('planning a Hop', () => {
  it('a Hop to a Gas Giant is rejected as having no surface', () => {
    for (const gasGiant of listBodies(run.starSystem).filter((b) => b.kind === 'gas-giant')) {
      const result = planHop(run, gasGiant.id);
      expect(result.kind).toBe('invalid-target');
      if (result.kind !== 'invalid-target') continue;
      expect(result.reason).toBe('no-surface');
      expect(result.why).toContain(gasGiant.name);
    }
  });

  it('a Hop to a Body the Star System does not have is a programmer error', () => {
    // @ts-expect-error a plain string is not a BodyId: ids come from the Star System's Bodies.
    expect(() => planHop(run, 'no-such-body')).toThrow();
  });

  it('a Hop to the Body the Spacecraft is on is rejected', () => {
    const result = planHop(run, run.starSystem.homePlanetId);
    expect(result).toMatchObject({ kind: 'invalid-target', reason: 'current-body' });
  });

  it('a Hop to the Home Planet’s Moon is planned', () => {
    const moon = homePlanet(run.starSystem).moons[0];
    expect(moon).toBeDefined();
    if (!moon) return;
    const result = planHop(run, moon.id);
    expect(result.kind).toBe('planned');
  });
});

describe('Burn estimates', () => {
  it('a plan has an estimate for each Burn, their total, the available Δv and the Margin', () => {
    const moon = homePlanet(run.starSystem).moons[0];
    if (!moon) throw new Error('The Home Planet has a Moon');
    const { estimates, totalEstimate, availableDeltaV, margin } = plan(run, moon.id);
    for (const estimate of Object.values(estimates)) expect(estimate).toBeGreaterThan(0);
    expect(totalEstimate).toBeCloseTo(estimates.takeoff + estimates.transfer + estimates.landing);
    expect(availableDeltaV).toBeGreaterThan(0);
    expect(margin).toBeCloseTo(availableDeltaV - totalEstimate);
  });

  it('Takeoff from a Mars-sized Body costs what reaching orbit from Mars does: 4.2 km/s', () => {
    // NASA NTRS (research doc §3): Mars surface to low orbit 4,200 m/s; Mars escape velocity 5.0 km/s.
    const homeId = run.starSystem.homePlanetId;
    const marsLike = withBodies(run, { [homeId]: { escapeVelocity: metersPerSecond(5_000) } });
    const moon = homePlanet(marsLike.starSystem).moons[0];
    if (!moon) throw new Error('The Home Planet has a Moon');
    expect(plan(marsLike, moon.id).estimates.takeoff).toBeCloseTo(4_200, -1);
  });

  it('Takeoff costs more from a Body with stronger gravity', () => {
    for (const seed of SEEDS.slice(0, 20)) {
      const start = startRun(seed, 'scout');
      const target = homePlanet(start.starSystem).moons[0];
      if (!target) throw new Error('The Home Planet has a Moon');
      const origins = listBodies(start.starSystem)
        .filter((body) => body.landable && body.id !== target.id)
        .sort((a, b) => a.surfaceGravity - b.surfaceGravity);
      const takeoffs = origins.map(
        (body) => plan(landedOn(start, body.id), target.id).estimates.takeoff,
      );
      for (let i = 1; i < takeoffs.length; i++) {
        expect(takeoffs[i]).toBeGreaterThanOrEqual(takeoffs[i - 1] ?? Infinity);
      }
      expect(takeoffs.at(-1)).toBeGreaterThan(takeoffs[0] ?? Infinity);
    }
  });

  it('Landing costs more on a Body with stronger gravity', () => {
    for (const seed of SEEDS.slice(0, 20)) {
      const start = startRun(seed, 'scout');
      const targets = farLandables(start).sort((a, b) => a.surfaceGravity - b.surfaceGravity);
      const landings = targets.map((body) => plan(start, body.id).estimates.landing);
      for (let i = 1; i < landings.length; i++) {
        expect(landings[i]).toBeGreaterThanOrEqual(landings[i - 1] ?? Infinity);
      }
    }
  });

  it('a Transfer between Earth’s and Mars’s orbits costs the textbook Hohmann departure of 2.94 km/s', () => {
    // Hohmann departure burn from 1 AU to 1.524 AU around the Sun: 32.73 − 29.78 ≈ 2.94 km/s.
    const home = homePlanet(run.starSystem);
    const [target] = farLandables(run).filter((body) => body.kind === 'rocky-planet');
    if (!target) throw new Error('Seed 2026 has a second rocky planet');
    const earthMars = withBodies(run, {
      [home.id]: { distanceFromStar: astronomicalUnits(1) },
      [target.id]: { distanceFromStar: astronomicalUnits(1.524) },
    });
    expect(plan(earthMars, target.id).estimates.transfer).toBeCloseTo(2_940, -2);
  });

  it('a Transfer costs more the farther apart the Bodies are', () => {
    for (const seed of SEEDS) {
      const start = startRun(seed, 'scout');
      const home = homePlanet(start.starSystem);
      // Around the star: Bodies of other planets, outward from the Home Planet.
      const outward = farLandables(start)
        .filter((body) => body.distanceFromStar > home.distanceFromStar)
        .sort((a, b) => a.distanceFromStar - b.distanceFromStar);
      const outwardCosts = outward.map((body) => plan(start, body.id).estimates.transfer);
      for (let i = 1; i < outwardCosts.length; i++) {
        expect(outwardCosts[i]).toBeGreaterThanOrEqual(outwardCosts[i - 1] ?? Infinity);
      }
      // Around the Home Planet: its Moons, nearest first.
      const moonCosts = home.moons.map((moon) => plan(start, moon.id).estimates.transfer);
      for (let i = 1; i < moonCosts.length; i++) {
        expect(moonCosts[i]).toBeGreaterThan(moonCosts[i - 1] ?? Infinity);
      }
    }
  });

  it('the same climb outward costs more the closer to the star it starts', () => {
    const home = homePlanet(run.starSystem);
    const [target] = farLandables(run).filter((body) => body.kind === 'rocky-planet');
    if (!target) throw new Error('Seed 2026 has a second rocky planet');
    const climb = (from: number, to: number) =>
      plan(
        withBodies(run, {
          [home.id]: { distanceFromStar: astronomicalUnits(from) },
          [target.id]: { distanceFromStar: astronomicalUnits(to) },
        }),
        target.id,
      ).estimates.transfer;
    expect(climb(0.4, 0.6)).toBeGreaterThan(climb(1.0, 1.2));
    expect(climb(0.4, 0.6)).toBeGreaterThan(climb(1.0, 1.5));
  });

  it('climbing outward costs more than falling back inward between the same two Bodies', () => {
    for (const seed of SEEDS.slice(0, 50)) {
      const start = startRun(seed, 'scout');
      const home = homePlanet(start.starSystem);
      for (const body of farLandables(start)) {
        const there = plan(start, body.id).estimates.transfer;
        const back = plan(landedOn(start, body.id), home.id).estimates.transfer;
        if (body.distanceFromStar > home.distanceFromStar) expect(there).toBeGreaterThan(back);
        else expect(back).toBeGreaterThan(there);
      }
      for (const moon of home.moons) {
        const there = plan(start, moon.id).estimates.transfer;
        const back = plan(landedOn(start, moon.id), home.id).estimates.transfer;
        expect(there).toBeGreaterThan(back);
      }
    }
  });
});

describe('Success Chance', () => {
  const total = plan(run, homeMoon(run).id).totalEstimate;
  const chanceWith = (deltaV: number) =>
    plan(withDeltaV(run, deltaV), homeMoon(run).id).successChance;

  it('is 100% when the Margin covers every Burn running 10% long', () => {
    expect(chanceWith(total * 1.1)).toBe(1);
    expect(chanceWith(total * 2)).toBe(1);
  });

  it('is 0% when the Δv is short of every Burn running 10% under', () => {
    expect(chanceWith(total * 0.9 - 1)).toBe(0);
    expect(chanceWith(total * 0.5)).toBe(0);
  });

  it('is 50% when the Δv exactly matches the estimate, and rises with the Margin', () => {
    expect(chanceWith(total)).toBeCloseTo(0.5, 6);
    const chances = [0.92, 0.96, 1, 1.04, 1.08].map((share) => chanceWith(total * share));
    for (let i = 1; i < chances.length; i++) {
      expect(chances[i]).toBeGreaterThan(chances[i - 1] ?? Infinity);
    }
    expect(chances[0]).toBeGreaterThan(0);
    expect(chances.at(-1)).toBeLessThan(1);
  });

  it('is the true probability that the Fuel covers the three actual Burns', () => {
    // Independent check: sample the dispersion rule (each Burn × uniform 0.9–1.1) many times.
    for (const share of [0.93, 0.98, 1.03, 1.07]) {
      const tight = plan(withDeltaV(run, total * share), homeMoon(run).id);
      const rng = createRng(share * 1000);
      const samples = 100_000;
      let covered = 0;
      for (let i = 0; i < samples; i++) {
        const actual = Object.values(tight.estimates).reduce(
          (sum, estimate) => sum + estimate * (0.9 + 0.2 * rng.next()),
          0,
        );
        if (actual <= tight.availableDeltaV) covered++;
      }
      expect(tight.successChance).toBeCloseTo(covered / samples, 2);
    }
  });

  it('is stable: the same plan always gives the same Success Chance', () => {
    const moon = homeMoon(run);
    expect(plan(run, moon.id).successChance).toBe(plan(run, moon.id).successChance);
  });
});

describe('flying a Hop', () => {
  const moon = homeMoon(run);
  const moonPlan = plan(run, moon.id);
  const { takeoff, transfer, landing } = moonPlan.estimates;
  /** A Run with exactly this much Δv, and its plan to the Home Planet's Moon. */
  const tight = (deltaV: number) => {
    const from = withDeltaV(run, deltaV);
    return { from, plan: plan(from, moon.id) };
  };

  it("each Burn's actual Δv is its estimate times a factor between 0.9 and 1.1", () => {
    const factors: number[] = [];
    for (let seed = 0; seed < 300; seed++) {
      const { flight } = flyHop(run, moonPlan, createRng(seed));
      for (const burn of flight.burns) {
        if (burn.status === 'not-flown') continue;
        factors.push(burn.actual / burn.estimated);
      }
    }
    expect(Math.min(...factors)).toBeGreaterThanOrEqual(0.9);
    expect(Math.max(...factors)).toBeLessThanOrEqual(1.1);
    // Spread across the whole range, not stuck at one value.
    expect(Math.min(...factors)).toBeLessThan(0.91);
    expect(Math.max(...factors)).toBeGreaterThan(1.09);
  });

  it('the same plan flown with the same seed replays identically', () => {
    expect(flyHop(run, moonPlan, createRng(42))).toEqual(flyHop(run, moonPlan, createRng(42)));
  });

  it('a Hop whose Margin covers every Burn running long Arrives on the target', () => {
    expect(moonPlan.successChance).toBe(1);
    for (let seed = 0; seed < 50; seed++) {
      const { flight, run: next } = flyHop(run, moonPlan, createRng(seed));
      expect(flight.outcome).toEqual({ kind: 'arrived' });
      expect(flight.burns.map((burn) => [burn.burn, burn.status])).toEqual([
        ['takeoff', 'completed'],
        ['transfer', 'completed'],
        ['landing', 'completed'],
      ]);
      expect(flight.why).toContain(moon.name);
      // Arrived moves the Spacecraft to the target with the Fuel left.
      expect(next.status).toEqual({ kind: 'landed', bodyId: moon.id });
      expect(next.spacecraft.fuelMass).toBe(flight.fuelRemaining);
      expect(flight.fuelRemaining).toBeLessThan(run.spacecraft.fuelMass);
      expect(flight.fuelRemaining).toBeGreaterThan(0);
    }
  });

  it('the Δv left after Arriving is the Δv before, less what the Burns actually took', () => {
    const { flight, run: next } = flyHop(run, moonPlan, createRng(7));
    const spent = flight.burns.reduce(
      (sum, burn) => sum + (burn.status === 'not-flown' ? 0 : burn.actual),
      0,
    );
    expect(availableDeltaV(next.spacecraft)).toBeCloseTo(moonPlan.availableDeltaV - spent, 3);
    expect(flight.deltaVRemaining).toBeCloseTo(moonPlan.availableDeltaV - spent, 3);
  });

  it('a Burn the Fuel runs out during Takeoff ends as Fell Short at Takeoff', () => {
    const { from, plan: short } = tight(takeoff * 0.85);
    const { flight, run: next } = flyHop(from, short, createRng(1));
    expect(flight.outcome).toMatchObject({ kind: 'fell-short', burn: 'takeoff' });
    expect(flight.burns.map((burn) => burn.status)).toEqual(['ran-out', 'not-flown', 'not-flown']);
    expect(flight.fuelRemaining).toBe(0);
    expect(flight.why).toMatch(/Fuel ran out during the Takeoff/);
    expect(next.status).toEqual({ kind: 'ended', outcome: 'fell-short' });
  });

  it('running out of Fuel during the Transfer ends as Fell Short at Transfer', () => {
    const { from, plan: short } = tight(takeoff * 1.1 + transfer * 0.5);
    const { flight, run: next } = flyHop(from, short, createRng(1));
    expect(flight.outcome).toMatchObject({ kind: 'fell-short', burn: 'transfer' });
    expect(flight.burns.map((burn) => burn.status)).toEqual(['completed', 'ran-out', 'not-flown']);
    expect(flight.why).toMatch(/Fuel ran out during the Transfer/);
    expect(next.status).toEqual({ kind: 'ended', outcome: 'fell-short' });
  });

  it('Landing that needs more Δv than remains ends as Crashed', () => {
    const { from, plan: short } = tight((takeoff + transfer) * 1.1 + landing * 0.5);
    const { flight, run: next } = flyHop(from, short, createRng(1));
    expect(flight.outcome).toMatchObject({ kind: 'crashed' });
    expect(flight.burns.map((burn) => burn.status)).toEqual(['completed', 'completed', 'ran-out']);
    expect(flight.fuelRemaining).toBe(0);
    expect(flight.why).toMatch(/Transfer was completed, but .* Landing/);
    expect(next.status).toEqual({ kind: 'ended', outcome: 'crashed' });
  });

  it('a failed Hop reports how much Δv it was short, and what the Fuel delivered first', () => {
    const { from, plan: short } = tight(takeoff * 0.85);
    const { flight } = flyHop(from, short, createRng(1));
    const [ranOut] = flight.burns;
    if (ranOut?.status !== 'ran-out' || flight.outcome.kind !== 'fell-short') {
      throw new Error('Expected to run out during Takeoff');
    }
    expect(ranOut.delivered).toBeCloseTo(short.availableDeltaV, 3);
    expect(flight.outcome.shortfall).toBeCloseTo(ranOut.actual - ranOut.delivered, 3);
  });

  it('with no Margin, the same plan Arrives with some seeds and fails with others', () => {
    const { from, plan: even } = tight(moonPlan.totalEstimate);
    expect(even.successChance).toBeCloseTo(0.5, 6);
    const outcomes = new Set<string>();
    for (let seed = 0; seed < 20; seed++) {
      outcomes.add(flyHop(from, even, createRng(seed)).flight.outcome.kind);
    }
    expect(outcomes).toContain('arrived');
    expect(outcomes.has('crashed') || outcomes.has('fell-short')).toBe(true);
  });

  it('the why for a failure names the Burn that ran long against the Margin, in plain language', () => {
    // Margin of about 3%: the Burns running long by more than that must fail.
    const { from, plan: slim } = tight(moonPlan.totalEstimate * 1.03);
    let explained = 0;
    for (let seed = 0; seed < 200; seed++) {
      const { flight } = flyHop(from, slim, createRng(seed));
      if (flight.outcome.kind === 'arrived') continue;
      expect(flight.why).toMatch(
        /(Takeoff|Transfer|Landing) took \d+% more Δv than estimated.*; you had 3% Margin\./,
      );
      explained++;
    }
    expect(explained).toBeGreaterThan(0);
  });

  it('the why for a plan that never had enough Fuel says so', () => {
    const { from, plan: hopeless } = tight(moonPlan.totalEstimate * 0.8);
    const { flight } = flyHop(from, hopeless, createRng(3));
    expect(flight.outcome.kind).not.toBe('arrived');
    expect(flight.why).toMatch(/needed 25% more Δv than the Fuel provides/);
  });

  it('the why for an arrival compares the Burns against the estimate and the Margin', () => {
    const { flight } = flyHop(run, moonPlan, createRng(9));
    expect(flight.why).toMatch(
      /^Arrived on .+\. The Burns took (\d+% (more|less) Δv than estimated|about the estimated Δv); you had \d+% Margin\.$/,
    );
  });

  it('a Run that has ended cannot plan another Hop', () => {
    const { from, plan: short } = tight(takeoff * 0.85);
    const { run: ended } = flyHop(from, short, createRng(1));
    expect(() => planHop(ended, moon.id)).toThrow();
  });

  it('a plan made for another Spacecraft state cannot be flown', () => {
    const { run: arrived } = flyHop(run, moonPlan, createRng(1));
    expect(() => flyHop(arrived, moonPlan, createRng(1))).toThrow();
  });
});
