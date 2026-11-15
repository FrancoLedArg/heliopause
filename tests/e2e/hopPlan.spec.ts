import { expect, test, type Page } from '@playwright/test';
import { listBodies, planHop, startRun } from '../../src/game/sim/index.ts';

// Re-pinned for #188 (was 123): since generation changed, few seeds have a Body a new scout
// reaches at a low chance yet with some Margin, and a new hauler cannot reach.
const SEED = 305;
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

async function openNavChart(page: Page, chassis = 'scout'): Promise<void> {
  await page.goto(`/?seed=${SEED}&chassis=${chassis}`);
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

test('the Hop plan for the Home Planet Moon shows Success Chance, a Δv bar of three Burns and the Fuel after', async ({
  page,
}, testInfo) => {
  await openNavChart(page);
  await expect(page.getByTestId('hop-plan')).toContainText('Pick a target');
  await expect(page.getByRole('button', { name: 'Launch' })).toBeDisabled();

  await target(page, homeMoon.name);
  // One Δv bar, in km/s like the top bar, with a segment for each Burn and the Margin as the gap.
  const bar = page.getByRole('img', { name: /^Δv: / });
  await expect(bar).toHaveAccessibleName(
    /^Δv: Takeoff \d+\.\d km\/s, Transfer \d+\.\d km\/s, Landing \d+\.\d km\/s\. Needs \d+\.\d of 22\.1 km\/s, Margin \+\d+\.\d km\/s\.$/,
  );
  await expect(page.getByTestId('plan-available')).toHaveText('22.1 km/s');
  await expect(page.getByTestId('delta-v')).toHaveText('22.1 km/s');
  // The Margin is bigger than the estimate, so it shows plain Δv, with no percentage.
  await expect(page.getByTestId('plan-margin')).toHaveText(/^\+\d+\.\d km\/s$/);
  await expect(page.getByRole('img', { name: /^Fuel: 21\.0 t now, / })).toBeVisible();
  // The Δv help is behind the "?" in the chart's title bar.
  await expect(page.getByTestId('plan-explain')).toBeHidden();
  await page.getByRole('button', { name: 'What is Δv?' }).click();
  await expect(page.getByTestId('plan-explain')).toContainText(
    'Δv is how much your speed can change',
  );
  // Each Burn's reason and the mass behind the Δv are behind "Tell me more".
  const reasons = page.getByTestId('burn-reason');
  await expect(reasons.first()).toBeHidden();
  await page.getByRole('button', { name: 'Tell me more' }).click();
  await expect(page.getByTestId('plan-basis')).toContainText('t craft + ');
  await expect(page.getByTestId('plan-basis')).toContainText('Fuel');
  // Each Burn says why it costs what it does, from the Bodies' own properties.
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
  await openNavChart(page);
  await target(page, homeMoon.name);
  const moonPercent = await percentOf(page);

  await target(page, far.body.name);
  const farPercent = await percentOf(page);
  expect(far.chance).toBeLessThan(moonChance);
  expect(farPercent).toBeLessThan(moonPercent);
  // Seed 305's Virys is 69.7% for the scout (shown as 70%): below the low-chance line, with a
  // thin Margin.
  expect(far.body.name).toBe('Virys');
  await expect(page.getByTestId('plan-warning')).toHaveText('Low chance: may run dry');
  await expect(page.getByTestId('plan-margin')).toHaveText(/^\+\d+\.\d km\/s \(\d+%\)$/);
  await testInfo.attach('hop-plan-far', {
    body: await page.screenshot(),
    contentType: 'image/png',
  });

  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByTestId('target')).toContainText('None chosen');
  await expect(page.getByRole('listbox', { name: 'Bodies in the Star System' })).toBeFocused();
  await expect(page.getByTestId('hop-plan')).toContainText('Pick a target');
  await expect(page.getByRole('dialog', { name: 'Nav Chart' })).toBeVisible();
});

test('Tab reaches Cancel and Launch from the chart, then Tell me more and the "?", and Launch is available at any chance', async ({
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
  const more = page.getByRole('button', { name: 'Tell me more' });
  await expect(more).toBeFocused();
  // Space opens it, and it says so.
  await page.keyboard.press(' ');
  await expect(more).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByTestId('burn-reason').first()).toBeVisible();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'What is Δv?' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('listbox', { name: 'Bodies in the Star System' })).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(page.getByRole('button', { name: 'What is Δv?' })).toBeFocused();
});

test('a Margin below zero is signed and warned about more strongly than a low chance', async ({
  page,
}) => {
  await openNavChart(page, 'hauler');
  await target(page, 'Virys');
  await expect(page.getByTestId('plan-margin')).toHaveText(/^−\d+\.\d km\/s \(\d+%\)$/);
  await expect(page.getByTestId('plan-warning')).toHaveText('Not enough Δv for this Hop');
  await expect(page.getByTestId('plan-success')).toContainText('5%');
});
