import { expect, test } from '@playwright/test';

test('title to How to play to Back restores focus to the button, keyboard only', async ({
  page,
}, testInfo) => {
  await page.goto('/?seed=5');
  await expect(page.getByRole('button', { name: 'New Run' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Daily Star System' })).toBeEnabled();
  await testInfo.attach('title', { body: await page.screenshot(), contentType: 'image/png' });

  // The first Tab lands on New Run, the next on Daily Star System, then How to play.
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'New Run' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Daily Star System' })).toBeFocused();
  await page.keyboard.press('Tab');
  const howToPlay = page.getByRole('button', { name: 'How to play' });
  await expect(howToPlay).toBeFocused();
  await page.keyboard.press('Enter');

  const panel = page.getByRole('region', { name: 'How to play' });
  await expect(panel).toBeVisible();
  await expect(panel.getByRole('heading', { name: 'Hop' })).toBeVisible();
  await expect(page.getByText('AI-generated art', { exact: true })).toBeVisible();
  await testInfo.attach('how-to-play', { body: await page.screenshot(), contentType: 'image/png' });

  await expect(page.getByRole('button', { name: 'Back' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(howToPlay).toBeFocused();
});
