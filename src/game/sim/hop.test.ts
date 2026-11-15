import { describe, expect, it } from 'vitest';
import { createRng } from '../lib/rng.ts';
import { DIFFICULTY_TUNING, difficultyFactor } from './data.ts';
import {
  astronomicalUnits,
  availableDeltaV,
  flyHop,
  launchHop,
  listBodies,
  marginShare,
  metersPerSecond,
  metersPerSecondSquared,
  planHop,
  reachVerdict,
  UNSURVEYED,
  kilograms,
  assessStranding,
  HELIOPAUSE,
  isInHopRange,
  startRun,
  generateSystem,
  type BodyId,
  type HopFlight,
  type Run,
} from './index.ts';
import {
  farLandables,
  innerMoon,
  innerPlanet,
  landedOn,
  onInnerPlanet,
  plan,
  withBodies,
  withDeltaV,
} from './testing.ts';

const run: Run = onInnerPlanet(startRun(2026, 'scout'));
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
    const result = planHop(run, innerPlanet(run).id);
    expect(result).toMatchObject({ kind: 'invalid-target', reason: 'current-body' });
  });

  it('a Hop to the inner planet’s Moon is planned', () => {
    const moon = innerPlanet(run).moons[0];
    expect(moon).toBeDefined();
    if (!moon) return;
    const result = planHop(run, moon.id);
    expect(result.kind).toBe('planned');
  });
});

describe('Burn estimates', () => {
  it('a plan has an estimate for each Burn, their total, the available Δv and the Margin', () => {
    const moon = innerPlanet(run).moons[0];
    if (!moon) throw new Error('The innermost planet has a Moon');
    const { estimates, totalEstimate, availableDeltaV, margin } = plan(run, moon.id);
    for (const estimate of Object.values(estimates)) expect(estimate).toBeGreaterThan(0);
    expect(totalEstimate).toBeCloseTo(estimates.takeoff + estimates.transfer + estimates.landing);
    expect(availableDeltaV).toBeGreaterThan(0);
    expect(margin).toBeCloseTo(availableDeltaV - totalEstimate);
  });

  it('Takeoff from a Mars-sized Body costs what reaching orbit from Mars does: 4.2 km/s', () => {
    // NASA NTRS (research doc §3): Mars surface to low orbit 4,200 m/s; Mars escape velocity 5.03 km/s.
    const homeId = innerPlanet(run).id;
    const marsLike = withBodies(run, { [homeId]: { escapeVelocity: metersPerSecond(5_030) } });
    const moon = innerPlanet(marsLike).moons[0];
    if (!moon) throw new Error('The innermost planet has a Moon');
    expect(plan(marsLike, moon.id).estimates.takeoff).toBeCloseTo(4_200, -1);
  });

  it('Takeoff costs more from a Body with stronger gravity', () => {
    for (const seed of SEEDS.slice(0, 20)) {
      const start = onInnerPlanet(startRun(seed, 'scout'));
      const target = innerPlanet(start).moons[0];
      if (!target) throw new Error('The innermost planet has a Moon');
      const origins = listBodies(start.starSystem)
        .filter(
          (body) =>
            body.landable &&
            body.id !== target.id &&
            isInHopRange(landedOn(start, body.id), target.id),
        )
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
      const start = onInnerPlanet(startRun(seed, 'scout'));
      const targets = farLandables(start).sort((a, b) => a.surfaceGravity - b.surfaceGravity);
      const landings = targets.map((body) => plan(start, body.id).estimates.landing);
      for (let i = 1; i < landings.length; i++) {
        expect(landings[i]).toBeGreaterThanOrEqual(landings[i - 1] ?? Infinity);
      }
    }
  });

  it('a Transfer from low Earth orbit to Mars’s orbit costs about 3.66 km/s', () => {
    // Patched conics: the Hohmann departure around the Sun (1 → 1.524 AU) needs 2.95 km/s once
    // clear of Earth; leaving from low orbit, where Takeoff ends, Earth's gravity well raises that to
    // √(2.95² + 11.2²) − 7.92 ≈ 3.66 km/s. Research doc §3 cites about 3.6 km/s from LEO (UNVERIFIED).
    const home = innerPlanet(run);
    const [target] = farLandables(run).filter((body) => body.kind === 'rocky-planet');
    if (!target) throw new Error('Seed 2026 has a second rocky planet');
    const earthMars = withBodies(run, {
      [home.id]: {
        distanceFromStar: astronomicalUnits(1),
        surfaceGravity: metersPerSecondSquared(9.8),
        escapeVelocity: metersPerSecond(11_200),
      },
      [target.id]: { distanceFromStar: astronomicalUnits(1.524) },
    });
    expect(plan(earthMars, target.id).estimates.transfer).toBeCloseTo(3_660, -1);
  });

  // 2,000 Star Systems: about 3 s, longer on a loaded machine (generation redraws, #188).
  it(
    "a Transfer to another planet's system costs more than one to any of the inner planet's Moons",
    { timeout: 60_000 },
    () => {
      for (const seed of Array.from({ length: 2_000 }, (_, i) => i * 7_919 + 13)) {
        const start = onInnerPlanet(startRun(seed, 'scout'));
        const home = innerPlanet(start);
        const toMoons = home.moons.map((moon) => plan(start, moon.id).estimates.transfer);
        const toOthers = farLandables(start).map((body) => plan(start, body.id).estimates.transfer);
        expect(Math.min(...toOthers)).toBeGreaterThan(Math.max(...toMoons));
      }
    },
  );

  it('a Transfer costs more the farther apart the Bodies are', () => {
    for (const seed of SEEDS) {
      const start = onInnerPlanet(startRun(seed, 'scout'));
      const home = innerPlanet(start);
      // Around the star: Bodies of other planets, outward from the inner planet.
      const outward = farLandables(start)
        .filter((body) => body.distanceFromStar > home.distanceFromStar)
        .sort((a, b) => a.distanceFromStar - b.distanceFromStar);
      const outwardCosts = outward.map((body) => plan(start, body.id).estimates.transfer);
      for (let i = 1; i < outwardCosts.length; i++) {
        expect(outwardCosts[i]).toBeGreaterThanOrEqual(outwardCosts[i - 1] ?? Infinity);
      }
      // Around the inner planet: its Moons, nearest first.
      const moonCosts = home.moons.map((moon) => plan(start, moon.id).estimates.transfer);
      for (let i = 1; i < moonCosts.length; i++) {
        expect(moonCosts[i]).toBeGreaterThan(moonCosts[i - 1] ?? Infinity);
      }
    }
  });

  it('the same climb outward costs more the closer to the star it starts', () => {
    const home = innerPlanet(run);
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
});

describe('Success Chance', () => {
  const total = plan(run, innerMoon(run).id).totalEstimate;
  const chanceWith = (deltaV: number) =>
    plan(withDeltaV(run, deltaV), innerMoon(run).id).successChance;

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
      const tight = plan(withDeltaV(run, total * share), innerMoon(run).id);
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
    const moon = innerMoon(run);
    expect(plan(run, moon.id).successChance).toBe(plan(run, moon.id).successChance);
  });
});

