// The End-of-Run screen as words: how the Run ended, its Score and the Best Score. Every figure
// comes from the simulation; this only phrases it.
import type { RunEnd, Score } from '../game/sim/index.ts';

export interface EndOfRunView {
  readonly title: 'Fell Short' | 'Crashed' | 'Stranded' | 'Destroyed';
  /** One line saying what happened, before the why. */
  readonly summary: string;
  /** The simulation's plain-language why, as written. */
  readonly reason: string;
  readonly score: string;
  /** The Best Score, which includes this Run's when it is the best. */
  readonly best: string;
  /** The Score's figures with their accessible names, for the icons ("2 Star Systems escaped"). */
  readonly scoreFigures: ScoreFigures;
  /** The Best Score's figures. */
  readonly bestFigures: ScoreFigures;
  /** What the best row is called: the Best Score, or Today's Daily Best for a Daily Run. */
  readonly bestLabel: 'Best Score' | 'Today’s Daily Best';
  /** The words that mark the best as set by this Run. */
  readonly newBestMarker: 'new Best Score' | 'new Daily Best';
  /** This Run set the Best Score: said in words, not only by colour. */
  readonly newBest: boolean;
  /** How Scores are compared, said once on the screen. */
  readonly rule: string;
}

/** One Score as two figures, each with the words that are its accessible name. */
export interface ScoreFigures {
  readonly starSystems: { readonly count: number; readonly name: string };
  readonly hops: { readonly count: number; readonly name: string };
}

/** "2 Star Systems escaped" and "5 Hops flown", as the icons' numbers and names. */
export function scoreFigures(score: Score): ScoreFigures {
  const systems = score.starSystemsEscaped === 1 ? 'Star System' : 'Star Systems';
  const hops = score.hopsFlown === 1 ? 'Hop' : 'Hops';
  return {
    starSystems: {
      count: score.starSystemsEscaped,
      name: `${String(score.starSystemsEscaped)} ${systems} escaped`,
    },
    hops: { count: score.hopsFlown, name: `${String(score.hopsFlown)} ${hops} flown` },
  };
}

/** "2 Star Systems escaped, 5 Hops flown". */
export function formatScore(score: Score): string {
  const { starSystems, hops } = scoreFigures(score);
  return `${starSystems.name}, ${hops.name}`;
}

/** The Score rule in one line. */
export const SCORE_RULE = 'More Star Systems escaped wins; fewer Hops breaks a tie.';

const ENDS: Record<RunEnd['kind'], Pick<EndOfRunView, 'title' | 'summary'>> = {
  'fell-short': { title: 'Fell Short', summary: 'The Fuel ran out in flight.' },
  crashed: { title: 'Crashed', summary: 'The Spacecraft was lost on Landing.' },
  stranded: { title: 'Stranded', summary: 'No Hop was left to fly.' },
  destroyed: { title: 'Destroyed', summary: 'The Spacecraft was lost in the Cruise.' },
};

/**
 * What the End-of-Run screen shows for a Run that ended as `end` with `score`. For a Daily Run,
 * `best` is today's Daily Best and the row is named for it.
 */
export function describeEndOfRun(
  end: RunEnd,
  score: Score,
  best: Score,
  newBest: boolean,
  daily = false,
): EndOfRunView {
  return {
    ...ENDS[end.kind],
    reason: end.reason,
    score: formatScore(score),
    best: formatScore(best),
    scoreFigures: scoreFigures(score),
    bestFigures: scoreFigures(best),
    bestLabel: daily ? 'Today’s Daily Best' : 'Best Score',
    newBestMarker: daily ? 'new Daily Best' : 'new Best Score',
    newBest,
    rule: SCORE_RULE,
  };
}
