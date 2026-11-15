import { afterEach, expect, it } from 'vitest';
import { kilograms, materials, metersPerSecond } from '../game/sim/index.ts';
import { byTestId, cleanUp, renderUi } from './browserTestKit.tsx';
import { TopBar } from './TopBar.tsx';

afterEach(cleanUp);

const bar = (dailyDay?: string) => (
  <TopBar
    systemNumber={12}
    systemName="Quydril Prime Longname"
    fuel={kilograms(1234)}
    deltaV={metersPerSecond(9876)}
    materials={materials(100)}
    dailyDay={dailyDay}
  />
);

it('shows no Daily tag in a New Run', async () => {
  const host = await renderUi(bar());
  expect(host.querySelector('[data-testid="daily-tag"]')).toBeNull();
});

it('shows the Daily tag as text, inside the bar and clear of the Star System, Fuel and Δv', async () => {
  const host = await renderUi(bar('2026-11-15'));
  const tag = byTestId(host, 'daily-tag');
  expect(tag.textContent).toBe('Daily 2026-11-15 UTC');
  const box = tag.getBoundingClientRect();
  const frame = host.querySelector<HTMLElement>('.top-bar')?.getBoundingClientRect();
  if (!frame) throw new Error('no bar');
  expect(box.left).toBeGreaterThanOrEqual(frame.left);
  expect(box.right).toBeLessThanOrEqual(frame.right);
  expect(box.top).toBeGreaterThanOrEqual(frame.top);
  expect(box.bottom).toBeLessThanOrEqual(frame.bottom);
  for (const selector of ['.top-bar__fuel-icon', '.top-bar__fuel-label']) {
    const other = host.querySelector<HTMLElement>(selector)?.getBoundingClientRect();
    if (!other) throw new Error(selector);
    expect(box.right <= other.left || other.right <= box.left, selector).toBe(true);
  }
  // It sits on the label row, beside "System N" and above the Star System's own name.
  const label = host.querySelector<HTMLElement>('.top-bar__system-label')?.getBoundingClientRect();
  const name = host.querySelector<HTMLElement>('.top-bar__system')?.getBoundingClientRect();
  if (!label || !name) throw new Error('no labels');
  expect(box.left).toBeGreaterThanOrEqual(label.right);
  expect(box.bottom).toBeLessThanOrEqual(name.top + 2);
});
