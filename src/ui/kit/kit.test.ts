import { describe, expect, it } from 'vitest';
import { sliceKitFrame } from './kit.ts';

// Expected rectangles are worked out by hand from the kit files: atlas positions from
// public/assets/ui/heliopause_ui.json, slice margins from public/assets/ui/ui_meta.json.

describe('sliceKitFrame', () => {
  it('stretches a nine-slice button to a wider size while keeping its corners intact', () => {
    // btn_primary_normal: atlas (2,258), 96x24, slices left 12 right 12 top 7 bottom 8.
    const pieces = sliceKitFrame('btn_primary_normal', 116, 30);

    expect(pieces).toHaveLength(9);
    expect(pieces).toContainEqual({
      source: { x: 2, y: 258, w: 12, h: 7 },
      dest: { x: 0, y: 0, w: 12, h: 7 },
    });
    expect(pieces).toContainEqual({
      source: { x: 86, y: 274, w: 12, h: 8 },
      dest: { x: 104, y: 22, w: 12, h: 8 },
    });
    // The centre takes up all the extra room.
    expect(pieces).toContainEqual({
      source: { x: 14, y: 265, w: 72, h: 9 },
      dest: { x: 12, y: 7, w: 92, h: 15 },
    });
  });

  it('stretches a three-slice title bar horizontally only', () => {
    // titlebar: atlas (38,328), 64x14, slices left 16 right 16, no top or bottom.
    expect(sliceKitFrame('titlebar', 200, 14)).toEqual([
      { source: { x: 38, y: 328, w: 16, h: 14 }, dest: { x: 0, y: 0, w: 16, h: 14 } },
      { source: { x: 54, y: 328, w: 32, h: 14 }, dest: { x: 16, y: 0, w: 168, h: 14 } },
      { source: { x: 86, y: 328, w: 16, h: 14 }, dest: { x: 184, y: 0, w: 16, h: 14 } },
    ]);
  });

  it('draws a frame without slices whole, at its own size', () => {
    // res_fuel: atlas (138,52), 32x32.
    expect(sliceKitFrame('res_fuel')).toEqual([
      { source: { x: 138, y: 52, w: 32, h: 32 }, dest: { x: 0, y: 0, w: 32, h: 32 } },
    ]);
  });

  it('refuses to stretch a frame that has no slices', () => {
    expect(() => sliceKitFrame('res_fuel', 64, 32)).toThrow(RangeError);
  });

  it('refuses to stretch a three-slice frame vertically', () => {
    expect(() => sliceKitFrame('titlebar', 200, 20)).toThrow(RangeError);
  });

  it('refuses a size smaller than the frame corners', () => {
    expect(() => sliceKitFrame('panel_metal', 20, 48)).toThrow(RangeError);
  });
});
