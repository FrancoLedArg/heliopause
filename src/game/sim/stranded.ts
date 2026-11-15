// Stranded: the Run's end when no Hop could have any Success Chance, even after removing every
// removable Component, and the warning while a change to the Spacecraft could still save the Run.
import { COMPONENTS, componentCost, type ComponentId } from './catalogue.ts';
import { formatDeltaV, HELIOPAUSE, leastDeltaV, planHop, type HopTarget } from './hop.ts';
import { removalRefund } from './remove.ts';
import { currentBody, starSystemNumber, type Run } from './run.ts';
import {
  availableDeltaV,
  carriesJumpDrive,
  refit,
  SLOT_COUNT,
  type Slot,
  type Spacecraft,
} from './spacecraft.ts';
import { deepFreeze, listBodies } from './starSystem.ts';
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

/** The same Run ended as Stranded when no change could give any Hop a chance; otherwise `run` itself. */
export function endIfStranded(run: Run): Run {
  const verdict = assessStranding(run);
  if (verdict.kind !== 'stranded') return run;
  return deepFreeze({
    ...run,
    status: { kind: 'ended', end: { kind: 'stranded', reason: verdict.reason } },
  });
}

function assess(run: Run): Stranding {
  const from = currentBody(run);
  const bodies = listBodies(run.starSystem).flatMap((body) =>
    body.landable && body.id !== from.id ? [body.id] : [],
  );
  const targets: readonly HopTarget[] = [...bodies, HELIOPAUSE];
  if (targets.some((target) => chance(run, target) > 0)) return CLEAR;

  // No Hop as built. A plan's Burns, and so the least Δv that gives it any chance, do not depend on
  // the Spacecraft: work them out once, and weigh every Spacecraft the player could build against them.
  const bodyNeed = Math.min(...bodies.map((id) => need(run, id)));
  const designs = buildable(run);
  const withJumpDrive = designs.find((design) => carriesJumpDrive(design.spacecraft));
  const heliopauseNeed = withJumpDrive
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
  const result = planHop(run, target);
  return result.kind === 'planned' ? result.plan.successChance : 0;
}

/** The least Δv that gives a Hop to `target` any chance; only for a target `run` can plan. */
function need(run: Run, target: HopTarget): number {
  const result = planHop(run, target);
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

/**
 * Every Spacecraft the player could build on this Body: the rule for what "could still" means.
 * Keep any of the installed Components, and install others in the Slots left free, paid with the
 * Materials on hand plus the refunds from those removed (half their cost, rounded down, as `remove`
 * gives). A build keeps at least one Engine and one Fuel Tank, as `remove` insists, and at most one
 * Jump Drive, as `install` does. Its Fuel is what is aboard, capped at its capacity: no change adds
 * Fuel.
 *
 * The lightest configuration (every Component removed but the last Engine and the last Fuel Tank,
 * Fuel capped to that Tank) is one of these, for each Engine and Tank that could be the last. So is
 * a Jump Drive that could still be installed: its cost covered by the Materials after the refunds
 * from removing everything removable, in a free Slot. And so are builds between: a lighter
 * Spacecraft is not always the one that goes farther (a second full Tank can give more Δv than its
 * mass costs), so every one is weighed.
 *
 * Generous on purpose: it ignores the order the changes would take (swapping the only Engine needs
 * a free Slot for a moment), so it may call a lost Run saveable, and the warning shows, but it
 * never ends a Run that could be saved. Only Engines, Fuel Tanks and the Jump Drive are installed:
 * a Drill adds mass and no Δv.
 */
function buildable(run: Run): Design[] {
  const level = starSystemNumber(run);
  const installed = run.spacecraft.slots.filter((slot): slot is ComponentId => slot !== null);
  const designs: Design[] = [];
  for (let keep = 0; keep < 2 ** installed.length; keep++) {
    const kept = installed.filter((_, i) => (keep & (1 << i)) !== 0);
    const refunds = installed.reduce(
      (sum, id, i) => ((keep & (1 << i)) !== 0 ? sum : sum + removalRefund(id, level)),
      0,
    );
    const budget = run.materials + refunds;
    const keepsJumpDrive = kept.some((id) => COMPONENTS[id].kind === 'jump-drive');
    for (const added of additions(SLOT_COUNT - kept.length, keepsJumpDrive)) {
      const slots = [...kept, ...added];
      const cost = added.reduce((sum, id) => sum + componentCost(id, level), 0);
      if (cost > budget || !flies(slots)) continue;
      const padded: Slot[] = [...slots, ...Array<Slot>(SLOT_COUNT - slots.length).fill(null)];
      designs.push({ spacecraft: refit(run.spacecraft, padded), installs: added.length > 0 });
    }
  }
  return designs;
}

/**
 * The sets of Components worth installing in `free` Slots: at most one Engine (the best one sets
 * the Isp, a second adds only mass), any Fuel Tanks, and a Jump Drive unless one is kept.
 */
function additions(free: number, keepsJumpDrive: boolean): ComponentId[][] {
  const sets: ComponentId[][] = [];
  const engines: ComponentId[][] = [[], ['engine-1'], ['engine-2']];
  const jumpDrives: ComponentId[][] = keepsJumpDrive ? [[]] : [[], ['jump-drive']];
  for (const engine of engines) {
    for (const jumpDrive of jumpDrives) {
      const room = free - engine.length - jumpDrive.length;
      for (let small = 0; small <= room; small++) {
        for (let large = 0; small + large <= room; large++) {
          sets.push([
            ...engine,
            ...jumpDrive,
            ...Array<ComponentId>(small).fill('fuel-tank-1'),
            ...Array<ComponentId>(large).fill('fuel-tank-2'),
          ]);
        }
      }
    }
  }
  return sets;
}

/** Whether a set of Components can fly: an Engine, a Fuel Tank, and no more than one Jump Drive. */
function flies(slots: readonly ComponentId[]): boolean {
  const count = (kind: string) => slots.filter((id) => COMPONENTS[id].kind === kind).length;
  return count('engine') > 0 && count('fuel-tank') > 0 && count('jump-drive') <= 1;
}
