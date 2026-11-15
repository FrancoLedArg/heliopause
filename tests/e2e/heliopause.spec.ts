import { expect, test, type Page } from '@playwright/test';
import { FAST_CRUISE } from './cruise.ts';
import {
  HELIOPAUSE,
  homePlanet,
  install,
  launchHop,
  listBodies,
  planHop,
  runEnd,
  score,
  startRun,
} from '../../src/game/sim/index.ts';
import { formatScore } from '../../src/ui/endOfRunView.ts';
import { kmPerSecondFigure } from '../../src/ui/format.ts';
import { JUMP_FLAVOUR_TEXT } from '../../src/ui/jumpFlavour.ts';

// Spec #15's way out, on one seed, by keyboard alone: the Heliopause says it needs a Jump Drive;
// gather Materials on a Rocky Body, build the Jump Drive, target the Heliopause, Launch, reach it,
// Jump to Star System 2 and Hop on from its Home Planet.
const SEED = 35;
const run = startRun(SEED, 'scout');
const rocky = listBodies(run.starSystem).find((body) => body.name === 'Tisquul');
if (!rocky) throw new Error(`Seed ${String(SEED)} has no Tisquul`);
const gathered = launchHop(run, rocky.id);
if (gathered.kind !== 'flown' || gathered.flight.outcome.kind !== 'arrived') {
  throw new Error(`Seed ${String(SEED)}: the Hop to ${rocky.name} should Arrive`);
}
const built = install(gathered.run, gathered.run.spacecraft.slots.indexOf(null), 'jump-drive');
if (built.kind !== 'installed') throw new Error('Tisquul should pay for the Jump Drive');
const planned = planHop(built.run, HELIOPAUSE);
const escape = launchHop(built.run, HELIOPAUSE);
if (planned.kind !== 'planned' || escape.kind !== 'flown') throw new Error('Expected a plan');
if (escape.flight.outcome.kind !== 'reached-heliopause') {
  throw new Error(`Seed ${String(SEED)}: the Hop to the Heliopause should reach it`);
}
// The Jump lands the Run on System 2's Home Planet, with Fuel for a sure Hop to one of its Moons.
const system2 = escape.run;
const nextMoon = homePlanet(system2.starSystem).moons.find((moon) => {
  const onward = planHop(system2, moon.id);
  return onward.kind === 'planned' && onward.plan.successChance === 1;
});
if (!nextMoon) throw new Error(`Seed ${String(SEED)}: no sure Hop on from System 2's Home Planet`);

// ...and where the Run ends in System 2: a Hop to a Body this Spacecraft cannot land on.
const doomed = listBodies(system2.starSystem).find((body) => {
  const flown = launchHop(system2, body.id);
  return flown.kind === 'flown' && flown.flight.outcome.kind === 'crashed';
});
if (!doomed) throw new Error(`Seed ${String(SEED)}: System 2 has no Hop that Crashes`);
const doomedHop = launchHop(system2, doomed.id);
if (doomedHop.kind !== 'flown') throw new Error('unreachable');
const finalEnd = runEnd(doomedHop.run);
if (finalEnd?.kind !== 'crashed') throw new Error('The doomed Hop should end the Run');
const finalScore = score(doomedHop.run);

/** Steps through the chart until the tooltip shows `name` (a Body, or the Heliopause). */
async function focusOnChart(page: Page, name: string): Promise<void> {
  const shown = page.getByRole('heading', { name, level: 2, exact: true });
  for (const key of ['PageDown', 'PageUp']) {
    for (let i = 0; i < 40 && !(await shown.isVisible()); i += 1) await page.keyboard.press(key);
  }
  await expect(shown).toBeVisible();
}

