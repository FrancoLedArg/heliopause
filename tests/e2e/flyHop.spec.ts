import { expect, test, type Page } from '@playwright/test';
import { formatFuel } from '../../src/ui/format.ts';
import { launchHop, listBodies, startRun, type Body } from '../../src/game/sim/index.ts';

const SEED = 123;
const run = startRun(SEED, 'scout');
const home = run.starSystem.planets.find((p) => p.id === run.starSystem.homePlanetId);
const homeMoon = home?.moons[0];
if (!home || !homeMoon) throw new Error(`Seed ${SEED} has no Home Planet Moon`);

/** What the simulation says the Hop to the Home Planet's Moon leaves in the tank. */
const moonHop = launchHop(run, homeMoon.id);
if (moonHop.kind !== 'flown' || moonHop.flight.outcome.kind !== 'arrived') {
  throw new Error(`Seed ${SEED}: the Hop to ${homeMoon.name} should Arrive`);
}

/** A target this seed's first Hop Crashes on: Launch settles the outcome, so the test can know it. */
const crashTarget: Body | undefined = listBodies(run.starSystem).find((body) => {
  const launched = launchHop(run, body.id);
  return launched.kind === 'flown' && launched.flight.outcome.kind === 'crashed';
});
if (!crashTarget) throw new Error(`Seed ${SEED} has no Hop that Crashes`);

async function openNavChart(page: Page): Promise<void> {
  await page.goto(`/?seed=${String(SEED)}&chassis=scout`);
  await page.getByRole('button', { name: 'New Run' }).click();
  await page.getByRole('button', { name: /Nav Chart/ }).click();
  await expect(page.getByRole('dialog', { name: 'Nav Chart' })).toBeVisible();
}

/** Steps through the Bodies (PageDown, then back with PageUp: they do not wrap) until the inspector shows `name`; Enter makes it the target. */
async function target(page: Page, name: string): Promise<void> {
  const shown = page.getByRole('heading', { name, level: 2, exact: true });
  for (const key of ['PageDown', 'PageUp']) {
    for (let i = 0; i < 40 && !(await shown.isVisible()); i += 1) await page.keyboard.press(key);
  }
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('target')).toContainText(name);
}

const currentBurn = (page: Page) =>
  page.getByTestId('phase-strip').locator('[aria-current="step"]');

test('a Hop to the Home Planet’s Moon plays Takeoff, Transfer and Landing, then lands on the Moon with less Fuel', async ({
  page,
}, testInfo) => {
  test.setTimeout(60_000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await openNavChart(page);
  const fuelAtLaunch = await page.getByTestId('fuel').textContent();
  expect(fuelAtLaunch).toBe(formatFuel(run.spacecraft.fuelMass));
  await target(page, homeMoon.name);
  await page.getByRole('button', { name: 'Launch' }).click();

  // Launch closes the panels; the playback runs with its own HUD.
  await expect(page.getByRole('dialog', { name: 'Nav Chart' })).toBeHidden();
  await expect(currentBurn(page)).toContainText('Takeoff');
  await expect(page.getByTestId('flight-log')).toContainText('burning…');
  await testInfo.attach('takeoff', { body: await page.screenshot(), contentType: 'image/png' });

  // The in-Run Menu is not offered while the Hop plays.
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Menu' })).toHaveCount(0);

  await expect(currentBurn(page)).toContainText('Transfer', { timeout: 10_000 });
  // Takeoff is done: logged with its actual Δv against the estimate.
  await expect(page.getByTestId('flight-log').getByRole('row', { name: /Takeoff/ })).toContainText(
    /m\/s.*%/,
  );
  await testInfo.attach('transfer', { body: await page.screenshot(), contentType: 'image/png' });

  await expect(currentBurn(page)).toContainText('Landing', { timeout: 10_000 });
  await testInfo.attach('landing', { body: await page.screenshot(), contentType: 'image/png' });

  // Arrived: the Landed view on the Moon, with the Fuel the simulation left.
  await expect(page.getByRole('heading', { name: homeMoon.name, level: 1 })).toBeVisible({
    timeout: 10_000,
  });
  await expect(page.getByTestId('fuel')).toHaveText(formatFuel(moonHop.flight.fuelRemaining));
  expect(moonHop.flight.fuelRemaining).toBeLessThan(run.spacecraft.fuelMass);
  await testInfo.attach('arrived', { body: await page.screenshot(), contentType: 'image/png' });

  // The next Hop can be planned from the Moon.
  await page.getByRole('button', { name: /Nav Chart/ }).click();
  await expect(page.getByRole('dialog', { name: 'Nav Chart' })).toBeVisible();
  await target(page, home.name);
  await expect(page.getByTestId('plan-success')).toContainText('%');
  expect(errors).toEqual([]);
});

test('under reduced motion the playback is shorter and still steps through the three Burns', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openNavChart(page);
  await target(page, homeMoon.name);
  const launched = Date.now();
  await page.getByRole('button', { name: 'Launch' }).click();
  await expect(currentBurn(page)).toContainText('Takeoff');
  await expect(currentBurn(page)).toContainText('Transfer');
  await expect(currentBurn(page)).toContainText('Landing');
  await expect(page.getByRole('heading', { name: homeMoon.name, level: 1 })).toBeVisible();
  expect(Date.now() - launched).toBeLessThan(8_000);
});

test('a Hop that Crashes stops on the Landing and says why, and the title is the way out', async ({
  page,
}, testInfo) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openNavChart(page);
  await target(page, crashTarget.name);
  await page.getByRole('button', { name: 'Launch' }).click();

  const outcome = page.getByRole('alertdialog', { name: 'Crashed' });
  await expect(outcome).toBeVisible({ timeout: 10_000 });
  await expect(outcome).toContainText('not enough Δv left to finish the Landing');
  await expect(page.getByTestId('flight-log').getByRole('row', { name: /Landing/ })).toContainText(
    'ran out',
  );
  await expect(page.getByTestId('flight-fuel')).toContainText('0.0 t');
  await testInfo.attach('crashed', { body: await page.screenshot(), contentType: 'image/png' });

  await expect(page.getByRole('button', { name: 'Back to title' })).toBeFocused();
  await page.getByRole('button', { name: 'Back to title' }).click();
  await expect(page.getByRole('button', { name: 'New Run' })).toBeVisible();
});
