import { describe, expect, it } from 'vitest';
import {
  firstTarget,
  heliopauseFound,
  heliopauseInRange,
  landedOn,
  withDeltaV,
  withJumpDrive,
} from './testing.ts';
import {
  assessStranding,
  bodyKnowledge,
  flyHop,
  HELIOPAUSE,
  launchHop,
  planHop,
  replay,
  CHASSIS_IDS,
  currentBody,
  findBody,
  isDepleted,
  listBodies,
  STARTING_MATERIALS,
  startingMoon,
  startRun,
  type Body,
  type BodyId,
  type Moon,
  type Run,
} from './index.ts';

/**
 * How far apart two Moons of one planet are, from their orbits round it (same units as the
 * orbits): the law of cosines, worked out here apart from the module.
 */
function distanceOnOrbits(a: Moon, b: Moon): number {
  const ra = a.distanceFromPlanet;
  const rb = b.distanceFromPlanet;
  return Math.sqrt(ra ** 2 + rb ** 2 - 2 * ra * rb * Math.cos(a.orbitAngle - b.orbitAngle));
}

const SEEDS = Array.from({ length: 60 }, (_, i) => i * 7_919 + 5);

/** The Bodies a Run knows at a level of knowledge, by id. */
function idsAt(run: Run, level: 'detected' | 'surveyed'): string[] {
  return listBodies(run.starSystem)
    .filter((body) => bodyKnowledge(run, body.id) === level)
    .map((body) => body.id);
}

describe('the opening', () => {
  it('a new Run knows only its Starting Moon and one Detected Body', () => {
    for (const seed of SEEDS) {
      const run = startRun(seed, 'scout');
      const moon = startingMoon(run.starSystem);
      expect(currentBody(run)).toEqual(moon);
      const planet = findBody(run.starSystem, moon.planetId);
      // A Gas Giant is shown for what it is, so it is Surveyed with its Moon (#96).
      const surveyed = planet?.kind === 'gas-giant' ? [moon.planetId, moon.id] : [moon.id];
      expect(idsAt(run, 'surveyed').sort()).toEqual(surveyed.sort());
      expect(idsAt(run, 'detected')).toHaveLength(1);
    }
  });

  it("the Starting Moon's yield is collected at Run start, and the Moon is Depleted", () => {
    let icy = 0;
    let rocky = 0;
    for (const seed of SEEDS) {
      const run = startRun(seed, 'lancer');
      const moon = startingMoon(run.starSystem);
      expect(isDepleted(run, moon.id)).toBe(true);
      expect(run.depleted).toEqual([moon.id]);
      if (moon.composition === 'rocky') {
        rocky++;
        expect(run.startingYield).toEqual({ kind: 'materials', collected: moon.baseYield });
        // The Materials flow in up to a New Run's, or the yield when it is bigger (#189 review).
        expect(run.materials).toBe(Math.max(STARTING_MATERIALS, moon.baseYield));
        expect(run.spacecraft.fuelMass).toBe(run.spacecraft.fuelCapacity);
      } else {
        icy++;
        // The Fuel flows in from the ice, and the Tank is full once it has.
        expect(run.startingYield).toEqual({
          kind: 'fuel',
          collected: moon.baseYield,
          leftBehind: 0,
        });
        expect(run.materials).toBe(STARTING_MATERIALS);
        expect(run.spacecraft.fuelMass).toBe(run.spacecraft.fuelCapacity);
      }
    }
    // Icy or Rocky at random, wherever the Moon is.
    expect(icy).toBeGreaterThan(SEEDS.length / 4);
    expect(rocky).toBeGreaterThan(SEEDS.length / 4);
  });

  it("on a rocky planet's Moon the first Detected Body is that planet", () => {
    const onRocky = SEEDS.map((seed) => startRun(seed, 'scout')).filter(
      (run) => findBody(run.starSystem, startingMoon(run.starSystem).planetId)?.landable,
    );
    expect(onRocky.length).toBeGreaterThan(SEEDS.length / 2);
    for (const run of onRocky) {
      expect(idsAt(run, 'detected')).toEqual([startingMoon(run.starSystem).planetId]);
    }
  });

  it("on a Gas Giant's Moon the first Detected Body is the nearest sibling Moon", () => {
    const onGasGiant = Array.from({ length: 400 }, (_, i) => startRun(i * 31 + 7, 'scout')).filter(
      (run) =>
        findBody(run.starSystem, startingMoon(run.starSystem).planetId)?.kind === 'gas-giant',
    );
    expect(onGasGiant.length).toBeGreaterThan(10);
    for (const run of onGasGiant) {
      const moon = startingMoon(run.starSystem);
      const planet = findBody(run.starSystem, moon.planetId);
      if (planet?.kind !== 'gas-giant') throw new Error('Expected a Gas Giant');
      expect(bodyKnowledge(run, planet.id)).toBe('surveyed');
      const [detected] = idsAt(run, 'detected');
      const siblings = planet.moons.filter((m) => m.id !== moon.id);
      expect(siblings.map((m) => m.id)).toContain(detected);
      const distance = (id: string) => {
        const sibling = siblings.find((m) => m.id === id);
        if (!sibling) throw new Error(`No sibling ${id}`);
        return distanceOnOrbits(moon, sibling);
      };
      for (const sibling of siblings) {
        expect(distance(detected ?? '')).toBeLessThanOrEqual(distance(sibling.id));
      }
    }
  });

  it('a new Run has not found the Heliopause: only the Radar finds it', () => {
    for (const seed of SEEDS) expect(startRun(seed, 'scout').knowledge.heliopauseFound).toBe(false);
  });

  it('every Chassis starts on the same Starting Moon knowing the same Bodies', () => {
    for (const seed of SEEDS.slice(0, 10)) {
      const [first, ...rest] = CHASSIS_IDS.map((chassis) => startRun(seed, chassis));
      for (const run of rest) {
        expect(run.status).toEqual(first?.status);
        expect(run.knowledge).toEqual(first?.knowledge);
      }
    }
  });
});

