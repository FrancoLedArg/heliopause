import { expect, test, type Page } from '@playwright/test';
import { waitForOpening } from './opening.ts';
import { FAST_CRUISE } from './cruise.ts';
import { initialChartState, layoutChart } from '../../src/game/scenes/navChartView.ts';
import { toScreen } from '../../src/game/scenes/navChartMap.ts';
import {
  findBody,
  firstDetectedBody,
  startingMoon,
  startRun,
  type Body,
} from '../../src/game/sim/index.ts';

// Re-pinned for #189: seed 123 opens on a Moon of a Gas Giant, so the chart shows the Starting
// Moon, its Gas Giant (Surveyed, shown as one) and the sibling Moon Comms Detected.
// Re-pinned for #311 (was seed 123): its Star System changed, and seed 114 also opens on a Gas Giant's Moon.
const SEED = 114;
const run = startRun(SEED, 'scout');
const home = startingMoon(run.starSystem);
const homeMoon = firstDetectedBody(run.starSystem);
const gasGiant = findBody(run.starSystem, home.planetId);
if (gasGiant?.kind !== 'gas-giant') throw new Error(`Seed ${SEED} opens on a Gas Giant's Moon`);

const homeName = home.name;

async function openNavChart(page: Page): Promise<void> {
  await page.goto(`/?seed=${SEED}&chassis=scout`);
  await page.getByRole('button', { name: 'New Run' }).click();
  await waitForOpening(page);
  await page.getByRole('button', { name: /Nav Chart/ }).click();
  await expect(page.getByRole('dialog', { name: 'Nav Chart' })).toBeVisible();
}

/**
 * Steps through the chart (PageDown, then back with PageUp: they do not wrap) until the inspector
 * shows `body`, the way a keyboard player steps through it.
 */
async function stepTo(page: Page, body: Body): Promise<void> {
  const shown = page.getByRole('heading', { name: body.name, level: 2 });
  for (const key of ['PageDown', 'PageUp']) {
    for (let i = 0; i < 40; i += 1) {
      if (await shown.isVisible()) return;
      await page.keyboard.press(key);
    }
  }
  throw new Error(`Never reached ${body.name}`);
}

test('the Nav Chart opens over the Landed view, names the Spacecraft Body and closes again', async ({
  page,
}, testInfo) => {
  await openNavChart(page);
  // #193: it opens on the map alone, no card, with where the Spacecraft is named on it.
  await expect(page.getByTestId('inspect')).toHaveCount(0);
  await expect(page.getByText(`${homeName} · you`)).toBeVisible();
  // Only what the player knows: the Starting Moon, its Gas Giant and the one Body Comms Detected.
  // The Heliopause is not on the chart until the Radar finds it (#191).
  await expect(page.getByText('Heliopause', { exact: true })).toHaveCount(0);
  const options = page.getByRole('option');
  await expect(options).toHaveCount(3);
  for (const body of [home, gasGiant, homeMoon]) {
    await expect(page.getByRole('option', { name: new RegExp(`^${body.name},`) })).toBeAttached();
  }
  await testInfo.attach('nav-chart', { body: await page.screenshot(), contentType: 'image/png' });

  const opener = page.getByRole('button', { name: 'Nav Chart (M)' });
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Nav Chart' })).toBeHidden();
  await expect(page.getByRole('heading', { name: homeName, level: 1 })).toBeVisible();
  await expect(opener).toBeFocused();
  // Esc was the Nav Chart's: the in-Run Menu, which Esc opens otherwise, stays closed. The Menu decides
  // a tick after the key, so give it that tick before looking.
  await page.waitForTimeout(250);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.keyboard.press('m');
  await expect(page.getByRole('dialog', { name: 'Nav Chart' })).toBeVisible();
  await page.getByRole('button', { name: 'Close' }).click();
  await expect(page.getByRole('dialog', { name: 'Nav Chart' })).toBeHidden();
  await expect(opener).toBeFocused();
});

