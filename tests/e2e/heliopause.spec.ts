import { expect, test, type Page } from '@playwright/test';
import { FAST_CRUISE } from './cruise.ts';
import { recordShots, shotsSeen } from './shots.ts';
import {
  findBody,
  firstDetectedBody,
  HELIOPAUSE,
  isInHopRange,
  launchHop,
  planHop,
  replay,
  runEnd,
  score,
  startingMoon,
  startRun,
} from '../../src/game/sim/index.ts';
import { readyToJump } from '../../src/game/sim/testing.ts';
import { formatScore } from '../../src/ui/endOfRunView.ts';
import { kmPerSecondFigure } from '../../src/ui/format.ts';
import { JUMP_FLAVOUR_TEXT } from '../../src/ui/jumpFlavour.ts';

// Spec #15's way out, on one seed, by keyboard alone, since #191 found only by the Radar: the chart
// opens with no Heliopause; build a Radar, Hop out until it finds the Heliopause, build the Jump
// Drive, target the Heliopause, Launch, reach it, Jump to Star System 2 and Hop on from its Starting
// Moon. The route is a careful explorer's (`readyToJump`): seed 411 gets out in 10 Hops, planet by
// planet. Re-pinned for #191 (was seed 28, whose first target paid for the Jump Drive with the
// Heliopause already found). Re-pinned for #283 (was seed 121's 5 Hops): the Hop range sends that
// explorer another way, and it no longer gets out.
const SEED = 411;
const ready = readyToJump(SEED, 'scout');
if (!ready) throw new Error(`Seed ${String(SEED)} should have a way out`);
const run = startRun(SEED, 'scout');

/** The explorer's choices, each with the Run it leaves: a Radar, the Hops out, then the Jump Drive. */
const route = ready.choices.map((choice, index) => {
  const replayed = replay(SEED, 'scout', ready.choices.slice(0, index + 1));
  if (replayed.kind !== 'replayed') throw new Error('The route should replay');
  return { choice, after: replayed.run };
});
const hops = route.flatMap(({ choice, after }) => {
  if (choice.kind !== 'hop' || choice.target === HELIOPAUSE) return [];
  const body = findBody(run.starSystem, choice.target);
  if (!body) throw new Error(`No Body ${choice.target}`);
  // A Body the player knows of past the Hop range from here, if any (#283).
  const far = after.knowledge.detected
    .map((id) => findBody(run.starSystem, id))
    .find((known) => known?.landable && !isInHopRange(after, known.id));
  return [
    {
      name: body.name,
      finds: after.knowledge.heliopauseFound,
      materials: after.materials,
      far: far?.name,
    },
  ];
});
const firstFar = hops.findIndex((hop) => hop.far !== undefined);
if (firstFar < 0) throw new Error('The route should pass a Body out of the Hop range');
const firstFind = hops.findIndex((hop) => hop.finds);
if (firstFind < 0) throw new Error('The route should find the Heliopause');

const planned = planHop(ready, HELIOPAUSE);
const escape = launchHop(ready, HELIOPAUSE);
if (planned.kind !== 'planned' || escape.kind !== 'flown') throw new Error('Expected a plan');
if (escape.flight.outcome.kind !== 'reached-heliopause') {
  throw new Error(`Seed ${String(SEED)}: the Hop to the Heliopause should reach it`);
}
// The Jump maroons the Run on System 2's Starting Moon, with Fuel for a sure Hop to its first target.
const system2 = escape.run;
const nextMoon = firstDetectedBody(system2.starSystem);
const onward = launchHop(system2, nextMoon.id);
if (onward.kind !== 'flown' || onward.run.status.kind !== 'landed') {
  throw new Error(`Seed ${String(SEED)}: the Hop on from System 2's Starting Moon should land`);
}

// ...and where the Run ends in System 2: from there, a Hop to the Body Comms Detected Falls Short.
const doomedId = onward.flight.reveal?.detected[0];
const doomed = doomedId && findBody(system2.starSystem, doomedId);
if (!doomed) throw new Error(`Seed ${String(SEED)}: Comms should Detect a Body in System 2`);
const doomedHop = launchHop(onward.run, doomed.id);
if (doomedHop.kind !== 'flown') throw new Error('unreachable');
const finalEnd = runEnd(doomedHop.run);
if (finalEnd?.kind !== 'fell-short') throw new Error('The doomed Hop should end the Run');
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

