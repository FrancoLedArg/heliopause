import '@fontsource/silkscreen/400.css';
import '@fontsource/vt323/400.css';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, expect, it } from 'vitest';
import { listBodies, startRun, type BodyId } from '../game/sim/index.ts';
import { NavChartPanel } from './NavChartPanel.tsx';
import '../style.css';

let root: Root | undefined;
let host: HTMLElement | undefined;

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  host?.remove();
  root = host = undefined;
});

/** Renders the panel at native scale with focus on one Body, once the pixel fonts have loaded. */
async function showFocused(seed: number, focusedId: string): Promise<HTMLElement> {
  const run = startRun(seed, 'scout');
  host = document.createElement('div');
  host.className = 'stage__ui';
  document.body.append(host);
  root = createRoot(host);
  act(() => {
    root?.render(
      <div className="game-ui">
        <NavChartPanel
          run={run}
          state={{ focusedId: focusedId as BodyId, selectedId: undefined }}
        />
      </div>,
    );
  });
  await document.fonts.load('14px VT323');
  await document.fonts.load('8px Silkscreen');
  await document.fonts.ready;
  const tooltip = host.querySelector<HTMLElement>('[data-testid="inspect"]');
  if (!tooltip) throw new Error('no tooltip');
  return tooltip;
}

// Seed 2024's Milos is the one the review saw overflow; seed 533's has the longest reason in 3000 seeds.
it.each([
  [2024, 'planet-4', 'Milos'],
  [12, 'planet-5', 'Xiolvonzae Minor'],
  [533, 'planet-5', 'Priosprysmur Minor'],
  [2024, 'planet-3', 'Zymir'],
])('fits the reason inside the tooltip frame (seed %i, %s)', async (seed, id, name) => {
  const tooltip = await showFocused(seed, id);
  const verdict = tooltip.querySelector<HTMLElement>('[data-testid="verdict"]');
  if (!verdict) throw new Error('no verdict');
  expect(verdict.textContent).toContain(name);
  const frame = tooltip.getBoundingClientRect();
  const text = verdict.getBoundingClientRect();
  // The frame's border is 2 px; the text keeps inside it, on every side.
  expect(text.bottom).toBeLessThanOrEqual(frame.bottom - 3);
  expect(text.right).toBeLessThanOrEqual(frame.right - 3);
  expect(verdict.scrollWidth).toBeLessThanOrEqual(verdict.clientWidth);
});

// The Hop plan is the densest block on the panel. Its longest states (a low chance, and a Margin below
// zero with its stronger warning) must keep every line, reason and note inside the plan area, above
// the buttons, and the explanation under the chart must fit its box and the frame.
it.each(['scout', 'hauler'] as const)(
  'keeps the whole Hop plan above Cancel and Launch, and the Δv explanation inside the frame (%s, seed 123 Thakyxy)',
  async (chassis) => {
    const run = startRun(123, chassis);
    const far = listBodies(run.starSystem).find((b) => b.name === 'Thakyxy');
    if (!far) throw new Error('seed 123 has no Thakyxy');
    host = document.createElement('div');
    host.className = 'stage__ui';
    document.body.append(host);
    root = createRoot(host);
    act(() => {
      root?.render(
        <div className="game-ui">
          <NavChartPanel run={run} state={{ focusedId: far.id, selectedId: far.id }} />
        </div>,
      );
    });
    await document.fonts.load('14px VT323');
    await document.fonts.load('8px Silkscreen');
    await document.fonts.ready;
    const plan = host.querySelector<HTMLElement>('[data-testid="hop-plan"]');
    const warning = host.querySelector<HTMLElement>('[data-testid="plan-warning"]');
    const explain = host.querySelector<HTMLElement>('[data-testid="plan-explain"]');
    const frame = host.querySelector<HTMLElement>('.nav-chart__panel');
    const buttons = host.querySelector<HTMLElement>('.nav-chart__actions');
    if (!plan || !warning || !explain || !frame || !buttons) throw new Error('missing plan parts');
    const buttonsTop = buttons.getBoundingClientRect().top;
    expect(warning.getBoundingClientRect().bottom).toBeLessThanOrEqual(buttonsTop);
    // Everything in the plan, down to its last line, sits inside the plan area and above the buttons.
    expect(plan.scrollHeight).toBeLessThanOrEqual(plan.clientHeight);
    expect(plan.lastElementChild?.getBoundingClientRect().bottom ?? 0).toBeLessThanOrEqual(
      buttonsTop,
    );
    // One line of 11 px, and not cut off.
    expect(warning.getBoundingClientRect().height).toBeLessThanOrEqual(12);
    expect(warning.scrollWidth).toBeLessThanOrEqual(warning.clientWidth);
    for (const reason of host.querySelectorAll<HTMLElement>('[data-testid="burn-reason"]')) {
      expect(reason.scrollWidth).toBeLessThanOrEqual(reason.clientWidth);
    }
    // The explanation under the chart is not cut off by its box or the panel frame.
    expect(explain.scrollHeight).toBeLessThanOrEqual(explain.clientHeight);
    expect(explain.getBoundingClientRect().bottom).toBeLessThanOrEqual(
      frame.getBoundingClientRect().bottom,
    );
  },
);
