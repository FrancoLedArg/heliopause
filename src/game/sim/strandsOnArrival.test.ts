import { describe, expect, it } from 'vitest';
import {
  CHASSIS_IDS,
  HELIOPAUSE,
  launchHop,
  listBodies,
  planHop,
  startRun,
  strandsOnArrival,
  type Body,
  type BodyId,
  type ChassisId,
  type Run,
} from './index.ts';
import { withJumpDrive } from './testing.ts';

/** The Body of this name in the Run's Star System. */
function named(run: Run, name: string): Body {
  const body = listBodies(run.starSystem).find((b) => b.name === name);
  if (!body) throw new Error(`Seed ${String(run.seed)} has no ${name}`);
  return body;
}

/**
 * The share of Runs, one per seed from 1 to `seeds`, that a cautious player ends Stranded within
 * three Hops. The cautious player picks the cheapest Body not yet visited whose plan shows at least
 * 50%, and passes over any the plan warns would leave the Run Stranded when `heeds` is set.
 */
function strandedByHop3(chassis: ChassisId, seeds: number, heeds: boolean): number {
  let stranded = 0;
  for (let seed = 1; seed <= seeds; seed++) {
    let run = startRun(seed, chassis);
    const visited = new Set<BodyId>();
    for (let hop = 0; hop < 3 && run.status.kind === 'landed'; hop++) {
      visited.add(run.status.bodyId);
      const from = run;
      const choices = listBodies(from.starSystem).flatMap((body) => {
        if (visited.has(body.id)) return [];
        const planned = planHop(from, body.id);
        if (planned.kind !== 'planned' || planned.plan.successChance < 0.5) return [];
        if (heeds && strandsOnArrival(from, body.id)) return [];
        return [{ id: body.id, cost: planned.plan.totalEstimate }];
      });
      const pick = choices.sort((a, b) => a.cost - b.cost)[0];
      if (!pick) break;
      const flown = launchHop(from, pick.id);
      if (flown.kind !== 'flown') throw new Error('expected a Hop');
      run = flown.run;
    }
    if (run.status.kind === 'ended' && run.status.end.kind === 'stranded') stranded++;
  }
  return stranded / seeds;
}

describe('the Hop plan warns before a Hop that would leave the Run Stranded', () => {
  it('the plan warns when arriving would leave the Run Stranded', () => {
    // Seed 2's Scout: Quydril is Rocky and deep in its planet's gravity. The plan shows 100%, but
    // flown at its estimate the Hop leaves 2.5 km/s at most however the Spacecraft is changed, and
    // the cheapest Hop on from there needs 4.0 km/s.
    const run = startRun(2, 'scout');
    expect(strandsOnArrival(run, named(run, 'Quydril').id)).toEqual({
      warning:
        "You'd be Stranded on Quydril: leaving needs at least 4.0 km/s and you'd have at most 2.5 km/s.",
    });
  });

  it('the plan does not warn when an onward Hop exists', () => {
    const run = startRun(2, 'scout');
    // An Icy Moon refuels the Spacecraft; a shallow Rocky Moon leaves Fuel enough to Hop on.
    for (const name of ['Vionzyliox', 'Roxciozyr']) {
      const body = named(run, name);
      expect(strandsOnArrival(run, body.id)).toBeUndefined();
      const flown = launchHop(run, body.id);
      expect(flown).toMatchObject({ kind: 'flown', run: { status: { kind: 'landed' } } });
    }
    // Arriving at the Heliopause means a Jump, never a Landing: it is never warned of this way.
    expect(strandsOnArrival(withJumpDrive(run), HELIOPAUSE)).toBeUndefined();
  });

  it('the warning uses the estimate, not a dispersion roll', () => {
    // Seed 2's Scout to Toprus Nova: at its estimate the Hop strands the Run, though the roll this
    // Run would fly happens to leave enough Fuel. The plan warns all the same.
    const lucky = startRun(2, 'scout');
    const toprus = named(lucky, 'Toprus Nova');
    expect(launchHop(lucky, toprus.id)).toMatchObject({ run: { status: { kind: 'landed' } } });
    expect(strandsOnArrival(lucky, toprus.id)?.warning).toMatch(
      /^You'd be Stranded on Toprus Nova:/,
    );
    // Seed 10's Scout to Tuxlo: this Run's roll runs long and strands it, but at its estimate the
    // Hop leaves enough. The plan does not warn of what only bad luck brings.
    const unlucky = startRun(10, 'scout');
    const tuxlo = named(unlucky, 'Tuxlo');
    expect(launchHop(unlucky, tuxlo.id)).toMatchObject({
      run: { status: { kind: 'ended', end: { kind: 'stranded' } } },
    });
    expect(strandsOnArrival(unlucky, tuxlo.id)).toBeUndefined();
  });

  it('keeps the answer for each Run and target, so asking again costs nothing', () => {
    const run = startRun(2, 'scout');
    const quydril = named(run, 'Quydril').id;
    expect(strandsOnArrival(run, quydril)).toBe(strandsOnArrival(run, quydril));
  });
});

describe('balance: the warning keeps a cautious player out of dead ends', () => {
  // The PR #181 review measured 16–28% of cautious Runs Stranded by Hop 3 without the warning, and
  // about 1–2% for a player who heeds it: the rest are Hops whose roll ran long. Over 300 seeds.
  const SEEDS = 300;

  it.each(CHASSIS_IDS)(
    'a cautious %s player who heeds the warning is Stranded by Hop 3 in about 2% of Runs or fewer',
    (chassis) => {
      expect(strandedByHop3(chassis, SEEDS, true)).toBeLessThanOrEqual(0.025);
      // Without the warning the same player walks into far more of them.
      expect(strandedByHop3(chassis, SEEDS, false)).toBeGreaterThan(0.1);
    },
    30_000,
  );
});
