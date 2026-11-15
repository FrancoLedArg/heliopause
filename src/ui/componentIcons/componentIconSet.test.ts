import { describe, expect, it } from 'vitest';
import {
  COMPONENT_ICON_KINDS,
  COMPONENT_ICON_LEGEND,
  COMPONENT_ICON_NAMES,
  COMPONENT_ICON_SIZE,
  componentIconKey,
  componentIconPixels,
  componentIconRows,
} from './componentIconSet.ts';

describe('the Component icon set', () => {
  it('has an icon for the Engine, Fuel Tank, Drill, Radar, Jump Drive and Instrument', () => {
    expect([...COMPONENT_ICON_KINDS]).toEqual([
      'engine',
      'fuel-tank',
      'drill',
      'radar',
      'jump-drive',
      'instrument',
    ]);
  });

  it('keys each icon so final art drops in through the manifest', () => {
    expect(COMPONENT_ICON_KINDS.map(componentIconKey)).toEqual([
      'comp_engine',
      'comp_fuel_tank',
      'comp_drill',
      'comp_radar',
      'comp_jump_drive',
      'comp_instrument',
    ]);
  });

  it('names each Component in words for assistive technology', () => {
    expect(COMPONENT_ICON_NAMES['jump-drive']).toBe('Jump Drive');
    expect(COMPONENT_ICON_NAMES['fuel-tank']).toBe('Fuel Tank');
  });

  it.each(COMPONENT_ICON_KINDS)(
    'draws the %s stand-in on a 16x16 grid in the kit palette',
    (kind) => {
      const rows = componentIconRows(kind);
      expect(rows).toHaveLength(COMPONENT_ICON_SIZE);
      for (const row of rows) {
        expect(row).toHaveLength(COMPONENT_ICON_SIZE);
        for (const char of row) {
          expect(char === '.' || COMPONENT_ICON_LEGEND.includes(char)).toBe(true);
        }
      }
      const pixels = componentIconPixels(kind);
      expect(pixels.length).toBeGreaterThan(20);
      for (const pixel of pixels) expect(pixel.fill).toMatch(/^#[0-9a-f]{6}$/);
    },
  );
});
