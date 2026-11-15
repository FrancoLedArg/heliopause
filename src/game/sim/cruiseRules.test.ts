import { describe, expect, it } from 'vitest';
import {
  advanceCruise,
  assessStranding,
  availableDeltaV,
  beginHop,
  CRUISE_EVENT_KINDS,
  CRUISE_TUNING,
  cruiseSchedule,
  DESTROYED_REASON,
  firstDetectedBody,
  HELIOPAUSE,
  knownBodies,
  launchHop,
  materials,
  planHop,
  replay,
  listBodies,
  currentBody,
  rushCost,
  rushRepair,
  score,
  startRepair,
  startRun,
  type Choice,
  type CruiseResult,
  type HopTarget,
  type Run,
  type ScheduledEvent,
} from './index.ts';
import { withDetected } from './generation.ts';
import { onInnerPlanet, withDeltaV, withJumpDrive } from './testing.ts';

const SEEDS = Array.from({ length: 500 }, (_, i) => i * 104_729 + 7);
const ENGINE = 0;
const FUEL_TANK = 1;
const opening = startRun(2026, 'scout');
const firstHop = firstDetectedBody(opening.starSystem).id;
/** The opening Run past its mild first Hops: a leak there drains at the full rate, with no floor. */
const seasoned: Run = { ...opening, hopsFlown: CRUISE_TUNING.mildHops };

/** The Run in the Cruise of a Hop to `target` with `schedule` injected, before its first tick. */
function cruising(from: Run, target: HopTarget, schedule: readonly ScheduledEvent[]): Run {
  const begun = beginHop(from, target, { schedule });
  if (begun.kind !== 'cruising') throw new Error(`Expected a Cruise, got ${begun.kind}`);
  return begun.run;
}

/** The Run with its Cruise advanced to `tick`, which must leave it cruising. */
function at(run: Run, tick: number): Run {
  const result = advanceCruise(run, tick);
  if (result.kind !== 'cruising') throw new Error(`Expected to be cruising, got ${result.kind}`);
  return result.run;
}

function finish(run: Run): CruiseResult {
  return advanceCruise(run, CRUISE_TUNING.ticks);
}

function flown(run: Run) {
  const result = finish(run);
  if (result.kind !== 'flown') throw new Error(`Expected the Hop to be flown, got ${result.kind}`);
  return result;
}

function repairing(run: Run, slot: number): Run {
  const result = startRepair(run, slot);
  if (result.kind !== 'repairing') throw new Error(`Repair refused: ${result.reason.kind}`);
  return result.run;
}

const damaged = (run: Run, slot: number) => run.spacecraft.damage[slot] !== null;

const leakAt = (tick: number): ScheduledEvent => ({ kind: 'fuel-leak', tick, slot: FUEL_TANK });
const engineHitAt = (tick: number): ScheduledEvent => ({
  kind: 'debris-field',
  tick,
  slot: ENGINE,
});

/** A second landable Body the Run knows, other than the first Hop's. */
function secondTarget(run: Run) {
  const next = knownBodies(run).find((body) => body.landable && body.id !== firstHop);
  if (!next) throw new Error('Expected a second target');
  return next;
}

