import { afterEach, expect, it } from 'vitest';
import {
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

it('the Arrived report fits its panel with the ice line (seed 550, hauler, first Fuel collected)', async () => {
  const before = startRun(550, 'hauler');
  const { flight } = hop(before, 'Dryrsioquyl Minor');
  expect(flight.collection?.kind).toBe('fuel');
  // Continue sits clear of the panel's bottom border.
  expect(await spareBelowContinue(before, flight)).toBeGreaterThanOrEqual(8);
});

it('the Arrived report fits its panel with a left-behind clause (seed 14, scout, Lydruthyx then Konvin)', async () => {
  const first = hop(startRun(14, 'scout'), 'Lydruthyx');
  const second = hop(first.run, 'Konvin');
  expect(second.flight.collection).toMatchObject({ kind: 'fuel' });
  expect(await spareBelowContinue(first.run, second.flight)).toBeGreaterThanOrEqual(8);
});

it('the worst report fits: the ice line and a left-behind clause together (seed 550, hauler)', async () => {
  const before = startRun(550, 'hauler');
  const { flight } = hop(before, 'Dryrsioquyl Minor');
  if (flight.collection?.kind !== 'fuel') throw new Error('Expected Fuel collected');
  // The Fuel was all collected in the Tank's last tonnes: the rest is left behind.
  const worst = {
    ...flight,
    collection: { ...flight.collection, leftBehind: kilograms(4_321) },
  };
  expect(await spareBelowContinue(before, worst)).toBeGreaterThanOrEqual(0);
});