/** Installs a Component in the first empty Slot through the Spacecraft panel, by keyboard. */
async function installByKeyboard(page: Page, label: RegExp, name: string): Promise<void> {
  await tabTo(page, /^Spacecraft/);
  await page.keyboard.press('Enter');
  const panel = page.getByRole('dialog', { name: 'Spacecraft' });
  await expect(panel).toBeVisible();
  await tabTo(page, label);
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('install-status')).toContainText(`Installed ${name}`);
  await page.keyboard.press('Escape');
  await expect(panel).toBeHidden();
}

/** Opens the Nav Chart, targets `name` and launches by keyboard. */
async function hopTo(page: Page, name: string): Promise<void> {
  await page.keyboard.press('m');
  await expect(page.getByRole('dialog', { name: 'Nav Chart' })).toBeVisible();
  await focusOnChart(page, name);
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('target')).toContainText(name);
  await launch(page);
}

/**
 * Hops the explorer's route out, planet by planet. The Radar finds the Heliopause on the way, and the
 * chart says when a Body it knows of is out of the Hop range (#283).
 */
async function exploreOut(page: Page): Promise<void> {
  for (const [index, hop] of hops.entries()) {
    await hopTo(page, hop.name);
    const arrived = page.getByRole('dialog', { name: 'Arrived' });
    await expect(arrived).toBeVisible({ timeout: 30_000 });
    await page.keyboard.press('Enter');
    await expect(arrived).toBeHidden();
    await expect(page.getByTestId('materials')).toHaveText(String(hop.materials));
    if (index === firstFind) {
      await expect(page.getByTestId('comms-announcement')).toContainText('Heliopause found');
    }
    if (index === firstFar && hop.far) {
      await page.keyboard.press('m');
      const chart = page.getByRole('dialog', { name: 'Nav Chart' });
      await expect(chart).toBeVisible();
      await focusOnChart(page, hop.far);
      await expect(page.getByTestId('verdict')).toHaveText('Out of Hop range.');
      // #193: the first Escape closes the Body's card, the second the chart.
      await page.keyboard.press('Escape');
      await expect(page.getByTestId('inspect')).toHaveCount(0);
      await page.keyboard.press('Escape');
      await expect(chart).toBeHidden();
    }
  }
}

