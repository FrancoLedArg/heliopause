import { describe, expect, it } from 'vitest';
import { composeSpacecraft } from '../game/scenes/spacecraftComposition.ts';
import { CHASSIS_IDS, type Slot } from '../game/sim/index.ts';
import { CALLOUT, PICTURE, slotCallouts, type CalloutPlace } from './slotCallouts.ts';

/** Loadouts of every Slot count a Chassis can have (spec #230: Scout 4, Lancer 5, Hauler 6). */
const LOADOUTS: readonly (readonly Slot[])[] = [
  ['engine-1', 'fuel-tank-1', null, null],
  ['engine-1', 'fuel-tank-1', 'drill-1', 'jump-drive'],
  ['engine-1', 'fuel-tank-1', null, 'drill-2', null],
  ['engine-2', 'fuel-tank-1', 'fuel-tank-2', 'drill-1', 'jump-drive'],
  ['engine-1', 'fuel-tank-1', null, null, null, null],
  ['engine-1', 'fuel-tank-1', 'fuel-tank-1', 'drill-2', 'engine-2', 'jump-drive'],
];

const overlaps = (a: CalloutPlace, b: CalloutPlace): boolean =>
  a.x < b.x + CALLOUT.width &&
  b.x < a.x + CALLOUT.width &&
  a.y < b.y + CALLOUT.height &&
  b.y < a.y + CALLOUT.height;

describe.each(CHASSIS_IDS)('the Slot callouts on the %s', (chassisId) => {
  it.each(LOADOUTS.map((slots) => [slots.length, slots] as const))(
    'give each of %i Slots one callout, inside the picture, with no two overlapping',
    (_count, slots) => {
      const places = slotCallouts(chassisId, slots);
      expect(places.map((p) => p.slot)).toEqual(slots.map((_, i) => i));
      for (const place of places) {
        expect(place.x).toBeGreaterThanOrEqual(0);
        expect(place.y).toBeGreaterThanOrEqual(0);
        expect(place.x + CALLOUT.width).toBeLessThanOrEqual(PICTURE.width);
        expect(place.y + CALLOUT.height).toBeLessThanOrEqual(PICTURE.height);
      }
      for (const a of places) {
        for (const b of places) if (a !== b) expect(overlaps(a, b)).toBe(false);
      }
    },
  );

  it('leads a fitted Slot’s line to its Component art, and an empty Slot’s nowhere', () => {
    const slots: readonly Slot[] = ['engine-1', 'fuel-tank-1', null, 'drill-1'];
    const drawn = composeSpacecraft(chassisId, slots, 'landed');
    const { width, height, pivot } = drawn.geometry;
    const origin = {
      x: (PICTURE.width - width) / 2 + pivot.x,
      y: PICTURE.height - height + pivot.y,
    };
    const places = slotCallouts(chassisId, slots);
    for (const place of places) {
      const part = drawn.components.get(place.slot);
      if (!part) {
        expect(place.anchor).toBeUndefined();
        continue;
      }
      const { bounds } = part;
      expect(place.anchor?.x).toBeGreaterThanOrEqual(origin.x + bounds.x);
      expect(place.anchor?.x).toBeLessThanOrEqual(origin.x + bounds.x + bounds.width);
      expect(place.anchor?.y).toBeGreaterThanOrEqual(origin.y + bounds.y);
      expect(place.anchor?.y).toBeLessThanOrEqual(origin.y + bounds.y + bounds.height);
    }
  });

  it('puts a Component’s callout on its own side of the Spacecraft when that side has room', () => {
    const slots: readonly Slot[] = ['engine-1', 'fuel-tank-1', null, 'drill-1'];
    const places = slotCallouts(chassisId, slots);
    for (const place of places) {
      if (!place.anchor) continue;
      const centre = PICTURE.width / 2;
      // The Engine sits on the centre line, so either side is its own.
      if (Math.abs(place.anchor.x - centre) < 4) continue;
      expect(place.side).toBe(place.anchor.x < centre ? 'left' : 'right');
    }
  });
});

it('still lays out every Slot when the art has no mount point left for a Component', () => {
  // Six Fuel Tanks is legal on a 6-Slot Chassis, but the interim art has five Fuel Tank mounts.
  const slots: readonly Slot[] = Array.from({ length: 6 }, () => 'fuel-tank-1');
  const places = slotCallouts('hauler', slots);
  expect(places).toHaveLength(6);
});
