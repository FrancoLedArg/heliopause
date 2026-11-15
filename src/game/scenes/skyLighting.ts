// The Landed sky's light through the local day (#192): the pure numbers `addSkyLight` paints.
import { skyDay } from '../sim/clock.ts';

/** How strong the glow and the shade get (presentation tuning): the night is never fully black, the day never washed out. */
export const SKY_LIGHT = { glowMax: 0.4, shadeMax: 0.55 } as const;

export interface SkyLighting {
  /** Alpha of the pale glow behind the sky's Bodies. */
  readonly glowAlpha: number;
  /** Alpha of the dark shade over the landscape. */
  readonly shadeAlpha: number;
}

/** The lighting at a fraction of the local day (0 = midnight, 0.5 = noon). */
export function skyLighting(fraction: number): SkyLighting {
  const { daylight } = skyDay(fraction);
  return {
    glowAlpha: SKY_LIGHT.glowMax * daylight,
    shadeAlpha: SKY_LIGHT.shadeMax * (1 - daylight),
  };
}