test('build a Radar to find the Heliopause, then a Jump Drive, reach it by keyboard, Jump and Hop on', async ({
  page,
}, testInfo) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 640, height: 360 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));

  await page.goto(`/?seed=${String(SEED)}&chassis=scout&${FAST_CRUISE}`);
  await expect(page.getByRole('button', { name: 'New Run' })).toBeVisible();
  await page.keyboard.press('Tab');
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('materials')).toHaveText(String(run.materials));

  // 1. The chart opens with no Heliopause: only the Radar finds it.
  await page.keyboard.press('m');
  const chart = page.getByRole('dialog', { name: 'Nav Chart' });
  await expect(chart).toBeVisible();
  await expect(page.getByRole('option', { name: /^Heliopause, / })).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(chart).toBeHidden();

  // 2. Build a level-1 Radar from the Materials a New Run has, and Hop out until it finds the Heliopause
  // and the Heliopause is within the Hop range.
  await installByKeyboard(page, /^Install Radar, level 1,/, 'Radar');
  await exploreOut(page);

  // 3. Now on the chart, it says why it cannot be the target without a Jump Drive, and Enter does nothing.
  await page.keyboard.press('m');
  await expect(chart).toBeVisible();
  await focusOnChart(page, 'Heliopause');
  await expect(page.getByTestId('verdict')).toContainText('Jump Drive');
  await expect(page.getByRole('option', { name: /^Heliopause, / })).toHaveAttribute(
    'aria-disabled',
    'true',
  );
  await page.keyboard.press('Enter');
  // #193: no target, so no Hop plan; the card stays with its reason.
  await expect(page.getByTestId('target')).toHaveCount(0);
  await expect(page.getByTestId('verdict')).toContainText('Jump Drive');
  await testInfo.attach('heliopause-found-needs-a-jump-drive', {
    body: await page.screenshot(),
    contentType: 'image/png',
  });
  // #193: the first Escape closes the Heliopause's card, the second the chart.
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('inspect')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(chart).toBeHidden();

  // 4. Build the Jump Drive in the Spacecraft panel.
  await installByKeyboard(page, /^Install Jump Drive,/, 'Jump Drive');
  await expect(page.getByTestId('materials')).toHaveText(String(ready.materials));

  // 5. Target the Heliopause: its plan has Takeoff and Transfer, and no Landing.
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

  // 6. Launch: Takeoff and Transfer play, then the Jump: the flavour text over the black.
  await recordShots(page);
  await launch(page);
  const strip = page.getByTestId('phase-strip');
  await expect(strip).toBeVisible();
  await expect(strip).not.toContainText('Landing');
  const caption = page.getByTestId('jump-caption');
  await expect(caption).toHaveText(JUMP_FLAVOUR_TEXT, { timeout: 30_000 });
  // No Approach on the way out: the Jump follows the Cruise.
  expect(await shotsSeen(page)).toEqual(['takeoff', 'cruise']);
  await testInfo.attach('the-jump', { body: await page.screenshot(), contentType: 'image/png' });

  // 7. The Landed view of System 2's Starting Moon: the Jump Drive burnt out, Materials kept and its
  // yield gathered.
  await expect(page.getByTestId('system-number')).toHaveText('System 2', { timeout: 15_000 });
  await expect(caption).toBeHidden();
  await expect(page.getByTestId('materials')).toHaveText(String(system2.materials));
  await expect(page.getByRole('button', { name: /^Nav Chart/ })).toBeFocused();
  await testInfo.attach('star-system-2', {
    body: await page.screenshot(),
    contentType: 'image/png',
  });

  // 8. Hop on in System 2, to the one Body Comms Detected there.
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
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 640, height: 360 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));

  await page.goto(`/?seed=${String(SEED)}&chassis=scout&${FAST_CRUISE}`);
  await expect(page.getByRole('button', { name: 'New Run' })).toBeVisible();
  await page.keyboard.press('Tab');
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('materials')).toHaveText(String(run.materials));

  await installByKeyboard(page, /^Install Radar, level 1,/, 'Radar');
  await exploreOut(page);
  await installByKeyboard(page, /^Install Jump Drive,/, 'Jump Drive');

  await hopTo(page, 'Heliopause');
  await expect(page.getByTestId('system-number')).toHaveText('System 2', { timeout: 45_000 });
  await expect(page.getByRole('button', { name: /^Nav Chart/ })).toBeFocused();

  // A sure Hop on from the new Starting Moon, then the Body Comms Detects there.
  await hopTo(page, nextMoon.name);
  const onwardReport = page.getByRole('dialog', { name: 'Arrived' });
  await expect(onwardReport).toBeVisible({ timeout: 30_000 });
  await page.keyboard.press('Enter');
  await expect(onwardReport).toBeHidden();

  // The Run ends in System 2: Hop report, Continue, then the End-of-Run screen.
  await hopTo(page, doomed.name);
  const outcome = page.getByRole('alertdialog', { name: 'Fell Short' });
  await expect(outcome).toBeVisible({ timeout: 30_000 });
  await expect(outcome.getByRole('button', { name: 'Continue' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(outcome.getByTestId('end-of-run-score')).toHaveAttribute(
    'aria-label',
    `Score: ${formatScore(finalScore)}`,
  );
  await expect(outcome.getByTestId('end-of-run-best')).toHaveAttribute(
    'aria-label',
    `Best Score: ${formatScore(finalScore)} (new Best Score)`,
  );
  await testInfo.attach('end-of-run', { body: await page.screenshot(), contentType: 'image/png' });

  // New Run, by keyboard: a fresh Star System 1 with the Chassis from the URL.
  await expect(outcome.getByRole('button', { name: 'New Run' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('alertdialog')).toHaveCount(0);
  await expect(page.getByTestId('system-number')).toHaveText('System 1');
  await expect(
    page.getByRole('heading', {
      name: startingMoon(startRun(SEED + 1, 'scout').starSystem).name,
      level: 1,
    }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});
