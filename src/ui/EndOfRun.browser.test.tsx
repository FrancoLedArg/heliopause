import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act } from 'react';
import { readBestScore } from '../game/lib/bestScore.ts';
import { startRun, type Run, type RunEnd } from '../game/sim/index.ts';
import { byTestId, cleanUp, renderUi } from './browserTestKit.tsx';
import { EndOfRun } from './EndOfRun.tsx';

beforeEach(() => {
  window.localStorage.clear();
});
afterEach(() => {
  cleanUp();
  vi.restoreAllMocks();
});

function ended(end: RunEnd, starSystemNumber = 1, hopsFlown = 3): Run {
  return {
    ...startRun(5, 'scout'),
    starSystemNumber,
    hopsFlown,
    status: { kind: 'ended', end },
  };
}

const LONG_REASON =
  'Even with every removable Component removed, your Spacecraft has 1.2 km/s of Δv, and the ' +
  'cheapest Hop needs 1.9 km/s. Remove nothing more: there is nothing left to remove.';

it('shows the Score, how the Run ended and why, the Best Score and both ways on, inside its panel', async () => {
  const host = await renderUi(
    <EndOfRun
      run={ended({ kind: 'stranded', reason: LONG_REASON }, 3, 12)}
      onNewRun={() => undefined}
      onLeave={() => undefined}
    />,
  );
  const screen = byTestId(host, 'end-of-run');
  expect(screen.querySelector('h2')?.textContent).toBe('Stranded');
  expect(byTestId(host, 'end-of-run-why').textContent).toBe(LONG_REASON);
  expect(byTestId(host, 'end-of-run-score').textContent).toBe(
    '2 Star Systems escaped, 12 Hops flown',
  );
  expect(byTestId(host, 'end-of-run-best').textContent).toContain('(new Best Score)');
  const labels = [...screen.querySelectorAll('button')].map((b) => b.textContent);
  expect(labels).toEqual(['Back to title', 'New Run']);
  // Nothing overflows, and the buttons keep real slack above the panel's bottom edge for wider fonts.
  const body = screen.querySelector<HTMLElement>('.end-of-run__body');
  const actions = screen.querySelector<HTMLElement>('.end-of-run__actions');
  if (!body || !actions) throw new Error('no body');
  expect(body.scrollHeight).toBeLessThanOrEqual(body.clientHeight);
  const slack = body.getBoundingClientRect().bottom - actions.getBoundingClientRect().bottom;
  expect(slack).toBeGreaterThanOrEqual(8);
  const gap =
    actions.getBoundingClientRect().top -
    (screen.querySelector('.end-of-run__scores')?.getBoundingClientRect().bottom ?? 0);
  expect(gap).toBeGreaterThanOrEqual(8);
  // New Run takes focus.
  expect(document.activeElement?.textContent).toBe('New Run');
});

it('keeps the Best Score of an earlier Run when this one is worse, and says so without colour', async () => {
  await renderUi(
    <EndOfRun
      run={ended({ kind: 'crashed', reason: 'x' }, 3, 2)}
      onNewRun={() => undefined}
      onLeave={() => undefined}
    />,
  );
  cleanUp();
  const host = await renderUi(
    <EndOfRun
      run={ended({ kind: 'fell-short', reason: 'y' }, 2, 40)}
      onNewRun={() => undefined}
      onLeave={() => undefined}
    />,
  );
  expect(byTestId(host, 'end-of-run-score').textContent).toBe(
    '1 Star System escaped, 40 Hops flown',
  );
  expect(byTestId(host, 'end-of-run-best').textContent).toBe(
    '2 Star Systems escaped, 2 Hops flown',
  );
  expect(readBestScore()).toEqual({ starSystemsEscaped: 2, hopsFlown: 2 });
});

it('works with storage unavailable', async () => {
  vi.spyOn(window, 'localStorage', 'get').mockImplementation(() => {
    throw new DOMException('blocked', 'SecurityError');
  });
  const host = await renderUi(
    <EndOfRun
      run={ended({ kind: 'crashed', reason: 'z' })}
      onNewRun={() => undefined}
      onLeave={() => undefined}
    />,
  );
  expect(byTestId(host, 'end-of-run-score').textContent).toBe(
    '0 Star Systems escaped, 3 Hops flown',
  );
  expect(byTestId(host, 'end-of-run-best').textContent).toContain(
    '0 Star Systems escaped, 3 Hops flown',
  );
});

it('the buttons call their actions, and Tab wraps between them', async () => {
  const onNewRun = vi.fn();
  const onLeave = vi.fn();
  const host = await renderUi(
    <EndOfRun
      run={ended({ kind: 'crashed', reason: 'z' })}
      onNewRun={onNewRun}
      onLeave={onLeave}
    />,
  );
  const [back, newRun] = [...host.querySelectorAll('button')];
  if (!back || !newRun) throw new Error('no buttons');
  act(() => {
    newRun.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }),
    );
  });
  expect(document.activeElement).toBe(back);
  act(() => {
    back.click();
    newRun.click();
  });
  expect(onLeave).toHaveBeenCalledOnce();
  expect(onNewRun).toHaveBeenCalledOnce();
});
