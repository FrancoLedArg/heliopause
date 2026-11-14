import { expect, test, type Page } from '@playwright/test';
import { formatFuel } from '../../src/ui/format.ts';
import {
  generateStarSystem,
  homePlanet,
  launchHop,
  listBodies,
  startRun,
  type Body,
} from '../../src/game/sim/index.ts';

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
const crashLaunch = launchHop(run, crashTarget.id);
if (crashLaunch.kind !== 'flown') throw new Error('unreachable');
const crashFlight = crashLaunch.flight;

/** Seed 123's Hauler Falls Short in the Transfer on its way to Tyquesion (found by a scan over seeds, Chassis and targets). */
const haulerRun = startRun(SEED, 'hauler');
const shortTarget: Body | undefined = listBodies(haulerRun.starSystem).find((body) => {
  const launched = launchHop(haulerRun, body.id);
  return launched.kind === 'flown' && launched.flight.outcome.kind === 'fell-short';
});
if (!shortTarget) throw new Error(`Seed ${SEED} has no Hop that Falls Short for the Hauler`);
const shortLaunch = launchHop(haulerRun, shortTarget.id);
if (shortLaunch.kind !== 'flown') throw new Error('unreachable');
const shortFlight = shortLaunch.flight;

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

  // Arrived: the Landed view on the Moon with the Hop report beside it, then the Fuel the simulation left.
  await expect(page.getByRole('heading', { name: homeMoon.name, level: 1 })).toBeVisible({
    timeout: 10_000,
  });
  const report = page.getByRole('dialog', { name: 'Arrived' });
  await expect(report).toBeVisible();
  await expect(report).toContainText(`Landed on ${homeMoon.name}`);
  for (const burn of ['Takeoff', 'Transfer', 'Landing']) {
    await expect(report.getByRole('row', { name: new RegExp(burn) })).toContainText(/[+−±]\d+%/);
  }
  await expect(report.getByTestId('hop-report-margin')).toContainText('Margin left');
  await expect(report).toContainText(moonHop.flight.why);
  await testInfo.attach('arrived-report', {
    body: await page.screenshot(),
    contentType: 'image/png',
  });
  await expect(report.getByRole('button', { name: 'Continue' })).toBeFocused();
  // Focus stays in the report: Tab and Shift+Tab come back to Continue.
  await page.keyboard.press('Tab');
  await expect(report.getByRole('button', { name: 'Continue' })).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(report.getByRole('button', { name: 'Continue' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(report).toBeHidden();
  await expect(page.getByRole('button', { name: /Nav Chart/ })).toBeFocused();
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

test('the Nav Chart cannot open under the Arrived report: opening it closes the report', async ({
  page,
}) => {
  test.setTimeout(60_000);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openNavChart(page);
  await target(page, homeMoon.name);
  await page.getByRole('button', { name: 'Launch' }).click();
  const report = page.getByRole('dialog', { name: 'Arrived' });
  await expect(report).toBeVisible({ timeout: 20_000 });
  await page.getByRole('button', { name: /Nav Chart/ }).click();
  await expect(page.getByRole('dialog', { name: 'Nav Chart' })).toBeVisible();
  await expect(page.getByTestId('hop-report')).toHaveCount(0);
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
  await expect(outcome).toContainText('The Transfer succeeded');
  await expect(outcome.getByRole('row', { name: /Landing/ })).toContainText('ran out');
  await expect(outcome.getByRole('row', { name: /Transfer/ })).toContainText(/[+−±]\d+%/);
  await expect(outcome).toContainText(crashFlight.why);
  await testInfo.attach('crashed', { body: await page.screenshot(), contentType: 'image/png' });

  // The way out is New Run, focused; Back to title is the other way.
  await expect(outcome.getByRole('button', { name: 'New Run' })).toBeFocused();
  await outcome.getByRole('button', { name: 'Back to title' }).click();
  await expect(page.getByRole('button', { name: 'New Run' })).toBeVisible();
});

test('fast-forward (F) plays the same Hop in a fraction of the time and lands with the same Fuel', async ({
  page,
}) => {
  test.setTimeout(60_000);
  await openNavChart(page);
  await target(page, homeMoon.name);
  await page.getByRole('button', { name: 'Launch' }).click();
  await expect(currentBurn(page)).toContainText('Takeoff');
  const launched = Date.now();
  await page.keyboard.press('f');
  await expect(page.getByRole('button', { name: /Fast-forward/ })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  // The flight log still fills in, Burn by Burn.
  await expect(page.getByTestId('flight-log').getByRole('row', { name: /Takeoff/ })).toContainText(
    /m\/s.*%/,
  );
  await expect(page.getByRole('heading', { name: homeMoon.name, level: 1 })).toBeVisible({
    timeout: 10_000,
  });
  // The full playback is about 13 s; at 4x it is well under 7 s.
  expect(Date.now() - launched).toBeLessThan(7_000);
  await expect(page.getByTestId('fuel')).toHaveText(formatFuel(moonHop.flight.fuelRemaining));
});

test('after a failed Hop, New Run starts a different Star System on its Home Planet', async ({
  page,
}) => {
  test.setTimeout(60_000);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openNavChart(page);
  await target(page, crashTarget.name);
  await page.getByRole('button', { name: 'Launch' }).click();
  const outcome = page.getByRole('alertdialog', { name: 'Crashed' });
  await expect(outcome).toBeVisible({ timeout: 10_000 });
  await outcome.getByRole('button', { name: 'New Run' }).click();

  // The address bar follows the Run being played.
  await expect(page).toHaveURL(new RegExp(`seed=${String(SEED + 1)}`));
  // `?seed=123` moves on to 124 for the next Run, so the Home Planet is a different one.
  const nextHome = homePlanet(generateStarSystem(SEED + 1));
  expect(nextHome.name).not.toBe(home.name);
  await expect(page.getByRole('heading', { name: nextHome.name, level: 1 })).toBeVisible();
  await expect(page.getByText('Home Planet · Rocky')).toBeVisible();
  await expect(page.getByRole('alertdialog')).toHaveCount(0);
});

test('a Hop that Falls Short says in which Burn the Fuel ran out, and New Run offers the Chassis picker', async ({
  page,
}, testInfo) => {
  test.setTimeout(60_000);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  // No Chassis in the URL: the picker is part of the New Run path.
  await page.goto(`/?seed=${String(SEED)}`);
  await page.getByRole('button', { name: 'New Run' }).click();
  await expect(page.getByRole('radio', { name: /Scout/ })).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('radio', { name: /Hauler/ })).toBeChecked();
  await page.getByRole('button', { name: 'Launch' }).click();
  await page.getByRole('button', { name: /Nav Chart/ }).click();
  await target(page, shortTarget.name);
  await page.getByRole('button', { name: 'Launch' }).click();

  const outcome = page.getByRole('alertdialog', { name: 'Fell Short' });
  await expect(outcome).toBeVisible({ timeout: 10_000 });
  await expect(outcome).toContainText('Fuel ran out during the Transfer');
  await expect(outcome.getByRole('row', { name: /Transfer/ })).toContainText('ran out');
  await expect(outcome.getByRole('row', { name: /Landing/ })).toContainText('not flown');
  await expect(outcome).toContainText(shortFlight.why);
  await testInfo.attach('fell-short', { body: await page.screenshot(), contentType: 'image/png' });

  await outcome.getByRole('button', { name: 'New Run' }).click();
  await expect(page.getByRole('heading', { name: 'Choose a Chassis' })).toBeVisible();
  // The picker starts on the Chassis just flown.
  await expect(page.getByRole('radio', { name: /Hauler/ })).toBeChecked();
  await testInfo.attach('picker-after-failure', {
    body: await page.screenshot(),
    contentType: 'image/png',
  });
  // Back returns to the report, with New Run focused again.
  await page.getByRole('button', { name: 'Back' }).click();
  await expect(outcome.getByRole('button', { name: 'New Run' })).toBeFocused();
  await outcome.getByRole('button', { name: 'New Run' }).click();
  // The picker starts on the Hauler just flown; one step on is the Lancer.
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('radio', { name: /Lancer/ })).toBeChecked();
  await page.getByRole('button', { name: 'Launch' }).click();
  const nextHome = homePlanet(generateStarSystem(SEED + 1));
  await expect(page.getByRole('heading', { name: nextHome.name, level: 1 })).toBeVisible();
});
