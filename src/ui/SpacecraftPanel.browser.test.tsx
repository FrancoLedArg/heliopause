import { act, useEffect, useState } from 'react';
import { afterEach, expect, it } from 'vitest';
import { EventBus } from '../game/EventBus.ts';
import {
  CHASSIS_IDS,
  COMPONENTS,
  install,
  materials,
  startRun,
  type Run,
} from '../game/sim/index.ts';
import { byTestId, cleanUp, renderUi } from './browserTestKit.tsx';
import { SpacecraftPanel } from './SpacecraftPanel.tsx';

afterEach(cleanUp);

/** The panel with the Landed scene's part played by a stand-in: it installs and answers `run-updated`. */
function Harness({ initial }: { initial: Run }) {
  const [run, setRun] = useState(initial);
  useEffect(
    () =>
      EventBus.on('component-install-requested', (slot, id) => {
        const result = install(run, slot, id);
        if (result.kind === 'installed') setRun(result.run);
      }),
    [run],
  );
  return (
    <SpacecraftPanel
      run={run}
      onClose={() => {
        /* the parent closes it */
      }}
    />
  );
}

function runWith(chassis: (typeof CHASSIS_IDS)[number], stock: number): Run {
  return { ...startRun(2026, chassis), materials: materials(stock) };
}

function installButton(host: HTMLElement, label: RegExp): HTMLButtonElement {
  const found = [...host.querySelectorAll<HTMLButtonElement>('button')].find((b) =>
    label.test(b.getAttribute('aria-label') ?? ''),
  );
  if (!found) throw new Error(`no button matching ${String(label)}`);
  return found;
}

// Every row, on every Chassis, whether the Run can afford it or not: the Silkscreen and VT323 metrics
// differ between machines, so the text keeps real room (at least 16 px) inside its box, not just a fit.
it.each(CHASSIS_IDS.flatMap((chassis) => [0, 25, 500].map((stock) => [chassis, stock] as const)))(
  'keeps every catalogue row inside its box, with room to spare (%s, %i Materials)',
  async (chassis, stock) => {
    const host = await renderUi(<Harness initial={runWith(chassis, stock)} />);
    const rows = host.querySelectorAll<HTMLElement>('[data-testid="component-row"]');
    expect(rows).toHaveLength(6);
    for (const row of rows) {
      const head = row.querySelector<HTMLElement>('.spacecraft-panel__row-head');
      const effect = row.querySelector<HTMLElement>('.spacecraft-panel__row-effect');
      const button = row.querySelector<HTMLElement>('button');
      if (!head || !effect || !button) throw new Error('a row is missing a part');
      const headBox = head.getBoundingClientRect();
      const buttonLeft = button.getBoundingClientRect().left;
      expect(head.scrollWidth).toBeLessThanOrEqual(head.clientWidth);
      expect(effect.scrollWidth).toBeLessThanOrEqual(effect.clientWidth);
      // The last thing on the head line (the tag, or the stats) ends well before the Install button.
      const last = head.lastElementChild?.getBoundingClientRect().right ?? headBox.right;
      expect(last).toBeLessThanOrEqual(buttonLeft - 16);
      // The text, measured as it flows, stays 16 px inside its box too.
      for (const line of [head, effect]) {
        const range = document.createRange();
        range.selectNodeContents(line);
        expect(range.getBoundingClientRect().right).toBeLessThanOrEqual(
          line.getBoundingClientRect().right - 16,
        );
      }
      expect(row.getBoundingClientRect().bottom).toBeLessThanOrEqual(
        byTestId(host, 'install-status').getBoundingClientRect().top,
      );
    }
  },
);

it('fits the longest refusal in its box, above the bottom of the panel, with room to spare', async () => {
  const host = await renderUi(<Harness initial={runWith('hauler', 0)} />);
  const panel = host.querySelector<HTMLElement>('.spacecraft-panel');
  if (!panel) throw new Error('no panel');
  const status = byTestId(host, 'install-status');
  // The Run has nothing to spend, so every Install refuses; the longest cost gives the longest reason.
  const longest = installButton(host, /Install Engine, level 2/);
  act(() => {
    longest.click();
  });
  expect(status.textContent).toContain('Not enough Materials');
  expect(status.textContent).toContain('60');
  expect(status.scrollHeight).toBeLessThanOrEqual(status.clientHeight);
  expect(status.scrollWidth).toBeLessThanOrEqual(status.clientWidth);
  const box = status.getBoundingClientRect();
  expect(box.bottom).toBeLessThanOrEqual(panel.getBoundingClientRect().bottom - 8);
  // Two 12 px lines fit the box with the Close button beside it, not under it.
  const close = host.querySelector<HTMLElement>('.spacecraft-panel__close');
  expect(box.right).toBeLessThanOrEqual(close?.getBoundingClientRect().left ?? 0);
});

