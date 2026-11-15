import { act, useEffect, useState } from 'react';
import { userEvent } from 'vitest/browser';
import { afterEach, expect, it } from 'vitest';
import { EventBus } from '../game/EventBus.ts';
import {
  availableDeltaV,
  CHASSIS_IDS,
  COMPONENT_IDS,
  COMPONENTS,
  install,
  materials,
  preview,
  refit,
  remove,
  startRun,
  type Run,
  type Slot,
} from '../game/sim/index.ts';
import { byTestId, cleanUp, renderUi } from './browserTestKit.tsx';
import { formatDeltaVKmS, formatMass } from './format.ts';
import { SpacecraftPanel } from './SpacecraftPanel.tsx';
import { componentLabel } from './spacecraftPanelView.ts';
import { SpacecraftPicture } from './SpacecraftPicture.tsx';
import { expectTextBudget } from './textBudget.ts';

/** A no-break space: the Tank note keeps a figure and its unit together. */
const NBSP = '\u00a0';

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
  useEffect(
    () =>
      EventBus.on('component-remove-requested', (slot) => {
        const result = remove(run, slot);
        if (result.kind === 'removed') setRun(result.run);
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
    expect(rows).toHaveLength(COMPONENT_IDS.length);
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

it('describes every Install button by the effect it shows, so a screen reader hears the promise', async () => {
  const host = await renderUi(<Harness initial={runWith('hauler', 25)} />);
  const button = installButton(host, /Install Drill, level 1/);
  const described = button.getAttribute('aria-describedby');
  expect(described).toBeTruthy();
  const target = described ? document.getElementById(described) : null;
  expect(target?.textContent).toBe('Yields 1.5× from each Body.');
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

/** A Hauler with `slots` fitted and every Tank full, so removing a Tank loses Fuel. */
function fullRun(slots: Parameters<typeof refit>[1]): Run {
  const base = startRun(2026, 'hauler');
  const spacecraft = refit(base.spacecraft, slots);
  return {
    ...base,
    materials: materials(0),
    spacecraft: { ...spacecraft, fuelMass: spacecraft.fuelCapacity },
  };
}

/** A button by its accessible name: its label when it has one, otherwise its text. */
function button(host: HTMLElement, name: RegExp): HTMLButtonElement {
  const found = [...host.querySelectorAll<HTMLButtonElement>('button')].find((b) =>
    name.test(b.getAttribute('aria-label') ?? b.textContent),
  );
  if (!found) throw new Error(`no button matching ${String(name)}`);
  return found;
}

function slotRadio(host: HTMLElement, label: RegExp): HTMLButtonElement {
  return installButton(host, label);
}

function press(el: HTMLElement): void {
  act(() => {
    el.click();
  });
}

function named(el: Element | null): string {
  return el?.getAttribute('aria-label') ?? el?.textContent ?? '';
}

/** Presses Tab (or Shift+Tab) until the focused control's name matches, with no pointer involved. */
async function tabTo(name: RegExp, backwards = false): Promise<void> {
  for (let step = 0; step < 40; step += 1) {
    if (name.test(named(document.activeElement))) return;
    await userEvent.keyboard(backwards ? '{Shift>}{Tab}{/Shift}' : '{Tab}');
  }
  throw new Error(`Tab never reached ${String(name)}`);
}

/** Moves focus to a Slot as a keyboard player does: Shift+Tab out to the Slots, then the arrow keys. */
async function focusSlot(label: RegExp): Promise<void> {
  for (let step = 0; step < 16; step += 1) {
    const active = document.activeElement;
    if (label.test(named(active))) return;
    await userEvent.keyboard(
      active?.getAttribute('role') === 'radio' ? '{ArrowRight}' : '{Shift>}{Tab}{/Shift}',
    );
  }
  throw new Error(`No way by keyboard to ${String(label)}`);
}

it('removes a Component by keyboard alone, asks first, and Materials rise by half its cost', async () => {
  const host = await renderUi(<Harness initial={startRun(2026, 'scout')} />);
  const stock = (): string => byTestId(host, 'install-target').textContent;
  await tabTo(/Install Fuel Tank, level 1/);
  await userEvent.keyboard('{Enter}');
  expect(stock()).toContain('5 Materials in stock');
  // Slot 3 now holds the Tank. Focus it and press Remove with the keyboard.
  await focusSlot(/^Slot 3, Fuel Tank/);
  await userEvent.keyboard('{Tab}');
  expect(document.activeElement?.textContent).toBe('Remove');
  await userEvent.keyboard('{Enter}');
  const ask = byTestId(host, 'remove-confirm');
  expect(ask.textContent).toContain('Remove Fuel Tank, level 1 from Slot 3?');
  expect(ask.textContent).toContain('You get 10 Materials back.');
  // Nothing is removed until confirmed; the keyboard lands on Keep, the safe answer.
  expect(byTestId(host, 'slot-caption').textContent).toContain('Fuel Tank, level 1');
  expect(document.activeElement?.textContent).toBe('Keep');
  await userEvent.keyboard('{Tab}{Enter}');
  expect(byTestId(host, 'slot-caption').textContent).toBe('Slot 3 is empty.');
  expect(stock()).toContain('15 Materials in stock');
  expect(byTestId(host, 'install-status').textContent).toContain('Removed Fuel Tank, level 1');
  expect(byTestId(host, 'install-status').textContent).toContain('Refunded 10 Materials');
  // Focus is back on the Remove button, so the keyboard player is not lost.
  expect(document.activeElement?.textContent).toBe('Remove');
});

it('Escape on the confirm step keeps the Component and leaves the panel open', async () => {
  const host = await renderUi(<Harness initial={startRun(2026, 'scout')} />);
  await tabTo(/Install Fuel Tank, level 1/);
  await userEvent.keyboard('{Enter}');
  await focusSlot(/^Slot 3, Fuel Tank/);
  await userEvent.keyboard('{Tab}{Enter}{Escape}');
  expect(host.querySelector('[data-testid="remove-confirm"]')).toBeNull();
  expect(byTestId(host, 'slot-caption').textContent).toContain('Fuel Tank, level 1');
  expect(host.querySelector('.spacecraft-panel')).not.toBeNull();
  expect(document.activeElement?.textContent).toBe('Remove');
});

it('Escape cancels an open remove question even when focus has left the confirm step', async () => {
  const closed: string[] = [];
  const host = await renderUi(
    <SpacecraftPanel
      run={fullRun(['engine-1', 'fuel-tank-1', 'fuel-tank-1', null, null, null])}
      onClose={() => {
        closed.push('closed');
      }}
    />,
  );
  await focusSlot(/^Slot 3, Fuel Tank/);
  await userEvent.keyboard('{Tab}{Enter}');
  expect(host.querySelector('[data-testid="remove-confirm"]')).not.toBeNull();
  // Shift+Tab leaves the confirm step for the Remove button, then Escape answers the question.
  await userEvent.keyboard('{Shift>}{Tab}{/Shift}');
  expect(document.activeElement?.closest('[data-testid="remove-confirm"]')).toBeNull();
  await userEvent.keyboard('{Escape}');
  expect(host.querySelector('[data-testid="remove-confirm"]')).toBeNull();
  expect(closed).toEqual([]);
  // With nothing asked, the next Escape closes the panel.
  await userEvent.keyboard('{Escape}');
  expect(closed).toEqual(['closed']);
});

it('clears the old outcome line when it asks about a removal', async () => {
  const host = await renderUi(
    <Harness initial={fullRun(['engine-1', 'fuel-tank-1', 'drill-1', null, null, null])} />,
  );
  await tabTo(/Install Drill, level 2/);
  await userEvent.keyboard('{Enter}');
  expect(byTestId(host, 'install-status').textContent).toContain("Can't install");
  await focusSlot(/^Slot 3, Drill/);
  await userEvent.keyboard('{Tab}{Enter}');
  expect(byTestId(host, 'install-status').textContent).toBe('');
});

it('refuses the last Engine and the last Fuel Tank in words, without asking', async () => {
  const host = await renderUi(<Harness initial={startRun(2026, 'scout')} />);
  await focusSlot(/^Slot 1, Engine/);
  await userEvent.keyboard('{Tab}{Enter}');
  expect(byTestId(host, 'install-status').textContent).toBe(
    "Can't remove. It is your last Engine, and without one you cannot fly.",
  );
  expect(host.querySelector('[data-testid="remove-confirm"]')).toBeNull();
  press(slotRadio(host, /^Slot 2, Fuel Tank/));
  press(button(host, /^Remove$/));
  expect(byTestId(host, 'install-status').textContent).toBe(
    "Can't remove. It is your last Fuel Tank, and without one you have no Fuel.",
  );
});

it('says how much Fuel is lost before the player confirms', async () => {
  const host = await renderUi(
    <Harness initial={fullRun(['engine-1', 'fuel-tank-1', 'fuel-tank-1', null, null, null])} />,
  );
  press(slotRadio(host, /^Slot 3, Fuel Tank/));
  press(button(host, /^Remove$/));
  const ask = byTestId(host, 'remove-confirm').textContent;
  expect(ask).toContain('66.0 t of Fuel will be lost.');
});

it.each(CHASSIS_IDS)(
  'keeps the longest removal refusal inside its box on the %s, with a line to spare',
  async (chassis) => {
    const host = await renderUi(<Harness initial={startRun(2026, chassis)} />);
    const status = byTestId(host, 'install-status');
    for (const [slot, reason] of [
      [/^Slot 1, Engine/, 'last Engine'],
      [/^Slot 2, Fuel Tank/, 'last Fuel Tank'],
    ] as const) {
      press(slotRadio(host, slot));
      press(button(host, /^Remove$/));
      expect(status.textContent).toContain(reason);
      expect(status.scrollHeight).toBeLessThanOrEqual(status.clientHeight);
      expect(status.scrollWidth).toBeLessThanOrEqual(status.clientWidth);
      // The status box takes two 12 px lines: the sentence must not need more than that, even with a
      // fallback font a little wider than VT323 (checked by the box clipping nothing above).
      const range = document.createRange();
      range.selectNodeContents(status);
      expect(range.getBoundingClientRect().height).toBeLessThanOrEqual(24);
      const panel = host.querySelector<HTMLElement>('.spacecraft-panel')?.getBoundingClientRect();
      expect(status.getBoundingClientRect().bottom).toBeLessThanOrEqual((panel?.bottom ?? 0) - 8);
    }
  },
);

it('keeps the Fuel-loss warning and its buttons inside the panel, with room to spare', async () => {
  const host = await renderUi(
    <Harness initial={fullRun(['engine-1', 'fuel-tank-2', 'fuel-tank-2', null, null, null])} />,
  );
  press(slotRadio(host, /^Slot 3, Fuel Tank/));
  press(button(host, /^Remove$/));
  const ask = byTestId(host, 'remove-confirm');
  expect(ask.textContent).toContain('of Fuel will be lost.');
  for (const el of [ask, ...ask.querySelectorAll<HTMLElement>('*')]) {
    expect(el.scrollWidth, el.className).toBeLessThanOrEqual(el.clientWidth);
    expect(el.scrollHeight, el.className).toBeLessThanOrEqual(el.clientHeight);
  }
  const askBox = ask.getBoundingClientRect();
  // It stays clear of the reserved About spot (#109) under it.
  expect(askBox.bottom).toBeLessThanOrEqual(
    byTestId(host, 'install-preview').getBoundingClientRect().top,
  );
  // 8 px of slack under the buttons: a wider fallback font can add a line of text above them.
  const buttons = ask.querySelector<HTMLElement>('.spacecraft-panel__confirm-buttons');
  const text = ask.querySelector<HTMLElement>('p');
  if (!buttons || !text) throw new Error('the confirm step is missing a part');
  expect(askBox.bottom - buttons.getBoundingClientRect().bottom).toBeGreaterThanOrEqual(8);
  // The text, measured as it flows, leaves two more lines before it meets the buttons.
  const range = document.createRange();
  range.selectNodeContents(text);
  expect(
    buttons.getBoundingClientRect().top - range.getBoundingClientRect().bottom,
  ).toBeGreaterThanOrEqual(24);
});

function previewText(host: HTMLElement): string {
  return byTestId(host, 'install-preview').textContent;
}

/** The Δv bar's name while a change is previewed: its figures and the change, in words. */
function previewDv(host: HTMLElement): string {
  const row = host.querySelector('[data-testid="preview-line"][data-stat="delta-v"]');
  return row?.querySelector('[role="img"]')?.getAttribute('aria-label') ?? '';
}

it('previews a Fuel Tank dropping Δv, in words, when its Install button is focused and before paying', async () => {
  const host = await renderUi(<Harness initial={startRun(2026, 'scout')} />);
  await tabTo(/Install Fuel Tank, level 1/);
  const text = previewText(host);
  expect(text).toContain('Install Fuel Tank 1');
  expect(text).toContain('28.8 km/s → 24.7 km/s');
  // The drop is a signed number by the bar, and in words in the bar's name.
  expect(text).toContain('−4.1');
  expect(previewDv(host)).toContain('Drops 4.1 km/s');
  expect(byTestId(host, 'preview-note').textContent).toBe('Starts empty, so Δv drops.');
  // The rest of the lesson waits behind "Tell me more" (#224: one short line of prose per panel).
  press(button(host, /Tell me more/));
  expect(byTestId(host, 'preview-more').textContent).toContain(
    `Filled up: 33.8${NBSP}km/s, up from 28.8${NBSP}km/s.`,
  );
  // Nothing was paid: the Materials and the Δv in the figures are as they were.
  expect(byTestId(host, 'install-target').textContent).toContain('25 Materials in stock');
  expect(byTestId(host, 'panel-delta-v').textContent).toBe('28.8 km/s');
});

it('previews the removal of the Component in the chosen Slot, and says why when it cannot be removed', async () => {
  const host = await renderUi(
    <Harness initial={fullRun(['engine-1', 'fuel-tank-1', 'drill-1', null, null, null])} />,
  );
  await focusSlot(/^Slot 3, Drill/);
  expect(previewText(host)).toContain('Remove Drill 1');
  // #224: the change is a signed number beside the bar, its unit with the figures above it.
  expect(previewText(host)).toContain('15.8 t → 15.0 t');
  expect(previewText(host)).toContain('−0.8');
  await focusSlot(/^Slot 1, Engine/);
  expect(previewText(host)).toContain('last Engine');
  expect(host.querySelector('[data-testid="preview-line"]')).toBeNull();
});

// The longest previews on every Chassis: each catalogue entry as an install, each Component as a
// removal. The text keeps 16 px inside its box and the block keeps 8 px above the panel's bottom,
// since VT323 and Silkscreen differ between machines.
it.each(CHASSIS_IDS)(
  'keeps every preview inside its box, with room to spare (%s)',
  async (chassis) => {
    const base = startRun(2026, chassis);
    const spacecraft = refit(base.spacecraft, [
      'engine-2',
      'fuel-tank-2',
      'fuel-tank-1',
      null,
      null,
      null,
    ]);
    const run: Run = { ...base, spacecraft: { ...spacecraft, fuelMass: spacecraft.fuelCapacity } };
    const host = await renderUi(<Harness initial={run} />);
    const panel = host.querySelector<HTMLElement>('.spacecraft-panel')?.getBoundingClientRect();
    const box = byTestId(host, 'install-preview');
    const check = (): void => {
      const area = box.getBoundingClientRect();
      expect(box.scrollHeight).toBeLessThanOrEqual(box.clientHeight);
      expect(area.bottom).toBeLessThanOrEqual((panel?.bottom ?? 0) - 8);
      for (const el of box.querySelectorAll<HTMLElement>('*')) {
        expect(el.scrollWidth, el.className).toBeLessThanOrEqual(el.clientWidth);
        // Only the elements that hold text themselves: a container's range is its whole box.
        if ([...el.childNodes].some((node) => node.nodeType !== Node.TEXT_NODE)) continue;
        const range = document.createRange();
        range.selectNodeContents(el);
        const text = range.getBoundingClientRect();
        if (text.width === 0) continue;
        // A sentence may wrap, in at most two lines; the figures keep to one line each, inside
        // the box (#224: the figures now end at the box's right edge, beside their bars).
        if (el.classList.contains('spacecraft-panel__note')) {
          expect(text.height, el.className).toBeLessThanOrEqual(24);
        } else {
          expect(text.right, el.className).toBeLessThanOrEqual(area.right);
          expect(text.height, el.className).toBeLessThanOrEqual(14);
        }
        expect(text.bottom, el.className).toBeLessThanOrEqual(area.bottom - 8);
      }
      // It stays clear of the picture above it (#224: the picture replaced the figures there).
      const picture = byTestId(host, 'spacecraft-figure');
      expect(area.top).toBeGreaterThanOrEqual(picture.getBoundingClientRect().bottom);
    };
    for (const id of COMPONENT_IDS) {
      await tabTo(new RegExp(`Install ${componentLabel(id)},`));
      check();
      await userEvent.keyboard('{Tab}');
    }
    for (const slot of [
      /^Slot 1, Engine/,
      /^Slot 2, Fuel Tank/,
      /^Slot 3, Fuel Tank/,
      /^Slot 4, empty/,
    ]) {
      await focusSlot(slot);
      check();
    }
  },
);

it('shows no figures, only a sentence, when every Slot is full and a catalogue entry is focused', async () => {
  const host = await renderUi(
    <Harness initial={fullRun(['engine-1', 'fuel-tank-1', 'drill-1', 'drill-1', null, null])} />,
  );
  await tabTo(/Install Engine, level 2/);
  expect(previewText(host)).toContain('Every Slot is full');
});

it('keeps the removal preview while the remove question is open, even when the catalogue is focused', async () => {
  const host = await renderUi(
    <Harness initial={fullRun(['engine-1', 'fuel-tank-1', 'drill-1', null, null, null])} />,
  );
  await focusSlot(/^Slot 3, Drill/);
  await userEvent.keyboard('{Tab}{Enter}');
  expect(previewText(host)).toContain('Remove Drill 1');
  await tabTo(/Install Engine, level 2/);
  expect(host.querySelector('[data-testid="remove-confirm"]')).not.toBeNull();
  expect(previewText(host)).toContain('Remove Drill 1');
});

it('says in a plain sentence why you might want an Engine, behind "Tell me more"', async () => {
  const host = await renderUi(<Harness initial={startRun(2026, 'scout')} />);
  await tabTo(/Install Engine, level 2/);
  // #224: the explanation moved behind "Tell me more"; the visible line says why Δv moves.
  expect(byTestId(host, 'preview-note').textContent).toBe('Better Isp, so Δv rises.');
  press(button(host, /Tell me more/));
  expect(byTestId(host, 'preview-more').textContent).toContain(COMPONENTS['engine-2'].explanation);
});

it('lists the Jump Drive from the first screen, previews it and refuses it plainly when unaffordable', async () => {
  const host = await renderUi(<Harness initial={startRun(2026, 'scout')} />);
  const row = [...host.querySelectorAll('[data-testid="component-row"]')].find((r) =>
    r.textContent.includes('Jump Drive'),
  );
  expect(row?.textContent).toContain('45 Materials');
  expect(row?.textContent).toContain('Need 20 more');
  await tabTo(/Install Jump Drive,/);
  expect(previewText(host)).toContain('Install Jump Drive');
  // #224: the drop is in the Δv bar's name and the short line; the explanation is behind the toggle.
  expect(previewDv(host)).toContain('Drops');
  expect(byTestId(host, 'preview-note').textContent).toBe('More mass, so Δv drops.');
  press(button(host, /Tell me more/));
  expect(byTestId(host, 'preview-more').textContent).toContain(
    COMPONENTS['jump-drive'].explanation,
  );
  act(() => {
    installButton(host, /Install Jump Drive,/).click();
  });
  expect(byTestId(host, 'install-status').textContent).toBe(
    "Can't install. Not enough Materials: it costs 45 and you have 25, 20 short.",
  );
});

it('greys out a second Jump Drive, says why in its entry, and refuses it plainly', async () => {
  const host = await renderUi(<Harness initial={runWith('lancer', 200)} />);
  const jumpDriveRow = (): HTMLElement | undefined =>
    [...host.querySelectorAll<HTMLElement>('[data-testid="component-row"]')].find((r) =>
      r.textContent.includes('Jump Drive'),
    );
  expect(jumpDriveRow()?.className).not.toContain('unavailable');
  act(() => {
    installButton(host, /Install Jump Drive,/).click();
  });
  const row = jumpDriveRow();
  expect(row?.className).toContain('spacecraft-panel__row--unavailable');
  const effect = row?.querySelector<HTMLElement>('[data-testid="component-effect"]');
  expect(effect?.textContent).toBe('You already carry a Jump Drive.');
  expect(effect && effect.scrollWidth <= effect.clientWidth).toBe(true);
  // A screen reader hears the reason on the Install button too.
  const button = installButton(host, /Install Jump Drive,/);
  const describedBy = button.getAttribute('aria-describedby') ?? '';
  expect(document.getElementById(describedBy)?.textContent).toBe('You already carry a Jump Drive.');
  // Focused, it previews no figures for a change that cannot happen, only the reason.
  act(() => {
    button.focus();
  });
  // #224: the preview block also holds the stat bars now, so the reason is read from its line.
  expect(byTestId(host, 'preview-note').textContent).toBe('You already carry a Jump Drive.');
  expect(host.querySelector('[data-testid="preview-line"]')).toBeNull();
  act(() => {
    button.click();
  });
  expect(byTestId(host, 'install-status').textContent).toBe(
    "Can't install. You already carry a Jump Drive.",
  );
});

// ---- The picture, the stat bars and the text budget (#224) ----

function callouts(host: HTMLElement): HTMLElement[] {
  return [...host.querySelectorAll<HTMLElement>('[role="radio"]')];
}

it('draws the Spacecraft with one callout per Slot, and names it in words', async () => {
  const run = fullRun(['engine-1', 'fuel-tank-1', 'drill-1', null, null, null]);
  const host = await renderUi(<Harness initial={run} />);
  const picture = host.querySelector<HTMLElement>('[role="img"][data-testid="spacecraft-picture"]');
  expect(picture?.getAttribute('aria-label')).toBe('Hauler: Engine 1, Fuel Tank 1, Drill 1');
  const slots = callouts(host);
  expect(slots.map((slot) => slot.getAttribute('aria-label'))).toEqual([
    'Slot 1, Engine, level 1',
    'Slot 2, Fuel Tank, level 1',
    'Slot 3, Drill, level 1',
    'Slot 4, empty',
  ]);
  // A fitted Slot shows its Component's icon; an empty one is an outline with no icon.
  expect(
    slots.map(
      (slot) =>
        slot.querySelector('[data-component-icon]')?.getAttribute('data-component-icon') ?? null,
    ),
  ).toEqual(['engine', 'fuel-tank', 'drill', null, null, null]);
  expect(slots.map((slot) => slot.dataset['state'])).toEqual([
    'fitted',
    'fitted',
    'fitted',
    'empty',
  ]);
  // Each fitted callout has its line to the Component art; the empty one has none.
  expect(host.querySelectorAll('[data-testid="callout-line"]')).toHaveLength(3);
});

it('adds the new Component to its callout and to the picture’s words when it is installed', async () => {
  const host = await renderUi(<Harness initial={startRun(2026, 'scout')} />);
  press(installButton(host, /Install Fuel Tank, level 1/));
  expect(slotRadio(host, /^Slot 3, Fuel Tank, level 1/).dataset['state']).toBe('fitted');
  expect(byTestId(host, 'spacecraft-picture').getAttribute('aria-label')).toBe(
    'Scout: Engine 1, Fuel Tank 1 ×2',
  );
});

it.each([4, 6])(
  'lays out %i Slots inside the picture, inside the 640×360 stage, with no two callouts overlapping',
  async (count) => {
    const slots: Slot[] = [
      'engine-1',
      'fuel-tank-1',
      'drill-2',
      ...Array<Slot>(count - 3).fill(null),
    ];
    const host = await renderUi(
      <section className="spacecraft-panel" style={{ left: 8, top: 52, width: 624, height: 292 }}>
        <div className="spacecraft-panel__left">
          <SpacecraftPicture
            chassisId="hauler"
            slots={slots}
            selected={0}
            onSelect={() => undefined}
            slotRef={() => undefined}
          />
        </div>
      </section>,
    );
    const stage = host.getBoundingClientRect();
    const picture = byTestId(host, 'spacecraft-figure').getBoundingClientRect();
    const boxes = callouts(host).map((slot) => slot.getBoundingClientRect());
    expect(boxes).toHaveLength(count);
    for (const box of boxes) {
      expect(box.left).toBeGreaterThanOrEqual(picture.left);
      expect(box.right).toBeLessThanOrEqual(picture.right);
      expect(box.top).toBeGreaterThanOrEqual(picture.top);
      expect(box.bottom).toBeLessThanOrEqual(picture.bottom);
      expect(box.right).toBeLessThanOrEqual(stage.left + 640);
      expect(box.bottom).toBeLessThanOrEqual(stage.top + 360);
    }
    for (const a of boxes) {
      for (const b of boxes) {
        if (a === b) continue;
        const apart =
          a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top;
        expect(apart).toBe(true);
      }
    }
  },
);

it('shows before-and-after bars for mass, Fuel and Δv, with the figures the simulation previews', async () => {
  const run = startRun(2026, 'scout');
  const host = await renderUi(<Harness initial={run} />);
  await tabTo(/Install Fuel Tank, level 1/);
  const after = preview(run.spacecraft, { kind: 'install', component: 'fuel-tank-1', slot: 2 });
  if (!after) throw new Error('expected a preview');
  const rows = [...host.querySelectorAll<HTMLElement>('[data-testid="preview-line"]')];
  expect(rows.map((row) => row.dataset['stat'])).toEqual(['mass', 'fuel', 'delta-v']);
  const expected = [
    [formatMass(run.spacecraft.dryMass), formatMass(after.dryMass)],
    [formatMass(run.spacecraft.fuelCapacity), formatMass(after.fuelCapacity)],
    [formatDeltaVKmS(availableDeltaV(run.spacecraft)), formatDeltaVKmS(after.deltaV)],
  ];
  rows.forEach((row, i) => {
    const [before, then] = expected[i] ?? [];
    // Seen: both figures beside the bar. Heard: both in the bar's name.
    expect(row.textContent).toContain(`${before ?? ''} → ${then ?? ''}`);
    expect(row.querySelector('[role="img"]')?.getAttribute('aria-label')).toContain(
      `${before ?? ''} now, ${then ?? ''} after`,
    );
  });
  // The bars themselves: the after fill is longer for more mass and Fuel, shorter for less Δv.
  const width = (row: HTMLElement | undefined, part: string): number =>
    row?.querySelector<HTMLElement>(`.stat-bar__${part}`)?.getBoundingClientRect().width ?? 0;
  const [mass, fuel, dv] = rows;
  expect(width(mass, 'after')).toBeGreaterThan(width(mass, 'now'));
  expect(width(fuel, 'after')).toBeGreaterThan(width(fuel, 'now'));
  expect(width(dv, 'after')).toBeLessThan(width(dv, 'now'));
});

it('keeps to the text budget: one short line beside the picture, one in each catalogue card', async () => {
  const host = await renderUi(<Harness initial={startRun(2026, 'scout')} />);
  const panel = host.querySelector<HTMLElement>('.spacecraft-panel');
  if (!panel) throw new Error('no panel');
  const cards = [...panel.querySelectorAll<HTMLElement>('[data-testid="component-row"]')];
  const outsideCards = [
    ...panel.querySelectorAll<HTMLElement>(
      '.spacecraft-panel__titlebar, .spacecraft-panel__left, .spacecraft-panel__catalogue-head',
    ),
  ];
  const check = (): void => {
    expectTextBudget(outsideCards);
    for (const card of cards) expectTextBudget(card);
  };
  check();
  // With a preview showing too, and with the Slot choice moved to a fitted Component.
  await tabTo(/Install Fuel Tank, level 1/);
  check();
  await focusSlot(/^Slot 1, Engine/);
  check();
});

it('keeps the lesson behind "Tell me more", and opens it by keyboard', async () => {
  const host = await renderUi(<Harness initial={startRun(2026, 'scout')} />);
  // The last catalogue entry: Tab then goes round by Close, the Slots and Remove to the toggle.
  await tabTo(/Install Jump Drive,/);
  expect(button(host, /Tell me more/).getAttribute('aria-expanded')).toBe('false');
  expect(byTestId(host, 'preview-more').checkVisibility()).toBe(false);
  await tabTo(/Tell me more/);
  await userEvent.keyboard('{Enter}');
  expect(button(host, /Tell me more/).getAttribute('aria-expanded')).toBe('true');
  expect(byTestId(host, 'preview-more').textContent).toContain(
    COMPONENTS['jump-drive'].explanation,
  );
  expect(byTestId(host, 'preview-more').checkVisibility()).toBe(true);
});

/** Seed 2026's Scout with its Fuel Tank (Slot 2 on screen, index 1) Damaged by a leak, and `stock` Materials. */
function leaking(stock: number): Run {
  const run = startRun(2026, 'scout');
  const damage = run.spacecraft.damage.map((d, slot) =>
    slot === 1 ? { repair: null, burning: null } : d,
  );
  return { ...run, materials: materials(stock), spacecraft: { ...run.spacecraft, damage } };
}

it('marks a Damaged Slot with smoke on its callout, says Damaged, and asks for its Repair (#250)', async () => {
  const host = await renderUi(<SpacecraftPanel run={leaking(25)} onClose={() => undefined} />);
  const callout = host.querySelector<HTMLButtonElement>('[role="radio"][data-state="damaged"]');
  if (!callout) throw new Error('Expected a Damaged callout');
  expect(callout.getAttribute('aria-label')).toBe('Slot 2, Fuel Tank, level 1, Damaged');
  expect(callout.querySelector('[data-testid="callout-smoke"]')).not.toBeNull();
  // Only one callout is Damaged.
  expect(host.querySelectorAll('[data-testid="callout-smoke"]')).toHaveLength(1);

  const asked: number[] = [];
  const off = EventBus.on('repair-requested', (slot) => asked.push(slot));
  await userEvent.click(callout);
  const repair = host.querySelector<HTMLButtonElement>('button[aria-label^="Repair Fuel Tank 1"]');
  if (!repair) throw new Error('Expected a Repair button');
  await userEvent.click(repair);
  off();
  expect(asked).toEqual([1]);
  // Focus goes back to the Slot.
  expect(document.activeElement).toBe(callout);
});

it('dims the Rush when the Materials cannot pay for it (#250)', async () => {
  const host = await renderUi(<SpacecraftPanel run={leaking(2)} onClose={() => undefined} />);
  const callout = host.querySelector<HTMLButtonElement>('[data-state="damaged"]');
  if (!callout) throw new Error('Expected a Damaged callout');
  await userEvent.click(callout);
  const rush = host.querySelector<HTMLButtonElement>('button[aria-label^="Rush the Repair"]');
  expect(rush?.disabled).toBe(true);
  cleanUp();
  const rich = await renderUi(<SpacecraftPanel run={leaking(25)} onClose={() => undefined} />);
  const richCallout = rich.querySelector<HTMLButtonElement>('[data-state="damaged"]');
  if (!richCallout) throw new Error('Expected a Damaged callout');
  await userEvent.click(richCallout);
  expect(
    rich.querySelector<HTMLButtonElement>('button[aria-label^="Rush the Repair"]')?.disabled,
  ).toBe(false);
});

it("lists the Radar at both levels with its icon and a range ring scaled to its level, and its preview's Δv", async () => {
  const host = await renderUi(<Harness initial={runWith('scout', 25)} />);
  const rows = [...host.querySelectorAll<HTMLElement>('[data-testid="component-row"]')];
  const ring = (level: number): number => {
    const row = rows.find((r) => r.textContent.includes(`Radar ${String(level)}`));
    const circle = row?.querySelector('[data-testid="radar-ring"] circle');
    if (!row?.querySelector('[data-component-icon="radar"], [aria-label="Radar"]') || !circle) {
      throw new Error(`no Radar ${String(level)} glyph`);
    }
    return Number(circle.getAttribute('r'));
  };
  expect(ring(2)).toBeGreaterThan(ring(1));
  await tabTo(/Install Radar, level 1,/);
  expect(previewText(host)).toMatch(/Δv/);
});
