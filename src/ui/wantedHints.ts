import type { HintId } from '../game/lib/firstRunHints.ts';
import { COMPONENTS, type Run } from '../game/sim/index.ts';
import { panelRows } from './spacecraftPanelView.ts';

/** What the Landed view is showing, as far as the First-Run hints care. */
export interface HintMoment {
  /** The Landed view is up on a live Run: no menu, picker, Stranded end, gathering or Hop in flight. */
  readonly quiet: boolean;
  readonly run: Run | undefined;
  readonly chartOpen: boolean;
  /** A target is chosen on the Nav Chart. */
  readonly targetChosen: boolean;
  readonly spacecraftOpen: boolean;
  /** The Hop report of an Arrived Hop is showing. */
  readonly reportOpen: boolean;
  /** A gathering moment has ended and its hint is still pending. */
  readonly gatheredPending: boolean;
}

/** The First-Run hints whose moment is now, most important first. */
export function wantedHints(moment: HintMoment): HintId[] {
  const { run } = moment;
  if (!moment.quiet || run === undefined) return [];
  const wanted: HintId[] = [];
  if (!moment.chartOpen && !moment.spacecraftOpen) {
    if (!moment.reportOpen) wanted.push('first-landing');
    if (moment.gatheredPending) wanted.push('first-gathering');
    if (!moment.reportOpen && run.knowledge.heliopauseFound) wanted.push('heliopause-found');
    if (!moment.reportOpen && panelRows(run).some((r) => r.affordable && !r.unavailable)) {
      wanted.push('first-build');
    }
    if (!moment.reportOpen && scienceMoment(run)) wanted.push('first-science');
  }
  // On the open chart the Heliopause hint points at its mark; a chosen target's plan hint comes first.
  if (moment.chartOpen && !moment.targetChosen && !moment.spacecraftOpen && !moment.reportOpen) {
    if (run.knowledge.heliopauseFound) wanted.push('heliopause-found');
  }
  if (moment.chartOpen && moment.targetChosen) wanted.push('first-hop-plan');
  return wanted;
}

/** An Instrument is affordable or installed, or the Run has earned Science: the Science chip matters now. */
function scienceMoment(run: Run): boolean {
  if (run.science > 0) return true;
  if (run.spacecraft.slots.some((id) => id !== null && COMPONENTS[id].kind === 'instrument')) {
    return true;
  }
  return panelRows(run).some(
    (r) => COMPONENTS[r.id].kind === 'instrument' && r.affordable && !r.unavailable,
  );
}
