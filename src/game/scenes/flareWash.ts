// The solar flare as the player sees it (#253), shown, not told: a warm wash that rolls in from the
// star's side of the screen and fades, and a Radar that flickers dead until it is Repaired. Both are
// pure functions of time, so a seek shows a fixed frame. Reduced motion stays calm: a faint, slow
// tint with no flash and no flicker.

/** Presentation tuning (ms and alpha). */
const WASH = {
  rise: 220,
  fall: 1_400,
  peak: 0.5,
  calmRise: 900,
  calmFall: 2_600,
  calmPeak: 0.16,
  /** The Radar's dead flicker: a glow that stutters on and off this fast. */
  flickerMs: 110,
} as const;

/** How long a flare's wash lasts, in ms. */
export function flareDuration(calm: boolean): number {
  return calm ? WASH.calmRise + WASH.calmFall : WASH.rise + WASH.fall;
}

/** The wash's alpha `age` ms after the flare struck: 0 before it and after it has faded. */
export function flareAlpha(age: number, calm: boolean): number {
  const rise = calm ? WASH.calmRise : WASH.rise;
  const fall = calm ? WASH.calmFall : WASH.fall;
  const peak = calm ? WASH.calmPeak : WASH.peak;
  if (age <= 0 || age >= rise + fall) return 0;
  if (age < rise) return (peak * age) / rise;
  const left = 1 - (age - rise) / fall;
  return peak * left * left;
}

/** How bright a flare-struck Radar's glow is at `ms`: stuttering, or steady under reduced motion. */
export function radarFlicker(ms: number, calm: boolean): number {
  if (calm) return 0.55;
  const step = Math.floor(ms / WASH.flickerMs);
  // A fixed on-off pattern with no random number: it must look the same on every seek.
  return (step * 7 + (step >> 2)) % 3 === 0 ? 0.15 : 0.8;
}
