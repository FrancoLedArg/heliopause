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
  await page.goto('/?seed=123');

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
  await expect(page.getByText('Rocky planet')).toBeVisible();
  await expect(page.getByTestId('fuel')).toHaveText('8.0 t');
  await expect(page.getByTestId('delta-v')).toBeVisible();
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
  await page.goto('/?seed=7');
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
  await page.goto('/');
  await page.getByRole('button', { name: 'New Run' }).click();

  await expect(page.getByTestId('fuel')).toBeVisible();
  await expect(page.getByTestId('game-ui')).toHaveAttribute('data-run-seed', /^\d+$/);
});