describe('the three-part Hop', () => {
  it('a Cruise with no events flies a Hop as it always has', () => {
    const begun = beginHop(opening, firstHop, { schedule: [] });
    if (begun.kind !== 'cruising' || begun.run.status.kind !== 'cruising') {
      throw new Error('Expected a Cruise');
    }
    expect(begun.run.status.cruise.schedule).toEqual([]);
    const launched = launchHop(opening, firstHop, { schedule: [] });
    expect(flown(begun.run).run).toEqual(launched.kind === 'flown' && launched.run);
  });

  it('a real Run has a Fuel leak in its first Cruise (#250)', () => {
    const begun = beginHop(opening, firstHop);
    if (begun.kind !== 'cruising' || begun.run.status.kind !== 'cruising')
      throw new Error('Expected a Cruise');
    const kinds = begun.run.status.cruise.schedule.map((event) => event.kind);
    expect(kinds.length).toBeGreaterThanOrEqual(1);
    expect(kinds.every((kind) => kind === 'fuel-leak')).toBe(true);
  });

  it('a Hop that Fell Short has no Cruise', () => {
    const begun = beginHop(withDeltaV(opening, 10), firstHop, { events: CRUISE_EVENT_KINDS });
    if (begun.kind !== 'flown') throw new Error('Expected the Hop to end at launch');
    expect(begun.flight.outcome.kind).toBe('fell-short');
    expect(begun.flight.cruiseEvents).toEqual([]);
  });

  it('the same seed and choices give the same Cruise events at the same ticks', () => {
    const schedule = cruiseSchedule(9, 4, 2, opening.spacecraft, CRUISE_EVENT_KINDS);
    const play = () => flown(cruising(opening, firstHop, schedule)).flight.cruiseEvents;
    expect(play().length).toBeGreaterThan(0);
    expect(play()).toEqual(play());
  });
});

describe('Damage', () => {
  it('a leak loses Fuel every tick until its Repair finishes', () => {
    const leaking = at(cruising(seasoned, firstHop, [leakAt(100)]), 100);
    const start = leaking.spacecraft.fuelMass;
    // A leak past the mild Hops on a scout: 0.25% of its 21 t Fuel capacity a second, 5.25 kg a tick.
    expect(start - at(leaking, 200).spacecraft.fuelMass).toBeCloseTo(525, 6);
    const fixing = repairing(at(leaking, 200), FUEL_TANK);
    // A Fuel Tank's Repair takes 30 s: done on tick 500, after that tick's drain.
    expect(damaged(at(fixing, 499), FUEL_TANK)).toBe(true);
    const fixed = at(fixing, 500);
    expect(damaged(fixed, FUEL_TANK)).toBe(false);
    expect(at(fixed, 900).spacecraft.fuelMass).toBe(fixed.spacecraft.fuelMass);
    expect(start - fixed.spacecraft.fuelMass).toBeCloseTo(400 * 5.25, 6);
  });

  it('a mild leak left alone visibly drains the tank: at least a tenth of it (#250)', () => {
    const leaking = cruising(opening, firstHop, [leakAt(100)]);
    const { fuelCapacity } = opening.spacecraft;
    const result = flown(leaking);
    expect(result.flight.fuelLost / fuelCapacity).toBeGreaterThanOrEqual(0.1);
    expect(result.run.status.kind).toBe('landed');
  });

  it('a Damaged Engine gives less Δv from the same Fuel', () => {
    const before = cruising(opening, firstHop, [engineHitAt(50)]);
    const after = at(before, 50);
    expect(after.spacecraft.fuelMass).toBe(before.spacecraft.fuelMass);
    const ratio = availableDeltaV(after.spacecraft) / availableDeltaV(before.spacecraft);
    expect(ratio).toBeCloseTo(0.85, 9);
  });

  it('an event never hits a Component that is already Damaged', () => {
    const later: ScheduledEvent = { kind: 'debris-field', tick: 300, slot: FUEL_TANK };
    const run = at(cruising(opening, firstHop, [leakAt(100), later]), 300);
    if (run.status.kind !== 'cruising') throw new Error('Expected a Cruise');
    expect(run.status.cruise.struck.map((event) => event.slot)).toEqual([FUEL_TANK, null]);
  });

  it('the Landing is flown with the Fuel and Engine the Cruise left', () => {
    const sound = launchHop(opening, firstHop);
    if (sound.kind !== 'flown') throw new Error('Expected a flight');
    // Fuel for exactly the Burns this Hop draws, and 1 m/s more: it lands with nothing to spare.
    const actual = sound.flight.burns.reduce(
      (sum, burn) => sum + (burn.status === 'completed' ? burn.actual : 0),
      0,
    );
    const tight = withDeltaV(opening, actual + 1);
    expect(flown(cruising(tight, firstHop, [])).flight.outcome.kind).toBe('arrived');
    const hit = flown(cruising(tight, firstHop, [engineHitAt(100)]));
    expect(hit.flight.outcome.kind).toBe('crashed');
    expect(hit.flight.why).toContain('Damage in the Cruise');

    const leaked = flown(cruising(seasoned, firstHop, [leakAt(1_000)]));
    expect(leaked.flight.fuelLost).toBeCloseTo(201 * 5.25, 6);
    const calm = launchHop(seasoned, firstHop, { schedule: [] });
    expect(calm.kind === 'flown' && leaked.flight.fuelRemaining).toBeLessThan(
      calm.kind === 'flown' ? calm.flight.fuelRemaining : 0,
    );
  });

  it(
    'no first Hop the plan shows at 100% is Crashed or Stranded by its mild events, with no Repair at all (#188)',
    { timeout: 90_000 },
    () => {
      const chassis = ['scout', 'hauler', 'lancer'] as const;
      const lost: string[] = [];
      let flownHops = 0;
      for (const [i, seed] of SEEDS.entries()) {
        const start = startRun(seed, chassis[i % 3] ?? 'scout');
        for (const body of listBodies(start.starSystem)) {
          if (!body.landable || body.id === currentBody(start).id) continue;
          // #188 weighs every landable Body as if Detected.
          const knowing = withDetected(start, body);
          const planned = planHop(knowing, body.id);
          if (planned.kind !== 'planned' || planned.plan.successChance < 1) continue;
          const calm = launchHop(knowing, body.id, { schedule: [] });
          if (calm.kind !== 'flown' || calm.run.status.kind !== 'landed') continue;
          const begun = beginHop(knowing, body.id, { events: CRUISE_EVENT_KINDS });
          if (begun.kind !== 'cruising') throw new Error(`Seed ${String(seed)}: no Cruise`);
          const result = flown(begun.run);
          flownHops++;
          if (result.run.status.kind !== 'landed') {
            lost.push(`${String(seed)} ${body.id}: ${result.flight.outcome.kind}`);
          }
        }
      }
      expect(flownHops).toBeGreaterThan(1_000);
      expect(lost.slice(0, 10)).toEqual([]);
    },
  );
});

