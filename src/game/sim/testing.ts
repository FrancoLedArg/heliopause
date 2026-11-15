// Test fixtures for the simulation's own tests. Not part of the module's public interface: the UI
// never imports this file.
import {
  assessStranding,
  availableDeltaV,
  currentBody,
  flyHop,
  homePlanet,
  install,
  kilograms,
  listBodies,
  materials,
  newSpacecraft,
  planHop,
  STARTING_MATERIALS,
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

/** The same Run with the Spacecraft landed on another Body. */
export function landedOn(from: Run, bodyId: BodyId): Run {
  return { ...from, status: { kind: 'landed', bodyId } };
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

/** The Home Planet's nearest Moon. */
export function homeMoon(from: Run): Moon {
  const moon = homePlanet(from.starSystem).moons[0];
  if (!moon) throw new Error('The Home Planet has a Moon');
  return moon;
}

/** Landable Bodies of the Star System, other than the Home Planet and its Moons. */
export function farLandables(from: Run): Body[] {
  const home = homePlanet(from.starSystem);
  return listBodies(from.starSystem).filter(
    (body) => body.landable && body.id !== home.id && !home.moons.some((m) => m.id === body.id),
  );
}

/** The Run a Chassis's new Spacecraft starts in this Star System: landed on its Home Planet, full. */
export function startingRun(system: StarSystem, chassisId: ChassisId, level: number): Run {
  return {
    seed: system.seed,
    starSystemNumber: level,
    starSystem: system,
    spacecraft: newSpacecraft(chassisId),
    status: { kind: 'landed', bodyId: system.homePlanetId },
    hopsFlown: 0,
    materials: STARTING_MATERIALS,
    depleted: [],
    choices: [],
  };
}

/** Every Burn at its estimate: the dispersion factor drawn is exactly 1. */
const AT_ESTIMATE = { next: () => 0.5, int: (min: number) => min };

/**
 * The early dead ends of a Star System for one Chassis (#188): the Bodies a Hop from the start
 * reaches at a 100% Success Chance where, having Arrived at the estimate and collected the yield,
 * the Spacecraft is Stranded (no Hop could have any Success Chance, whatever it installs or
 * removes). Generation must leave none. #96 extends this when the Starting Moon replaces the Home
 * Planet: `start` is where a Chassis's new Spacecraft begins.
 */
export function earlyDeadEnds(
  system: StarSystem,
  chassisId: ChassisId,
  level: number,
  start: Run = startingRun(system, chassisId, level),
): Body[] {
  return listBodies(system).filter((body) => {
    if (!body.landable || body.id === currentBody(start).id) return false;
    const planned = planHop(start, body.id);
    if (planned.kind !== 'planned' || planned.plan.successChance < 1) return false;
    // A Hop that Arrives Stranded ends the Run there (`endIfStranded`); any other is judged as it stands.
    const { run } = flyHop(start, planned.plan, AT_ESTIMATE);
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
