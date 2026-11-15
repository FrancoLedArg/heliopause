import { expect, test } from '@playwright/test';
import { listBodies, startRun, strandsOnArrival } from '../../src/game/sim/index.ts';

// #182: the Hop plan warns before a Hop that would leave the Run Stranded. Seed 2's Scout can reach
// Quydril for sure, but would never leave it again. The warning is a warning: the Hop still launches.
const run = startRun(2, 'scout');
const quydril = listBodies(run.starSystem).find((body) => body.name === 'Quydril');
if (!quydril) throw new Error('Seed 2 has no Quydril');
const arrival = strandsOnArrival(run, quydril.id);
if (!arrival) throw new Error('Seed 2 should warn of Quydril');

test('the Hop plan warns that Quydril would leave the Run Stranded, and the Hop still launches', async ({
  page,
}, testInfo) => {
  test.setTimeout(60_000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.setViewportSize({ width: 640, height: 360 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/?seed=2&chassis=scout');
  await page.getByRole('button', { name: 'New Run' }).click();
  await page.getByRole('button', { name: /Nav Chart/ }).click();
  await expect(page.getByRole('dialog', { name: 'Nav Chart' })).toBeVisible();

  const shown = page.getByRole('heading', { name: 'Quydril', level: 2, exact: true });
  for (let i = 0; i < 40 && !(await shown.isVisible()); i += 1) {
    await page.keyboard.press('PageDown');
  }
  // Focused: the tooltip on the chart already says so, before Quydril is the target.
  await expect(page.getByTestId('verdict')).toHaveText(arrival.warning);
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('target')).toContainText('Quydril');

  await expect(page.getByTestId('plan-success')).toContainText('100%');
  await expect(page.getByTestId('plan-warning')).toHaveText("You'd be Stranded there");
  await expect(page.getByTestId('plan-stranded')).toHaveText(arrival.warning);
  // Each warning ends inside the box that holds it: the plan, the note under the chart, the tooltip.
  for (const [line, box] of [
    ['plan-warning', 'hop-plan'],
    ['plan-stranded', 'plan-explain'],
    ['verdict', 'inspect'],
  ] as const) {
    const inner = await page.getByTestId(line).boundingBox();
    const outer = await page.getByTestId(box).boundingBox();
    if (!inner || !outer) throw new Error(`${line} or ${box} is not shown`);
    expect(inner.y + inner.height, `${line} inside ${box}`).toBeLessThanOrEqual(
      outer.y + outer.height,
    );
    expect(inner.x + inner.width, `${line} inside ${box}`).toBeLessThanOrEqual(
      outer.x + outer.width,
    );
  }
  await testInfo.attach('stranded-warning', {
    body: await page.screenshot(),
    contentType: 'image/png',
  });

  // A warning, not a block: Launch is live and the Hop is flown.
  await page.getByRole('button', { name: 'Launch' }).click();
  await expect(page.getByRole('region', { name: 'Hop progress' })).toBeVisible();
  expect(errors).toEqual([]);
});
