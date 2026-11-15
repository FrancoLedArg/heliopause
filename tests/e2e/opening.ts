import { expect, type Page } from '@playwright/test';

/**
 * Waits out the gathering moment a New Run opens with (#189, #220): the Starting Moon's yield flows
 * into the top bar, and until it has, the first key or click only skips it. The top bar's live
 * region says what came aboard as it starts, and its icon stops pulsing once it is over. Under
 * reduced motion the moment resolves at once and nothing needs waiting for.
 */
export async function waitForOpening(page: Page): Promise<void> {
  // A string, so this Node-side file needs no DOM types.
  const reduced: unknown = await page.evaluate(
    "matchMedia('(prefers-reduced-motion: reduce)').matches",
  );
  if (reduced === true) return;
  await expect(page.getByTestId('top-bar-status')).not.toBeEmpty();
  await expect(page.locator('.top-bar__icon--filling')).toHaveCount(0);
}
