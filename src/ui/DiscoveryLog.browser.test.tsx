import { afterEach, beforeEach, expect, it } from 'vitest';
import { recordDiscoveries } from '../game/lib/scienceProgress.ts';
import { byTestId, cleanUp, renderUi } from './browserTestKit.tsx';
import { DiscoveryLog } from './DiscoveryLog.tsx';

beforeEach(() => {
  window.localStorage.clear();
});
afterEach(cleanUp);

it('lists every Discovery: found, New and unknown, each with its state in the accessible name, inside 640x360', async () => {
  recordDiscoveries(35, ['river-delta', 'giant-storm'], 1);
  const host = await renderUi(<DiscoveryLog onClose={() => undefined} />);
  expect(host.querySelectorAll('li')).toHaveLength(8);
  // Nothing was known at Run start (the module default), so both finds are New this Run.
  expect(byTestId(host, 'discovery-river-delta').getAttribute('data-state')).toBe('new');
  expect(byTestId(host, 'discovery-water-salt').getAttribute('aria-label')).toMatch(
    /^Not found yet: hidden on/,
  );
  expect(byTestId(host, 'discovery-log-progress').getAttribute('aria-label')).toBe(
    '35 Science: 5 more to the next blueprint',
  );
  const box = byTestId(host, 'discovery-log').getBoundingClientRect();
  const stage = host.getBoundingClientRect();
  expect(box.bottom).toBeLessThanOrEqual(stage.top + 360);
  expect(box.right).toBeLessThanOrEqual(stage.left + 640);
  const body = host.querySelector<HTMLElement>('.discovery-log__body');
  expect(body && body.scrollHeight <= body.clientHeight).toBe(true);
});
