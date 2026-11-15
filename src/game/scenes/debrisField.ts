// The Debris field (#252) as it drifts through the Cruise, shown, not told: a cluster of rocks
// comes in from the upper right and passes the Spacecraft. A hit has the lead rock arrive on the
// struck Component at the event's tick; a miss has the whole field pass clear. Pure: poses depend
// only on the event's tick, the Cruise tick shown and where the Component is, so a seek or a
// replay shows the same frame.
import { createRng } from '../lib/rng.ts';

export const DEBRIS_FIELD = {
  /** The field is on screen this many ticks before its strike tick, and this many after. */
  leadTicks: 40,
  tailTicks: 40,
  /** Rocks travel this many px per tick along the heading (right to left, falling). */
  pxPerTick: 9,
  /** The field's rocks, the one that hits included. */
  rocks: 6,
  /** The other rocks keep at least this far from the target's line of travel (px). */
  clearance: 56,
} as const;

/** The way the rocks travel: leftward and a little down. */
const HEADING = { x: -1, y: 0.18 } as const;
const HEADING_LENGTH = Math.hypot(HEADING.x, HEADING.y);

export interface RockPose {
  readonly x: number;
  readonly y: number;
  readonly angle: number;
  /** Which of the art's chunks (`chunk_0`..) this rock is. */
  readonly chunk: number;
  /** The rock that strikes the Component. */
  readonly hits: boolean;
}

/**
 * The rocks of a Debris field that strikes (or passes) at Cruise tick `strike`, as shown at tick
 * `now` (fractions allowed), aimed at `target`, the struck Component's centre or the Spacecraft's.
 * Empty outside the field's time on screen.
 */
export function debrisRocks(
  strike: number,
  now: number,
  target: { readonly x: number; readonly y: number },
  hit: boolean,
): readonly RockPose[] {
  const { leadTicks, tailTicks, pxPerTick, clearance } = DEBRIS_FIELD;
  if (now < strike - leadTicks || now > strike + tailTicks) return [];
  const rng = createRng(strike ^ 0xdeb7);
  const along = { x: HEADING.x / HEADING_LENGTH, y: HEADING.y / HEADING_LENGTH };
  const across = { x: -along.y, y: along.x };
  const travelled = (now - strike) * pxPerTick;
  const rocks: RockPose[] = [];
  for (let i = 0; i < DEBRIS_FIELD.rocks; i++) {
    // Every draw happens for every rock, so a rock's look never depends on the others.
    const lead = hit && i === 0;
    const side = i % 2 === 0 ? 1 : -1;
    const offset = lead ? 0 : side * (clearance + rng.int(0, 40));
    const stagger = lead ? 0 : rng.int(-90, 90);
    const spin = rng.int(0, 3) * 90;
    const chunk = rng.int(0, 5);
    // The rock that hit is gone once it has struck.
    if (lead && now > strike) continue;
    rocks.push({
      x: target.x + across.x * offset + along.x * (stagger + travelled),
      y: target.y + across.y * offset + along.y * (stagger + travelled),
      angle: spin + (now - strike) * 3,
      chunk,
      hits: lead,
    });
  }
  return rocks;
}
