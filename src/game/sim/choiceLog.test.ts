import { describe, expect, it } from 'vitest';
import { createRng, type Rng } from '../lib/rng.ts';
import {
  advanceCruise,
  beginHop,
  CHASSIS_IDS,
  CHOICE_LOG_VERSION,
  COMPONENT_IDS,
  CRUISE_TUNING,
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
  startRepair,
  startRun,
  storedChoiceLog,
  type BodyId,
  type ChassisId,
  type ChoiceLog,
  type ComponentId,
  type HopTarget,
  type Run,
  type HopOptions,
} from './index.ts';
import { firstTarget, readyToJump } from './testing.ts';

/** Test fixture: a Body id a pinned seed is known to generate. */
const bodyId = (id: string): BodyId => id as BodyId;

/**
 * A random player: up to 80 tries at installing, removing and Hopping, refused ones included, while
 * the Spacecraft is landed. It mostly Hops where the Success Chance is good, so Runs last a while,
 * gather Materials and sometimes build a Jump Drive and try the Heliopause. 80, not 40, since #189:
 * a Run opens short of a Jump Drive's cost, so it takes longer to gather for one.
 */
function playRandomly(start: Run, rng: Rng, options: HopOptions = {}): Run {
  let run = start;
  for (let step = 0; step < 80 && run.status.kind === 'landed'; step++) {
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
      const begun = beginHop(run, target, options);
      if (begun.kind === 'flown') run = begun.run;
      if (begun.kind === 'cruising') run = flyCruise(begun.run, rng);
    }
  }
  return run;
}

/**
 * The random player's Cruise: most Engine fires get a Repair, some too late, so a few Runs end
 * Destroyed (#251); then the Cruise flies to its end.
 */
function flyCruise(cruising: Run, rng: Rng): Run {
  let run = cruising;
  const schedule = run.status.kind === 'cruising' ? run.status.cruise.schedule : [];
  for (const event of schedule) {
    if (event.kind !== 'engine-fire' || event.slot === null || rng.next() < 0.3) continue;
    const at = advanceCruise(run, event.tick + rng.int(1, 2 * CRUISE_TUNING.fireTicks));
    if (at.kind !== 'cruising') return at.run;
    const repaired = startRepair(at.run, event.slot);
    run = repaired.kind === 'repairing' ? repaired.run : at.run;
  }
  return run.status.kind === 'cruising' ? advanceCruise(run, CRUISE_TUNING.ticks).run : run;
}

