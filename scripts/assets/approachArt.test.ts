import { readFileSync } from 'node:fs';
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
