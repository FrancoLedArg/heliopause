// The Damage drawn on the Spacecraft (#210, #250), shown, not told: a red glow and the kit's alert
// badge on a Damaged Component, Fuel venting from a leaking Tank, and while it is Repaired a ring
// filling round it with the Rush price beside it (a Materials icon and a number). Pooled per Slot,
// built once per scene run: posing them allocates nothing per frame.
import { BlendModes, type GameObjects, type Scene } from 'phaser';
import { paletteCss, paletteNumber } from '../../ui/kit/palette.ts';
import { repairState } from '../../ui/repairView.ts';
import { hasAsset } from '../assets/manifest.ts';
import { COMPONENTS, SLOT_COUNT, type Run } from '../sim/index.ts';
import { glowTexture } from './flightEffects.ts';
import type { Rect } from './spacecraftComposition.ts';

/** Presentation tuning (px and ms). */
const MARK = {
  /** The ring sits this far outside the Component's bounds, this thick. */
  ringGap: 3,
  ringWidth: 2,
  /** The red glow is this much bigger than the Component, and breathes this fast at full motion. */
  glowScale: 1.6,
  glowMs: 700,
  /** The venting plume: each of its frames this long, drawn this big. */
  ventFrameMs: 80,
  ventFrames: 4,
  ventScale: 1.6,
  /** The Rush price's icon (px across) and the gap from the ring. */
  icon: 10,
  priceGap: 4,
  /** The Rush price's box (icon and up to two digits), for clicks. */
  priceWidth: 24,
  priceHeight: 12,
  /** How far a click may land outside a Component, or off the ring's line, and still hit it. */
  hitSlop: 4,
} as const;

interface SlotMarks {
  readonly glow: GameObjects.Image;
  readonly badge: GameObjects.Image | undefined;
  readonly vent: GameObjects.Image;
  readonly ring: GameObjects.Graphics;
  readonly icon: GameObjects.Image;
  readonly price: GameObjects.Text;
}

export interface DamageMarks {
  /**
   * Poses the marks for `run`'s Damage on the Components at `bounds` (screen rects by Slot), `ms` on
   * the scene's clock (it steps the venting and the glow, so a seek shows a fixed frame).
   */
  readonly show: (run: Run, bounds: ReadonlyMap<number, Rect>, ms: number) => void;
  readonly hide: () => void;
  /** Test seam: which of a Slot's marks are on screen now. */
  readonly shown: (slot: number) => {
    readonly glow: boolean;
    readonly badge: boolean;
    readonly vent: boolean;
    readonly ring: boolean;
  };
}

/**
 * Where a Component's Repair ring and Rush price sit, from its bounds: the ring round its centre,
 * the price (a Materials icon and a number) to the ring's right. Drawing and hit-testing share it.
 */
export function ringGeometry(rect: Rect): {
  readonly cx: number;
  readonly cy: number;
  readonly radius: number;
  readonly price: Rect;
} {
  const cx = rect.x + rect.width / 2;
  const cy = rect.y + rect.height / 2;
  const radius = Math.max(rect.width, rect.height) / 2 + MARK.ringGap;
  const px = cx + radius + MARK.priceGap;
  return {
    cx,
    cy,
    radius,
    price: {
      x: px,
      y: cy - MARK.priceHeight / 2,
      width: MARK.priceWidth,
      height: MARK.priceHeight,
    },
  };
}

