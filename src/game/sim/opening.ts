// The opening of a Star System (#96): the Spacecraft marooned on the Starting Moon, what it knows
// there, and the yield it gathers before the player's first choice. A New Run and the Jump both
// open this way, and so does the generator's own check of a fair opening.
import type { ChassisId } from './data.ts';
import { collectYield } from './gather.ts';
import { distanceBetween, type Knowledge } from './knowledge.ts';
import type { Run } from './run.ts';
import { newSpacecraft } from './spacecraft.ts';
import {
  findBody,
  startingMoon,
  type LandableBody,
  type Seed,
  type StarSystem,
} from './starSystem.ts';
import { kilograms, materials, type Materials } from './units.ts';

/**
 * The Materials a New Run starts with: enough for the cheapest Component (a Fuel Tank, 20) and for
 * a Drill (25), so the first design decision has more than one option.
 */
export const STARTING_MATERIALS: Materials = materials(25);

/**
 * The first Body Comms Detects from the Starting Moon: its planet when that is rocky, the obvious
 * target in its sky. A Gas Giant has no surface, so there it is the nearest sibling Moon instead.
 */
export function firstDetectedBody(system: StarSystem): LandableBody {
  const moon = startingMoon(system);
  const planet = findBody(system, moon.planetId);
  if (!planet || planet.kind === 'moon') throw new Error(`${moon.id} orbits no planet`);
  if (planet.landable) return planet;
  const [nearest] = planet.moons
    .filter((sibling) => sibling.id !== moon.id)
    .map((sibling) => ({ sibling, distance: distanceBetween(system, moon, sibling) }))
    .sort((a, b) => a.distance - b.distance);
  if (!nearest) throw new Error(`Starting Moon ${moon.id} has no sibling Moon to Detect`);
  return nearest.sibling;
}

/**
 * What the Spacecraft knows when it is marooned: the Starting Moon, Surveyed, and the first Body
 * Comms Detects. A Gas Giant it orbits is Surveyed too: its size gives it away, so it is never
 * mistaken for a target. Until the Radar (#191) can find the Heliopause, it is found from the start:
 * nothing else could, and no Run could escape.
 */
export function openingKnowledge(system: StarSystem): Knowledge {
  const moon = startingMoon(system);
  const first = firstDetectedBody(system);
  const planet = findBody(system, moon.planetId);
  const surveyed = planet?.kind === 'gas-giant' ? [planet.id, moon.id] : [moon.id];
  return { detected: [...surveyed, first.id], surveyed, heliopauseFound: true };
}

/** Everything a Run carries into a Star System; the opening sets the rest. */
export type Arriving = Omit<
  Run,
  'starSystem' | 'status' | 'depleted' | 'knowledge' | 'startingYield'
>;

/**
 * The Run marooned on the Starting Moon of `starSystem`: landed there knowing only the opening, with
 * the Moon's yield collected (through the land operation, so a Drill counts and Fuel is capped at the
 * Tank) and the Moon Depleted. Nothing in the new Star System has given up its yield before.
 */
export function maroon(arriving: Arriving, starSystem: StarSystem): Run {
  const moon = startingMoon(starSystem);
  const landed = collectYield(
    {
      ...arriving,
      starSystem,
      status: { kind: 'landed', bodyId: moon.id },
      depleted: [],
      knowledge: openingKnowledge(starSystem),
      startingYield: { kind: 'depleted' },
    },
    moon.id,
  );
  return { ...landed.run, startingYield: landed.collection };
}

/**
 * A Chassis's new Spacecraft marooned in `system` at a difficulty level, with a New Run's Materials:
 * the Run a New Run starts as, and what the generator checks a fair opening with. A new Spacecraft
 * lands short of a full Tank by what an Icy Starting Moon gives, so it is full once the yield is in:
 * the first thing a player sees is Fuel flowing in from the ice (#96, show don't tell).
 */
export function startingRun(
  system: StarSystem,
  chassisId: ChassisId,
  level: number,
  seed: Seed = system.seed,
): Run {
  const spacecraft = newSpacecraft(chassisId);
  const moon = startingMoon(system);
  const short = moon.composition === 'icy' ? Math.min(moon.baseYield, spacecraft.fuelMass) : 0;
  return maroon(
    {
      seed,
      starSystemNumber: level,
      spacecraft: { ...spacecraft, fuelMass: kilograms(spacecraft.fuelMass - short) },
      hopsFlown: 0,
      materials: STARTING_MATERIALS,
      choices: [],
    },
    system,
  );
}
