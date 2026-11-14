import atlasJson from '../../../public/assets/ui/heliopause_ui.json';
import metaJson from '../../../public/assets/ui/ui_meta.json';

/**
 * The Heliopause UI kit (docs/design/ui-kit/README.md): typed frame names and the geometry to draw
 * any frame at any size. Frame rectangles come from the atlas data, slice margins from
 * `ui_meta.json` (the kit's source of truth). Both files are imported here, once, so every frame
 * name is checked at compile time and drawing never waits on a fetch.
 */

/** Manifest key the kit atlas is loaded under (see `src/game/assets/manifest.json`). */
export const KIT_ATLAS_KEY = 'ui';

/** Every frame in the kit, e.g. `btn_primary_normal`, `panel_metal`, `titlebar`. */
export type KitFrameName = keyof typeof metaJson;

export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

/** One piece of a frame: copy `source` (atlas pixels) into `dest` (pixels relative to the frame's top-left). */
export interface KitPiece {
  readonly source: Rect;
  readonly dest: Rect;
}

type Slicing =
  | { readonly kind: 'none' }
  /** Stretches horizontally only (title bars, dividers, bar fills). */
  | { readonly kind: 'three'; readonly left: number; readonly right: number }
  | {
      readonly kind: 'nine';
      readonly left: number;
      readonly right: number;
      readonly top: number;
      readonly bottom: number;
    };

interface KitFrame {
  readonly source: Rect;
  readonly slicing: Slicing;
}

function parseSlicing(name: KitFrameName): Slicing {
  const meta = metaJson[name];
  if (!('scale9' in meta)) return { kind: 'none' };
  const { left, right, top, bottom } = meta.scale9;
  return top === 0 && bottom === 0
    ? { kind: 'three', left, right }
    : { kind: 'nine', left, right, top, bottom };
}

function kitFrame(name: KitFrameName): KitFrame {
  return { source: atlasJson.frames[name].frame, slicing: parseSlicing(name) };
}

/** Natural (unstretched) size of a kit frame. */
export function kitFrameSize(name: KitFrameName): { readonly w: number; readonly h: number } {
  const { w, h } = kitFrame(name).source;
  return { w, h };
}

/**
 * Splits a kit frame into the pieces that draw it at `width`×`height` (defaults: its natural size).
 * Corners keep their pixels; edges and centre stretch. Throws for a size the frame cannot take
 * (stretching an unsliced frame, a three-slice frame vertically, or below its corners): that is a
 * layout bug, not a player-caused failure.
 */
export function sliceKitFrame(name: KitFrameName, width?: number, height?: number): KitPiece[] {
  const { source, slicing } = kitFrame(name);
  const w = width ?? source.w;
  const h = height ?? source.h;
  const fail = (why: string): never => {
    throw new RangeError(`Kit frame ${name} cannot be drawn at ${w}x${h}: ${why}`);
  };

  switch (slicing.kind) {
    case 'none':
      if (w !== source.w || h !== source.h)
        fail(`it has no slices; its size is ${source.w}x${source.h}`);
      return [{ source, dest: { x: 0, y: 0, w, h } }];
    case 'three':
      if (h !== source.h) fail(`it stretches horizontally only; its height is ${source.h}`);
      return slice(source, w, h, [slicing.left, slicing.right], [0, 0], fail);
    case 'nine':
      return slice(
        source,
        w,
        h,
        [slicing.left, slicing.right],
        [slicing.top, slicing.bottom],
        fail,
      );
  }
}

/** A band along one axis: where it starts and how long it is, in the atlas and on screen. */
interface Band {
  readonly from: number;
  readonly size: number;
  readonly to: number;
  readonly length: number;
}

/** Cuts one axis into start margin, stretchy middle and end margin, dropping empty margins. */
function bands(
  start: number,
  natural: number,
  target: number,
  [lead, trail]: readonly [number, number],
): Band[] {
  const middle = natural - lead - trail;
  const stretched = target - lead - trail;
  return [
    { from: start, size: lead, to: 0, length: lead },
    { from: start + lead, size: middle, to: lead, length: stretched },
    { from: start + natural - trail, size: trail, to: target - trail, length: trail },
  ].filter((band) => band.size > 0);
}

function slice(
  source: Rect,
  w: number,
  h: number,
  horizontal: readonly [number, number],
  vertical: readonly [number, number],
  fail: (why: string) => never,
): KitPiece[] {
  if (w < horizontal[0] + horizontal[1] || h < vertical[0] + vertical[1]) {
    fail(
      `smaller than its corners (${horizontal[0] + horizontal[1]}x${vertical[0] + vertical[1]})`,
    );
  }
  const columns = bands(source.x, source.w, w, horizontal);
  const rows = bands(source.y, source.h, h, vertical);
  return rows.flatMap((row) =>
    columns.map((column) => ({
      source: { x: column.from, y: row.from, w: column.size, h: row.size },
      dest: { x: column.to, y: row.to, w: column.length, h: row.length },
    })),
  );
}
