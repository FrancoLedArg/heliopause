import { expect, test, type Page } from '@playwright/test';
import { firstDetectedBody, startRun } from '../../src/game/sim/index.ts';
import { waitForOpening } from './opening.ts';

// The first playable Cruise (#250): a fixed seed with a Fuel leak injected 4 s into every Cruise
// (`?cruiseLeak=`, test only), the Cruise played 12 times faster (10 s), so there is time to react.
test.describe.configure({ timeout: 60_000 });

const SEED = 2026;
const TARGET = firstDetectedBody(startRun(SEED, 'scout').starSystem).name;
const URL = `/?seed=${String(SEED)}&chassis=scout&cruiseSpeed=12&cruiseLeak=40`;

/** From the title: a New Run, its first Hop launched; resolves once the leak has struck. */
async function launchIntoLeak(page: Page): Promise<void> {
  await launch(page, URL);
  await expect(leakingLight(page)).toBeVisible({ timeout: 15_000 });
}

/** A Damaged part's rect in the canvas's own 640x360 pixels (the scene's test hook). */
interface Part {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** Where the Damaged parts are drawn, by the scene's test hook. */
async function damagedParts(page: Page): Promise<Part[]> {
  const hook = await page.locator('[data-cruise-damage]').getAttribute('data-cruise-damage');
  return JSON.parse(hook ?? '[]') as Part[];
}

/** Clicks the middle of a part drawn in the canvas. */
async function clickPart(page: Page, part: Part): Promise<void> {
  const canvas = await page.locator('[data-cruise-damage] > canvas').boundingBox();
  if (!canvas) throw new Error('No canvas');
  const scale = canvas.width / 640;
  await page.mouse.click(
    canvas.x + (part.x + part.width / 2) * scale,
    canvas.y + (part.y + part.height / 2) * scale,
  );
}

/** From the title at `url`: a New Run, its first Hop launched. */
async function launch(page: Page, url: string): Promise<void> {
  await page.goto(url);
  await page.getByRole('button', { name: 'New Run' }).click();
  await waitForOpening(page);
  await page.getByRole('button', { name: /Nav Chart/ }).click();
  const shown = page.getByRole('heading', { name: TARGET, level: 2, exact: true });
  for (const key of ['PageDown', 'PageUp']) {
    for (let i = 0; i < 40 && !(await shown.isVisible()); i += 1) await page.keyboard.press(key);
  }
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('target')).toContainText(TARGET);
  await page.getByRole('button', { name: 'Launch' }).click();
}

/** The leaking Tank's systems light: red, a button, its words in its name. */
const leakingLight = (page: Page) =>
  page.getByTestId('systems-lights').getByRole('button', { name: /Fuel Tank.*Damaged/ });
const repairingLight = (page: Page) =>
  page.getByTestId('systems-lights').getByRole('button', { name: /Fuel Tank.*Repairing/ });

/** The Fuel the Cruise's tank gauge reads now, in kg. */
async function cruiseFuel(page: Page): Promise<number> {
  return Number(await page.getByTestId('cruise-fuel-gauge').getAttribute('aria-valuenow'));
}

test('click the leaking Tank: the Repair ring runs, the leak stops, and the report shows it Repaired', async ({
  page,
}) => {
  await launchIntoLeak(page);
  const [tank] = await damagedParts(page);
  if (!tank) throw new Error('No Damaged part drawn');
  const leaking = await cruiseFuel(page);
  await clickPart(page, tank);
  await expect(repairingLight(page)).toBeVisible();
  // A Fuel Tank's Repair is 30 s of Cruise: under 4 s here. Then the light is back to working.
  await expect(page.getByTestId('systems-lights').getByRole('button')).toHaveCount(0, {
    timeout: 8_000,
  });
  // The gauge moves in small steps: let the last one land, then it holds.
  await page.waitForTimeout(300);
  const fixed = await cruiseFuel(page);
  expect(fixed).toBeLessThan(leaking);
  await page.waitForTimeout(600);
  expect(await cruiseFuel(page)).toBe(fixed);

  const report = page.getByRole('dialog', { name: 'Arrived' });
  await expect(report).toBeVisible({ timeout: 20_000 });
  await expect(
    report.getByRole('img', { name: 'Fuel leak in the Fuel Tank: Repaired.' }),
  ).toBeVisible();
  await expect(report.getByRole('img', { name: /^Lost .+ of Fuel to the leak\.$/ })).toBeVisible();
});

test('keyboard: Enter on the red light starts the Repair, Enter again Rushes it for Materials', async ({
  page,
}) => {
  await launchIntoLeak(page);
  const before = Number(await page.getByTestId('materials').textContent());
  await leakingLight(page).focus();
  await page.keyboard.press('Enter');
  await expect(repairingLight(page)).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('systems-lights').getByRole('button')).toHaveCount(0);
  expect(Number(await page.getByTestId('materials').textContent())).toBeLessThan(before);
});

// The Engine fire (#251): the same first Hop, with only an Engine fire injected 4 s into the Cruise.
const FIRE_URL = `/?seed=${String(SEED)}&chassis=scout&cruiseSpeed=12&cruiseFire=40`;
const burningLight = (page: Page) =>
  page.getByTestId('systems-lights').getByRole('button', { name: /Engine.*Damaged/ });

test('click the burning Engine: the fire goes out, and the Hop ends safely', async ({ page }) => {
  await launch(page, FIRE_URL);
  await expect(burningLight(page)).toBeVisible({ timeout: 15_000 });
  const [engine] = await damagedParts(page);
  if (!engine) throw new Error('No burning Engine drawn');
  await clickPart(page, engine);
  await expect(
    page.getByTestId('systems-lights').getByRole('button', { name: /Engine.*Repairing/ }),
  ).toBeVisible();
  // The fire's 30 s pass (2.5 s here) and the Spacecraft flies on to its Landing.
  await expect(page.getByRole('dialog', { name: 'Arrived' })).toBeVisible({ timeout: 20_000 });
});

test('an Engine fire left alone Destroys the Spacecraft, and New Run starts fresh', async ({
  page,
}) => {
  await launch(page, FIRE_URL);
  await expect(burningLight(page)).toBeVisible({ timeout: 15_000 });
  const end = page.getByRole('alertdialog', { name: 'Destroyed' });
  await expect(end).toBeVisible({ timeout: 15_000 });
  await expect(end).toContainText('The Engine fire reached the Fuel.');
  await end.getByRole('button', { name: 'New Run' }).click();
  await expect(page.getByRole('alertdialog')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Nav Chart/ })).toBeVisible();
});
