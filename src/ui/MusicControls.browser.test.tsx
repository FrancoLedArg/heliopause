import { afterEach, beforeEach, expect, it } from 'vitest';
import { MusicSettingsStore, SFX_STORAGE_KEY } from '../game/audio/musicSettings.ts';
import { sfx } from '../game/audio/sfx.ts';
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
    fuelCapacity={kilograms(5000)}
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

const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

it('the top bar holds a speaker icon with no text, inside the bar between the Materials and the Menu button', async () => {
  const host = await renderUi(bar);
  const frame = part(host, '.top-bar').getBoundingClientRect();
  const materialsValue = part(host, '[data-testid="materials"]').getBoundingClientRect();
  const button = part(host, 'button[aria-label="Music"]');
  expect(button.textContent).toBe('');
  const box = button.getBoundingClientRect();
  expect(box.left).toBeGreaterThanOrEqual(materialsValue.right);
  expect(box.right).toBeLessThanOrEqual(frame.left + 560 - 4);
  expect(box.top).toBeGreaterThanOrEqual(frame.top);
  expect(box.bottom).toBeLessThanOrEqual(frame.bottom);
  expect(host.querySelector('input')).toBeNull();
});

it('the icon opens a popover with mute and the volume range; Escape and an outside click close it', async () => {
  const host = await renderUi(bar);
  const button = part(host, 'button[aria-label="Music"]');
  button.click();
  await settle();
  expect(button.getAttribute('aria-expanded')).toBe('true');
  const volume = part(host, 'input[aria-label="Music volume"]') as HTMLInputElement;
  expect(volume.type).toBe('range');
  expect(volume.tabIndex).toBe(0);
  const box = part(host, '.music-controls__popover').getBoundingClientRect();
  expect(box.left).toBeGreaterThanOrEqual(0);
  expect(box.right).toBeLessThanOrEqual(GAME_WIDTH);
  expect(box.bottom).toBeLessThanOrEqual(GAME_HEIGHT);

  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  await settle();
  expect(host.querySelector('input')).toBeNull();
  expect(button.getAttribute('aria-expanded')).toBe('false');

  button.click();
  await settle();
  expect(host.querySelector('input')).not.toBeNull();
  document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
  await settle();
  expect(host.querySelector('input')).toBeNull();
});

it('mute lives in the popover, changes the icon and is remembered', async () => {
  const host = await renderUi(bar);
  part(host, 'button[aria-label="Music"]').click();
  await settle();
  const mute = part(host, 'button[aria-label="Mute music"]');
  expect(mute.getAttribute('aria-pressed')).toBe('false');
  const icon = part(host, '.music-controls__button .music-controls__icon') as HTMLCanvasElement;
  const drawn = (): string => icon.toDataURL();
  const unmutedShape = drawn();
  mute.click();
  await settle();
  expect(mute.getAttribute('aria-pressed')).toBe('true');
  expect(window.localStorage.getItem('heliopause:music')).toContain('"muted":true');
  // The speaker's shape changes with the mute state (the kit's sound-off icon is a different picture).
  expect(drawn()).not.toBe(unmutedShape);
  mute.click();
});

it('the effects slider has its own accessible names, and its volume is remembered across a reload', async () => {
  const host = await renderUi(bar);
  part(host, 'button[aria-label="Music"]').click();
  await settle();
  part(host, 'button[aria-label="Mute effects"]');
  const volume = part(host, 'input[aria-label="Effects volume"]') as HTMLInputElement;
  // React tracks the input's value, so set it through the prototype's setter to make the event count.
  // eslint-disable-next-line @typescript-eslint/unbound-method -- called with `volume` as `this` below
  const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  setValue?.call(volume, '0.25');
  volume.dispatchEvent(new Event('input', { bubbles: true }));
  await settle();
  expect(window.localStorage.getItem(SFX_STORAGE_KEY)).toContain('"volume":0.25');
  // A fresh store, as after a reload, reads the saved volume back; the music setting is untouched.
  expect(new MusicSettingsStore(undefined, SFX_STORAGE_KEY).get().volume).toBe(0.25);
  expect(new MusicSettingsStore().get().volume).toBe(0.6);
  sfx.settings.set({ volume: 0.6 });
});

it('the title screen has the speaker icon inside the frame and clear of the menu', async () => {
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
  const controls = part(host, 'button[aria-label="Music"]').getBoundingClientRect();
  const menu = part(host, '.title-menu__panel').getBoundingClientRect();
  expect(controls.left).toBeGreaterThanOrEqual(0);
  expect(controls.top).toBeGreaterThanOrEqual(0);
  expect(controls.right).toBeLessThanOrEqual(GAME_WIDTH);
  expect(controls.bottom).toBeLessThanOrEqual(GAME_HEIGHT);
  expect(
    controls.right <= menu.left || menu.right <= controls.left || controls.bottom <= menu.top,
  ).toBe(true);
});
