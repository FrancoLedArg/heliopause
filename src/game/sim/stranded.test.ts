import { describe, expect, it } from 'vitest';
import {
  assessStranding,
  availableDeltaV,
  componentCost,
  endIfStranded,
  HELIOPAUSE,
  install,
  kilograms,
  launchHop,
  listBodies,
  materials,
  metersPerSecond,
  planHop,
  refit,
  remove,
  replay,
  startRun,
  type ComponentId,
  type Run,
  type Slot,
} from './index.ts';
import { plan, withBodies, withDeltaV, withJumpDrive } from './testing.ts';

/** The Run after removing the Components in these Slots, in order, each removal allowed. */
function removeSlots(from: Run, slots: readonly number[]): Run {
  return slots.reduce((now, slot) => {
    const result = remove(now, slot);
    if (result.kind !== 'removed') throw new Error(`Slot ${String(slot)}: ${result.reason.kind}`);
    return result.run;
  }, from);
}

/** The same Run with these Components in its Slots and no Materials, its Fuel kept up to capacity. */
function fittedWith(from: Run, slots: readonly Slot[]): Run {
  return { ...from, spacecraft: refit(from.spacecraft, slots), materials: materials(0) };
}

/**
 * Seed 7's Scout after its Hop to Quiolxaexis, `extra` Materials added before Launch: a Run that
 * only swapping in the level-2 Engine (60 Materials) could save.
 */
function quiolxaexis(extra: number): Run {
  const start = startRun(7, 'scout');
  const body = listBodies(start.starSystem).find(({ name }) => name === 'Quiolxaexis');
  if (!body) throw new Error('Seed 7 has no Quiolxaexis');
  const landed = launchHop({ ...start, materials: materials(start.materials + extra) }, body.id);
  if (landed.kind !== 'flown' || landed.flight.outcome.kind !== 'arrived') {
    throw new Error('Seed 7: the Hop to Quiolxaexis should Arrive');
  }
  return landed.run;
}

/** Whether any Body Hop from here has a Success Chance above 0%, straight from `planHop`; none once the Run has ended. */
function anyBodyHop(from: Run): boolean {
  if (from.status.kind !== 'landed') return false;
  return listBodies(from.starSystem).some((body) => {
    if (!body.landable) return false;
    const result = planHop(from, body.id);
    return result.kind === 'planned' && result.plan.successChance > 0;
  });
}

/**
 * The least Δv at which the Run's Spacecraft has any Hop above 0%, found by bisection on `planHop`
 * itself: an oracle independent of how the Stranded rule works it out.
 */
function threshold(from: Run): number {
  return bisect((deltaV) => anyBodyHop(withDeltaV(from, deltaV)));
}

/** The least Δv, to well under 1 m/s, for which `hops` holds. */
function bisect(hops: (deltaV: number) => boolean): number {
  let low = 0;
  let high = 100_000;
  for (let i = 0; i < 60; i++) {
    const mid = (low + high) / 2;
    if (hops(mid)) high = mid;
    else low = mid;
  }
  return high;
}

const LIGHTEST: readonly Slot[] = ['engine-1', 'fuel-tank-1', null, null];
const HEAVY: readonly Slot[] = ['engine-1', 'fuel-tank-1', 'drill-2', 'drill-1'];
const base = fittedWith(startRun(2026, 'scout'), LIGHTEST);
const need = threshold(base);

/** The heavy design, carrying the Fuel that gives its lightest configuration `deltaV`. */
function heavyWith(deltaV: number): Run {
  const light = withDeltaV(base, deltaV);
  if (light.spacecraft.fuelMass > light.spacecraft.fuelCapacity) throw new Error('over capacity');
  return fittedWith(light, HEAVY);
}