describe('the Engine fire', () => {
  const fire = () =>
    cruising(opening, firstHop, [{ kind: 'engine-fire', tick: 100, slot: ENGINE }]);

  it('a burning Engine with no Repair started for 30 s destroys the Spacecraft', () => {
    // It caught fire on tick 100 and burns ticks 101 to 400: 300 ticks, 30 s.
    const burning = at(fire(), 399);
    const result = advanceCruise(burning, 400);
    expect(result.kind).toBe('destroyed');
    expect(result.run.status).toEqual({
      kind: 'ended',
      end: { kind: 'destroyed', reason: DESTROYED_REASON },
    });
  });

  it('a Destroyed Run ends with a plain reason and keeps its Score', () => {
    const { run } = finish(fire());
    expect(DESTROYED_REASON).toBe('The Engine fire reached the Fuel.');
    expect(score(run)).toEqual({ starSystemsEscaped: 0, hopsFlown: 1 });
  });

  it('starting a Repair puts out an Engine fire', () => {
    const saved = repairing(at(fire(), 398), ENGINE);
    expect(finish(saved).kind).toBe('flown');
    // An Engine's Repair takes 40 s: started on tick 398, done on tick 798.
    expect(damaged(at(saved, 797), ENGINE)).toBe(true);
    expect(damaged(at(saved, 798), ENGINE)).toBe(false);
  });

  it('never strikes on the first Hops of a Run, so neither can Destroyed', () => {
    for (const seed of SEEDS) {
      for (let hop = 1; hop <= CRUISE_TUNING.mildHops; hop++) {
        const schedule = cruiseSchedule(seed, hop, 1, opening.spacecraft, CRUISE_EVENT_KINDS);
        expect(schedule.map((event) => event.kind)).not.toContain('engine-fire');
      }
    }
  });
});

