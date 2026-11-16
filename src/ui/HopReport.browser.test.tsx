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
import { heliopauseFound } from '../game/sim/testing.ts';

/**
 * The same Run as if a Radar had found the Heliopause (#191): only then is it a Hop target, and
 * only within the Hop range (#283).
 */
const found = heliopauseFound;

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

// Re-pinned for #189: seed 786's Laelresmaen Minor was the longest-named Icy first target of a hauler
// opening on a Rocky Starting Moon in 2000 seeds, so its Fuel is the Run's first (was seed 786's
// Quaexpruxthaer Nova); seed 98 leaves Fuel behind (was seed 5). Re-pinned for #247: the Isp rise
// moves seed 786 to another Star System; seed 892's Praerionrio Prime is now that longest name.
it('the Arrived report fits its panel with the ice line (seed 892, hauler, first Fuel collected)', async () => {
  const before = startRun(892, 'hauler');
  const { flight } = hop(before, 'Praerionrio Prime');
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

it('the worst report fits: the ice line and a left-behind clause together (seed 892, hauler)', async () => {
  const before = startRun(892, 'hauler');
  const { flight } = hop(before, 'Praerionrio Prime');
  if (flight.collection?.kind !== 'fuel') throw new Error('Expected Fuel collected');
  // The Fuel was all collected in the Tank's last tonnes: the rest is left behind.
  const worst = {
    ...flight,
    collection: { ...flight.collection, leftBehind: kilograms(4_321) },
  };
  expect(await spareBelowContinue(before, worst)).toBeGreaterThanOrEqual(0);
});

it('the worst report with a Drill fits with room to spare: ice line, left-behind clause and Drill text (seed 892, hauler)', async () => {
  const fitted = install(startRun(892, 'hauler'), 2, 'drill-1');
  if (fitted.kind !== 'installed') throw new Error('Expected the Drill to install');
  const before = fitted.run;
  const { flight } = hop(before, 'Praerionrio Prime');
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
    const built = install(found({ ...start, materials: materials(100) }), 2, 'jump-drive');
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

/**
 * A Hop that ends `kind`, from seed 123's innermost planet with every Body known and `share` of the
 * Fuel: a Run's first Hop never fails since #189, so these start where Runs opened before it.
 */
function halfFuelledHop(
  kind: 'fell-short' | 'crashed',
  chassis: ChassisId,
  share = 0.5,
): [Run, HopFlight] {
  const start = startRun(123, chassis);
  const ids = listBodies(start.starSystem).map((body) => body.id);
  const inner = start.starSystem.planets[0];
  if (!inner) throw new Error('A Star System has planets');
  const run: Run = {
    ...start,
    status: { kind: 'landed', bodyId: inner.id },
    knowledge: { detected: ids, surveyed: ids, heliopauseFound: true },
    spacecraft: { ...start.spacecraft, fuelMass: kilograms(start.spacecraft.fuelMass * share) },
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
      const before = startRun(892, 'hauler');
      return [before, hop(before, 'Praerionrio Prime').flight];
    },
  ],
  // A fifth of the Fuel since #283, a tenth of the 36 t Tank since #298 (as in hopReportView.test.ts).
  ['Fell Short', () => halfFuelledHop('fell-short', 'hauler', 0.1)],
  // 0.45 of the Fuel, not half, is what Crashes from there (as in hopReportView.test.ts).
  ['Crashed', () => halfFuelledHop('crashed', 'scout', 0.15)],
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
  const before = startRun(892, 'hauler');
  const { flight } = hop(before, 'Praerionrio Prime');
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

// Scrap (#344): a Debris field's Scrap shows in the icon row as its icon and "+N", named in words.
it('shows the Scrap a Debris field gave as its icon and "+N", and the report still fits', async () => {
  const before = startRun(892, 'hauler');
  const body = listBodies(before.starSystem).find((b) => b.name === 'Praerionrio Prime');
  if (!body) throw new Error('no Body');
  const launched = launchHop(before, body.id, {
    schedule: [{ kind: 'debris-field', tick: 300, slot: 0, scrap: 3 }],
  });
  if (launched.kind !== 'flown') throw new Error('no flight');
  const host = await renderUi(
    <HopReport
      before={before}
      flight={launched.flight}
      actions={[{ label: 'Continue', onClick: () => undefined, primary: true }]}
    />,
  );
  const scrap = [...host.querySelectorAll('[data-testid="hop-report-cruise"]')].find(
    (mark) => mark.getAttribute('aria-label') === '+3 Scrap from the Debris field.',
  );
  if (!scrap) throw new Error('no Scrap in the icon row');
  expect(scrap.querySelector('[data-testid="scrap-icon"]')).not.toBeNull();
  expect(scrap.textContent).toBe('+3');
  cleanUp();
  expect(await spareBelowContinue(before, launched.flight)).toBeGreaterThanOrEqual(0);
});
