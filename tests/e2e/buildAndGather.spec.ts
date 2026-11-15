import { expect, test, type Page } from '@playwright/test';
import { FAST_CRUISE } from './cruise.ts';
import { formatDeltaVKmS, formatFuel } from '../../src/ui/format.ts';
import {
  availableDeltaV,
  firstDetectedBody,
  install,
  launchHop,
  startRun,
} from '../../src/game/sim/index.ts';
import { describeReport } from '../../src/ui/hopReportView.ts';
import { yieldIcon } from '../../src/ui/yieldIcon.ts';

// The whole loop of spec #14 on one seed: build, plan, Hop, gather, see the Body Depleted.
const SEED = 123;
const run = startRun(SEED, 'scout');
// The one Body Comms Detected at the start: on seed 123, Viormio, an Icy Moon (#189).
const moon = firstDetectedBody(run.starSystem);

// What the simulation says the starting Materials buy: a Drill (it multiplies what landing collects).
const slot = run.spacecraft.slots.findIndex((held) => held === null);
const built = install(run, slot, 'drill-1');
if (built.kind !== 'installed') throw new Error('The starting Materials should buy a Drill');
const builtRun = built.run;
const afterDeltaV = availableDeltaV(builtRun.spacecraft);
// Show, don't tell (#219): what the target Moon yields, from the simulation's own rule.
const moonYield = yieldIcon(builtRun, moon);
if (!moonYield || moonYield.depleted) throw new Error(`${moon.name} should still yield`);
const hop = launchHop(builtRun, moon.id);
if (hop.kind !== 'flown' || hop.flight.outcome.kind !== 'arrived') {
  throw new Error(`Seed ${SEED}: the Drilled Spacecraft's Hop to ${moon.name} should Arrive`);
}
// The gathering moment's end state (#220): the Fuel the top bar shows rose by what landing brought
// aboard, and the report's icon row says so as "+N t" beside the Fuel icon.
const [gathered] = describeReport(builtRun, hop.flight).gains;
if (gathered?.resource !== 'fuel') throw new Error(`${moon.name} should give Fuel`);
const fuelBeforeGathering = formatFuel(hop.flight.fuelRemaining);
const fuelAfterGathering = formatFuel(hop.run.spacecraft.fuelMass);
if (fuelAfterGathering === fuelBeforeGathering) throw new Error('The landing should add Fuel');

/** Tab until focus is on the button named `name`: how a keyboard player reaches a Component. */
async function tabTo(page: Page, name: RegExp): Promise<void> {
  for (let i = 0; i < 16; i += 1) {
    const label = await page.locator(':focus').getAttribute('aria-label');
    if (label !== null && name.test(label)) return;
    await page.keyboard.press('Tab');
  }
  throw new Error(`Tab never reached ${String(name)}`);
}

/** Steps through the Bodies until the inspector shows `name`. */
async function focusBody(page: Page, name: string): Promise<void> {
  const shown = page.getByRole('heading', { name, level: 2, exact: true });
  for (const key of ['PageDown', 'PageUp']) {
    for (let i = 0; i < 40 && !(await shown.isVisible()); i += 1) await page.keyboard.press(key);
  }
  await expect(shown).toBeVisible();
}

/** Focuses `name`, then Enter makes it the target. */
async function target(page: Page, name: string): Promise<void> {
  await focusBody(page, name);
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('target')).toContainText(name);
}

