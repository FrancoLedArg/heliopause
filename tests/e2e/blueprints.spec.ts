import { expect, test, type Page } from '@playwright/test';
import { waitForOpening } from './opening.ts';
import {
  BLUEPRINT_THRESHOLDS,
  currentBody,
  DISCOVERIES,
  discoveriesOn,
  startRun,
} from '../../src/game/sim/index.ts';

const KEY = 'heliopause:science-progress';

// The first fixed seed whose Starting Moon itself shows a Camera something.
const SEED = Array.from({ length: 200 }, (_, i) => i + 1).find((seed) => {
  const run = startRun(seed, 'scout');
  return discoveriesOn(run.starSystem, currentBody(run).id).some(
    (id) => DISCOVERIES[id].instrument === 'camera',
  );
});
if (SEED === undefined) throw new Error('No seed has a Camera Discovery on its Starting Moon');

async function openCatalogue(page: Page): Promise<void> {
  await page.goto(`/?seed=${String(SEED)}&chassis=scout`);
  await page.getByRole('button', { name: 'New Run' }).click();
  await waitForOpening(page);
  await page.getByRole('button', { name: 'Spacecraft' }).click();
}

const row = (page: Page, name: string) =>
  page.getByTestId('component-row').filter({ hasText: name });

test('with empty storage the Sample lab is locked behind a Science bar', async ({ page }) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 640, height: 360 });
  await openCatalogue(page);
  const lab = row(page, 'Sample lab');
  await lab.scrollIntoViewIfNeeded();
  await expect(lab.getByTestId('blueprint-progress')).toBeVisible();
  await expect(lab.getByTestId('blueprint-progress')).toContainText(
    String(BLUEPRINT_THRESHOLDS['sample-lab']),
  );
  await lab.getByRole('button', { name: /^Install Sample lab/ }).click();
  await expect(page.getByTestId('install-status')).toContainText('Locked');
  await page.screenshot({ path: test.info().outputPath('locked-row.png') });
});

test('with Science preloaded past the first threshold the Sample lab is buildable from the start', async ({
  page,
}) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 640, height: 360 });
  const stored = JSON.stringify(JSON.stringify({ lifetimeScience: 50, discoveries: {} }));
  await page.addInitScript(`window.localStorage.setItem('${KEY}', ${stored})`);
  await openCatalogue(page);
  await expect(row(page, 'Sample lab').getByTestId('blueprint-progress')).toHaveCount(0);
  await expect(row(page, 'Drill 3').getByTestId('blueprint-progress')).toContainText(
    String(BLUEPRINT_THRESHOLDS['drill-3'] - 50),
  );
});

test('Science made in a Run is kept across a reload', async ({ page }) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 640, height: 360 });
  await openCatalogue(page);
  await page.getByRole('button', { name: /^Install Camera/ }).click();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('discovery-card')).toBeVisible();
  const kept: unknown = await page.evaluate(`window.localStorage.getItem('${KEY}')`);
  const science =
    (JSON.parse(typeof kept === 'string' ? kept : '{}') as { lifetimeScience?: number })
      .lifetimeScience ?? 0;
  expect(science).toBeGreaterThan(0);

  await page.reload();
  await page.getByRole('button', { name: 'New Run' }).click();
  await waitForOpening(page);
  await page.getByRole('button', { name: 'Spacecraft' }).click();
  await expect(row(page, 'Sample lab').getByTestId('blueprint-progress')).toContainText(
    String(Math.max(0, BLUEPRINT_THRESHOLDS['sample-lab'] - science)),
  );
});