describe('Stranded', () => {
  it('the Run is Stranded only when even the lightest configuration has no Hop above 0%', () => {
    const lost = heavyWith(need - 10);
    expect(assessStranding(lost).kind).toBe('stranded');
    expect(endIfStranded(lost).status).toMatchObject({
      kind: 'ended',
      end: { kind: 'stranded' },
    });

    const saveable = heavyWith(need + 10);
    expect(anyBodyHop(saveable)).toBe(false);
    expect(assessStranding(saveable).kind).not.toBe('stranded');
    expect(endIfStranded(saveable)).toBe(saveable);
  });

  it('a Run that could be saved by removing a Component warns instead of ending', () => {
    const saveable = heavyWith(need + 10);
    const verdict = assessStranding(saveable);
    expect(verdict).toEqual({
      kind: 'warning',
      warning: 'No Hop is possible as built. Remove Components to lighten the Spacecraft.',
    });
    expect(endIfStranded(saveable).status).toEqual(saveable.status);
    // Following the warning saves the Run: without its Drills, a Hop has a chance again.
    const lightened = removeSlots(saveable, [3, 2]);
    expect(anyBodyHop(lightened)).toBe(true);
    expect(assessStranding(lightened)).toEqual({ kind: 'clear' });
  });

  it('the Stranded why names the best Δv and the cheapest need', () => {
    const lost = withDeltaV(base, 1_200);
    expect(need).toBeGreaterThan(2_000);
    const verdict = assessStranding(lost);
    expect(verdict.kind).toBe('stranded');
    if (verdict.kind !== 'stranded') return;
    expect(verdict.reason).toBe(
      'However you change its Components, your Spacecraft has at most 1.2 km/s of Δv, and the ' +
        `cheapest Hop needs ${(need / 1_000).toFixed(1)} km/s.`,
    );
    expect(endIfStranded(lost).status).toEqual({
      kind: 'ended',
      end: { kind: 'stranded', reason: verdict.reason, bodyId: lost.starSystem.homePlanetId },
    });
  });
});

