import { act, useState } from 'react';
import { afterEach, expect, it } from 'vitest';
import { userEvent } from 'vitest/browser';
import { byTestId, cleanUp, renderUi } from './browserTestKit.tsx';
import { MissionTracker } from './MissionTracker.tsx';
import { missionGoals } from './missionTrackerView.ts';
import { startRun } from '../game/sim/index.ts';

afterEach(cleanUp);

const run = startRun(7, 'scout');

it('takes the pointer, so hovering an icon shows its tooltip', async () => {
  const host = await renderUi(<MissionTracker goals={missionGoals(run)} />);
  // The bar sits at 518px on the 640px stage; pull it into this narrower test viewport.
  byTestId(host, 'mission-tracker').style.left = '100px';
  const icon = byTestId(host, 'goal-heliopause');
  const box = icon.getBoundingClientRect();
  // The stage's UI layer is pointer-events: none; a real hit-test must still land on the icon.
  const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
  expect(hit !== null && icon.contains(hit)).toBe(true);
  await userEvent.hover(icon);
  expect(getComputedStyle(icon, '::after').display).toBe('block');
});

it('lights the Escape and announces it when the Jump fires', async () => {
  let fire: () => void = () => undefined;
  function Harness() {
    const [escaped, setEscaped] = useState(false);
    fire = () => {
      setEscaped(true);
    };
    return <MissionTracker goals={missionGoals(run, escaped)} />;
  }
  const host = await renderUi(<Harness />);
  expect(byTestId(host, 'goal-escape').getAttribute('data-done')).toBe('false');
  act(() => {
    fire();
  });
  expect(byTestId(host, 'goal-escape').getAttribute('data-done')).toBe('true');
  expect(byTestId(host, 'mission-status').textContent).toBe('Escape: made');
});
