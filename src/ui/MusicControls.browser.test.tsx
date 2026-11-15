import { afterEach, beforeEach, expect, it } from 'vitest';
import { GAME_HEIGHT, GAME_WIDTH } from '../game/main.ts';
import { kilograms, materials, metersPerSecond } from '../game/sim/index.ts';
import { cleanUp, renderUi } from './browserTestKit.tsx';
import { TitleMenu } from './TitleMenu.tsx';
import { TopBar } from './TopBar.tsx';

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  cleanUp();
  window.localStorage.clear();
});

const noop = (): void => undefined;

const bar = (
  <TopBar
    systemNumber={12}
    systemName="Quydril Prime Longname"
    fuel={kilograms(1234)}
    deltaV={metersPerSecond(9876)}
    materials={materials(100)}
    dailyDay="2026-11-15"
  />
);

function part(host: HTMLElement, selector: string): HTMLElement {
  const found = host.querySelector<HTMLElement>(selector);
  if (!found) throw new Error(`nothing matches ${selector}`);
  return found;
}

it('the top bar holds a "Mute music" icon button and a volume slider, in view and clear of the bar and its Menu button', async () => {
  const host = await renderUi(bar);
  const frame = part(host, '.top-bar').getBoundingClientRect();
  const mute = part(host, 'button[aria-label="Mute music"]');
  const volume = part(host, 'input[aria-label="Music volume"]');
  expect(mute.textContent).toBe('');
  for (const control of [mute, volume]) {
    const box = control.getBoundingClientRect();
    expect(box.top).toBeGreaterThanOrEqual(frame.bottom);
    expect(box.right).toBeLessThanOrEqual(GAME_WIDTH);
    expect(box.bottom).toBeLessThanOrEqual(GAME_HEIGHT);
  }
});

it('mute toggles by click and is remembered; the slider is a keyboard-reachable range', async () => {
  const host = await renderUi(bar);
  const mute = part(host, 'button[aria-label="Mute music"]');
  expect(mute.getAttribute('aria-pressed')).toBe('false');
  mute.click();
  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(mute.getAttribute('aria-pressed')).toBe('true');
  expect(window.localStorage.getItem('heliopause:music')).toContain('"muted":true');
  const volume = part(host, 'input[aria-label="Music volume"]') as HTMLInputElement;
  expect(volume.type).toBe('range');
  expect(volume.tabIndex).toBe(0);
  mute.click();
});

it('the title screen has the music controls inside the frame and clear of the menu', async () => {
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
  const controls = part(host, '.music-controls').getBoundingClientRect();
  const menu = part(host, '.title-menu__panel').getBoundingClientRect();
  part(host, 'button[aria-label="Mute music"]');
  part(host, 'input[aria-label="Music volume"]');
  expect(controls.left).toBeGreaterThanOrEqual(0);
  expect(controls.top).toBeGreaterThanOrEqual(0);
  expect(controls.right).toBeLessThanOrEqual(GAME_WIDTH);
  expect(controls.bottom).toBeLessThanOrEqual(GAME_HEIGHT);
  expect(
    controls.right <= menu.left || menu.right <= controls.left || controls.bottom <= menu.top,
  ).toBe(true);
});