test('the Spacecraft and Nav Chart buttons sit side by side right of the location plate, clear of every panel', async ({
  page,
}) => {
  await page.goto(`/?seed=${SEED}&chassis=scout`);
  await page.getByRole('button', { name: 'New Run' }).click();
  const button = page.getByRole('button', { name: 'Nav Chart (M)' });
  await expect(button).toBeVisible();

  const canvas = await page.locator('canvas').first().boundingBox();
  if (!canvas) throw new Error('no canvas');
  const scale = canvas.width / 640;
  /** An element's box in the game's own 640x360 pixels. */
  const stageBox = async (selector: string) => {
    const box = await page.locator(selector).first().boundingBox();
    if (!box) throw new Error(`no ${selector}`);
    return {
      left: (box.x - canvas.x) / scale,
      top: (box.y - canvas.y) / scale,
      right: (box.x + box.width - canvas.x) / scale,
      bottom: (box.y + box.height - canvas.y) / scale,
    };
  };
  const buttons = [
    { selector: '.landed-spacecraft-button button', left: 352, right: 468 },
    { selector: '.landed-nav-button button', left: 476, right: 592 },
  ];
  for (const { selector, left, right } of buttons) {
    const at = await stageBox(selector);
    expect(at.left).toBeCloseTo(left, 0);
    expect(at.right).toBeCloseTo(right, 0);
    expect(at.top).toBeCloseTo(322, 0);
    expect(at.bottom).toBeCloseTo(346, 0);
    for (const panel of ['.top-bar', '.landed-plate', '.run-menu__button']) {
      const other = await stageBox(panel);
      const overlap =
        at.left < other.right &&
        other.left < at.right &&
        at.top < other.bottom &&
        other.top < at.bottom;
      expect(overlap, `${selector} overlaps ${panel}`).toBe(false);
    }
  }
});

test('from the keyboard: select the first target, and a Gas Giant says why it is not a target', async ({
  page,
}, testInfo) => {
  await openNavChart(page);
  await expect(page.getByRole('listbox', { name: 'Bodies in the Star System' })).toBeFocused();

  await stepTo(page, homeMoon);
  // It is only Detected: its card hides what it is made of (spec #96 story 12, #193).
  await expect(page.getByTestId('landable')).toHaveText('? Unknown');
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('target')).toContainText(homeMoon.name);
  await expect(
    page.getByRole('option', { name: new RegExp(`${homeMoon.name}.*target`) }),
  ).toHaveAttribute('aria-selected', 'true');
  await testInfo.attach('moon-selected', {
    body: await page.screenshot(),
    contentType: 'image/png',
  });

  await stepTo(page, gasGiant);
  await expect(page.getByTestId('landable')).toHaveText('No surface');
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('verdict')).toContainText('no surface to land on');
  // The earlier target stays: Escape closes the Gas Giant's card (#193) and the plan is back.
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('inspect')).toHaveCount(0);
  await expect(page.getByTestId('target')).toContainText(homeMoon.name);
  await testInfo.attach('gas-giant', { body: await page.screenshot(), contentType: 'image/png' });
});

