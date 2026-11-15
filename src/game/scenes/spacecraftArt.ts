import type { GameObjects, Scene } from 'phaser';
import { paletteNumber } from '../../ui/kit/palette.ts';
import { hasAsset } from '../assets/manifest.ts';
import { prefersReducedMotion } from '../lib/motion.ts';
import { COMPONENTS, type ChassisId, type ComponentKind, type Slot } from '../sim/index.ts';
import {
  FLIGHT_ANGLE,
  turn,
  type Nozzle,
  type Point,
  type ShipFrame,
  type ShipPose,
} from './chassisArt.ts';
import {
  composeSpacecraft,
  type AnchorKind,
  type Layer,
  type Rect,
} from './spacecraftComposition.ts';

export type { ShipFrame } from './chassisArt.ts';

const STAND_IN_SCALE = 4;
// The `spacecraft` stand-in points right; its tail sits 5px past the centre, so stood upright
// (rotated -90°) its base is 5px below its middle.
const STAND_IN_BASE_OFFSET = 5 * STAND_IN_SCALE;
/** The stand-in in flight: nose up-right, along the same heading as the Chassis art's `flight` frame. */
const STAND_IN_FLIGHT_ANGLE = FLIGHT_ANGLE - 90;
/** The stand-in's shadow on the ground (px wide). */
const STAND_IN_SHADOW_WIDTH = 72;
/** The share of the standing Spacecraft's width its shadow covers: it sits under the fins or legs, not the tips. */
const SHADOW_SHARE = 0.75;
/** A Component's plate beside the stand-in Spacecraft: this big, stacked up its right side from here (px). */
const STAND_IN_PLATE = { size: 10, x: 12, y: -34, step: 12 } as const;

/** The install moment (presentation tuning): the art pops in from this scale, and a removed art fades out. */
const POP = { from: 0.4, ms: 280, ease: 'Back.easeOut' } as const;
const FADE_MS = 240;
/** The sparks of the install moment: how many, how long they live (ms), how fast they fly (px/s). */
const SPARKS = { count: 10, lifespan: 420, speed: { min: 30, max: 80 } } as const;

/** The stand-in has one engine: its tail, under the base standing, and down-left of it in flight. */
const STAND_IN_NOZZLES: Readonly<Record<ShipPose, readonly Nozzle[]>> = {
  standing: [{ kind: 'main', exit: { x: 0, y: -2 } }],
  flight: [{ kind: 'main', exit: { x: -18, y: -12 } }],
};

const chassisKey = (chassisId: ChassisId): string => `chassis_${chassisId}`;

/** Every nozzle the drawn Spacecraft fires from in a pose: from the composition, or the stand-in's single engine. */
export function spacecraftNozzles(
  chassisId: ChassisId,
  pose: ShipPose,
  slots: readonly Slot[],
): readonly Nozzle[] {
  if (!hasAsset(chassisKey(chassisId))) return STAND_IN_NOZZLES[pose];
  return composeSpacecraft(chassisId, slots, pose === 'flight' ? 'flight' : 'landed').nozzles;
}

/** How wide the Spacecraft's shadow on the ground is (px): under the art it is drawn with, centred on its base. */
export function shadowWidth(chassisId: ChassisId, slots: readonly Slot[]): number {
  if (!hasAsset(chassisKey(chassisId))) return STAND_IN_SHADOW_WIDTH;
  const { layers } = composeSpacecraft(chassisId, slots, 'landed');
  const reach = Math.max(...layers.map(({ rect }) => Math.max(-rect.x, rect.x + rect.width)));
  return Math.round(2 * reach * SHADOW_SHARE);
}

/** One drawn piece, as the test hook and the Landed view list it. */
export interface DrawnPiece {
  /** The piece's atlas frame without its frame: `chassis`, `drill-1.0.front`. */
  readonly piece: string;
  /** The Slot of the Component it draws; `null` for the Chassis art. */
  readonly slot: number | null;
  /** Drawn as a primitive plate because its art is not in the atlas. */
  readonly standIn: boolean;
}

/** One installed Component as drawn, in pixels from the centre of the Spacecraft's base. */
export interface DrawnComponent {
  readonly slot: number;
  readonly componentId: string;
  readonly bounds: Rect;
}

