import { expect, test, type Page } from '@playwright/test';
import { assessStranding, runEnd } from '../../src/game/sim/index.ts';
import { landing, SAVE_BY_REMOVING, STRANDED_ON_LANDING } from '../../src/ui/landingFixtures.ts';

// Spec #15's Stranded, in real play from a seed: a Hop that Arrives where no change could ever give
// a Hop a chance ends the Run; one that a lighter Spacecraft could leave warns instead.
// Since #189 a Run opens knowing one Body, always In reach, so both take a few Hops through what
// Comms Detects on the way.
const strandedLanding = landing(STRANDED_ON_LANDING.seed, STRANDED_ON_LANDING.path);
const strandedVerdict = runEnd(strandedLanding.run);
if (strandedVerdict?.kind !== 'stranded')
  throw new Error(`Seed ${String(STRANDED_ON_LANDING.seed)} should strand at the end of its path`);
const saveable = landing(SAVE_BY_REMOVING.seed, SAVE_BY_REMOVING.path, SAVE_BY_REMOVING.fit);
const warning = assessStranding(saveable.run);
if (warning.kind !== 'warning')
  throw new Error(`Seed ${String(SAVE_BY_REMOVING.seed)} with a Drill should warn at the end`);

async function startRun(page: Page, seed: number): Promise<void> {
  await page.setViewportSize({ width: 640, height: 360 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(`/?seed=${String(seed)}&chassis=scout`);
  await page.getByRole('button', { name: 'New Run' }).click();
  await expect(page.getByRole('button', { name: /Nav Chart/ })).toBeVisible();
}

/** Hops through every Body of `path` but the last, closing each Arrived report. */
async function hopAlong(page: Page, path: readonly string[]): Promise<void> {
  for (const name of path.slice(0, -1)) {
    await hopTo(page, name);
    const report = page.getByRole('dialog', { name: 'Arrived' });
    await expect(report).toBeVisible({ timeout: 30_000 });
    await report.getByRole('button', { name: 'Continue' }).click();
    await expect(report).toBeHidden();
  }
}

/** The last Body of a fixture's path. */
const last = (path: readonly string[]): string => path.at(-1) ?? '';

/** Opens the Nav Chart, targets `name` and launches the Hop. */
async function hopTo(page: Page, name: string): Promise<void> {
  await page.getByRole('button', { name: /Nav Chart/ }).click();
  await expect(page.getByRole('dialog', { name: 'Nav Chart' })).toBeVisible();
  const shown = page.getByRole('heading', { name, level: 2, exact: true });
  for (const key of ['PageDown', 'PageUp']) {
    for (let i = 0; i < 40 && !(await shown.isVisible()); i += 1) await page.keyboard.press(key);
  }
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('target')).toContainText(name);
  await page.getByRole('button', { name: 'Launch' }).click();
}

test('a Run Stranded on Landing goes straight to the End-of-Run screen, which says why', async ({
  page,
}, testInfo) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await startRun(page, STRANDED_ON_LANDING.seed);
  await hopAlong(page, STRANDED_ON_LANDING.path);
  await hopTo(page, last(STRANDED_ON_LANDING.path));

  const end = page.getByRole('alertdialog', { name: 'Stranded' });
  await expect(end).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('end-of-run-why')).toHaveText(strandedVerdict.reason);
  await expect(page.getByTestId('end-of-run-score')).toHaveText(
    '0 Star Systems escaped, 3 Hops flown',
  );
  // There was no failed Hop to report: no Hop report, and nothing to plan with.
  await expect(page.getByTestId('hop-report')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Nav Chart/ })).toHaveCount(0);
  await expect(end.getByRole('button', { name: 'New Run' })).toBeFocused();
  await testInfo.attach('stranded', { body: await page.screenshot(), contentType: 'image/png' });
  expect(errors).toEqual([]);
});

test('a Run that removing a Component would save warns in words, and the warning goes once it is removed', async ({
  page,
}, testInfo) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await startRun(page, SAVE_BY_REMOVING.seed);
  await expect(page.getByTestId('stranded-warning')).toHaveCount(0);

  // A Drill on the Starting Moon, then the Hops to the fixture's Body.
  await page.getByRole('button', { name: 'Spacecraft' }).click();
  await page.getByRole('button', { name: /^Install Drill, level 1/ }).click();
  await expect(page.getByTestId('install-status')).toContainText('Installed Drill, level 1');
  await page.keyboard.press('Escape');
  await hopAlong(page, SAVE_BY_REMOVING.path);
  await hopTo(page, last(SAVE_BY_REMOVING.path));
  const report = page.getByRole('dialog', { name: 'Arrived' });
  await expect(report).toBeVisible({ timeout: 30_000 });
  await report.getByRole('button', { name: 'Continue' }).click();

  const shown = page.getByTestId('stranded-warning');
  await expect(shown).toBeVisible();
  await expect(shown.getByRole('heading', { name: 'No Hop possible' })).toBeVisible();
  await expect(page.getByTestId('stranded-advice')).toHaveText(warning.warning);
  await testInfo.attach('warning', { body: await page.screenshot(), contentType: 'image/png' });

  // Doing what it says: remove the Drill, and a Hop is possible again.
  await page.getByRole('button', { name: 'Spacecraft' }).click();
  const panel = page.getByRole('dialog', { name: 'Spacecraft' });
  await panel.getByRole('radio', { name: /^Slot 3, Drill, level 1/ }).click();
  await panel.getByRole('button', { name: 'Remove', exact: true }).click();
  await panel.getByRole('button', { name: 'Confirm remove' }).click();
  await expect(page.getByTestId('install-status')).toContainText('Removed Drill, level 1');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: /Nav Chart/ })).toBeVisible();
  await expect(page.getByTestId('stranded-warning')).toHaveCount(0);
  expect(errors).toEqual([]);
});
