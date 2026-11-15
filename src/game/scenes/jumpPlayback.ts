// The Jump moment's clock: what is on screen at each moment after the Spacecraft reaches the
// Heliopause. Pure, so the Flight scene (which draws it) and the tests agree on it.
import type { Pace } from './flightPlayback.ts';

/**
 * The stages of the Jump moment: the Jump Drive charges, it fires and carries the Spacecraft away,
 * then the screen goes dark behind the flavour text until the Landed view of the next Starting Moon.
 */
export type JumpStage = 'charge' | 'fire' | 'dark';

/** How long each stage lasts, in ms (presentation tuning). Reduced motion keeps only the fade. */
const STAGE_MS: Readonly<Record<Pace, Readonly<Record<JumpStage, number>>>> = {
  full: { charge: 1100, fire: 700, dark: 2800 },
  reduced: { charge: 0, fire: 0, dark: 2600 },
};

/** How long the screen takes to go dark at the start of the `dark` stage (ms). */
const FADE_MS: Readonly<Record<Pace, number>> = { full: 500, reduced: 700 };

const STAGES: readonly JumpStage[] = ['charge', 'fire', 'dark'];

/** One moment of the Jump. */
export interface JumpMoment {
  readonly stage: JumpStage;
  /** How far through the stage, 0 to 1. */
  readonly progress: number;
  /** How dark the screen is, 0 (clear) to 1 (black). */
  readonly darkness: number;
  /** The moment is over: hand off to the Landed view of the next Starting Moon. */
  readonly ended: boolean;
}

export interface JumpPlayback {
  /** ms from the end of the Hop to the hand-off. */
  readonly duration: number;
  /** What is on screen `ms` after the Hop ended; clamped to the playback. */
  readonly at: (ms: number) => JumpMoment;
}

/** Paces the Jump moment. */
export function jumpPlayback(pace: Pace): JumpPlayback {
  const lengths = STAGE_MS[pace];
  const duration = STAGES.reduce((sum, stage) => sum + lengths[stage], 0);
  const at = (ms: number): JumpMoment => {
    const t = Math.min(Math.max(ms, 0), duration);
    let start = 0;
    for (const stage of STAGES) {
      const length = lengths[stage];
      if (length === 0) continue;
      if (t < start + length || stage === 'dark') {
        const into = t - start;
        return {
          stage,
          progress: Math.min(into / length, 1),
          darkness: stage === 'dark' ? Math.min(into / FADE_MS[pace], 1) : 0,
          ended: t >= duration,
        };
      }
      start += length;
    }
    throw new Error('The Jump always ends dark');
  };
  return { duration, at };
}