/** Tabs until the focused element's accessible label (or text) matches `name`. */
async function tabTo(page: Page, name: RegExp): Promise<void> {
  for (let i = 0; i < 20; i += 1) {
    const focused = page.locator(':focus');
    if ((await focused.count()) > 0) {
      const label =
        (await focused.getAttribute('aria-label')) ?? (await focused.textContent()) ?? '';
      if (name.test(label)) return;
    }
    await page.keyboard.press('Tab');
  }
  throw new Error(`Tab never reached ${String(name)}`);
}

/** Launches the Hop the plan shows: on the plan, Tab goes to Cancel and then to Launch. */
async function launch(page: Page): Promise<void> {
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Launch' })).toBeFocused();
  await page.keyboard.press('Enter');
}

test('build a Jump Drive, reach the Heliopause by keyboard, Jump to System 2 and Hop on', async ({
  page,
}, testInfo) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 640, height: 360 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));

  await page.goto(`/?seed=${String(SEED)}&chassis=scout&${FAST_CRUISE}`);
  await expect(page.getByRole('button', { name: 'New Run' })).toBeVisible();
  await page.keyboard.press('Tab');
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('materials')).toHaveText(String(run.materials));

  // 1. Without a Jump Drive the chart says why the Heliopause cannot be the target, and Enter does nothing.
  await page.keyboard.press('m');
  const chart = page.getByRole('dialog', { name: 'Nav Chart' });
  await expect(chart).toBeVisible();
  await focusOnChart(page, 'Heliopause');
  await expect(page.getByTestId('verdict')).toContainText('Jump Drive');
  await expect(page.getByRole('option', { name: /^Heliopause, / })).toHaveAttribute(
    'aria-disabled',
    'true',
  );
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('target')).toContainText('None chosen');
  await testInfo.attach('heliopause-needs-a-jump-drive', {
    body: await page.screenshot(),
    contentType: 'image/png',
  });

  // 2. Gather Materials on a Rocky Body.
  await focusOnChart(page, rocky.name);
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('target')).toContainText(rocky.name);
  await launch(page);
  const arrived = page.getByRole('dialog', { name: 'Arrived' });
  await expect(arrived).toBeVisible({ timeout: 30_000 });
  await page.keyboard.press('Enter');
  await expect(arrived).toBeHidden();
  await expect(page.getByTestId('materials')).toHaveText(String(gathered.run.materials));

  // 3. Build the Jump Drive in the Spacecraft panel.
  await tabTo(page, /^Spacecraft/);
  await page.keyboard.press('Enter');
  const panel = page.getByRole('dialog', { name: 'Spacecraft' });
  await expect(panel).toBeVisible();
  await tabTo(page, /^Install Jump Drive,/);
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('install-status')).toContainText('Installed Jump Drive');
  await expect(page.getByTestId('materials')).toHaveText(String(built.run.materials));
  await page.keyboard.press('Escape');
  await expect(panel).toBeHidden();

  // 4. Target the Heliopause: its plan has Takeoff and Transfer, and no Landing.
  await page.keyboard.press('m');
  await expect(chart).toBeVisible();
  await focusOnChart(page, 'Heliopause');
  await expect(page.getByTestId('verdict')).toHaveCount(0);
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('target')).toContainText('Heliopause');
  const bar = page.getByRole('img', { name: /^Δv: / });
  await expect(bar).toHaveAccessibleName(/^Δv: Takeoff [\d.]+ km\/s, Transfer [\d.]+ km\/s\. /);
  await expect(page.getByTestId('plan-needed')).toHaveText(
    kmPerSecondFigure(planned.plan.totalEstimate),
  );
  await testInfo.attach('heliopause-plan', {
    body: await page.screenshot(),
    contentType: 'image/png',
  });

  // 5. Launch: Takeoff and Transfer play, then the Jump: the flavour text over the black.
  await launch(page);
  const strip = page.getByTestId('phase-strip');
  await expect(strip).toBeVisible();
  await expect(strip).not.toContainText('Landing');
  const caption = page.getByTestId('jump-caption');
  await expect(caption).toHaveText(JUMP_FLAVOUR_TEXT, { timeout: 30_000 });
  await testInfo.attach('the-jump', { body: await page.screenshot(), contentType: 'image/png' });

  // 6. The Landed view of System 2's Home Planet: the Jump Drive burnt out, Materials kept.
  await expect(page.getByTestId('system-number')).toHaveText('System 2', { timeout: 15_000 });
  await expect(caption).toBeHidden();
  await expect(page.getByTestId('materials')).toHaveText(String(system2.materials));
  await expect(page.getByRole('button', { name: /^Nav Chart/ })).toBeFocused();
  await testInfo.attach('star-system-2', {
    body: await page.screenshot(),
    contentType: 'image/png',
  });

  // 7. Hop on in System 2, to its Home Planet's Moon.
  await page.keyboard.press('m');
  await expect(chart).toBeVisible();
  await focusOnChart(page, nextMoon.name);
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('target')).toContainText(nextMoon.name);
  // The Jump left Fuel enough for a sure Hop: no luck needed.
  await expect(page.getByTestId('plan-success')).toContainText('100%');
  await launch(page);
  await expect(page.getByRole('dialog', { name: 'Arrived' })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('system-number')).toHaveText('System 2');
  expect(errors).toEqual([]);
});

