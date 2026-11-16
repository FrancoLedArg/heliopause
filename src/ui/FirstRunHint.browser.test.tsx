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

it('points the Heliopause hint at its mark on the open chart, below it (#313)', async () => {
  const spot = { x: 400, y: 120 };
  const host = await renderUi(
    <div className="game-ui" style={{ width: 640, height: 360, position: 'relative' }}>
      <div className="landed-nav-button">
        <button type="button">Nav Chart (M)</button>
      </div>
      <FirstRunHint
        wanted={['heliopause-found']}
        seen={new Set()}
        onDismiss={() => undefined}
        heliopauseSpot={spot}
      />
    </div>,
  );
  const callout = await shown(host);
  const frame = host.querySelector('.game-ui')?.getBoundingClientRect();
  const box = callout.getBoundingClientRect();
  const scale = (frame?.width ?? 640) / 640;
  expect(box.top - (frame?.top ?? 0)).toBeGreaterThanOrEqual(spot.y * scale);
  expect(box.left + box.width / 2 - (frame?.left ?? 0)).toBeCloseTo(spot.x * scale, 0);
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

it('points the Science hint at the Science chip, below it, inside the 640x360 stage (#342)', async () => {
  const host = await renderUi(
    <div className="game-ui" style={{ width: 640, height: 360, position: 'relative' }}>
      <div className="top-bar">
        <span data-testid="science" style={{ position: 'absolute', left: 600, top: 4 }}>
          3
        </span>
      </div>
      <FirstRunHint wanted={['first-science']} seen={new Set()} onDismiss={() => undefined} />
    </div>,
  );
  const callout = await shown(host);
  const frame = host.querySelector('.game-ui')?.getBoundingClientRect();
  const chip = byTestId(host, 'science').getBoundingClientRect();
  const box = callout.getBoundingClientRect();
  expect(box.top).toBeGreaterThanOrEqual(chip.bottom);
  expect(box.left).toBeGreaterThanOrEqual(frame?.left ?? 0);
  expect(box.right).toBeLessThanOrEqual(frame?.right ?? 640);
});
