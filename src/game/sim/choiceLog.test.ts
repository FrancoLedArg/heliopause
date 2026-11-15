import { describe, expect, it } from 'vitest';
import { createRng, type Rng } from '../lib/rng.ts';
import {
  CHASSIS_IDS,
  CHOICE_LOG_VERSION,
  COMPONENT_IDS,
  HELIOPAUSE,
  install,
  launchHop,
  listBodies,
  parseChoiceLog,
  planHop,
  remove,
  replay,
  runEnd,
  score,
  SLOT_COUNT,
  startRun,
  storedChoiceLog,
  type BodyId,
  type ChassisId,
  type ChoiceLog,
  type ComponentId,
  type HopTarget,
  type Run,
} from './index.ts';
import { firstTarget } from './testing.ts';

/** Test fixture: a Body id a pinned seed is known to generate. */
const bodyId = (id: string): BodyId => id as BodyId;

/**
 * A random player: up to 40 tries at installing, removing and Hopping, refused ones included, while
 * the Spacecraft is landed. It mostly Hops where the Success Chance is good, so Runs last a while,
 * gather Materials and sometimes build a Jump Drive and try the Heliopause.
 */
function playRandomly(start: Run, rng: Rng): Run {
  let run = start;
  for (let step = 0; step < 40 && run.status.kind === 'landed'; step++) {
    const roll = rng.next();
    if (roll < 0.35) {
      const componentId = COMPONENT_IDS[rng.int(0, COMPONENT_IDS.length - 1)] ?? 'engine-1';
      const result = install(run, rng.int(0, SLOT_COUNT - 1), componentId);
      if (result.kind === 'installed') run = result.run;
    } else if (roll < 0.45) {
      const result = remove(run, rng.int(0, SLOT_COUNT - 1));
      if (result.kind === 'removed') run = result.run;
    } else {
      const targets: HopTarget[] = [
        HELIOPAUSE,
        ...listBodies(run.starSystem).map((body) => body.id),
      ];
      const target = targets[rng.int(0, targets.length - 1)] ?? HELIOPAUSE;
      const planned = planHop(run, target);
      const risky = planned.kind === 'planned' && planned.plan.successChance < 0.6;
      if (risky && rng.next() < 0.8) continue;
      const result = launchHop(run, target);
      if (result.kind === 'flown') run = result.run;
    }
  }
  return run;
}

function installed(run: Run, slot: number, componentId: Parameters<typeof install>[2]): Run {
  const result = install(run, slot, componentId);
  if (result.kind !== 'installed') throw new Error(`Expected an install: ${result.reason.kind}`);
  return result.run;
}

function removed(run: Run, slot: number): Run {
  const result = remove(run, slot);
  if (result.kind !== 'removed') throw new Error(`Expected a removal: ${result.reason.kind}`);
  return result.run;
}

function hopped(run: Run, target: Parameters<typeof launchHop>[1]): Run {
  const result = launchHop(run, target);
  if (result.kind !== 'flown') throw new Error(`Expected a Hop: ${result.reason}`);
  return result.run;
}

describe('the choice log', () => {
  it('a New Run has made no choices', () => {
    expect(startRun(2026, 'scout').choices).toEqual([]);
  });

  it('the choice log records installs, removals and Hops in the order they were made', () => {
    const start = startRun(2026, 'hauler');
    const moon = firstTarget(start);
    const slot = start.spacecraft.slots.indexOf(null);
    const run = hopped(removed(installed(start, slot, 'fuel-tank-1'), slot), moon.id);
    expect(run.choices).toEqual([
      { kind: 'install', slot, componentId: 'fuel-tank-1' },
      { kind: 'remove', slot },
      { kind: 'hop', target: moon.id },
    ]);
  });

  it('a refused choice is not logged', () => {
    const start = startRun(2026, 'scout');
    const slot = start.spacecraft.slots.indexOf(null);
    const fitted = installed(start, slot, 'fuel-tank-1');

    // Too few Materials, an empty Slot, a Gas Giant, and the Heliopause without a Jump Drive.
    expect(install(fitted, slot + 1, 'jump-drive')).toMatchObject({ kind: 'refused' });
    expect(remove(fitted, slot + 1)).toMatchObject({ kind: 'refused' });
    const gasGiant = start.starSystem.planets.find((planet) => !planet.landable);
    if (!gasGiant) throw new Error('Seed 2026 has a Gas Giant');
    expect(launchHop(fitted, gasGiant.id)).toMatchObject({ kind: 'invalid-target' });
    expect(launchHop(fitted, HELIOPAUSE)).toMatchObject({ kind: 'invalid-target' });

    expect(fitted.choices).toEqual([{ kind: 'install', slot, componentId: 'fuel-tank-1' }]);
  });
});