it('keeps the whole panel inside the 640×360 stage, and no text clipped by its own box', async () => {
  const host = await renderUi(<Harness initial={runWith('hauler', 25)} />);
  const panel = host.querySelector<HTMLElement>('.spacecraft-panel');
  if (!panel) throw new Error('no panel');
  const stage = host.getBoundingClientRect();
  const frame = panel.getBoundingClientRect();
  expect(frame.left).toBeGreaterThanOrEqual(stage.left);
  expect(frame.top).toBeGreaterThanOrEqual(stage.top);
  expect(frame.right).toBeLessThanOrEqual(stage.left + 640);
  expect(frame.bottom).toBeLessThanOrEqual(stage.top + 360);
  for (const el of panel.querySelectorAll<HTMLElement>('*')) {
    if (el instanceof HTMLCanvasElement || el.classList.contains('sr-only')) continue;
    expect(el.scrollWidth, el.className).toBeLessThanOrEqual(el.clientWidth);
    const box = el.getBoundingClientRect();
    if (box.width === 0 || box.height === 0) continue;
    expect(box.right, el.className).toBeLessThanOrEqual(frame.right - 4);
    expect(box.bottom, el.className).toBeLessThanOrEqual(frame.bottom - 4);
  }
});

it('installs the cheapest Component with the starting Materials: Materials and Δv change, and the panel says so', async () => {
  const host = await renderUi(<Harness initial={startRun(2026, 'scout')} />);
  const before = byTestId(host, 'panel-delta-v').textContent;
  act(() => {
    installButton(host, /Install Fuel Tank, level 1/).click();
  });
  expect(byTestId(host, 'install-status').textContent).toBe(
    `Installed Fuel Tank, level 1 in Slot 3. ${String(25 - COMPONENTS['fuel-tank-1'].cost)} Materials left.`,
  );
  expect(byTestId(host, 'panel-delta-v').textContent).not.toBe(before);
  expect(byTestId(host, 'fuel-capacity').textContent).toBe('42.0 t');
  expect(byTestId(host, 'install-target').textContent).toContain('Slot 4');
});

it('refuses with a reason in text when the Run cannot afford it, and changes nothing', async () => {
  const host = await renderUi(<Harness initial={startRun(2026, 'scout')} />);
  act(() => {
    installButton(host, /Install Engine, level 1/).click();
  });
  expect(byTestId(host, 'install-status').textContent).toBe(
    "Can't install. Not enough Materials: it costs 30 and you have 25, 5 short.",
  );
  expect(byTestId(host, 'fuel-capacity').textContent).toBe('21.0 t');
});

it('refuses with a reason in text when every Slot is full', async () => {
  let full = { ...startRun(2026, 'scout'), materials: materials(500) };
  for (const slot of [2, 3]) {
    const result = install(full, slot, 'drill-1');
    if (result.kind !== 'installed') throw new Error('expected an install');
    full = result.run;
  }
  const host = await renderUi(<Harness initial={full} />);
  expect(byTestId(host, 'install-target').textContent).toBe('No empty Slot');
  act(() => {
    installButton(host, /Install Fuel Tank, level 1/).click();
  });
  expect(byTestId(host, 'install-status').textContent).toBe(
    "Can't install. Every Slot is full, so there is nowhere to install it.",
  );
});

it('shows each Component’s effect as its Chassis scales it, never the catalogue’s base figure', async () => {
  const host = await renderUi(<Harness initial={runWith('hauler', 25)} />);
  const effects = [...host.querySelectorAll('[data-testid="component-effect"]')].map(
    (el) => el.textContent,
  );
  expect(effects).toContain('Holds 66.0 t of Fuel.');
  expect(effects.join(' ')).not.toMatch(/(?<![\d.])6\.0 t of Fuel/);
  expect(effects.join(' ')).not.toContain('900 s');
});
