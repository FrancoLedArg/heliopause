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
  /** How far a click may land outside a Component and still hit it. */
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
    show: (run, bounds, ms) => {
      marks.forEach((slot, index) => {
        const rect = bounds.get(index);
        const state = repairState(run, index);
        if (!rect || state.kind === 'sound') {
          hideSlot(slot);
          return;
        }
        const cx = rect.x + rect.width / 2;
        const cy = rect.y + rect.height / 2;
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
        const radius = size / 2 + MARK.ringGap;
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
        const px = cx + radius + MARK.priceGap;
        slot.icon.setPosition(px + MARK.icon / 2, cy).setAlpha(dim);
        slot.price
          .setText(String(state.rush))
          .setPosition(px + MARK.icon + 1, cy)
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
