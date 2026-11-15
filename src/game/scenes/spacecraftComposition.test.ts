import { describe, expect, it } from 'vitest';
import { CHASSIS_IDS, COMPONENT_IDS, COMPONENTS, type ChassisId, type Slot } from '../sim/index.ts';
import { FLIGHT_ANGLE, frameGeometry, turn, type ShipFrame } from './chassisArt.ts';
import {
  composeSpacecraft,
  type Rect,
  type SpacecraftComposition,
} from './spacecraftComposition.ts';

const START: readonly Slot[] = ['engine-1', 'fuel-tank-1', null, null];
const FRAMES: readonly ShipFrame[] = ['landed', 'landed_lit', 'flight'];
/** The most Slots any Chassis has (spec #230: the Hauler's 6). */
const MOST_SLOTS = 6;

const exits = (drawn: SpacecraftComposition, kind: 'main' | 'side') =>
  drawn.nozzles.filter((n) => n.kind === kind).map((n) => n.exit);

const overlaps = (a: Rect, b: Rect): boolean =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

/**
 * Every legal loadout of `count` Slots, up to the order of the Components in it (the mount points
 * a kind takes depend only on how many of it there are): at least one Engine and one Fuel Tank, at
 * most one Jump Drive, the rest any Component or empty.
 */
function legalLoadouts(count: number): Slot[][] {
  const choices: readonly Slot[] = [null, ...COMPONENT_IDS];
  const out: Slot[][] = [];
  const pick = (from: number, chosen: Slot[]): void => {
    if (chosen.length === count) {
      const kinds = chosen.flatMap((id) => (id ? [COMPONENTS[id].kind] : []));
      const howMany = (kind: string) => kinds.filter((k) => k === kind).length;
      if (howMany('engine') >= 1 && howMany('fuel-tank') >= 1 && howMany('jump-drive') <= 1) {
        out.push(chosen);
      }
      return;
    }
    for (let i = from; i < choices.length; i++) pick(i, [...chosen, choices[i] ?? null]);
  };
  pick(0, []);
  return out;
}

