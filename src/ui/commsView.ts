// The words for a Comms reveal (#96): the Comms ping on the Landed view is the visual, and these
// words go only to a polite live region, for screen readers.
import {
  astronomicalUnits,
  currentBody,
  distanceBetween,
  findBody,
  SOURCED_CONSTANTS,
  type Reveal,
  type Run,
} from '../game/sim/index.ts';
import { formatDistanceAu } from './format.ts';

/** What a landing taught the player, in one or two short sentences. */
export function commsAnnouncement(run: Run, reveal: Reveal): string {
  const here = currentBody(run);
  const surveyed = reveal.surveyed && findBody(run.starSystem, reveal.surveyed);
  const found = reveal.detected.flatMap((id) => {
    const body = findBody(run.starSystem, id);
    if (!body) return [];
    const away = formatAway(distanceBetween(run.starSystem, here, body));
    return [`Comms Detected a new Body, ${away} away.`];
  });
  return [surveyed ? `${surveyed.name} Surveyed.` : '', ...found].filter(Boolean).join(' ');
}

/** A distance between Bodies: in AU, or in kilometres when it is too short to read in AU (a Moon). */
function formatAway(au: number): string {
  if (au >= 0.01) return formatDistanceAu(astronomicalUnits(au));
  const km = au * SOURCED_CONSTANTS.kilometersPerAu.value;
  return `${KM.format(Math.round(km / 1_000) * 1_000)} km`;
}

const KM = new Intl.NumberFormat('en-US');
