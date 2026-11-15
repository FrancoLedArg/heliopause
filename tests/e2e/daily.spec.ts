import { expect, test, type Page } from '@playwright/test';
import { FAST_CRUISE } from './cruise.ts';
import { dailySeed } from '../../src/game/lib/dailyStarSystem.ts';
import {
  startingMoon,
  knownBodies,
  launchHop,
  runEnd,
  score,
  startRun,
  type Body,
  type Run,
  type Score,
} from '../../src/game/sim/index.ts';
import { formatScore } from '../../src/ui/endOfRunView.ts';

// Spec #168's Daily Star System in real play, with the browser's date set to a known day: same seed
// for the day, a Daily Best kept for the day, a new Star System after 00:00 UTC. The clock is
// installed and left running (`setFixedTime` also freezes Phaser's frame time, so no Hop would fly).
const DAY = '2026-11-15';
const NEXT_DAY = '2026-11-16';
const NOON = '2026-11-15T12:00:00Z';
const JUST_AFTER_MIDNIGHT = '2026-11-16T00:00:30Z';

const run = startRun(dailySeed(DAY), 'scout');
const home = startingMoon(run.starSystem);
const nextHome = startingMoon(startRun(dailySeed(NEXT_DAY), 'scout').starSystem);

/**
 * The shortest run of Hops on the day's Star System that ends the Run: every Hop but the last
 * Arrives, through Bodies Comms has Detected, and the last Crashes or Falls Short. Since #189 a Run
 * opens knowing one Body, always In reach, so the end takes a few Hops. Launch settles every outcome
 * from the seed, so the test knows them before flying.
 */
function endingHops(): {
  arrivals: readonly Body[];
  last: Body;
  title: 'Crashed' | 'Fell Short';
  score: Score;
} {
  const search = (
    from: Run,
    arrivals: readonly Body[],
    depth: number,
  ): ReturnType<typeof endingHops> | undefined => {
    if (depth === 0 || from.status.kind !== 'landed') return undefined;
    const here = from.status.bodyId;
    for (const body of knownBodies(from)) {
      if (!body.landable || body.id === here) continue;
      const flown = launchHop(from, body.id);
      if (flown.kind !== 'flown') continue;
      const { kind } = flown.flight.outcome;
      if (kind === 'crashed' || kind === 'fell-short') {
        return {
          arrivals,
          last: body,
          title: kind === 'crashed' ? 'Crashed' : 'Fell Short',
          score: score(flown.run),
        };
      }
      if (kind !== 'arrived' || runEnd(flown.run)) continue;
      const deeper = search(flown.run, [...arrivals, body], depth - 1);
      if (deeper) return deeper;
    }
    return undefined;
  };
  for (const depth of [2, 3, 4]) {
    const found = search(run, [], depth);
    if (found) return found;
  }
  throw new Error(`The ${DAY} Daily Star System has no short run of Hops that ends the Run`);
}
const ending = endingHops();

/** Opens the Nav Chart, targets `name` and launches the Hop. */
async function hopTo(page: Page, name: string): Promise<void> {
  await page.getByRole('button', { name: /Nav Chart/ }).click();
  await expect(page.getByRole('dialog', { name: 'Nav Chart' })).toBeVisible();
  await target(page, name);
  await page.getByRole('button', { name: 'Launch' }).click();
}