describe('flying a Hop', () => {
  const moon = innerMoon(run);
  const moonPlan = plan(run, moon.id);
  const { takeoff, transfer, landing } = moonPlan.estimates;
  /** A Run with exactly this much Δv, and its plan to the inner planet's Moon. */
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
      // Arrived moves the Spacecraft to the target with the Fuel left, plus what landing collected.
      expect(next.status).toEqual({ kind: 'landed', bodyId: moon.id });
      const collected = flight.collection?.kind === 'fuel' ? flight.collection.collected : 0;
      expect(next.spacecraft.fuelMass).toBeCloseTo(flight.fuelRemaining + collected);
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
    // The Hop's own Fuel: the Δv left before landing collected anything.
    const beforeCollecting = { ...next.spacecraft, fuelMass: flight.fuelRemaining };
    expect(availableDeltaV(beforeCollecting)).toBeCloseTo(moonPlan.availableDeltaV - spent, 3);
    expect(flight.deltaVRemaining).toBeCloseTo(moonPlan.availableDeltaV - spent, 3);
  });

  it('a Burn the Fuel runs out during Takeoff ends as Fell Short at Takeoff', () => {
    const { from, plan: short } = tight(takeoff * 0.85);
    const { flight, run: next } = flyHop(from, short, createRng(1));
    expect(flight.outcome).toMatchObject({ kind: 'fell-short', burn: 'takeoff' });
    expect(flight.burns.map((burn) => burn.status)).toEqual(['ran-out', 'not-flown', 'not-flown']);
    expect(flight.fuelRemaining).toBe(0);
    expect(flight.why).toMatch(/Fuel ran out during the Takeoff/);
    expect(next.status).toEqual({
      kind: 'ended',
      end: { kind: 'fell-short', reason: flight.why },
    });
  });

  it('running out of Fuel during the Transfer ends as Fell Short at Transfer', () => {
    const { from, plan: short } = tight(takeoff * 1.1 + transfer * 0.5);
    const { flight, run: next } = flyHop(from, short, createRng(1));
    expect(flight.outcome).toMatchObject({ kind: 'fell-short', burn: 'transfer' });
    expect(flight.burns.map((burn) => burn.status)).toEqual(['completed', 'ran-out', 'not-flown']);
    expect(flight.why).toMatch(/Fuel ran out during the Transfer/);
    expect(next.status).toEqual({
      kind: 'ended',
      end: { kind: 'fell-short', reason: flight.why },
    });
  });

  it('Landing that needs more Δv than remains ends as Crashed', () => {
    const { from, plan: short } = tight((takeoff + transfer) * 1.1 + landing * 0.5);
    // Re-pinned for #188 (was createRng(1)): Burns drawn so that the Landing is what runs out.
    const { flight, run: next } = flyHop(from, short, createRng(4));
    expect(flight.outcome).toMatchObject({ kind: 'crashed' });
    expect(flight.burns.map((burn) => burn.status)).toEqual(['completed', 'completed', 'ran-out']);
    expect(flight.fuelRemaining).toBe(0);
    expect(flight.why).toMatch(/Transfer was completed, but .* Landing/);
    expect(next.status).toEqual({
      kind: 'ended',
      end: { kind: 'crashed', reason: flight.why },
    });
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
    expect(flight.why).toMatch(/The Fuel gives 20% less Δv than the plan needs/);
  });

  it('the Margin share is the Margin over the estimate: a shortfall reads as "N% less Δv"', () => {
    // A hauler on seed 123 with Fuel for 93.7% of its Hop to the inner planet's Moon (-6.3%).
    // Re-pinned for #188: no Body is out of a new hauler's reach on seed 123 any more (it was
    // Viormio, 21,347 m/s of the 20,011 m/s the Fuel gives), so the Fuel is set instead.
    const hauler = onInnerPlanet(startRun(123, 'hauler'));
    const moon = innerMoon(hauler);
    const short = withDeltaV(hauler, plan(hauler, moon.id).totalEstimate * 0.937);
    const planned = planHop(short, moon.id);
    if (planned.kind !== 'planned') throw new Error('expected a plan');
    expect(Math.round(marginShare(planned.plan) * 1000)).toBe(-63);
    const { flight } = flyHop(short, planned.plan, createRng(1));
    expect(flight.why).toMatch(
      /The Fuel gives 6% less Δv than the plan needs, so it had no Margin\./,
    );
  });

  it('an arrival that had no Margin never says it had a negative one', () => {
    const { from, plan: short } = tight(moonPlan.totalEstimate * 0.97);
    const { flight } = flyHop(from, short, createRng(9));
    expect(flight.outcome.kind).toBe('arrived');
    expect(flight.why).not.toMatch(/-\d+%/);
    expect(flight.why).toMatch(
      /you had no Margin \(the Fuel gave 3% less Δv than the plan needs\)/,
    );
  });

  it('an Arrived why never says the Burns ran over by more than the Margin it had', () => {
    for (let step = 0; step <= 8; step++) {
      const { from, plan: sized } = tight(moonPlan.totalEstimate * (1.04 + step * 0.01));
      for (let seed = 0; seed < 1500; seed++) {
        const { flight } = flyHop(from, sized, createRng(seed));
        const match = /^Arrived.*took (\d+)% more Δv than estimated; you had (\d+)% Margin/.exec(
          flight.why,
        );
        if (match) expect(Number(match[1])).toBeLessThanOrEqual(Number(match[2]));
      }
    }
  });

  it('the why for a plan far short of its Δv gives the figures, not a huge percentage', () => {
    const { from, plan: hopeless } = tight(moonPlan.totalEstimate * 0.1);
    const { flight } = flyHop(from, hopeless, createRng(3));
    expect(flight.why).toMatch(
      /This Hop needs \d+\.\d km\/s of Δv, but the Fuel gives only \d+ m\/s, so it had no Margin\./,
    );
  });

  it('the why for an arrival compares the Burns against the estimate and the Margin', () => {
    const { flight } = flyHop(run, moonPlan, createRng(9));
    expect(flight.why).toMatch(
      /^Arrived on .+\. The Burns took (\d+% (more|less) Δv than estimated|about the estimated Δv); you had (\d+% Margin|\d+\.\d km\/s of Margin)\.$/,
    );
    const { from, plan: slim } = tight(moonPlan.totalEstimate * 1.15);
    expect(flyHop(from, slim, createRng(9)).flight.why).toMatch(/; you had 15% Margin\.$/);
  });

  it('the why never quotes a percentage of 100 or more', () => {
    for (const seed of SEEDS.slice(0, 40)) {
      const start = onInnerPlanet(startRun(seed, 'lancer'));
      for (const body of listBodies(start.starSystem)) {
        const result = planHop(start, body.id);
        if (result.kind !== 'planned') continue;
        const { why } = flyHop(start, result.plan, createRng(seed)).flight;
        expect(why).not.toMatch(/\d{3,}%/);
      }
    }
  });

  it('a flight carries the Fuel at launch, so playback needs nothing else', () => {
    const { flight } = flyHop(run, moonPlan, createRng(4));
    expect(flight.fuelAtLaunch).toBe(run.spacecraft.fuelMass);
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

describe('launching a Hop', () => {
  const moon = innerMoon(run);

  const flown = (from: Run, targetId: BodyId) => {
    const result = launchHop(from, targetId);
    if (result.kind !== 'flown') throw new Error(`Expected a flight, got ${result.reason}`);
    return result;
  };
  /** The dispersion factor each flown Burn drew. */
  const factors = (flight: HopFlight) =>
    flight.burns.map((burn) => (burn.status === 'completed' ? burn.actual / burn.estimated : 0));

  it('flies the exact plan the player saw for the target', () => {
    expect(flown(run, moon.id).flight.plan).toEqual(plan(run, moon.id));
  });

  it('replays identically: the same Run launched at the same target flies the same Hop', () => {
    expect(launchHop(onInnerPlanet(startRun(2026, 'scout')), moon.id)).toEqual(
      launchHop(run, moon.id),
    );
  });

  it('counts the Hops flown in a Run, starting from none', () => {
    expect(run.hopsFlown).toBe(0);
    const first = flown(run, moon.id);
    expect(first.run.hopsFlown).toBe(1);
    expect(flown(first.run, innerPlanet(run).id).run.hopsFlown).toBe(2);
  });

  it('each Hop of a Run draws its own Burns: the next Hop does not repeat the last one’s', () => {
    const first = flown(run, moon.id);
    const back = flown(first.run, innerPlanet(run).id);
    expect(factors(back.flight)).not.toEqual(factors(first.flight));
  });

  it('a Run with another seed draws other Burns for the same Hop', () => {
    const other: Run = { ...run, seed: run.seed + 1 };
    expect(factors(flown(other, moon.id).flight)).not.toEqual(factors(flown(run, moon.id).flight));
  });

  it('an invalid target is not launched, and says why', () => {
    expect(launchHop(run, innerPlanet(run).id)).toMatchObject({
      kind: 'invalid-target',
      reason: 'current-body',
    });
  });
});

describe('an Unsurveyed Hop (#190)', () => {
  const target = innerMoon(run);
  const unsurveyedKnowledge = {
    ...run.knowledge,
    surveyed: run.knowledge.surveyed.filter((id) => id !== target.id),
  };
  // Fuel for a little over the Surveyed plan's estimate, so its odds sit in the middle.
  const tight = withDeltaV(run, plan(run, target.id).totalEstimate * 1.05);
  const tightUnsurveyed: Run = { ...tight, knowledge: unsurveyedKnowledge };

  it('an Unsurveyed plan has a lower Success Chance than the same Hop Surveyed', () => {
    const surveyed = plan(tight, target.id);
    const unsurveyed = plan(tightUnsurveyed, target.id);
    expect(surveyed.unsurveyed).toBe(false);
    expect(unsurveyed.unsurveyed).toBe(true);
    expect(unsurveyed.estimates.landing).toBeGreaterThan(surveyed.estimates.landing);
    expect(unsurveyed.successChance).toBeLessThan(surveyed.successChance);
  });

  it('the flight uses the real values: the same Hop flies the same either way', () => {
    const actuals = (r: Run) =>
      flyHop(r, plan(r, target.id), createRng(7)).flight.burns.map((burn) =>
        burn.status === 'completed' ? burn.actual : undefined,
      );
    expect(actuals(tightUnsurveyed)).toEqual(actuals(tight));
  });
});

describe('the reach verdict (#190)', () => {
  it('is In reach from 70%, Out of reach at exactly 0%, and Marginal in between', () => {
    expect(reachVerdict({ successChance: 1 })).toBe('in-reach');
    expect(reachVerdict({ successChance: 0.7 })).toBe('in-reach');
    expect(reachVerdict({ successChance: 0.69 })).toBe('marginal');
    expect(reachVerdict({ successChance: 0.02 })).toBe('marginal');
    expect(reachVerdict({ successChance: 1e-9 })).toBe('marginal');
    expect(reachVerdict({ successChance: 0 })).toBe('out-of-reach');
  });
});

describe('what the player sees and what is real (#190)', () => {
  const SEEDS_SWEPT = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

  const LEVELS = [1, 2, 3, 4, 5, 6];
  /** A Run of a seed in Star System number `level`, standing on its innermost planet. */
  const atLevel = (seed: number, level: number): Run =>
    onInnerPlanet({
      ...startRun(seed, 'scout'),
      starSystemNumber: level,
      starSystem: generateSystem(seed, level),
    });

  it('every landable Body of a Star System has a real escape velocity within the Unsurveyed plan range, at every level', () => {
    for (const level of LEVELS) {
      const factor = difficultyFactor(DIFFICULTY_TUNING.gravity, level);
      for (const seed of SEEDS_SWEPT) {
        for (const body of listBodies(generateSystem(seed, level))) {
          if (!body.landable) continue;
          const kind = body.kind;
          expect(body.escapeVelocity).toBeLessThanOrEqual(
            UNSURVEYED.cautiousEscapeVelocity[kind] * factor + 1e-9,
          );
          expect(body.escapeVelocity).toBeGreaterThanOrEqual(
            UNSURVEYED.leastEscapeVelocity[kind] * factor - 1e-9,
          );
        }
      }
    }
  });

  it('an Unsurveyed plan reads 0% only when the real Hop has no chance', () => {
    for (const [seed, level] of SEEDS_SWEPT.flatMap((s) => LEVELS.map((l) => [s, l] as const))) {
      const start = atLevel(seed, level);
      const from = start.status.kind === 'landed' ? start.status.bodyId : '';
      for (const body of listBodies(start.starSystem)) {
        if (!body.landable || body.id === from) continue;
        for (const share of [0.02, 0.05, 0.1, 0.2, 0.35, 0.5, 0.75, 1]) {
          const fuelled = {
            ...start,
            spacecraft: {
              ...start.spacecraft,
              fuelMass: kilograms(start.spacecraft.fuelCapacity * share),
            },
          };
          const shown = planHop(
            {
              ...fuelled,
              knowledge: {
                ...fuelled.knowledge,
                surveyed: fuelled.knowledge.surveyed.filter((id) => id !== body.id),
              },
            },
            body.id,
          );
          const real = planHop(fuelled, body.id);
          if (shown.kind !== 'planned' || real.kind !== 'planned') continue;
          if (shown.plan.successChance === 0) expect(real.plan.successChance).toBe(0);
          expect(shown.plan.estimates.landing).toBeGreaterThanOrEqual(real.plan.estimates.landing);
          expect(shown.plan.bestCase).toBeLessThanOrEqual(real.plan.bestCase);
        }
      }
    }
  });

  it('a Run is Stranded only when every plan the player sees reads 0%', () => {
    for (const seed of SEEDS_SWEPT) {
      const start = startRun(seed, 'scout');
      for (const share of [0.01, 0.02, 0.03, 0.05, 0.1, 0.2, 0.5, 1]) {
        const run = {
          ...start,
          spacecraft: {
            ...start.spacecraft,
            fuelMass: kilograms(start.spacecraft.fuelCapacity * share),
          },
        };
        if (assessStranding(run).kind !== 'stranded') continue;
        const targets = [
          ...run.knowledge.detected,
          ...(run.knowledge.heliopauseFound ? [HELIOPAUSE] : []),
        ];
        for (const target of targets) {
          const shown = planHop(run, target);
          if (shown.kind === 'planned') expect(shown.plan.successChance).toBe(0);
        }
      }
    }
  });
});
