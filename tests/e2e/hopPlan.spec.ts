import { expect, test, type Page } from '@playwright/test';
import { listBodies, planHop, startRun } from '../../src/game/sim/index.ts';
import { LOW_SUCCESS_BELOW } from '../../src/ui/hopPlanView.ts';

const SEED = 123;
const run = startRun(SEED, 'scout');
const home = run.starSystem.planets.find((p) => p.id === run.starSystem.homePlanetId);
const homeMoon = home?.moons[0];
if (!homeMoon) throw new Error(`Seed ${SEED} has no Home Planet Moon`);

/** The landable Body with the lowest Success Chance from the Home Planet: the "far Body". */
const far = listBodies(run.starSystem)
  .flatMap((body) => {
    const result = planHop(run, body.id);
    return result.kind === 'planned' ? [{ body, chance: result.plan.successChance }] : [];
  })
  .sort((a, b) => a.chance - b.chance)[0];
if (!far) throw new Error('no far Body');
const moonChance = (() => {
  const result = planHop(run, homeMoon.id);
  if (result.kind !== 'planned') throw new Error('Moon is not a target');
  return result.plan.successChance;
})();

async function openNavChart(page: Page): Promise<void> {
  await page.goto(`/?seed=${SEED}&chassis=scout`);
  await page.getByRole('button', { name: 'New Run' }).click();
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

test('the Hop plan for the Home Planet Moon shows three Burns, totals and a Success Chance', async ({
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
  await expect(page.getByTestId('plan-margin')).toContainText('%)');
  await expect(page.getByTestId('plan-explain')).toContainText(
    'Δv is how much your speed can change',
  );
  expect(await percentOf(page)).toBeGreaterThan(0);
  await testInfo.attach('hop-plan-moon', {
    body: await page.screenshot(),
    contentType: 'image/png',
  });
});

test('a far Body has a lower Success Chance, flagged in words when low; Cancel clears and another target updates', async ({
  page,
}, testInfo) => {
  await openNavChart(page);
  await target(page, homeMoon.name);
  const moonPercent = await percentOf(page);

  await target(page, far.body.name);
  const farPercent = await percentOf(page);
  expect(far.chance).toBeLessThan(moonChance);
  expect(farPercent).toBeLessThan(moonPercent);
  if (far.chance < LOW_SUCCESS_BELOW) {
    await expect(page.getByTestId('plan-warning')).toContainText('Low chance');
  } else {
    await expect(page.getByTestId('plan-warning')).toHaveCount(0);
  }
  await testInfo.attach('hop-plan-far', {
    body: await page.screenshot(),
    contentType: 'image/png',
  });

  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByTestId('target')).toContainText('None chosen');
  await expect(page.getByTestId('hop-plan')).toContainText('Pick a landable Body');
  await expect(page.getByRole('dialog', { name: 'Nav Chart' })).toBeVisible();
});

test('Tab reaches Cancel and Launch from the chart, and Launch is available at any chance', async ({
  page,
}) => {
  await openNavChart(page);
  await target(page, far.body.name);
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