describe('Repair and Rush', () => {
  const leak = () => at(cruising(opening, firstHop, [leakAt(100)]), 100);

  it('a Repair is refused for an empty Slot, a sound Component, or one already being Repaired', () => {
    const run = leak();
    expect(startRepair(run, 3)).toMatchObject({ reason: { kind: 'empty-slot' } });
    expect(startRepair(run, ENGINE)).toMatchObject({ reason: { kind: 'not-damaged' } });
    expect(startRepair(repairing(run, FUEL_TANK), FUEL_TANK)).toMatchObject({
      reason: { kind: 'already-repairing' },
    });
  });

  it('a Repair costs nothing and is logged with its Cruise tick', () => {
    const run = repairing(leak(), FUEL_TANK);
    expect(run.materials).toBe(opening.materials);
    expect(run.choices.at(-1)).toEqual({ kind: 'repair', slot: FUEL_TANK, tick: 100 });
  });

  it('Rush spends Materials for the time left and finishes the Repair', () => {
    const run = leak();
    // 30 s of Repair left: 6 started 5 s.
    expect(rushCost(run.spacecraft, FUEL_TANK)).toBe(6);
    // 16 s of it done, 14 s left: 3 started 5 s, so the price falls as the Repair runs.
    expect(rushCost(at(repairing(run, FUEL_TANK), 260).spacecraft, FUEL_TANK)).toBe(3);
    const result = rushRepair(run, FUEL_TANK);
    if (result.kind !== 'rushed') throw new Error('Expected a Rush');
    expect(result.run.materials).toBe(opening.materials - 6);
    expect(damaged(result.run, FUEL_TANK)).toBe(false);
    expect(result.run.choices.at(-1)).toEqual({ kind: 'rush', slot: FUEL_TANK, tick: 100 });
    expect(at(result.run, 300).spacecraft.fuelMass).toBe(result.run.spacecraft.fuelMass);
  });

  it('Rush is refused without enough Materials', () => {
    const poor = { ...leak(), materials: materials(5) };
    expect(rushRepair(poor, FUEL_TANK)).toEqual({
      kind: 'refused',
      reason: { kind: 'not-enough-materials', cost: 6, have: 5 },
    });
  });

  it('a Repair still running at the end of the Cruise resumes in the next one', () => {
    const late = repairing(at(cruising(opening, firstHop, [leakAt(1_100)]), 1_100), FUEL_TANK);
    const landed = flown(late).run;
    expect(landed.status.kind).toBe('landed');
    expect(landed.spacecraft.damage[FUEL_TANK]).toEqual({ repair: 100, burning: null });
    // Landed, nothing leaks or repairs; a Rush would cost the 20 s left.
    expect(rushCost(landed.spacecraft, FUEL_TANK)).toBe(4);
    const again = cruising(landed, secondTarget(landed).id, []);
    expect(damaged(at(again, 199), FUEL_TANK)).toBe(true);
    expect(damaged(at(again, 200), FUEL_TANK)).toBe(false);
  });

  it('a Rush while landed is logged with no tick', () => {
    const landed = flown(cruising(opening, firstHop, [leakAt(1_100)])).run;
    const result = rushRepair({ ...landed, materials: materials(50) }, FUEL_TANK);
    if (result.kind !== 'rushed') throw new Error('Expected a Rush');
    expect(result.run.choices.at(-1)).toEqual({ kind: 'rush', slot: FUEL_TANK });
  });

  it('Damage survives a Jump', () => {
    const ready = withDeltaV(withJumpDrive(onInnerPlanet(opening)), 200_000);
    const result = flown(cruising(ready, HELIOPAUSE, [leakAt(1_100)]));
    expect(result.run.starSystemNumber).toBe(2);
    expect(damaged(result.run, FUEL_TANK)).toBe(true);
  });

  it("the plan uses a Damaged Component's figures", () => {
    const run = flown(cruising(opening, firstHop, [engineHitAt(1_100)])).run;
    const next = secondTarget(run);
    const available = (r: Run) => {
      const planned = planHop(r, next.id);
      if (planned.kind !== 'planned') throw new Error('Expected a plan');
      return planned.plan.availableDeltaV;
    };
    const rushed = rushRepair({ ...run, materials: materials(50) }, ENGINE);
    if (rushed.kind !== 'rushed') throw new Error('Expected a Rush');
    expect(available(run) / available(rushed.run)).toBeCloseTo(0.85, 9);
  });

  it('Stranded counts a Repair the Materials can Rush as a way out', () => {
    const hit = flown(cruising(opening, firstHop, [engineHitAt(1_100)])).run;
    const needs = knownBodies(hit).flatMap((body) => {
      const planned = body.landable && body.id !== firstHop ? planHop(hit, body.id) : undefined;
      return planned?.kind === 'planned' ? [planned.plan.totalEstimate * 0.9] : [];
    });
    // Just short of any chance with the Damaged Engine; Repaired, it gives 1 / 0.85 times as much.
    const short = { ...withDeltaV(hit, Math.min(...needs) - 1), materials: materials(50) };
    expect(assessStranding(short)).toEqual({
      kind: 'warning',
      warning: 'No Hop is possible as built. Repair the Engine to get your Δv back.',
    });
  });
});

