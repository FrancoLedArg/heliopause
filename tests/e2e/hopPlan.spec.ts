import { expect, test, type Page } from '@playwright/test';
import { FAST_CRUISE } from './cruise.ts';
import { waitForOpening } from './opening.ts';
import { firstDetectedBody, startRun } from '../../src/game/sim/index.ts';

// Re-pinned for #189 (was 305): a Run opens knowing one Body, always In reach, so a far Body takes
// a few landings to find. On seed 179, after the first target Hehaequan, then Dryspraes Tau and
// Querrelys, the way back to the Starting Moon, Thylthiolhiol, is far: a lancer reaches it at a low
// chance with some Margin, a hauler cannot reach it at all. Re-pinned for #247 (was seed 1442's
// Korxel, seen from Thosny): the Chassis Isp rose 30%, so a lancer makes that Hop for sure. The
// scout cannot reach it at all: the hauler could not either until #231 gave it a second Fuel Tank.
const SEED = 179;
const run = startRun(SEED, 'scout');
const homeMoon = firstDetectedBody(run.starSystem);
/** The Hops that Arrive on the way, every Chassis alike; the first is the first target. */
const PATH = ['Hehaequan', 'Dryspraes Tau', 'Querrelys'] as const;
const FAR = 'Thylthiolhiol';
/** Another Body known on Querrelys: Lycio, a sure Hop for a lancer. */
const NEAR = 'Lycio';

async function openNavChart(page: Page, chassis = 'scout'): Promise<void> {
  // The fast Cruise (#246): two tests fly the first Hop before the far Body is known (#189).
  await page.goto(`/?seed=${String(SEED)}&chassis=${chassis}&${FAST_CRUISE}`);
  await page.getByRole('button', { name: 'New Run' }).click();
  await waitForOpening(page);
  await page.getByRole('button', { name: /Nav Chart/ }).click();
  await expect(page.getByRole('dialog', { name: 'Nav Chart' })).toBeVisible();
}

/** A New Run on `chassis` that lands on every Body of PATH, then opens the Nav Chart there. */
async function openNavChartAfterPath(page: Page, chassis: string): Promise<void> {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openNavChart(page, chassis);
  for (const [i, name] of PATH.entries()) {
    if (i > 0) await page.getByRole('button', { name: /Nav Chart/ }).click();
    await target(page, name);
    await page.getByRole('button', { name: 'Launch' }).click();
    const report = page.getByRole('dialog', { name: 'Arrived' });
    await expect(report).toBeVisible({ timeout: 20_000 });
    await report.getByRole('button', { name: 'Continue' }).click();
    await expect(report).toBeHidden();
  }
  await page.getByRole('button', { name: /Nav Chart/ }).click();
  await expect(page.getByRole('dialog', { name: 'Nav Chart' })).toBeVisible();
}

/**
 * Steps through the Bodies (PageDown, then back with PageUp: they do not wrap, and the first target
 * can sit before the Starting Moon) until the inspector shows `name`; Enter makes it the target.
 */
