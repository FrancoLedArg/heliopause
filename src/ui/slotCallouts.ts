// Where the Spacecraft panel draws the Spacecraft and each Slot's callout (#224): the composed
// Spacecraft stands in the middle of the picture, and every Slot gets a box at one side, joined by a
// line to its Component art. No React here, so the layout is unit tested for every Slot count.
import type { Point } from '../game/scenes/chassisArt.ts';
import {
  composeSpacecraft,
  type SpacecraftComposition,
} from '../game/scenes/spacecraftComposition.ts';
import type { ChassisId, Slot } from '../game/sim/index.ts';

/** The picture's box in the panel (px): as tall as the Spacecraft art stands. */
export const PICTURE = { width: 228, height: 126 } as const;

/** One callout's box (px): the Slot number, the Component icon and its level. */
export const CALLOUT = { width: 40, height: 22 } as const;

export type CalloutSide = 'left' | 'right';

/** The drawn Spacecraft placed in the picture: its composition and the top-left corner of its frame. */
export interface PlacedSpacecraft {
  readonly composition: SpacecraftComposition;
  readonly left: number;
  readonly top: number;
}

/** One Slot's callout: its box's top-left corner, its side, and where its line meets the Component art. */
export interface CalloutPlace {
  readonly slot: number;
  readonly side: CalloutSide;
  readonly x: number;
  readonly y: number;
  /** The middle of the Component art in the picture; `undefined` for an empty Slot. */
  readonly anchor: Point | undefined;
}

/**
 * The Spacecraft as the Landed view draws it, standing on the picture's bottom edge, centred. A loadout
 * the interim art has no mount point for draws the Chassis art alone rather than failing the panel.
 */
export function placeSpacecraft(chassisId: ChassisId, slots: readonly Slot[]): PlacedSpacecraft {
  let composition: SpacecraftComposition;
  try {
    composition = composeSpacecraft(chassisId, slots, 'landed');
  } catch {
    composition = composeSpacecraft(
      chassisId,
      slots.map(() => null),
      'landed',
    );
  }
  const { width, height } = composition.geometry;
  return {
    composition,
    left: Math.round((PICTURE.width - width) / 2),
    top: PICTURE.height - height,
  };
}

/**
 * One callout per Slot, in Slot order. Each side holds half the Slots in evenly spaced rows. A fitted
 * Slot takes the free row nearest its Component art on the art's own side (the other when that side is
 * full), so the lines stay short and level; the empty Slots fill the rows left over, in Slot order.
 */
export function slotCallouts(
  chassisId: ChassisId,
  slots: readonly Slot[],
  placed: PlacedSpacecraft = placeSpacecraft(chassisId, slots),
): CalloutPlace[] {
  const { composition, left, top } = placed;
  const { pivot } = composition.geometry;
  const rows = Math.ceil(slots.length / 2);
  const pitch = PICTURE.height / rows;
  const rowTop = (row: number): number => Math.round(row * pitch + (pitch - CALLOUT.height) / 2);
  const free: Record<CalloutSide, Set<number>> = {
    left: new Set(Array.from({ length: rows }, (_, i) => i)),
    right: new Set(Array.from({ length: rows }, (_, i) => i)),
  };
  const centre = PICTURE.width / 2;

  const anchors = new Map<number, Point>();
  for (const [slot, part] of composition.components) {
    anchors.set(slot, {
      x: Math.round(left + pivot.x + part.anchors.centre.x),
      y: Math.round(top + pivot.y + part.anchors.centre.y),
    });
  }

  const chosen = new Map<number, { side: CalloutSide; row: number }>();
  const take = (slot: number, side: CalloutSide, row: number): void => {
    free[side].delete(row);
    chosen.set(slot, { side, row });
  };
  // Top to bottom, so the rows fill in the order the art stands.
  const fitted = [...anchors].sort(([, a], [, b]) => a.y - b.y);
  for (const [slot, anchor] of fitted) {
    const own: CalloutSide =
      Math.abs(anchor.x - centre) < 4
        ? free.left.size >= free.right.size
          ? 'left'
          : 'right'
        : anchor.x < centre
          ? 'left'
          : 'right';
    const side = free[own].size > 0 ? own : own === 'left' ? 'right' : 'left';
    const middle = anchor.y - CALLOUT.height / 2;
    const [row] = [...free[side]].sort(
      (a, b) => Math.abs(rowTop(a) - middle) - Math.abs(rowTop(b) - middle) || a - b,
    );
    if (row !== undefined) take(slot, side, row);
  }
  slots.forEach((_, slot) => {
    if (chosen.has(slot)) return;
    const side: CalloutSide = free.left.size > 0 ? 'left' : 'right';
    const [row] = [...free[side]].sort((a, b) => a - b);
    if (row !== undefined) take(slot, side, row);
  });

  return slots.map((_, slot) => {
    const { side, row } = chosen.get(slot) ?? { side: 'left', row: 0 };
    return {
      slot,
      side,
      x: side === 'left' ? 0 : PICTURE.width - CALLOUT.width,
      y: rowTop(row),
      anchor: anchors.get(slot),
    };
  });
}
