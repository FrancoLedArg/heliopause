// The Δv bar as numbers to draw: Burns as segments against the available Δv, with the Margin as the
// gap. Shared by the Hop plan, the Flight log and the Hop report, so every screen draws a Hop alike.
import { metersPerSecond, type Burn, type MetersPerSecond } from '../game/sim/index.ts';
import { formatDeltaVKmS, kmPerSecondFigure } from './format.ts';

/** One Burn of a Hop as the bar takes it: its estimate and, once flown, what it actually cost. */
export interface DeltaVBarBurn {
  readonly burn: Burn;
  readonly estimate: MetersPerSecond;
  readonly actual?: MetersPerSecond | undefined;
}

/** A span of the bar, as fractions of its length: 0 is the left end, 1 the right. */
export interface BarSpan {
  readonly start: number;
  readonly width: number;
}

export interface DeltaVBarSegment extends BarSpan {
  readonly burn: Burn;
  readonly label: string;
  /** What the Burn costs: its actual cost once known, else its estimate. */
  readonly deltaV: MetersPerSecond;
  /** Where the Burn's estimate ends, as a fraction of the bar, once its actual cost is known. */
  readonly estimateTick: number | undefined;
}

export interface DeltaVBarView {
  readonly segments: readonly DeltaVBarSegment[];
  readonly needed: MetersPerSecond;
  readonly available: MetersPerSecond;
  /** The available Δv less what the Burns need; below zero when they need more than there is. */
  readonly margin: MetersPerSecond;
  readonly short: boolean;
  /** Where the available Δv ends: the right end, unless the Burns need more. */
  readonly availableAt: number;
  /** The Margin: spare from the Burns' end to the available Δv, or short from there to the Burns' end. */
  readonly gap: BarSpan;
  /** Every value the bar shows, in words. */
  readonly label: string;
}

export const BURN_LABEL: Record<Burn, string> = {
  takeoff: 'Takeoff',
  transfer: 'Transfer',
  landing: 'Landing',
};

/** The bar for these Burns, in the order flown, against the available Δv. */
export function deltaVBar(
  burns: readonly DeltaVBarBurn[],
  available: MetersPerSecond,
): DeltaVBarView {
  const needed = burns.reduce((total, b) => total + (b.actual ?? b.estimate), 0);
  const scale = Math.max(needed, available);
  const at = (deltaV: number): number => (scale > 0 ? deltaV / scale : 0);
  let spent = 0;
  let estimated = 0;
  const segments = burns.map((b): DeltaVBarSegment => {
    const deltaV = b.actual ?? b.estimate;
    const segment = {
      burn: b.burn,
      label: BURN_LABEL[b.burn],
      deltaV,
      start: at(spent),
      width: at(deltaV),
      estimateTick: b.actual === undefined ? undefined : at(estimated + b.estimate),
    };
    spent += deltaV;
    estimated += b.estimate;
    return segment;
  });
  const margin = metersPerSecond(available - needed);
  const short = margin < 0;
  const availableAt = at(available);
  const end = at(needed);
  const parts = segments.map((s) => `${s.label} ${formatDeltaVKmS(s.deltaV)}`).join(', ');
  const total = `Needs ${kmPerSecondFigure(metersPerSecond(needed))} of ${formatDeltaVKmS(available)}`;
  const gapWords = short
    ? `short by ${formatDeltaVKmS(metersPerSecond(needed - available))}`
    : `Margin +${formatDeltaVKmS(margin)}`;
  return {
    segments,
    needed: metersPerSecond(needed),
    available,
    margin,
    short,
    availableAt,
    gap: short
      ? { start: availableAt, width: end - availableAt }
      : { start: end, width: availableAt - end },
    label: `Δv: ${parts}. ${total}, ${gapWords}.`,
  };
}