async function target(page: Page, name: string): Promise<void> {
  const shown = page.getByRole('heading', { name, level: 2, exact: true });
  for (const key of ['PageDown', 'PageUp']) {
    for (let i = 0; i < 40 && !(await shown.isVisible()); i += 1) await page.keyboard.press(key);
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

test('the Hop plan for the first target shows Success Chance, a Δv bar of three Burns and the Fuel after', async ({
  page,
}, testInfo) => {
  await openNavChart(page);
  // #193: the chart opens on the map alone; the plan comes only after a Body's "Plan Hop".
  await expect(page.getByTestId('hop-plan')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Launch' })).toHaveCount(0);

  await target(page, homeMoon.name);
  // One Δv bar, in km/s like the top bar, with a segment for each Burn and the Margin as the gap.
  // The first target is Unsurveyed, so its Landing is hatched and named a guess (#193).
  const bar = page.getByRole('img', { name: /^Δv: / });
  await expect(bar).toHaveAccessibleName(
    /^Δv: Takeoff \d+\.\d{1,2} km\/s, Transfer \d+\.\d{1,2} km\/s, Landing \d+\.\d{1,2} km\/s\. Needs \d+\.\d{1,2} of 28\.8 km\/s, Margin \+\d+\.\d{1,2} km\/s\. Landing is a guess, Unsurveyed\.$/,
  );
  await expect(page.getByTestId('plan-available')).toHaveText('28.8 km/s');
  await expect(page.getByTestId('delta-v')).toHaveText('28.8 km/s');
  // The Margin is bigger than the estimate, so it shows plain Δv, with no percentage.
  await expect(page.getByTestId('plan-margin')).toHaveText(/^\+\d+\.\d{1,2} km\/s$/);
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
  // Three Hops of playback on a loaded machine.
  test.setTimeout(120_000);
  await openNavChartAfterPath(page, 'lancer');
  await target(page, NEAR);
  const nearPercent = await percentOf(page);

  await target(page, FAR);
  const farPercent = await percentOf(page);
  expect(farPercent).toBeLessThan(nearPercent);
  // Seed 179's Thylthiolhiol is 57% for the lancer from Querrelys: below the low-chance line, with a
  // thin Margin.
  // The reach verdict (#190): a triangle and "Marginal", named for assistive technology.
  await expect(page.getByTestId('plan-warning')).toHaveText('Marginal');
  await expect(page.getByTestId('plan-warning')).toHaveAttribute('aria-label', 'Reach: Marginal');
  await expect(page.getByTestId('plan-margin')).toHaveText(/^\+\d+\.\d{1,2} km\/s \(\d+%\)$/);
  await testInfo.attach('hop-plan-far', {
    body: await page.screenshot(),
    contentType: 'image/png',
  });

  await page.getByRole('button', { name: 'Cancel' }).click();
  // #193: with no target the plan closes and leaves the map alone.
  await expect(page.getByTestId('target')).toHaveCount(0);
  await expect(page.getByRole('listbox', { name: 'Bodies in the Star System' })).toBeFocused();
  await expect(page.getByTestId('hop-plan')).toHaveCount(0);
  await expect(page.getByRole('dialog', { name: 'Nav Chart' })).toBeVisible();
});

test('Tab reaches Cancel and Launch from the chart, then Tell me more and the "?", and Launch is available at any chance', async ({
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
  const more = page.getByRole('button', { name: 'Tell me more' });
  await expect(more).toBeFocused();
  // Space opens it, and it says so.
  await page.keyboard.press(' ');
  await expect(more).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByTestId('burn-reason').first()).toBeVisible();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'What is Δv?' })).toBeFocused();
  // #193: then the chart's bar (zoom, re-centre, legend, Close), and round to the map.
  for (const name of ['Zoom out', 'Zoom in', 'Re-centre on the Spacecraft', 'Chart legend']) {
    await page.keyboard.press('Tab');
    await expect(page.getByRole('button', { name })).toBeFocused();
  }
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Close' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('listbox', { name: 'Bodies in the Star System' })).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(page.getByRole('button', { name: 'Close' })).toBeFocused();
});

test('a Margin below zero is signed and warned about more strongly than a low chance', async ({
  page,
}) => {
  // Three Hops of playback on a loaded machine.
  test.setTimeout(120_000);
  await openNavChartAfterPath(page, 'scout');
  await target(page, FAR);
  await expect(page.getByTestId('plan-margin')).toHaveText(/^−\d+\.\d{1,2} km\/s \(\d+%\)$/);
  // Out of reach (#190): a cross and the word, exactly 0%.
  await expect(page.getByTestId('plan-warning')).toHaveText('Out of reach');
  await expect(page.getByTestId('plan-warning')).toHaveAttribute(
    'aria-label',
    'Reach: Out of reach',
  );
  await expect(page.getByTestId('plan-success')).toContainText('0%');
});
