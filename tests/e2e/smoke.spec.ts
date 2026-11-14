import { expect, test } from '@playwright/test';

test('the game boots to the title screen without errors', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });

  await page.goto('/');

  const canvas = page.locator('#game-container canvas');
  await expect(canvas).toBeVisible();
  // Give Phaser a few frames to render the Title scene.
  await page.waitForTimeout(500);

  // Canvas text is not in the DOM; the Title scene mirrors the build label onto the canvas.
  await expect(canvas).toHaveAttribute(
    'data-build-label',
    /^v\d+\.\d+\.\d+ · ([0-9a-f]{7}|unknown)$/,
  );

  await testInfo.attach('title-screen', {
    body: await page.screenshot(),
    contentType: 'image/png',
  });
  expect(errors).toEqual([]);
});
