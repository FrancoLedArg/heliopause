import { expect, test } from '@playwright/test';
import { waitForOpening } from './opening.ts';

// Spec #288, #290: a fresh device sees the first-landing hint over the Nav Chart button; once it is
// dismissed it never returns, not even after a reload.
test('the first-landing hint shows on a fresh device and never returns once dismissed', async ({
  page,
}) => {
  await page.goto('/?seed=123&chassis=scout');
  await page.getByRole('button', { name: 'New Run' }).click();
  await expect(page.getByTestId('landed-kind')).toBeVisible();
  await waitForOpening(page);

  // Other hints (the first gathering's) may follow it; this one is what must never come back.
  const hint = page.locator('[data-hint="first-landing"]');
  await expect(page.getByTestId('first-run-hint')).toHaveText('Plan your next Hop');
  await expect(page.getByTestId('first-run-hint-live')).toHaveAttribute('aria-live', 'polite');

  await page.keyboard.press('Escape');
  await expect(hint).toHaveCount(0);

  await page.reload();
  await page.getByRole('button', { name: 'New Run' }).click();
  await expect(page.getByTestId('landed-kind')).toBeVisible();
  await waitForOpening(page);
  await expect(hint).toHaveCount(0);
});
