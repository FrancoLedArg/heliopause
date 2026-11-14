import paletteJson from '../../../public/assets/ui/palette.json';

/**
 * The kit palette (public/assets/ui/palette.json): the only colours the game uses.
 * Gunmetal `gm*` frames, cyan `cy*` interactive parts, amber `am*` primary actions and resources,
 * red `rd*` danger, green `gr*` success; 0 is darkest.
 */
export type PaletteColor = keyof typeof paletteJson;

/** CSS colour string, e.g. `#46dcec`. */
export function paletteCss(color: PaletteColor): string {
  return paletteJson[color];
}

/** Colour as a 0xRRGGBB number, for Phaser. */
export function paletteNumber(color: PaletteColor): number {
  return Number.parseInt(paletteJson[color].slice(1), 16);
}

/** Every palette colour as a CSS custom property (`--cy3: #46dcec`), to set on the UI root. */
export function paletteCssVariables(): Record<string, string> {
  return Object.fromEntries(Object.entries(paletteJson).map(([name, hex]) => [`--${name}`, hex]));
}
