import { expect, test, type Page } from '@playwright/test';
import { formatDeltaV, formatFuel, formatPlanDeltaV } from '../../src/ui/format.ts';
import { availableDeltaV, install, launchHop, startRun } from '../../src/game/sim/index.ts';

// The whole loop of spec #14 on one seed: build, plan, Hop, gather, see the Body Depleted.
const SEED = 123;
const run = startRun(SEED, 'scout');
const home = run.starSystem.planets.find((p) => p.id === run.starSystem.homePlanetId);
const moon = home?.moons[0];
if (!home || !moon) throw new Error(`Seed ${SEED} has no Home Planet Moon`);

// What the simulation says the starting Materials buy: a Drill (it multiplies what landing collects).
const built = install(run, 2, 'drill-1');
if (built.kind !== 'installed') throw new Error('The starting Materials should buy a Drill');
const builtRun = built.run;
const afterDeltaV = availableDeltaV(builtRun.spacecraft);
const hop = launchHop(builtRun, moon.id);
if (hop.kind !== 'flown' || hop.flight.outcome.kind !== 'arrived') {
  throw new Error(`Seed ${SEED}: the Drilled Spacecraft's Hop to ${moon.name} should Arrive`);
}

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
  await page.goto(`/?seed=${String(SEED)}&chassis=scout`);
  await page.getByRole('button', { name: 'New Run' }).click();
  await expect(page.getByTestId('delta-v')).toHaveText(
    formatDeltaV(availableDeltaV(run.spacecraft)),
  );

  // 2. Open the Spacecraft panel by keyboard.
  await page.getByRole('button', { name: 'Spacecraft' }).focus();
  await page.keyboard.press('Enter');
  const panel = page.getByRole('dialog', { name: 'Spacecraft' });
  await expect(panel).toBeVisible();

  // 3. Reaching Install shows the preview before anything is paid.
  await tabTo(page, /^Install Drill, level 1/);
  const preview = page.getByTestId('install-preview');
  await expect(preview).toContainText('Install Drill 1');
  await expect(preview.getByTestId('preview-line').filter({ hasText: 'Δv' })).toContainText(
    formatDeltaV(afterDeltaV),
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

  // 4. The Hop plan shows the changed Δv.
  await page.keyboard.press('m');
  await expect(page.getByRole('dialog', { name: 'Nav Chart' })).toBeVisible();
  await target(page, moon.name);
  await expect(page.getByTestId('plan-available')).toHaveText(formatPlanDeltaV(afterDeltaV));

  // 5. Hop to the Icy Moon; the report says what was collected, naming the Drill.
  await page.getByRole('button', { name: 'Launch' }).click();
  const report = page.getByRole('dialog', { name: 'Arrived' });
  await expect(report).toBeVisible({ timeout: 30_000 });
  await expect(report.getByTestId('hop-report-collected')).toContainText(/Collected .* t of Fuel/);
  await expect(report.getByTestId('hop-report-collected')).toContainText('Drill ×');
  await page.keyboard.press('Enter');
  await expect(report).toBeHidden();
  await expect(page.getByTestId('fuel')).toHaveText(formatFuel(hop.run.spacecraft.fuelMass));
  await expect(page.getByTestId('landed-depleted')).toHaveText('· Depleted');

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