describe.each(CHASSIS_IDS)('the composed %s', (chassisId) => {
  it('draws every installed Component once, at a mount point of its kind, and nothing for an empty Slot', () => {
    const slots: readonly Slot[] = ['engine-1', 'fuel-tank-1', null, 'drill-2', null, 'jump-drive'];
    const drawn = composeSpacecraft(chassisId, slots, 'landed');

    expect([...drawn.components.keys()]).toEqual([0, 1, 3, 5]);
    for (const [slot, part] of drawn.components) {
      expect(part.componentId).toBe(slots[slot]);
      expect(part.kind).toBe(COMPONENTS[part.componentId].kind);
      const layers = drawn.layers.filter((l) => l.kind === 'component' && l.slot === slot);
      // The Jump Drive's ring is one Component art in two layers; every other art is one layer.
      expect(layers).toHaveLength(part.kind === 'jump-drive' ? 2 : 1);
    }
    expect(drawn.layers.filter((l) => l.kind === 'chassis')).toHaveLength(1);
    expect(drawn.layers.some((l) => l.kind === 'component' && (l.slot === 2 || l.slot === 4))).toBe(
      false,
    );
  });

  it('composes every legal loadout of up to 6 Slots with no two Components on one mount point', () => {
    for (let count = 4; count <= MOST_SLOTS; count++) {
      for (const slots of legalLoadouts(count)) {
        const drawn = composeSpacecraft(chassisId, slots, 'landed');
        const mounts = [...drawn.components.values()].map((p) => `${p.kind}@${String(p.mount)}`);
        expect(new Set(mounts).size, slots.join()).toBe(mounts.length);
      }
    }
  });

  it.each(FRAMES)(
    'keeps every Component inside the %s frame, attached to the Chassis art',
    (frame) => {
      const { width, height, pivot } = frameGeometry(chassisId, frame);
      const box: Rect = { x: -pivot.x, y: -pivot.y, width, height };
      for (const slots of legalLoadouts(MOST_SLOTS)) {
        const drawn = composeSpacecraft(chassisId, slots, frame);
        const chassis = drawn.layers.find((l) => l.kind === 'chassis')?.rect;
        if (!chassis) throw new Error('no Chassis art');
        for (const layer of drawn.layers) {
          expect(layer.rect.x).toBeGreaterThanOrEqual(box.x);
          expect(layer.rect.y).toBeGreaterThanOrEqual(box.y);
          expect(layer.rect.x + layer.rect.width).toBeLessThanOrEqual(box.x + box.width);
          expect(layer.rect.y + layer.rect.height).toBeLessThanOrEqual(box.y + box.height);
        }
        for (const part of drawn.components.values()) {
          expect(overlaps(part.bounds, chassis), `${part.componentId} touches the hull`).toBe(true);
        }
      }
    },
  );

  it('keys each Component bounds by its Slot: the union of its layers', () => {
    const drawn = composeSpacecraft(chassisId, ['engine-1', 'jump-drive', 'fuel-tank-1'], 'flight');
    const ring = drawn.layers.filter((l) => l.kind === 'component' && l.slot === 1);
    const bounds = drawn.components.get(1)?.bounds;
    expect(ring).toHaveLength(2);
    for (const { rect } of ring) {
      expect(bounds?.x).toBeLessThanOrEqual(rect.x);
      expect(bounds?.y).toBeLessThanOrEqual(rect.y);
      expect((bounds?.x ?? 0) + (bounds?.width ?? 0)).toBeGreaterThanOrEqual(rect.x + rect.width);
      expect((bounds?.y ?? 0) + (bounds?.height ?? 0)).toBeGreaterThanOrEqual(rect.y + rect.height);
    }
  });

  it('draws the Jump Drive behind and in front of the Chassis art', () => {
    const { layers } = composeSpacecraft(
      chassisId,
      ['engine-1', 'fuel-tank-1', 'jump-drive'],
      'landed',
    );
    const at = (predicate: (l: (typeof layers)[number]) => boolean) => layers.findIndex(predicate);
    const chassis = at((l) => l.kind === 'chassis');
    const back = at(
      (l) => l.kind === 'component' && l.componentId === 'jump-drive' && l.depth === 'back',
    );
    const front = at(
      (l) => l.kind === 'component' && l.componentId === 'jump-drive' && l.depth === 'front',
    );
    expect(back).toBeGreaterThanOrEqual(0);
    expect(back).toBeLessThan(chassis);
    expect(front).toBeGreaterThan(chassis);
  });

  it('draws two Fuel Tanks as two pods at two mount points', () => {
    const drawn = composeSpacecraft(
      chassisId,
      ['engine-1', 'fuel-tank-1', 'fuel-tank-1', 'drill-2'],
      'landed',
    );
    const pods = [...drawn.components.values()].filter((p) => p.kind === 'fuel-tank');
    expect(pods.map((p) => p.mount)).toEqual([0, 1]);
    expect(pods[0]?.bounds).not.toEqual(pods[1]?.bounds);
    // Each pod vents from its own top.
    for (const pod of pods) {
      expect(pod.anchors.vent?.y).toBeLessThanOrEqual(pod.bounds.y + 2);
    }
  });

  it('depends only on the Chassis, the Slots and the frame', () => {
    const slots: Slot[] = ['engine-2', 'fuel-tank-1', 'drill-1', 'jump-drive', null];
    const first = composeSpacecraft(chassisId, slots, 'landed_lit');
    expect(composeSpacecraft(chassisId, [...slots], 'landed_lit')).toEqual(first);
    // Lights on or off, every piece sits in the same place.
    const dark = composeSpacecraft(chassisId, slots, 'landed');
    expect(dark.layers.map((l) => l.rect)).toEqual(first.layers.map((l) => l.rect));
    expect(dark.components).toEqual(first.components);
  });

  it('turns every standing nozzle exit into its flight exit by the flight angle', () => {
    for (const slots of [START, ['engine-2', 'engine-1', 'fuel-tank-1']] as const) {
      const standing = composeSpacecraft(chassisId, slots, 'landed').nozzles;
      const flight = composeSpacecraft(chassisId, slots, 'flight').nozzles;
      expect(flight.map((n) => n.kind)).toEqual(standing.map((n) => n.kind));
      flight.forEach((nozzle, i) => {
        const expected = turn(standing[i]?.exit ?? { x: NaN, y: NaN }, FLIGHT_ANGLE);
        expect(nozzle.exit.x).toBeCloseTo(expected.x, 1);
        expect(nozzle.exit.y).toBeCloseTo(expected.y, 1);
      });
    }
  });

  it('lists the lamps of the Chassis art and of every Component art', () => {
    const bare = composeSpacecraft(chassisId, ['engine-1', null, null, null], 'landed').lamps;
    const withTank = composeSpacecraft(chassisId, START, 'landed').lamps;
    expect(bare.length).toBeGreaterThan(0);
    // The Fuel Tank pod carries a lamp of its own.
    expect(withTank.length).toBeGreaterThan(bare.length);
  });
});

