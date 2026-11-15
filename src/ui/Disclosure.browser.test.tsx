import { afterEach, expect, it } from 'vitest';
import { userEvent } from 'vitest/browser';
import { cleanUp, renderUi } from './browserTestKit.tsx';
import { Disclosure, DisclosurePanel, HelpToggle, TellMeMore } from './Disclosure.tsx';

afterEach(cleanUp);

const shown = (el: Element | null): boolean => el instanceof HTMLElement && el.checkVisibility();

it('"Tell me more" toggles by keyboard and exposes the hidden text', async () => {
  const host = await renderUi(
    <TellMeMore>
      <p>Each Burn costs what the gravity of the Body you leave demands.</p>
    </TellMeMore>,
  );
  const button = host.querySelector('button');
  const text = host.querySelector('p');
  if (!button) throw new Error('no toggle');
  expect(button.getAttribute('aria-expanded')).toBe('false');
  expect(button.textContent).toBe('Tell me more');
  expect(shown(text)).toBe(false);
  // The toggle names the text it opens.
  const panel = document.getElementById(button.getAttribute('aria-controls') ?? '');
  expect(panel?.contains(text)).toBe(true);

  await userEvent.keyboard('{Tab}');
  expect(document.activeElement).toBe(button);
  await userEvent.keyboard('{Enter}');
  expect(button.getAttribute('aria-expanded')).toBe('true');
  expect(shown(text)).toBe(true);
  await userEvent.keyboard(' ');
  expect(button.getAttribute('aria-expanded')).toBe('false');
  expect(shown(text)).toBe(false);
});

it('a "?" toggle opens help shown somewhere else, and names it in its accessible name', async () => {
  const host = await renderUi(
    <Disclosure>
      <HelpToggle label="What is Δv?" />
      <div>
        <DisclosurePanel>
          <p>Δv is how much your speed can change.</p>
        </DisclosurePanel>
      </div>
    </Disclosure>,
  );
  const button = host.querySelector('button');
  if (!button) throw new Error('no toggle');
  expect(button.getAttribute('aria-label')).toBe('What is Δv?');
  expect(shown(host.querySelector('p'))).toBe(false);
  button.focus();
  await userEvent.keyboard(' ');
  expect(button.getAttribute('aria-expanded')).toBe('true');
  expect(shown(host.querySelector('p'))).toBe(true);
});
