// Where each installed Component sits on the drawn Spacecraft, so the Cruise can hit-test a click on
// a Component (Cruise events and Repair, #210). Until the composed Spacecraft (#232/#233) gives each
// Component its own art and `componentBounds()`, every Slot has a fixed spot up the hull's centre
// line, from just above the engine to below the nose; #233 swaps this source for the composition's.
import type { Slot } from '../sim/index.ts';
import { FLIGHT_ANGLE, turn, type ShipFrame } from './chassisArt.ts';

/** A rectangle in pixels: its top-left corner and size (the composed Spacecraft's `Rect`). */
export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/**
 * Layout tuning (px from the centre of the base, standing): Slot 0's centre is this high, each next
 * Slot this much higher, and each Component's box this big. Spaced so the boxes stay apart once
 * turned to the flight heading.
 */
const SLOT_SPOTS = { first: 28, step: 21, size: 18 } as const;

/**
 * Each installed Component's box on the Spacecraft drawn in `frame`, keyed by its Slot, in pixels from
 * the centre of the base at scale 1. In flight the spots turn with the Spacecraft.
 */
export function componentLayout(
  slots: readonly Slot[],
  frame: ShipFrame,
): ReadonlyMap<number, Rect> {
  const out = new Map<number, Rect>();
  slots.forEach((componentId, slot) => {
    if (componentId === null) return;
    const standing = { x: 0, y: -(SLOT_SPOTS.first + slot * SLOT_SPOTS.step) };
    const centre = frame === 'flight' ? turn(standing, FLIGHT_ANGLE) : standing;
    const half = SLOT_SPOTS.size / 2;
    out.set(slot, {
      x: centre.x - half,
      y: centre.y - half,
      width: SLOT_SPOTS.size,
      height: SLOT_SPOTS.size,
    });
  });
  return out;
}
