import { expect, it } from 'vitest';
import { describeDiscoveryLog, nextBlueprint } from './discoveryLogView.ts';

const progress = (ids: Record<string, number>) =>
  ({ lifetimeScience: 0, discoveries: ids }) as Parameters<typeof describeDiscoveryLog>[0];

it('marks a Discovery new when the device lacked it at Run start, found when it had it, locked when never made', () => {
  const log = describeDiscoveryLog(progress({ 'river-delta': 1, 'giant-storm': 2 }), [
    'giant-storm',
  ]);
  const by = Object.fromEntries(log.map((e) => [e.id, e.state]));
  expect(by['river-delta']).toBe('new');
  expect(by['giant-storm']).toBe('found');
  expect(by['water-salt']).toBe('locked');
  expect(log).toHaveLength(8);
});

it('hides a locked entry behind its Body type and names state in the accessible label', () => {
  const [first] = describeDiscoveryLog(progress({}), []);
  expect(first?.name).toBe('Unknown');
  expect(first?.label).toBe('Not found yet: hidden on a rocky world');
  expect(first?.source).toBeUndefined();
});

it('measures the way to the next blueprint, and is full once every one is unlocked', () => {
  expect(nextBlueprint(20)).toMatchObject({ progress: 0.5, remaining: 20 });
  expect(nextBlueprint(40)).toMatchObject({ remaining: 160 });
  expect(nextBlueprint(200)).toMatchObject({ progress: 1, remaining: 0 });
});
