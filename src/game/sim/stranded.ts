// Stranded: the Run's end when no Hop could have any Success Chance, whatever Components the
// Spacecraft could still install or remove, and the warning while a change could still save the Run.
import type { ComponentId } from './catalogue.ts';
import {
  formatDeltaV,
  HELIOPAUSE,
  leastDeltaV,
  planHopAtRealValues,
  type HopTarget,
} from './hop.ts';
import { installRefusal, withInstalled, type Outfit } from './install.ts';
import { removalRefusal, withRemoved } from './remove.ts';
import { currentBody, type Run } from './run.ts';
import { availableDeltaV, carriesJumpDrive, type Spacecraft } from './spacecraft.ts';
import { knownBodies } from './knowledge.ts';
import { deepFreeze } from './starSystem.ts';
import { metersPerSecond } from './units.ts';

/**
 * Whether the Spacecraft can still Hop from the Body it is on. `clear`: some Hop has a Success
 * Chance above 0% as built. `warning`: none has, but a change to the Spacecraft would give one; the
 * text says what to do. `stranded`: no change could, so the Run is over; the reason says why.
 */
export type Stranding =
  | { readonly kind: 'clear' }
  | { readonly kind: 'warning'; readonly warning: string }
  | { readonly kind: 'stranded'; readonly reason: string };

const CLEAR: Stranding = { kind: 'clear' };

const assessed = new WeakMap<Run, Stranding>();

/**
 * Whether the Run, landed on a Body, can still Hop: evaluated whenever the Spacecraft is on a Body
 * (at Run start, after a landing, after an install or a removal). Runs never change, so the verdict
 * is kept per Run: the Landed view can ask on every render. Throws for a Run that is on no Body.
 */
export function assessStranding(run: Run): Stranding {
  const known = assessed.get(run);
  if (known) return known;
  const verdict = assess(run);
  assessed.set(run, verdict);
  return verdict;
}

/**
 * The same Run ended as Stranded when no change could give any Hop a chance; otherwise `run` itself,
 * as it is for a Run that is not landed on a Body. Every operation that leaves the Spacecraft on a
 * Body (`install`, `remove`, an Arrived Hop, and the Jump to a new Starting Moon) returns its Run
 * through this, so the end is part of the Run itself: a Run rebuilt from the same choices ends at
 * the same one, and takes no more.
 */
export function endIfStranded(run: Run): Run {
  if (run.status.kind !== 'landed') return run;
  const verdict = assessStranding(run);
  if (verdict.kind !== 'stranded') return run;
  const end = { kind: 'stranded', reason: verdict.reason, bodyId: run.status.bodyId } as const;
  return deepFreeze({ ...run, status: { kind: 'ended', end } });
}

/** Throws for a Run that has ended: it takes no more choices (a programmer error, or a forged log). */
export function assertNotEnded(run: Run): void {
  if (run.status.kind === 'ended') throw new Error(`Run ${String(run.seed)} has ended`);
}

function assess(run: Run): Stranding {
  // Only targets the player knows of count: a Body Comms has not Detected, or the Heliopause before
  // it is found, could not save a Run the player has no way to know it is in (#96).
  const from = currentBody(run);
  const bodies = knownBodies(run).flatMap((body) =>
    body.landable && body.id !== from.id ? [body.id] : [],
  );
  const targets: readonly HopTarget[] = run.knowledge.heliopauseFound
    ? [...bodies, HELIOPAUSE]
    : bodies;
  if (targets.some((target) => chance(run, target) > 0)) return CLEAR;

  // No Hop as built. A plan's Burns, and so the least Δv that gives it any chance, do not depend on
  // the Spacecraft: work them out once, and weigh every Spacecraft the player could build against them.
  const bodyNeed = Math.min(...bodies.map((id) => need(run, id)));
  const designs = buildable(run);
  const withJumpDrive = designs.find((design) => carriesJumpDrive(design.spacecraft));
  const heliopauseNeed =
    withJumpDrive && run.knowledge.heliopauseFound
      ? need({ ...run, spacecraft: withJumpDrive.spacecraft }, HELIOPAUSE)
      : Infinity;

  let best = 0;
  let bestWithJumpDrive = 0;
  let saved: 'by-removing' | 'by-refitting' | undefined;
  for (const design of designs) {
    const deltaV = availableDeltaV(design.spacecraft);
    const jumps = carriesJumpDrive(design.spacecraft);
    best = Math.max(best, deltaV);
    if (jumps) bestWithJumpDrive = Math.max(bestWithJumpDrive, deltaV);
    const hops = deltaV > bodyNeed || (jumps && deltaV > heliopauseNeed);
    if (!hops) continue;
    if (!design.installs) saved = 'by-removing';
    else saved ??= 'by-refitting';
  }

  switch (saved) {
    case 'by-removing':
      return {
        kind: 'warning',
        warning: 'No Hop is possible as built. Remove Components to lighten the Spacecraft.',
      };
    case 'by-refitting':
      return {
        kind: 'warning',
        warning:
          'No Hop is possible as built. Change its Components: a different build could still make one.',
      };
    case undefined:
      return {
        kind: 'stranded',
        reason: strandedWhy(best, bodyNeed, heliopauseNeed, bestWithJumpDrive),
      };
  }
}

