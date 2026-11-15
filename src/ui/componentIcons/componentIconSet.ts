import { paletteCss, type PaletteColor } from '../kit/palette.ts';

/**
 * The Component icon set (#221): one 16×16 icon per kind of Component the player can fit. Stand-ins
 * drawn in code in the kit palette until final art arrives; each has a manifest key (`comp_engine`, …)
 * so that art drops in through `hasAsset` with no code change. Self-contained so the composed Spacecraft
 * (#230) can reuse or replace it.
 */
// `radar` is a placeholder until the Radar Component lands in the sim (#191).
export const COMPONENT_ICON_KINDS = [
  'engine',
  'fuel-tank',
  'drill',
  'radar',
  'jump-drive',
] as const;
export type ComponentIconKind = (typeof COMPONENT_ICON_KINDS)[number];

/** Native size of every icon, in pixels. */
export const COMPONENT_ICON_SIZE = 16;

/** The manifest key of a Component's final art: `comp_engine`, `comp_fuel_tank`, … */
export function componentIconKey(kind: ComponentIconKind): string {
  return `comp_${kind.replace('-', '_')}`;
}

/** The Component's name as assistive technology reads it. */
export const COMPONENT_ICON_NAMES: Record<ComponentIconKind, string> = {
  engine: 'Engine',
  'fuel-tank': 'Fuel Tank',
  drill: 'Drill',
  radar: 'Radar',
  'jump-drive': 'Jump Drive',
};

/** One character per pixel in `PIXELS`; `.` is clear. */
const LEGEND: Record<string, PaletteColor> = {
  o: 'gm2', // outline
  g: 'gm4', // metal
  h: 'gm6', // highlight
  c: 'cy3', // cyan
  d: 'cy1', // dark cyan
  a: 'am3', // amber
  b: 'am1', // dark amber
  w: 'am4', // flame core
  v: 'vi3', // jump violet
  u: 'vi1', // dark violet
};

/** Each icon is 16 rows of 16 characters. */
const PIXELS: Record<ComponentIconKind, readonly string[]> = {
  engine: [
    '................',
    '.....oooooo.....',
    '....oggggggo....',
    '....ohggggho....',
    '.....oggggo.....',
    '....oooooooo....',
    '...oggggggggo...',
    '...ohggggggho...',
    '..oggggggggggo..',
    '..ohggggggggho..',
    '.ooggggggggggoo.',
    '.oabbbbbbbbbbao.',
    '..aaawwwwwwaaa..',
    '...baawwwwaab...',
    '....bbawwabb....',
    '.....bbaabb.....',
  ],
  'fuel-tank': [
    '................',
    '.....oooooo.....',
    '....oggggggo....',
    '...oggggggggo...',
    '...ohggggggho...',
    '..oooooooooooo..',
    '..oggggggggggo..',
    '..ohgggaaggggo..',
    '..ohggaaaaggbo..',
    '..ohggaaaaggbo..',
    '..ohgggaaggggo..',
    '..oggggggggggo..',
    '..oooooooooooo..',
    '...oggggggggo...',
    '....oooooooo....',
    '................',
  ],
  drill: [
    '................',
    '.......oo.......',
    '......ohgo......',
    '.....ohggo......',
    '......oggho.....',
    '.....ohggo......',
    '......oggho.....',
    '..oooooggooooo..',
    '..ogggccccgggo..',
    '..ohggccccggho..',
    '..oooooooooooo..',
    '.....ogggo......',
    '......ogo.......',
    '......ogo.......',
    '.......o........',
    '................',
  ],
  radar: [
    '................',
    '..cc........cc..',
    '.c..c......c..c.',
    '.c.cc.cccc.cc.c.',
    '.c.c........c.c.',
    '..c..oooooo..c..',
    '.....ohhggo.....',
    '......oggo......',
    '.......oo.......',
    '....oooooooo....',
    '...oggggggggo...',
    '...ohgddddggo...',
    '...oggggggggo...',
    '...oooooooooo...',
    '................',
    '................',
  ],
  'jump-drive': [
    '................',
    '.......vv.......',
    '.....vvuuvv.....',
    '....vuuccuuv....',
    '...vuccvvccuv...',
    '...vucvooovuv...',
    '..vuucvooovuuv..',
    '..vuucvooovuuv..',
    '...vucvooovuv...',
    '...vuccvvccuv...',
    '....vuuccuuv....',
    '.....vvuuvv.....',
    '.......vv.......',
    '................',
    '................',
    '................',
  ],
};

/** One coloured pixel of an icon. */
export interface IconPixel {
  readonly x: number;
  readonly y: number;
  /** CSS colour from the kit palette. */
  readonly fill: string;
}

/** The pixels of a kind's stand-in icon, in the kit palette, to draw as 1×1 squares on a 16×16 grid. */
export function componentIconPixels(kind: ComponentIconKind): readonly IconPixel[] {
  const pixels: IconPixel[] = [];
  PIXELS[kind].forEach((row, y) => {
    Array.from(row).forEach((char, x) => {
      const color = LEGEND[char];
      if (color) pixels.push({ x, y, fill: paletteCss(color) });
    });
  });
  return pixels;
}

/** The raw rows of a kind's stand-in, so a test can check the grid is 16×16 and uses only the legend. */
export function componentIconRows(kind: ComponentIconKind): readonly string[] {
  return PIXELS[kind];
}

/** The characters the stand-ins may use (besides `.` for clear). */
export const COMPONENT_ICON_LEGEND: string = Object.keys(LEGEND).join('');
