import { expect, test, type Page } from '@playwright/test';
import { firstDetectedBody, startRun } from '../../src/game/sim/index.ts';

// Re-pinned for #189 (was 305): a Run opens knowing one Body, always In reach, so the far Body is
// the one Comms Detects after the first landing. On seed 1442 that is Korxel, seen from Thosny: a
// lancer reaches it at a low chance with some Margin, a hauler cannot reach it at all.
const SEED = 1442;
const run = startRun(SEED, 'scout');
const homeMoon = firstDetectedBody(run.starSystem);
const FAR = 'Korxel';
/** The other Body known on Thosny: the Starting Moon, Xylxen, a sure Hop for a lancer. */
const NEAR = 'Xylxen';

async function openNavChart(page: Page, chassis = 'scout'): Promise<void> {
  await page.goto(`/?seed=${String(SEED)}&chassis=${chassis}`);
  await page.getByRole('button', { name: 'New Run' }).click();
  await page.getByRole('button', { name: /Nav Chart/ }).click();
  await expect(page.getByRole('dialog', { name: 'Nav Chart' })).toBeVisible();
}

/** A New Run on `chassis` that lands on its first target, then opens the Nav Chart there. */
async function openNavChartAfterFirstHop(page: Page, chassis: string): Promise<void> {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openNavChart(page, chassis);
  await target(page, homeMoon.name);
  await page.getByRole('button', { name: 'Launch' }).click();
  const report = page.getByRole('dialog', { name: 'Arrived' });
  await expect(report).toBeVisible({ timeout: 20_000 });
  await report.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: /Nav Chart/ }).click();
  await expect(page.getByRole('dialog', { name: 'Nav Chart' })).toBeVisible();
}

/** Presses PageDown until the inspector shows `name`, then Enter makes it the target. */
async function target(page: Page, name: string): Promise<void> {
  for (let i = 0; i < 40; i += 1) {
    if (await page.getByRole('heading', { name, level: 2 }).isVisible()) break;
    await page.keyboard.press('PageDown');
  }
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('target')).toContainText(name);
}

const percentOf = async (page: Page): Promise<number> => {
  const text = (await page.getByTestId('plan-success').textContent()) ?? '';
  const match = /(\d+)%/.exec(text);
  if (!match?.[1]) throw new Error(`no percent in "${text}"`);
  return Number(match[1]);
};

test('the Hop plan for the first target shows three Burns, totals and a Success Chance', async ({
  page,
}, testInfo) => {
  await openNavChart(page);
  await expect(page.getByTestId('hop-plan')).toContainText('Pick a landable Body');
  await expect(page.getByRole('button', { name: 'Launch' })).toBeDisabled();

  await target(page, homeMoon.name);
  const plan = page.getByTestId('hop-plan');
  for (const burn of ['Takeoff', 'Transfer', 'Landing']) {
    await expect(plan.getByRole('row', { name: new RegExp(`${burn} .* m/s`) })).toBeVisible();
  }
  await expect(page.getByTestId('plan-needed')).toContainText('m/s');
  await expect(page.getByTestId('plan-available')).toContainText('m/s');
  await expect(page.getByTestId('plan-basis')).toContainText('t craft + ');
  await expect(page.getByTestId('plan-basis')).toContainText('Fuel');
  // The Margin is bigger than the estimate, so it shows plain Δv, with no percentage.
  await expect(page.getByTestId('plan-margin')).toHaveText(/^\+[\d,]+ m\/s$/);
  await expect(page.getByTestId('plan-explain')).toContainText(
    'Δv is how much your speed can change',
  );
  // Each Burn says why it costs what it does, from the Bodies' own properties.
  const reasons = page.getByTestId('burn-reason');
  await expect(reasons).toHaveCount(3);
  await expect(reasons.nth(0)).toContainText('leave');
  await expect(reasons.nth(1)).toHaveText("stay in one planet's pull");
  await expect(reasons.nth(2)).toContainText('land in');
  await expect(page.getByTestId('plan-summary')).toContainText(`Hop plan for ${homeMoon.name}`);
  expect(await percentOf(page)).toBeGreaterThan(0);
  await testInfo.attach('hop-plan-moon', {
    body: await page.screenshot(),
    contentType: 'image/png',
  });
});

test('a far Body has a lower Success Chance, flagged in words when low; Cancel clears and another target updates', async ({
  page,
}, testInfo) => {
  test.setTimeout(60_000);
  await openNavChartAfterFirstHop(page, 'lancer');
  await target(page, NEAR);
  const nearPercent = await percentOf(page);

  await target(page, FAR);
  const farPercent = await percentOf(page);
  expect(farPercent).toBeLessThan(nearPercent);
  // Seed 1442's Korxel is 61% for the lancer from Thosny: below the low-chance line, with a thin
  // Margin.
  await expect(page.getByTestId('plan-warning')).toHaveText('Low chance: may run dry');
  await expect(page.getByTestId('plan-margin')).toHaveText(/^\+[\d,]+ m\/s \(\d+%\)$/);
  await testInfo.attach('hop-plan-far', {
    body: await page.screenshot(),
    contentType: 'image/png',
  });

  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByTestId('target')).toContainText('None chosen');
  await expect(page.getByRole('listbox', { name: 'Bodies in the Star System' })).toBeFocused();
  await expect(page.getByTestId('hop-plan')).toContainText('Pick a landable Body');
  await expect(page.getByRole('dialog', { name: 'Nav Chart' })).toBeVisible();
});

test('Tab reaches Cancel and Launch from the chart, and Launch is available at any chance', async ({
  page,
}) => {
  await openNavChart(page);
  await target(page, homeMoon.name);
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Cancel' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Launch' })).toBeFocused();
  await expect(page.getByRole('button', { name: 'Launch' })).toBeEnabled();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('listbox', { name: 'Bodies in the Star System' })).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(page.getByRole('button', { name: 'Launch' })).toBeFocused();
});

test('a Margin below zero is signed and warned about more strongly than a low chance', async ({
  page,
}) => {
  test.setTimeout(60_000);
  await openNavChartAfterFirstHop(page, 'hauler');
  await target(page, FAR);
  await expect(page.getByTestId('plan-margin')).toHaveText(/^−[\d,]+ m\/s \(\d+%\)$/);
  await expect(page.getByTestId('plan-warning')).toHaveText('Not enough Δv for this Hop');
  await expect(page.getByTestId('plan-success')).toContainText('0%');
});
