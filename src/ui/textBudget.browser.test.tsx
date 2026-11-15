import { afterEach, expect, it } from 'vitest';
import { userEvent } from 'vitest/browser';
import { cleanUp, renderUi } from './browserTestKit.tsx';
import { TellMeMore } from './Disclosure.tsx';
import { expectTextBudget, visibleSentences } from './textBudget.ts';

afterEach(cleanUp);

it('counts each visible sentence, and not labels, names or numbers', async () => {
  const host = await renderUi(
    <section>
      <h2>Thaeprioquaeprix Prime</h2>
      <p>
        <span>Moon of Thaeprioquaeprix Prime</span> · <span>0.1 m/s²</span>
      </p>
      <p>
        Success <b>87%</b>
      </p>
      <p>Takeoff 5.6 km/s</p>
      <p>Low chance: may run dry</p>
      <p>
        Δv is how much your speed can change. Every Burn spends <em>some</em>.
      </p>
    </section>,
  );
  expect(visibleSentences(host)).toEqual([
    'Low chance: may run dry',
    'Δv is how much your speed can change.',
    'Every Burn spends some.',
  ]);
});

it('skips text behind a closed "Tell me more" and screen-reader-only text, and counts it once open', async () => {
  const host = await renderUi(
    <section>
      <p className="sr-only">This plan needs more Δv than the Spacecraft has.</p>
      <TellMeMore>
        <p>Each Burn costs what the gravity of the Body you leave demands.</p>
      </TellMeMore>
    </section>,
  );
  expect(visibleSentences(host)).toEqual([]);
  expectTextBudget(host);
  host.querySelector('button')?.focus();
  await userEvent.keyboard('{Enter}');
  expect(visibleSentences(host)).toEqual([
    'Each Burn costs what the gravity of the Body you leave demands.',
  ]);
});

it('fails above the budget, naming the sentences', async () => {
  const host = await renderUi(
    <section>
      <p>The Fuel ran out during the Transfer.</p>
      <p>Fuel ran out.</p>
    </section>,
  );
  expect(() => {
    expectTextBudget(host);
  }).toThrow(/2 visible sentences.*The Fuel ran out during the Transfer\..*Fuel ran out\./s);
  expectTextBudget(host, 2);
});
