import { afterEach, expect, it } from 'vitest';
import {
  install,
  kilograms,
  launchHop,
  listBodies,
  startRun,
  type HopFlight,
  type Run,
} from '../game/sim/index.ts';
import { cleanUp, renderUi } from './browserTestKit.tsx';
import { HopReport } from './HopReport.tsx';

afterEach(cleanUp);

/** Flies a Hop to the Body called `name`. */
function hop(run: Run, name: string): { flight: HopFlight; run: Run } {
  const body = listBodies(run.starSystem).find((b) => b.name === name);
  if (!body) throw new Error(`no Body ${name}`);
  const launched = launchHop(run, body.id);
  if (launched.kind !== 'flown') throw new Error('no flight');
  return launched;
}

/** Renders the report and returns how far Continue sits above the panel's bottom edge. */
async function spareBelowContinue(before: Run, flight: HopFlight): Promise<number> {
  const host = await renderUi(
    <HopReport
      before={before}
      flight={flight}
      actions={[{ label: 'Continue', onClick: () => undefined, primary: true }]}
    />,
  );
  const body = host.querySelector<HTMLElement>('.hop-report__body');
  const actions = host.querySelector<HTMLElement>('.hop-report__actions');
  if (!body || !actions) throw new Error('no report');
  expect(body.scrollHeight).toBeLessThanOrEqual(body.clientHeight);
  return body.getBoundingClientRect().bottom - actions.getBoundingClientRect().bottom;
}

// Re-pinned for #189: seed 786's Laelresmaen Minor is the longest-named Icy first target of a hauler
// opening on a Rocky Starting Moon in 2000 seeds, so its Fuel is the Run's first (was seed 786's
// Quaexpruxthaer Nova); seed 98 leaves Fuel behind (was seed 5).
it('the Arrived report fits its panel with the ice line (seed 786, hauler, first Fuel collected)', async () => {
  const before = startRun(786, 'hauler');
  const { flight } = hop(before, 'Laelresmaen Minor');
  expect(flight.collection?.kind).toBe('fuel');
  // Continue sits clear of the panel's bottom border.
  expect(await spareBelowContinue(before, flight)).toBeGreaterThanOrEqual(8);
});

it('the Arrived report fits its panel with a left-behind clause (seed 98, scout, Ceprael then Naeca)', async () => {
  const first = hop(startRun(98, 'scout'), 'Ceprael');
  const second = hop(first.run, 'Naeca');
  expect(second.flight.collection).toMatchObject({ kind: 'fuel' });
  expect(await spareBelowContinue(first.run, second.flight)).toBeGreaterThanOrEqual(8);
});

it('the worst report fits: the ice line and a left-behind clause together (seed 786, hauler)', async () => {
  const before = startRun(786, 'hauler');
  const { flight } = hop(before, 'Laelresmaen Minor');
  if (flight.collection?.kind !== 'fuel') throw new Error('Expected Fuel collected');
  // The Fuel was all collected in the Tank's last tonnes: the rest is left behind.
  const worst = {
    ...flight,
    collection: { ...flight.collection, leftBehind: kilograms(4_321) },
  };
  expect(await spareBelowContinue(before, worst)).toBeGreaterThanOrEqual(0);
});

it('the worst report with a Drill fits with room to spare: ice line, left-behind clause and Drill text (seed 786, hauler)', async () => {
  const fitted = install(startRun(786, 'hauler'), 2, 'drill-1');
  if (fitted.kind !== 'installed') throw new Error('Expected the Drill to install');
  const before = fitted.run;
  const { flight } = hop(before, 'Laelresmaen Minor');
  if (flight.collection?.kind !== 'fuel') throw new Error('Expected Fuel collected');
  const worst = {
    ...flight,
    collection: { ...flight.collection, leftBehind: kilograms(4_321) },
  };
  expect(await spareBelowContinue(before, worst)).toBeGreaterThanOrEqual(8);
});
