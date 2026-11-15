import { useState } from 'react';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { act } from 'react';
import { markHintSeen, readSeenHints, type HintId } from '../game/lib/firstRunHints.ts';
import { byTestId, cleanUp, renderUi } from './browserTestKit.tsx';
import { FirstRunHint } from './FirstRunHint.tsx';

beforeEach(() => {
  window.localStorage.clear();
});
afterEach(() => {
  cleanUp();
  window.localStorage.clear();
});

/** The Landed view's Nav Chart button and the hint over it, wired as GameUI wires them. */
function Landed() {
  const [seen, setSeen] = useState(() => readSeenHints());
  return (
    <>
      <div className="landed-nav-button">
        <button type="button">Nav Chart (M)</button>
      </div>
      <FirstRunHint
        wanted={['first-landing']}
        seen={seen}
        onDismiss={(id: HintId) => {
          markHintSeen(id);
          setSeen(readSeenHints());
        }}
      />
    </>
  );
}

const hint = (host: HTMLElement): HTMLElement | null =>
  host.querySelector<HTMLElement>('[data-testid="first-run-hint"]');

async function shown(host: HTMLElement): Promise<HTMLElement> {
  await expect.poll(() => hint(host)).not.toBeNull();
  return byTestId(host, 'first-run-hint');
}

it('shows one short line over the Nav Chart button, announced politely, and Esc dismisses it', async () => {
  const host = await renderUi(<Landed />);
  const callout = await shown(host);
  expect(callout.textContent).toBe('Plan your next Hop');
  expect(byTestId(host, 'first-run-hint-live').getAttribute('aria-live')).toBe('polite');
  // It sits above the button, centred on it, and never takes a click.
  const button = host.querySelector('.landed-nav-button button')?.getBoundingClientRect();
  const box = callout.getBoundingClientRect();
  expect(box.bottom).toBeLessThanOrEqual(button?.top ?? 0);
  expect(getComputedStyle(callout).pointerEvents).toBe('none');

  act(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
  });
  await expect.poll(() => hint(host)).toBeNull();
  expect(readSeenHints().has('first-landing')).toBe(true);
});

it('does not come back after a reload once dismissed', async () => {
  let host = await renderUi(<Landed />);
  await shown(host);
  act(() => {
    window.dispatchEvent(new PointerEvent('pointerdown'));
  });
  await expect.poll(() => hint(host)).toBeNull();

  cleanUp();
  host = await renderUi(<Landed />);
  await new Promise((resolve) => setTimeout(resolve, 300));
  expect(hint(host)).toBeNull();
});
