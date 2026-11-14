import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import {
  FLIGHT_ANGLE,
  frameGeometry,
  nozzleExits,
  turn,
  type ShipFrame,
  type ShipPose,
} from '../../src/game/scenes/chassisArt.ts';

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
    it(`${id} is a spritesheet with landed, landed_lit and flight frames sized as the art data says`, () => {
      const sheet = atlas(`chassis_${id}`);
      const png = decodePng(read(sheet.image));
      const named = frames(`chassis_${id}`);
      expect(Object.keys(named).sort()).toEqual(['flight', 'landed', 'landed_lit']);
      for (const [name, { frame }] of Object.entries(named)) {
        const size = frameGeometry(id, name as ShipFrame);
        expect([frame.w, frame.h], `${id} ${name}`).toEqual([size.width, size.height]);
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

  /** Whether the pixel at (x, y) of a frame (frame-local) is part of the art. */
  const solidAt = (
    id: (typeof CHASSIS)[number],
    name: ShipFrame,
  ): ((x: number, y: number) => boolean) => {
    const png = decodePng(read(atlas(`chassis_${id}`).image));
    const frame = frames(`chassis_${id}`)[name]?.frame;
    if (!frame) throw new Error(`${id} lacks ${name}`);
    return (x, y) =>
      x >= 0 &&
      y >= 0 &&
      x < frame.w &&
      y < frame.h &&
      (png.rgba[((frame.y + y) * png.width + frame.x + x) * 4 + 3] ?? 0) > 0;
  };

  for (const id of CHASSIS) {
    for (const name of ['landed', 'landed_lit'] as const) {
      it(`${id} rests the lowest row of its ${name} art on the base line`, () => {
        const { width, height, pivot } = frameGeometry(id, name);
        const solid = solidAt(id, name);
        let lowest = -1;
        for (let y = 0; y < height; y++)
          for (let x = 0; x < width; x++) if (solid(x, y)) lowest = y;
        // The origin is the centre of the base, on the line the Spacecraft stands on.
        expect(lowest + 1).toBe(pivot.y);
        expect(pivot.x).toBe(width / 2);
      });
    }

    for (const pose of ['standing', 'flight'] as const satisfies readonly ShipPose[]) {
      it(`${id} has every nozzle exit of the ${pose} pose at the bottom of a nozzle`, () => {
        const frame: ShipFrame = pose === 'standing' ? 'landed' : 'flight';
        const { pivot } = frameGeometry(id, frame);
        const solid = solidAt(id, frame);
        // Plumes leave rearward: straight down when standing, along the flight heading when turned.
        const rearward = turn({ x: 0, y: 1 }, pose === 'flight' ? FLIGHT_ANGLE : 0);
        for (const exit of nozzleExits(id, pose)) {
          const at = (distance: number): boolean =>
            solid(
              Math.floor(pivot.x + exit.x + rearward.x * distance),
              Math.floor(pivot.y + exit.y + rearward.y * distance),
            );
          expect(at(-1.5), `art just inside the exit ${JSON.stringify(exit)}`).toBe(true);
          expect(at(2.5), `open air beyond the exit ${JSON.stringify(exit)}`).toBe(false);
        }
      });
    }

    it(`${id} points its nose up and to the right in the flight frame`, () => {
      const { width, height, pivot } = frameGeometry(id, 'flight');
      const solid = solidAt(id, 'flight');
      // The nose is the solid pixel furthest from the base centre.
      let nose = { x: 0, y: 0 };
      let far = 0;
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const reach = Math.hypot(x - pivot.x, y - pivot.y);
          if (solid(x, y) && reach > far) {
            far = reach;
            nose = { x: x - pivot.x, y: y - pivot.y };
          }
        }
      }
      // 24 degrees above the horizontal, give or take the pixels.
      const heading = (Math.atan2(-nose.y, nose.x) * 180) / Math.PI;
      expect(heading).toBeGreaterThan(90 - FLIGHT_ANGLE - 4);
      expect(heading).toBeLessThan(90 - FLIGHT_ANGLE + 4);
    });
  }

  it('uses only palette colours, fully opaque or fully transparent', () => {
    for (const key of ['chassis_scout', 'chassis_hauler', 'chassis_lancer', 'fx_thruster']) {
      const { rgba } = decodePng(read(atlas(key).image));
      const offPalette = new Set<string>();
      const partialAlpha = new Set<number>();
      for (let i = 0; i < rgba.length; i += 4) {
        const alpha = rgba[i + 3] ?? 0;
        if (alpha !== 0 && alpha !== 255) partialAlpha.add(alpha);
        if (alpha === 255) {
          const colour = hex(rgba[i] ?? 0) + hex(rgba[i + 1] ?? 0) + hex(rgba[i + 2] ?? 0);
          if (!palette.has(colour)) offPalette.add(`#${colour}`);
        }
      }
      expect([...offPalette], `${key}: colours not in palette.json`).toEqual([]);
      expect([...partialAlpha], `${key}: partly transparent pixels`).toEqual([]);
    }
  });
});