/** Builds the marks for every Slot, hidden. `calm` (reduced motion): a steady glow and no venting. */
export function createDamageMarks(scene: Scene, calm: boolean): DamageMarks {
  const marks: SlotMarks[] = Array.from({ length: SLOT_COUNT }, () => ({
    glow: scene.add
      .image(0, 0, glowTexture(scene))
      .setTint(paletteNumber('rd3'))
      .setBlendMode(BlendModes.ADD)
      .setVisible(false),
    badge: scene.textures.exists('ui')
      ? scene.add.image(0, 0, 'ui', 'badge_alert').setVisible(false)
      : undefined,
    vent: (hasAsset('fx_vent')
      ? scene.add.image(0, 0, 'fx_vent', 'spray_0')
      : scene.add
          .image(0, 0, glowTexture(scene))
          .setDisplaySize(8, 14)
          .setTint(paletteNumber('am3'))
    )
      .setOrigin(0.5, 1)
      .setVisible(false),
    ring: scene.add.graphics().setVisible(false),
    icon: scene.add
      .image(0, 0, 'res_materials')
      .setDisplaySize(MARK.icon, MARK.icon)
      .setVisible(false),
    price: scene.add
      .text(0, 0, '', {
        fontFamily: "'Silkscreen', 'Courier New', monospace",
        fontSize: '8px',
        color: paletteCss('wh1'),
      })
      .setOrigin(0, 0.5)
      .setVisible(false),
  }));

  const hideSlot = (slot: SlotMarks): void => {
    slot.glow.setVisible(false);
    slot.badge?.setVisible(false);
    slot.vent.setVisible(false);
    slot.ring.setVisible(false);
    slot.icon.setVisible(false);
    slot.price.setVisible(false);
  };

  return {
    hide: () => {
      for (const slot of marks) hideSlot(slot);
    },
    shown: (index) => {
      const slot = marks[index];
      return {
        glow: slot?.glow.visible ?? false,
        badge: slot?.badge?.visible ?? false,
        vent: slot?.vent.visible ?? false,
        ring: slot?.ring.visible ?? false,
      };
    },
    show: (run, bounds, ms) => {
      marks.forEach((slot, index) => {
        const rect = bounds.get(index);
        const state = repairState(run, index);
        if (!rect || state.kind === 'sound') {
          hideSlot(slot);
          return;
        }
        const { cx, cy, radius, price } = ringGeometry(rect);
        const size = Math.max(rect.width, rect.height);
        const breathe = calm ? 0.55 : 0.45 + 0.25 * Math.sin((ms / MARK.glowMs) * Math.PI);
        slot.glow
          .setPosition(cx, cy)
          .setDisplaySize(size * MARK.glowScale, size * MARK.glowScale)
          .setAlpha(breathe)
          .setVisible(true);
        slot.badge?.setPosition(rect.x + rect.width, rect.y).setVisible(true);

        // A leaking Tank vents Fuel off its top until the Repair is done (not under reduced motion).
        const id = run.spacecraft.slots[index];
        const leaking = id !== null && id !== undefined && COMPONENTS[id].kind === 'fuel-tank';
        slot.vent.setVisible(leaking && !calm);
        if (leaking && !calm) {
          slot.vent.setPosition(cx, rect.y + 2).setScale(MARK.ventScale);
          const frame = Math.floor(ms / MARK.ventFrameMs) % MARK.ventFrames;
          if (slot.vent.texture.key === 'fx_vent') slot.vent.setFrame(`spray_${String(frame)}`);
          else slot.vent.setAlpha(1 - frame / MARK.ventFrames / 2);
        }

        // While Repaired: the ring fills round the part, and the Rush price waits beside it.
        const repairing = state.progress !== null;
        slot.ring.setVisible(repairing);
        slot.icon.setVisible(repairing);
        slot.price.setVisible(repairing);
        if (!repairing) return;
        const start = -Math.PI / 2;
        slot.ring
          .clear()
          .lineStyle(MARK.ringWidth, paletteNumber('gm2'), 0.8)
          .strokeCircle(cx, cy, radius)
          .lineStyle(MARK.ringWidth, paletteNumber('cy3'), 1)
          .beginPath()
          .arc(cx, cy, radius, start, start + 2 * Math.PI * state.progress)
          .strokePath();
        const dim = state.affordable ? 1 : 0.4;
        slot.icon.setPosition(price.x + MARK.icon / 2, cy).setAlpha(dim);
        slot.price
          .setText(String(state.rush))
          .setPosition(price.x + MARK.icon + 1, cy)
          .setAlpha(dim);
      });
    },
  };
}

/**
 * The Damaged Slot a click at (`x`, `y`) lands on, its Component's bounds a little enlarged so small
 * parts are easy to hit; `undefined` when it lands on nothing Damaged.
 */
export function damagedSlotAt(
  run: Run,
  bounds: ReadonlyMap<number, Rect>,
  x: number,
  y: number,
): number | undefined {
  for (const [slot, rect] of bounds) {
    if (!run.spacecraft.damage[slot]) continue;
    const s = MARK.hitSlop;
    const inside =
      x >= rect.x - s &&
      x <= rect.x + rect.width + s &&
      y >= rect.y - s &&
      y <= rect.y + rect.height + s;
    if (inside) return slot;
  }
  return undefined;
}

/**
 * The Slot whose Rush a click at (`x`, `y`) asks for: it lands on a running Repair's ring (its line,
 * give or take a little, outside every Damaged part) or on the Rush price beside it, and the
 * Materials can pay. A click on the
 * part itself only ever starts a Repair, so a double-click never spends Materials.
 */
export function rushTargetAt(
  run: Run,
  bounds: ReadonlyMap<number, Rect>,
  x: number,
  y: number,
): number | undefined {
  // A click on a Damaged part (its bounds, give or take a little) is never a Rush, even where the
  // ring's line runs close by its corners or narrow edges.
  if (damagedSlotAt(run, bounds, x, y) !== undefined) return undefined;
  for (const [slot, rect] of bounds) {
    const state = repairState(run, slot);
    if (state.kind === 'sound' || state.progress === null || !state.affordable) continue;
    const { cx, cy, radius, price } = ringGeometry(rect);
    const onRing = Math.abs(Math.hypot(x - cx, y - cy) - radius) <= MARK.hitSlop;
    const onPrice =
      x >= price.x && x <= price.x + price.width && y >= price.y && y <= price.y + price.height;
    if (onRing || onPrice) return slot;
  }
  return undefined;
}

/**
 * What a click at (`x`, `y`) on the Spacecraft asks for: a Rush on a ring or price, else a Repair of
 * a Damaged part with none running yet; `undefined` for anything else (a part already being Repaired).
 */
export function repairClickAt(
  run: Run,
  bounds: ReadonlyMap<number, Rect>,
  x: number,
  y: number,
): { readonly action: 'repair' | 'rush'; readonly slot: number } | undefined {
  const rush = rushTargetAt(run, bounds, x, y);
  if (rush !== undefined) return { action: 'rush', slot: rush };
  const part = damagedSlotAt(run, bounds, x, y);
  if (part === undefined) return undefined;
  const state = repairState(run, part);
  return state.kind === 'damaged' && state.progress === null
    ? { action: 'repair', slot: part }
    : undefined;
}
