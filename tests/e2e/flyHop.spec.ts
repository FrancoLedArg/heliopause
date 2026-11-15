import { expect, test, type Locator, type Page } from '@playwright/test';
import { FAST_CRUISE } from './cruise.ts';
import { formatFuel } from '../../src/ui/format.ts';
import {
  generateStarSystem,
  homePlanet,
  launchHop,
  listBodies,
  startRun,
  type Body,
} from '../../src/game/sim/index.ts';

// Re-pinned for #188 (was 123): since generation changed, seed 305 is the first with a Hop that
// Crashes for the scout and one that Falls Short in the Transfer for the hauler.
const SEED = 305;
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

/** Seed 305's Hauler Falls Short in the Transfer on its way to Lyquin (found by a scan over seeds, Chassis and targets). */
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
  await page.goto(`/?seed=${String(SEED)}&chassis=scout&${FAST_CRUISE}`);
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

/** The report says the simulation's explanation in two places: its outcome line, and the one why line. */
async function expectWhy(report: Locator, why: string): Promise<void> {
  for (const sentence of why.split(/(?<=[.!?])\s+/)) {
    await expect(report).toContainText(sentence);
  }
}

const currentBurn = (page: Page) =>
  page.getByTestId('phase-strip').locator('[aria-current="step"]');

/**
 * Starts recording, every frame, each shot the HUD names (its `data-shot`), in order and once each;
 * `shotsSeen` reads the record back. The playback runs on its own clock, so polling from the test
 * could miss a short shot.
 */
async function recordShots(page: Page): Promise<void> {
  // A script in the page (the e2e project has no DOM types).
  await page.evaluate(`(() => {
    const seen = [];
    window.shotsSeen = seen;
    const look = () => {
      const shot = document.querySelector('[data-shot]')?.getAttribute('data-shot');
      if (shot && seen.at(-1) !== shot) seen.push(shot);
      requestAnimationFrame(look);
    };
    look();
  })()`);
}

const shotsSeen = (page: Page): Promise<unknown> => page.evaluate('window.shotsSeen');

