import { afterEach, expect, it } from 'vitest';
import { userEvent } from 'vitest/browser';
import { availableDeltaV, CHASSIS_IDS, newSpacecraft } from '../game/sim/index.ts';
import { cleanUp, renderUi } from './browserTestKit.tsx';
import { ChassisPicker } from './ChassisPicker.tsx';
import { chassisName, formatDeltaVKmS, formatMass } from './format.ts';
import { expectTextBudget } from './textBudget.ts';

afterEach(cleanUp);

const noop = (): void => undefined;

async function renderPicker(): Promise<HTMLElement> {
  return renderUi(<ChassisPicker onLaunch={noop} onBack={noop} launching={false} />);
}

/** The fill of a card's bar, as a share of its track. */
function fillShare(host: HTMLElement, card: number, kind: string): number {
  const cardEl = host.querySelectorAll('.chassis-card')[card];
  const track = cardEl?.querySelector(`[data-testid="bar-${kind}"]`);
  const fill = track?.firstElementChild;
  if (!track || !fill) throw new Error(`no ${kind} bar on card ${String(card)}`);
  return fill.getBoundingClientRect().width / track.getBoundingClientRect().width;
}

it('keeps to the text budget: one short line, the rest behind Tell me more', async () => {
  const host = await renderPicker();
  expectTextBudget(host);
  host.querySelector<HTMLButtonElement>('.disclosure-toggle')?.focus();
  await userEvent.keyboard('{Enter}');
  expect(() => {
    expectTextBudget(host);
  }).toThrow(/over the budget/);
});

it('draws each bar in proportion to the data, the longest full', async () => {
  const host = await renderPicker();
  const figures = CHASSIS_IDS.map((id) => {
    const spacecraft = newSpacecraft(id);
    return {
      mass: spacecraft.dryMass,
      fuel: spacecraft.fuelCapacity,
      dv: availableDeltaV(spacecraft),
    };
  });
  for (const kind of ['mass', 'fuel', 'dv'] as const) {
    const largest = Math.max(...figures.map((f) => f[kind]));
    figures.forEach((f, card) => {
      expect(fillShare(host, card, kind)).toBeCloseTo(f[kind] / largest, 2);
    });
    expect(Math.max(...figures.map((_, card) => fillShare(host, card, kind)))).toBeCloseTo(1, 2);
  }
});

it('names every bar with its Chassis, measure and value', async () => {
  const host = await renderPicker();
  for (const id of CHASSIS_IDS) {
    const spacecraft = newSpacecraft(id);
    const names = [
      `${chassisName(id)} Dry mass: ${formatMass(spacecraft.dryMass)}`,
      `${chassisName(id)} Δv: ${formatDeltaVKmS(availableDeltaV(spacecraft))}`,
    ];
    for (const name of names) {
      expect(host.querySelector(`[role="img"][aria-label="${name}"]`)).not.toBeNull();
    }
  }
  expect(host.textContent).toContain('km/s');
});

it('fits the 640x360 stage, with the buttons inside it', async () => {
  const host = await renderPicker();
  const picker = host.querySelector('.chassis-picker');
  const stage = { right: 640, bottom: 360 };
  const inside = (el: Element | null): void => {
    const box = el?.getBoundingClientRect();
    if (!box) throw new Error('missing element');
    expect(box.left).toBeGreaterThanOrEqual(0);
    expect(box.top).toBeGreaterThanOrEqual(0);
    expect(box.right).toBeLessThanOrEqual(stage.right);
    expect(box.bottom).toBeLessThanOrEqual(stage.bottom);
  };
  for (const el of host.querySelectorAll('.chassis-card, .chassis-picker__note, button')) {
    inside(el);
  }
  expect(picker).not.toBeNull();
  // No bar's number runs into the bar before it, and none is clipped by its card.
  for (const row of host.querySelectorAll('.chassis-bar')) {
    const [label, track, value] = [...row.children].map((c) => c.getBoundingClientRect());
    expect(label && track && value).toBeTruthy();
    if (label && track && value) {
      expect(label.right).toBeLessThanOrEqual(track.left);
      expect(track.right).toBeLessThanOrEqual(value.left);
    }
    const valueEl = row.lastElementChild;
    expect(valueEl && valueEl.scrollWidth <= valueEl.clientWidth).toBe(true);
    const labelEl = row.firstElementChild;
    expect(labelEl && labelEl.scrollWidth <= labelEl.clientWidth).toBe(true);
  }
  // Open "Tell me more": the longer text still sits clear of the buttons.
  host.querySelector<HTMLButtonElement>('.disclosure-toggle')?.focus();
  await userEvent.keyboard('{Enter}');
  const more = host.querySelector('.chassis-picker__more')?.getBoundingClientRect();
  const buttons = host.querySelector('.chassis-picker__actions')?.getBoundingClientRect();
  expect(more && buttons && more.bottom <= buttons.top).toBe(true);
});