describe('what could still save a Run', () => {
  // Every other Body made too heavy to land on, so only the Heliopause is within reach.
  const home = startRun(2026, 'scout');
  const unreachable = Object.fromEntries(
    listBodies(home.starSystem)
      .filter((body) => body.id !== home.starSystem.homePlanetId)
      .map((body) => [body.id, { escapeVelocity: metersPerSecond(1_000_000) }]),
  );
  const remote = fittedWith(withBodies(home, unreachable), LIGHTEST);
  const heliopauseNeed = bisect((deltaV) => {
    const carried = withDeltaV(withJumpDrive(remote), deltaV);
    return plan(carried, HELIOPAUSE).successChance > 0;
  });
  /** The Run without a Jump Drive, with the Fuel that gives `deltaV` once one is installed. */
  const fuelledFor = (deltaV: number): Run => {
    const carried = withDeltaV(withJumpDrive(remote), deltaV);
    const spacecraft = { ...remote.spacecraft, fuelMass: carried.spacecraft.fuelMass };
    return { ...remote, spacecraft };
  };

  it('the Heliopause counts while a Jump Drive could still be installed', () => {
    const fuelled = fuelledFor(heliopauseNeed + 10);
    expect(assessStranding(withJumpDrive(fuelled))).toEqual({ kind: 'clear' });
    const affordable = { ...fuelled, materials: componentCost('jump-drive', 1) };
    expect(assessStranding(affordable).kind).toBe('warning');
    // One Material short, with nothing to remove for a refund: no Jump Drive, so no Hop at all.
    const short = { ...fuelled, materials: materials(componentCost('jump-drive', 1) - 1) };
    expect(assessStranding(short).kind).toBe('stranded');
  });

  it('the Stranded why names the Heliopause when only the Jump Drive keeps it out of reach', () => {
    // Enough Δv without a Jump Drive, too little with one, and Materials for the Jump Drive alone.
    const fuelled = fuelledFor(heliopauseNeed - 10);
    expect(availableDeltaV(fuelled.spacecraft)).toBeGreaterThan(heliopauseNeed);
    const verdict = assessStranding({ ...fuelled, materials: componentCost('jump-drive', 1) });
    expect(verdict.kind).toBe('stranded');
    if (verdict.kind !== 'stranded') return;
    expect(verdict.reason).toMatch(
      /^However you change its Components, .* The Heliopause needs only .*, but with a Jump Drive aboard your Spacecraft has at most .*\.$/,
    );
  });

  it('a Run that a better Engine could still save warns instead of ending', () => {
    // Just short with the level-1 Engine; the level-2 Engine's Isp more than pays for its mass.
    const short = withDeltaV(base, need - 10);
    const rich = { ...short, materials: componentCost('engine-2', 1) };
    expect(assessStranding(rich)).toEqual({
      kind: 'warning',
      warning:
        'No Hop is possible as built. Change its Components: a different build could still make one.',
    });
    const installed = install(rich, 2, 'engine-2');
    if (installed.kind !== 'installed') throw new Error('expected an install');
    expect(anyBodyHop(removeSlots(installed.run, [0]))).toBe(true);
  });

  it('a rescue the Materials cannot pay for in the order the changes must be made does not count', () => {
    // Seed 7: after Landing on Quiolxaexis the Run has 53 Materials. Swapping the level-1 Engine for
    // the level-2 one would save it, but the new Engine (60) must be installed before the old one
    // can be removed for its refund, so the swap can never be paid for.
    const landed = quiolxaexis(0);
    expect(landed.materials).toBe(53);
    expect(landed.status).toMatchObject({ kind: 'ended', end: { kind: 'stranded' } });
    // With 7 more Materials, 60 on Landing, the same Run can still be saved.
    const richer = quiolxaexis(7);
    expect(richer.materials).toBe(60);
    expect(assessStranding(richer).kind).toBe('warning');
  });

  it('a second full Fuel Tank can save a Run that the lightest configuration cannot', () => {
    // Bodies four times as hard to leave; two level-1 Tanks and a Drill, the Tanks 60% full.
    const start = startRun(1, 'hauler');
    const heavy = Object.fromEntries(
      listBodies(start.starSystem).map((body) => [
        body.id,
        { escapeVelocity: metersPerSecond(body.escapeVelocity * 4) },
      ]),
    );
    const design = fittedWith(withBodies(start, heavy), [
      'engine-1',
      'fuel-tank-1',
      'fuel-tank-1',
      'drill-2',
    ]);
    const fuelMass = kilograms(design.spacecraft.fuelCapacity * 0.6);
    const fuelled = { ...design, spacecraft: { ...design.spacecraft, fuelMass } };
    expect(anyBodyHop(fuelled)).toBe(false);
    expect(anyBodyHop(removeSlots(fuelled, [3]))).toBe(true); // the Drill alone removed
    expect(assessStranding(fuelled)).toMatchObject({ kind: 'warning' });
    // Down to the lightest configuration, the spilled Fuel leaves no way out: the Run ends there.
    expect(removeSlots(fuelled, [3, 2]).status).toMatchObject({
      kind: 'ended',
      end: { kind: 'stranded' },
    });
  });

  it('never ends a Run that removing Components could save', () => {
    // Designs of four Components, from a trickle of Fuel to full Tanks, on ordinary Bodies and on
    // Bodies so heavy that even full Tanks barely lift off (where a second full Tank can be what
    // saves the Run, though the lightest configuration cannot).
    const pool: ComponentId[] = ['engine-1', 'engine-2', 'fuel-tank-1', 'fuel-tank-2', 'drill-2'];
    const pairs = pool.flatMap((a, i) => pool.slice(i).map((b) => [a, b] as const));
    const seen = { stranded: 0, warning: 0 };
    for (const seed of [1, 7, 2026]) {
      for (const heavier of [1, 4]) {
        const start = startRun(seed, 'hauler');
        const heavy = Object.fromEntries(
          listBodies(start.starSystem).map((body) => [
            body.id,
            { escapeVelocity: metersPerSecond(body.escapeVelocity * heavier) },
          ]),
        );
        const system = withBodies(start, heavy);
        for (const pair of pairs) {
          const design = fittedWith(system, ['engine-1', 'fuel-tank-1', ...pair]);
          for (const share of [0.02, 0.05, 0.1, 0.2, 0.4, 0.7, 1]) {
            const fuelMass = kilograms(design.spacecraft.fuelCapacity * share);
            const fuelled = { ...design, spacecraft: { ...design.spacecraft, fuelMass } };
            const verdict = assessStranding(fuelled).kind;
            if (verdict === 'clear') continue;
            seen[verdict] += 1;
            // Refunds might still buy a Jump Drive, so a warning may rest on an install instead.
            if (removals(fuelled).some(anyBodyHop)) expect(verdict).toBe('warning');
          }
        }
      }
    }
    expect(seen.stranded).toBeGreaterThan(10);
    expect(seen.warning).toBeGreaterThan(10);
  });
});

