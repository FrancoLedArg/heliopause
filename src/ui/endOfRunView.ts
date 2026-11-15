// The End-of-Run screen as words: how the Run ended, its Score and the Best Score. Every figure
// comes from the simulation; this only phrases it.
import type { RunEnd, Score } from '../game/sim/index.ts';

export interface EndOfRunView {
  readonly title: 'Fell Short' | 'Crashed' | 'Stranded';
  /** One line saying what happened, before the why. */
  readonly summary: string;
  /** The simulation's plain-language why, as written. */
  readonly reason: string;
  readonly score: string;
  /** The Best Score, which includes this Run's when it is the best. */
  readonly best: string;
  /** This Run set the Best Score: said in words, not only by colour. */
  readonly newBest: boolean;
}

/** "2 Star Systems escaped, 5 Hops flown". */
export function formatScore(score: Score): string {
  const systems = score.starSystemsEscaped === 1 ? 'Star System' : 'Star Systems';
  const hops = score.hopsFlown === 1 ? 'Hop' : 'Hops';
  return `${String(score.starSystemsEscaped)} ${systems} escaped, ${String(score.hopsFlown)} ${hops} flown`;
}

const ENDS: Record<RunEnd['kind'], Pick<EndOfRunView, 'title' | 'summary'>> = {
  'fell-short': { title: 'Fell Short', summary: 'The Fuel ran out in flight.' },
  crashed: { title: 'Crashed', summary: 'The Spacecraft was lost on Landing.' },
  stranded: { title: 'Stranded', summary: 'No Hop was left to fly.' },
};

/** What the End-of-Run screen shows for a Run that ended as `end` with `score`. */
export function describeEndOfRun(
  end: RunEnd,
  score: Score,
  best: Score,
  newBest: boolean,
): EndOfRunView {
  return {
    ...ENDS[end.kind],
    reason: end.reason,
    score: formatScore(score),
    best: formatScore(best),
    newBest,
  };
}