export interface SpacecraftArt {
  /** Add these to the ship's container, whose origin is the centre of the Spacecraft's base. */
  readonly objects: readonly GameObjects.GameObject[];
  readonly show: (frame: ShipFrame) => void;
  /**
   * Redraws the Spacecraft with `slots` installed: a new Component art pops in at its mount point
   * with a few sparks, a removed one fades out. Under reduced motion the end state shows at once.
   */
  readonly setSlots: (slots: readonly Slot[]) => void;
  /** Each installed Component's rectangle on the screen, keyed by its Slot. */
  readonly componentBounds: () => ReadonlyMap<number, Rect>;
  /** Where an effect of `kind` attaches to the Component in `slot` on the screen; `undefined` if it has none. */
  readonly anchor: (slot: number, kind: AnchorKind) => Point | undefined;
  /** What is drawn now, back to front, and each Component's bounds from the centre of the base. */
  readonly drawn: () => {
    readonly pieces: readonly DrawnPiece[];
    readonly components: readonly DrawnComponent[];
  };
}

type Drawable = GameObjects.Image | GameObjects.Graphics;

/** A drawn layer: its art cut from the atlas, or a primitive plate standing in for missing art. */
type Drawn =
  | { readonly object: GameObjects.Image; readonly standIn: false }
  | { readonly object: GameObjects.Graphics; readonly standIn: true };

/** What the adapter draws for one Slot set and frame: its layers, and each Component's bounds and anchors. */
interface Drawing {
  readonly layers: readonly {
    readonly id: string;
    readonly layer: Pick<Layer, 'frame' | 'rect'> & { readonly slot: number | null };
    readonly kind: ComponentKind | 'chassis';
    readonly back: boolean;
  }[];
  readonly components: ReadonlyMap<number, DrawingPart>;
}

/** One installed Component in a drawing: its bounds and anchors from the centre of the base. */
interface DrawingPart {
  readonly componentId: string;
  readonly bounds: Rect;
  readonly anchors: Readonly<Partial<Record<AnchorKind, Point>>>;
}

/** The Chassis art's composition as the adapter draws it. */
function composedDrawing(chassisId: ChassisId, slots: readonly Slot[], frame: ShipFrame): Drawing {
  const composed = composeSpacecraft(chassisId, slots, frame);
  return {
    layers: composed.layers.map((layer) =>
      layer.kind === 'chassis'
        ? { id: 'chassis', layer: { ...layer, slot: null }, kind: 'chassis', back: false }
        : {
            id: `${String(layer.slot)}:${layer.componentId}:${layer.depth}`,
            layer,
            kind: COMPONENTS[layer.componentId].kind,
            back: layer.depth === 'back',
          },
    ),
    components: composed.components,
  };
}

/** With no Chassis art at all: each Component's plate stacked up the stand-in's side, in Slot order. */
function standInDrawing(slots: readonly Slot[], frame: ShipFrame): Drawing {
  const { size, x, y, step } = STAND_IN_PLATE;
  const layers: Drawing['layers'][number][] = [];
  const components = new Map<number, DrawingPart>();
  let row = 0;
  slots.forEach((componentId, slot) => {
    if (componentId === null) return;
    const standing = { x: x + size / 2, y: y - row * step + size / 2 };
    const centre = frame === 'flight' ? turn(standing, FLIGHT_ANGLE) : standing;
    const rect = {
      x: Math.round(centre.x - size / 2),
      y: Math.round(centre.y - size / 2),
      width: size,
      height: size,
    };
    row++;
    layers.push({
      id: `${String(slot)}:${componentId}:front`,
      layer: { frame: '', rect, slot },
      kind: COMPONENTS[componentId].kind,
      back: false,
    });
    components.set(slot, { componentId, bounds: rect, anchors: { centre } });
  });
  return { layers, components };
}

/** A Component art's primitive stand-in: a gunmetal plate with a cyan edge and a mark for its kind. */
function drawPlate(
  scene: Scene,
  kind: ComponentKind | 'chassis',
  rect: Rect,
): GameObjects.Graphics {
  const { width: w, height: h } = rect;
  const g = scene.add.graphics();
  g.fillStyle(paletteNumber('gm2')).fillRect(0, 0, w, h);
  g.lineStyle(1, paletteNumber('cy2')).strokeRect(0.5, 0.5, w - 1, h - 1);
  // A different shape per kind, so stand-ins tell kinds apart without colour.
  g.fillStyle(paletteNumber('am3'));
  const cx = w / 2;
  const cy = h / 2;
  const r = Math.max(1, Math.min(w, h) / 2 - 3);
  switch (kind) {
    case 'engine':
      g.fillTriangle(cx - r, cy - r, cx + r, cy - r, cx, cy + r);
      break;
    case 'fuel-tank':
      g.fillRect(cx - r / 2, cy - r, r, 2 * r);
      break;
    case 'drill':
      g.fillTriangle(cx - r, cy - r, cx + r, cy - r, cx, cy + r).fillRect(cx - 0.5, cy - r, 1, r);
      break;
    case 'jump-drive':
      g.lineStyle(1, paletteNumber('am3')).strokeCircle(cx, cy, r);
      break;
    case 'radar':
      // A dish: a half circle on a stalk.
      g.lineStyle(1, paletteNumber('am3')).beginPath();
      g.arc(cx, cy, r, 0, Math.PI).strokePath();
      g.fillRect(cx - 0.5, cy - r, 1, r);
      break;
    case 'chassis':
      g.fillRect(cx - r, cy - 0.5, 2 * r, 1);
      break;
  }
  return g.setPosition(rect.x, rect.y);
}

