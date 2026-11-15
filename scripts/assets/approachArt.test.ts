import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { SPRITE_PREFIX, VARIANTS as BODY_VARIANTS } from '../../src/game/scenes/landedView.ts';

// Seam: the committed Approach art as the game sees it, through manifest.json and the PNGs.
const ASSETS = new URL('../../public/assets/', import.meta.url);
const APPROACH_SIZE = 256;
const PNG_SIGNATURE = '89504e470d0a1a0a';
const RGBA_COLOUR_TYPE = 6;

/** Every Body variant's small sprite key, from the game data (the star and the Heliopause have no Approach). */
const VARIANTS = (Object.keys(BODY_VARIANTS) as (keyof typeof BODY_VARIANTS)[]).flatMap((kind) =>
  Array.from({ length: BODY_VARIANTS[kind] }, (_, n) => `${SPRITE_PREFIX[kind]}${n}`),
);

const manifest = JSON.parse(
  readFileSync(new URL('../../src/game/assets/manifest.json', import.meta.url), 'utf8'),
) as { images: { key: string; file: string }[] };

/** Width, height and colour type of a PNG, read from its IHDR chunk. */
function pngHeader(file: string): { width: number; height: number; hasAlpha: boolean } {
  const bytes = readFileSync(new URL(file, ASSETS));
  expect(bytes.subarray(0, 8).toString('hex')).toBe(PNG_SIGNATURE);
  return {
    width: bytes.readUInt32BE(16),
    height: bytes.readUInt32BE(20),
    hasAlpha: bytes.readUInt8(25) === RGBA_COLOUR_TYPE,
  };
}

describe('the large Approach art of every Body variant', () => {
  it.each(VARIANTS)(
    '%s has an _approach manifest entry and a transparent PNG of the expected size',
    (key) => {
      const entry = manifest.images.find((image) => image.key === `${key}_approach`);
      expect(entry, `${key}_approach is listed in the manifest`).toBeDefined();
      const header = pngHeader(entry?.file ?? '');
      expect(header).toEqual({ width: APPROACH_SIZE, height: APPROACH_SIZE, hasAlpha: true });
    },
  );

  it('lists no _approach entry for a variant that does not exist', () => {
    const listed = manifest.images
      .filter((image) => image.key.endsWith('_approach'))
      .map((image) => image.key);
    expect(listed.sort()).toEqual(VARIANTS.map((key) => `${key}_approach`).sort());
  });
});

const palette = JSON.parse(
  readFileSync(new URL('../../public/assets/ui/palette.json', import.meta.url), 'utf8'),
) as Record<string, string>;
const PALETTE_HEX = new Set(
  Object.values(palette).map((hex) => hex.replace('#', '').toLowerCase()),
);

/** The distinct opaque colours of an 8-bit RGBA PNG (as rrggbb), with a pixel count each. */
function opaqueColours(file: string): Map<string, number> {
  const bytes = readFileSync(new URL(file, ASSETS));
  const { width, height } = pngHeader(file);
  const chunks: Buffer[] = [];
  for (let at = 8; at < bytes.length;) {
    const length = bytes.readUInt32BE(at);
    if (bytes.toString('latin1', at + 4, at + 8) === 'IDAT') {
      chunks.push(bytes.subarray(at + 8, at + 8 + length));
    }
    at += 12 + length;
  }
  const raw = inflateSync(Buffer.concat(chunks));
  const stride = width * 4;
  const rows: Buffer[] = [];
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)] ?? 0;
    const line = Buffer.from(raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)));
    const up = rows[y - 1] ?? Buffer.alloc(stride);
    for (let i = 0; i < stride; i++) {
      const a = i >= 4 ? (line[i - 4] ?? 0) : 0;
      const b = up[i] ?? 0;
      const c = i >= 4 ? (up[i - 4] ?? 0) : 0;
      const p = a + b - c;
      const [pa, pb, pc] = [Math.abs(p - a), Math.abs(p - b), Math.abs(p - c)];
      const paeth = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      const add = [0, a, b, (a + b) >> 1, paeth][filter] ?? 0;
      line[i] = ((line[i] ?? 0) + add) & 0xff;
    }
    rows.push(line);
  }
  const counts = new Map<string, number>();
  for (const line of rows) {
    for (let x = 0; x < width; x++) {
      if (line[x * 4 + 3] === 0) continue;
      const hex = line.subarray(x * 4, x * 4 + 3).toString('hex');
      counts.set(hex, (counts.get(hex) ?? 0) + 1);
    }
  }
  return counts;
}

describe('the colours of the Approach art', () => {
  const approachFiles = manifest.images.filter((image) => image.key.endsWith('_approach'));

  it.each(approachFiles.map((image) => [image.key, image.file] as const))(
    '%s uses only palette.json colours (transparency allowed)',
    (_key, file) => {
      const off = [...opaqueColours(file).keys()].filter((hex) => !PALETTE_HEX.has(hex));
      expect(off).toEqual([]);
    },
  );

  it('the sulfur moon has no stray mint-green block (issue #260)', () => {
    const entry = manifest.images.find((image) => image.key === 'body_moon_2_approach');
    const mint = (palette['gr3'] ?? '').replace('#', '').toLowerCase();
    expect(opaqueColours(entry?.file ?? '').get(mint) ?? 0).toBe(0);
  });
});
