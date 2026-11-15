import { COMPONENTS } from './catalogue.ts';
import { generateSystem, type Run } from './run.ts';
import { refit } from './spacecraft.ts';
import { deepFreeze } from './starSystem.ts';

/**
 * The Jump: from the Heliopause to the next Star System, one difficulty level up. It always succeeds
 * once the Spacecraft is there. The Jump Drive burns out; the Spacecraft lands on the new Home Planet
 * with its other Components, Fuel and Materials. Throws for a Run that is not at the Heliopause:
 * only a Hop that reached it leads here.
 */
export function jump(run: Run): Run {
  if (run.status.kind !== 'at-heliopause') {
    throw new Error(`Run ${String(run.seed)} is not at the Heliopause: it cannot Jump`);
  }
  // The Jump Drive burns out: its Slot is emptied, and nothing is refunded for it.
  const slots = run.spacecraft.slots.map((slot) =>
    slot !== null && COMPONENTS[slot].kind === 'jump-drive' ? null : slot,
  );
  const starSystemNumber = run.starSystemNumber + 1;
  const starSystem = generateSystem(run.seed, starSystemNumber);
  return deepFreeze({
    ...run,
    starSystemNumber,
    starSystem,
    spacecraft: refit(run.spacecraft, slots),
    status: { kind: 'landed', bodyId: starSystem.homePlanetId },
    // A new Star System: none of its Bodies has given up its yield yet (Body ids repeat between Systems).
    depleted: [],
  });
}
