import { afterEach, expect, it } from 'vitest';
import { GAME_HEIGHT, GAME_WIDTH } from '../game/main.ts';
import { TITLE_PANEL_BOTTOM, TITLE_PANEL_TOP } from '../game/lib/titleLayout.ts';
import { cleanUp, renderUi } from './browserTestKit.tsx';
import { HowToPlayPanel } from './InfoPanels.tsx';
import { TitleMenu } from './TitleMenu.tsx';

afterEach(cleanUp);

const noop = (): void => undefined;

function inside(box: DOMRect): boolean {
  return box.left >= 0 && box.top >= 0 && box.right <= GAME_WIDTH && box.bottom <= GAME_HEIGHT;
}

function apart(a: DOMRect, b: DOMRect): boolean {
  return a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top;
}

function part(host: HTMLElement, selector: string): HTMLElement {
  const found = host.querySelector<HTMLElement>(selector);
  if (!found) throw new Error(`nothing matches ${selector}`);
  return found;
}

it('the title menu shows five actions in order, fitting 640x360 beside the Best Score and the AI-art label', async () => {
  const host = await renderUi(
    <>
      <TitleMenu
        starting={false}
        onNewRun={noop}
        onDaily={noop}
        today="2026-11-15"
        dailyBest={{ starSystemsEscaped: 12, hopsFlown: 120 }}
        onHowToPlay={noop}
        onAbout={noop}
        onCredits={noop}
        best={{ starSystemsEscaped: 3, hopsFlown: 12 }}
      />
      <p className="hud-tag ai-label">AI-generated art and music</p>
    </>,
  );
  const buttons = [...host.querySelectorAll<HTMLButtonElement>('.title-menu__panel button')];
  expect(buttons.map((b) => b.textContent)).toEqual([
    'New Run',
    'Daily Star System',
    'How to play',
    'About',
    'Credits & References',
  ]);
  expect(buttons.map((b) => b.disabled)).toEqual([false, false, false, false, false]);

  const panel = part(host, '.title-menu__panel').getBoundingClientRect();
  expect(panel.top).toBe(TITLE_PANEL_TOP);
  expect(panel.bottom).toBe(TITLE_PANEL_BOTTOM);
  const boxes = buttons.map((b) => b.getBoundingClientRect());
  boxes.forEach((box, i) => {
    expect(box.left).toBeGreaterThanOrEqual(panel.left);
    expect(box.right).toBeLessThanOrEqual(panel.right);
    expect(box.top).toBeGreaterThanOrEqual(panel.top);
    expect(box.bottom).toBeLessThanOrEqual(panel.bottom);
    const next = boxes[i + 1];
    if (next) expect(box.bottom).toBeLessThanOrEqual(next.top);
  });
  for (const label of host.querySelectorAll<HTMLElement>('.title-menu__panel .kit-button__label')) {
    expect(label.scrollWidth).toBeLessThanOrEqual(label.clientWidth);
  }

  const best = part(host, '[data-testid="title-best-score"]');
  const daily = part(host, '[data-testid="title-daily-best"]');
  expect(daily.textContent).toBe(
    'Daily Star System 2026-11-15 UTC: 12 Star Systems escaped, 120 Hops flown',
  );
  expect(inside(daily.getBoundingClientRect())).toBe(true);
  expect(apart(daily.getBoundingClientRect(), best.getBoundingClientRect())).toBe(true);
  expect(apart(daily.getBoundingClientRect(), panel)).toBe(true);
  expect(
    apart(daily.getBoundingClientRect(), part(host, '.ai-label').getBoundingClientRect()),
  ).toBe(true);
  expect(
    apart(daily.getBoundingClientRect(), part(host, '.title-menu__build').getBoundingClientRect()),
  ).toBe(true);
  const aiLabel = part(host, '.ai-label');
  expect(inside(best.getBoundingClientRect())).toBe(true);
  expect(apart(best.getBoundingClientRect(), panel)).toBe(true);
  expect(apart(aiLabel.getBoundingClientRect(), panel)).toBe(true);
  expect(getComputedStyle(aiLabel).visibility).toBe('visible');
  expect(inside(aiLabel.getBoundingClientRect())).toBe(true);
});

it('How to play renders in the shell with its eight steps, no sideways overflow and the AI-art label visible', async () => {
  const host = await renderUi(
    <>
      <HowToPlayPanel onBack={noop} />
      <p className="hud-tag ai-label">AI-generated art and music</p>
    </>,
  );
  const plate = part(host, '.info-panel__plate');
  const body = part(host, '.info-panel__body');
  const back = part(host, '.info-panel__actions button');
  const label = part(host, '.ai-label');
  expect(part(host, '.info-panel__title').textContent).toBe('How to play');
  expect(host.querySelectorAll('h2')).toHaveLength(8);
  expect(inside(plate.getBoundingClientRect())).toBe(true);
  expect(inside(back.getBoundingClientRect())).toBe(true);
  expect(body.scrollWidth).toBeLessThanOrEqual(body.clientWidth);
  expect(apart(label.getBoundingClientRect(), plate.getBoundingClientRect())).toBe(true);
  expect(getComputedStyle(label).visibility).toBe('visible');
});

it('the Daily line reads "not played yet" before a Daily Run has been finished', async () => {
  const host = await renderUi(
    <TitleMenu
      starting={false}
      onNewRun={noop}
      onDaily={noop}
      onHowToPlay={noop}
      onAbout={noop}
      onCredits={noop}
      today="2026-11-15"
    />,
  );
  expect(part(host, '[data-testid="title-daily-best"]').textContent).toBe(
    'Daily Star System 2026-11-15 UTC: not played yet',
  );
});
