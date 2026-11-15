import { expect, test } from '@playwright/test';
import { waitForOpening } from './opening.ts';
import {
  currentBody,
  DISCOVERIES,
  discoveriesOn,
  findBody,
  startRun,
  type DiscoveryId,
  type Run,
} from '../../src/game/sim/index.ts';

/** What a Camera installed on the Starting Moon reveals: its own Camera Discoveries and, from a Gas Giant's Moon, the Gas Giant's. */
function cameraFinds(run: Run): DiscoveryId[] {
  const moon = currentBody(run);
  const places = [moon.id];
  if (moon.kind === 'moon' && findBody(run.starSystem, moon.planetId)?.kind === 'gas-giant') {
    places.push(moon.planetId);
  }
  return places
    .flatMap((id) => discoveriesOn(run.starSystem, id))
    .filter((id) => DISCOVERIES[id].instrument === 'camera');
}

// The first fixed seed whose Starting Moon shows a Camera something.
const SEED = Array.from({ length: 200 }, (_, i) => i + 1).find(
  (seed) => cameraFinds(startRun(seed, 'scout')).length > 0,
);
if (SEED === undefined) throw new Error('No seed has a Camera Discovery at the start');
const finds = cameraFinds(startRun(SEED, 'scout'));
const [first] = finds;
if (!first) throw new Error('No Camera Discovery');
const total = finds.reduce((sum, id) => sum + DISCOVERIES[id].science, 0);

test('a Camera built on the Starting Moon reveals a Discovery, and the Science counter rises', async ({
  page,
}) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 640, height: 360 });
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(`/?seed=${String(SEED)}&chassis=scout`);
  await page.getByRole('button', { name: 'New Run' }).click();
  await waitForOpening(page);
  await expect(page.getByTestId('science')).toHaveAccessibleName('Science 0');

  await page.getByRole('button', { name: 'Spacecraft' }).click();
  await page.getByRole('button', { name: /^Install Camera/ }).click();
  await page.keyboard.press('Escape');

  const card = page.getByTestId('discovery-card');
  await expect(card).toBeVisible();
  await expect(card).toContainText(DISCOVERIES[first].name);
  await card.getByRole('button', { name: 'Tell me more' }).click();
  const source = card.getByRole('link', { name: 'Source: NASA' });
  await expect(source).toBeVisible();
  await expect(source).toHaveAttribute('target', '_blank');
  await expect(page.getByTestId('science')).toHaveAccessibleName(`Science ${String(total)}`);
  await page.screenshot({ path: test.info().outputPath('discovery-card.png') });
  expect(errors).toEqual([]);
});