/** Every Burn at its estimate. */
const AT_ESTIMATE = { next: () => 0.5, int: (min: number) => min };

/** The Run after flying a Hop to `target` at its estimate. */
function arrive(run: Run, target: string): ReturnType<typeof flyHop> {
  const planned = planHop(run, target as BodyId);
  if (planned.kind !== 'planned') throw new Error(`No plan to ${target}: ${planned.why}`);
  return flyHop(run, planned.plan, AT_ESTIMATE);
}

describe('landing and Comms', () => {
  it('landing Surveys only the Body landed on', () => {
    for (const seed of SEEDS.slice(0, 20)) {
      const run = startRun(seed, 'scout');
      const target = firstTarget(run);
      const { run: after, flight } = arrive(run, target.id);
      expect(bodyKnowledge(after, target.id)).toBe('surveyed');
      expect(idsAt(after, 'surveyed').sort()).toEqual(
        [...idsAt(run, 'surveyed'), target.id].sort(),
      );
      expect(flight.reveal?.surveyed).toBe(target.id);
    }
  });

  it('after a landing Comms Detects the nearest landable Body not yet Detected', () => {
    for (const seed of SEEDS.slice(0, 20)) {
      const run = startRun(seed, 'scout');
      const target = firstTarget(run);
      const { run: after, flight } = arrive(run, target.id);
      const newlyDetected = idsAt(after, 'detected');
      expect(newlyDetected).toHaveLength(1);
      expect(flight.reveal?.detected).toEqual(newlyDetected);
      const [found] = newlyDetected;
      const body = findBody(run.starSystem, found as BodyId);
      if (!body) throw new Error(`Comms Detected no Body of the Star System: ${String(found)}`);
      expect(body.landable).toBe(true);
      // Nothing undetected and landable is nearer than what Comms found.
      const distance = (b: Body) => auBetween(run, target, b);
      const others = listBodies(run.starSystem).filter(
        (b) => b.landable && bodyKnowledge(run, b.id) === 'unknown',
      );
      for (const other of others) expect(distance(body)).toBeLessThanOrEqual(distance(other));
    }
  });

  it('Comms never Detects a Gas Giant, and the map only grows', () => {
    let run = startRun(123, 'lancer');
    const seen = new Set<string>(run.knowledge.detected);
    for (let hop = 0; hop < 6 && run.status.kind === 'landed'; hop++) {
      // Hop to the newest known landable Body that is not where the Spacecraft is.
      const here = currentBody(run).id;
      const next = [...run.knowledge.detected]
        .reverse()
        .find((id) => id !== here && findBody(run.starSystem, id)?.landable);
      if (!next) break;
      const launched = launchHop(run, next);
      if (launched.kind !== 'flown') throw new Error(launched.why);
      for (const id of launched.flight.reveal?.detected ?? []) {
        expect(findBody(run.starSystem, id)?.kind).not.toBe('gas-giant');
      }
      if (launched.run.status.kind !== 'landed') break;
      for (const id of seen) expect(launched.run.knowledge.detected).toContain(id);
      for (const id of launched.run.knowledge.detected) seen.add(id);
      run = launched.run;
    }
    expect(seen.size).toBeGreaterThan(3);
  });

  it('a Hop to a Body Comms has not Detected cannot be planned', () => {
    const run = startRun(2026, 'scout');
    const unknown = listBodies(run.starSystem).find(
      (b) => b.landable && bodyKnowledge(run, b.id) === 'unknown',
    );
    if (!unknown) throw new Error('Expected an unknown Body');
    expect(planHop(run, unknown.id)).toMatchObject({
      kind: 'invalid-target',
      reason: 'not-detected',
    });
    // So a forged choice log naming it is rejected on replay.
    expect(replay(2026, 'scout', [{ kind: 'hop', target: unknown.id }])).toMatchObject({
      kind: 'rejected',
      at: 0,
    });
  });

  it('the Heliopause is no Hop target until it is found', () => {
    const run = withJumpDrive(startRun(2026, 'scout'));
    expect(planHop(run, HELIOPAUSE)).toMatchObject({
      kind: 'invalid-target',
      reason: 'not-found',
    });
    expect(planHop(heliopauseFound(run), HELIOPAUSE).kind).toBe('planned');
  });
});