describe('replay', () => {
  it("replaying a Run's choices from its seed and Chassis gives the same Run", () => {
    const start = startRun(2026, 'hauler');
    const slot = start.spacecraft.slots.indexOf(null);
    const run = hopped(installed(start, slot, 'drill-1'), firstTarget(start).id);

    const replayed = replay(2026, 'hauler', run.choices);
    expect(replayed).toMatchObject({ kind: 'replayed' });
    if (replayed.kind !== 'replayed') return;
    expect(replayed.run).toEqual(run);
  });

  it('a replayed Run ends the same way, with the same Score', () => {
    // Lancer seed 4: Materials from the opening pay for a Jump Drive, but the Hop to the Heliopause
    // runs out of Fuel. Re-pinned for #189 (was seed 3): Runs open on a Starting Moon now.
    const start = startRun(4, 'lancer');
    const mined = hopped(start, firstTarget(start).id);
    const built = installed(mined, mined.spacecraft.slots.indexOf(null), 'jump-drive');
    const run = hopped(built, HELIOPAUSE);
    expect(runEnd(run)?.kind).toBe('fell-short');

    const replayed = replay(4, 'lancer', run.choices);
    expect(replayed).toMatchObject({
      kind: 'replayed',
      end: runEnd(run),
      score: { starSystemsEscaped: 0, hopsFlown: 2 },
    });
  });

  it('replay covers a Hop to the Heliopause, and the Jump into Star System 2', () => {
    // Seed 7: the opening pays for the Jump Drive, and the Fuel left covers the Heliopause.
    // Re-pinned for #189 (was seed 8's planet-3-moon-2): Runs open on a Starting Moon now.
    const start = startRun(7, 'scout');
    const mined = hopped(start, firstTarget(start).id);
    const built = installed(mined, mined.spacecraft.slots.indexOf(null), 'jump-drive');
    const run = hopped(built, HELIOPAUSE);
    expect(run.starSystemNumber).toBe(2);
    expect(run.status).toEqual({ kind: 'landed', bodyId: run.starSystem.startingMoonId });

    const replayed = replay(7, 'scout', run.choices);
    expect(replayed).toMatchObject({
      kind: 'replayed',
      end: undefined,
      score: { starSystemsEscaped: 1, hopsFlown: 2 },
    });
    if (replayed.kind !== 'replayed') return;
    expect(replayed.run).toEqual(run);
  });

  it('a log the game could not have produced is rejected at its first impossible choice', () => {
    const home = startRun(2026, 'scout').starSystem.startingMoonId;
    const moon = firstTarget(startRun(2026, 'scout')).id;
    const rejectedAt = (log: ChoiceLog): unknown => {
      const result = replay(2026, 'scout', log);
      return result.kind === 'rejected' ? result.at : result.kind;
    };
    // A Jump Drive the starting Materials cannot pay for.
    expect(rejectedAt([{ kind: 'install', slot: 2, componentId: 'jump-drive' }])).toBe(0);
    // The only Engine, a Slot that does not exist, and a Component that does not.
    expect(
      rejectedAt([
        { kind: 'hop', target: moon },
        { kind: 'remove', slot: 0 },
      ]),
    ).toBe(1);
    expect(rejectedAt([{ kind: 'remove', slot: 7 }])).toBe(0);
    expect(rejectedAt([{ kind: 'install', slot: 2, componentId: 'warp' as ComponentId }])).toBe(0);
    // The Body it is on, a Body the Star System lacks, the Heliopause without a Jump Drive, and a
    // Body Comms has not Detected.
    expect(rejectedAt([{ kind: 'hop', target: home }])).toBe(0);
    expect(rejectedAt([{ kind: 'hop', target: bodyId('planet-99') }])).toBe(0);
    expect(rejectedAt([{ kind: 'hop', target: HELIOPAUSE }])).toBe(0);
    const start = startRun(2026, 'scout');
    const unknown = listBodies(start.starSystem).find(
      (body) => body.landable && !start.knowledge.detected.includes(body.id),
    );
    if (!unknown) throw new Error('Seed 2026 has an undetected Body');
    expect(rejectedAt([{ kind: 'hop', target: unknown.id }])).toBe(0);
  });

  it('a seed that is not a safe integer, or an unknown Chassis, cannot be replayed', () => {
    for (const seed of [Number.NaN, 1.5, Infinity, 2 ** 60]) {
      expect(replay(seed, 'scout', [])).toMatchObject({ kind: 'unplayable' });
    }
    // Test fixture: a Chassis id from a tampered record.
    expect(replay(1, 'warp' as ChassisId, [])).toMatchObject({ kind: 'unplayable' });
    expect(replay(-7, 'scout', [])).toMatchObject({ kind: 'replayed' });
  });

  it('no choice follows the end of a Run', () => {
    const start = startRun(4, 'lancer');
    const mined = hopped(start, firstTarget(start).id);
    const built = installed(mined, mined.spacecraft.slots.indexOf(null), 'jump-drive');
    const ended = hopped(built, HELIOPAUSE);
    // Removing the Jump Drive is a choice a landed Run would take.
    const jumpDriveSlot = ended.spacecraft.slots.indexOf('jump-drive');
    const result = replay(4, 'lancer', [...ended.choices, { kind: 'remove', slot: jumpDriveSlot }]);
    expect(result).toMatchObject({ kind: 'rejected', at: 3 });
    if (result.kind !== 'rejected') return;
    expect(result.why).toMatch(/not landed/);
  });

  it('a stored choice log survives a trip through JSON and back into a replay', () => {
    const start = startRun(7, 'scout');
    const mined = hopped(start, firstTarget(start).id);
    const run = hopped(
      installed(mined, mined.spacecraft.slots.indexOf(null), 'jump-drive'),
      HELIOPAUSE,
    );
    const json = JSON.stringify(storedChoiceLog(run.choices));
    expect(JSON.parse(json)).toMatchObject({ version: CHOICE_LOG_VERSION });
    const parsed = parseChoiceLog(JSON.parse(json));
    expect(parsed).toEqual(run.choices);
    if (!parsed) return;
    expect(replay(7, 'scout', parsed)).toMatchObject({ kind: 'replayed', run });
  });

  it('stored data that is not a choice log of this version does not parse', () => {
    const stored = (choices: unknown): unknown => ({ version: CHOICE_LOG_VERSION, choices });
    const junk: unknown[] = [
      null,
      'x',
      42,
      [],
      { choices: [] },
      { version: CHOICE_LOG_VERSION + 1, choices: [] },
      { version: '1', choices: [] },
      stored(null),
      stored('x'),
      stored([null]),
      stored([42]),
      stored([{}]),
      stored([{ kind: 'jump' }]),
      stored([{ kind: 'INSTALL', slot: 2, componentId: 'drill-1' }]),
      stored([{ kind: 'install' }]),
      stored([{ kind: 'install', slot: 2, componentId: 'warp' }]),
      stored([{ kind: 'install', slot: 2, componentId: 'toString' }]),
      stored([{ kind: 'install', slot: 0.5, componentId: 'drill-1' }]),
      stored([{ kind: 'remove', slot: '2' }]),
      stored([{ kind: 'hop', target: 5 }]),
      stored([{ kind: 'hop' }]),
      stored([{ kind: 'hop', target: 'planet-1' }, null]),
    ];
    for (const value of junk) expect(parseChoiceLog(value), JSON.stringify(value)).toBeUndefined();
    expect(parseChoiceLog(stored([]))).toEqual([]);
  });

  it('over many seeds, replaying random choices gives the same Run, Score and end', () => {
    let heliopauseHops = 0;
    let endedRuns = 0;
    for (let seed = 1; seed <= 300; seed++) {
      const chassisId = CHASSIS_IDS[seed % CHASSIS_IDS.length] ?? 'scout';
      const run = playRandomly(startRun(seed, chassisId), createRng(seed * 7_919));
      heliopauseHops += run.choices.filter(
        (choice) => choice.kind === 'hop' && choice.target === HELIOPAUSE,
      ).length;
      if (runEnd(run)) endedRuns++;

      const replayed = replay(seed, chassisId, run.choices);
      if (replayed.kind !== 'replayed') throw new Error(`Seed ${String(seed)}: ${replayed.why}`);
      expect(replayed.run).toEqual(run);
      expect(replayed.score).toEqual(score(run));
      expect(replayed.end).toEqual(runEnd(run));
    }
    // The random player reaches every kind of choice, ends Runs and Hops to the Heliopause.
    expect(heliopauseHops).toBeGreaterThan(0);
    expect(endedRuns).toBeGreaterThan(0);
    // About 1.5 s alone; each Jump generates a Star System with its redraws, so give it room under load.
  }, 30_000);

  it('replay covers the Jump: a Run replayed into Star System 2 and on is identical', () => {
    // Escape System 1 as above, then play on in System 2: Hop to its first target.
    const start = startRun(7, 'scout');
    const mined = hopped(start, firstTarget(start).id);
    const built = installed(mined, mined.spacecraft.slots.indexOf(null), 'jump-drive');
    const system2 = hopped(built, HELIOPAUSE);
    const run = hopped(system2, firstTarget(system2).id);
    expect(run.starSystemNumber).toBe(2);
    expect(run.status).toEqual({ kind: 'landed', bodyId: firstTarget(system2).id });

    const replayed = replay(7, 'scout', run.choices);
    if (replayed.kind !== 'replayed') throw new Error(`Expected a replay: ${replayed.kind}`);
    expect(replayed.run).toEqual(run);
    expect(replayed.score).toEqual({ starSystemsEscaped: 1, hopsFlown: 3 });
  });
});
