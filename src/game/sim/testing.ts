// Test fixtures for the simulation's own tests. Not part of the module's public interface: the UI
// never imports this file.
import { AT_ESTIMATE, withDetected } from './generation.ts';
import { startingRun } from './opening.ts';
import {
  assessStranding,
  availableDeltaV,
  currentBody,
  firstDetectedBody,
  flyHop,
  install,
  kilograms,
  listBodies,
  materials,
  planHop,
  type Body,
  type ChassisId,
  type StarSystem,
  type BodyHopPlan,
  type BodyId,
  type HELIOPAUSE,
  type HeliopauseHopPlan,
  type HopPlan,
  type HopTarget,
  type Moon,
  type RockyPlanet,
  type Run,
} from './index.ts';

/** The plan for a Hop that must be valid. */
export function plan(from: Run, target: BodyId): BodyHopPlan;
export function plan(from: Run, target: typeof HELIOPAUSE): HeliopauseHopPlan;
export function plan(from: Run, target: HopTarget): HopPlan {
  const result = planHop(from, target);
  if (result.kind !== 'planned') throw new Error(`Expected a plan, got ${result.reason}`);
  return result.plan;
}

/** The same Run with the Spacecraft landed on another Body, which it then knows. */
export function landedOn(from: Run, bodyId: BodyId): Run {
  const knows = (ids: readonly BodyId[]) => (ids.includes(bodyId) ? ids : [...ids, bodyId]);
  const { knowledge } = from;
  return {
    ...from,
    status: { kind: 'landed', bodyId },
    knowledge: {
      ...knowledge,
      detected: knows(knowledge.detected),
      surveyed: knows(knowledge.surveyed),
    },
  };
}

/**
 * The same Run knowing every Body of its Star System, Surveyed, and the Heliopause: for rules that
 * weigh Hops anywhere, apart from what Comms has Detected so far.
 */
export function knowingEverything(from: Run): Run {
  const ids = listBodies(from.starSystem).map((body) => body.id);
  return { ...from, knowledge: { detected: ids, surveyed: ids, heliopauseFound: true } };
}

/** Figures a fixture may change on a Body, e.g. to match a real planet or a generator extreme. */
export type BodyFigures = Partial<
  Pick<Moon, 'surfaceGravity' | 'escapeVelocity' | 'distanceFromStar' | 'distanceFromPlanet'>
>;

/** The same Run with some Bodies' figures changed, keyed by Body id. */
export function withBodies(from: Run, changes: Readonly<Record<string, BodyFigures>>): Run {
  const patch = <B extends Body>(body: B): B => ({ ...body, ...changes[body.id] });
  const planets = from.starSystem.planets.map((planet) => ({
    ...patch(planet),
    moons: planet.moons.map(patch),
  }));
  return { ...from, starSystem: { ...from.starSystem, planets } };
}

/** The same Run with just enough Fuel for `deltaV`, found by bisection on the Fuel mass. */
export function withDeltaV(from: Run, deltaV: number): Run {
  let low = 0;
  let high = 1e9;
  for (let i = 0; i < 200; i++) {
    const mid = (low + high) / 2;
    if (availableDeltaV({ ...from.spacecraft, fuelMass: kilograms(mid) }) < deltaV) low = mid;
    else high = mid;
  }
  return { ...from, spacecraft: { ...from.spacecraft, fuelMass: kilograms(high) } };
}

/** The first Body Comms Detects from the Starting Moon: the opening's one target. */
export function firstTarget(from: Run): Body {
  return firstDetectedBody(from.starSystem);
}

/**
 * The innermost planet: always rocky, with two Moons. Rules about Hops anywhere (Burn costs,
 * yields, the Jump's arithmetic) start there, as they did from the Home Planet before #96.
 */
export function innerPlanet(from: Run): RockyPlanet {
  const [planet] = from.starSystem.planets;
  if (planet?.kind !== 'rocky-planet') throw new Error('The innermost planet is rocky');
  return planet;
}

/** The innermost planet's nearest Moon. */
export function innerMoon(from: Run): Moon {
  const [moon] = innerPlanet(from).moons;
  if (!moon) throw new Error('The innermost planet has a Moon');
  return moon;
}

/** The same Run standing on the innermost planet, knowing every Body (see `knowingEverything`). */
export function onInnerPlanet(from: Run): Run {
  return landedOn(knowingEverything(from), innerPlanet(from).id);
}

/** Landable Bodies of the Star System, other than the innermost planet and its Moons. */
export function farLandables(from: Run): Body[] {
  const inner = innerPlanet(from);
  return listBodies(from.starSystem).filter(
    (body) => body.landable && body.id !== inner.id && !inner.moons.some((m) => m.id === body.id),
  );
}

/**
 * The early dead ends of a Star System for one Chassis (#188): the Bodies a Hop from the start
 * reaches at a 100% Success Chance where, having Arrived at the estimate and collected the yield,
 * the Spacecraft is Stranded (no Hop could have any Success Chance, whatever it installs or
 * removes). Generation must leave none. `start` is where a Chassis's new Spacecraft begins: marooned
 * on the Starting Moon with its yield collected (#96). Every landable Body is weighed as if Detected,
 * and Stranded after arriving counts only what the Spacecraft knows there.
 */
export function earlyDeadEnds(
  system: StarSystem,
  chassisId: ChassisId,
  level: number,
  start: Run = startingRun(system, chassisId, level),
): Body[] {
  return listBodies(system).filter((body) => {
    if (!body.landable || body.id === currentBody(start).id) return false;
    const knowing = withDetected(start, body);
    const planned = planHop(knowing, body.id);
    if (planned.kind !== 'planned' || planned.plan.successChance < 1) return false;
    // A Hop that Arrives Stranded ends the Run there (`endIfStranded`); any other is judged as it stands.
    const { run } = flyHop(knowing, planned.plan, AT_ESTIMATE);
    if (run.status.kind === 'ended') return run.status.end.kind === 'stranded';
    return assessStranding(run).kind === 'stranded';
  });
}

/** The same Run with a Jump Drive in its first empty Slot, its Materials as they were. */
export function withJumpDrive(from: Run): Run {
  const slot = from.spacecraft.slots.indexOf(null);
  const result = install({ ...from, materials: materials(1_000) }, slot, 'jump-drive');
  if (result.kind !== 'installed') throw new Error(`Expected an install: ${result.reason.kind}`);
  return { ...result.run, materials: from.materials };
}

export { AT_ESTIMATE, startingRun };
