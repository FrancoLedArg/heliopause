import { expect, test, type Page } from '@playwright/test';
import { formatDeltaV, formatPlanDeltaV } from '../../src/ui/format.ts';
import {
  availableDeltaV,
  COMPONENTS,
  install,
  startRun,
  STARTING_MATERIALS,
} from '../../src/game/sim/index.ts';

const SEED = 123;
const run = startRun(SEED, 'scout');
const home = run.starSystem.planets.find((p) => p.id === run.starSystem.homePlanetId);
const homeMoon = home?.moons[0];
if (!homeMoon) throw new Error(`Seed ${SEED} has no Home Planet Moon`);

// What the simulation says the cheapest Component does to this Spacecraft.
const cheapest = Object.values(COMPONENTS).reduce((a, b) => (a.cost <= b.cost ? a : b));
const installed = install(run, 2, cheapest.id);
if (installed.kind !== 'installed')
  throw new Error('The starting Materials should buy the cheapest');
const afterDeltaV = availableDeltaV(installed.run.spacecraft);

async function startRunLanded(page: Page): Promise<void> {
  await page.goto(`/?seed=${String(SEED)}&chassis=scout`);
  await page.getByRole('button', { name: 'New Run' }).click();
  await expect(page.getByRole('button', { name: 'Spacecraft' })).toBeVisible();
}

/** Tab until focus is on the button named `name`: how a keyboard player reaches a Component. */
async function tabTo(page: Page, name: RegExp): Promise<void> {
  for (let i = 0; i < 12; i += 1) {
    const label = await page.locator(':focus').getAttribute('aria-label');
    if (label !== null && name.test(label)) return;
    await page.keyboard.press('Tab');
  }
  throw new Error(`Tab never reached ${String(name)}`);
}

test('the cheapest Component can be installed with the starting Materials using only the keyboard, and the Hop plan follows', async ({
  page,
}, testInfo) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 640, height: 360 });
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await startRunLanded(page);
  await expect(page.getByTestId('materials')).toHaveText(String(STARTING_MATERIALS));
  await expect(page.getByTestId('delta-v')).toHaveText(
    formatDeltaV(availableDeltaV(run.spacecraft)),
  );

  const button = page.getByRole('button', { name: 'Spacecraft' });
  await button.focus();
  await page.keyboard.press('Enter');
  const panel = page.getByRole('dialog', { name: 'Spacecraft' });
  await expect(panel).toBeVisible();
  // It opens with focus on the first empty Slot, ready for the keyboard.
  await expect(panel.getByRole('radio', { name: /^Slot 3, empty/ })).toBeFocused();

  // The Components say what they cost and do, before anything is paid.
  await expect(panel).toContainText('Fuel Tank 1');
  await expect(panel).toContainText(`${String(cheapest.cost)} Materials`);
  await expect(panel).toContainText('Holds 21.0 t of Fuel.');

  await tabTo(page, /^Install Fuel Tank, level 1/);
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('install-status')).toContainText(
    `Installed Fuel Tank, level 1 in Slot 3. ${String(STARTING_MATERIALS - cheapest.cost)} Materials left.`,
  );
  await expect(page.getByRole('radio', { name: /^Slot 3, Fuel Tank, level 1/ })).toBeVisible();
  await expect(page.getByTestId('materials')).toHaveText(String(installed.run.materials));
  await expect(page.getByTestId('delta-v')).toHaveText(formatDeltaV(afterDeltaV));
  await expect(page.getByTestId('panel-delta-v')).toHaveText(formatDeltaV(afterDeltaV));
  await testInfo.attach('spacecraft-panel', {
    body: await page.screenshot(),
    contentType: 'image/png',
  });

  // An Engine now costs more than the Materials left: refused, with the reason in words.
  await tabTo(page, /^Install Engine, level 1/);
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('install-status')).toContainText(
    "Can't install. Not enough Materials: it costs 30 and you have 5, 25 short.",
  );

  // Escape closes it and focus goes back to the Spacecraft button.
  await page.keyboard.press('Escape');
  await expect(panel).toBeHidden();
  await expect(button).toBeFocused();
  // Escape closed the panel; it did not also open the Menu.
  await expect(page.getByRole('dialog', { name: 'Menu' })).toBeHidden();

  // The Hop plan reflects the new loadout.
  await page.keyboard.press('m');
  await expect(page.getByRole('dialog', { name: 'Nav Chart' })).toBeVisible();
  for (let i = 0; i < 40; i += 1) {
    if (await page.getByRole('heading', { name: homeMoon.name, level: 2 }).isVisible()) break;
    await page.keyboard.press('PageDown');
  }
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('plan-available')).toHaveText(formatPlanDeltaV(afterDeltaV));
  expect(errors).toEqual([]);
});

test('installing again is refused in words once the Materials run out', async ({ page }) => {
  await startRunLanded(page);
  await page.getByRole('button', { name: 'Spacecraft' }).click();
  // 25 Materials buy one Drill (25): the second Slot cannot be filled, and Install says why.
  await page.getByRole('button', { name: /^Install Drill, level 1/ }).click();
  await expect(page.getByTestId('install-status')).toContainText('Installed Drill, level 1');
  await page.getByRole('button', { name: /^Install Drill, level 1/ }).click();
  await expect(page.getByTestId('install-status')).toContainText(
    "Can't install. Not enough Materials",
  );
  await expect(page.getByTestId('install-target')).toContainText('Slot 4');
});
