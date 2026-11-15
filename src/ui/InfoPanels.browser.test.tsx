import { afterEach, expect, it } from 'vitest';
import { GAME_HEIGHT, GAME_WIDTH } from '../game/main.ts';
import { cleanUp, renderUi } from './browserTestKit.tsx';
import { AboutPanel, CreditsPanel, HowToPlayPanel } from './InfoPanels.tsx';

afterEach(cleanUp);

function inside(box: DOMRect): boolean {
  return box.left >= 0 && box.top >= 0 && box.right <= GAME_WIDTH && box.bottom <= GAME_HEIGHT;
}

function apart(a: DOMRect, b: DOMRect): boolean {
  return a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top;
}

async function show(panel: 'credits' | 'about'): Promise<HTMLElement> {
  const onBack = (): void => undefined;
  return renderUi(
    <>
      {panel === 'credits' ? <CreditsPanel onBack={onBack} /> : <AboutPanel onBack={onBack} />}
      <p className="hud-tag ai-label">AI-generated art and music</p>
    </>,
  );
}

function part(host: HTMLElement, selector: string): HTMLElement {
  const found = host.querySelector<HTMLElement>(selector);
  if (!found) throw new Error(`nothing matches ${selector}`);
  return found;
}

it('Credits & References fits the 640x360 stage and keeps the AI-art label visible', async () => {
  const host = await show('credits');
  const plate = part(host, '.info-panel__plate');
  const body = part(host, '.info-panel__body');
  const title = part(host, '.info-panel__title');
  const back = part(host, '.info-panel__actions button');
  const label = part(host, '.ai-label');

  expect(title.textContent).toBe('Credits & References');
  expect(inside(plate.getBoundingClientRect())).toBe(true);
  expect(inside(back.getBoundingClientRect())).toBe(true);
  expect(title.scrollWidth).toBeLessThanOrEqual(title.clientWidth);
  expect(body.tabIndex).toBe(0);
  expect(body.scrollHeight).toBeGreaterThan(body.clientHeight);
  expect(body.scrollWidth).toBeLessThanOrEqual(body.clientWidth);

  expect(label.textContent).toBe('AI-generated art and music');
  expect(getComputedStyle(label).visibility).toBe('visible');
  expect(inside(label.getBoundingClientRect())).toBe(true);
  expect(apart(label.getBoundingClientRect(), plate.getBoundingClientRect())).toBe(true);
  expect(apart(label.getBoundingClientRect(), back.getBoundingClientRect())).toBe(true);

  const headings = [...host.querySelectorAll('h2')].map((h) => h.textContent);
  expect(headings).toContain('Inspiration');
  expect(headings).toContain('References (the sources behind the game data)');
});

it('About fits the stage with its body inside the plate and the AI-art label visible', async () => {
  const host = await show('about');
  const plate = part(host, '.info-panel__plate');
  const body = part(host, '.info-panel__body');
  const label = part(host, '.ai-label');
  expect(inside(plate.getBoundingClientRect())).toBe(true);
  expect(body.scrollWidth).toBeLessThanOrEqual(body.clientWidth);
  expect(apart(label.getBoundingClientRect(), plate.getBoundingClientRect())).toBe(true);
});

it("How to play's opening shows the Fuel and Materials icons inline, their words in accessible names (#189)", async () => {
  const host = await renderUi(<HowToPlayPanel onBack={() => undefined} />);
  const opening = [...host.querySelectorAll('section')].find(
    (section) => section.querySelector('h2')?.textContent === 'The opening',
  );
  if (!opening) throw new Error('no opening entry');
  const icons = [...opening.querySelectorAll('[data-testid="resource-icon"]')];
  expect(icons.map((icon) => icon.getAttribute('aria-label'))).toEqual(['Fuel', 'Materials']);
  expect(icons.map((icon) => icon.getAttribute('role'))).toEqual(['img', 'img']);
  // The icons stand in for the words: no placeholder is left in the visible text.
  expect(opening.textContent).not.toMatch(/[{}]/);
  expect(opening.textContent).toContain('Starting Moon');
});
