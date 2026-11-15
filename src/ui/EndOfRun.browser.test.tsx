import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act } from 'react';
import { readBestScore, recordScore } from '../game/lib/bestScore.ts';
import { score, startRun, type Run, type RunEnd, type Score } from '../game/sim/index.ts';
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

/** Records the Run's Score as the game does when the Run ends, then shows the End-of-Run screen. */
async function show(
  run: Run,
  actions: { onNewRun?: () => void; onLeave?: () => void } = {},
): Promise<HTMLElement> {
  const recorded = recordScore(score(run));
  return renderUi(
    <EndOfRun
      run={run}
      recorded={recorded}
      onNewRun={actions.onNewRun ?? (() => undefined)}
      onLeave={actions.onLeave ?? (() => undefined)}
    />,
  );
}

function store(best: Score): void {
  window.localStorage.setItem('heliopause:best-score', JSON.stringify(best));
}

const LONG_REASON =
  'Even with every removable Component removed, your Spacecraft has 1.2 km/s of Δv, and the ' +
  'cheapest Hop needs 1.9 km/s. Remove nothing more: there is nothing left to remove.';

it('shows the Score, how the Run ended and why, the Best Score, the rule and both ways on, inside its panel', async () => {
  const bodyId = startRun(5, 'scout').starSystem.homePlanetId;
  const host = await show(ended({ kind: 'stranded', reason: LONG_REASON, bodyId }, 3, 12));
  const screen = byTestId(host, 'end-of-run');
  expect(screen.querySelector('h2')?.textContent).toBe('Stranded');
  expect(byTestId(host, 'end-of-run-why').textContent).toBe(LONG_REASON);
  expect(byTestId(host, 'end-of-run-score').textContent).toBe(
    '2 Star Systems escaped, 12 Hops flown',
  );
  expect(byTestId(host, 'end-of-run-best').textContent).toContain('(new Best Score)');
  expect(screen.textContent).toContain('More Star Systems escaped wins; fewer Hops breaks a tie.');
  const labels = [...screen.querySelectorAll('button')].map((b) => b.textContent);
  expect(labels).toEqual(['Back to title', 'New Run']);
  // Nothing overflows, and the buttons keep real slack above the panel's bottom edge for wider fonts.
  const body = screen.querySelector<HTMLElement>('.end-of-run__body');
  const actions = screen.querySelector<HTMLElement>('.end-of-run__actions');
  const rule = screen.querySelector<HTMLElement>('.end-of-run__rule');
  if (!body || !actions || !rule) throw new Error('no body');
  expect(body.scrollHeight).toBeLessThanOrEqual(body.clientHeight);
  const slack = body.getBoundingClientRect().bottom - actions.getBoundingClientRect().bottom;
  expect(slack).toBeGreaterThanOrEqual(8);
  const gap = actions.getBoundingClientRect().top - rule.getBoundingClientRect().bottom;
  expect(gap).toBeGreaterThanOrEqual(8);
  // New Run takes focus.
  expect(document.activeElement?.textContent).toBe('New Run');
});

it('a Run with fewer Hops than the stored Best Score, in the same Star Systems, is the new Best Score', async () => {
  store({ starSystemsEscaped: 0, hopsFlown: 5 });
  const host = await show(ended({ kind: 'crashed', reason: 'x' }, 1, 3));
  expect(byTestId(host, 'end-of-run-best').textContent).toBe(
    '0 Star Systems escaped, 3 Hops flown (new Best Score)',
  );
  expect(readBestScore()).toEqual({ starSystemsEscaped: 0, hopsFlown: 3 });
});

it('a Run with more Hops than the stored Best Score keeps it, with no new-best label', async () => {
  store({ starSystemsEscaped: 0, hopsFlown: 3 });
  const host = await show(ended({ kind: 'fell-short', reason: 'y' }, 1, 5));
  expect(byTestId(host, 'end-of-run-score').textContent).toBe(
    '0 Star Systems escaped, 5 Hops flown',
  );
  expect(byTestId(host, 'end-of-run-best').textContent).toBe(
    '0 Star Systems escaped, 3 Hops flown',
  );
  expect(readBestScore()).toEqual({ starSystemsEscaped: 0, hopsFlown: 3 });
});

it('works with storage unavailable', async () => {
  vi.spyOn(window, 'localStorage', 'get').mockImplementation(() => {
    throw new DOMException('blocked', 'SecurityError');
  });
  const host = await show(ended({ kind: 'crashed', reason: 'z' }));
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
  const host = await show(ended({ kind: 'crashed', reason: 'z' }), { onNewRun, onLeave });
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

it('a Daily Run’s screen calls the best row Today’s Daily Best, marks a new one, and still fits', async () => {
  const run = ended({ kind: 'crashed', reason: LONG_REASON }, 3, 12);
  const host = await renderUi(
    <EndOfRun
      run={run}
      recorded={{ best: score(run), isNewBest: true, dailyDay: '2026-11-15' }}
      onNewRun={() => undefined}
      onLeave={() => undefined}
    />,
  );
  const screen = byTestId(host, 'end-of-run');
  expect(screen.textContent).toContain('Today’s Daily Best');
  expect(screen.textContent).not.toContain('Best Score');
  expect(byTestId(host, 'end-of-run-best').textContent).toBe(
    '2 Star Systems escaped, 12 Hops flown (new Daily Best)',
  );
  const body = screen.querySelector<HTMLElement>('.end-of-run__body');
  const actions = screen.querySelector<HTMLElement>('.end-of-run__actions');
  const rule = screen.querySelector<HTMLElement>('.end-of-run__rule');
  if (!body || !actions || !rule) throw new Error('no body');
  expect(body.scrollHeight).toBeLessThanOrEqual(body.clientHeight);
  const slack = body.getBoundingClientRect().bottom - actions.getBoundingClientRect().bottom;
  expect(slack).toBeGreaterThanOrEqual(8);
  const gap = actions.getBoundingClientRect().top - rule.getBoundingClientRect().bottom;
  expect(gap).toBeGreaterThanOrEqual(8);
  const best = byTestId(host, 'end-of-run-best').getBoundingClientRect();
  expect(best.right).toBeLessThanOrEqual(screen.getBoundingClientRect().right);
});

it('a Daily Run that did not beat today’s Daily Best shows it without a new marker', async () => {
  const run = ended({ kind: 'crashed', reason: 'x' }, 1, 5);
  const host = await renderUi(
    <EndOfRun
      run={run}
      recorded={{
        best: { starSystemsEscaped: 4, hopsFlown: 20 },
        isNewBest: false,
        dailyDay: '2026-11-15',
      }}
      onNewRun={() => undefined}
      onLeave={() => undefined}
    />,
  );
  expect(byTestId(host, 'end-of-run-best').textContent).toBe(
    '4 Star Systems escaped, 20 Hops flown',
  );
});
