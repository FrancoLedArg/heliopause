import { afterEach, expect, it } from 'vitest';
import { GAME_HEIGHT, GAME_WIDTH } from '../game/main.ts';
import { cleanUp, renderUi } from './browserTestKit.tsx';
import { AboutPanel, CreditsPanel } from './InfoPanels.tsx';

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
      <p className="hud-tag ai-label">AI-generated art</p>
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

  expect(label.textContent).toBe('AI-generated art');
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
