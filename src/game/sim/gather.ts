import type { Run } from './run.ts';
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

/**
 * The factor on a Body's base yield. Always 1 until the Drill gives it a number (#114): this is the
 * one place that ticket changes (it will read the Drills installed on `run.spacecraft`).
 */
function yieldMultiplier(): number {
  return 1;
}

/**
 * Lands the Run's Spacecraft on `bodyId`, collecting its yield the first time and Depleting it.
 * Fuel is capped at the Tank's capacity. Throws for a Body that is not a landable Body of this Star
 * System: a programmer error.
 */
export function landOn(run: Run, bodyId: BodyId): Landing {
  const body = findBody(run.starSystem, bodyId);
  if (!body?.landable) throw new Error(`${bodyId} is not a Body the Spacecraft can land on`);
  if (run.depleted.includes(body.id)) return { run, collection: { kind: 'depleted' } };

  const depleted = [...run.depleted, body.id];
  const multiplier = yieldMultiplier();
  if (body.composition === 'rocky') {
    const collected = materials(body.baseYield * multiplier);
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
