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

test('the title screen links a favicon that the server serves', async ({ page }) => {
  await page.goto('/');

  const icon = page.locator('link[rel~="icon"]');
  await expect(icon).toHaveCount(1);
  const href = (await icon.getAttribute('href')) ?? '';
  const response = await page.request.get(new URL(href, page.url()).toString());
  // A missing file would still get 200: the preview server's SPA fallback answers with index.html.
  // The content-type check below is what proves the icon itself is served.
  expect(response.status()).toBe(200);
  expect(response.headers()['content-type']).toContain('image/svg+xml');
});