async function openTitle(page: Page, time: string, url = `/?${FAST_CRUISE}`): Promise<void> {
  await page.setViewportSize({ width: 640, height: 360 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.clock.install({ time: new Date(time) });
  await page.goto(url);
  await expect(page.getByRole('button', { name: 'Daily Star System' })).toBeVisible();
}

/** Steps through the Bodies until the inspector shows `name`; Enter makes it the target. */
async function target(page: Page, name: string): Promise<void> {
  const shown = page.getByRole('heading', { name, level: 2, exact: true });
  for (const key of ['PageDown', 'PageUp']) {
    for (let i = 0; i < 40 && !(await shown.isVisible()); i += 1) await page.keyboard.press(key);
  }
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('target')).toContainText(name);
}

test('the Daily Star System: the same Star System for the day, a Daily Best kept, and a new one after 00:00 UTC', async ({
  page,
}, testInfo) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));

  // 1. Nothing played yet.
  await openTitle(page, NOON);
  const line = page.getByTestId('title-daily-best');
  await expect(line).toHaveText(`Daily Star System ${DAY} UTC: not played yet`);
  await testInfo.attach('title-not-played', {
    body: await page.screenshot(),
    contentType: 'image/png',
  });

  // 2. Start it, pick the (default) Chassis: the Body the day's seed generates, and the Daily tag.
  await page.getByRole('button', { name: 'Daily Star System' }).click();
  await page.getByRole('button', { name: 'Launch' }).click();
  await expect(page.getByRole('heading', { name: home.name })).toBeVisible();
  await expect(page.getByTestId('game-ui')).toHaveAttribute(
    'data-run-seed',
    String(dailySeed(DAY)),
  );
  await expect(page.getByTestId('daily-tag')).toHaveText(`Daily ${DAY} UTC`);
  await testInfo.attach('daily-landed', {
    body: await page.screenshot(),
    contentType: 'image/png',
  });

  // 3. End the Run: the End-of-Run screen shows the Score against today's Daily Best, newly set.
  for (const body of ending.arrivals) {
    await hopTo(page, body.name);
    const arrived = page.getByRole('dialog', { name: 'Arrived' });
    await expect(arrived).toBeVisible({ timeout: 15_000 });
    await arrived.getByRole('button', { name: 'Continue' }).click();
    await expect(arrived).toBeHidden();
    await expect(page.getByTestId('daily-tag')).toHaveText(`Daily ${DAY} UTC`);
  }
  await hopTo(page, ending.last.name);
  const outcome = page.getByRole('alertdialog', { name: ending.title });
  await expect(outcome).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId('daily-tag')).toHaveText(`Daily ${DAY} UTC`);
  await outcome.getByRole('button', { name: 'Continue' }).click();
  const score = formatScore(ending.score);
  await expect(outcome.getByTestId('end-of-run-score')).toHaveAttribute(
    'aria-label',
    `Score: ${score}`,
  );
  await expect(outcome).toContainText('Today’s Daily Best');
  await expect(outcome.getByTestId('end-of-run-best')).toHaveAttribute(
    'aria-label',
    `Today’s Daily Best: ${score} (new Daily Best)`,
  );
  await testInfo.attach('daily-end', { body: await page.screenshot(), contentType: 'image/png' });

  // 4. Back to the title: the Daily line shows the Score.
  await outcome.getByRole('button', { name: 'Back to title' }).click();
  await expect(line).toHaveText(`Daily Star System ${DAY} UTC: ${score}`);
  await expect(page.getByTestId('title-best-score')).toHaveText(`Best Score: ${score}`);

  // 5. After 00:00 UTC, a reload: not played yet, and a different Daily Star System.
  await page.clock.setSystemTime(new Date(JUST_AFTER_MIDNIGHT));
  await page.reload();
  await expect(page.getByTestId('title-daily-best')).toHaveText(
    `Daily Star System ${NEXT_DAY} UTC: not played yet`,
  );
  await page.getByRole('button', { name: 'Daily Star System' }).click();
  await page.getByRole('button', { name: 'Launch' }).click();
  await expect(page.getByTestId('game-ui')).toHaveAttribute(
    'data-run-seed',
    String(dailySeed(NEXT_DAY)),
  );
  await expect(page.getByTestId('daily-tag')).toHaveText(`Daily ${NEXT_DAY} UTC`);
  expect(nextHome.name).not.toBe(home.name);
  await expect(page.getByRole('heading', { name: nextHome.name })).toBeVisible();
  expect(errors).toEqual([]);
});

test('the Daily Star System ignores a ?seed in the page URL, and New Run has no Daily tag', async ({
  page,
}) => {
  await openTitle(page, NOON, `/?seed=123&chassis=scout&${FAST_CRUISE}`);
  await page.getByRole('button', { name: 'Daily Star System' }).click();
  await expect(page.getByRole('heading', { name: home.name })).toBeVisible();
  await expect(page.getByTestId('game-ui')).toHaveAttribute(
    'data-run-seed',
    String(dailySeed(DAY)),
  );
  await expect(page.getByTestId('daily-tag')).toBeVisible();

  // A page opened with a seed in its URL plays an ordinary Run from New Run.
  await page.goto('/?seed=123&chassis=scout');
  await page.getByRole('button', { name: 'New Run' }).click();
  await expect(page.getByTestId('game-ui')).toHaveAttribute('data-run-seed', '123');
  await expect(page.getByTestId('daily-tag')).toHaveCount(0);
});
