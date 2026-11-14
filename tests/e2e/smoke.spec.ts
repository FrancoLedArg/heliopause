import { expect, test } from '@playwright/test';

test('the game boots to the title screen without errors', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });

  await page.goto('/');

  await expect(page.locator('#game-container canvas')).toBeVisible();
  // The build label pins the exact build in any screenshot of the title screen.
  await expect(page.getByText(/^v\d+\.\d+\.\d+ · ([0-9a-f]{7}|unknown)$/)).toBeVisible();

  await testInfo.attach('title-screen', {
    body: await page.screenshot(),
    contentType: 'image/png',
  });
  expect(errors).toEqual([]);
});
