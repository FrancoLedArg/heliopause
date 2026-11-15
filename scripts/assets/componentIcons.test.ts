import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  COMPONENT_ICON_KINDS,
  COMPONENT_ICON_SIZE,
  componentIconKey,
} from '../../src/ui/componentIcons/componentIconSet.ts';

// Seam: the committed Component icon art as the game sees it, through manifest.json and the PNG files.
const manifest = JSON.parse(
  readFileSync(new URL('../../src/game/assets/manifest.json', import.meta.url), 'utf8'),
) as { images: { key: string; file: string }[] };

/** Width and height from a PNG's IHDR chunk, and its colour type (6 is RGBA). */
function pngHeader(file: string): { width: number; height: number; colorType: number } {
  const bytes = readFileSync(new URL(`../../public/assets/${file}`, import.meta.url));
  return {
    width: bytes.readUInt32BE(16),
    height: bytes.readUInt32BE(20),
    colorType: bytes[25] ?? -1,
  };
}

describe('the Component icon art', () => {
  it.each(COMPONENT_ICON_KINDS)('lists %s in the manifest as a 16x16 RGBA PNG', (kind) => {
    const key = componentIconKey(kind);
    const entry = manifest.images.find((image) => image.key === key);
    expect(entry, `manifest lists no image "${key}"`).toBeDefined();
    expect(pngHeader(entry?.file ?? '')).toEqual({
      width: COMPONENT_ICON_SIZE,
      height: COMPONENT_ICON_SIZE,
      colorType: 6,
    });
  });
});
