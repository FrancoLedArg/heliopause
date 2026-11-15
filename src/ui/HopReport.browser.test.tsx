import { afterEach, expect, it } from 'vitest';
import { userEvent } from 'vitest/browser';
import {
  HELIOPAUSE,
  install,
  kilograms,
  launchHop,
  listBodies,
  materials,
  startRun,
  type ChassisId,
  type HopFlight,
  type Run,
} from '../game/sim/index.ts';
import { byTestId, cleanUp, renderUi } from './browserTestKit.tsx';
import { HopReport } from './HopReport.tsx';
import { expectTextBudget, visibleSentences } from './textBudget.ts';

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

// Show, don't tell (#223): the report's visible prose is its one why line, whatever the outcome.
/** The Heliopause Hop of a lancer with a Jump Drive and `share` of its Fuel. */
function heliopauseHop(share: number): [Run, HopFlight] {
  for (let seed = 1; seed < 200; seed++) {
    const start = startRun(seed, 'lancer');
    const built = install({ ...start, materials: materials(100) }, 2, 'jump-drive');
    if (built.kind !== 'installed') throw new Error('Expected an install');
    const { spacecraft } = built.run;
    const run = {
      ...built.run,
      spacecraft: { ...spacecraft, fuelMass: kilograms(spacecraft.fuelMass * share) },
    };
    const launched = launchHop(run, HELIOPAUSE);
    if (launched.kind === 'flown') return [run, launched.flight];
  }
  throw new Error('No seed has a Heliopause Hop');
}

/** A half-fuelled Run's first Hop that ends `kind`. */
function halfFuelledHop(kind: 'fell-short' | 'crashed', chassis: ChassisId): [Run, HopFlight] {
  const start = startRun(123, chassis);
  const run = {
    ...start,
    spacecraft: { ...start.spacecraft, fuelMass: kilograms(start.spacecraft.fuelMass / 2) },
  };
  for (const body of listBodies(run.starSystem)) {
    const launched = launchHop(run, body.id);
    if (launched.kind === 'flown' && launched.flight.outcome.kind === kind) {
      return [run, launched.flight];
    }
  }
  throw new Error(`No ${kind} Hop`);
}

const reports: [string, () => [Run, HopFlight]][] = [
  [
    'Arrived (first Fuel, so the fact exists)',
    () => {
      const before = startRun(496, 'hauler');
      return [before, hop(before, 'Quaexpruxthaer Nova').flight];
    },
  ],
  ['Fell Short', () => halfFuelledHop('fell-short', 'hauler')],
  ['Crashed', () => halfFuelledHop('crashed', 'scout')],
  ['the Heliopause', () => heliopauseHop(1)],
];

it.each(reports)('%s: one visible sentence, which is the why line', async (_name, make) => {
  const [before, flight] = make();
  const host = await renderUi(
    <HopReport
      before={before}
      flight={flight}
      actions={[{ label: 'Continue', onClick: () => undefined, primary: true }]}
    />,
  );
  expectTextBudget(host);
  const why = host.querySelector('.hop-report__why')?.textContent;
  expect(why).toBeTruthy();
  expect(visibleSentences(host)).toEqual([why]);
  // The Δv bar is there, with the estimate against the actual in its name.
  expect(byTestId(host, 'dv-bar').getAttribute('aria-label')).toMatch(/^Δv: /);
});

it('"Tell me more" opens the Burn table, the Margin and the fact by keyboard, and they still fit', async () => {
  const before = startRun(496, 'hauler');
  const { flight } = hop(before, 'Quaexpruxthaer Nova');
  const host = await renderUi(
    <HopReport
      before={before}
      flight={flight}
      actions={[{ label: 'Continue', onClick: () => undefined, primary: true }]}
    />,
  );
  const toggle = [...host.querySelectorAll('button')].find((b) => b.textContent === 'Tell me more');
  if (!toggle) throw new Error('no Tell me more');
  expect(toggle.getAttribute('aria-expanded')).toBe('false');
  expect(host.querySelector('.hop-report__table')?.checkVisibility()).toBe(false);
  // Focus starts on Continue; Tab wraps to the toggle.
  await userEvent.keyboard('{Tab}');
  expect(document.activeElement).toBe(toggle);
  await userEvent.keyboard('{Enter}');
  expect(toggle.getAttribute('aria-expanded')).toBe('true');
  expect(host.querySelector('.hop-report__table')?.checkVisibility()).toBe(true);
  expect(byTestId(host, 'hop-report-margin').checkVisibility()).toBe(true);
  expect(byTestId(host, 'hop-report-fact').textContent).toMatch(/water ice/);
  // Continue stays inside the panel with the details open.
  const panel = byTestId(host, 'hop-report').getBoundingClientRect();
  const actions = host.querySelector<HTMLElement>('.hop-report__actions');
  expect(actions?.getBoundingClientRect().bottom).toBeLessThanOrEqual(panel.bottom);
});
