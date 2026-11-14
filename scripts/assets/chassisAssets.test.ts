import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';

// Seam: the committed Chassis art as the game sees it, through manifest.json, the atlas JSON and the PNGs.
const ASSETS = new URL('../../public/assets/', import.meta.url);
const read = (rel: string): Buffer => readFileSync(new URL(rel, ASSETS));

interface Atlas {
  key: string;
  image: string;
  data: string;
}
interface FrameData {
  frames: Record<string, { frame: { x: number; y: number; w: number; h: number } }>;
}
const manifest = JSON.parse(
  readFileSync(new URL('../../src/game/assets/manifest.json', import.meta.url), 'utf8'),
) as { atlases: Atlas[] };
const atlas = (key: string): Atlas => {
  const found = manifest.atlases.find((entry) => entry.key === key);
  if (!found) throw new Error(`manifest lists no atlas "${key}"`);
  return found;
};
const frames = (key: string): FrameData['frames'] =>
  (JSON.parse(read(atlas(key).data).toString('utf8')) as FrameData).frames;

interface Png {
  width: number;
  height: number;
  rgba: Uint8Array;
}
/** Minimal decoder for the 8-bit RGBA, non-interlaced PNGs the generator writes. */
function decodePng(file: Buffer): Png {
  const width = file.readUInt32BE(16);
  const height = file.readUInt32BE(20);
  if (file[24] !== 8 || file[25] !== 6 || file[28] !== 0)
    throw new Error('expected 8-bit RGBA, non-interlaced PNG');
  const idat: Buffer[] = [];
  for (let at = 8; at < file.length;) {
    const len = file.readUInt32BE(at);
    if (file.toString('latin1', at + 4, at + 8) === 'IDAT')
      idat.push(file.subarray(at + 8, at + 8 + len));
    at += 12 + len;
  }
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * 4;
  const rgba = new Uint8Array(stride * height);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    for (let i = 0; i < stride; i++) {
      const cur = raw[y * (stride + 1) + 1 + i] ?? 0;
      const left = i >= 4 ? (rgba[y * stride + i - 4] ?? 0) : 0;
      const up = y > 0 ? (rgba[(y - 1) * stride + i] ?? 0) : 0;
      const upLeft = y > 0 && i >= 4 ? (rgba[(y - 1) * stride + i - 4] ?? 0) : 0;
      let predictor = 0;
      if (filter === 1) predictor = left;
      else if (filter === 2) predictor = up;
      else if (filter === 3) predictor = (left + up) >> 1;
      else if (filter === 4) {
        const p = left + up - upLeft;
        const [pa, pb, pc] = [Math.abs(p - left), Math.abs(p - up), Math.abs(p - upLeft)];
        predictor = pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft;
      }
      rgba[y * stride + i] = (cur + predictor) & 255;
    }
  }
  return { width, height, rgba };
}

const palette = new Set(
  Object.values(JSON.parse(read('ui/palette.json').toString('utf8')) as Record<string, string>).map(
    (hex) => hex.slice(1).toLowerCase(),
  ),
);
const CHASSIS = ['scout', 'hauler', 'lancer'] as const;
const hex = (n: number): string => n.toString(16).padStart(2, '0');

describe('Chassis sprites', () => {
  for (const id of CHASSIS) {
    it(`${id} is a spritesheet with landed, landed_lit and flight frames of 96x64`, () => {
      const sheet = atlas(`chassis_${id}`);
      const png = decodePng(read(sheet.image));
      const named = frames(`chassis_${id}`);
      expect(Object.keys(named).sort()).toEqual(['flight', 'landed', 'landed_lit']);
      for (const { frame } of Object.values(named)) {
        expect(frame.w).toBe(96);
        expect(frame.h).toBe(64);
        expect(frame.x + frame.w).toBeLessThanOrEqual(png.width);
        expect(frame.y + frame.h).toBeLessThanOrEqual(png.height);
      }
    });
  }

  it('the thruster plume has three flicker frames of 16x24', () => {
    const named = frames('fx_thruster');
    expect(Object.keys(named)).toHaveLength(3);
    for (const { frame } of Object.values(named)) {
      expect(frame.w).toBe(16);
      expect(frame.h).toBe(24);
    }
  });

  it('landed with lights on differs from lights off only in a few pixels, and the ship is not empty', () => {
    for (const id of CHASSIS) {
      const png = decodePng(read(atlas(`chassis_${id}`).image));
      const named = frames(`chassis_${id}`);
      const off = named['landed']?.frame;
      const on = named['landed_lit']?.frame;
      if (!off || !on) throw new Error(`${id} lacks landed or landed_lit`);
      let opaque = 0;
      let differing = 0;
      for (let y = 0; y < off.h; y++) {
        for (let x = 0; x < off.w; x++) {
          const a = ((off.y + y) * png.width + off.x + x) * 4;
          const b = ((on.y + y) * png.width + on.x + x) * 4;
          if ((png.rgba[a + 3] ?? 0) > 0) opaque++;
          if (png.rgba.slice(a, a + 4).join() !== png.rgba.slice(b, b + 4).join()) differing++;
        }
      }
      expect(opaque).toBeGreaterThan(900);
      expect(differing).toBeGreaterThan(3);
      expect(differing).toBeLessThan(opaque / 6);
    }
  });

  it('uses only palette colours, fully opaque or fully transparent', () => {
    for (const key of ['chassis_scout', 'chassis_hauler', 'chassis_lancer', 'fx_thruster']) {
      const { rgba } = decodePng(read(atlas(key).image));
      for (let i = 0; i < rgba.length; i += 4) {
        const alpha = rgba[i + 3];
        expect([0, 255]).toContain(alpha);
        if (alpha === 255) {
          const colour = hex(rgba[i] ?? 0) + hex(rgba[i + 1] ?? 0) + hex(rgba[i + 2] ?? 0);
          expect(palette.has(colour), `${key}: #${colour} is not in palette.json`).toBe(true);
        }
      }
    }
  });
});