test('a Hop to the Home Planet’s Moon plays Takeoff, Transfer and Landing, then lands on the Moon and collects its Fuel', async ({
  page,
}, testInfo) => {
  test.setTimeout(60_000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await openNavChart(page);
  const fuelAtLaunch = await page.getByTestId('fuel').textContent();
  expect(fuelAtLaunch).toBe(formatFuel(run.spacecraft.fuelMass));
  await target(page, homeMoon.name);
  await recordShots(page);
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
  // The Transfer is the Cruise: the Spacecraft big in space, the systems lights coming on.
  await expect(page.getByTestId('systems-lights')).toBeVisible();
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
  // The film's shots, in order, from the HUD (the Cruise played fast: see FAST_CRUISE).
  expect(await shotsSeen(page)).toEqual(['takeoff', 'cruise', 'landing']);
  // Show, don't tell: the Δv bar and the gathered icon first, the Burn table behind "Tell me more".
  await expect(report.getByRole('img', { name: /^Δv: .*Used / })).toBeVisible();
  await expect(report.getByRole('button', { name: 'Continue' })).toBeFocused();
  await report.getByRole('button', { name: 'Tell me more' }).click();
  for (const burn of ['Takeoff', 'Transfer', 'Landing']) {
    await expect(report.getByRole('row', { name: new RegExp(burn) })).toContainText(/[+−±]\d+%/);
  }
  await expect(report.getByTestId('hop-report-margin')).toContainText('Margin left');
  await expectWhy(report, moonHop.flight.why);
  // Landing on the Icy Moon collected its Fuel (the report opens once the gathering moment has played):
  // "+N t" beside the Fuel icon, the words in its accessible name. And it says why that is plausible.
  const gain = report.getByRole('img', { name: /^Collected .* t of Fuel/ });
  await expect(gain).toContainText(/^\+\d+\.\d t$/);
  await expect(gain.locator('[data-resource="fuel"]')).toBeVisible();
  await expect(report).toContainText('so rockets could refuel on the Moon');
  await expect(page.getByTestId('materials')).toHaveText(String(run.materials));
  await testInfo.attach('arrived-report', {
    body: await page.screenshot(),
    contentType: 'image/png',
  });
  // Focus stays in the report: Tab wraps from Continue to Tell me more, and Shift+Tab back.
  await page.getByRole('button', { name: 'Continue' }).focus();
  await page.keyboard.press('Tab');
  await expect(report.getByRole('button', { name: 'Tell me more' })).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(report.getByRole('button', { name: 'Continue' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(report).toBeHidden();
  await expect(page.getByRole('button', { name: /Nav Chart/ })).toBeFocused();
  // The Fuel left by the Hop, plus what landing collected.
  await expect(page.getByTestId('fuel')).toHaveText(formatFuel(moonHop.run.spacecraft.fuelMass));
  expect(moonHop.flight.fuelRemaining).toBeLessThan(run.spacecraft.fuelMass);
  expect(moonHop.run.spacecraft.fuelMass).toBeGreaterThan(moonHop.flight.fuelRemaining);
  await testInfo.attach('arrived', { body: await page.screenshot(), contentType: 'image/png' });
  // The Moon gave up its Fuel, so the plate says it is Depleted.
  await expect(page.getByTestId('landed-depleted')).toHaveAttribute(
    'aria-label',
    'Depleted, yields nothing',
  );

  // The next Hop can be planned from the Moon, and the chart lists it as Depleted.
  await page.getByRole('button', { name: /Nav Chart/ }).click();
  await expect(page.getByRole('dialog', { name: 'Nav Chart' })).toBeVisible();
  await expect(
    page.getByRole('option', { name: new RegExp(`^${homeMoon.name}, .*Depleted, yields nothing`) }),
  ).toBeAttached();
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
  test.setTimeout(60_000);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openNavChart(page);
  await target(page, homeMoon.name);
  await page.getByRole('button', { name: 'Launch' }).click();
  await expect(currentBurn(page)).toContainText('Takeoff');
  await expect(currentBurn(page)).toContainText('Transfer');
  await expect(currentBurn(page)).toContainText('Landing');
  // How much shorter reduced motion plays is checked on the playback itself (flightPlayback.test.ts);
  // a wall-clock limit here fails on a loaded machine, so this waits on the outcome instead.
  await expect(page.getByRole('heading', { name: homeMoon.name, level: 1 })).toBeVisible({
    timeout: 30_000,
  });
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
  await expect(outcome.getByRole('img', { name: /^Δv: .*Landing/ })).toBeVisible();
  await expect(outcome.getByRole('button', { name: 'Continue' })).toBeFocused();
  await outcome.getByRole('button', { name: 'Tell me more' }).click();
  await expect(outcome).toContainText('not enough Δv left to finish the Landing');
  await expect(outcome.getByRole('row', { name: /Landing/ })).toContainText('ran out');
  await expect(outcome.getByRole('row', { name: /Transfer/ })).toContainText(/[+−±]\d+%/);
  await expect(outcome.locator('.hop-report__why')).toHaveText(
    /^Fuel ran out in the Landing: Δv short by [\d.]+ km\/s\.$/,
  );
  await expect(outcome).toContainText(crashFlight.why);
  await testInfo.attach('crashed-report', {
    body: await page.screenshot(),
    contentType: 'image/png',
  });
  // Continue moves on from the Hop report to the End-of-Run screen.
  await outcome.getByRole('button', { name: 'Continue' }).focus();
  await page.keyboard.press('Enter');
  // The End-of-Run screen: the Score (one Hop flown, no Star System escaped) and the Best Score it set.
  await expect(outcome.getByTestId('end-of-run-score')).toHaveText(
    '0 Star Systems escaped, 1 Hop flown',
  );
  await expect(outcome.getByTestId('end-of-run-best')).toContainText(
    '0 Star Systems escaped, 1 Hop flown (new Best Score)',
  );
  await testInfo.attach('crashed', { body: await page.screenshot(), contentType: 'image/png' });

  // The way out is New Run, focused; Back to title is the other way.
  await expect(outcome.getByRole('button', { name: 'New Run' })).toBeFocused();
  await outcome.getByRole('button', { name: 'Back to title' }).click();
  await expect(page.getByRole('button', { name: 'New Run' })).toBeVisible();
  // The title remembers the Best Score.
  await expect(page.getByTestId('title-best-score')).toHaveText(
    'Best Score: 0 Star Systems escaped, 1 Hop flown',
  );
});

test('the End-of-Run screen keeps focus inside it, and New Run from the keyboard starts fresh', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openNavChart(page);
  await target(page, crashTarget.name);
  await page.getByRole('button', { name: 'Launch' }).click();
  const outcome = page.getByRole('alertdialog', { name: 'Crashed' });
  await expect(outcome).toBeVisible({ timeout: 10_000 });
  await expect(outcome.getByRole('button', { name: 'Continue' })).toBeFocused();
  await page.keyboard.press('Enter');
  const newRun = outcome.getByRole('button', { name: 'New Run' });
  const back = outcome.getByRole('button', { name: 'Back to title' });
  await expect(newRun).toBeFocused();
  // Tab and Shift+Tab cycle through the two buttons and never leave the screen.
  await page.keyboard.press('Tab');
  await expect(back).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(newRun).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(back).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(newRun).toBeFocused();
  // Enter starts a New Run on the Chassis in the URL, in a different Star System.
  await page.keyboard.press('Enter');
  const nextHome = homePlanet(generateStarSystem(SEED + 1));
  await expect(page.getByRole('heading', { name: nextHome.name, level: 1 })).toBeVisible();
  await expect(page.getByRole('alertdialog')).toHaveCount(0);
});

test('fast-forward (F) turns on, keeps the flight log filling in, and lands with the same Fuel', async ({
  page,
}) => {
  test.setTimeout(60_000);
  await openNavChart(page);
  await target(page, homeMoon.name);
  await page.getByRole('button', { name: 'Launch' }).click();
  await expect(currentBurn(page)).toContainText('Takeoff');
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
    timeout: 30_000,
  });
  // How much faster it plays is checked on the playback clock (Flight.browser.test.tsx); wall time
  // here would only measure how busy the machine is.
  await expect(page.getByTestId('fuel')).toHaveText(formatFuel(moonHop.run.spacecraft.fuelMass));
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
  await outcome.getByRole('button', { name: 'Continue' }).click();
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
  await page.goto(`/?seed=${String(SEED)}&${FAST_CRUISE}`);
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
  await expect(outcome.getByRole('button', { name: 'Continue' })).toBeFocused();
  await outcome.getByRole('button', { name: 'Tell me more' }).click();
  await expect(outcome).toContainText('Fuel ran out during the Transfer');
  await expect(outcome.getByRole('row', { name: /Transfer/ })).toContainText('ran out');
  await expect(outcome.getByRole('row', { name: /Landing/ })).toContainText('not flown');
  await expect(outcome.locator('.hop-report__why')).toHaveText(
    /^Fuel ran out in the Transfer: Δv short by [\d.]+ km\/s\.$/,
  );
  await expect(outcome).toContainText(shortFlight.why);
  await testInfo.attach('fell-short', { body: await page.screenshot(), contentType: 'image/png' });

  await outcome.getByRole('button', { name: 'Continue' }).click();
  await expect(outcome.getByTestId('end-of-run-score')).toHaveText(
    '0 Star Systems escaped, 1 Hop flown',
  );
  await expect(outcome.getByTestId('end-of-run-best')).toContainText('(new Best Score)');
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
