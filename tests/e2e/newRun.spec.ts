import { expect, test, type Page } from '@playwright/test';
import { generateStarSystem, homePlanet } from '../../src/game/sim/index.ts';

function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  return errors;
}

test('New Run from the title screen lands on the Home Planet, seeded from the URL', async ({
  page,
}, testInfo) => {
  const errors = collectErrors(page);
  await page.goto('/?seed=123&chassis=scout');

  const newRun = page.getByRole('button', { name: 'New Run' });
  await expect(newRun).toBeVisible();
  await expect(page.getByText('AI-generated art')).toBeVisible();
  await testInfo.attach('title-screen', {
    body: await page.screenshot(),
    contentType: 'image/png',
  });

  await newRun.click();

  const home = homePlanet(generateStarSystem(123));
  await expect(page.getByRole('heading', { name: home.name })).toBeVisible();
  await expect(page.getByText('Home Planet · Rocky')).toBeVisible();
  await expect(page.getByTestId('fuel')).toHaveText('21.0 t');
  // Scout: 1230 s Isp, 4 t dry + 21 t Fuel: 1230 × 9.80665 × ln(25 / 4) is about 22.1 km/s.
  await expect(page.getByTestId('delta-v')).toHaveText('22.1 km/s');
  await expect(page.getByTestId('game-ui')).toHaveAttribute('data-run-seed', '123');
  await expect(page.getByText('AI-generated art')).toBeVisible();
  await expect(newRun).toBeHidden();
  await testInfo.attach('landed', {
    body: await page.screenshot(),
    contentType: 'image/png',
  });
  expect(errors).toEqual([]);
});

test('New Run works from the keyboard and shows where focus is', async ({ page }) => {
  await page.goto('/?seed=7&chassis=scout');
  const newRun = page.getByRole('button', { name: 'New Run' });
  await expect(newRun).toBeVisible();

  await page.keyboard.press('Tab');
  await expect(newRun).toBeFocused();
  await expect(newRun).toHaveCSS('outline-style', 'solid');

  await page.keyboard.press('Enter');
  await expect(
    page.getByRole('heading', { name: homePlanet(generateStarSystem(7)).name }),
  ).toBeVisible();
  await expect(page.getByTestId('game-ui')).toHaveAttribute('data-run-seed', '7');
});

test('without a seed in the URL, New Run picks one at random', async ({ page }) => {
  await page.goto('/?chassis=scout');
  await page.getByRole('button', { name: 'New Run' }).click();

  await expect(page.getByTestId('fuel')).toBeVisible();
  await expect(page.getByTestId('game-ui')).toHaveAttribute('data-run-seed', /^\d+$/);
});

test('?chassis= in the URL skips the picker and lands on that Chassis', async ({
  page,
}, testInfo) => {
  await page.goto('/?seed=123&chassis=lancer');
  await page.getByRole('button', { name: 'New Run' }).click();

  await expect(page.getByTestId('fuel')).toHaveText('36.0 t');
  // Lancer: 1280 s Isp, 6 t dry + 36 t Fuel: 1280 × 9.80665 × ln(42 / 6) is about 24.4 km/s.
  await expect(page.getByTestId('delta-v')).toHaveText('24.4 km/s');
  await testInfo.attach('landed-lancer', {
    body: await page.screenshot(),
    contentType: 'image/png',
  });
});

test('the picker shows each Chassis and its numbers, and picking by keyboard starts the Run on it', async ({
  page,
}, testInfo) => {
  await page.goto('/?seed=5');
  await expect(page.getByRole('button', { name: 'New Run' })).toBeVisible();
  await page.keyboard.press('Tab');
  await page.keyboard.press('Enter');

  const picker = page.getByRole('region', { name: 'Choose a Chassis' });
  await expect(picker).toBeVisible();
  await expect(picker.getByRole('radio')).toHaveCount(3);
  await expect(picker.getByText('Dry mass')).toHaveCount(3);
  await expect(picker.getByText('4.0 t', { exact: true })).toBeVisible();
  await expect(picker.getByText('15.0 t', { exact: true })).toBeVisible();
  await expect(picker.getByText('66.0 t', { exact: true })).toBeVisible();
  await expect(picker.getByText('Selected')).toHaveCount(1);
  await expect(picker.getByText(/heavier craft gets less/)).toBeVisible();
  await testInfo.attach('picker', { body: await page.screenshot(), contentType: 'image/png' });

  // The first Chassis is focused and chosen; the arrow keys move the choice, Tab reaches Back then Launch.
  await expect(page.getByRole('radio', { name: /Scout/ })).toBeFocused();
  await expect(page.getByRole('radio', { name: /Scout/ })).toBeChecked();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('radio', { name: /Hauler/ })).toBeChecked();
  await expect(page.getByRole('radio', { name: /Hauler/ })).toHaveCount(1);
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Back' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Launch' })).toBeFocused();
  await page.keyboard.press('Enter');

  await expect(page.getByTestId('fuel')).toHaveText('66.0 t');
  // Hauler: 1210 s Isp, 15 t dry + 66 t Fuel: 1210 × 9.80665 × ln(81 / 15) is about 20.0 km/s.
  await expect(page.getByTestId('delta-v')).toHaveText('20.0 km/s');
});

test('Back from the picker returns focus to New Run', async ({ page }) => {
  await page.goto('/?seed=5');
  const newRun = page.getByRole('button', { name: 'New Run' });
  await expect(newRun).toBeVisible();
  await newRun.click();
  await page.getByRole('button', { name: 'Back' }).click();
  await expect(newRun).toBeFocused();
});
