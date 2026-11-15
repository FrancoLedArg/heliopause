/** One layer of a synthesised effect: a tone sweeping `from` to `to` Hz, or filtered noise. Times are in seconds. */
export interface Layer {
  readonly kind: 'tone' | 'noise';
  readonly wave?: OscillatorType;
  /** Tone pitch, or the noise filter's cutoff, at the start and end. */
  readonly from: number;
  readonly to: number;
  readonly start: number;
  readonly dur: number;
  readonly gain: number;
  /** Seconds to reach full gain; the rest of the layer fades out. */
  readonly attack?: number;
  /** Noise only: the filter that shapes it. */
  readonly filter?: BiquadFilterType;
}

/**
 * The sound effects, synthesised in code (Web Audio): no files, so nothing to license. The keys are the
 * ones the sound-effects spec names; a key with no recipe plays silence.
 */
export const RECIPES: Readonly<Record<string, readonly Layer[]>> = {
  // Ignition crack, then a deep rumble that rises and fades as the Spacecraft climbs.
  sfx_takeoff: [
    { kind: 'noise', filter: 'lowpass', from: 900, to: 200, start: 0, dur: 0.25, gain: 0.5 },
    {
      kind: 'noise',
      filter: 'lowpass',
      from: 140,
      to: 420,
      start: 0.1,
      dur: 2.2,
      gain: 0.7,
      attack: 0.5,
    },
    {
      kind: 'tone',
      wave: 'sawtooth',
      from: 45,
      to: 90,
      start: 0.1,
      dur: 2.2,
      gain: 0.35,
      attack: 0.5,
    },
  ],
  // The thrust roar of the final descent.
  sfx_landing: [
    {
      kind: 'noise',
      filter: 'lowpass',
      from: 500,
      to: 160,
      start: 0,
      dur: 1.6,
      gain: 0.55,
      attack: 0.3,
    },
    {
      kind: 'tone',
      wave: 'sawtooth',
      from: 80,
      to: 50,
      start: 0,
      dur: 1.6,
      gain: 0.25,
      attack: 0.3,
    },
  ],
  // A soft thud.
  sfx_touchdown: [
    { kind: 'tone', wave: 'sine', from: 110, to: 40, start: 0, dur: 0.35, gain: 0.8 },
    { kind: 'noise', filter: 'lowpass', from: 400, to: 100, start: 0, dur: 0.2, gain: 0.5 },
  ],
  // Rising sparkle as the resource flows into the Spacecraft.
  sfx_gather: [
    { kind: 'tone', wave: 'triangle', from: 520, to: 1040, start: 0, dur: 0.18, gain: 0.35 },
    { kind: 'tone', wave: 'triangle', from: 780, to: 1560, start: 0.09, dur: 0.22, gain: 0.3 },
    { kind: 'tone', wave: 'sine', from: 1170, to: 2340, start: 0.18, dur: 0.3, gain: 0.25 },
  ],
  // A clunk and a click.
  sfx_install: [
    { kind: 'tone', wave: 'square', from: 180, to: 90, start: 0, dur: 0.12, gain: 0.35 },
    { kind: 'noise', filter: 'highpass', from: 3000, to: 3000, start: 0.07, dur: 0.05, gain: 0.4 },
  ],
  sfx_remove: [
    { kind: 'noise', filter: 'highpass', from: 3000, to: 3000, start: 0, dur: 0.05, gain: 0.4 },
    { kind: 'tone', wave: 'square', from: 120, to: 60, start: 0.06, dur: 0.14, gain: 0.35 },
  ],
  // The Jump: a charging whine that climbs, then a whoosh and a boom.
  sfx_jump: [
    {
      kind: 'tone',
      wave: 'sawtooth',
      from: 80,
      to: 1400,
      start: 0,
      dur: 1.1,
      gain: 0.25,
      attack: 1,
    },
    {
      kind: 'noise',
      filter: 'bandpass',
      from: 300,
      to: 4000,
      start: 0.8,
      dur: 1.2,
      gain: 0.6,
      attack: 0.3,
    },
    { kind: 'tone', wave: 'sine', from: 90, to: 28, start: 1.1, dur: 1.4, gain: 0.9 },
  ],
  // Cruise events (#264): the leak's hiss, a Repair's start and finish, and a Rush.
  sfx_leak: [
    {
      kind: 'noise',
      filter: 'highpass',
      from: 6000,
      to: 2500,
      start: 0,
      dur: 1.4,
      gain: 0.4,
      attack: 0.08,
    },
    { kind: 'tone', wave: 'square', from: 220, to: 160, start: 0, dur: 0.18, gain: 0.2 },
  ],
  sfx_repair_start: [
    { kind: 'tone', wave: 'square', from: 300, to: 360, start: 0, dur: 0.08, gain: 0.25 },
    { kind: 'tone', wave: 'square', from: 300, to: 360, start: 0.12, dur: 0.08, gain: 0.25 },
    { kind: 'noise', filter: 'bandpass', from: 2000, to: 3500, start: 0.2, dur: 0.3, gain: 0.25 },
  ],
  sfx_repair_done: [
    { kind: 'tone', wave: 'triangle', from: 660, to: 660, start: 0, dur: 0.16, gain: 0.35 },
    { kind: 'tone', wave: 'triangle', from: 990, to: 990, start: 0.14, dur: 0.3, gain: 0.35 },
  ],
  // A whoosh as the Engine catches, a crackle under it (#251).
  sfx_fire: [
    {
      kind: 'noise',
      filter: 'bandpass',
      from: 600,
      to: 2400,
      start: 0,
      dur: 0.5,
      gain: 0.5,
      attack: 0.05,
    },
    { kind: 'noise', filter: 'highpass', from: 3000, to: 5000, start: 0.1, dur: 1.2, gain: 0.25 },
    { kind: 'tone', wave: 'sawtooth', from: 140, to: 90, start: 0, dur: 0.3, gain: 0.2 },
  ],
  // The Engine fire reaching the Fuel: a deep boom and a long rumble of debris (#251).
  sfx_explosion: [
    { kind: 'tone', wave: 'sine', from: 90, to: 30, start: 0, dur: 1.2, gain: 0.9 },
    { kind: 'noise', filter: 'lowpass', from: 2000, to: 150, start: 0, dur: 1.6, gain: 0.8 },
    { kind: 'noise', filter: 'bandpass', from: 900, to: 300, start: 0.15, dur: 1.4, gain: 0.3 },
  ],
  sfx_rush: [
    { kind: 'tone', wave: 'sawtooth', from: 300, to: 1500, start: 0, dur: 0.3, gain: 0.25 },
    { kind: 'tone', wave: 'triangle', from: 990, to: 1320, start: 0.28, dur: 0.3, gain: 0.35 },
  ],
};

export function hasRecipe(key: string): boolean {
  return Object.hasOwn(RECIPES, key);
}
