import { afterEach, expect, it } from 'vitest';
import { CHASSIS_IDS } from '../game/sim/index.ts';
import { cleanUp, renderUi } from './browserTestKit.tsx';
import { ChassisPicker } from './ChassisPicker.tsx';
import { chassisName } from './format.ts';
import { expectTextBudget } from './textBudget.ts';

afterEach(cleanUp);

const noop = (): void => undefined;

async function renderPicker(): Promise<HTMLElement> {
  return renderUi(<ChassisPicker onLaunch={noop} onBack={noop} launching={false} />);
}

it('keeps to the text budget', async () => {
  expectTextBudget(await renderPicker());
});

// #298: a Chassis is cosmetic, so its card shows its name and its look, and no figures.
it('shows each Chassis by its name and look only, with no stat bars', async () => {
  const host = await renderPicker();
  const cards = [...host.querySelectorAll('.chassis-card')];
  expect(cards.map((card) => card.querySelector('.chassis-card__name')?.textContent)).toEqual(
    CHASSIS_IDS.map(chassisName),
  );
  for (const card of cards) expect(card.querySelector('.chassis-card__sprite')).not.toBeNull();
  expect(host.querySelector('.chassis-bar, [role="img"]')).toBeNull();
  expect(host.textContent).not.toMatch(/km\/s|Δv|kg/);
});

it('fits the 640x360 stage, with the buttons inside it', async () => {
  const host = await renderPicker();
  for (const el of host.querySelectorAll('.chassis-card, button')) {
    const box = el.getBoundingClientRect();
    expect(box.left).toBeGreaterThanOrEqual(0);
    expect(box.top).toBeGreaterThanOrEqual(0);
    expect(box.right).toBeLessThanOrEqual(640);
    expect(box.bottom).toBeLessThanOrEqual(360);
  }
});