describe('the simulation settles Stranded itself', () => {
  // A Run rebuilt from its choices (install, remove, launchHop) must end exactly where the game did.
  const stranded = { kind: 'ended', end: { kind: 'stranded' } };

  it('a Hop that Arrives where no change could ever help ends the Run as Stranded', () => {
    // Seed 2: a sure Hop to Quydril leaves too little Fuel for any Hop, whatever is changed.
    const start = startRun(2, 'scout');
    const body = listBodies(start.starSystem).find(({ name }) => name === 'Quydril');
    if (!body) throw new Error('Seed 2 has no Quydril');
    const flown = launchHop(start, body.id);
    if (flown.kind !== 'flown') throw new Error('expected a Hop');
    expect(flown.flight.outcome).toEqual({ kind: 'arrived' });
    expect(flown.run.status).toEqual({
      kind: 'ended',
      end: {
        kind: 'stranded',
        bodyId: body.id,
        reason:
          'However you change its Components, your Spacecraft has at most 3.4 km/s of Δv, and ' +
          'the cheapest Hop needs 4.0 km/s.',
      },
    });
    expect(flown.run.hopsFlown).toBe(1);
  });

  it('installing a Component that spends the Materials a rescue needed ends the Run as Stranded', () => {
    const saveable = quiolxaexis(7);
    const spent = install(saveable, 2, 'drill-1');
    if (spent.kind !== 'installed') throw new Error('expected an install');
    expect(spent.run.status).toMatchObject(stranded);
    // A change that keeps the rescue in reach leaves the Run as it was.
    const kept = install(saveable, 2, 'engine-2');
    if (kept.kind !== 'installed') throw new Error('expected an install');
    expect(kept.run.status).toEqual(saveable.status);
  });

  it('a Stranded Run takes no more choices', () => {
    const ended = quiolxaexis(0);
    expect(() => install(ended, 2, 'drill-1')).toThrow(/ended/);
    expect(() => remove(ended, 1)).toThrow(/ended/);
    const someBody = listBodies(ended.starSystem).find((body) => body.landable);
    if (!someBody) throw new Error('no Body');
    expect(() => launchHop(ended, someBody.id)).toThrow(/ended/);
  });

  it('a replayed Run ends Stranded where the game did, and takes no choice after it', () => {
    const saveable = quiolxaexis(0);
    expect(saveable.status).toMatchObject(stranded);
    // Seed 7's own log: the one Hop to Quiolxaexis, which strands it.
    const replayed = replay(7, 'scout', saveable.choices);
    expect(replayed).toMatchObject({ kind: 'replayed', end: { kind: 'stranded' } });
    if (replayed.kind !== 'replayed') return;
    expect(replayed.run.status).toEqual(saveable.status);
    // A choice made after the end is refused.
    const after = replay(7, 'scout', [
      ...saveable.choices,
      { kind: 'install', slot: 2, componentId: 'drill-1' },
    ]);
    expect(after).toMatchObject({ kind: 'rejected', at: 1 });
  });

  it('a New Run is never Stranded', () => {
    for (let seed = 1; seed <= 100; seed++) {
      for (const chassis of ['scout', 'hauler', 'lancer'] as const) {
        expect(assessStranding(startRun(seed, chassis)).kind).toBe('clear');
      }
    }
  });
});

/** Every Run reachable from `from` by allowed removals, through the public `remove`. */
function removals(from: Run): Run[] {
  const reached: Run[] = [from];
  if (from.status.kind !== 'landed') return reached;
  for (let slot = 0; slot < from.spacecraft.slots.length; slot++) {
    const result = remove(from, slot);
    if (result.kind === 'removed') reached.push(...removals(result.run));
  }
  return reached;
}
