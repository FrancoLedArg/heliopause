// The drawn Spacecraft as data (spec #230): its Chassis art plus one Component art per installed
// Component, each at a mount point. No Phaser here: this is the single source of truth for what the
// Spacecraft looks like, and the seam its tests read. `spacecraftArt.ts` draws what it returns.
import {
  COMPONENTS,
  type ChassisId,
  type ComponentId,
  type ComponentKind,
  type Slot,
} from '../sim/index.ts';
import {
  chassisArtData,
  frameGeometry,
  poseOf,
  type FrameGeometry,
  type Nozzle,
  type PieceArt,
  type Point,
  type PoseArt,
  type ShipFrame,
} from './chassisArt.ts';

/** A rectangle in pixels from the centre of the Spacecraft's base: its top-left corner and size. */
export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** Whether a Component art's layer is drawn behind the Chassis art or in front of it. */
export type LayerDepth = 'back' | 'front';

/** One image of the drawn Spacecraft: its frame in the Chassis's atlas (`chassis_<id>`) and where it sits. */
export type Layer =
  | { readonly kind: 'chassis'; readonly frame: string; readonly rect: Rect }
  | {
      readonly kind: 'component';
      /** The Slot the Component is installed in (0-based). */
      readonly slot: number;
      readonly componentId: ComponentId;
      /** Which of its kind's mount points the Component art takes. */
      readonly mount: number;
      readonly depth: LayerDepth;
      readonly frame: string;
      readonly rect: Rect;
    };

/** Where an effect attaches to a Component art: its middle, a Fuel Tank pod's vent, an Engine's first nozzle. */
export type AnchorKind = 'centre' | 'vent' | 'nozzle';

/** One installed Component as drawn: its art's bounds and its effect anchors. */
export interface ComponentPart {
  readonly componentId: ComponentId;
  readonly kind: ComponentKind;
  readonly mount: number;
  /** Every layer of its art together. */
  readonly bounds: Rect;
  readonly anchors: Readonly<Partial<Record<AnchorKind, Point>>> & { readonly centre: Point };
}

/** The drawn Spacecraft in one frame. */
export interface SpacecraftComposition {
  /** The box every piece of art of this Chassis fits in, and where the centre of the base sits in it. */
  readonly geometry: FrameGeometry;
  /** Back to front: Component art behind the Chassis art, the Chassis art, Component art in front. */
  readonly layers: readonly Layer[];
  /** The side propulsors' nozzles (from the Chassis art), then every Engine's (from its art). */
  readonly nozzles: readonly Nozzle[];
  /** Every lamp that blinks, on the Chassis art and on the Component art. */
  readonly lamps: readonly Point[];
  /** Each installed Component, keyed by its Slot, in Slot order. */
  readonly components: ReadonlyMap<number, ComponentPart>;
}

const rectOf = ({ rect }: PoseArt): Rect => ({
  x: rect.x,
  y: rect.y,
  width: rect.w,
  height: rect.h,
});

const union = (rects: readonly Rect[]): Rect => {
  const left = Math.min(...rects.map((r) => r.x));
  const top = Math.min(...rects.map((r) => r.y));
  const right = Math.max(...rects.map((r) => r.x + r.width));
  const bottom = Math.max(...rects.map((r) => r.y + r.height));
  return { x: left, y: top, width: right - left, height: bottom - top };
};

/** The drawing order of a Component art's layers. */
const DEPTHS: readonly LayerDepth[] = ['back', 'front'];

interface Placed {
  readonly slot: number;
  readonly componentId: ComponentId;
  readonly mount: number;
  readonly art: Readonly<Partial<Record<LayerDepth, PieceArt>>>;
}

/**
 * The drawn Spacecraft: the Chassis `chassisId` with the Components in `slots`, in `frame`. The n-th
 * installed Component of a kind, in Slot order, takes that kind's n-th mount point, so the drawing
 * depends only on the Chassis, the Slots and the frame.
 */
export function composeSpacecraft(
  chassisId: ChassisId,
  slots: readonly Slot[],
  frame: ShipFrame,
): SpacecraftComposition {
  const data = chassisArtData(chassisId);
  const pose = poseOf(frame);
  const used = new Map<ComponentKind, number>();
  const placed: Placed[] = [];
  slots.forEach((componentId, slot) => {
    if (componentId === null) return;
    const { kind } = COMPONENTS[componentId];
    // An Instrument has no art on the Spacecraft yet (asset request #323): its Slot callout shows it.
    if (kind === 'instrument') return;
    const mount = used.get(kind) ?? 0;
    used.set(kind, mount + 1);
    const art = data.components[componentId]?.[mount];
    if (!art) {
      throw new Error(
        `The ${chassisId} art has no mount point ${String(mount)} for ${componentId}: ${String(slots.length)} Slots is more than the art was drawn for`,
      );
    }
    placed.push({ slot, componentId, mount, art });
  });

  const componentLayers = (depth: LayerDepth): Layer[] =>
    placed.flatMap(({ slot, componentId, mount, art }) => {
      const piece = art[depth];
      if (!piece) return [];
      return [
        {
          kind: 'component',
          slot,
          componentId,
          mount,
          depth,
          frame: `${componentId}.${String(mount)}.${depth}.${frame}`,
          rect: rectOf(piece[pose]),
        },
      ];
    });
  const layers: Layer[] = [
    ...componentLayers('back'),
    { kind: 'chassis', frame: `chassis.${frame}`, rect: rectOf(data.chassis[pose]) },
    ...componentLayers('front'),
  ];

  const pieces = (p: Placed): PoseArt[] =>
    DEPTHS.flatMap((depth) => {
      const piece = p.art[depth];
      return piece ? [piece[pose]] : [];
    });
  const components = new Map<number, ComponentPart>();
  for (const p of placed) {
    const poses = pieces(p);
    const bounds = union(poses.map(rectOf));
    const vent = poses.find((art) => art.anchors.vent)?.anchors.vent;
    const nozzle = poses.flatMap((art) => art.nozzles)[0];
    components.set(p.slot, {
      componentId: p.componentId,
      kind: COMPONENTS[p.componentId].kind,
      mount: p.mount,
      bounds,
      anchors: {
        centre: { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 },
        ...(vent && { vent }),
        ...(nozzle && { nozzle }),
      },
    });
  }

  const engineNozzles = placed.flatMap((p) => pieces(p).flatMap((art) => art.nozzles));
  return {
    geometry: frameGeometry(chassisId, frame),
    layers,
    nozzles: [
      ...data.chassis[pose].nozzles.map((exit): Nozzle => ({ kind: 'side', exit })),
      ...engineNozzles.map((exit): Nozzle => ({ kind: 'main', exit })),
    ],
    lamps: [data.chassis[pose], ...placed.flatMap(pieces)].flatMap((art) => art.lamps),
    components,
  };
}