test('build a Drill with the starting Materials, Hop to the Icy Moon, collect its Fuel, and see it Depleted', async ({
  page,
}, testInfo) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 640, height: 360 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));

  // 1. Start a Run.
  await page.goto(`/?seed=${String(SEED)}&chassis=scout&${FAST_CRUISE}`);
  const newRun = page.getByRole('button', { name: 'New Run' });
  await expect(newRun).toBeVisible();
  await page.keyboard.press('Tab');
  await expect(newRun).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('delta-v')).toHaveText(
    formatDeltaVKmS(availableDeltaV(run.spacecraft)),
  );

  // 2. Open the Spacecraft panel by keyboard.
  const spacecraft = page.getByRole('button', { name: 'Spacecraft' });
  const focused = page.locator(':focus');
  for (let i = 0; i < 8; i += 1) {
    if ((await focused.count()) > 0 && ((await focused.textContent()) ?? '').includes('Spacecraft'))
      break;
    await page.keyboard.press('Tab');
  }
  await expect(spacecraft).toBeFocused();
  await page.keyboard.press('Enter');
  const panel = page.getByRole('dialog', { name: 'Spacecraft' });
  await expect(panel).toBeVisible();

  // 3. Reaching Install shows the preview before anything is paid.
  await tabTo(page, /^Install Drill, level 1/);
  const preview = page.getByTestId('install-preview');
  await expect(preview).toContainText('Install Drill 1');
  // #224: the Δv bar shows before → after, in km/s as the top bar does.
  await expect(preview.getByTestId('preview-line').filter({ hasText: 'Δv' })).toContainText(
    `→ ${formatDeltaVKmS(afterDeltaV)}`,
  );
  await expect(page.getByTestId('materials')).toHaveText(String(run.materials));
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('install-status')).toContainText('Installed Drill, level 1');
  await expect(page.getByTestId('materials')).toHaveText(String(builtRun.materials));
  await testInfo.attach('spacecraft-panel', {
    body: await page.screenshot(),
    contentType: 'image/png',
  });
  await page.keyboard.press('Escape');
  await expect(panel).toBeHidden();
  // The Drill is drawn on the Spacecraft, and named in its text alternative.
  await expect(page.locator('[data-spacecraft]')).toHaveAttribute(
    'data-spacecraft',
    /"drill-1\.0\.front"/,
  );
  await expect(page.getByTestId('spacecraft-alt')).toHaveText(
    'Scout: Engine 1, Fuel Tank 1, Drill 1',
  );

  // 4. The Hop plan shows the changed Δv.
  await page.keyboard.press('m');
  await expect(page.getByRole('dialog', { name: 'Nav Chart' })).toBeVisible();
  await target(page, moon.name);
  await expect(page.getByTestId('plan-available')).toHaveText(formatDeltaVKmS(afterDeltaV));
  // The target Moon shows what it yields, on its card and on the Hop plan's target.
  await expect(page.getByTestId('target').getByRole('img', { name: moonYield.name })).toBeVisible();
  await expect(
    page.getByTestId('inspect').getByRole('img', { name: moonYield.name }),
  ).toBeVisible();

  // 5. Hop to the Icy Moon. Under reduced motion the gathering moment resolves at once: the top bar
  // already shows the Fuel risen, and the report's icon row shows "+N t" with the Fuel icon.
  // On the Hop plan, Tab goes to Cancel and then to Launch.
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Launch' })).toBeFocused();
  await page.keyboard.press('Enter');
  const report = page.getByRole('dialog', { name: 'Arrived' });
  await expect(report).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('fuel')).toHaveText(fuelAfterGathering);
  // The words, Drill included, are the entry's accessible name; what shows is the icon and the amount.
  const gain = report.getByRole('img', { name: gathered.name });
  await expect(gain).toBeVisible();
  await expect(gain).toContainText(gathered.amount);
  expect(gathered.amount).toMatch(/^\+\d+\.\d t$/);
  await expect(gain.locator('[data-resource="fuel"]').first()).toBeVisible();
  await testInfo.attach('arrived-report', {
    body: await page.screenshot(),
    contentType: 'image/png',
  });
  await page.keyboard.press('Enter');
  await expect(report).toBeHidden();
  await expect(page.getByTestId('fuel')).toHaveText(fuelAfterGathering);
  // The plate shows the struck-through icon (its words in the accessible name).
  await expect(
    page.getByTestId('landed-kind').getByRole('img', { name: 'Depleted, yields nothing' }),
  ).toBeVisible();

  // 6. Back on the chart, the Moon is marked Depleted, and its tooltip badge is the amber warning.
  await page.keyboard.press('m');
  await expect(page.getByRole('dialog', { name: 'Nav Chart' })).toBeVisible();
  await expect(
    page.getByRole('option', { name: new RegExp(`^${moon.name}, .*Depleted, yields nothing`) }),
  ).toBeAttached();
  await focusBody(page, moon.name);
  await expect(page.getByTestId('landable')).toHaveClass(/nav-chart__badge--warn/);
  await expect(page.getByTestId('tip-composition')).toHaveText('· Depleted');
  await testInfo.attach('depleted-chart', {
    body: await page.screenshot(),
    contentType: 'image/png',
  });
  expect(errors).toEqual([]);
});
