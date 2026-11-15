import { describe, expect, it } from 'vitest';
import {
  CRUISE_EVENT_KINDS,
  CRUISE_TUNING,
  cruiseSchedule,
  newSpacecraft,
  refit,
  type CruiseEventKind,
} from './index.ts';

const SEEDS = Array.from({ length: 500 }, (_, i) => i * 104_729 + 7);
const ALL: readonly CruiseEventKind[] = CRUISE_EVENT_KINDS;
const fullSpacecraft = refit(newSpacecraft('scout'), [
  'engine-1',
  'fuel-tank-1',
  'drill-1',
  'engine-2',
]);

describe('the Cruise event schedule', () => {
  it('every Cruise has one or two events from the first Hop of a Run', () => {
    for (const hop of [1, 2, 5, 12]) {
      for (const seed of SEEDS) {
        const count = cruiseSchedule(seed, hop, 1, fullSpacecraft, ALL).length;
        expect(count).toBeGreaterThanOrEqual(1);
        expect(count).toBeLessThanOrEqual(2);
      }
    }
  });

  it('the first Hops of a Run get only a Fuel leak or a Debris field, and never an Engine fire', () => {
    for (let hop = 1; hop <= CRUISE_TUNING.mildHops; hop++) {
      for (const seed of SEEDS) {
        for (const event of cruiseSchedule(seed, hop, 1, fullSpacecraft, ALL)) {
          expect(['fuel-leak', 'debris-field']).toContain(event.kind);
        }
      }
    }
  });

  it('a Debris field on the first Hops only ever hits a Fuel Tank', () => {
    let hits = 0;
    for (const seed of SEEDS) {
      for (const event of cruiseSchedule(seed, 1, 1, fullSpacecraft, ['debris-field'])) {
        if (event.slot === null) continue;
        hits++;
        expect(fullSpacecraft.slots[event.slot]).toMatch(/^fuel-tank/);
      }
    }
    expect(hits).toBeGreaterThan(0);
  });

  it('harsh events come later, and more often in later Star Systems', () => {
    const harsh = (hop: number, system: number) =>
      SEEDS.flatMap((seed) => cruiseSchedule(seed, hop, system, fullSpacecraft, ALL)).filter(
        (event) => event.kind === 'engine-fire' || event.kind === 'solar-flare',
      ).length;
    const late = harsh(CRUISE_TUNING.mildHops + 1, 1);
    expect(late).toBeGreaterThan(0);
    expect(harsh(12, 4)).toBeGreaterThan(late);
  });

  it('later Star Systems have more Cruises with two events', () => {
    const doubles = (system: number) =>
      SEEDS.filter((seed) => cruiseSchedule(seed, 8, system, fullSpacecraft, ALL).length === 2)
        .length;
    expect(doubles(4)).toBeGreaterThan(doubles(1));
  });

  it('two events are at least 20 s apart, and every event fits in the Cruise', () => {
    for (const seed of SEEDS) {
      const events = cruiseSchedule(seed, 9, 3, fullSpacecraft, ALL);
      for (const event of events) {
        expect(event.tick).toBeGreaterThanOrEqual(100);
        expect(event.tick).toBeLessThanOrEqual(event.kind === 'engine-fire' ? 800 : 1_000);
      }
      const [first, second] = events;
      if (first && second) expect(second.tick - first.tick).toBeGreaterThanOrEqual(200);
    }
  });

  it('the same seed and Hop give the same schedule', () => {
    expect(cruiseSchedule(42, 6, 2, fullSpacecraft, ALL)).toEqual(
      cruiseSchedule(42, 6, 2, fullSpacecraft, ALL),
    );
  });

  it('only the kinds switched on are scheduled', () => {
    for (const seed of SEEDS.slice(0, 50)) {
      expect(
        cruiseSchedule(seed, 6, 2, fullSpacecraft, ['debris-field']).every(
          (e) => e.kind === 'debris-field',
        ),
      ).toBe(true);
    }
  });

  it('every Cruise of a real Run has one or two Fuel leaks, mild ones on the first Hops (#250)', () => {
    for (const hop of [1, 2, 3, 6]) {
      for (const seed of SEEDS) {
        const schedule = cruiseSchedule(seed, hop, 1, fullSpacecraft, CRUISE_TUNING.enabledKinds);
        expect(schedule.length).toBeGreaterThanOrEqual(1);
        expect(schedule.length).toBeLessThanOrEqual(2);
        expect(schedule.every((event) => event.kind === 'fuel-leak')).toBe(true);
      }
    }
  });

  it('the Jump Drive is never a target', () => {
    const withJump = refit(newSpacecraft('scout'), ['engine-1', 'fuel-tank-1', 'jump-drive', null]);
    for (const seed of SEEDS) {
      for (const event of cruiseSchedule(seed, 9, 2, withJump, ALL)) {
        expect(event.slot).not.toBe(2);
      }
    }
  });
});
