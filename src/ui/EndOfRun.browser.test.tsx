import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act } from 'react';
import { readBestScore, recordScore } from '../game/lib/bestScore.ts';
import { score, startRun, type Run, type RunEnd, type Score } from '../game/sim/index.ts';
import { byTestId, cleanUp, renderUi } from './browserTestKit.tsx';
import { EndOfRun } from './EndOfRun.tsx';
import { expectTextBudget } from './textBudget.ts';

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

const ENDS = [
  { kind: 'fell-short', reason: LONG_REASON },
  { kind: 'crashed', reason: LONG_REASON },
  { kind: 'stranded', reason: LONG_REASON, bodyId: startRun(5, 'scout').starSystem.homePlanetId },
] as const satisfies readonly RunEnd[];

/** Whether the screen sits inside the 640x360 stage and nothing in it overflows or crowds the buttons. */
function expectFits(host: HTMLElement): void {
  const screen = byTestId(host, 'end-of-run');
  const stage = host.getBoundingClientRect();
  const box = screen.getBoundingClientRect();
  expect(box.left).toBeGreaterThanOrEqual(stage.left);
  expect(box.top).toBeGreaterThanOrEqual(stage.top);
  expect(box.right).toBeLessThanOrEqual(stage.left + 640);
  expect(box.bottom).toBeLessThanOrEqual(stage.top + 360);
  const body = screen.querySelector<HTMLElement>('.end-of-run__body');
  const actions = screen.querySelector<HTMLElement>('.end-of-run__actions');
  const scores = screen.querySelector<HTMLElement>('.end-of-run__scores');
  if (!body || !actions || !scores) throw new Error('no body');
  expect(body.scrollHeight).toBeLessThanOrEqual(body.clientHeight);
  const slack = body.getBoundingClientRect().bottom - actions.getBoundingClientRect().bottom;
  expect(slack).toBeGreaterThanOrEqual(8);
  const gap = actions.getBoundingClientRect().top - scores.getBoundingClientRect().bottom;
  expect(gap).toBeGreaterThanOrEqual(4);
}

it.each(ENDS)(
  'a Run that $kind keeps to the text budget: one short line, the rest behind Tell me more',
  async (end) => {
    const host = await show(ended(end, 3, 12));
    expectTextBudget(host);
    expectFits(host);
  },
);

it('shows the Score as a Star System icon and a Hop icon with their numbers, and the Best Score beside them', async () => {
  const bodyId = startRun(5, 'scout').starSystem.homePlanetId;
  const host = await show(ended({ kind: 'stranded', reason: LONG_REASON, bodyId }, 3, 12));
  const screen = byTestId(host, 'end-of-run');
  expect(screen.querySelector('h2')?.textContent).toBe('Stranded');
  expect(byTestId(host, 'end-of-run-score').getAttribute('aria-label')).toBe(
    'Score: 2 Star Systems escaped, 12 Hops flown',
  );
  expect(byTestId(host, 'end-of-run-score').textContent).toBe('Score212');
  expect(byTestId(host, 'end-of-run-best').getAttribute('aria-label')).toBe(
    'Best Score: 2 Star Systems escaped, 12 Hops flown (new Best Score)',
  );
  expect(byTestId(host, 'end-of-run-best').textContent).toContain('new Best Score');
  const score = byTestId(host, 'end-of-run-score').getBoundingClientRect();
  const best = byTestId(host, 'end-of-run-best').getBoundingClientRect();
  expect(best.left).toBeGreaterThanOrEqual(score.right);
  expect(Math.abs(best.top - score.top)).toBeLessThan(8);
  const labels = [...screen.querySelectorAll('button')].map((b) => b.textContent);
  expect(labels).toEqual(['Tell me more', 'Back to title', 'New Run']);
  expect(document.activeElement?.textContent).toBe('New Run');
});

it('every icon has an accessible name that carries its number', async () => {
  const host = await show(ended({ kind: 'crashed', reason: 'x' }, 2, 1));
  const icons = [...host.querySelectorAll('svg')];
  expect(icons.map((icon) => icon.getAttribute('aria-label'))).toEqual([
    '1 Star System escaped',
    '1 Hop flown',
    '1 Star System escaped',
    '1 Hop flown',
  ]);
  for (const icon of icons) expect(icon.getAttribute('role')).toBe('img');
});

it('the whole reason and the Score rule wait behind Tell me more, and show once it is open', async () => {
  const host = await show(ended({ kind: 'crashed', reason: LONG_REASON }));
  const why = byTestId(host, 'end-of-run-why');
  expect(why.textContent).toBe(LONG_REASON);
  expect(why.checkVisibility()).toBe(false);
  const more = [...host.querySelectorAll('button')].find((b) => b.textContent === 'Tell me more');
  if (!more) throw new Error('no Tell me more');
  act(() => {
    more.click();
  });
  expect(why.checkVisibility()).toBe(true);
  expect(host.textContent).toContain('More Star Systems escaped wins; fewer Hops breaks a tie.');
});

it('a Run with fewer Hops than the stored Best Score, in the same Star Systems, is the new Best Score', async () => {
  store({ starSystemsEscaped: 0, hopsFlown: 5 });
  const host = await show(ended({ kind: 'crashed', reason: 'x' }, 1, 3));
  expect(byTestId(host, 'end-of-run-best').getAttribute('aria-label')).toBe(
    'Best Score: 0 Star Systems escaped, 3 Hops flown (new Best Score)',
  );
  expect(readBestScore()).toEqual({ starSystemsEscaped: 0, hopsFlown: 3 });
});

it('a Run with more Hops than the stored Best Score keeps it, with no new-best label', async () => {
  store({ starSystemsEscaped: 0, hopsFlown: 3 });
  const host = await show(ended({ kind: 'fell-short', reason: 'y' }, 1, 5));
  expect(byTestId(host, 'end-of-run-score').getAttribute('aria-label')).toBe(
    'Score: 0 Star Systems escaped, 5 Hops flown',
  );
  expect(byTestId(host, 'end-of-run-best').getAttribute('aria-label')).toBe(
    'Best Score: 0 Star Systems escaped, 3 Hops flown',
  );
  expect(readBestScore()).toEqual({ starSystemsEscaped: 0, hopsFlown: 3 });
});

it('works with storage unavailable', async () => {
  vi.spyOn(window, 'localStorage', 'get').mockImplementation(() => {
    throw new DOMException('blocked', 'SecurityError');
  });
  const host = await show(ended({ kind: 'crashed', reason: 'z' }));
  expect(byTestId(host, 'end-of-run-score').getAttribute('aria-label')).toBe(
    'Score: 0 Star Systems escaped, 3 Hops flown',
  );
  expect(byTestId(host, 'end-of-run-best').getAttribute('aria-label')).toContain(
    '0 Star Systems escaped, 3 Hops flown',
  );
});

it('the buttons call their actions, and Tab wraps between them', async () => {
  const onNewRun = vi.fn();
  const onLeave = vi.fn();
  const host = await show(ended({ kind: 'crashed', reason: 'z' }), { onNewRun, onLeave });
  const [, back, newRun] = [...host.querySelectorAll('button')];
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
  expect(byTestId(host, 'end-of-run-best').getAttribute('aria-label')).toBe(
    'Today’s Daily Best: 2 Star Systems escaped, 12 Hops flown (new Daily Best)',
  );
  expectTextBudget(host);
  expectFits(host);
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
  expect(byTestId(host, 'end-of-run-best').getAttribute('aria-label')).toBe(
    'Today’s Daily Best: 4 Star Systems escaped, 20 Hops flown',
  );
});