// The Engine's nozzles, as the level-1 cluster and twin were drawn before the art was split (spec #134):
// three for the Herald Mk II and the Bastion, two for the Lancer, under the hull.
describe.each([
  { id: 'scout', side: 2, main: [-7, 0, 7], y: -18 },
  { id: 'hauler', side: 4, main: [-7, 0, 7], y: -18 },
  { id: 'lancer', side: 2, main: [-5, 5], y: -17 },
] as const)('the $id nozzles', ({ id, side, main, y }) => {
  const chassisId: ChassisId = id;
  it('come from the Chassis art for the side propulsors and from the Engine art for the main engine', () => {
    const drawn = composeSpacecraft(chassisId, START, 'landed');
    expect(exits(drawn, 'side')).toHaveLength(side);
    expect(exits(drawn, 'main')).toEqual(main.map((x) => ({ x, y })));
    // The side propulsors stand either side of the main engine.
    const sideX = exits(drawn, 'side').map((e) => e.x);
    expect(Math.min(...sideX)).toBeLessThan(Math.min(...main));
    expect(Math.max(...sideX)).toBeGreaterThan(Math.max(...main));
  });

  it('change with the Engines installed: a level-2 Engine fires one bell, a second Engine adds its own', () => {
    const bell = composeSpacecraft(chassisId, ['engine-2', 'fuel-tank-1', null, null], 'landed');
    expect(exits(bell, 'main')).toEqual([{ x: 0, y: -16 }]);
    const two = composeSpacecraft(
      chassisId,
      ['engine-1', 'fuel-tank-1', 'engine-1', null],
      'landed',
    );
    expect(exits(two, 'main').length).toBe(main.length + 1);
    expect(two.components.get(2)?.anchors.nozzle).toEqual(exits(two, 'main')[main.length]);
  });
});

it('a new Spacecraft draws only its Chassis art, its Engine and its Fuel Tank', () => {
  const drawn = composeSpacecraft('scout', START, 'landed_lit');
  expect(drawn.layers.map((l) => l.frame)).toEqual([
    'chassis.landed_lit',
    'engine-1.0.front.landed_lit',
    'fuel-tank-1.0.front.landed_lit',
  ]);
});

it('refuses more Components of a kind than the art has mount points for', () => {
  const sevenTanks: Slot[] = ['engine-1', ...Array<Slot>(6).fill('fuel-tank-1')];
  expect(() => composeSpacecraft('hauler', sevenTanks, 'landed')).toThrow(/mount point/);
});
