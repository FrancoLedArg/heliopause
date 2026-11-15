import { expect, test } from '@playwright/test';
import { generateStarSystem, startingMoon } from '../../src/game/sim/index.ts';

test('the in-Run Menu leads back to the title, and a New Run works again', async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/?seed=123&chassis=scout');
  await page.getByRole('button', { name: 'New Run' }).click();
  const home = startingMoon(generateStarSystem(123));
  await expect(page.getByRole('heading', { name: home.name })).toBeVisible();

  await page.keyboard.press('Escape');
  const menu = page.getByRole('dialog');
  await expect(menu).toBeVisible();
  await expect(page.getByRole('button', { name: 'Resume' })).toBeFocused();
  await expect(page.getByText('AI-generated art')).toBeVisible();
  await testInfo.attach('menu', { body: await page.screenshot(), contentType: 'image/png' });

  // Esc toggles; Resume gives focus back.
  await page.keyboard.press('Escape');
  await expect(menu).toBeHidden();
  await page.getByRole('button', { name: 'Menu' }).click();
  await page.getByRole('button', { name: 'Resume' }).click();
  await expect(menu).toBeHidden();
  await expect(page.getByRole('button', { name: 'Menu' })).toBeFocused();

  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Back to title' }).click();
  await expect(page.getByText("Leave this Run? It can't be resumed.")).toBeVisible();
  await testInfo.attach('confirm', { body: await page.screenshot(), contentType: 'image/png' });

  // Stay returns to the Menu; Leave goes to the title with the Run cleared.
  await page.getByRole('button', { name: 'Stay' }).click();
  await expect(page.getByRole('button', { name: 'Resume' })).toBeVisible();
  await page.getByRole('button', { name: 'Back to title' }).click();
  await page.getByRole('button', { name: 'Leave' }).click();

  const newRun = page.getByRole('button', { name: 'New Run' });
  await expect(newRun).toBeVisible();
  await expect(newRun).toBeFocused();
  await expect(page.getByTestId('game-ui')).not.toHaveAttribute('data-run-seed', /.+/);
  await expect(page.getByText('AI-generated art')).toBeVisible();

  await newRun.click();
  await expect(page.getByRole('heading', { name: home.name })).toBeVisible();
  await expect(page.getByTestId('game-ui')).toHaveAttribute('data-run-seed', '123');
  expect(errors).toEqual([]);
});

test('Tab stays inside the open Menu', async ({ page }) => {
  await page.goto('/?seed=5&chassis=scout');
  await page.getByRole('button', { name: 'New Run' }).click();
  await expect(page.getByTestId('fuel')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Resume' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Back to title' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Resume' })).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(page.getByRole('button', { name: 'Back to title' })).toBeFocused();
});