/** The explorer's way out on `seed`, landed with a Jump Drive and the Heliopause found. */
/** A Run ready to Jump (`readyToJump`, flown with no Cruise events, as these pins are, #250). */
function ready(seed: number, chassisId: ChassisId): Run {
  const run = readyToJump(seed, chassisId);
  if (!run) throw new Error(`Seed ${String(seed)} should have a way out`);
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

const NO_EVENTS = { events: [] } as const;

function hopped(
  run: Run,
  target: Parameters<typeof launchHop>[1],
  options: Parameters<typeof launchHop>[2] = {},
): Run {
  const result = launchHop(run, target, options);
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
    // Scout seed 408: the Radar finds the Heliopause and the Materials pay for a Jump Drive, but the Hop
    // there runs out of Fuel. Re-pinned for #191 (was seed 24): only the Radar finds it now. Re-pinned
    // for #283 (was seed 416): the Hop range sends that explorer another way. Re-pinned for #280/#298
    // (was seed 340): Comms Detects a Fuel source first, and every Chassis flies alike.
    const built = ready(408, 'scout');
    const run = hopped(built, HELIOPAUSE, NO_EVENTS);
    expect(runEnd(run)?.kind).toBe('fell-short');

    const replayed = replay(408, 'scout', run.choices, NO_EVENTS);
    expect(replayed).toMatchObject({
      kind: 'replayed',
      end: runEnd(run),
      score: { starSystemsEscaped: 0, hopsFlown: built.hopsFlown + 1 },
    });
  });

  it('replay covers a Hop to the Heliopause, and the Jump into Star System 2', () => {
    // Seed 30: the Radar finds the Heliopause, and the Fuel left covers the Hop there. Re-pinned for
    // #191 (was seed 10): only the Radar finds it now.
    const built = ready(30, 'scout');
    const run = hopped(built, HELIOPAUSE, NO_EVENTS);
    expect(run.starSystemNumber).toBe(2);
    expect(run.status).toEqual({ kind: 'landed', bodyId: run.starSystem.startingMoonId });

    const replayed = replay(30, 'scout', run.choices, NO_EVENTS);
    expect(replayed).toMatchObject({
      kind: 'replayed',
      end: undefined,
      score: { starSystemsEscaped: 1, hopsFlown: built.hopsFlown + 1 },
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
    const ended = hopped(ready(408, 'scout'), HELIOPAUSE, NO_EVENTS);
    // Removing the Jump Drive is a choice a landed Run would take.
    const jumpDriveSlot = ended.spacecraft.slots.indexOf('jump-drive');
    const result = replay(
      408,
      'scout',
      [...ended.choices, { kind: 'remove', slot: jumpDriveSlot }],
      NO_EVENTS,
    );
    expect(result).toMatchObject({ kind: 'rejected', at: ended.choices.length });
    if (result.kind !== 'rejected') return;
    expect(result.why).toMatch(/not landed/);
  });

  it('a stored choice log survives a trip through JSON and back into a replay', () => {
    const run = hopped(ready(30, 'scout'), HELIOPAUSE, NO_EVENTS);
    const json = JSON.stringify(storedChoiceLog(run.choices));
    expect(JSON.parse(json)).toMatchObject({ version: CHOICE_LOG_VERSION });
    const parsed = parseChoiceLog(JSON.parse(json));
    expect(parsed).toEqual(run.choices);
    if (!parsed) return;
    expect(replay(30, 'scout', parsed, NO_EVENTS)).toMatchObject({ kind: 'replayed', run });
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
      stored([{ kind: 'repair' }]),
      stored([{ kind: 'rush', slot: 1, tick: -1 }]),
      stored([{ kind: 'rush', slot: 1, tick: '10' }]),
      stored([{ kind: 'repair', slot: 1, tick: 2.5 }]),
    ];
    for (const value of junk) expect(parseChoiceLog(value), JSON.stringify(value)).toBeUndefined();
    expect(parseChoiceLog(stored([]))).toEqual([]);
  });

  it('Repairs and Rushes parse with the Cruise tick they were made on, or none while landed', () => {
    const choices = [
      { kind: 'repair', slot: 1, tick: 120 },
      { kind: 'rush', slot: 1, tick: 300 },
      { kind: 'rush', slot: 0 },
    ];
    const json = JSON.stringify({ version: CHOICE_LOG_VERSION, choices });
    expect(parseChoiceLog(JSON.parse(json))).toEqual(choices);
  });

  it('over many seeds, replaying random choices gives the same Run, Score and end', () => {
    let heliopauseHops = 0;
    let endedRuns = 0;
    let destroyedRuns = 0;
    // 900 seeds: mild Debris now always hits (#320), so random Runs end earlier and fewer reach a fire.
    for (let seed = 1; seed <= 900; seed++) {
      const chassisId = CHASSIS_IDS[seed % CHASSIS_IDS.length] ?? 'scout';
      // Every tenth Run starts where a careful explorer has found the Heliopause (when it can), so
      // the random player also tries the Hop there: only the Radar finds it (#191).
      const ready = seed % 10 === 0 ? readyToJump(seed, chassisId) : undefined;
      const start = ready ?? startRun(seed, chassisId);
      // A ready Run was flown with no Cruise events, so it plays and replays on with none (#250).
      const events = ready ? NO_EVENTS : {};
      const run = playRandomly(start, createRng(seed * 7_919), events);
      heliopauseHops += run.choices.filter(
        (choice) => choice.kind === 'hop' && choice.target === HELIOPAUSE,
      ).length;
      if (runEnd(run)) endedRuns++;
      if (runEnd(run)?.kind === 'destroyed') destroyedRuns++;

      const replayed = replay(seed, chassisId, run.choices, events);
      if (replayed.kind !== 'replayed') throw new Error(`Seed ${String(seed)}: ${replayed.why}`);
      expect(replayed.run).toEqual(run);
      expect(replayed.score).toEqual(score(run));
      expect(replayed.end).toEqual(runEnd(run));
    }
    // The random player reaches every kind of choice, ends Runs and Hops to the Heliopause.
    expect(heliopauseHops).toBeGreaterThan(0);
    expect(endedRuns).toBeGreaterThan(0);
    expect(destroyedRuns).toBeGreaterThan(0);
    // About 1.5 s alone; each Jump generates a Star System with its redraws, so give it room under load.
  }, 30_000);

  it('replay covers the Jump: a Run replayed into Star System 2 and on is identical', () => {
    // Escape System 1 as above, then play on in System 2: Hop to its first target.
    const built = ready(41, 'scout');
    const system2 = hopped(built, HELIOPAUSE, NO_EVENTS);
    const run = hopped(system2, firstTarget(system2).id, NO_EVENTS);
    expect(run.starSystemNumber).toBe(2);
    expect(run.status).toEqual({ kind: 'landed', bodyId: firstTarget(system2).id });

    const replayed = replay(41, 'scout', run.choices, NO_EVENTS);
    if (replayed.kind !== 'replayed') throw new Error(`Expected a replay: ${replayed.kind}`);
    expect(replayed.run).toEqual(run);
    expect(replayed.score).toEqual({ starSystemsEscaped: 1, hopsFlown: built.hopsFlown + 2 });
  });
});