describe('Stranded and the Jump', () => {
  it('Stranded ignores Bodies that are not Detected', () => {
    // Stood on the first target with only the Starting Moon known besides, and that one forgotten
    // too: no Hop is known, however near the undetected Bodies are.
    const run = startRun(2026, 'scout');
    const target = firstTarget(run);
    const there = landedOn(run, target.id);
    const knowsOnlyHere = {
      ...there,
      knowledge: { detected: [target.id], surveyed: [target.id], heliopauseFound: false },
    };
    expect(assessStranding(there).kind).toBe('clear');
    expect(assessStranding(knowsOnlyHere).kind).toBe('stranded');
  });

  it('Stranded counts the Heliopause only once it is found', () => {
    const run = startRun(2026, 'scout');
    const target = firstTarget(run);
    // Fuel for any Hop, a Jump Drive aboard, and no Body known but the one it stands on.
    // The planets beyond taken out, so the Heliopause is within the Hop range (#283).
    const rich = heliopauseInRange(withDeltaV(withJumpDrive(landedOn(run, target.id)), 100_000));
    const unfound = {
      ...rich,
      knowledge: { detected: [target.id], surveyed: [target.id], heliopauseFound: false },
    };
    const found = { ...unfound, knowledge: { ...unfound.knowledge, heliopauseFound: true } };
    expect(assessStranding(unfound).kind).toBe('stranded');
    expect(assessStranding(found).kind).toBe('clear');
  });

  it('a Jump arrives on a Starting Moon knowing nothing but the opening', () => {
    const run = heliopauseFound(withJumpDrive(startRun(2026, 'lancer')));
    const launched = launchHop(run, HELIOPAUSE);
    if (launched.kind !== 'flown') throw new Error(launched.why);
    const after = launched.run;
    expect(after.starSystemNumber).toBe(2);
    const moon = startingMoon(after.starSystem);
    expect(after.status).toEqual({ kind: 'landed', bodyId: moon.id });
    expect(idsAt(after, 'detected')).toHaveLength(1);
    expect(bodyKnowledge(after, moon.id)).toBe('surveyed');
    // The new Heliopause is not found: the Radar must find it again.
    expect(after.knowledge.heliopauseFound).toBe(false);
    // The new Starting Moon gave up its yield on arrival, as at Run start.
    expect(after.depleted).toEqual([moon.id]);
    expect(after.startingYield.kind).not.toBe('depleted');
    // And the first Body there is certain to be reached.
    const first = planHop(after, firstTarget(after).id);
    expect(first.kind === 'planned' && first.plan.successChance).toBe(1);
  });
});

describe('determinism', () => {
  it('the same seed opens the same way: Starting Moon, knowledge and starting yield', () => {
    for (const seed of [1, 123, 2026]) {
      for (const chassis of CHASSIS_IDS) {
        expect(startRun(seed, chassis)).toEqual(startRun(seed, chassis));
      }
    }
  });

  it('a replayed choice log rebuilds the Run, what it knows included', () => {
    let run = startRun(77, 'hauler');
    for (let hop = 0; hop < 3 && run.status.kind === 'landed'; hop++) {
      const target = run.knowledge.detected.at(-1);
      if (!target || target === currentBody(run).id) break;
      const launched = launchHop(run, target);
      if (launched.kind !== 'flown') throw new Error(launched.why);
      run = launched.run;
    }
    expect(run.choices.length).toBeGreaterThan(0);
    const replayed = replay(77, 'hauler', run.choices);
    expect(replayed.kind === 'replayed' && replayed.run).toEqual(run);
  });
});

/** AU between two Bodies, worked out here from their orbits, apart from the module. */
function auBetween(run: Run, a: Body, b: Body): number {
  const at = (body: Body): [number, number] => {
    if (body.kind !== 'moon') {
      return [
        body.distanceFromStar * Math.cos(body.orbitAngle),
        body.distanceFromStar * Math.sin(body.orbitAngle),
      ];
    }
    const planet = findBody(run.starSystem, body.planetId);
    if (!planet) throw new Error('No planet');
    const [x, y] = at(planet);
    const r = body.distanceFromPlanet / 149_597_870.7;
    return [x + r * Math.cos(body.orbitAngle), y + r * Math.sin(body.orbitAngle)];
  };
  const [ax, ay] = at(a);
  const [bx, by] = at(b);
  return Math.hypot(ax - bx, ay - by);
}