describe('the choice log in the Cruise', () => {
  /** Plays Hops with seeded events of every kind: a Repair as each strikes, every other one Rushed. */
  function play(seed: number, hops: number): Run {
    let run = startRun(seed, 'lancer');
    let rush = false;
    for (let hop = 0; hop < hops && run.status.kind === 'landed'; hop++) {
      const from = run;
      const target = knownBodies(from).find((body) => {
        const planned = body.landable ? planHop(from, body.id) : undefined;
        return planned?.kind === 'planned' && planned.plan.successChance === 1;
      });
      if (!target) break;
      const begun = beginHop(run, target.id, { events: CRUISE_EVENT_KINDS });
      if (begun.kind === 'invalid-target') break;
      run = begun.run;
      if (run.status.kind !== 'cruising') break;
      for (const event of run.status.cruise.schedule) {
        const result = advanceCruise(run, event.tick);
        run = result.run;
        if (result.kind !== 'cruising' || event.slot === null || !damaged(run, event.slot))
          continue;
        const acted = rush ? rushRepair(run, event.slot) : startRepair(run, event.slot);
        if (acted.kind !== 'refused') run = acted.run;
        rush = !rush;
      }
      if (run.status.kind === 'cruising') run = finish(run).run;
    }
    return run;
  }

  const isCruiseChoice = (choice: Choice) =>
    (choice.kind === 'repair' || choice.kind === 'rush') && choice.tick !== undefined;

  it('a replayed choice log with Repairs and Rushes at their ticks rebuilds the same Run', () => {
    let cruiseChoices = 0;
    for (const seed of SEEDS.slice(0, 40)) {
      const played = play(seed, 4);
      cruiseChoices += played.choices.filter(isCruiseChoice).length;
      const replayed = replay(seed, 'lancer', played.choices, { events: CRUISE_EVENT_KINDS });
      expect(replayed.kind === 'replayed' && replayed.run).toEqual(played);
    }
    expect(cruiseChoices).toBeGreaterThan(10);
  });

  it('replay rejects a Cruise choice whose tick goes back in time', () => {
    const seed = SEEDS.find((s) => play(s, 2).choices.some(isCruiseChoice));
    if (seed === undefined) throw new Error('Expected a Run with a Cruise choice');
    const { choices } = play(seed, 2);
    const at = choices.findIndex(isCruiseChoice);
    const choice = choices[at];
    if (choice?.kind !== 'repair' && choice?.kind !== 'rush') throw new Error('Expected a Repair');
    const log = [...choices.slice(0, at + 1), { ...choice, tick: (choice.tick ?? 1) - 1 }];
    expect(replay(seed, 'lancer', log, { events: CRUISE_EVENT_KINDS })).toMatchObject({
      kind: 'rejected',
      at: at + 1,
    });
  });
});