/** The Success Chance of a Hop to `target` as built, or 0 when the target cannot be chosen. */
function chance(run: Run, target: HopTarget): number {
  const result = planHopAtRealValues(run, target);
  return result.kind === 'planned' ? result.plan.successChance : 0;
}

/** The least Δv that gives a Hop to `target` any chance; only for a target `run` can plan. */
function need(run: Run, target: HopTarget): number {
  const result = planHopAtRealValues(run, target);
  if (result.kind !== 'planned') throw new Error(`No plan to ${target}: ${result.reason}`);
  return leastDeltaV(result.plan);
}

/**
 * The Stranded why: the most Δv any build reaches against the cheapest Body Hop's need, and the
 * Heliopause too when it is cheaper and only a Jump Drive's mass keeps it out of reach.
 */
function strandedWhy(
  best: number,
  bodyNeed: number,
  heliopauseNeed: number,
  bestWithJumpDrive: number,
): string {
  const [have, needs] = distinct(best, bodyNeed);
  const why =
    `However you change its Components, your Spacecraft has at most ${have} of Δv, ` +
    `and the cheapest Hop needs ${needs}.`;
  if (heliopauseNeed >= bodyNeed) return why;
  const [carried, heliopause] = distinct(bestWithJumpDrive, heliopauseNeed);
  return (
    `${why} The Heliopause needs only ${heliopause}, but with a Jump Drive aboard your ` +
    `Spacecraft has at most ${carried}.`
  );
}

/** Two Δv figures for the player, in m/s when rounding to 0.1 km/s would make them read the same. */
function distinct(have: number, needs: number): readonly [string, string] {
  const shown = [
    formatDeltaV(metersPerSecond(have)),
    formatDeltaV(metersPerSecond(needs)),
  ] as const;
  if (shown[0] !== shown[1]) return shown;
  return [`${String(Math.floor(have))} m/s`, `${String(Math.ceil(needs))} m/s`];
}

/** A Spacecraft the player could build from the one landed here, and whether it takes an install. */
interface Design {
  readonly spacecraft: Spacecraft;
  readonly installs: boolean;
}

/** The Components worth installing to save a Run. A Drill adds mass and no Δv, so it never helps. */
const RESCUERS: readonly ComponentId[] = [
  'engine-1',
  'engine-2',
  'fuel-tank-1',
  'fuel-tank-2',
  'jump-drive',
];

/**
 * Every Spacecraft the player could build on this Body, one install or removal at a time under the
 * very rules the Spacecraft panel applies (`installRefusal`, `removalRefusal`): the rule for what
 * "could still" means. A removal refunds half the cost and caps the Fuel at the new capacity, an
 * install is paid from the Materials on hand, and no change adds Fuel. So the order matters: the
 * last Engine leaves only after its replacement is installed and paid for, and Fuel spilled by a
 * removed Tank is gone.
 *
 * The lightest configuration (every Component removed but the last Engine and the last Fuel Tank,
 * Fuel capped to that Tank) is one of these, for each Engine and Tank that could be the last. So is
 * the Jump Drive that could still be installed: Materials enough, after the refunds from removing
 * what can be removed, and a free Slot. And so are the builds between, since a lighter Spacecraft
 * is not always the one that goes farther (a second full Tank can give more Δv than its mass costs).
 *
 * A search over Slots, Fuel and Materials: of two ways to the same Slots and Fuel, the one with more
 * Materials left can do all the other can, so only it goes on. Builds that need an install are kept
 * apart from those reached by removals alone, which the warning names.
 */
function buildable(run: Run): Design[] {
  const designs: Design[] = [];
  const richest = new Map<string, number>();
  const start: Outfit = {
    spacecraft: run.spacecraft,
    materials: run.materials,
    starSystemNumber: run.starSystemNumber,
  };
  const pending: { readonly outfit: Outfit; readonly installs: boolean }[] = [
    { outfit: start, installs: false },
  ];
  for (let next = pending.pop(); next; next = pending.pop()) {
    const { outfit, installs } = next;
    const { slots, fuelMass } = outfit.spacecraft;
    const held = slots.map((slot) => slot ?? '').sort((a, b) => a.localeCompare(b));
    const key = `${held.join()}|${String(fuelMass)}|${String(installs)}`;
    if ((richest.get(key) ?? -1) >= outfit.materials) continue;
    richest.set(key, outfit.materials);
    designs.push({ spacecraft: outfit.spacecraft, installs });

    slots.forEach((_, slot) => {
      if (removalRefusal(slots, slot)) return;
      pending.push({ outfit: { ...outfit, ...withRemoved(outfit, slot) }, installs });
    });
    const empty = slots.indexOf(null);
    if (empty < 0) continue;
    for (const id of RESCUERS) {
      if (installRefusal(outfit, empty, id)) continue;
      pending.push({ outfit: { ...outfit, ...withInstalled(outfit, empty, id) }, installs: true });
    }
  }
  return designs;
}
