import { afterEach, expect, it } from 'vitest';
import { kilograms, materials, metersPerSecond } from '../game/sim/index.ts';
import { byTestId, cleanUp, renderUi } from './browserTestKit.tsx';
import { formatDeltaVKmS } from './format.ts';
import { TopBar } from './TopBar.tsx';

afterEach(cleanUp);

const bar = (dailyDay?: string) => (
  <TopBar
    systemNumber={12}
    systemName="Quydril Prime Longname"
    fuel={kilograms(1234)}
    fuelCapacity={kilograms(5000)}
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

it('shows the Fuel as a fill bar that matches the Fuel value, inside the bar and clear of the right end', async () => {
  const host = await renderUi(bar());
  const gauge = byTestId(host, 'fuel-bar');
  const fill = byTestId(host, 'fuel-bar-fill');
  expect(gauge.getAttribute('role')).toBe('meter');
  expect(gauge.getAttribute('aria-valuenow')).toBe('1234');
  expect(gauge.getAttribute('aria-valuemax')).toBe('5000');
  // 1234 of 5000 kg is 24.68% of the bar's inner width.
  const inner = gauge.clientWidth;
  expect(fill.getBoundingClientRect().width / inner).toBeCloseTo(1234 / 5000, 2);
  // The Fuel value keeps its hook for the gathering moment (#220).
  expect(byTestId(host, 'fuel').textContent).toBe('1.2 t');
  // Inside the bar, with the right end (the speaker's room) free.
  const frame = host.querySelector<HTMLElement>('.top-bar')?.getBoundingClientRect();
  if (!frame) throw new Error('no bar');
  const box = gauge.getBoundingClientRect();
  expect(box.left).toBeGreaterThanOrEqual(frame.left);
  expect(box.bottom).toBeLessThanOrEqual(frame.bottom);
  expect(box.right).toBeLessThan(frame.right - 200);
  const dv = host.querySelector<HTMLElement>('.top-bar__dv-icon')?.getBoundingClientRect();
  if (!dv) throw new Error('no dv icon');
  expect(box.right).toBeLessThanOrEqual(dv.left);
});

// Show, don't tell (#222): the Hop plan reads Δv in km/s, so the top bar does too, at every size.
it.each([
  [22_105, '22.1 km/s'],
  [6989, '7.0 km/s'],
  [420, '0.42 km/s'],
])('shows %i m/s of Δv as %s, with the Hop plan’s formatter', async (deltaV, shown) => {
  const host = await renderUi(
    <TopBar
      systemNumber={1}
      systemName="Cinder"
      fuel={kilograms(3140)}
      fuelCapacity={kilograms(5000)}
      deltaV={metersPerSecond(deltaV)}
      materials={materials(0)}
    />,
  );
  expect(byTestId(host, 'delta-v').textContent).toBe(shown);
  expect(byTestId(host, 'delta-v').textContent).toBe(formatDeltaVKmS(metersPerSecond(deltaV)));
});

// The mission tracker (#289): three goal icons that fit in the bar beside the speaker and light per state.
const withGoals = (found: boolean, built: boolean) => (
  <TopBar
    systemNumber={12}
    systemName="Quydril Prime Longname"
    fuel={kilograms(1234)}
    fuelCapacity={kilograms(5000)}
    deltaV={metersPerSecond(9876)}
    materials={materials(100)}
    dailyDay="2026-11-15"
    goals={[
      {
        id: 'heliopause',
        done: found,
        label: found ? 'Heliopause: found' : 'Heliopause: not found yet',
      },
      {
        id: 'jump-drive',
        done: built,
        label: built ? 'Jump Drive: built' : 'Jump Drive: not built yet',
      },
      { id: 'escape', done: false, label: 'Escape: not made yet' },
    ]}
  />
);

it('fits the mission tracker inside the bar, clear of the speaker controls and the other readouts', async () => {
  const host = await renderUi(withGoals(false, false));
  const frame = host.querySelector<HTMLElement>('.top-bar')?.getBoundingClientRect();
  const tracker = byTestId(host, 'mission-tracker').getBoundingClientRect();
  const music = host.querySelector<HTMLElement>('.music-controls--bar')?.getBoundingClientRect();
  const materialsValue = byTestId(host, 'materials').getBoundingClientRect();
  if (!frame || !music) throw new Error('no bar');
  expect(tracker.left).toBeGreaterThanOrEqual(music.right);
  expect(tracker.left).toBeGreaterThanOrEqual(materialsValue.right);
  expect(tracker.right).toBeLessThanOrEqual(frame.right);
  expect(tracker.top).toBeGreaterThanOrEqual(frame.top);
  expect(tracker.bottom).toBeLessThanOrEqual(frame.bottom);
});

// Scrap (#344): an icon and a number in a chip beside Science's, its words in the accessible name.
it.each([0, 3, 999])(
  'shows %i Scrap as an icon and a number, clear of the Science chip and the mission tracker',
  async (scrap) => {
    const host = await renderUi(
      <TopBar
        systemNumber={12}
        systemName="Quydril Prime Longname"
        fuel={kilograms(1234)}
        fuelCapacity={kilograms(5000)}
        deltaV={metersPerSecond(9876)}
        materials={materials(100)}
        science={999}
        scrap={scrap}
        goals={[
          { id: 'heliopause', done: false, label: 'Heliopause: not found yet' },
          { id: 'jump-drive', done: false, label: 'Jump Drive: not built yet' },
          { id: 'escape', done: false, label: 'Escape: not made yet' },
        ]}
      />,
    );
    const chip = byTestId(host, 'scrap');
    expect(chip.getAttribute('role')).toBe('img');
    expect(chip.getAttribute('aria-label')).toBe(`Scrap ${String(scrap)}`);
    expect(chip.querySelector('[data-testid="scrap-icon"]')).not.toBeNull();
    expect(chip.textContent).toBe(String(scrap));
    const box = chip.getBoundingClientRect();
    const frame = host.querySelector<HTMLElement>('.top-bar')?.getBoundingClientRect();
    if (!frame) throw new Error('no bar');
    // Inside the 640-px stage, left of the Science chip and below the tracker's row.
    expect(box.left).toBeGreaterThanOrEqual(0);
    expect(box.right).toBeLessThanOrEqual(byTestId(host, 'science').getBoundingClientRect().left);
    expect(box.top).toBeGreaterThanOrEqual(
      byTestId(host, 'mission-tracker').getBoundingClientRect().bottom,
    );
    expect(box.bottom).toBeLessThanOrEqual(frame.bottom + 20);
  },
);

it('lights each goal per state and names it, state included', async () => {
  const host = await renderUi(withGoals(true, false));
  const heliopause = byTestId(host, 'goal-heliopause');
  const drive = byTestId(host, 'goal-jump-drive');
  expect(heliopause.getAttribute('aria-label')).toBe('Heliopause: found');
  expect(heliopause.getAttribute('data-done')).toBe('true');
  expect(drive.getAttribute('aria-label')).toBe('Jump Drive: not built yet');
  expect(drive.getAttribute('data-done')).toBe('false');
  expect(byTestId(host, 'goal-escape').getAttribute('aria-label')).toBe('Escape: not made yet');
});
