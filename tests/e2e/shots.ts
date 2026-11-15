import type { Page } from '@playwright/test';

/**
 * Starts recording, every frame, each shot the HUD names (its `data-shot`), in order and once each;
 * `shotsSeen` reads the record back. The playback runs on its own clock, so polling from the test
 * could miss a short shot.
 */
export async function recordShots(page: Page): Promise<void> {
  // A script in the page (the e2e project has no DOM types).
  await page.evaluate(`(() => {
    const seen = [];
    window.shotsSeen = seen;
    const look = () => {
      const shot = document.querySelector('[data-shot]')?.getAttribute('data-shot');
      if (shot && seen.at(-1) !== shot) seen.push(shot);
      requestAnimationFrame(look);
    };
    look();
  })()`);
}

/** The shots `recordShots` has seen so far, in order. */
export const shotsSeen = (page: Page): Promise<unknown> => page.evaluate('window.shotsSeen');