// Re-pinned for #193: hover only brightens a Body; a click opens its card, "Plan Hop" chooses it,
// and a click on empty space closes the card. The camera opens centred on the Spacecraft.
test('with the mouse: a click opens a Body’s card, Plan Hop chooses it, a Gas Giant cannot be', async ({
  page,
}) => {
  await openNavChart(page);
  const canvas = page.locator('canvas').first();
  const box = await canvas.boundingBox();
  if (!box) throw new Error('no canvas');
  const scale = box.width / 640;
  const layout = layoutChart(run);
  const { view } = initialChartState(run, layout);
  const at = (id: string) => {
    const node = layout.nodes.find((n) => n.body.id === id);
    if (!node) throw new Error(`no node ${id}`);
    const s = toScreen(view, node);
    return { x: box.x + s.x * scale, y: box.y + s.y * scale };
  };

  const giant = at(gasGiant.id);
  await page.mouse.move(giant.x, giant.y);
  await expect(page.getByTestId('inspect')).toHaveCount(0);
  await page.mouse.click(giant.x, giant.y);
  await expect(page.getByTestId('verdict')).toContainText('no surface to land on');
  await expect(page.getByRole('button', { name: 'Plan Hop' })).toHaveCount(0);

  // Empty space, under the star's side of the map: the card closes.
  await page.mouse.click(box.x + 20 * scale, box.y + 300 * scale);
  await expect(page.getByTestId('inspect')).toHaveCount(0);

  const moon = at(homeMoon.id);
  await page.mouse.click(moon.x, moon.y);
  await expect(
    page.getByTestId('inspect').getByRole('heading', { name: homeMoon.name }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Plan Hop' }).click();
  await expect(page.getByTestId('inspect')).toHaveCount(0);
  await expect(page.getByTestId('target')).toContainText(homeMoon.name);
});

// #193's acceptance: only what the player knows is drawn, a blip is picked, planned and flown, and on
// arrival it is Surveyed and Comms Detects one more.
test('the full-screen chart: pick the blip, plan an Unsurveyed Hop, launch, and a new blip appears', async ({
  page,
}, testInfo) => {
  test.setTimeout(60_000);
  await page.goto(`/?seed=${SEED}&chassis=scout&${FAST_CRUISE}`);
  await page.getByRole('button', { name: 'New Run' }).click();
  await waitForOpening(page);
  await page.getByRole('button', { name: /Nav Chart/ }).click();
  await expect(page.getByRole('dialog', { name: 'Nav Chart' })).toBeVisible();
  // The Starting Moon, its Gas Giant, and one blip with a "?": the Body Comms Detected.
  await expect(page.getByRole('option')).toHaveCount(3);
  const blips = page.getByTestId('unsurveyed-mark');
  await expect(blips).toHaveCount(1);
  await expect(blips).toHaveAttribute('aria-label', `${homeMoon.name}: Unsurveyed`);

  await stepTo(page, homeMoon);
  const card = page.getByTestId('inspect');
  await expect(card.getByTestId('card-distance')).toContainText('AU away');
  await expect(card.getByTestId('card-reach')).toHaveAttribute('aria-label', 'Reach: In reach');
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('plan-unsurveyed')).toBeVisible();
  await testInfo.attach('unsurveyed-plan', {
    body: await page.screenshot(),
    contentType: 'image/png',
  });
  await page.getByRole('button', { name: 'Launch' }).click();
  const report = page.getByRole('dialog', { name: 'Arrived' });
  await expect(report).toBeVisible({ timeout: 20_000 });
  await report.getByRole('button', { name: 'Continue' }).click();

  await page.getByRole('button', { name: /Nav Chart/ }).click();
  // The Body landed on is Surveyed now, and Comms Detected one more: a new blip.
  await expect(page.getByRole('option')).toHaveCount(4);
  await expect(
    page.getByRole('option', { name: new RegExp(`^${homeMoon.name}, .*you are here`) }),
  ).not.toContainText('Unsurveyed');
  // The new blip may lie off screen (its marker is at the edge), so count it in the Body list.
  const unsurveyed = page.getByRole('option', { name: /Unsurveyed/ });
  await expect(unsurveyed).toHaveCount(1);
  await expect(unsurveyed).not.toContainText(homeMoon.name);
});

test('M while the in-Run Menu is open does not open the Nav Chart under it', async ({ page }) => {
  await page.goto(`/?seed=${SEED}&chassis=scout`);
  await page.getByRole('button', { name: 'New Run' }).click();
  await waitForOpening(page);
  await page.getByRole('button', { name: 'Menu' }).click();
  await expect(page.getByRole('dialog', { name: 'Menu' })).toBeVisible();
  await page.keyboard.press('m');
  await page.waitForTimeout(250);
  await expect(page.getByRole('dialog')).toHaveCount(1);
  await expect(page.getByRole('dialog', { name: 'Nav Chart' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Resume' })).toBeFocused();
  await page.getByRole('button', { name: 'Resume' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
});
