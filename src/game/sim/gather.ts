import type { Run } from './run.ts';
import { drillMultiplier } from './spacecraft.ts';
import { deepFreeze, findBody, type BodyId } from './starSystem.ts';
import { kilograms, materials, type Kilograms, type Materials } from './units.ts';

/** What landing on a Body collected: expected outcomes, so results rather than exceptions. */
export type Collection =
  /** An Icy Body's Fuel, as much as the Tank holds; the rest stays behind. */
  | { readonly kind: 'fuel'; readonly collected: Kilograms; readonly leftBehind: Kilograms }
  /** A Rocky Body's Materials. */
  | { readonly kind: 'materials'; readonly collected: Materials }
  /** The Body had already given up its yield in this Run. */
  | { readonly kind: 'depleted' };

export interface Landing {
  readonly run: Run;
  readonly collection: Collection;
}

/** Whether `bodyId` has already given up its yield in this Run. */
export function isDepleted(run: Run, bodyId: BodyId): boolean {
  return run.depleted.includes(bodyId);
}

/**
 * Collects the yield of `bodyId`, the Body the Spacecraft has just landed on: the first time only,
 * after which the Body is Depleted. The Spacecraft's Drills multiply the yield (the best one counts,
 * see `drillMultiplier`). Fuel is capped at the Tank's capacity. It leaves the Run's
 * status to the caller (a Hop sets it). Throws for a Body that is not a landable Body of this Star
 * System: a programmer error.
 */
export function collectYield(run: Run, bodyId: BodyId): Landing {
  const body = findBody(run.starSystem, bodyId);
  if (!body?.landable) throw new Error(`${bodyId} is not a Body the Spacecraft can land on`);
  if (isDepleted(run, body.id)) return { run, collection: { kind: 'depleted' } };

  const depleted = [...run.depleted, body.id];
  const multiplier = drillMultiplier(run.spacecraft);
  if (body.composition === 'rocky') {
    // Materials are whole units: a multiplied yield rounds to the nearest, a half up.
    const collected = materials(Math.round(body.baseYield * multiplier));
    return deepFreeze({
      run: { ...run, materials: materials(run.materials + collected), depleted },
      collection: { kind: 'materials', collected },
    });
  }
  const offered = body.baseYield * multiplier;
  const room = Math.max(0, run.spacecraft.fuelCapacity - run.spacecraft.fuelMass);
  const collected = kilograms(Math.min(offered, room));
  return deepFreeze({
    run: {
      ...run,
      spacecraft: { ...run.spacecraft, fuelMass: kilograms(run.spacecraft.fuelMass + collected) },
      depleted,
    },
    collection: { kind: 'fuel', collected, leftBehind: kilograms(offered - collected) },
  });
}
