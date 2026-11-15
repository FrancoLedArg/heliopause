import { expect, it } from 'vitest';
import { missionAnnouncement, missionGoals } from './missionTrackerView.ts';
import { COMPONENTS, refit, startRun } from '../game/sim/index.ts';

const run = startRun(7, 'scout');
const lit = (goals: ReturnType<typeof missionGoals>) => goals.map((g) => g.done);

it('starts with nothing lit and names each goal as not done yet', () => {
  const goals = missionGoals(run);
  expect(lit(goals)).toEqual([false, false, false]);
  expect(goals.map((g) => g.label)).toEqual([
    'Heliopause: not found yet',
    'Jump Drive: not built yet',
    'Escape: not made yet',
  ]);
});

it('lights the Heliopause when the knowledge says it is found', () => {
  const found = { ...run, knowledge: { ...run.knowledge, heliopauseFound: true } };
  expect(lit(missionGoals(found))).toEqual([true, false, false]);
  expect(missionGoals(found)[0]?.label).toBe('Heliopause: found');
});

it('lights the Jump Drive when one is installed', () => {
  const slots = run.spacecraft.slots.map((s, i) => (i === 0 ? COMPONENTS['jump-drive'].id : s));
  const built = { ...run, spacecraft: refit(run.spacecraft, slots) };
  expect(lit(missionGoals(built))).toEqual([false, true, false]);
});

it('lights the Escape only when told, and announces just the step that lit', () => {
  const before = missionGoals(run);
  const after = missionGoals(run, true);
  expect(lit(after)).toEqual([false, false, true]);
  expect(missionAnnouncement(before, after)).toBe('Escape: made');
  expect(missionAnnouncement(after, after)).toBe('');
});
