import '@fontsource/silkscreen/400.css';
import '@fontsource/vt323/400.css';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, expect, it } from 'vitest';
import { startRun, type BodyId } from '../game/sim/index.ts';
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