/**
 * The whole Spacecraft, composed from its parts (spec #230): the Chassis art and one Component art
 * per installed Component from the `chassis_<id>` atlas, laid out by the composition
 * (`spacecraftComposition.ts`), in one container whose origin is the centre of the base. A piece
 * missing from the atlas draws a plate stand-in at its place and size; with no `chassis_<id>` atlas
 * at all, the 4x `spacecraft` stand-in with a red lamp for its lights and a plate per Component.
 */
export function addSpacecraftArt(
  scene: Scene,
  chassisId: ChassisId,
  initialSlots: readonly Slot[],
): SpacecraftArt {
  const key = chassisKey(chassisId);
  const hasArt = hasAsset(key);
  const texture = hasArt && scene.textures.exists(key) ? scene.textures.get(key) : undefined;
  const reducedMotion = prefersReducedMotion();
  const container = scene.add.container(0, 0);

  // The stand-in Spacecraft, under its plates.
  let standIn: { art: GameObjects.Image; lamp: GameObjects.Rectangle } | undefined;
  if (!hasArt) {
    standIn = {
      art: scene.add
        .image(0, -STAND_IN_BASE_OFFSET, 'spacecraft')
        .setScale(STAND_IN_SCALE)
        .setAngle(-90),
      // The stand-in has no lit frame: a single red pixel-lamp shows on its hull instead.
      lamp: scene.add.rectangle(0, -60, 4, 4, paletteNumber('rd2')).setVisible(false),
    };
    container.add([standIn.art, standIn.lamp]);
  }

  let slots = initialSlots;
  let frame: ShipFrame = 'landed';
  const compose = (): Drawing =>
    hasArt ? composedDrawing(chassisId, slots, frame) : standInDrawing(slots, frame);
  let drawing = compose();
  const objects = new Map<string, Drawn>();

  const place = (object: Drawable, rect: Rect): void => {
    object.setScale(1).setPosition(rect.x, rect.y);
  };
  const create = (entry: Drawing['layers'][number]): Drawn => {
    const { frame: name, rect } = entry.layer;
    if (texture?.has(name)) {
      return {
        object: scene.add.image(rect.x, rect.y, key, name).setOrigin(0, 0),
        standIn: false,
      };
    }
    return { object: drawPlate(scene, entry.kind, rect), standIn: true };
  };

  /**
   * What outlives a recomposition for a moment: art fading out (kept at its depth, behind or in
   * front of the Chassis art) and the install sparks. Each leaves the set when it is destroyed, so
   * installs in quick succession never orphan one.
   */
  const passing = new Set<{ readonly object: GameObjects.GameObject; readonly back: boolean }>();

  /** Lays the current drawing into the container, back to front, with anything passing kept at its depth. */
  const arrange = (): void => {
    container.removeAll(false);
    if (standIn) container.add([standIn.art, standIn.lamp]);
    const lingering = [...passing];
    container.add(lingering.filter((p) => p.back).map((p) => p.object));
    for (const { id } of drawing.layers) {
      const drawn = objects.get(id);
      if (drawn) container.add(drawn.object);
    }
    container.add(lingering.filter((p) => !p.back).map((p) => p.object));
  };

  /** Keeps `object` in the container until `destroy` runs, then destroys it. */
  const linger = (object: GameObjects.GameObject, back: boolean): (() => void) => {
    const entry = { object, back };
    passing.add(entry);
    return () => {
      passing.delete(entry);
      object.destroy();
    };
  };

  const pop = (id: string, object: Drawable, rect: Rect): void => {
    const centre = { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
    const scaleAboutCentre = (s: number): void => {
      object
        .setScale(s)
        .setPosition(centre.x - (rect.width * s) / 2, centre.y - (rect.height * s) / 2);
    };
    scaleAboutCentre(POP.from);
    scene.tweens.addCounter({
      from: POP.from,
      to: 1,
      duration: POP.ms,
      ease: POP.ease,
      onUpdate: (tween) => {
        scaleAboutCentre(tween.getValue() ?? 1);
      },
      onComplete: () => {
        // The art may have moved to another mount point while it popped in: settle where it is now.
        const now = drawing.layers.find((entry) => entry.id === id);
        if (now && objects.get(id)?.object === object) place(object, now.layer.rect);
      },
    });
  };

  const sparks = (at: Point): void => {
    if (!scene.textures.exists('fx_spark')) return;
    const emitter = scene.add.particles(at.x, at.y, 'fx_spark', {
      emitting: false,
      lifespan: SPARKS.lifespan,
      speed: SPARKS.speed,
      tint: paletteNumber('am4'),
      scale: { start: 1, end: 0.2 },
      alpha: { start: 1, end: 0 },
    });
    container.add(emitter);
    emitter.explode(SPARKS.count);
    scene.time.delayedCall(SPARKS.lifespan + 50, linger(emitter, false));
  };

  for (const entry of drawing.layers) objects.set(entry.id, create(entry));
  arrange();

  const show = (next: ShipFrame): void => {
    frame = next;
    drawing = compose();
    for (const { id, layer } of drawing.layers) {
      const drawn = objects.get(id);
      if (!drawn) continue;
      if (!drawn.standIn) {
        drawn.object.setFrame(layer.frame, false, false);
      }
      if (drawn.object.scale === 1) place(drawn.object, layer.rect);
    }
    if (standIn) {
      standIn.art.setAngle(frame === 'flight' ? STAND_IN_FLIGHT_ANGLE : -90);
      standIn.lamp.setVisible(frame === 'landed_lit');
    }
  };

  const setSlots = (next: readonly Slot[]): void => {
    const before = drawing;
    slots = next;
    drawing = compose();
    const kept = new Set(drawing.layers.map((l) => l.id));
    for (const old of before.layers) {
      const drawn = objects.get(old.id);
      if (kept.has(old.id) || !drawn) continue;
      objects.delete(old.id);
      if (reducedMotion) {
        drawn.object.destroy();
        continue;
      }
      scene.tweens.add({
        targets: drawn.object,
        alpha: 0,
        duration: FADE_MS,
        onComplete: linger(drawn.object, old.back),
      });
    }
    const added = new Set<number>();
    for (const entry of drawing.layers) {
      const drawn = objects.get(entry.id);
      if (drawn) {
        // Still installed, though it may have moved to another mount point.
        if (!drawn.standIn) {
          drawn.object.setFrame(entry.layer.frame, false, false);
        }
        place(drawn.object, entry.layer.rect);
        continue;
      }
      const created = create(entry);
      objects.set(entry.id, created);
      if (!reducedMotion) pop(entry.id, created.object, entry.layer.rect);
      if (entry.layer.slot !== null) added.add(entry.layer.slot);
    }
    arrange();
    if (!reducedMotion) {
      for (const slot of added) {
        const centre = drawing.components.get(slot)?.anchors.centre;
        if (centre) sparks(centre);
      }
    }
  };

  const toScreen = (point: Point): Point => {
    const { x, y } = container.getWorldTransformMatrix().transformPoint(point.x, point.y);
    return { x, y };
  };

  return {
    objects: [container],
    show,
    setSlots,
    componentBounds: () => {
      const out = new Map<number, Rect>();
      for (const [slot, { bounds }] of drawing.components) {
        const a = toScreen({ x: bounds.x, y: bounds.y });
        const b = toScreen({ x: bounds.x + bounds.width, y: bounds.y + bounds.height });
        out.set(slot, {
          x: Math.min(a.x, b.x),
          y: Math.min(a.y, b.y),
          width: Math.abs(b.x - a.x),
          height: Math.abs(b.y - a.y),
        });
      }
      return out;
    },
    anchor: (slot, kind) => {
      const at = drawing.components.get(slot)?.anchors[kind];
      return at && toScreen(at);
    },
    drawn: () => ({
      pieces: drawing.layers.map(({ id, layer }) => ({
        piece: hasArt ? layer.frame.slice(0, layer.frame.lastIndexOf('.')) : `stand-in:${id}`,
        slot: layer.slot,
        standIn: objects.get(id)?.standIn ?? true,
      })),
      components: [...drawing.components].map(([slot, { componentId, bounds }]) => ({
        slot,
        componentId,
        bounds,
      })),
    }),
  };
}