test('a Run that escaped a Star System ends in the next one with its Score, and New Run starts by keyboard', async ({
  page,
}, testInfo) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 640, height: 360 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));

  await page.goto(`/?seed=${String(SEED)}&chassis=scout&${FAST_CRUISE}`);
  await expect(page.getByRole('button', { name: 'New Run' })).toBeVisible();
  await page.keyboard.press('Tab');
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('materials')).toHaveText(String(run.materials));

  /** Opens the Nav Chart, targets `name` and launches by keyboard. */
  const hopTo = async (name: string): Promise<void> => {
    await page.keyboard.press('m');
    await expect(page.getByRole('dialog', { name: 'Nav Chart' })).toBeVisible();
    await focusOnChart(page, name);
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('target')).toContainText(name);
    await launch(page);
  };

  await hopTo(rocky.name);
  const arrived = page.getByRole('dialog', { name: 'Arrived' });
  await expect(arrived).toBeVisible({ timeout: 30_000 });
  await page.keyboard.press('Enter');
  await expect(arrived).toBeHidden();
  await tabTo(page, /^Spacecraft/);
  await page.keyboard.press('Enter');
  await tabTo(page, /^Install Jump Drive,/);
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('install-status')).toContainText('Installed Jump Drive');
  await page.keyboard.press('Escape');

  await hopTo('Heliopause');
  await expect(page.getByTestId('system-number')).toHaveText('System 2', { timeout: 45_000 });
  await expect(page.getByRole('button', { name: /^Nav Chart/ })).toBeFocused();

  // The Run ends in System 2: Hop report, Continue, then the End-of-Run screen.
  await hopTo(doomed.name);
  const outcome = page.getByRole('alertdialog', { name: 'Crashed' });
  await expect(outcome).toBeVisible({ timeout: 30_000 });
  await expect(outcome.getByRole('button', { name: 'Continue' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(outcome.getByTestId('end-of-run-score')).toHaveText(formatScore(finalScore));
  await expect(outcome.getByTestId('end-of-run-best')).toContainText(
    `${formatScore(finalScore)} (new Best Score)`,
  );
  await testInfo.attach('end-of-run', { body: await page.screenshot(), contentType: 'image/png' });

  // New Run, by keyboard: a fresh Star System 1 with the Chassis from the URL.
  await expect(outcome.getByRole('button', { name: 'New Run' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('alertdialog')).toHaveCount(0);
  await expect(page.getByTestId('system-number')).toHaveText('System 1');
  await expect(
    page.getByRole('heading', {
      name: homePlanet(startRun(SEED + 1, 'scout').starSystem).name,
      level: 1,
    }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});
